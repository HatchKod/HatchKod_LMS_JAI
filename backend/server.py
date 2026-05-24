from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import logging
import time
import asyncio
import uuid
import traceback
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any

import bcrypt
import jwt
import requests
import httpx
import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks, File, UploadFile, Form
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from supabase import create_client, ClientOptions

from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.decorator import cache
import redis.asyncio as redis_async

# -------------------- Global Setup --------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hatchkod")

def iso(dt: datetime) -> str:
    return dt.isoformat()

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

app = FastAPI(title="HatchKod LMS")

# -------------------- Cache Setup --------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

@app.on_event("startup")
async def startup_cache():
    logger.info("Starting up cache system...")
    try:
        pool = redis_async.ConnectionPool.from_url(REDIS_URL)
        r = redis_async.Redis(connection_pool=pool)
        await r.ping()
        logger.info(f"Connecting to Redis at {REDIS_URL} for caching...")
        FastAPICache.init(RedisBackend(r), prefix="hk-cache")
        logger.info("Cache system initialized with Redis.")
    except Exception as e:
        logger.warning(f"Redis not available ({e}), falling back to in-memory cache.")
        FastAPICache.init(InMemoryBackend(), prefix="hk-cache")
        logger.info("Cache system initialized with InMemoryBackend.")

def user_key_builder(
    func,
    namespace: Optional[str] = "",
    request: Request = None,
    response: Response = None,
    *args,
    **kwargs,
):
    prefix = f"{FastAPICache.get_prefix()}:{namespace}:{func.__module__}:{func.__name__}"
    user = kwargs.get("user")
    if user and isinstance(user, dict) and "id" in user:
        # Key scoped only by user ID — never include full kwargs dict to avoid
        # serialization inconsistencies that collapse all users to the same key
        return f"{prefix}:user:{user['id']}"
    # No user resolved — fall back to request-level uniqueness to avoid cross-user hits
    if request:
        auth = request.headers.get("authorization", "")
        return f"{prefix}:req:{hash(auth)}"
    return f"{prefix}:anonymous"

# -------------------- Config --------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
# Service-role key bypasses RLS — required for backend writes (XP, progress, etc.)
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", SUPABASE_KEY)
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
ACCESS_TOKEN_MIN = int(os.getenv("ACCESS_TOKEN_MIN", 60))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

ONBOARDING_LAMBDA_URL = os.getenv("ONBOARDING_LAMBDA_URL", "https://9vsd5hlgu3.execute-api.ap-south-1.amazonaws.com/Dev/onboard_student")
PRODUCTION_DOMAIN = os.getenv("PRODUCTION_DOMAIN", "https://hatchkod.in")
JUDGE0_URL = os.getenv("JUDGE0_URL", "http://13.205.4.224:2358")
JUDGE0_AUTH_TOKEN = os.getenv("JUDGE0_AUTH_TOKEN", "")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    options=ClientOptions(
        postgrest_client_timeout=30.0,
        storage_client_timeout=30.0,
        schema="public",
        httpx_client=httpx.Client(
            http2=False,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
            timeout=30.0
        )
    )
)

from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback

# CORS configuration - Added at the top to ensure it wraps all routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://hatchkod.in",
        "https://www.hatchkod.in",
        "https://app.hatchkod.in",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception caught: {exc}")
    traceback.print_exc()
    # Return standardized JSON even on crash, with CORS headers
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "detail": str(exc)
        }
    )

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response

api = APIRouter(prefix="/api")

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": iso(now_utc())}

# -------------------- Helpers --------------------
def safe_supabase_execute(query, max_retries=3):
    """
    Wrapper for Supabase/Postgrest queries with retry logic for transient connection issues.
    """
    import time
    last_err = None
    for attempt in range(max_retries):
        try:
            return query.execute()
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError, httpx.PoolTimeout) as e:
            last_err = e
            logger.warning(f"Supabase connection error (attempt {attempt+1}/{max_retries}): {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(0.5 * (2 ** attempt)) # Exponential backoff
                continue
            raise e
        except Exception as e:
            # Catch "Server disconnected" or "Connection reset" which might be wrapped in general Exception
            err_str = str(e).lower()
            if "disconnected" in err_str or "reset" in err_str or "connection" in err_str:
                last_err = e
                logger.warning(f"Supabase transient failure (attempt {attempt+1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(0.5 * (2 ** attempt))
                    continue
            raise e
    return None

def get_single_or_none(query):
    try:
        res = safe_supabase_execute(query)
        return res.data[0] if res and res.data else None
    except Exception as e:
        logger.error(f"Database query error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def call_onboarding_lambda(name: str, email: str, password: str):
    url = ONBOARDING_LAMBDA_URL
    payload = {
        "name": name,
        "email": email,
        "password": password
    }
    try:
        logger.info(f"Calling onboarding Lambda for {email}")
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info(f"Onboarding Lambda success for {email}")
    except Exception as e:
        logger.error(f"Onboarding Lambda failed for {email}: {e}")


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# -------------------- Gamification Logic --------------------
_LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500]

def xp_to_level(total_xp: int) -> int:
    level = 1
    for i, threshold in enumerate(_LEVEL_THRESHOLDS):
        if total_xp >= threshold:
            level = i + 1
        else:
            break
    return level

def award_xp(user_id: str, action_type: str):
    try:
        xp_map = {
            "lesson_completed": 20,
            "quiz_passed": 40,
            "project_approved": 150,
            "problem_solved": 50,
            "referral_bonus": 100
        }
        xp_to_award = xp_map.get(action_type, 0)
        if xp_to_award == 0:
            return None

        # Get user current stats
        user = get_single_or_none(supabase.table("users").select("*").eq("id", user_id))
        if not user:
            return None

        now = now_utc()
        today = now.date()
        last_active = None
        if user.get("last_active_date"):
            try:
                last_active = datetime.strptime(user["last_active_date"], "%Y-%m-%d").date()
            except:
                last_active = None

        # Calculate streak
        current_streak = user.get("current_streak", 0)
        if not last_active:
            current_streak = 1
        elif last_active == today:
            pass # Already active today
        elif last_active == today - timedelta(days=1):
            current_streak += 1
        else:
            current_streak = 1
        
        # Calculate new total XP and Level
        new_total_xp = (user.get("total_xp") or 0) + xp_to_award
        new_level = xp_to_level(new_total_xp)

        # Update user
        update_res = supabase.table("users").update({
            "total_xp": new_total_xp,
            "level": new_level,
            "current_streak": current_streak,
            "last_active_date": today.isoformat(),
        }).eq("id", user_id).execute()
        if not update_res.data:
            logger.error(f"award_xp: users update returned 0 rows for user {user_id} — check RLS / service key")

        # Log activity
        supabase.table("user_activity").insert({
            "user_id": user_id,
            "action_type": action_type,
            "xp_earned": xp_to_award,
            "created_at": iso(now)
        }).execute()

        # Update weekly leaderboard
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        existing_weekly = get_single_or_none(
            supabase.table("leaderboard_weekly")
            .select("*")
            .eq("user_id", user_id)
            .eq("week_start_date", week_start)
        )
        
        if existing_weekly:
            supabase.table("leaderboard_weekly").update({
                "xp": (existing_weekly["xp"] or 0) + xp_to_award
            }).eq("id", existing_weekly["id"]).execute()
        else:
            supabase.table("leaderboard_weekly").insert({
                "user_id": user_id,
                "week_start_date": week_start,
                "xp": xp_to_award
            }).execute()

        return {
            "xp_earned": xp_to_award, 
            "total_xp": new_total_xp, 
            "level": new_level, 
            "streak": current_streak,
            "action": action_type
        }
    except Exception as e:
        logger.error(f"Error awarding XP to user {user_id}: {str(e)}")
        return None


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=ACCESS_TOKEN_MIN * 60,
        path="/",
    )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_single_or_none(supabase.table("users").select("*").eq("id", payload["sub"]).eq("is_active", True))
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    
    # Always look up batch_id from batch_students for students
    # (users.batch_id may be stale or null even if enrolled)
    if user.get("role") == "student":
        bs = get_single_or_none(
            supabase.table("batch_students").select("batch_id").eq("student_id", user["id"])
        )
        user["batch_id"] = bs["batch_id"] if bs else user.get("batch_id")
    
    return user


def require_roles(*roles: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep


def get_effective_tier(user: dict) -> str:
    if user.get("role") != "student":
        return "full"
    tier = user.get("access_tier", "demo")
    if tier == "demo":
        expired_at = user.get("demo_expired_at")
        if expired_at:
            try:
                if isinstance(expired_at, str):
                    dt = datetime.fromisoformat(expired_at.replace("Z", "+00:00"))
                else:
                    dt = expired_at
                if now_utc() >= dt:
                    return "expired"
            except Exception as e:
                logger.error(f"Error parsing demo_expired_at: {e}")
    return tier


def check_module_access(user_id: str, module_id: str, tier: str, batch_id: str) -> bool:
    if tier == "full":
        return True
    if tier == "expired":
        return False
        
    # Resolve the course of the module to find the specific batch the student is enrolled in
    module_res = supabase.table("modules").select("course_id").eq("id", module_id).single().execute()
    if not module_res.data:
        return False
    course_id = module_res.data.get("course_id")
    
    batch_res = supabase.table("batch_students").select("batch_id, batches(course_id)").eq("student_id", user_id).execute().data or []
    matching_batch_id = None
    for b in batch_res:
        if b.get("batches", {}).get("course_id") == course_id:
            matching_batch_id = b["batch_id"]
            break
            
    resolved_batch_id = matching_batch_id or batch_id
    if not resolved_batch_id:
        return False
        
    res = supabase.table("batch_module_access").select("id").eq("batch_id", resolved_batch_id).eq("module_id", module_id).eq("tier", tier).execute().data
    return len(res) > 0


async def require_active_access(user: dict = Depends(get_current_user)) -> dict:
    effective_tier = get_effective_tier(user)
    if effective_tier == "expired":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ACCESS_EXPIRED",
                "message": "Your demo access has expired. Please make a payment to continue.",
                "tier": "expired"
            }
        )
    user["effective_tier"] = effective_tier
    return user


def require_active_role(*roles: str):
    async def _dep(user: dict = Depends(require_active_access)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep


# -------------------- Schemas --------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: Literal["student", "mentor"] = "student"  # admin must be seeded
    ref_code: Optional[str] = None  # referral code from URL


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminCourseIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    course_type: Optional[str] = "live"
    flow_type: Optional[str] = "linear"
    category: Optional[str] = "Java"
    difficulty: Optional[str] = "beginner"
    language: Optional[str] = "English"

class ModuleCreateIn(BaseModel):
    title: str
    sequence_order: Optional[int] = 0

class ReorderModulesIn(BaseModel):
    ordered_ids: List[str]

class CourseIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    difficulty: Optional[str] = "beginner"
    language: Optional[str] = "English"
    is_published: Optional[bool] = False


class ModuleIn(BaseModel):
    title: Optional[str] = None
    sequence_order: Optional[int] = 0


class TopicIn(BaseModel):
    title: Optional[str] = None
    sequence_order: Optional[int] = 0
    content_html: Optional[str] = None
    video_url: Optional[str] = None
    github_link: Optional[str] = None
    estimated_minutes: Optional[int] = 30
    is_published: Optional[bool] = True


class SubtopicIn(BaseModel):
    title: Optional[str] = None
    sequence_order: Optional[int] = 0
    content_html: Optional[str] = None
    video_url: Optional[str] = None
    github_link: Optional[str] = None
    estimated_minutes: Optional[int] = 30
    is_mandatory: Optional[bool] = False
    is_published: Optional[bool] = True


class TaskIn(BaseModel):
    description: Optional[str] = None
    instructions: Optional[str] = None
    expected_output: Optional[str] = None
    difficulty: Optional[str] = "easy"
    task_type: Optional[str] = "project"   # "project" | "coding"
    language: Optional[str] = "java"       # "java" | "python" | "javascript" | "cpp"


class TaskTestCaseIn(BaseModel):
    input: str = ""
    expected_output: str
    is_sample: bool = False
    order_index: int = 0


class CodeSubmitIn(BaseModel):
    code: str
    language: Optional[str] = None   # falls back to task.language if omitted


class ReorderIn(BaseModel):
    ordered_ids: List[str]


class SubmissionIn(BaseModel):
    submission_url: Optional[str] = ""
    submission_text: Optional[str] = ""


class ReviewIn(BaseModel):
    status: Literal["approved", "rework"]
    feedback: str = ""


class AssignMentorIn(BaseModel):
    mentor_id: str


class AdminUserIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: Literal["student", "mentor"] = "student"


class CourseStatusIn(BaseModel):
    status: Literal["draft", "published", "inactive"]


class UpdatePasswordIn(BaseModel):
    new_password: str = Field(min_length=6)
    confirm_password: str = Field(min_length=6)


class TestCaseIn(BaseModel):
    input: str
    expected_output: str
    is_sample: bool = False
    order_index: int = 0


class ProblemIn(BaseModel):
    title: str
    description: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    tags: List[str] = []
    time_limit_seconds: int = 5
    test_cases: List[TestCaseIn]


class ProblemSubmitIn(BaseModel):
    code: str
    language: str = "java"


class StudentProfileIn(BaseModel):
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    date_of_birth: Optional[str] = None  # Renamed from dob
    gender: Optional[str] = None
    work_experience: Optional[str] = None
    career_gap: Optional[int] = 0        # Changed to int
    current_city: Optional[str] = None
    current_state: Optional[str] = None
    preferred_locations: List[str] = []
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    resume_url: Optional[str] = None
    profile_picture_url: Optional[str] = None
    profile_completion: Optional[int] = 0


class StudentAcademicIn(BaseModel):
    institution_name: str
    year_of_passout: str                # Changed to str
    marks_percentage: float
    university_roll_no: Optional[str] = None
    course_name: Optional[str] = None
    branch: Optional[str] = None


class LiveClassIn(BaseModel):
    batch_id: str
    topic_id: str
    scheduled_at: str
    meeting_link: Optional[str] = None

class ScheduleSessionIn(BaseModel):
    batch_id: str
    topic_id: Optional[str] = None
    custom_topic: Optional[str] = None
    scheduled_at: str
    meeting_url: Optional[str] = None


class RecordingIn(BaseModel):
    url: str
    duration_minutes: Optional[int] = None


class NotificationBroadcastIn(BaseModel):
    user_id: str
    title: str
    body: Optional[str] = None
    type: Optional[str] = "general"
    related_session_id: Optional[str] = None


class NotificationBatchIn(BaseModel):
    batch_id: str
    title: str
    body: Optional[str] = None
    type: Optional[str] = "general"
    related_session_id: Optional[str] = None


class MarkReadIn(BaseModel):
    notification_ids: Optional[List[str]] = None
    all: Optional[bool] = False


class TopicCompleteIn(BaseModel):
    time_spent_minutes: Optional[int] = 0


class LiveClassStatusIn(BaseModel):
    status: Literal["scheduled", "ongoing", "ended"]


class MeetingUrlIn(BaseModel):
    meeting_url: str


class AttendanceOverrideIn(BaseModel):
    status: Literal["present", "absent", "late"]
    override_reason: Optional[str] = None

class BulkSaveAttendanceRequest(BaseModel):
    records: list[dict]

class ExtensionParticipant(BaseModel):
    name: str
    duration_minutes: float

class ExtensionSyncRequest(BaseModel):
    participants: list[ExtensionParticipant]

class BatchIn(BaseModel):
    name: str
    course_id: str
    mentor_id: str
    start_date: Optional[str] = None
    status: Literal["upcoming", "active", "completed"] = "upcoming"

class BatchUpdateIn(BaseModel):
    name: Optional[str] = None
    course_id: Optional[str] = None
    mentor_id: Optional[str] = None
    start_date: Optional[str] = None
    status: Optional[Literal["upcoming", "active", "completed"]] = None

class BatchStudentIn(BaseModel):
    student_id: str


def generate_referral_code():
    import random, string
    chars = string.ascii_uppercase + string.digits
    while True:
        code = "HK-" + "".join(random.choices(chars, k=6))
        existing = supabase.table("users").select("id").eq("referral_code", code).execute()
        if not existing.data:
            return code


# -------------------- Auth Endpoints --------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response, background_tasks: BackgroundTasks):
    email = payload.email.lower()
    existing = supabase.table("users").select("id").eq("email", email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    referral_code_gen = generate_referral_code()
    user_doc = {
        "id": user_id,
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "assigned_mentor_id": None,
        "created_at": iso(now_utc()),
        "referral_code": referral_code_gen,
    }

    # Track referral at registration time
    referrer_id = None
    if payload.ref_code:
        ref_code = payload.ref_code.strip()
        referrer = get_single_or_none(supabase.table("users").select("id").eq("referral_code", ref_code))
        if referrer and referrer["id"] != user_id:
            user_doc["referred_by"] = ref_code
            referrer_id = referrer["id"]

    supabase.table("users").insert(user_doc).execute()

    # Create referral record at registration stage
    if referrer_id:
        supabase.table("referrals").insert({
            "referrer_id": referrer_id,
            "referred_id": user_id,
            "code": payload.ref_code.strip(),
            "status": "pending",
            "payout_amount": 1500,
            "discount_applied": 0,
        }).execute()

    background_tasks.add_task(call_onboarding_lambda, payload.name, email, payload.password)
    token = create_token(user_id, email, payload.role)
    set_auth_cookie(response, token)
    user_doc.pop("password_hash", None)
    return {"user": user_doc, "token": token}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = get_single_or_none(supabase.table("users").select("*").eq("email", email).eq("is_active", True))
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials or inactive account")
    token = create_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    return {"user": user, "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/update-password")
async def update_password(payload: UpdatePasswordIn, user: dict = Depends(get_current_user)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    supabase.table("users").update({
        "password_hash": hash_password(payload.new_password)
    }).eq("id", user["id"]).execute()
    
    return {"ok": True, "message": "Password updated successfully"}


# -------------------- S3 Image Library (Admin) --------------------
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_S3_BUCKET = "hatchkod-course-images"
AWS_S3_REGION = "ap-south-1"

def get_s3_client():
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        raise HTTPException(status_code=500, detail="AWS credentials are not configured")
    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_S3_REGION
    )

@api.post("/admin/images/upload")
async def upload_admin_image(
    file: UploadFile = File(...),
    folder: Optional[str] = Form(None),
    user: dict = Depends(require_roles("admin"))
):
    s3 = get_s3_client()
    unique_id = str(uuid.uuid4())
    if folder and folder.strip():
        clean_folder = folder.strip("/")
        unique_filename = f"{clean_folder}/{unique_id}_{file.filename}"
    else:
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{unique_id}{file_ext}"
    
    try:
        s3.upload_fileobj(
            file.file,
            AWS_S3_BUCKET,
            unique_filename,
            ExtraArgs={"ContentType": file.content_type}
        )
        url = f"https://{AWS_S3_BUCKET}.s3.{AWS_S3_REGION}.amazonaws.com/{unique_filename}"
        return {"url": url}
    except ClientError as e:
        logger.error(f"S3 upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload to S3: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@api.get("/admin/images")
async def list_admin_images(
    user: dict = Depends(require_roles("admin"))
):
    s3 = get_s3_client()
    try:
        response = s3.list_objects_v2(Bucket=AWS_S3_BUCKET)
        urls = []
        if "Contents" in response:
            for obj in response["Contents"]:
                key = obj["Key"]
                if not key or key.endswith("/"):
                    continue
                # Only include valid image extensions
                lower_key = key.lower()
                if not any(lower_key.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]):
                    continue
                
                # Extract folder name
                folder = ""
                if "/" in key:
                    folder = key.rsplit("/", 1)[0]
                    
                url = f"https://{AWS_S3_BUCKET}.s3.{AWS_S3_REGION}.amazonaws.com/{key}"
                urls.append({
                    "key": key,
                    "url": url,
                    "folder": folder,
                    "uploaded_at": obj["LastModified"].isoformat() if "LastModified" in obj else None,
                    "size": obj.get("Size", 0)
                })
        return urls
    except ClientError as e:
        logger.error(f"S3 list error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list images: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected list error: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@api.get("/admin/images/folders")
async def list_admin_image_folders(
    user: dict = Depends(require_roles("admin"))
):
    s3 = get_s3_client()
    try:
        response = s3.list_objects_v2(Bucket=AWS_S3_BUCKET)
        folders = set()
        if "Contents" in response:
            for obj in response["Contents"]:
                key = obj["Key"]
                if not key or key.endswith("/"):
                    continue
                lower_key = key.lower()
                if not any(lower_key.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]):
                    continue
                if "/" in key:
                    folders.add(key.rsplit("/", 1)[0])
        return sorted(list(folders))
    except ClientError as e:
        logger.error(f"S3 folders error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list folders: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected S3 folders error: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# -------------------- Courses (Admin) --------------------
@api.get("/admin/courses")
async def get_admin_courses(user: dict = Depends(require_roles("admin", "mentor"))):
    courses = supabase.table("courses").select("*, users(name)").order("created_at", desc=True).execute().data
    for c in courses:
        c["created_by_name"] = c.get("users", {}).get("name") if c.get("users") else None
    return courses

@api.post("/admin/courses")
async def create_course_admin(payload: AdminCourseIn, user: dict = Depends(require_roles("admin"))):
    if not payload.title:
        raise HTTPException(400, "Title is required")
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "title": payload.title,
        "description": payload.description,
        "thumbnail_url": payload.thumbnail_url,
        "course_type": payload.course_type,
        "flow_type": payload.flow_type,
        "category": payload.category,
        "difficulty": payload.difficulty,
        "created_by": user["id"],
        "is_published": False,
        "status": "draft",
        "created_at": iso(now_utc()),
    }
    supabase.table("courses").insert(doc).execute()
    return doc

@api.patch("/admin/courses/{course_id}")
async def update_course_admin(course_id: str, payload: AdminCourseIn, user: dict = Depends(require_roles("admin"))):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if not update_data:
        return {"ok": True}
    supabase.table("courses").update(update_data).eq("id", course_id).execute()
    return {"ok": True}

@api.post("/admin/courses/{course_id}/publish")
async def publish_course_admin(course_id: str, _: dict = Depends(require_roles("admin"))):
    # Validate: course must have at least 1 module with 1 lesson
    # Check if course has content
    modules = supabase.table("modules").select("id, topics(id, subtopics(id))").eq("course_id", course_id).execute().data
    has_content = any(len(m.get("topics") or []) > 0 for m in modules)
    if not has_content:
        raise HTTPException(400, "Cannot publish: course has no modules or topics.")
    
    supabase.table("courses").update({"is_published": True, "status": "published"}).eq("id", course_id).execute()
    return {"ok": True}

@api.post("/admin/courses/{course_id}/unpublish")
async def unpublish_course_admin(course_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("courses").update({"is_published": False, "status": "draft"}).eq("id", course_id).execute()
    return {"ok": True}

@api.delete("/admin/courses/{course_id}")
async def delete_course_admin(course_id: str, _: dict = Depends(require_roles("admin"))):
    course = get_single_or_none(supabase.table("courses").select("is_published, title").eq("id", course_id))
    if not course:
        raise HTTPException(404, "Course not found")
    if course.get("is_published"):
        raise HTTPException(400, "Unpublish the course before deleting.")

    # 1. Check for associated batches to prevent breaking live environments
    batches = supabase.table("batches").select("id, name").eq("course_id", course_id).execute().data or []
    if batches:
        batch_names = ", ".join([b["name"] for b in batches])
        raise HTTPException(400, f"Cannot delete course '{course['title']}' because it has active batches ({batch_names}). Please delete these batches first.")

    try:
        # 2. Cascading delete: submissions -> progress -> completions -> tasks -> subtopics -> topics -> modules -> courses
        modules = supabase.table("modules").select("id").eq("course_id", course_id).execute().data or []
        for m in modules:
            topics = supabase.table("topics").select("id").eq("module_id", m["id"]).execute().data or []
            for t in topics:
                subtopics = supabase.table("subtopics").select("id").eq("topic_id", t["id"]).execute().data or []
                for s in subtopics:
                    # Get tasks for this subtopic to delete their submissions
                    tasks = supabase.table("tasks").select("id").eq("subtopic_id", s["id"]).execute().data or []
                    task_ids = [tk["id"] for tk in tasks]
                    
                    if task_ids:
                        # Delete student submissions for these tasks
                        supabase.table("submissions").delete().in_("task_id", task_ids).execute()
                        # Delete the tasks
                        supabase.table("tasks").delete().in_("id", task_ids).execute()
                    
                    # Delete subtopic completions, progress, and submissions for this subtopic
                    supabase.table("submissions").delete().eq("subtopic_id", s["id"]).execute()
                    supabase.table("subtopic_completions").delete().eq("subtopic_id", s["id"]).execute()
                    supabase.table("student_progress").delete().eq("subtopic_id", s["id"]).execute()
                    
                    # Delete the subtopic itself
                    supabase.table("subtopics").delete().eq("id", s["id"]).execute()
                    
                supabase.table("topics").delete().eq("id", t["id"]).execute()
            supabase.table("modules").delete().eq("id", m["id"]).execute()
        
        supabase.table("courses").delete().eq("id", course_id).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Failed to delete course: {e}")
        raise HTTPException(400, f"Cannot delete this course due to database constraints: {str(e)}")

# --- Module Endpoints (Admin) ---

@api.post("/admin/courses/{course_id}/modules")
async def create_module_admin(course_id: str, payload: ModuleCreateIn, _: dict = Depends(require_roles("admin"))):
    mid = str(uuid.uuid4())
    doc = {
        "id": mid,
        "course_id": course_id,
        "title": payload.title,
        "sequence_order": payload.sequence_order,
        "created_at": iso(now_utc())
    }
    supabase.table("modules").insert(doc).execute()
    return doc

@api.put("/admin/modules/{module_id}")
async def update_module_admin(module_id: str, payload: ModuleIn, _: dict = Depends(require_roles("admin"))):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if update_data:
        supabase.table("modules").update(update_data).eq("id", module_id).execute()
    return {"ok": True}

@api.delete("/admin/modules/{module_id}")
async def delete_module_admin(module_id: str, _: dict = Depends(require_roles("admin"))):
    topics = supabase.table("topics").select("id").eq("module_id", module_id).execute().data
    if topics:
        raise HTTPException(400, "Delete all topics in this module first.")
    supabase.table("modules").delete().eq("id", module_id).execute()
    return {"ok": True}

@api.post("/admin/modules/reorder")
async def reorder_modules_admin(payload: ReorderModulesIn, _: dict = Depends(require_roles("admin"))):
    for i, mid in enumerate(payload.ordered_ids):
        supabase.table("modules").update({"sequence_order": i}).eq("id", mid).execute()
    return {"ok": True}

# --- Topic Endpoints (Admin) ---

@api.post("/admin/modules/{module_id}/topics")
async def create_topic_admin(module_id: str, payload: TopicIn, _: dict = Depends(require_roles("admin"))):
    lid = str(uuid.uuid4())
    doc = {
        "id": lid,
        "module_id": module_id,
        "title": payload.title,
        "content_html": payload.content_html,
        "video_url": payload.video_url,
        "github_link": payload.github_link,
        "estimated_minutes": payload.estimated_minutes,
        "sequence_order": payload.sequence_order,
        "is_mandatory": True,
        "created_at": iso(now_utc())
    }
    supabase.table("topics").insert(doc).execute()
    return doc

@api.put("/admin/topics/{topic_id}")
async def update_topic_admin(topic_id: str, payload: TopicIn, _: dict = Depends(require_roles("admin"))):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if update_data:
        supabase.table("topics").update(update_data).eq("id", topic_id).execute()
    return {"ok": True}

@api.delete("/admin/topics/{topic_id}")
async def delete_topic_admin(topic_id: str, _: dict = Depends(require_roles("admin"))):
    subtopics = supabase.table("subtopics").select("id").eq("topic_id", topic_id).execute().data
    if subtopics:
        raise HTTPException(400, "Delete all subtopics in this topic first.")
    supabase.table("topics").delete().eq("id", topic_id).execute()
    return {"ok": True}

@api.post("/admin/topics/{topic_id}/subtopics")
async def create_subtopic_admin(topic_id: str, payload: SubtopicIn, _: dict = Depends(require_roles("admin"))):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "topic_id": topic_id,
        "title": payload.title,
        "content_html": payload.content_html,
        "video_url": payload.video_url,
        "github_link": payload.github_link,
        "estimated_minutes": payload.estimated_minutes,
        "sequence_order": payload.sequence_order,
        "is_mandatory": True,
        "created_at": iso(now_utc())
    }
    supabase.table("subtopics").insert(doc).execute()
    return doc

@api.put("/admin/subtopics/{subtopic_id}")
async def update_subtopic_admin(subtopic_id: str, payload: SubtopicIn, _: dict = Depends(require_roles("admin"))):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if update_data:
        supabase.table("subtopics").update(update_data).eq("id", subtopic_id).execute()
    return {"ok": True}

@api.delete("/admin/subtopics/{subtopic_id}")
async def delete_subtopic_admin(subtopic_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("tasks").delete().eq("subtopic_id", subtopic_id).execute()
    supabase.table("subtopics").delete().eq("id", subtopic_id).execute()
    return {"ok": True}

@api.post("/admin/topics/reorder")
async def reorder_lessons_admin(payload: ReorderModulesIn, _: dict = Depends(require_roles("admin"))):
    for i, lid in enumerate(payload.ordered_ids):
        supabase.table("topics").update({"sequence_order": i}).eq("id", lid).execute()
    return {"ok": True}

@api.post("/admin/subtopics/reorder")
async def reorder_subtopics_admin(payload: ReorderModulesIn, _: dict = Depends(require_roles("admin"))):
    for i, sid in enumerate(payload.ordered_ids):
        supabase.table("subtopics").update({"sequence_order": i}).eq("id", sid).execute()
    return {"ok": True}

@api.post("/admin/subtopics/{subtopic_id}/task")
async def upsert_task_admin(subtopic_id: str, payload: TaskIn, _: dict = Depends(require_roles("admin"))):
    existing = get_single_or_none(supabase.table("tasks").select("id").eq("subtopic_id", subtopic_id))
    doc = {
        "subtopic_id": subtopic_id,
        "description": payload.description,
        "instructions": payload.instructions,
        "expected_output": payload.expected_output,
        "difficulty": payload.difficulty,
        "task_type": payload.task_type or "project",
        "language": payload.language or "java",
    }
    if existing:
        supabase.table("tasks").update(doc).eq("id", existing["id"]).execute()
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = iso(now_utc())
        supabase.table("tasks").insert(doc).execute()
    return get_single_or_none(supabase.table("tasks").select("*").eq("subtopic_id", subtopic_id))

@api.get("/courses/{course_id}/full")
async def get_course_full(course_id: str, _: dict = Depends(require_roles("admin", "mentor"))):
    # Fetch course
    course = get_single_or_none(supabase.table("courses").select("*").eq("id", course_id))
    if not course:
        raise HTTPException(404, "Course not found")
        
    # Fetch modules with topics and subtopics in a nested query
    modules = supabase.table("modules")\
        .select("*, topics(*, subtopics(*))")\
        .eq("course_id", course_id)\
        .order("sequence_order")\
        .execute().data
        
    # Deduplicate and sort
    for m in modules:
        if m.get("topics"):
            m["topics"].sort(key=lambda t: t.get("sequence_order") or 0)
            for t in m["topics"]:
                if t.get("subtopics"):
                    t["subtopics"].sort(key=lambda s: s.get("sequence_order") or 0)
                else:
                    t["subtopics"] = []
        else:
            m["topics"] = []
            
    return {
        "course": course,
        "modules": modules
    }


# -------------------- Modules --------------------



# -------------------- Lessons --------------------
@api.get("/modules/{module_id}/topics")
async def get_module_topics(module_id: str, _: dict = Depends(require_roles("admin", "mentor"))):
    topics = supabase.table("topics").select("*, subtopics(id)").eq("module_id", module_id).order("sequence_order").execute().data
    for t in topics:
        t["has_subtopics"] = len(t.get("subtopics") or []) > 0
    return topics



@api.get("/subtopics/{subtopic_id}")
async def get_subtopic(subtopic_id: str, user: dict = Depends(require_active_access)):
    # Fetch subtopic with basic context
    # Faster fetching: Get subtopic and its direct parent info
    subtopic_res = supabase.table("subtopics").select("*, tasks(*), topics(id, title, module_id)").eq("id", subtopic_id).single().execute()
    if not subtopic_res.data:
        raise HTTPException(404, "Subtopic not found")
    subtopic = subtopic_res.data
    topic_raw = subtopic.pop("topics", {}) or {}
    
    # Get basic course context safely
    module_id = topic_raw.get("module_id")
    
    # Enforce module-level payment access checks for student role
    if user["role"] == "student" and module_id:
        effective_tier = user.get("effective_tier", "demo")
        if effective_tier != "full":
            has_access = check_module_access(user["id"], module_id, effective_tier, user.get("batch_id"))
            if not has_access:
                raise HTTPException(status_code=403, detail={"code": "TIER_LOCKED", "message": "Module access denied under current tier."})
                
    module_raw = {}
    course_id = None
    
    if module_id:
        module_res = supabase.table("modules").select("id, title, course_id").eq("id", module_id).single().execute()
        module_raw = module_res.data or {}
        course_id = module_raw.get("course_id")
    
    # Safely fetch course structure for sidebar navigation (lightweight)
    course_data = {"modules": []}
    is_completed = False
    completed_at = None
    
    if course_id:
        try:
            uuid.UUID(course_id)
            # Lightweight structure fetch (1 nested query)
            modules_raw = supabase.table("modules").select(
                "id, title, sequence_order, topics(id, title, sequence_order, subtopics(id, title, sequence_order, is_published))"
            ).eq("course_id", course_id).order("sequence_order").execute().data or []
            
            # Fetch progress ONLY for this user & course (single query)
            progress_set = set()
            if user["role"] == "student":
                st_ids = []
                for m in modules_raw:
                    for t in m.get("topics", []):
                        for s in t.get("subtopics", []):
                            st_ids.append(s["id"])
                if st_ids:
                    prog_res = supabase.table("student_progress").select("subtopic_id, is_completed, completed_at").eq("student_id", user["id"]).in_("subtopic_id", st_ids).execute().data or []
                    progress_set = {p["subtopic_id"]: p for p in prog_res if p.get("is_completed")}
                    
                    if subtopic_id in progress_set:
                        is_completed = True
                        completed_at = progress_set[subtopic_id].get("completed_at")

            # Build course structure with completion flags
            for m in modules_raw:
                m["topics"] = sorted(m.get("topics") or [], key=lambda t: t.get("sequence_order") or 0)
                for t in m["topics"]:
                    t["subtopics"] = sorted(t.get("subtopics") or [], key=lambda s: s.get("sequence_order") or 0)
                    for s in t["subtopics"]:
                        s["completed"] = s["id"] in progress_set
            
            course_data = {"modules": modules_raw, "id": course_id}
            
        except (ValueError, AttributeError):
            logger.warning(f"Invalid course_id '{course_id}' in subtopic lookup — skipping course fetch.")
        except Exception as e:
            logger.warning(f"Could not load course {course_id} for subtopic: {e}")

    task = subtopic["tasks"][0] if subtopic.get("tasks") and len(subtopic["tasks"]) > 0 else None
    submission = None
    last_code_submission = None

    if user["role"] == "student" and topic_raw.get("id"):
        # Check unlock status directly
        unlocked = await is_topic_unlocked(user["id"], topic_raw["id"])
        if not unlocked:
            raise HTTPException(status_code=403, detail="Topic is locked. Complete previous topics first.")

        if task:
            task_type = task.get("task_type", "project")
            if task_type == "coding":
                # Attach sample test cases so student sees the format
                tc_res = supabase.table("task_test_cases").select(
                    "id, input, expected_output, is_sample, order_index"
                ).eq("task_id", task["id"]).eq("is_sample", True).order("order_index").execute()
                task["sample_test_cases"] = tc_res.data or []
                # Restore last code submission for the editor
                lcs_res = supabase.table("task_code_submissions").select(
                    "code, language, status, test_results, submitted_at"
                ).eq("student_id", user["id"]).eq("subtopic_id", subtopic_id).order("submitted_at", desc=True).limit(1).execute()
                last_code_submission = lcs_res.data[0] if lcs_res.data else None
            else:
                sub_res = supabase.table("submissions").select("*").eq("task_id", task["id"]).eq("student_id", user["id"]).order("submitted_at", desc=True).limit(1).execute()
                submission = sub_res.data[0] if sub_res.data else None

    # Calculate next/prev and index
    all_subtopics = []
    if course_data and course_data.get("modules"):
        for m in course_data["modules"]:
            for t in m.get("topics", []):
                for s in t.get("subtopics", []):
                    all_subtopics.append(s)
    
    subtopic_index = -1
    next_sub = None
    prev_sub = None
    for i, s in enumerate(all_subtopics):
        if s["id"] == subtopic_id:
            subtopic_index = i + 1
            if i > 0: prev_sub = all_subtopics[i-1]
            if i < len(all_subtopics) - 1: next_sub = all_subtopics[i+1]
            break

    return {
        "subtopic": subtopic,
        "course": course_data,
        "module": module_raw,
        "topic": topic_raw,
        "task": task,
        "submission": submission,
        "last_code_submission": last_code_submission,
        "next_subtopic": next_sub,
        "prev_subtopic": prev_sub,
        "total_subtopics": len(all_subtopics),
        "subtopic_index": subtopic_index,
        "is_completed": is_completed,
        "completed_at": completed_at
    }

# -------------------- Tasks --------------------
@api.post("/subtopics/{subtopic_id}/task")
async def upsert_task(subtopic_id: str, payload: TaskIn, _: dict = Depends(require_roles("admin", "mentor"))):
    existing = supabase.table("tasks").select("id").eq("subtopic_id", subtopic_id).execute().data
    doc = {
        "subtopic_id": subtopic_id,
        "description": payload.description,
        "instructions": payload.instructions,
        "expected_output": payload.expected_output,
        "difficulty": payload.difficulty,
        "task_type": payload.task_type or "project",
        "language": payload.language or "java",
    }
    if existing:
        res = supabase.table("tasks").update(doc).eq("subtopic_id", subtopic_id).execute().data
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = iso(now_utc())
        res = supabase.table("tasks").insert(doc).execute().data
    return res[0] if res else doc

@api.delete("/subtopics/{subtopic_id}/task")
async def delete_task(subtopic_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("tasks").delete().eq("subtopic_id", subtopic_id).execute()
    return {"ok": True}


# -------------------- Coding Task: Test Cases (Admin) --------------------

@api.get("/tasks/{task_id}/test-cases")
async def list_task_test_cases(task_id: str, _: dict = Depends(require_roles("admin", "mentor"))):
    res = supabase.table("task_test_cases").select("*").eq("task_id", task_id).order("order_index").execute()
    return res.data or []


@api.post("/tasks/{task_id}/test-cases")
async def add_task_test_case(task_id: str, payload: TaskTestCaseIn, _: dict = Depends(require_roles("admin", "mentor"))):
    doc = {
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "input": payload.input,
        "expected_output": payload.expected_output,
        "is_sample": payload.is_sample,
        "order_index": payload.order_index,
        "created_at": iso(now_utc()),
    }
    res = supabase.table("task_test_cases").insert(doc).execute()
    return res.data[0] if res.data else doc


@api.put("/task-test-cases/{tc_id}")
async def update_task_test_case(tc_id: str, payload: TaskTestCaseIn, _: dict = Depends(require_roles("admin", "mentor"))):
    doc = {
        "input": payload.input,
        "expected_output": payload.expected_output,
        "is_sample": payload.is_sample,
        "order_index": payload.order_index,
    }
    res = supabase.table("task_test_cases").update(doc).eq("id", tc_id).execute()
    return res.data[0] if res.data else doc


@api.delete("/task-test-cases/{tc_id}")
async def delete_task_test_case(tc_id: str, _: dict = Depends(require_roles("admin", "mentor"))):
    supabase.table("task_test_cases").delete().eq("id", tc_id).execute()
    return {"ok": True}


# -------------------- Coding Task: Submit Code (Student) --------------------

@api.post("/subtopics/{subtopic_id}/submit-code")
async def submit_code_task(subtopic_id: str, payload: CodeSubmitIn, user: dict = Depends(require_active_role("student"))):
    if not payload.code.strip():
        raise HTTPException(400, "Code cannot be empty")

    # Validate subtopic and task
    task = get_single_or_none(supabase.table("tasks").select("*").eq("subtopic_id", subtopic_id))
    if not task:
        raise HTTPException(404, "No task for this subtopic")
    if task.get("task_type", "project") != "coding":
        raise HTTPException(400, "This task is not a coding task")

    # Enforce module-level payment access
    sub_topic_res = supabase.table("subtopics").select("topic_id").eq("id", subtopic_id).single().execute()
    if sub_topic_res.data:
        topic_id = sub_topic_res.data.get("topic_id")
        topic_mod_res = supabase.table("topics").select("module_id").eq("id", topic_id).single().execute()
        if topic_mod_res.data:
            module_id = topic_mod_res.data.get("module_id")
            if module_id:
                effective_tier = user.get("effective_tier", "demo")
                if effective_tier != "full":
                    has_access = check_module_access(user["id"], module_id, effective_tier, user.get("batch_id"))
                    if not has_access:
                        raise HTTPException(403, "Module access denied under current tier.")

    # Get all test cases for this task
    test_cases = supabase.table("task_test_cases").select("*").eq("task_id", task["id"]).order("order_index").execute().data or []
    if not test_cases:
        raise HTTPException(400, "No test cases configured for this task yet. Contact your admin.")

    language = (payload.language or task.get("language", "java")).lower()
    lang_map = {"java": 62, "python": 71, "javascript": 63, "cpp": 54}
    judge0_lang_id = lang_map.get(language, 62)
    judge0_headers = {"X-Auth-Token": JUDGE0_AUTH_TOKEN} if JUDGE0_AUTH_TOKEN else {}

    results = []
    all_passed = True
    overall_status = "accepted"

    async with httpx.AsyncClient() as client:
        for tc in test_cases:
            try:
                res = await client.post(f"{JUDGE0_URL}/submissions?wait=true", json={
                    "source_code": payload.code,
                    "language_id": judge0_lang_id,
                    "stdin": tc["input"],
                }, headers=judge0_headers, timeout=15.0)

                if res.status_code not in (200, 201):
                    all_passed = False
                    overall_status = "error"
                    results.append({
                        "test_case_id": tc["id"],
                        "passed": False,
                        "actual_output": f"Engine Error: {res.text}",
                        "is_sample": tc["is_sample"],
                        "input": tc["input"] if tc["is_sample"] else None,
                        "expected_output": tc["expected_output"] if tc["is_sample"] else None,
                    })
                    break

                data = res.json()

                # Compilation error
                if data.get("status", {}).get("id") == 6:
                    all_passed = False
                    overall_status = "compilation_error"
                    results.append({
                        "test_case_id": tc["id"],
                        "passed": False,
                        "actual_output": data.get("compile_output") or "Compilation Error",
                        "is_sample": tc["is_sample"],
                        "input": tc["input"] if tc["is_sample"] else None,
                        "expected_output": tc["expected_output"] if tc["is_sample"] else None,
                    })
                    break

                actual = (data.get("stdout") or "").strip()
                expected = tc["expected_output"].strip()
                passed = actual == expected
                if not passed:
                    all_passed = False
                    overall_status = "wrong_answer"

                results.append({
                    "test_case_id": tc["id"],
                    "passed": passed,
                    "actual_output": actual,
                    "is_sample": tc["is_sample"],
                    "input": tc["input"] if tc["is_sample"] else None,
                    "expected_output": tc["expected_output"] if tc["is_sample"] else None,
                })

            except httpx.TimeoutException:
                all_passed = False
                overall_status = "error"
                results.append({
                    "test_case_id": tc["id"],
                    "passed": False,
                    "actual_output": "Time Limit Exceeded",
                    "is_sample": tc["is_sample"],
                    "input": tc["input"] if tc["is_sample"] else None,
                    "expected_output": tc["expected_output"] if tc["is_sample"] else None,
                })
                break
            except Exception as e:
                all_passed = False
                overall_status = "error"
                results.append({
                    "test_case_id": tc["id"],
                    "passed": False,
                    "actual_output": f"Runner Error: {str(e)}",
                    "is_sample": tc["is_sample"],
                    "input": tc["input"] if tc["is_sample"] else None,
                    "expected_output": tc["expected_output"] if tc["is_sample"] else None,
                })
                break

    # Persist the attempt
    supabase.table("task_code_submissions").insert({
        "id": str(uuid.uuid4()),
        "task_id": task["id"],
        "subtopic_id": subtopic_id,
        "student_id": user["id"],
        "code": payload.code,
        "language": language,
        "status": overall_status,
        "test_results": results,
        "submitted_at": iso(now_utc()),
    }).execute()

    # All tests passed → auto-complete subtopic + award XP
    xp_data = None
    if all_passed:
        already_done = get_single_or_none(
            supabase.table("student_progress").select("is_completed")
            .eq("student_id", user["id"]).eq("subtopic_id", subtopic_id).eq("is_completed", True)
        )
        supabase.table("student_progress").upsert({
            "student_id": user["id"],
            "subtopic_id": subtopic_id,
            "is_completed": True,
            "completed_at": iso(now_utc()),
        }).execute()
        if not already_done:
            try:
                xp_data = award_xp(user["id"], "project_approved")  # 150 XP
            except Exception as e:
                logger.error(f"XP award error in submit-code: {e}")

    return {
        "status": overall_status,
        "all_passed": all_passed,
        "test_results": results,
        "gamification": xp_data,
    }


# -------------------- Lock/Unlock helper --------------------
async def get_ordered_topics(course_id: str) -> list:
    modules_all = supabase.table("modules").select("*").eq("course_id", course_id).order("sequence_order").execute().data
    
    # Deduplicate modules by title
    from collections import OrderedDict
    mods_by_title = OrderedDict()
    all_module_ids_for_title = {}
    for m in modules_all:
        title = m.get("title", "").strip()
        if title not in mods_by_title:
            mods_by_title[title] = m
            all_module_ids_for_title[title] = [m["id"]]
        else:
            all_module_ids_for_title[title].append(m["id"])
            
    all_module_ids = [mid for ids in all_module_ids_for_title.values() for mid in ids]
    
    if not all_module_ids:
        return []
        
    all_lessons_raw = supabase.table("topics").select("*").in_("module_id", all_module_ids).order("sequence_order").execute().data
    
    # Group and deduplicate lessons by title per canonical module
    title_to_canonical_id = {m.get("title","").strip(): m["id"] for m in mods_by_title.values()}
    id_to_title = {}
    for title, ids in all_module_ids_for_title.items():
        for mid in ids:
            id_to_title[mid] = title
            
    lessons_by_module = {}
    seen_lessons = {}
    for l in all_lessons_raw:
        mod_title = id_to_title.get(l["module_id"], "")
        canonical_id = title_to_canonical_id.get(mod_title)
        if canonical_id is None:
            continue
        if canonical_id not in lessons_by_module:
            lessons_by_module[canonical_id] = []
            seen_lessons[canonical_id] = set()
        lesson_title = l.get("title", "").strip()
        if lesson_title not in seen_lessons[canonical_id]:
            seen_lessons[canonical_id].add(lesson_title)
            lessons_by_module[canonical_id].append(l)
            
    ordered = []
    for m in mods_by_title.values():
        ordered.extend(lessons_by_module.get(m["id"], []))
        
    return ordered


async def is_topic_unlocked(student_id: str, topic_id: str) -> bool:
    """Topic N+1 unlocks only when Topic N is complete."""
    topic = get_single_or_none(supabase.table("topics").select("*").eq("id", topic_id))
    if not topic:
        return False
    module = get_single_or_none(supabase.table("modules").select("*").eq("id", topic["module_id"]))
    if not module:
        return False
    ordered = await get_ordered_topics(module["course_id"])
    idx = next((i for i, t in enumerate(ordered) if t["id"] == topic_id), -1)
    if idx <= 0:
        return True
    
    prev_topic = ordered[idx - 1]
    
    # Check if prev_topic is complete
    # A Topic is complete if all its mandatory subtopics are finished in student_progress
    mandatory_subtopics = supabase.table("subtopics")\
        .select("id")\
        .eq("topic_id", prev_topic["id"])\
        .eq("is_mandatory", True)\
        .execute().data or []
    
    if not mandatory_subtopics:
        # Fallback: if no mandatory subtopics, check if Topic was marked complete manually (legacy)
        legacy_progress = get_single_or_none(supabase.table("student_progress").select("*").eq("student_id", student_id).eq("topic_id", prev_topic["id"]).eq("is_completed", True))
        return legacy_progress is not None

    mandatory_ids = [s["id"] for s in mandatory_subtopics]
    
    # Check progress for these mandatory IDs
    completed_subtopics = supabase.table("student_progress")\
        .select("subtopic_id")\
        .eq("student_id", student_id)\
        .in_("subtopic_id", mandatory_ids)\
        .eq("is_completed", True)\
        .execute().data or []
    
    completed_ids = {c["subtopic_id"] for c in completed_subtopics}
    
    return all(mid in completed_ids for mid in mandatory_ids)


# -------------------- Submissions --------------------
@api.post("/submissions/upload")
async def upload_submission_file(file: UploadFile = File(...), user: dict = Depends(require_roles("student"))):
    # Validation: File type
    allowed_extensions = {".pdf", ".zip"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="File type not supported. Only PDF and ZIP are allowed.")
    
    # Validation: File size (10MB)
    MAX_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds limit (10MB).")
    
    # Upload to Supabase Storage
    file_path = f"{user['id']}/{uuid.uuid4()}{ext}"
    try:
        supabase.storage.from_('submissions').upload(file_path, content, file_options={"content-type": file.content_type})
        # Generate public URL
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/submissions/{file_path}"
        return {"url": public_url}
    except Exception as e:
        logger.error(f"File upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file to storage: {str(e)}")


@api.post("/subtopics/{subtopic_id}/submit")
async def submit_task(subtopic_id: str, payload: SubmissionIn, user: dict = Depends(require_active_role("student"))):
    task = get_single_or_none(supabase.table("tasks").select("*").eq("subtopic_id", subtopic_id))
    if not task:
        raise HTTPException(404, "No task for this subtopic")
    
    # Check if subtopic is unlocked (using parent topic check)
    sub_res = supabase.table("subtopics").select("topic_id, topics(module_id)").eq("id", subtopic_id).single().execute()
    if not sub_res.data: raise HTTPException(404, "Subtopic not found")
    
    # Enforce module-level payment check
    topic_data = sub_res.data.get("topics") or {}
    module_id = topic_data.get("module_id")
    if module_id:
        effective_tier = user.get("effective_tier", "demo")
        if effective_tier != "full":
            has_access = check_module_access(user["id"], module_id, effective_tier, user.get("batch_id"))
            if not has_access:
                raise HTTPException(status_code=403, detail="Module access denied under current tier.")

    if not await is_topic_unlocked(user["id"], sub_res.data["topic_id"]):
        raise HTTPException(403, "Subtopic locked")
    if not (payload.submission_url or payload.submission_text):
        raise HTTPException(400, "Provide GitHub link or text")

    if payload.submission_url:
        github_regex = r"^https?://(www\.)?github\.com/[\w.-]+/[\w.-]+/?.*$"
        is_github = re.match(github_regex, payload.submission_url)
        is_storage = "/storage/v1/object/public/submissions/" in payload.submission_url
        
        if not (is_github or is_storage):
            raise HTTPException(400, "Invalid submission format. Provide a GitHub URL or upload a file.")

    # Resolve mentor via student's active batch enrollment
    mentor_id = None
    try:
        enroll_res = supabase.table("batch_students").select("batches(mentor_id)").eq("student_id", user["id"]).execute()
        mentor_ids = [e["batches"]["mentor_id"] for e in enroll_res.data if e.get("batches") and e["batches"].get("mentor_id")] if enroll_res.data else []
        if mentor_ids:
            mentor_id = mentor_ids[0]
    except Exception as e:
        logger.error(f"Error resolving mentor in submit_task: {e}")

    # If a previous submission is in 'rework' or 'pending', overwrite it; else create new
    existing = supabase.table("submissions").select("*").eq("student_id", user["id"]).eq("subtopic_id", subtopic_id).order("submitted_at", desc=True).limit(1).execute().data
    if existing and existing[0].get("status") in ("rework", "pending"):
        supabase.table("submissions").update({
            "submission_url": payload.submission_url or "",
            "submission_text": payload.submission_text or "",
            "status": "pending",
            "feedback": "",
            "submitted_at": iso(now_utc()),
            "reviewed_at": None,
            "mentor_id": mentor_id or existing[0].get("mentor_id"),
        }).eq("id", existing[0]["id"]).execute()
        # Unlock the student immediately — XP comes later on mentor approval
        supabase.table("student_progress").upsert({
            "student_id": user["id"],
            "subtopic_id": subtopic_id,
            "is_completed": True,
            "completed_at": iso(now_utc()),
        }).execute()
        return get_single_or_none(supabase.table("submissions").select("*").eq("id", existing[0]["id"]))

    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "task_id": task["id"],
        "subtopic_id": subtopic_id,
        "student_id": user["id"],
        "mentor_id": mentor_id,
        "submission_url": payload.submission_url or "",
        "submission_text": payload.submission_text or "",
        "status": "pending",
        "feedback": "",
        "submitted_at": iso(now_utc()),
        "reviewed_at": None,
    }
    supabase.table("submissions").insert(doc).execute()
    # Unlock the student immediately — XP comes later on mentor approval
    supabase.table("student_progress").upsert({
        "student_id": user["id"],
        "subtopic_id": subtopic_id,
        "is_completed": True,
        "completed_at": iso(now_utc()),
    }).execute()
    return doc


@api.post("/subtopics/{subtopic_id}/complete")
async def complete_subtopic(subtopic_id: str, payload: TopicCompleteIn, user: dict = Depends(require_active_role("student"))):
    subtopic = get_single_or_none(supabase.table("subtopics").select("*").eq("id", subtopic_id))
    if not subtopic:
        raise HTTPException(404, "Subtopic not found")

    # Enforce module-level payment check
    topic_res = supabase.table("topics").select("module_id").eq("id", subtopic["topic_id"]).single().execute()
    if topic_res.data:
        module_id = topic_res.data.get("module_id")
        if module_id:
            effective_tier = user.get("effective_tier", "demo")
            if effective_tier != "full":
                has_access = check_module_access(user["id"], module_id, effective_tier, user.get("batch_id"))
                if not has_access:
                    raise HTTPException(status_code=403, detail="Module access denied under current tier.")

    # If it's a task subtopic, manual completion is blocked (must go through proper flow)
    has_task = get_single_or_none(supabase.table("tasks").select("id, task_type").eq("subtopic_id", subtopic_id))
    if has_task:
        task_type = has_task.get("task_type", "project")
        if task_type == "coding":
            raise HTTPException(400, "Coding tasks must be completed by passing all test cases.")
        else:
            raise HTTPException(400, "Subtopics with tasks must be approved by a mentor.")

    # Check if already completed before awarding XP
    already_done = get_single_or_none(
        supabase.table("student_progress").select("is_completed")
        .eq("student_id", user["id"]).eq("subtopic_id", subtopic_id).eq("is_completed", True)
    )

    # Record completion
    supabase.table("student_progress").upsert({
        "student_id": user["id"],
        "subtopic_id": subtopic_id,
        "is_completed": True,
        "completed_at": iso(now_utc()),
    }).execute()

    # Record time spent (legacy/analytics)
    try:
        supabase.table("subtopic_completions").upsert({
            "student_id": user["id"],
            "subtopic_id": subtopic_id,
            "time_spent_minutes": payload.time_spent_minutes,
            "completed_at": iso(now_utc())
        }).execute()
    except Exception as e:
        logger.error(f"Error recording time spent in subtopic_completions: {e}")

    # Award XP only on first completion
    if already_done:
        return {"ok": True, "gamification": None}
    try:
        xp_data = award_xp(user["id"], "lesson_completed")
        return {"ok": True, "gamification": xp_data}
    except Exception as e:
        logger.error(f"Error awarding XP: {e}")
        return {"ok": True}


@api.delete("/subtopics/{subtopic_id}/complete")
async def undo_complete_subtopic(subtopic_id: str, user: dict = Depends(require_roles("student"))):
    # Block undo if any submission is in-flight or already approved
    blocked = get_single_or_none(
        supabase.table("submissions").select("id")
        .eq("student_id", user["id"]).eq("subtopic_id", subtopic_id)
        .in_("status", ["pending", "approved"])
    )
    if blocked:
        raise HTTPException(400, "Cannot undo completion for a submitted task.")
        
    supabase.table("student_progress").delete().eq("student_id", user["id"]).eq("subtopic_id", subtopic_id).execute()
    supabase.table("subtopic_completions").delete().eq("student_id", user["id"]).eq("subtopic_id", subtopic_id).execute()
    return {"ok": True}


@api.delete("/submissions/{submission_id}")
async def delete_submission(submission_id: str, user: dict = Depends(require_roles("student"))):
    sub = get_single_or_none(supabase.table("submissions").select("*").eq("id", submission_id))
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub["student_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    if sub["status"] == "approved":
        raise HTTPException(400, "Cannot delete approved submission")
    supabase.table("submissions").delete().eq("id", submission_id).execute()
    return {"ok": True}


@api.get("/submissions/pending")
async def pending_submissions(user: dict = Depends(require_roles("mentor", "admin"))):
    try:
        # 1. Get the list of students this mentor should see
        student_ids = []
        if user["role"] == "mentor":
            # From Batches
            b_res = supabase.table("batches").select("id").eq("mentor_id", user["id"]).execute()
            b_ids = [b["id"] for b in b_res.data] if b_res.data else []
            if b_ids:
                bs_res = supabase.table("batch_students").select("student_id").in_("batch_id", b_ids).execute()
                student_ids.extend([item["student_id"] for item in bs_res.data] if bs_res.data else [])
            
            student_ids = list(set(student_ids))
            logger.info(f"[PendingSub] Mentor {user['name']} students (from batches): {student_ids}")

        # 2. Build the query - Fetching only lightweight list columns for high speed loading
        query = supabase.table("submissions").select("id, student_id, subtopic_id, task_id, status, submitted_at").in_("status", ["pending", "rework"])
        
        if user["role"] == "mentor":
            # The mentor should see submissions if:
            # a) The student is in their list
            # b) OR the submission is explicitly assigned to them
            if student_ids:
                s_list = ",".join(student_ids)
                filter_str = f"student_id.in.({s_list}),mentor_id.eq.{user['id']}"
                logger.info(f"[PendingSub] Applying filter: {filter_str}")
                query = query.or_(filter_str)
            else:
                logger.info(f"[PendingSub] No students found, filtering by mentor_id only: {user['id']}")
                query = query.eq("mentor_id", user["id"])
        
        subs_res = query.order("submitted_at", desc=True).execute()
        subs = subs_res.data or []
        logger.info(f"[PendingSub] Result: {len(subs)} items")
        
        if not subs: return []

        # 3. Batch-fetch metadata
        s_ids = list({s["student_id"] for s in subs if s.get("student_id")})
        sub_ids = list({s["subtopic_id"] for s in subs if s.get("subtopic_id")})
        
        st_map = {st["id"]: st for st in (supabase.table("users").select("id, name, email").in_("id", s_ids).execute().data or [])} if s_ids else {}
        sb_map = {sb["id"]: sb for sb in (supabase.table("subtopics").select("id, title, topic:topics(id, title)").in_("id", sub_ids).execute().data or [])} if sub_ids else {}
            
        for s in subs:
            s["student"] = st_map.get(s.get("student_id"))
            subtopic = sb_map.get(s.get("subtopic_id"))
            s["topic"] = subtopic.get("topic") if subtopic else None
            
        return subs
    except Exception as e:
        logger.error(f"Error in pending_submissions: {str(e)}")
        return []

@api.get("/submissions/{submission_id}")
async def get_submission(submission_id: str, user: dict = Depends(get_current_user)):
    sub = get_single_or_none(supabase.table("submissions").select("*").eq("id", submission_id))
    if not sub:
        raise HTTPException(404, "Submission not found")
    if user["role"] == "student" and sub["student_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    sub["student"] = get_single_or_none(supabase.table("users").select("*").eq("id", sub["student_id"]))
    
    # Resolve the parent topic of the subtopic correctly
    subtopic = get_single_or_none(supabase.table("subtopics").select("id, title, topic:topics(id, title)").eq("id", sub.get("subtopic_id")))
    sub["topic"] = subtopic.get("topic") if subtopic else None
    
    sub["task"] = get_single_or_none(supabase.table("tasks").select("*").eq("id", sub["task_id"]))
    return sub


@api.post("/submissions/{submission_id}/review")
async def review_submission(
    submission_id: str, payload: ReviewIn, user: dict = Depends(require_roles("mentor", "admin"))
):
    sub = get_single_or_none(supabase.table("submissions").select("*").eq("id", submission_id))
    if not sub:
        raise HTTPException(404, "Submission not found")
    if payload.status == "rework" and not payload.feedback.strip():
        raise HTTPException(400, "Feedback is required when requesting rework")
    # Capture before update — progress is now set at submission time, so
    # already_done would always be True; instead guard on prior approval status.
    already_approved = sub["status"] == "approved"

    update = {
        "status": payload.status,
        "feedback": payload.feedback,
        "mentor_id": user["id"],
        "reviewed_at": iso(now_utc()),
    }
    supabase.table("submissions").update(update).eq("id", submission_id).execute()
    if payload.status == "approved":
        supabase.table("student_progress").upsert({
            "student_id": sub["student_id"],
            "subtopic_id": sub["subtopic_id"],
            "is_completed": True,
            "completed_at": iso(now_utc()),
        }).execute()
        if not already_approved:
            try:
                award_xp(sub["student_id"], "project_approved")
            except Exception as e:
                logger.error(f"Error awarding XP: {e}")
    return get_single_or_none(supabase.table("submissions").select("*").eq("id", submission_id))


# -------------------- Users / Admin --------------------
@api.get("/users")
async def list_users(role: Optional[str] = None, _: dict = Depends(require_roles("admin"))):
    query = supabase.table("users").select("*").eq("is_active", True)
    if role:
        query = query.eq("role", role)
    users = query.execute().data
    return users


@api.patch("/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, _: dict = Depends(require_roles("admin"))):
    user = get_single_or_none(supabase.table("users").select("*").eq("id", user_id))
    if not user:
        raise HTTPException(404, "User not found")
    
    # Deactivate user
    supabase.table("users").update({"is_active": False}).eq("id", user_id).execute()
    
    # If mentor, unassign from all students
    if user["role"] == "mentor":
        supabase.table("users").update({"assigned_mentor_id": None}).eq("assigned_mentor_id", user_id).execute()
        # Update existing pending submissions to have no mentor (so they can be picked up by others)
        supabase.table("submissions").update({"mentor_id": None}).eq("mentor_id", user_id).in_("status", ["pending", "rework"]).execute()
        
    return {"ok": True}


# -------------------- Student Profile --------------------
@api.get("/students/profile")
async def get_student_profile(user: dict = Depends(require_roles("student"))):
    try:
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID missing from session")

        # Fetch profile - handle potential errors gracefully
        try:
            profile_query = supabase.table("student_profiles").select("*").eq("user_id", user_id).execute()
            profile = profile_query.data[0] if profile_query.data else None
        except Exception as pe:
            logger.error(f"Error querying student_profiles for {user_id}: {pe}")
            profile = None # Fallback to None if table doesn't exist or query fails

        # Fetch academics - handle potential errors gracefully
        try:
            academics_query = supabase.table("student_academics").select("*").eq("user_id", user_id).execute()
            academics = academics_query.data or []
        except Exception as ae:
            logger.error(f"Error querying student_academics for {user_id}: {ae}")
            academics = [] # Fallback to empty list

        return {
            "user": {
                "id": user_id,
                "name": user.get("name", "Unknown"),
                "email": user.get("email", "")
            },
            "profile": profile,
            "academics": academics
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Unexpected error in get_student_profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@api.post("/students/profile")
async def create_student_profile(payload: StudentProfileIn, user: dict = Depends(require_roles("student"))):
    try:
        existing = get_single_or_none(supabase.table("student_profiles").select("user_id").eq("user_id", user["id"]))
        if existing:
            raise HTTPException(status_code=400, detail="Profile already exists")
        
        doc = payload.dict()
        doc["user_id"] = user["id"]
        doc["created_at"] = iso(now_utc())
        doc["updated_at"] = iso(now_utc())
        
        supabase.table("student_profiles").insert(doc).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Profile creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api.patch("/students/profile")
async def update_student_profile(payload: StudentProfileIn, user: dict = Depends(require_roles("student"))):
    try:
        user_id = user["id"]
        profile = get_single_or_none(supabase.table("student_profiles").select("user_id").eq("user_id", user_id))
        
        # Calculate completion percentage server-side if possible, or just trust payload
        update_data = payload.dict(exclude_unset=True)
        update_data["updated_at"] = iso(now_utc())
        
        if not profile:
            update_data["user_id"] = user_id
            update_data["created_at"] = iso(now_utc())
            supabase.table("student_profiles").insert(update_data).execute()
        else:
            supabase.table("student_profiles").update(update_data).eq("user_id", user_id).execute()
        
        return {"ok": True}
    except Exception as e:
        logger.error(f"Profile update error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api.patch("/students/academics/{level}")
async def upsert_student_academic(level: str, payload: StudentAcademicIn, user: dict = Depends(require_roles("student"))):
    try:
        if level not in ["10th", "12th", "UG", "PG"]:
            raise HTTPException(status_code=400, detail="Invalid academic level")
            
        existing = get_single_or_none(supabase.table("student_academics").select("id").eq("user_id", user["id"]).eq("level", level))
        
        doc = payload.dict()
        doc["user_id"] = user["id"]
        doc["level"] = level
        doc["updated_at"] = iso(now_utc())
        
        if existing:
            supabase.table("student_academics").update(doc).eq("id", existing["id"]).execute()
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = iso(now_utc())
            supabase.table("student_academics").insert(doc).execute()
            
        return {"ok": True}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Academic upsert error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api.get("/users/inactive")
async def list_inactive_users(_: dict = Depends(require_roles("admin"))):
    res = supabase.table("users")\
        .select("id, name, email, role, created_at")\
        .eq("is_active", False)\
        .order("created_at", desc=True)\
        .execute()
    return res.data or []


@api.patch("/users/{user_id}/activate")
async def activate_user(user_id: str, _: dict = Depends(require_roles("admin"))):
    user = get_single_or_none(supabase.table("users").select("*").eq("id", user_id))
    if not user:
        raise HTTPException(404, "User not found")
    
    supabase.table("users").update({"is_active": True}).eq("id", user_id).execute()
    return {"ok": True}


@api.post("/users/{user_id}/assign-mentor")
async def assign_mentor(user_id: str, payload: AssignMentorIn, _: dict = Depends(require_roles("admin"))):
    student = get_single_or_none(supabase.table("users").select("*").eq("id", user_id))
    if not student or student["role"] != "student":
        raise HTTPException(404, "Student not found")
    mentor = get_single_or_none(supabase.table("users").select("*").eq("id", payload.mentor_id))
    if not mentor or mentor["role"] != "mentor":
        raise HTTPException(404, "Mentor not found")
    supabase.table("users").update({"assigned_mentor_id": payload.mentor_id}).eq("id", user_id).execute()
    # Update existing pending submissions
    supabase.table("submissions").update({"mentor_id": payload.mentor_id}).eq("student_id", user_id).in_("status", ["pending", "rework"]).execute()
    return {"ok": True}


@api.post("/admin/users")
async def admin_create_user(payload: AdminUserIn, _: dict = Depends(require_roles("admin")), background_tasks: BackgroundTasks = None):
    email = payload.email.lower()
    existing = supabase.table("users").select("id").eq("email", email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "assigned_mentor_id": None,
        "created_at": iso(now_utc()),
    }
    supabase.table("users").insert(user_doc).execute()
    if background_tasks:
        background_tasks.add_task(call_onboarding_lambda, payload.name, email, payload.password)
    user_doc.pop("password_hash", None)
    return user_doc


# -------------------- Dashboards --------------------
@api.get("/dashboard/student")
async def student_dashboard(user: dict = Depends(require_roles("student"))):
    try:
        # 1. Get batch/course context
        enroll_res = safe_supabase_execute(
            supabase.table("batch_students").select("batch_id, batches(course_id, mentor_id)").eq("student_id", user["id"])
        )
        if not enroll_res:
            raise HTTPException(status_code=503, detail="Database temporarily unavailable")
            
        course_ids = list({e["batches"]["course_id"] for e in enroll_res.data if e.get("batches") and e["batches"].get("course_id")})
        mentor_ids = list({e["batches"]["mentor_id"] for e in enroll_res.data if e.get("batches") and e["batches"].get("mentor_id")})
        batch_ids = [e["batch_id"] for e in enroll_res.data if e.get("batch_id")]
        
        if not course_ids:
            return {
                "courses": [],
                "mentor": None,
                "next_topic": None,
                "pending_submissions": [],
                "pending_count": 0,
                "gamification": {
                    "total_xp": user.get("total_xp", 0),
                    "level": user.get("level", 1),
                    "streak": user.get("current_streak", 0),
                    "weekly_rank": "N/A"
                }
            }

        # 2. Parallel fetch essential data AND full structure in one nested query
        import asyncio
        import time
        start_time = time.time()
        async def fetch_data():
            def q_courses(): return safe_supabase_execute(supabase.table("courses").select("id, title, description, status, created_at").eq("is_published", True).in_("id", course_ids)).data or []
            def q_progress(): return safe_supabase_execute(supabase.table("student_progress").select("subtopic_id").eq("student_id", user["id"]).eq("is_completed", True)).data or []
            def q_mentors(): return safe_supabase_execute(supabase.table("users").select("id, name, email").in_("id", mentor_ids)).data or [] if mentor_ids else []
            def q_pending(): return safe_supabase_execute(supabase.table("submissions").select("*, subtopics(id, title)").eq("student_id", user["id"]).in_("status", ["pending", "rework"])).data or []
            def q_structure(): return safe_supabase_execute(supabase.table("modules")
                .select("id, title, sequence_order, course_id, topics(id, title, sequence_order, subtopics(id, title, sequence_order, is_published))")
                .in_("course_id", course_ids)
                .order("sequence_order")).data or []
            
            return await asyncio.gather(
                asyncio.to_thread(q_courses),
                asyncio.to_thread(q_progress),
                asyncio.to_thread(q_mentors),
                asyncio.to_thread(q_pending),
                asyncio.to_thread(q_structure)
            )

        courses, progress_records, mentor_data, pending_subs, all_modules_raw = await fetch_data()
        logger.info(f"Dashboard data fetch for {user['id']} took {time.time() - start_time:.2f}s")
        progress_set = {p["subtopic_id"] for p in progress_records if p.get("subtopic_id")}
        mentor = mentor_data[0] if mentor_data else None

        # Build per-course mentor lookup: course_id → mentor object
        mentor_by_id = {m["id"]: m for m in mentor_data}
        course_mentor_map = {}
        for e in enroll_res.data:
            b = e.get("batches") or {}
            cid = b.get("course_id")
            mid = b.get("mentor_id")
            if cid and mid and cid not in course_mentor_map:
                course_mentor_map[cid] = mentor_by_id.get(mid)

        # Determine tier access in one batch query (no per-course queries)
        effective_tier = get_effective_tier(user)
        allowed_module_ids = set()
        if effective_tier not in ("full", "expired") and batch_ids:
            bma_res = safe_supabase_execute(
                supabase.table("batch_module_access").select("module_id").in_("batch_id", batch_ids).eq("tier", effective_tier)
            )
            allowed_module_ids = {r["module_id"] for r in bma_res.data} if bma_res and bma_res.data else set()

        # Build in-memory lookup maps from nested structure
        modules_by_course = {}
        for m in all_modules_raw:
            cid = m["course_id"]
            if cid not in modules_by_course:
                modules_by_course[cid] = []
            
            # Resolve tier lock per module
            if effective_tier == "full":
                m["tier_locked"] = False
            elif effective_tier == "expired":
                m["tier_locked"] = True
            else:
                m["tier_locked"] = m["id"] not in allowed_module_ids
            
            # Sort nested topics and subtopics, mark completion
            topics = sorted(m.get("topics") or [], key=lambda t: t.get("sequence_order") or 0)
            for t in topics:
                subs = sorted(t.get("subtopics") or [], key=lambda s: s.get("sequence_order") or 0)
                for s in subs:
                    s["completed"] = s["id"] in progress_set
                t["subtopics"] = subs
            m["topics"] = topics
            modules_by_course[cid].append(m)

        # 3. Process each course using in-memory data
        result_courses = []
        next_topic_data = None

        for course in courses:
            mods = modules_by_course.get(course["id"], [])
            module_count = len(mods)
            all_st = []
            for m in mods:
                for t in m.get("topics", []):
                    for s in t.get("subtopics", []):
                        all_st.append({"subtopic": s, "topic": t, "module": m})
            
            total = len(all_st)
            completed_count = sum(1 for item in all_st if item["subtopic"].get("completed"))
            
            # Find next topic
            first_unfinished = next((item for item in all_st if not item["subtopic"].get("completed")), None)
            
            if first_unfinished and not next_topic_data:
                next_topic_data = {
                    "course": course,
                    "topic": first_unfinished["topic"],
                    "subtopic": {
                        **first_unfinished["subtopic"],
                        "tier_locked": first_unfinished["module"].get("tier_locked", False),
                        "unlocked": not first_unfinished["module"].get("tier_locked", False)
                    }
                }

            result_courses.append({
                "course": course,
                "progress": round((completed_count / total * 100)) if total > 0 else 0,
                "completed_topics": completed_count,
                "total_topics": total,
                "module_count": module_count,
                "mentor": course_mentor_map.get(course["id"])
            })

        # 4. Process pending submissions
        for p in pending_subs:
            # Reconstruct 'topic' from 'subtopics'
            sub = p.pop("subtopics", None)
            if sub and isinstance(sub, dict):
                p["topic"] = {"title": sub.get("title", "Homework Submission")}
            elif not p.get("topic") or not isinstance(p.get("topic"), dict):
                p["topic"] = {"title": "Homework Submission"}

        # 5. Gamification rank
        rank = "N/A"
        try:
            rank_res = safe_supabase_execute(
                supabase.table("users").select("id", count="exact").eq("role", "student").gt("total_xp", user.get("total_xp", 0))
            )
            rank = (rank_res.count or 0) + 1 if rank_res else "N/A"
        except: pass

        return {
            "courses": result_courses,
            "mentor": mentor,
            "next_topic": next_topic_data,
            "pending_submissions": pending_subs,
            "pending_count": len(pending_subs),
            "gamification": {
                "total_xp": user.get("total_xp", 0),
                "level": user.get("level", 1),
                "streak": user.get("current_streak", 0),
                "weekly_rank": rank
            }
        }
    except Exception as e:
        logger.error(f"Error loading student dashboard for {user['id']}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, "Internal server error loading dashboard")


@api.get("/auth/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    # Fetch mentor via batch assignment if exists
    mentor = None
    try:
        enroll_res = supabase.table("batch_students").select("batches(mentor_id)").eq("student_id", user["id"]).execute()
        mentor_ids = list({e["batches"]["mentor_id"] for e in enroll_res.data if e.get("batches") and e["batches"].get("mentor_id")})
        if mentor_ids:
            mentor = get_single_or_none(supabase.table("users").select("id, name, email").eq("id", mentor_ids[0]))
    except Exception as e:
        logger.error(f"Error fetching mentor in get_profile: {e}")
    
    # Stats
    progress_count = supabase.table("student_progress").select("*", count="exact").eq("student_id", user["id"]).eq("is_completed", True).execute().count
    
    return {
        "user": user,
        "mentor": mentor,
        "stats": {
            "completed_topics": progress_count
        }
    }


@api.get("/dashboard/mentor")
async def mentor_dashboard(user: dict = Depends(require_roles("mentor"))):
    try:
        # 1. Get mentor's student set from batches
        batches_res = supabase.table("batches").select("id").eq("mentor_id", user["id"]).execute()
        b_ids = [b["id"] for b in batches_res.data] if batches_res.data else []
        
        student_ids = []
        if b_ids:
            bs_res = supabase.table("batch_students").select("student_id").in_("batch_id", b_ids).execute()
            student_ids.extend([item["student_id"] for item in bs_res.data] if bs_res.data else [])
        
        student_ids = list(set(student_ids)) # Unique list

        # 2. Calculate stats
        pending = 0
        approved = 0
        
        # Broaden filters to match pending_submissions logic and limit(1) for high performance exact counts
        p_query = supabase.table("submissions").select("id", count="exact").in_("status", ["pending", "rework"])
        a_query = supabase.table("submissions").select("id", count="exact").eq("status", "approved").eq("mentor_id", user["id"]).limit(1)
        
        if student_ids:
            p_query = p_query.or_(f"student_id.in.({','.join(student_ids)}),mentor_id.eq.{user['id']}")
        else:
            p_query = p_query.eq("mentor_id", user["id"])

        p_res = p_query.limit(1).execute()
        pending = p_res.count if hasattr(p_res, 'count') else 0
        
        a_res = a_query.execute()
        approved = a_res.count if hasattr(a_res, 'count') else 0
        
        return {
            "pending_reviews": pending,
            "approved_total": approved,
            "students_assigned": len(student_ids)
        }
    except Exception as e:
        logger.error(f"Error in mentor_dashboard: {str(e)}")
        return {"pending_reviews": 0, "approved_total": 0, "students_assigned": 0}

@api.get("/dashboard/admin")
async def admin_dashboard(_: dict = Depends(require_roles("admin"))):
    try:
        c = supabase.table("courses").select("id", count="exact").execute().count or 0
        m = supabase.table("modules").select("id", count="exact").execute().count or 0
        t = supabase.table("topics").select("id", count="exact").execute().count or 0
        s = supabase.table("subtopics").select("id", count="exact").execute().count or 0
        b = supabase.table("batches").select("id", count="exact").execute().count or 0
        
        # User counts
        students_count = supabase.table("users").select("id", count="exact").eq("role", "student").eq("is_active", True).execute().count or 0
        mentors_count = supabase.table("users").select("id", count="exact").eq("role", "mentor").eq("is_active", True).execute().count or 0
        
        return {
            "courses": c, 
            "modules": m, 
            "topics": t, 
            "subtopics": s,
            "batches": b,
            "students": students_count,
            "mentors": mentors_count
        }
    except Exception as e:
        logger.error(f"Error in admin_dashboard: {str(e)}")
        return {
            "courses": 0, 
            "modules": 0, 
            "topics": 0, 
            "subtopics": 0,
            "batches": 0,
            "students": 0,
            "mentors": 0
        }


class ExecuteIn(BaseModel):
    code: str
    stdin: str = ""
    language: str = "java"


@app.post("/api/execute")
async def execute_code(payload: ExecuteIn):
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    lang_map = {"java": 62, "python": 71, "javascript": 63, "cpp": 54}
    language_id = lang_map.get(payload.language.lower(), 62)

    headers = {"X-Auth-Token": JUDGE0_AUTH_TOKEN} if JUDGE0_AUTH_TOKEN else {}
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{JUDGE0_URL}/submissions?wait=true", json={
                "source_code": payload.code,
                "language_id": language_id,
                "stdin": payload.stdin
            }, headers=headers, timeout=30.0)
            
            if res.status_code not in (200, 201):
                logger.error(f"Judge0 API error {res.status_code}: {res.text}")
                raise HTTPException(status_code=res.status_code, detail="Execution engine error")
            
            data = res.json()
            
            # Combine stdout, stderr and compile_output for the UI
            stdout = data.get("stdout") or ""
            stderr = data.get("stderr") or ""
            compile_output = data.get("compile_output") or ""
            
            output = stdout
            if compile_output:
                output = compile_output + "\n" + output
            if stderr:
                output = output + "\n" + stderr
                
            return {
                "output": output,
                "cpuTime": data.get("time", "0"),
                "memory": str(data.get("memory", "0"))
            }
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Execution timed out. Check for infinite loops or missing input.")
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


# -------------------- Live Classes --------------------
@api.get("/batches/mentor")
async def get_mentor_batches(user: dict = Depends(require_roles("mentor"))):
    res = supabase.table("batches")\
        .select("*, courses(title)")\
        .eq("mentor_id", user["id"])\
        .in_("status", ["active", "upcoming"])\
        .execute().data
    
    flattened = []
    for row in res:
        courses_dict = row.pop("courses", {}) or {}
        row["course_title"] = courses_dict.get("title")
        flattened.append(row)
    return flattened


@api.get("/batches/{batch_id}/topics")
async def get_batch_topics(batch_id: str, user: dict = Depends(require_roles("mentor"))):
    # a. Fetch batch to get course_id
    batch = get_single_or_none(supabase.table("batches").select("course_id").eq("id", batch_id))
    if not batch:
        raise HTTPException(404, "Batch not found")
    
    course_id = batch["course_id"]
    
    # b. Fetch all modules for that course_id
    modules = supabase.table("modules")\
        .select("id, title, sequence_order")\
        .eq("course_id", course_id)\
        .order("sequence_order")\
        .execute().data
        
    if not modules:
        return []
        
    module_ids = [m["id"] for m in modules]
    mods_by_id = {m["id"]: m for m in modules}
    
    # c. Fetch all topics for those module_ids
    topics = supabase.table("topics")\
        .select("id, title, sequence_order, module_id")\
        .in_("module_id", module_ids)\
        .execute().data
    
    # Map them back
    for t in topics:
        t["module_title"] = mods_by_id.get(t["module_id"], {}).get("title")
    
    # Ordered by module sequence_order ASC, then topic sequence_order ASC
    topics.sort(key=lambda t: (mods_by_id.get(t["module_id"], {}).get("sequence_order") or 0, t.get("sequence_order") or 0))
    return topics


@api.get("/batches/sessions")
async def get_all_sessions(user: dict = Depends(require_roles("mentor", "admin"))):
    query = supabase.table("class_sessions")\
        .select("*, batches(name, courses(title)), topics(title), recordings(url)")
        
    if user["role"] == "mentor":
        mentor_batches = supabase.table("batches").select("id").eq("mentor_id", user["id"]).execute().data or []
        mentor_batch_ids = [b["id"] for b in mentor_batches]
        if mentor_batch_ids:
            query = query.in_("batch_id", mentor_batch_ids)
        else:
            return []
            
    data = query.execute().data or []
        
    live_sessions = []
    scheduled_sessions = []
    ended_sessions = []
    
    for row in data:
        batch_info = row.pop("batches", {}) or {}
        lesson_info = row.pop("topics", {}) or {}
        course_info = batch_info.get("courses", {}) or {}
        recs = row.pop("recordings", []) or []
        
        row["batch_name"] = batch_info.get("name")
        row["course_title"] = course_info.get("title")
        row["topic_title"] = lesson_info.get("title")
        row["recording_url"] = recs[0]["url"] if recs else None
        
        if row.get("status") == "live":
            live_sessions.append(row)
        elif row.get("status") == "scheduled":
            scheduled_sessions.append(row)
        else:
            ended_sessions.append(row)
            
    # Sort scheduled sessions ascending (soonest first)
    scheduled_sessions.sort(key=lambda x: x.get("scheduled_at") or "")
    
    # Sort ended sessions descending (most recent first)
    ended_sessions.sort(key=lambda x: x.get("scheduled_at") or "", reverse=True)
    
    return live_sessions + scheduled_sessions + ended_sessions


@api.post("/live-classes")
async def create_live_class(payload: ScheduleSessionIn, user: dict = Depends(require_roles("mentor", "admin"))):
    try:
        if payload.meeting_url and not payload.meeting_url.startswith("https://"):
            raise HTTPException(status_code=400, detail="Meeting URL must start with https://")
            
        doc = {
            "id": str(uuid.uuid4()),
            "batch_id": payload.batch_id,
            "topic_id": payload.topic_id or None,
            "custom_topic": payload.custom_topic or None,
            "mentor_id": user["id"],
            "status": "scheduled",
            "scheduled_at": payload.scheduled_at,
            "meeting_url": payload.meeting_url or None,
            "created_at": iso(now_utc())
        }
        res = supabase.table("class_sessions").insert(doc).execute()
        if not res.data:
            logger.error(f"Failed to create live class: {res.error}")
            raise HTTPException(500, f"Database error: {res.error}")
        return doc
    except Exception as e:
        import traceback
        logger.error(f"Error in create_live_class: {str(e)}\n{traceback.format_exc()}")
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@api.delete("/live-classes/{class_id}")
async def delete_live_class(class_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    # 1. Verify existence and ownership
    existing = get_single_or_none(supabase.table("class_sessions").select("*").eq("id", class_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Class not found")
    
    if user["role"] == "mentor" and existing["mentor_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own classes")

    # 2. Delete linked records first (to avoid foreign key violations), then class
    try:
        # Delete from recordings table
        supabase.table("recordings").delete().eq("class_session_id", class_id).execute()
        # Delete from attendance table
        supabase.table("attendance").delete().eq("class_session_id", class_id).execute()
        # Delete class session
        supabase.table("class_sessions").delete().eq("id", class_id).execute()
        return {"status": "success", "message": "Class deleted"}
    except Exception as e:
        logger.error(f"Error deleting live class {class_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete class")


# -------------------- Admin / Batches --------------------

@api.get("/admin/batches")
async def list_all_batches(_: dict = Depends(require_roles("admin"))):
    res = supabase.table("batches")\
        .select("*, courses(title), users!batches_mentor_id_fkey(name)")\
        .order("created_at", desc=True)\
        .execute().data
    
    flattened = []
    for row in res:
        course_info = row.pop("courses", {}) or {}
        mentor_info = row.pop("users", {}) or {}
        row["course_title"] = course_info.get("title")
        row["mentor_name"] = mentor_info.get("name")
        flattened.append(row)
    return flattened


@api.post("/admin/batches")
async def create_batch(payload: BatchIn, _: dict = Depends(require_roles("admin"))):
    # Validate course and mentor exist
    course = get_single_or_none(supabase.table("courses").select("id").eq("id", payload.course_id))
    if not course:
        raise HTTPException(400, "Course not found")
        
    mentor = get_single_or_none(supabase.table("users").select("id").eq("id", payload.mentor_id).eq("role", "mentor"))
    if not mentor:
        raise HTTPException(400, "Mentor not found")

    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "name": payload.name,
        "course_id": payload.course_id,
        "mentor_id": payload.mentor_id,
        "start_date": payload.start_date if payload.start_date else None,
        "status": payload.status,
        "created_at": iso(now_utc())
    }
    res = supabase.table("batches").insert(doc).execute()
    if not res.data:
        logger.error(f"Failed to insert batch: {res.error}")
        raise HTTPException(500, "Failed to create batch in database")
    return doc


@api.patch("/admin/batches/{batch_id}")
async def update_batch(batch_id: str, payload: BatchUpdateIn, _: dict = Depends(require_roles("admin"))):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not update_data:
        return {"ok": True}
        
    res = supabase.table("batches").update(update_data).eq("id", batch_id).execute()
    if not res.data:
        logger.error(f"Failed to update batch {batch_id}: {res.error}")
        raise HTTPException(404, "Batch not found or update failed")
    return {"ok": True}


@api.delete("/admin/batches/{batch_id}")
async def delete_batch(batch_id: str, _: dict = Depends(require_roles("admin"))):
    # 1. Safety Guard A: Prevent deleting batches with active student enrollments
    students = supabase.table("batch_students")\
        .select("id")\
        .eq("batch_id", batch_id)\
        .execute().data or []
    if students:
        raise HTTPException(400, "LMS Safety Alert: This batch has active student enrollments. To prevent student data loss, please reassign or remove all students from this batch before attempting to delete it.")

    # 2. Safety Guard B: Prevent deleting batches with historical/scheduled class sessions
    past_sessions = supabase.table("class_sessions")\
        .select("id")\
        .eq("batch_id", batch_id)\
        .execute().data or []
    if past_sessions:
        raise HTTPException(400, "LMS Safety Alert: This batch has conducted class history. Deleting it will permanently erase historical attendance logs, class schedules, and meeting recordings. To prevent critical data loss, this batch cannot be deleted.")

    # 3. Guard C: Check for any currently ACTIVE/LIVE class sessions
    live_sessions = [s for s in past_sessions if s.get("status") == "live"]
    if live_sessions:
        raise HTTPException(400, "LMS Safety Alert: Cannot delete a batch with an active live class session running.")
        
    try:
        # Since Guards A and B are active, a batch getting here is guaranteed to be a completely empty draft/test batch.
        # It is 100% safe to delete cleanly!
        supabase.table("batches").delete().eq("id", batch_id).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Failed to delete batch {batch_id}: {e}")
        raise HTTPException(400, f"Cannot delete batch: {str(e)}")


@api.post("/admin/batches/{batch_id}/students")
async def add_student_to_batch(batch_id: str, payload: BatchStudentIn, _: dict = Depends(require_roles("admin"))):
    # Check if student already in this batch
    exists = supabase.table("batch_students")\
        .select("id")\
        .eq("batch_id", batch_id)\
        .eq("student_id", payload.student_id)\
        .execute().data
        
    if exists:
        raise HTTPException(400, "Student already in this batch")
        
    # Insert enrollment
    supabase.table("batch_students").insert({
        "batch_id": batch_id,
        "student_id": payload.student_id
    }).execute()
    
    # Update user's batch_id for convenience
    supabase.table("users").update({"batch_id": batch_id}).eq("id", payload.student_id).execute()
    
    return {"ok": True}


@api.delete("/admin/batches/{batch_id}/students/{student_id}")
async def remove_student_from_batch(batch_id: str, student_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("batch_students")\
        .delete()\
        .eq("batch_id", batch_id)\
        .eq("student_id", student_id)\
        .execute()
        
    # Clear user's batch_id
    supabase.table("users").update({"batch_id": None}).eq("id", student_id).execute()
    
    return {"ok": True}


@api.get("/admin/mentors")
async def list_admin_mentors(_: dict = Depends(require_roles("admin"))):
    res = supabase.table("users")\
        .select("id, name, email")\
        .eq("role", "mentor")\
        .eq("is_active", True)\
        .execute().data
    return res


@api.get("/admin/students")
async def list_admin_students(_: dict = Depends(require_roles("admin"))):
    res = supabase.table("users")\
        .select("id, name, email, batch_id")\
        .eq("role", "student")\
        .eq("is_active", True)\
        .execute().data
    return res


# -------------------- Problem Library --------------------
@api.get("/problems")
async def list_problems(user: dict = Depends(get_current_user)):
    problems = supabase.table("problems").select("*").order("created_at", desc=True).execute().data
    
    # Check solved status for students
    if user["role"] == "student":
        submissions = supabase.table("problem_submissions")\
            .select("problem_id, status")\
            .eq("student_id", user["id"])\
            .execute().data
            
        solved_ids = {s["problem_id"] for s in submissions if s["status"] == "accepted"}
        attempted_ids = {s["problem_id"] for s in submissions}
        
        for p in problems:
            p["solved"] = p["id"] in solved_ids
            p["attempted"] = p["id"] in attempted_ids
            
    return problems


@api.post("/problems")
async def create_problem(payload: ProblemIn, user: dict = Depends(require_roles("admin"))):
    problem_id = str(uuid.uuid4())
    problem_doc = {
        "id": problem_id,
        "title": payload.title,
        "description": payload.description,
        "difficulty": payload.difficulty,
        "tags": payload.tags,
        "time_limit_seconds": payload.time_limit_seconds,
        "created_by": user["id"],
        "created_at": iso(now_utc())
    }
    supabase.table("problems").insert(problem_doc).execute()
    
    # Insert test cases
    test_cases = []
    for tc in payload.test_cases:
        tc_doc = {
            "id": str(uuid.uuid4()),
            "problem_id": problem_id,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "is_sample": tc.is_sample,
            "order_index": tc.order_index
        }
        test_cases.append(tc_doc)
    
    if test_cases:
        supabase.table("test_cases").insert(test_cases).execute()
        
    return {**problem_doc, "test_cases": test_cases}


@api.get("/problems/{id}")
async def get_problem(id: str, user: dict = Depends(get_current_user)):
    problem = get_single_or_none(supabase.table("problems").select("*").eq("id", id))
    if not problem:
        raise HTTPException(404, "Problem not found")
        
    # Admins get all test cases, students only get samples
    tc_query = supabase.table("test_cases").select("*").eq("problem_id", id).order("order_index")
    if user["role"] != "admin":
        tc_query = tc_query.eq("is_sample", True)
    
    problem["test_cases"] = tc_query.execute().data
    
    # Fetch history if student
    if user["role"] == "student":
        problem["submissions"] = supabase.table("problem_submissions")\
            .select("*")\
            .eq("problem_id", id)\
            .eq("student_id", user["id"])\
            .order("submitted_at", desc=True)\
            .execute().data
            
    return problem


@api.put("/problems/{id}")
async def update_problem(id: str, payload: ProblemIn, _: dict = Depends(require_roles("admin"))):
    existing = get_single_or_none(supabase.table("problems").select("id").eq("id", id))
    if not existing:
        raise HTTPException(404, "Problem not found")
        
    # Update problem
    supabase.table("problems").update({
        "title": payload.title,
        "description": payload.description,
        "difficulty": payload.difficulty,
        "tags": payload.tags,
        "time_limit_seconds": payload.time_limit_seconds
    }).eq("id", id).execute()
    
    # Replace test cases: delete then insert
    supabase.table("test_cases").delete().eq("problem_id", id).execute()
    
    test_cases = []
    for tc in payload.test_cases:
        tc_doc = {
            "id": str(uuid.uuid4()),
            "problem_id": id,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "is_sample": tc.is_sample,
            "order_index": tc.order_index
        }
        test_cases.append(tc_doc)
    
    if test_cases:
        supabase.table("test_cases").insert(test_cases).execute()
        
    return {"ok": True}


@api.delete("/problems/{id}")
async def delete_problem(id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("problems").delete().eq("id", id).execute()
    # test_cases should cascade if FK is set, but we can be explicit
    supabase.table("test_cases").delete().eq("problem_id", id).execute()
    return {"ok": True}


@api.post("/problems/{id}/submit")
async def submit_problem(id: str, payload: ProblemSubmitIn, user: dict = Depends(get_current_user)):
    problem = get_single_or_none(supabase.table("problems").select("*").eq("id", id))
    if not problem:
        raise HTTPException(404, "Problem not found")
        
    test_cases = supabase.table("test_cases").select("*").eq("problem_id", id).order("order_index").execute().data
    if not test_cases:
        raise HTTPException(400, "No test cases found for this problem")

    results = []
    all_passed = True
    overall_status = "accepted"

    lang_map = {
        "java": 62,
        "python": 71,
        "javascript": 63,
        "cpp": 54
    }
    judge0_lang_id = lang_map.get(payload.language.lower(), 62)
    judge0_headers = {"X-Auth-Token": JUDGE0_AUTH_TOKEN} if JUDGE0_AUTH_TOKEN else {}

    async with httpx.AsyncClient() as client:
        for tc in test_cases:
            try:
                res = await client.post(f"{JUDGE0_URL}/submissions?wait=true", json={
                    "source_code": payload.code,
                    "language_id": judge0_lang_id,
                    "stdin": tc["input"]
                }, headers=judge0_headers, timeout=float(problem["time_limit_seconds"]) + 5.0)
                
                if res.status_code not in (200, 201):
                    all_passed = False
                    overall_status = "error"
                    results.append({
                        "test_case_id": tc["id"],
                        "passed": False,
                        "actual_output": f"Engine Error: {res.text}",
                        "is_sample": tc["is_sample"]
                    })
                    break 

                data = res.json()
                
                # Check for compilation error (status 6)
                if data.get("status", {}).get("id") == 6:
                    all_passed = False
                    overall_status = "compilation_error"
                    results.append({
                        "test_case_id": tc["id"],
                        "passed": False,
                        "actual_output": data.get("compile_output", "Compilation Error"),
                        "is_sample": tc["is_sample"]
                    })
                    break

                actual = (data.get("stdout") or "").strip()
                expected = tc["expected_output"].strip()
                
                passed = actual == expected
                if not passed:
                    all_passed = False
                    overall_status = "wrong_answer"
                
                results.append({
                    "test_case_id": tc["id"],
                    "passed": passed,
                    "actual_output": actual,
                    "is_sample": tc["is_sample"]
                })
                
            except Exception as e:
                all_passed = False
                overall_status = "error"
                results.append({
                    "test_case_id": tc["id"],
                    "passed": False,
                    "actual_output": f"Runner Error: {str(e)}",
                    "is_sample": tc["is_sample"]
                })
                break

    # Save submission
    submission_doc = {
        "id": str(uuid.uuid4()),
        "problem_id": id,
        "student_id": user["id"],
        "code": payload.code,
        "language": payload.language,
        "submission_type": "submit",
        "status": overall_status,
        "test_results": results,
        "submitted_at": iso(now_utc())
    }
    supabase.table("problem_submissions").insert(submission_doc).execute()

    xp_data = None
    if overall_status == "accepted":
        # Check if already solved to avoid double XP
        already_solved = supabase.table("problem_submissions").select("id").eq("student_id", user["id"]).eq("problem_id", id).eq("status", "accepted").execute().data
        if len(already_solved) <= 1: # This is the first accepted submission
            xp_data = award_xp(user["id"], "problem_solved")

    return {
        "status": overall_status,
        "test_results": results,
        "gamification": xp_data
    }


def sync_student_xp(user: dict):
    try:
        # Calculate expected progress
        progress_records = supabase.table("student_progress").select("subtopic_id").eq("student_id", user["id"]).eq("is_completed", True).execute().data
        progress_set = {p["subtopic_id"] for p in progress_records}
        
        current_xp = user.get("total_xp", 0)
        approved_count = supabase.table("submissions").select("id", count="exact").eq("student_id", user["id"]).eq("status", "approved").execute().count or 0
        min_expected_xp = (len(progress_set) * 20) + (approved_count * 150)
        
        if current_xp < min_expected_xp:
            new_level = (min_expected_xp // 100) + 1
            supabase.table("users").update({
                "total_xp": min_expected_xp,
                "level": new_level,
                "current_streak": max(user.get("current_streak", 0), 1),
                "last_active_date": now_utc().date().isoformat()
            }).eq("id", user["id"]).execute()
            
            # Update local user object
            user["total_xp"] = min_expected_xp
            user["level"] = new_level
            
            # Sync Weekly Leaderboard
            today = now_utc().date()
            week_start = (today - timedelta(days=today.weekday())).isoformat()
            existing_weekly = get_single_or_none(
                supabase.table("leaderboard_weekly").select("*").eq("user_id", user["id"]).eq("week_start_date", week_start)
            )
            if not existing_weekly:
                supabase.table("leaderboard_weekly").insert({
                    "user_id": user["id"], "week_start_date": week_start, "xp": min_expected_xp
                }).execute()
            elif existing_weekly["xp"] < min_expected_xp:
                supabase.table("leaderboard_weekly").update({"xp": min_expected_xp}).eq("id", existing_weekly["id"]).execute()
            
            # --- Finally, Log this recovery in user_activity so the table isn't empty ---
            try:
                supabase.table("user_activity").insert({
                    "user_id": user["id"],
                    "action_type": "historical_sync",
                    "xp_earned": min_expected_xp,
                    "created_at": iso(now_utc())
                }).execute()
            except Exception as ae:
                logger.error(f"Error logging sync activity: {ae}")
    except Exception as e:
        logger.error(f"XP Sync error for {user.get('email')}: {e}")

@api.get("/gamification/leaderboard")
async def get_weekly_leaderboard(user: dict = Depends(get_current_user)):
    try:
        today = now_utc().date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        
        # Fetch ALL active students ordered by XP — 0 XP students are included
        all_students = supabase.table("users")\
            .select("id, name, total_xp, role")\
            .eq("role", "student")\
            .eq("is_active", True)\
            .order("total_xp", desc=True)\
            .limit(50)\
            .execute().data
        
        # Format results
        leaderboard = []
        user_rank = "N/A"
        current_rank = 1
        prev_xp = None
        
        for i, student in enumerate(all_students):
            is_me = student["id"] == user["id"]
            current_xp = student["total_xp"] or 0
            
            if prev_xp is not None and current_xp < prev_xp:
                current_rank = i + 1
                
            leaderboard.append({
                "rank": current_rank,
                "name": student["name"] or "Unknown Student",
                "xp": current_xp,
                "is_me": is_me
            })
            if is_me:
                user_rank = current_rank
            prev_xp = current_xp
        
        # If current user is not in list, find their specific rank
        if user_rank == "N/A" and user["role"] == "student":
            all_ranking = supabase.table("users").select("id").eq("role", "student").eq("is_active", True).order("total_xp", desc=True).execute().data
            for i, s in enumerate(all_ranking):
                if s["id"] == user["id"]:
                    user_rank = i + 1
                    break

        
        return {
            "week_start": week_start,
            "leaderboard": leaderboard,
            "user_rank": user_rank,
            "user_stats": {
                "total_xp": user.get("total_xp", 0),
                "level": user.get("level", 1),
                "streak": user.get("current_streak", 0)
            }
        }
    except Exception as e:
        logger.error(f"Leaderboard error: {e}")
        return {
            "week_start": None,
            "leaderboard": [],
            "user_rank": "N/A",
            "error": "Leaderboard tables not found. Please run the SQL schema."
        }


@api.post("/sessions/{session_id}/start")
async def start_session(session_id: str, user: dict = Depends(require_roles("mentor"))):
    # Check if mentor already has a live class
    live_sessions = supabase.table("class_sessions").select("id").eq("mentor_id", user["id"]).eq("status", "live").execute().data
    if live_sessions:
        raise HTTPException(status_code=409, detail="You already have a live class running.")
    
    now_str = iso(now_utc())
    res = supabase.table("class_sessions").update({
        "status": "live",
        "started_at": now_str
    }).eq("id", session_id).eq("mentor_id", user["id"]).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found or not assigned to you.")
    
    session_data = res.data[0]
    
    # --- AUTO-NOTIFY ---
    try:
        # Get lesson title
        lesson = get_single_or_none(supabase.table("topics").select("title").eq("id", session_data["topic_id"]))
        topic_title = lesson["title"] if lesson else "New Class"
        
        batch_students = supabase.table("batch_students").select("student_id").eq("batch_id", session_data["batch_id"]).execute().data
        if batch_students:
            rows = [
                {
                    "id": str(uuid.uuid4()),
                    "user_id": s["student_id"],
                    "title": "Class is LIVE!",
                    "body": f"Your class '{topic_title}' has started. Join now.",
                    "type": "class_live",
                    "related_session_id": session_id,
                    "created_at": iso(now_utc())
                }
                for s in batch_students
            ]
            supabase.table("notifications").insert(rows).execute()
    except Exception as ne:
        logger.error(f"Auto-notify start failed: {ne}")
        
    return session_data


@api.post("/sessions/{session_id}/end")
async def end_session(session_id: str, user: dict = Depends(require_roles("mentor"))):
    now = now_utc()
    # 1. Update session status
    res = supabase.table("class_sessions").update({
        "status": "ended",
        "ended_at": iso(now)
    }).eq("id", session_id).eq("mentor_id", user["id"]).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found or not assigned to you.")
    
    session = res.data[0]
    
    # Hook: Automatic demo expiry (5 classes threshold)
    batch_id = session.get("batch_id")
    if batch_id:
        try:
            # Check if this session is already logged as a demo session for the batch
            existing_demo = supabase.table("batch_demo_sessions").select("id").eq("batch_id", batch_id).eq("session_id", session_id).execute().data
            if not existing_demo:
                # Count current demo sessions to assign the session_num
                current_demos = supabase.table("batch_demo_sessions").select("id").eq("batch_id", batch_id).execute().data
                session_num = len(current_demos) + 1
                
                # Log this session
                supabase.table("batch_demo_sessions").insert({
                    "batch_id": batch_id,
                    "session_id": session_id,
                    "session_num": session_num
                }).execute()

                # If we just recorded the 5th session, expire all demo students in the batch
                if session_num >= 5:
                    # Get student IDs in this batch
                    batch_students_data = supabase.table("batch_students").select("student_id").eq("batch_id", batch_id).execute().data
                    if batch_students_data:
                        student_ids = [s["student_id"] for s in batch_students_data]
                        if student_ids:
                            supabase.table("users").update({
                                "access_tier": "expired",
                                "demo_expired_at": iso(now)
                            }).in_("id", student_ids).eq("access_tier", "demo").execute()
                            logger.info(f"Batch {batch_id}: {session_num}th demo session completed. Expired access for all demo students.")
        except Exception as demo_err:
            logger.error(f"Error in automatic demo expiry hook: {demo_err}")

    # 2. Insert into recordings
    try:
        supabase.table("recordings").insert({
            "class_session_id": session_id,
            "topic_id": session.get("topic_id"),
            "uploaded_by": user["id"],
            "uploaded_at": iso(now)
        }).execute()
    except Exception as ree:
        logger.error(f"Recording log failed: {ree}")
    
    # 3. Mark absent students
    batch_students = supabase.table("batch_students").select("student_id").eq("batch_id", session["batch_id"]).execute().data
    if batch_students:
        attendance_records = [
            {"class_session_id": session_id, "student_id": s["student_id"], "status": "absent"}
            for s in batch_students
        ]
        try:
            supabase.table("attendance").upsert(attendance_records, on_conflict="class_session_id,student_id").execute()
        except Exception as e:
            logger.warning(f"Attendance backfill note: {e}")

    return session

def levenshtein_distance(s1: str, s2: str) -> int:
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]

def fuzzy_match_student(name: str, email: str, enrolled_students: List[dict]):
    if email:
        email_clean = email.lower().strip()
        for s in enrolled_students:
            if s.get("email") and s["email"].lower().strip() == email_clean:
                return s
                
    if name:
        name_clean = name.lower().strip()
        print(f"--- Fuzzy Match Start for Google Meet Name: '{name_clean}' ---")
        
        # 1. Exact case-insensitive match
        for s in enrolled_students:
            if s.get("name") and s["name"].lower().strip() == name_clean:
                return s
                
        # 2. Word-order independent match (e.g. "Kamsu Hari" vs "Hari Kamsu")
        words_input = set(name_clean.split())
        for s in enrolled_students:
            if s.get("name"):
                words_student = set(s["name"].lower().strip().split())
                if words_input == words_student and len(words_input) > 0:
                    return s
                    
        # 2.5 Subset word match (e.g. LMS has "Hari", Meet has "Kamsu Hari")
        subset_matches = []
        for s in enrolled_students:
            if s.get("name"):
                words_student = set(s["name"].lower().strip().split())
                if len(words_student) > 0 and len(words_input) > 0:
                    if words_student.issubset(words_input) or words_input.issubset(words_student):
                        subset_matches.append(s)
        
        print(f"Subset matches for '{name_clean}': {[m['name'] for m in subset_matches]}")
        
        # Only return if there's exactly one clear subset match to avoid collisions
        if len(subset_matches) == 1:
            print(f"Matched {name_clean} to {subset_matches[0]['name']} via subset word match.")
            return subset_matches[0]
            
        # 2.7 Substring match (e.g. LMS has "hari", Meet has "harikamsu")
        substring_matches = []
        for s in enrolled_students:
            if s.get("name"):
                student_name_clean = s["name"].lower().strip()
                if len(student_name_clean) >= 3 and (student_name_clean in name_clean or name_clean in student_name_clean):
                    substring_matches.append(s)
                    
        print(f"Substring matches for '{name_clean}': {[m['name'] for m in substring_matches]}")
        
        if len(substring_matches) == 1:
            print(f"Matched {name_clean} to {substring_matches[0]['name']} via substring match.")
            return substring_matches[0]
            
        # 2.8 Any Word Match (If a significant word like "kamsu" or "hari" overlaps)
        any_word_matches = []
        for s in enrolled_students:
            if s.get("name"):
                student_name_clean = s["name"].lower().strip()
                words_student = set(student_name_clean.split())
                
                overlap = False
                for w_s in words_student:
                    if len(w_s) >= 4 and w_s in name_clean:
                        overlap = True
                        break
                    for w_i in words_input:
                        if len(w_i) >= 4 and (w_s in w_i or w_i in w_s):
                            overlap = True
                            break
                            
                if overlap:
                    any_word_matches.append(s)
                    
        print(f"Any word matches for '{name_clean}': {[m['name'] for m in any_word_matches]}")
        if len(any_word_matches) == 1:
            print(f"Matched {name_clean} to {any_word_matches[0]['name']} via any word match.")
            return any_word_matches[0]
                
        # 3. Fuzzy matching with lowercased strings
        best_match = None
        best_dist = 9999
        
        for s in enrolled_students:
            if s.get("name"):
                student_name_clean = s["name"].lower().strip()
                dist = levenshtein_distance(name_clean, student_name_clean)
                print(f"Levenshtein distance between '{name_clean}' and '{student_name_clean}': {dist}")
                if dist < best_dist:
                    best_dist = dist
                    best_match = s
                    
        max_allowed_dist = max(3, int(len(name_clean) * 0.35))
        if best_dist <= max_allowed_dist:
            return best_match
            
    return None

def parse_duration_string(s: str) -> float:
    s = s.lower().strip()
    if not s:
        return 0.0
    try:
        if s.replace(".", "", 1).isdigit():
            return float(s)
            
        minutes = 0.0
        # 1. Parse hours (h, hr, hour)
        hr_match = re.search(r'([\d.]+)\s*(hr|hour|h\b)', s)
        if hr_match:
            minutes += float(hr_match.group(1)) * 60.0
            
        # 2. Parse minutes (m, min, minute)
        min_match = re.search(r'([\d.]+)\s*(min|minute|m\b)', s)
        if min_match:
            minutes += float(min_match.group(1))
            
        # 3. Parse seconds (s, sec, second)
        sec_match = re.search(r'([\d.]+)\s*(sec|second|s\b)', s)
        if sec_match:
            minutes += float(sec_match.group(1)) / 60.0
            
        hms_match = re.search(r'(\d+):(\d+):(\d+)', s)
        if hms_match:
            minutes = float(hms_match.group(1)) * 60.0 + float(hms_match.group(2)) + float(hms_match.group(3)) / 60.0
        elif not hr_match and not min_match and not sec_match:
            num_match = re.search(r'([\d.]+)', s)
            if num_match:
                minutes = float(num_match.group(1))
                
        return minutes
    except Exception:
        return 0.0

def parse_and_combine_datetime(time_str: str, session_date: str) -> str:
    if not time_str:
        return None
    time_str = time_str.strip()
    
    # If it already contains a full date, return it
    if ('-' in time_str and len(time_str) >= 10) or ('/' in time_str and len(time_str) >= 10):
        return time_str
        
    try:
        # Check for AM/PM
        is_pm = "pm" in time_str.lower()
        is_am = "am" in time_str.lower()
        
        # Strip all alphabetic characters and extra spaces
        cleaned_time = re.sub(r'[a-zA-Z\s]', '', time_str)
        parts = cleaned_time.split(":")
        
        hour = 0
        minute = 0
        second = 0
        
        if len(parts) >= 2:
            hour = int(parts[0])
            minute = int(parts[1])
            if len(parts) >= 3:
                second = int(parts[2])
                
            if is_pm and hour < 12:
                hour += 12
            elif is_am and hour == 12:
                hour = 0
                
            return f"{session_date}T{hour:02d}:{minute:02d}:{second:02d}Z"
    except Exception as e:
        logger.error(f"Error parsing time_str '{time_str}': {e}")
        
    return f"{session_date}T00:00:00Z"

def parse_attendance_file(contents: str, filename: str) -> List[dict]:
    records = []
    is_html = filename.endswith(".html") or filename.endswith(".htm") or "<html" in contents.lower() or "<table" in contents.lower()
    
    if is_html:
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', contents, re.DOTALL | re.IGNORECASE)
        for row in rows:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            if not cells:
                continue
            
            cleaned_cells = [re.sub(r'<[^>]+>', '', cell).strip() for cell in cells]
            
            email = None
            name = None
            duration_minutes = 0.0
            time_joined = None
            
            for c in cleaned_cells:
                if "@" in c and "." in c and not email:
                    email = c
                elif ("min" in c.lower() or "hr" in c.lower() or "hour" in c.lower()) and duration_minutes == 0.0:
                    duration_minutes = parse_duration_string(c)
                elif c.isdigit() and duration_minutes == 0.0:
                    duration_minutes = float(c)
            
            if cleaned_cells:
                name = cleaned_cells[0]
                
            if email or name:
                records.append({
                    "name": name,
                    "email": email,
                    "duration_minutes": duration_minutes,
                    "time_joined": time_joined
                })
    else:
        import csv
        import io
        reader = csv.reader(io.StringIO(contents))
        rows = list(reader)
        if not rows:
            return []
            
        header = [h.strip().lower() for h in rows[0]]
        email_idx = -1
        name_idx = -1
        duration_idx = -1
        joined_idx = -1
        
        for idx, h in enumerate(header):
            if "email" in h:
                email_idx = idx
            elif "name" in h or "username" in h:
                name_idx = idx
            elif "duration" in h or "time" in h and ("min" in h or "dur" in h):
                duration_idx = idx
            elif "joined" in h or "time joined" in h or "first join" in h:
                joined_idx = idx
                
        if email_idx == -1 and len(rows) > 1:
            for idx, val in enumerate(rows[1]):
                if "@" in val and "." in val:
                    email_idx = idx
                    break
        
        if name_idx == -1:
            name_idx = 0
            
        for row in rows[1:]:
            if not row or len(row) <= max(email_idx, name_idx):
                continue
                
            email = row[email_idx] if email_idx != -1 and email_idx < len(row) else None
            name = row[name_idx] if name_idx != -1 and name_idx < len(row) else None
            
            duration_str = row[duration_idx] if duration_idx != -1 and duration_idx < len(row) else "0"
            duration_minutes = parse_duration_string(duration_str)
            
            time_joined = row[joined_idx] if joined_idx != -1 and joined_idx < len(row) else None
            
            if email or name:
                records.append({
                    "name": name.strip() if name else None,
                    "email": email.strip() if email else None,
                    "duration_minutes": duration_minutes,
                    "time_joined": time_joined.strip() if time_joined else None
                })
                
    return records


@api.post("/sessions/{session_id}/join")
async def join_session(session_id: str, user: dict = Depends(require_roles("student"))):
    session = get_single_or_none(supabase.table("class_sessions").select("*").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
    
    if session["status"] != "live":
        raise HTTPException(status_code=400, detail="Class is not live.")
    
    # We no longer log student attendance when clicking "Join Now" in the app.
    # Google Meet CSV upload is the sole source of truth.
    return {"meeting_url": session["meeting_url"]}


@api.post("/sessions/{session_id}/attendance/upload")
async def upload_attendance(
    session_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_roles("mentor", "admin"))
):
    session = get_single_or_none(supabase.table("class_sessions").select("*").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    batch_id = session["batch_id"]
    started_at_str = session.get("started_at")
    ended_at_str = session.get("ended_at")
    
    class_duration = 60
    if started_at_str and ended_at_str:
        try:
            if 'Z' in started_at_str:
                started_at = datetime.fromisoformat(started_at_str.replace('Z', '+00:00'))
            else:
                started_at = datetime.fromisoformat(started_at_str)
                
            if 'Z' in ended_at_str:
                ended_at = datetime.fromisoformat(ended_at_str.replace('Z', '+00:00'))
            else:
                ended_at = datetime.fromisoformat(ended_at_str)
                
            diff_mins = int((ended_at - started_at).total_seconds() / 60)
            if diff_mins > 0:
                class_duration = diff_mins
        except Exception as e:
            logger.error(f"Error parsing session times: {e}")
            
    required_minutes = class_duration * 0.75

    # Extract session date portion
    session_date = None
    ref_str = session.get("started_at") or session.get("scheduled_at")
    if ref_str:
        try:
            session_date = ref_str[:10]  # YYYY-MM-DD
        except Exception:
            pass
    if not session_date:
        session_date = datetime.utcnow().strftime("%Y-%m-%d")

    try:
        contents = (await file.read()).decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(400, f"Failed to read file: {str(e)}")
        
    csv_records = parse_attendance_file(contents, file.filename)
    if not csv_records:
        raise HTTPException(400, "Could not find any student records or valid headers in the uploaded file.")

    bs_res = supabase.table("batch_students")\
        .select("users(id, name, email, is_active)")\
        .eq("batch_id", batch_id)\
        .execute().data or []
        
    enrolled_students = []
    for row in bs_res:
        u = row.get("users")
        if u and u.get("is_active") and u.get("id"):
            enrolled_students.append({
                "id": u["id"],
                "name": u["name"],
                "email": u["email"]
            })
            
    if not enrolled_students:
        raise HTTPException(400, "No enrolled students found in this batch to match attendance.")

    matched_set = set()
    unmatched_names = []
    csv_student_statuses = {}
    
    for row in csv_records:
        name = row.get("name")
        email = row.get("email")
        duration_minutes = row.get("duration_minutes", 0.0)
        time_joined = row.get("time_joined")
        
        student = fuzzy_match_student(name, email, enrolled_students)
        if student:
            s_id = student["id"]
            matched_set.add(s_id)
            
            status = "present" if duration_minutes >= required_minutes else "absent"
            
            # Normalize raw time-joined from CSV
            normalized_joined = parse_and_combine_datetime(time_joined, session_date)
            
            if s_id in csv_student_statuses:
                prev = csv_student_statuses[s_id]
                new_dur = prev["duration_minutes"] + duration_minutes
                new_status = "present" if new_dur >= required_minutes else "absent"
                csv_student_statuses[s_id] = {
                    "status": new_status,
                    "joined_at": normalized_joined or prev["joined_at"],
                    "duration_minutes": new_dur
                }
            else:
                csv_student_statuses[s_id] = {
                    "status": status,
                    "joined_at": normalized_joined,
                    "duration_minutes": duration_minutes
                }
        else:
            if name and name.strip():
                unmatched_names.append(name.strip())
                
    unmatched_names = list(set(unmatched_names))

    final_attendance_list = []
    
    for s in enrolled_students:
        s_id = s["id"]
        if s_id in csv_student_statuses:
            info = csv_student_statuses[s_id]
            status = info["status"]
            joined_at = info["joined_at"]
            duration = info["duration_minutes"]
        else:
            status = "absent"
            joined_at = None
            duration = 0.0
            
        final_attendance_list.append({
            "student_id": s_id,
            "name": s["name"],
            "email": s["email"],
            "recommended_status": status,
            "duration_minutes": duration,
            "joined_at": joined_at,
            "override_reason": f"Meet duration: {max(1, int(round(duration)))} min" if duration > 0 else None
        })

    return {
        "matched": len(matched_set),
        "unmatched": len(unmatched_names),
        "total_enrolled": len(enrolled_students),
        "unmatched_names": unmatched_names,
        "draft_records": final_attendance_list
    }


@api.post("/sessions/{session_id}/attendance/bulk-save")
async def bulk_save_attendance(session_id: str, payload: BulkSaveAttendanceRequest, user: dict = Depends(require_roles("mentor", "admin"))):
    attendance_records = []
    for r in payload.records:
        attendance_records.append({
            "class_session_id": session_id,
            "student_id": r["student_id"],
            "status": r["status"],
            "joined_at": r.get("joined_at"),
            "left_at": None,
            "is_late": False,
            "override_reason": r.get("override_reason")
        })
        
    try:
        if attendance_records:
            supabase.table("attendance").upsert(attendance_records, on_conflict="class_session_id,student_id").execute()
    except Exception as e:
        logger.error(f"Error bulk saving attendance: {e}")
        raise HTTPException(500, f"Database upsert failed: {str(e)}")
        
    return {"success": True}


@api.post("/sessions/{session_id}/attendance/extension-sync")
async def extension_sync_attendance(
    session_id: str,
    payload: ExtensionSyncRequest,
    user: dict = Depends(require_roles("mentor", "admin"))
):
    session = get_single_or_none(supabase.table("class_sessions").select("*").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    batch_id = session["batch_id"]
    started_at_str = session.get("started_at")
    ended_at_str = session.get("ended_at")
    
    class_duration = 60
    if started_at_str:
        try:
            if 'Z' in started_at_str:
                started_at = datetime.fromisoformat(started_at_str.replace('Z', '+00:00'))
            else:
                started_at = datetime.fromisoformat(started_at_str)
                
            if ended_at_str:
                if 'Z' in ended_at_str:
                    ended_at = datetime.fromisoformat(ended_at_str.replace('Z', '+00:00'))
                else:
                    ended_at = datetime.fromisoformat(ended_at_str)
            else:
                # If class hasn't officially ended, calculate duration up to RIGHT NOW
                ended_at = now_utc()
                
            diff_mins = int((ended_at - started_at).total_seconds() / 60)
            if diff_mins > 0:
                class_duration = diff_mins
        except Exception:
            pass
            
    required_minutes = class_duration * 0.75

    bs_res = supabase.table("batch_students")\
        .select("users(id, name, email, is_active)")\
        .eq("batch_id", batch_id)\
        .execute().data or []
        
    enrolled_students = []
    for row in bs_res:
        u = row.get("users")
        if u and u.get("is_active") and u.get("id"):
            enrolled_students.append({
                "id": u["id"],
                "name": u["name"],
                "email": u["email"]
            })
            
    if not enrolled_students:
        raise HTTPException(400, "No enrolled students found in this batch to match attendance.")

    matched_count = 0
    unmatched_names = []
    attendance_dict = {}
    
    for p in payload.participants:
        student = fuzzy_match_student(p.name, None, enrolled_students)
        if student:
            matched_count += 1
            s_id = student["id"]
            
            # If we match the same student multiple times, keep the longest duration
            if s_id in attendance_dict:
                existing_duration = attendance_dict[s_id]["_raw_duration"]
                if p.duration_minutes <= existing_duration:
                    continue
            
            status = "present" if p.duration_minutes >= required_minutes else "absent"
            override_reason = f"Meet duration: {int(p.duration_minutes)} min (Chrome Extension)"
            if status == "absent":
                override_reason = "Chrome Extension sync (Did not meet duration)"
                
            attendance_dict[s_id] = {
                "class_session_id": session_id,
                "student_id": s_id,
                "status": status,
                "override_reason": override_reason,
                "_raw_duration": p.duration_minutes
            }
        else:
            if p.name and p.name.strip():
                unmatched_names.append(p.name.strip())
                
    # Remove internal _raw_duration key before upsert
    attendance_records = []
    for rec in attendance_dict.values():
        rec.pop("_raw_duration", None)
        attendance_records.append(rec)
                
    try:
        if attendance_records:
            supabase.table("attendance").upsert(attendance_records, on_conflict="class_session_id,student_id").execute()
    except Exception as e:
        logger.error(f"Error syncing extension attendance: {e}")
        raise HTTPException(500, f"Database upsert failed: {str(e)}")
        
    return {
        "saved": len(attendance_records),
        "matched": matched_count,
        "unmatched": list(set(unmatched_names))
    }


# -------------------- Attendance --------------------

@api.get("/sessions/{session_id}/attendance")
async def get_session_attendance(session_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    session = get_single_or_none(supabase.table("class_sessions").select("batch_id").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    batch_id = session["batch_id"]
    
    existing_res = supabase.table("attendance")\
        .select("*, users(name, email)")\
        .eq("class_session_id", session_id)\
        .execute().data
        
    bs_res = supabase.table("batch_students")\
        .select("users(id, name, email, is_active)")\
        .eq("batch_id", batch_id)\
        .execute().data or []
        
    students = []
    for row in bs_res:
        u = row.get("users")
        if u and u.get("is_active") and u.get("id"):
            students.append({"id": u["id"], "name": u["name"], "email": u.get("email")})
            
    attendance_map = {r["student_id"]: r for r in existing_res}
    
    final_records = []
    for s in students:
        if s["id"] in attendance_map:
            record = attendance_map[s["id"]]
            user_info = record.pop("users", {}) or {}
            record["student_name"] = user_info.get("name")
            record["student_email"] = user_info.get("email")
            record["avatar_url"] = None
            final_records.append(record)
        else:
            # Create a virtual 'absent' record
            final_records.append({
                "student_id": s["id"],
                "student_name": s["name"],
                "student_email": s.get("email"),
                "avatar_url": None,
                "status": "absent",
                "joined_at": None,
                "left_at": None,
                "is_late": False,
                "override_reason": None
            })
            
    return final_records


@api.patch("/sessions/{session_id}/attendance/{student_id}")
async def override_attendance(session_id: str, student_id: str, payload: AttendanceOverrideIn, user: dict = Depends(require_roles("mentor", "admin"))):
    # 1. Validate session
    session = get_single_or_none(supabase.table("class_sessions").select("id").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    # 2. Check if attendance row exists
    existing = get_single_or_none(supabase.table("attendance").select("id").eq("class_session_id", session_id).eq("student_id", student_id))
    if not existing:
        raise HTTPException(404, "Attendance record not found.")
        
    doc = {
        "status": payload.status,
        "override_reason": payload.override_reason,
        "is_late": True if payload.status == 'late' else False
    }
    
    supabase.table("attendance").update(doc).eq("id", existing["id"]).execute()
    return {"ok": True}

@api.get("/batches/{batch_id}/progress-summary")
async def get_batch_progress_summary(batch_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    # 1. Get Batch & Course info
    batch = get_single_or_none(supabase.table("batches").select("*, courses(*)").eq("id", batch_id))
    if not batch: raise HTTPException(404, "Batch not found")
    course_id = batch["course_id"]
    
    # 2. Get total subtopics in course (used internally for % calculation)
    modules = supabase.table("modules").select("id").eq("course_id", course_id).execute().data or []
    module_ids = [m["id"] for m in modules]
    topics = supabase.table("topics").select("id").in_("module_id", module_ids).execute().data or []
    topic_ids = [t["id"] for t in topics]
    subtopics = supabase.table("subtopics").select("id").in_("topic_id", topic_ids).execute().data or []
    course_subtopic_ids = [s["id"] for s in subtopics]
    total_subtopics_count = len(course_subtopic_ids)
    # Each batch is linked to exactly 1 course
    total_courses = 1

    # 3. Get all students in this batch via batch_students enrollment
    bs_res = supabase.table("batch_students").select("users(id, name, email)").eq("batch_id", batch_id).execute().data or []
    students = []
    for row in bs_res:
        u = row.get("users")
        if u:
            students.append(u)
            
    if not students: return []
    student_ids = [s["id"] for s in students]

    # 4. Get completion data for all students in bulk
    progress_records = supabase.table("student_progress").select("student_id, subtopic_id").in_("student_id", student_ids).eq("is_completed", True).execute().data or []
    lc_records = supabase.table("subtopic_completions").select("student_id, subtopic_id, time_spent_minutes").in_("student_id", student_ids).execute().data or []
    
    # Filter only relevant subtopics
    progress_records = [r for r in progress_records if r["subtopic_id"] in course_subtopic_ids]
    lc_records = [r for r in lc_records if r["subtopic_id"] in course_subtopic_ids]

    # 5. Build summary
    summary = []
    for s in students:
        s_id = s["id"]
        # Count unique completed subtopics
        completed_set = {r["subtopic_id"] for r in progress_records if r["student_id"] == s_id}
        completed_set.update({r["subtopic_id"] for r in lc_records if r["student_id"] == s_id})
        
        done = len(completed_set)
        pct = round((done / total_subtopics_count * 100)) if total_subtopics_count > 0 else 0
        
        # A course is "completed" when the student finishes 100% of all subtopics
        completed_courses = 1 if (total_subtopics_count > 0 and done >= total_subtopics_count) else 0
        
        # Calculate time spent
        time_spent = sum(r.get("time_spent_minutes", 0) or 0 for r in lc_records if r["student_id"] == s_id)
        
        summary.append({
            "student_id": s_id,
            "student_name": s["name"],
            "completed_topics": completed_courses,
            "total_topics": total_courses,
            "overall_percentage": pct,
            "total_time_spent_minutes": time_spent
        })
    return summary


@api.get("/batches/{batch_id}/attendance-summary")
async def get_batch_attendance_summary(batch_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    try:
        # 1. Get all enrolled active students in this batch from batch_students
        bs_res = supabase.table("batch_students")\
            .select("users(id, name, email, is_active)")\
            .eq("batch_id", batch_id)\
            .execute().data or []
            
        enrolled_students = []
        for row in bs_res:
            u = row.get("users")
            if u and u.get("is_active") and u.get("id"):
                enrolled_students.append({
                    "id": u["id"],
                    "name": u["name"]
                })
                
        if not enrolled_students:
            return []

        # 2. Get all session IDs for this batch
        sessions = supabase.table("class_sessions").select("id").eq("batch_id", batch_id).execute().data or []
        session_ids = [s["id"] for s in sessions]

        # 3. If there are no sessions conducted yet, return baseline empty-stats rows for all students
        if not session_ids:
            return [{
                "student_id": s["id"],
                "student_name": s["name"],
                "avatar_url": None,
                "total_sessions": 0,
                "present_count": 0,
                "late_count": 0,
                "absent_count": 0,
                "attendance_percentage": 0
            } for s in enrolled_students]

        # 4. Get attendance records for these sessions
        rows = supabase.table("attendance").select("student_id, status").in_("class_session_id", session_ids).execute().data or []
        
        # 5. Initialize summary with baseline total sessions for all enrolled students
        summary = {}
        for s in enrolled_students:
            summary[s["id"]] = {
                "present": 0,
                "late": 0,
                "absent": 0,
                "total": len(session_ids)
            }

        # 6. Aggregate explicitly recorded status counts
        for row in rows:
            sid = row["student_id"]
            if not sid or sid not in summary:
                continue
            status = row["status"]
            if status == "present":
                summary[sid]["present"] += 1
            elif status == "late":
                summary[sid]["late"] += 1
            elif status == "absent":
                summary[sid]["absent"] += 1

        # 7. Convert unrecorded sessions into implicit absences
        for sid, counts in summary.items():
            recorded = counts["present"] + counts["late"] + counts["absent"]
            implicit = max(0, len(session_ids) - recorded)
            counts["absent"] += implicit

        # 8. Build final result list
        result = []
        for s in enrolled_students:
            sid = s["id"]
            counts = summary[sid]
            total = counts["total"]
            present = counts["present"] + counts["late"]
            pct = round((present / total * 100), 1) if total > 0 else 0
            
            result.append({
                "student_id": sid,
                "student_name": s["name"],
                "avatar_url": None,
                "total_sessions": total,
                "present_count": counts["present"],
                "late_count": counts["late"],
                "absent_count": counts["absent"],
                "attendance_percentage": pct
            })
            
        return sorted(result, key=lambda x: x["attendance_percentage"])
    except Exception as e:
        logger.error(f"Error in batch summary: {e}")
        return [{"error": str(e)}]


@api.get("/students/me/enrolled-batches")
async def get_my_enrolled_batches(user: dict = Depends(require_roles("student"))):
    batch_res = supabase.table("batch_students")\
        .select("batch_id, batches(id, name, course_id, courses(id, title))")\
        .eq("student_id", user["id"]).execute().data or []
    result = []
    seen_course_ids = set()
    for b in batch_res:
        batches = b.get("batches") or {}
        courses = batches.get("courses") or {}
        course_id = courses.get("id")
        if course_id and course_id not in seen_course_ids:
            seen_course_ids.add(course_id)
            result.append({
                "batch_id": b["batch_id"],
                "batch_name": batches.get("name", ""),
                "course_id": course_id,
                "course_title": courses.get("title", "")
            })
    return result


def student_progress_key_builder(func, namespace="", request=None, response=None, *args, **kwargs):
    from fastapi_cache import FastAPICache
    prefix = f"{FastAPICache.get_prefix()}:{namespace}:{func.__module__}:{func.__name__}"
    user = kwargs.get("user")
    uid = user["id"] if user and isinstance(user, dict) and "id" in user else "anon"
    batch = kwargs.get("batchId") or (request.query_params.get("batchId") if request else "")
    return f"{prefix}:user:{uid}:batch:{batch or 'default'}"

@api.get("/students/{student_id}/progress")
@cache(expire=180, key_builder=student_progress_key_builder)
async def get_specific_student_progress(student_id: str, batchId: str = None, user: dict = Depends(get_current_user)):
    # 1. Permission check: Admin, Mentor (if assigned), or the Student themselves
    if user["role"] == "student" and user["id"] != student_id:
        raise HTTPException(403, "Access denied")
    
    # 2. Get Student Info
    student = get_single_or_none(supabase.table("users").select("*").eq("id", student_id))
    if not student: raise HTTPException(404, "Student not found")

    # 3. Get Batch & Course
    batch = None
    b_id = batchId or student.get("batch_id")
    
    if not b_id:
        # Check batch_students table as fallback
        bs_res = get_single_or_none(supabase.table("batch_students").select("batch_id").eq("student_id", student_id))
        if bs_res:
            b_id = bs_res["batch_id"]

    if b_id:
        batch = get_single_or_none(supabase.table("batches").select("*, courses(*)").eq("id", b_id))
    
    if not batch:
        # Fallback: if student has no batch, check if they have an assigned course (V1 logic)
        return {"course_title": None, "error": "No course enrolled"}

    course = batch.get("courses")
    if not course: return {"course_title": None, "error": "No course enrolled"}

    # 4. Get Syllabus
    modules = supabase.table("modules").select(
        "id, title, sequence_order, topics(id, title, sequence_order, subtopics(id, title, sequence_order))"
    ).eq("course_id", course["id"]).order("sequence_order").execute().data or []
    
    # Sort topics and subtopics by sequence_order consistently
    for m in modules:
        if m.get("topics"):
            m["topics"].sort(key=lambda t: t.get("sequence_order") or 0)
            for t in m["topics"]:
                if t.get("subtopics"):
                    t["subtopics"].sort(key=lambda s: s.get("sequence_order") or 0)
                else:
                    t["subtopics"] = []
        else:
            m["topics"] = []
            
    # Filter modules based on student's payment tier access configuration
    if student.get("role") == "student":
        effective_tier = get_effective_tier(student)
        if effective_tier != "full":
            batch_res = supabase.table("batch_students").select("batch_id, batches(course_id)").eq("student_id", student["id"]).execute().data or []
            matching_batch_id = None
            for b in batch_res:
                if b.get("batches", {}).get("course_id") == course["id"]:
                    matching_batch_id = b["batch_id"]
                    break
            
            resolved_batch_id = matching_batch_id or student.get("batch_id")
            if not resolved_batch_id:
                for m in modules:
                    m["tier_locked"] = True
            else:
                allowed_res = supabase.table("batch_module_access").select("module_id").eq("batch_id", resolved_batch_id).eq("tier", effective_tier).execute().data
                allowed_module_ids = {r["module_id"] for r in allowed_res} if allowed_res else set()
                
                for m in modules:
                    m["tier_locked"] = m["id"] not in allowed_module_ids
    
    # 5. Get Student Data
    progress_res = supabase.table("student_progress").select("subtopic_id").eq("student_id", student_id).eq("is_completed", True).execute().data or []
    progress_set = {p["subtopic_id"] for p in progress_res}
    
    sub_res = supabase.table("submissions").select("task_id, status").eq("student_id", student_id).eq("status", "approved").execute().data or []
    approved_tasks = {s["task_id"] for s in sub_res}
    
    lc_res = supabase.table("subtopic_completions").select("subtopic_id, time_spent_minutes, completed_at").eq("student_id", student_id).execute().data or []
    lc_map = {lc["subtopic_id"]: lc for lc in lc_res}

    # 6. Build Result
    # Pre-fetch all tasks for this course's subtopics in one query (avoids N+1)
    all_subtopic_ids = [
        s["id"]
        for m in modules
        for t in m.get("topics", [])
        for s in t.get("subtopics", [])
    ]
    subtopic_task_map = {}
    if all_subtopic_ids:
        tasks_bulk = supabase.table("tasks").select("id, subtopic_id")\
            .in_("subtopic_id", all_subtopic_ids).execute().data or []
        for task in tasks_bulk:
            sid = task["subtopic_id"]
            if sid not in subtopic_task_map:
                subtopic_task_map[sid] = task["id"]

    res_modules = []
    total_subtopics = 0
    completed_subtopics = 0
    total_time = 0
    current_subtopic = None

    for m in modules:
        m_total_sub = 0
        m_done_sub = 0

        for t in m.get("topics", []):
            for s in t.get("subtopics", []):
                total_subtopics += 1
                m_total_sub += 1

                task_id = subtopic_task_map.get(s["id"])
                is_done = False

                if task_id:
                    is_done = task_id in approved_tasks
                else:
                    is_done = s["id"] in progress_set or s["id"] in lc_map

                if s["id"] in lc_map:
                    total_time += lc_map[s["id"]]["time_spent_minutes"] or 0
                elif s["id"] in progress_set:
                    is_done = True

                if is_done:
                    m_done_sub += 1
                    completed_subtopics += 1

                if current_subtopic is None and not is_done:
                    current_subtopic = {
                        "subtopic_id": s["id"],
                        "subtopic_title": s["title"],
                        "topic_title": t["title"],
                        "module_title": m["title"],
                        "tier_locked": m.get("tier_locked", False)
                    }

        res_modules.append({
            "id": m["id"],
            "title": m["title"],
            "tier_locked": m.get("tier_locked", False),
            "total_subtopics": m_total_sub,
            "completed_subtopics": m_done_sub,
            "completion_percentage": round(m_done_sub / m_total_sub * 100) if m_total_sub > 0 else 0
        })

    first_completed_at = min(
        (lc["completed_at"] for lc in lc_res if lc.get("completed_at")),
        default=None
    )

    return {
        "course_id": course["id"],
        "course_title": course["title"],
        "batch_name": batch["name"],
        "overall_percentage": round(completed_subtopics / total_subtopics * 100) if total_subtopics > 0 else 0,
        "total_subtopics": total_subtopics,
        "completed_subtopics": completed_subtopics,
        "total_time_spent_minutes": total_time,
        "completed_modules": sum(1 for m in res_modules if m["completion_percentage"] == 100),
        "total_modules": len(res_modules),
        "first_completed_at": first_completed_at,
        "current_subtopic": current_subtopic
    }


@api.get("/students/{student_id}/attendance")
async def get_student_attendance(student_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student" and student_id != user["id"]:
        raise HTTPException(403, "Cannot view another student's attendance.")
        
    res = supabase.table("attendance")\
        .select("*, class_sessions!inner(scheduled_at, status, batch_id, topics(title), batches(name))")\
        .eq("student_id", student_id)\
        .order("class_sessions.scheduled_at", desc=True)\
        .execute().data
        
    flattened = []
    present_count = 0
    late_count = 0
    absent_count = 0
    
    for row in res:
        session_info = row.pop("class_sessions", {}) or {}
        lesson_info = session_info.get("topics", {}) or {}
        batch_info = session_info.get("batches", {}) or {}
        row["scheduled_at"] = session_info.get("scheduled_at")
        row["lesson_title"] = lesson_info.get("title")
        row["batch_name"] = batch_info.get("name")
        flattened.append(row)
        
        if row["status"] == "present": present_count += 1
        elif row["status"] == "late": late_count += 1
        elif row["status"] == "absent": absent_count += 1
        
    total = len(flattened)
    pct = round((present_count + late_count) / total * 100, 1) if total > 0 else 0
    
    return {
        "summary": {
            "total": total,
            "present_count": present_count,
            "late_count": late_count,
            "absent_count": absent_count,
            "attendance_percentage": pct
        },
        "records": flattened
    }


@api.get("/admin/attendance-overview")
async def get_admin_attendance_overview(user: dict = Depends(require_roles("admin"))):
    batches = supabase.table("batches")\
        .select("id, name, courses(title)")\
        .eq("status", "active")\
        .execute().data
        
    result = []
    for b in batches:
        # Get students count
        students_count = supabase.table("batch_students")\
            .select("id", count="exact")\
            .eq("batch_id", b["id"])\
            .execute().count or 0
            
        # Get average attendance
        sessions = supabase.table("class_sessions")\
            .select("id")\
            .eq("batch_id", b["id"])\
            .execute().data
            
        avg_pct = 0
        if sessions:
            session_ids = [s["id"] for s in sessions]
            attendance_rows = supabase.table("attendance")\
                .select("status, student_id")\
                .in_("class_session_id", session_ids)\
                .execute().data
                
            if attendance_rows:
                stu_stats = defaultdict(lambda: {"present": 0, "total": 0})
            for r in attendance_rows:
                sid = r["student_id"]
                if r["status"] in ("present", "late"):
                    stu_stats[sid]["present"] += 1
                stu_stats[sid]["total"] += 1
            
            total_pct = 0
            for sid, stats in stu_stats.items():
                total_pct += (stats["present"] / stats["total"] * 100)
            avg_pct = round(total_pct / len(stu_stats), 1) if stu_stats else 0
            
        result.append({
            "batch_id": b["id"],
            "batch_name": b["name"],
            "course_title": b.get("courses", {}).get("title"),
            "total_students": students_count,
            "avg_attendance_percentage": avg_pct
        })
        
    return sorted(result, key=lambda x: x["avg_attendance_percentage"])


@api.get("/sessions/{session_id}/status")
async def get_session_status(session_id: str, user: dict = Depends(get_current_user)):
    session = get_single_or_none(supabase.table("class_sessions")
      .select("id, status, meeting_url, started_at, scheduled_at, batch_id, topic_id, batches(name, course_id, courses(title)), topics(title)")
      .eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    batch_info = session.pop("batches", {}) or {}
    course_info = batch_info.pop("courses", {}) or {}
    lesson_info = session.pop("topics", {}) or {}
    
    session["batch_name"] = batch_info.get("name")
    session["course_id"] = batch_info.get("course_id")
    session["course_title"] = course_info.get("title")
    session["topic_title"] = lesson_info.get("title")
    
    return session


# -------------------- Recordings --------------------

@api.post("/sessions/{session_id}/recording")
async def upload_recording(session_id: str, payload: RecordingIn, user: dict = Depends(require_roles("mentor"))):
    # 1. Validate session
    session = get_single_or_none(supabase.table("class_sessions").select("*").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
    if session["mentor_id"] != user["id"]:
        raise HTTPException(403, "Not your session.")
    if session["status"] != "ended":
        raise HTTPException(400, "Can only upload recording for ended sessions.")
    if not payload.url.startswith("https://"):
        raise HTTPException(400, "URL must start with https://")

    # 2. Check if exists
    existing = get_single_or_none(supabase.table("recordings").select("id").eq("class_session_id", session_id))
    
    doc = {
        "url": payload.url,
        "duration_minutes": payload.duration_minutes,
        "uploaded_at": iso(now_utc())
    }
    
    if existing:
        res = supabase.table("recordings").update(doc).eq("id", existing["id"]).execute()
    else:
        doc["id"] = str(uuid.uuid4())
        doc["class_session_id"] = session_id
        doc["topic_id"] = session["topic_id"]
        doc["uploaded_by"] = user["id"]
        res = supabase.table("recordings").insert(doc).execute()
        
    recording = res.data[0] if res.data else None

    # --- AUTO-NOTIFY ---
    if recording:
        try:
            lesson = get_single_or_none(supabase.table("topics").select("title").eq("id", session["topic_id"]))
            lesson_title = lesson["title"] if lesson else "Session"
            
            batch_students = supabase.table("batch_students").select("student_id").eq("batch_id", session["batch_id"]).execute().data
            if batch_students:
                rows = [
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": s["student_id"],
                        "title": "Recording Available",
                        "body": f"Recording for '{lesson_title}' is now available.",
                        "type": "recording_uploaded",
                        "related_session_id": session_id,
                        "created_at": iso(now_utc())
                    }
                    for s in batch_students
                ]
                supabase.table("notifications").insert(rows).execute()
        except Exception as ne:
            logger.error(f"Auto-notify recording failed: {ne}")

    return recording


@api.get("/sessions/{session_id}/recording")
async def get_session_recording(session_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        session = get_single_or_none(supabase.table("class_sessions").select("batch_id").eq("id", session_id))
        if not session:
            raise HTTPException(404, "Session not found")
        in_batch = get_single_or_none(supabase.table("batch_students").select("id").eq("batch_id", session["batch_id"]).eq("student_id", user["id"]))
        if not in_batch:
            raise HTTPException(403, "Not your class.")
            
    rec = get_single_or_none(supabase.table("recordings").select("*").eq("class_session_id", session_id))
    return {"recording": rec}


@api.get("/batches/{batch_id}/recordings")
async def get_batch_recordings(batch_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        in_batch = get_single_or_none(supabase.table("batch_students").select("id").eq("batch_id", batch_id).eq("student_id", user["id"]))
        if not in_batch:
            raise HTTPException(403, "Not your batch.")
    elif user["role"] == "mentor":
        batch = get_single_or_none(supabase.table("batches").select("mentor_id").eq("id", batch_id))
        if not batch or batch["mentor_id"] != user["id"]:
            raise HTTPException(403, "Not your batch.")

    # Step 1: get session IDs for this batch
    sessions_in_batch = supabase.table("class_sessions")\
        .select("id")\
        .eq("batch_id", batch_id)\
        .execute().data
        
    if not sessions_in_batch:
        return []
        
    session_ids = [s["id"] for s in sessions_in_batch]
    
    # Step 2: fetch recordings for those sessions
    res = supabase.table("recordings")\
        .select("*, class_sessions(scheduled_at, status, custom_topic, topics(title, modules(title)))")\
        .in_("class_session_id", session_ids)\
        .order("uploaded_at", desc=True)\
        .execute().data
        
    flattened = []
    for row in res:
        session_info = row.pop("class_sessions", {}) or {}
        lesson_info = session_info.get("topics", {}) or {}
        module_info = lesson_info.get("modules", {}) or {}
        row["scheduled_at"] = session_info.get("scheduled_at")
        row["custom_topic"] = session_info.get("custom_topic")
        row["lesson_title"] = lesson_info.get("title")
        row["module_title"] = module_info.get("title")
        flattened.append(row)
        
    return flattened


@api.get("/mentor/sessions")
async def get_mentor_active_sessions(user: dict = Depends(require_roles("mentor"))):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    res = supabase.table("class_sessions")\
        .select("id, status, scheduled_at, batches(name), topics(title)")\
        .eq("mentor_id", user["id"])\
        .execute().data
    
    active_sessions = []
    for s in res:
        is_today = s.get("scheduled_at") and s.get("scheduled_at").startswith(today)
        if is_today or s.get("status") == "live":
            active_sessions.append({
                "id": s["id"],
                "status": s["status"],
                "scheduled_at": s["scheduled_at"],
                "batch_name": s.get("batches", {}).get("name") if s.get("batches") else "Unknown Batch",
                "topic_title": s.get("topics", {}).get("title") if s.get("topics") else "Custom Session"
            })
            
    active_sessions.sort(key=lambda x: x["scheduled_at"] or "", reverse=True)
    return active_sessions


@api.get("/mentor/recordings")
async def get_mentor_recordings(user: dict = Depends(require_roles("mentor"))):
    # Step 1: get session IDs for this mentor
    sessions_for_mentor = supabase.table("class_sessions")\
        .select("id, batch_id, batches(name)")\
        .eq("mentor_id", user["id"])\
        .execute().data
        
    if not sessions_for_mentor:
        return []
        
    session_ids = [s["id"] for s in sessions_for_mentor]
    
    # Build batch name lookup
    batch_name_map = {}
    for s in sessions_for_mentor:
        batch_info = s.get("batches") or {}
        batch_name_map[s["id"]] = batch_info.get("name")
    
    # Step 2: fetch recordings
    res = supabase.table("recordings")\
        .select("*, class_sessions(scheduled_at, status, custom_topic, topics(title, modules(title)))")\
        .in_("class_session_id", session_ids)\
        .order("uploaded_at", desc=True)\
        .execute().data

    # Step 3: attach batch_name from lookup during flattening
    flattened = []
    for row in res:
        session_info = row.pop("class_sessions", {}) or {}
        lesson_info = session_info.get("topics", {}) or {}
        module_info = lesson_info.get("modules", {}) or {}
        row["batch_name"] = batch_name_map.get(row.get("class_session_id"))
        row["scheduled_at"] = session_info.get("scheduled_at")
        row["custom_topic"] = session_info.get("custom_topic")
        row["lesson_title"] = lesson_info.get("title")
        row["module_title"] = module_info.get("title")
        flattened.append(row)
        
    return flattened


# -------------------- Notifications --------------------

@api.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    res = supabase.table("notifications")\
        .select("*")\
        .eq("user_id", user["id"])\
        .order("created_at", desc=True)\
        .limit(50)\
        .execute()
    return res.data


@api.get("/notifications/unread-count")
async def get_unread_count(user: dict = Depends(get_current_user)):
    try:
        query = supabase.table("notifications")\
            .select("id", count="exact")\
            .eq("user_id", user["id"])\
            .eq("is_read", False)
        
        res = safe_supabase_execute(query)
        return {"count": res.count if res else 0}
    except Exception as e:
        logger.error(f"Error getting unread count for {user['id']}: {e}")
        return {"count": 0}


@api.post("/notifications/mark-read")
async def mark_notifications_read(payload: MarkReadIn, user: dict = Depends(get_current_user)):
    if payload.all:
        res = supabase.table("notifications")\
            .update({"is_read": True})\
            .eq("user_id", user["id"])\
            .execute()
    elif payload.notification_ids:
        res = supabase.table("notifications")\
            .update({"is_read": True})\
            .in_("id", payload.notification_ids)\
            .eq("user_id", user["id"])\
            .execute()
    else:
        return {"ok": True, "updated": 0}
        
    return {"ok": True, "updated": len(res.data)}


@api.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: dict = Depends(get_current_user)):
    # Guard: must belong to user
    existing = get_single_or_none(supabase.table("notifications").select("id").eq("id", notification_id).eq("user_id", user["id"]))
    if not existing:
        raise HTTPException(403, "Not your notification.")
        
    supabase.table("notifications").delete().eq("id", notification_id).execute()
    return {"ok": True}


@api.post("/notifications/broadcast")
async def broadcast_notification(payload: NotificationBroadcastIn, user: dict = Depends(require_roles("mentor", "admin"))):
    try:
        doc = {
            "user_id": payload.user_id,
            "title": payload.title,
            "body": payload.body,
            "type": payload.type,
            "is_read": False
        }
        if payload.related_session_id:
            doc["related_session_id"] = payload.related_session_id
            
        supabase.table("notifications").insert(doc).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Broadcast failed: {e}")
        return {"error": str(e)}


@api.post("/notifications/broadcast-batch")
async def broadcast_batch_notification(payload: NotificationBatchIn, user: dict = Depends(require_roles("mentor", "admin"))):
    student_ids = supabase.table("batch_students")\
        .select("student_id")\
        .eq("batch_id", payload.batch_id)\
        .execute().data
        
    if not student_ids:
        return {"ok": True, "sent_to": 0}
        
    rows = [
        {
            "id": str(uuid.uuid4()),
            "user_id": s["student_id"],
            "title": payload.title,
            "body": payload.body,
            "type": payload.type,
            "related_session_id": payload.related_session_id,
            "created_at": iso(now_utc())
        }
        for s in student_ids
    ]
    
    supabase.table("notifications").insert(rows).execute()
    return {"ok": True, "sent_to": len(rows)}


@api.put("/sessions/{session_id}/meeting-url")
async def update_meeting_url(session_id: str, payload: MeetingUrlIn, user: dict = Depends(require_roles("mentor", "admin"))):
    if not payload.meeting_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Meeting URL must start with https://")
        
    res = supabase.table("class_sessions").update({"meeting_url": payload.meeting_url}).eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(404, "Session not found")
    return res.data[0]


@api.get("/batches/{batch_id}/sessions")
async def get_batch_sessions(batch_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        in_batch = supabase.table("batch_students").select("id").eq("batch_id", batch_id).eq("student_id", user["id"]).execute().data
        if not in_batch:
            raise HTTPException(403, "You are not enrolled in this batch.")
            
    # Join with batches (to get course info) and topics (to get topic title)
    res = supabase.table("class_sessions")\
        .select("*, batches(name, courses(title)), topics(title)")\
        .eq("batch_id", batch_id)\
        .order("scheduled_at", desc=True)\
        .execute().data or []
        
    session_ids = [s["id"] for s in res]
    
    # Get active batch students count
    bs_res = supabase.table("batch_students")\
        .select("users(id, is_active)")\
        .eq("batch_id", batch_id)\
        .execute().data or []
    active_students = [r.get("users") for r in bs_res if r.get("users") and r["users"].get("is_active")]
    total_students = len(active_students)
    
    attendance_stats = {}
    if session_ids:
        att_res = supabase.table("attendance")\
            .select("class_session_id, status")\
            .in_("class_session_id", session_ids)\
            .execute().data or []
            
        for a in att_res:
            s_id = a["class_session_id"]
            status = a["status"]
            if s_id not in attendance_stats:
                attendance_stats[s_id] = {"present": 0, "absent": 0}
            if status == "present":
                attendance_stats[s_id]["present"] += 1
            else:
                attendance_stats[s_id]["absent"] += 1
    
    # Flatten the results for the frontend
    flattened = []
    for s in res:
        batch_info = s.pop("batches", {}) or {}
        topic_info = s.pop("topics", {}) or {}
        course_info = batch_info.get("courses", {}) or {}
        
        s["batch_name"] = batch_info.get("name")
        s["course_title"] = course_info.get("title")
        s["topic_title"] = topic_info.get("title")
        
        # Add attendance stats
        stats = attendance_stats.get(s["id"], {"present": 0, "absent": 0})
        s["present_count"] = stats["present"]
        s["absent_count"] = stats["absent"]
        s["total_students"] = total_students
        if total_students > 0:
            s["attendance_percentage"] = int(round((stats["present"] / total_students) * 100))
        else:
            s["attendance_percentage"] = 0
            
        flattened.append(s)
        
    return flattened


    return {"ok": True}


@api.get("/batches/{batch_id}/students")
async def get_batch_students(batch_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    res = supabase.table("batch_students")\
        .select("*, users(name, email)")\
        .eq("batch_id", batch_id)\
        .execute().data
        
    flattened = []
    for row in res:
        user_info = row.pop("users", {}) or {}
        row["name"] = user_info.get("name") or "Unknown"
        row["email"] = user_info.get("email") or "N/A"
        row["avatar_url"] = user_info.get("profile_picture_url")
        flattened.append(row)
        
    return flattened



# -------------------- Seed --------------------
def seed_data():
    # Admin
    admin = supabase.table("users").select("*").eq("email", ADMIN_EMAIL).execute().data
    if not admin:
        admin_id = str(uuid.uuid4())
        supabase.table("users").insert({
            "id": admin_id,
            "name": "HatchKod Admin",
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "assigned_mentor_id": None,
            "created_at": iso(now_utc()),
        }).execute()
        logger.info("Seeded admin")

    # Mentor — always normalize to a dict
    mentor_email = "mentor@hatchkod.com"
    mentor = get_single_or_none(supabase.table("users").select("*").eq("email", mentor_email))
    if not mentor:
        mentor_id = str(uuid.uuid4())
        supabase.table("users").insert({
            "id": mentor_id,
            "name": "Riya Mentor",
            "email": mentor_email,
            "password_hash": hash_password("mentor123"),
            "role": "mentor",
            "assigned_mentor_id": None,
            "created_at": iso(now_utc()),
        }).execute()
        mentor = get_single_or_none(supabase.table("users").select("*").eq("email", mentor_email))
        logger.info("Seeded mentor")

    # Student — always normalize to a dict
    student_email = "student@hatchkod.com"
    student = get_single_or_none(supabase.table("users").select("*").eq("email", student_email))
    if not student:
        student_id = str(uuid.uuid4())
        supabase.table("users").insert({
            "id": student_id,
            "name": "Aman Student",
            "email": student_email,
            "password_hash": hash_password("student123"),
            "role": "student",
            "assigned_mentor_id": mentor["id"] if mentor else None,
            "created_at": iso(now_utc()),
        }).execute()
        student = get_single_or_none(supabase.table("users").select("*").eq("email", student_email))
        logger.info("Seeded student")

    # Sample course
    courses_count = supabase.table("courses").select("*", count="exact").execute().count
    course_id = None
    if courses_count == 0:
        course_id = str(uuid.uuid4())
        supabase.table("courses").insert({
            "id": course_id,
            "title": "Java Full Stack Bootcamp",
            "description": "Become a job-ready full-stack developer. Learn Java, Spring Boot, React, and ship real projects.",
            "thumbnail_url": "https://images.pexels.com/photos/6424589/pexels-photo-6424589.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "published",
            "created_at": iso(now_utc()),
        }).execute()
    else:
        course_id = supabase.table("courses").select("id").limit(1).execute().data[0]["id"]

    # Sample batch — create if none exists
    batch = get_single_or_none(supabase.table("batches").select("*").limit(1))
    if not batch and mentor and course_id:
        batch_id = str(uuid.uuid4())
        supabase.table("batches").insert({
            "id": batch_id,
            "name": "Batch Alpha - 2024",
            "course_id": course_id,
            "mentor_id": mentor["id"],
            "status": "active"
        }).execute()
        batch = {"id": batch_id}
        logger.info("Seeded batch")

    # Enroll student in batch if not already enrolled
    if batch and student:
        existing_enrollment = get_single_or_none(
            supabase.table("batch_students")
            .select("id")
            .eq("batch_id", batch["id"])
            .eq("student_id", student["id"])
        )
        if not existing_enrollment:
            supabase.table("batch_students").insert({
                "batch_id": batch["id"],
                "student_id": student["id"]
            }).execute()
            logger.info("Enrolled student in batch")

        modules_data = [
            {
                "title": "Foundations of Java",
                "lessons": [
                    {
                        "title": "Hello, Java World",
                        "content": "Set up your JDK, write your first Java program, and push it to GitHub.",
                        "task": {
                            "description": "Create a HelloWorld.java that prints 'Hello, HatchKod!' and push to GitHub.",
                            "instructions": "1. Install JDK 17\n2. Create HelloWorld.java\n3. Push the repo to GitHub\n4. Submit the public GitHub repo URL",
                            "expected_output": "Hello, HatchKod!",
                        },
                    },
                    {
                        "title": "Variables, Loops & Conditionals",
                        "content": "Master the basics. Build a simple calculator CLI.",
                        "task": {
                            "description": "Build a CLI calculator supporting +, -, *, /. Push to GitHub.",
                            "instructions": "Use Scanner for input. Handle division by zero. Submit GitHub link.",
                            "expected_output": "Working CLI calculator demoed via README",
                        },
                    },
                ],
            },
            {
                "title": "Web with Spring Boot",
                "lessons": [
                    {
                        "title": "Your First REST API",
                        "content": "Spin up a Spring Boot project and expose a /hello endpoint.",
                        "task": {
                            "description": "Build a Spring Boot app exposing GET /api/hello returning JSON.",
                            "instructions": "Use Spring Initializr. Add a controller. Push to GitHub.",
                            "expected_output": "{\"message\": \"hello\"}",
                        },
                    },
                    {
                        "title": "Connecting to a Database",
                        "content": "Persist data with Spring Data JPA and an in-memory H2 DB.",
                        "task": {
                            "description": "Add CRUD endpoints for a 'Note' entity using Spring Data JPA.",
                            "instructions": "Define entity, repository, controller. Test with Postman. Push GitHub link.",
                            "expected_output": "All CRUD endpoints working with H2 DB",
                        },
                    },
                ],
            },
        ]

        for m_idx, m in enumerate(modules_data):
            mid = str(uuid.uuid4())
            supabase.table("modules").insert({
                "id": mid,
                "course_id": course_id,
                "title": m["title"],
                "sequence_order": m_idx,
                "created_at": iso(now_utc()),
            }).execute()
            for t_idx, t_item in enumerate(m["lessons"]):
                tid = str(uuid.uuid4())
                supabase.table("topics").insert({
                    "id": tid,
                    "module_id": mid,
                    "title": t_item["title"],
                    "sequence_order": t_idx,
                    "created_at": iso(now_utc()),
                }).execute()
                
                # Create a subtopic for the content
                sid = str(uuid.uuid4())
                supabase.table("subtopics").insert({
                    "id": sid,
                    "topic_id": tid,
                    "title": f"Intro: {t_item['title']}",
                    "video_url": "https://www.youtube.com/embed/eIrMbAQSU34",
                    "content_html": t_item["content"],
                    "sequence_order": 0,
                    "created_at": iso(now_utc()),
                }).execute()

                # Create the task for the subtopic
                task_id = str(uuid.uuid4())
                supabase.table("tasks").insert({
                    "id": task_id,
                    "subtopic_id": sid,
                    "description": t_item["task"]["description"],
                    "instructions": t_item["task"]["instructions"],
                    "expected_output": t_item["task"]["expected_output"],
                    "created_at": iso(now_utc()),
                }).execute()
        logger.info("Seeded sample course")


@app.on_event("startup")
async def on_startup():
    try:
        seed_data()
    except Exception as e:
        logger.warning(f"Seed data skipped (run setup SQL manually if needed): {e}")


@app.on_event("shutdown")
async def on_shutdown():
    pass




# -------------------- Courses (Student/Public) --------------------
@api.get("/courses")
@cache(expire=3600)
async def get_courses(user: dict = Depends(require_active_access)):
    if user["role"] == "student":
        # --- BATCH FILTER: Only show the course(s) from the student's assigned batch(es) ---
        student_batches = supabase.table("batch_students")\
            .select("batch_id, batches(course_id)")\
            .eq("student_id", user["id"])\
            .execute().data

        batch_course_ids = []
        for sb in (student_batches or []):
            batch_info = sb.get("batches") or {}
            cid = batch_info.get("course_id")
            if cid and cid not in batch_course_ids:
                batch_course_ids.append(cid)

        if not batch_course_ids:
            return []  # Not in any batch yet

        q = supabase.table("courses").select("*, users(name)").eq("is_published", True).in_("id", batch_course_ids).order("created_at", desc=True)
    else:
        q = supabase.table("courses").select("*, users(name)").order("created_at", desc=True)

    res = q.execute()
    courses = res.data if res else []
    for c in courses:
        c["created_by_name"] = c.get("users", {}).get("name") if c.get("users") else None
    return courses

@api.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(require_active_access)):
    # ... (rest of get_course logic)
    # Guard against invalid UUID values like "undefined" from bad DB data
    try:
        uuid.UUID(course_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Course not found")
    course_res = supabase.table("courses").select("*, users(name)").eq("id", course_id).single().execute()
    if not course_res.data:
        raise HTTPException(404, "Course not found")
    course = course_res.data
    
    # 1. Fetch modules
    modules_res = supabase.table("modules").select("*").eq("course_id", course_id).execute()
    modules = modules_res.data or []
    
    # Filter modules based on student's payment tier access configuration
    if user["role"] == "student":
        effective_tier = user.get("effective_tier", "demo")
        if effective_tier != "full":
            batch_res = supabase.table("batch_students").select("batch_id, batches(course_id)").eq("student_id", user["id"]).execute().data or []
            matching_batch_id = None
            for b in batch_res:
                if b.get("batches", {}).get("course_id") == course_id:
                    matching_batch_id = b["batch_id"]
                    break
            
            resolved_batch_id = matching_batch_id or user.get("batch_id")
            if not resolved_batch_id:
                for m in modules:
                    m["tier_locked"] = True
            else:
                allowed_res = supabase.table("batch_module_access").select("module_id").eq("batch_id", resolved_batch_id).eq("tier", effective_tier).execute().data
                allowed_module_ids = {r["module_id"] for r in allowed_res} if allowed_res else set()
                
                for m in modules:
                    m["tier_locked"] = m["id"] not in allowed_module_ids
                
    modules.sort(key=lambda x: x.get("sequence_order") or x.get("order_index") or 0)
    module_ids = [m["id"] for m in modules]
    
    if not module_ids:
        return {**course, "modules": []}

    # 2. Fetch topics and student data in parallel safely
    import asyncio
    async def fetch_parallel():
        t_task = asyncio.to_thread(lambda: supabase.table("topics").select("*").in_("module_id", module_ids).execute().data or [])
        if user["role"] == "student":
            p_task = asyncio.to_thread(lambda: supabase.table("student_progress").select("*").eq("student_id", user["id"]).execute().data or [])
            sub_task = asyncio.to_thread(lambda: supabase.table("submissions").select("*").eq("student_id", user["id"]).execute().data or [])
            return await asyncio.gather(t_task, p_task, sub_task)
        else:
            return await asyncio.gather(t_task)

    results = await fetch_parallel()
    all_topics = results[0]
    all_topics.sort(key=lambda x: x.get("sequence_order") or x.get("order_index") or 0)
    
    progress_res = results[1] if len(results) > 1 else []
    sub_res = results[2] if len(results) > 2 else []

    # 3. Fetch subtopics
    topic_ids = [t["id"] for t in all_topics]
    all_subtopics = []
    if topic_ids:
        st_res = supabase.table("subtopics").select("*, tasks(*)").in_("topic_id", topic_ids).execute()
        all_subtopics = st_res.data or []
        all_subtopics.sort(key=lambda x: x.get("sequence_order") or x.get("order_index") or 0)

    # 4. Grouping logic
    sub_by_topic = {}
    for s in all_subtopics:
        s["task"] = s.get("tasks", [])[0] if s.get("tasks") else None
        tid = s["topic_id"]
        if tid not in sub_by_topic: sub_by_topic[tid] = []
        sub_by_topic[tid].append(s)

    topics_by_mod = {}
    for t in all_topics:
        mid = t["module_id"]
        if mid not in topics_by_mod: topics_by_mod[mid] = []
        t["subtopics"] = sub_by_topic.get(t["id"], [])
        topics_by_mod[mid].append(t)

    # 5. Final Assembly and Progress Logic
    progress_set = {p["subtopic_id"] for p in progress_res if p.get("subtopic_id")}
    sub_map = {s["subtopic_id"]: s for s in sub_res if s.get("subtopic_id")}

    ordered_topics = []
    
    # Propagate tier_locked to topics and subtopics for frontend rendering
    for m in modules:
        m["topics"] = topics_by_mod.get(m["id"], [])
        is_module_locked = m.get("tier_locked", False)
        for t in m["topics"]:
            t["tier_locked"] = is_module_locked
            for s in t.get("subtopics", []):
                s["tier_locked"] = is_module_locked
        ordered_topics.extend(m["topics"])

    if user["role"] == "student":
        for i, t in enumerate(ordered_topics):
            # 1. Topic unlocking logic
            if i == 0:
                t["unlocked"] = True
            else:
                prev_t = ordered_topics[i-1]
                # A topic N+1 is unlocked only if all MANDATORY subtopics in topic N are completed
                mandatory_prev_subs = [s for s in prev_t.get("subtopics", []) if s.get("is_mandatory", True) is not False]
                if mandatory_prev_subs:
                    t["unlocked"] = all(s.get("completed", False) for s in mandatory_prev_subs)
                else:
                    # Fallback if no mandatory subtopics exist: check if all are completed or if it's empty
                    t["unlocked"] = all(s.get("completed", False) for s in prev_t.get("subtopics", []))
            
            # 2. Subtopic unlocking logic (Sequential within the topic)
            subs = t.get("subtopics", [])
            for j, s in enumerate(subs):
                s["completed"] = s["id"] in progress_set
                s["submission"] = sub_map.get(s["id"])
                
                if j == 0:
                    s["unlocked"] = t.get("unlocked", False)
                else:
                    # Unlocked if topic is unlocked and all preceding MANDATORY subtopics are completed
                    prev_mandatory_subs = [ps for ps in subs[:j] if ps.get("is_mandatory", True) is not False]
                    s["unlocked"] = all(ps.get("completed", False) for ps in prev_mandatory_subs) and t.get("unlocked", False)
            
            # Topic is completed if all MANDATORY subtopics are completed
            mandatory_subs = [s for s in subs if s.get("is_mandatory", True) is not False]
            if mandatory_subs:
                t["completed"] = all(s.get("completed", False) for s in mandatory_subs)
            else:
                t["completed"] = all(s.get("completed", False) for s in subs) if subs else False
    else:
        # Mentors/Admins
        for t in ordered_topics:
            t["unlocked"] = True
            t["completed"] = False
            for s in t.get("subtopics", []):
                s["unlocked"] = True
                s["completed"] = False
                s["submission"] = None

    course["modules"] = modules
    return course

# -------------------- Payment Schemas --------------------
class PaymentRecordIn(BaseModel):
    user_id: str
    amount: int
    payment_type: Literal["partial", "full", "balance"]
    reference_id: Optional[str] = None
    notes: Optional[str] = None

class BatchModuleAccessIn(BaseModel):
    module_ids: List[str]
    tier: Literal["demo", "partial"]

# -------------------- Payment Routes --------------------

@api.get("/payment/status")
async def get_payment_status(user: dict = Depends(get_current_user)):
    effective_tier = get_effective_tier(user)
    
    # Pricing configuration constants as requested:
    # First payment (partial): ₹2500, second payment (balance): ₹6000, direct full: ₹8500
    pricing = {
        "partial_amount": 2500,
        "balance_amount": 6000,
        "full_amount": 8500
    }
    
    # Calculate balance due
    amount_paid = user.get("amount_paid", 0)
    tier = user.get("access_tier", "demo")
    
    balance_due = 0
    if tier == "demo" or tier == "expired":
        balance_due = pricing["full_amount"]
    elif tier == "partial":
        balance_due = pricing["balance_amount"]
    elif tier == "full":
        balance_due = 0

    return {
        "access_tier": tier,
        "effective_tier": effective_tier,
        "amount_paid": amount_paid,
        "balance_due": balance_due,
        "demo_expired_at": user.get("demo_expired_at"),
        "pricing": pricing
    }

@api.get("/payment/history")
async def get_my_payment_history(user: dict = Depends(get_current_user)):
    payments = supabase.table("payments").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute().data or []
    if payments:
        admin_ids = list({p["recorded_by"] for p in payments if p.get("recorded_by")})
        if admin_ids:
            admins = supabase.table("users").select("id, name").in_("id", admin_ids).execute().data or []
            admin_map = {a["id"]: a["name"] for a in admins}
            for p in payments:
                p["recorded_by_name"] = admin_map.get(p.get("recorded_by"), "System")
        else:
            for p in payments:
                p["recorded_by_name"] = "System"
    return payments

@api.get("/payment/accessible-modules")
async def get_accessible_modules(user: dict = Depends(require_active_access)):
    batch_id = user.get("batch_id")
    role = user.get("role")
    effective_tier = user.get("effective_tier", "demo")
    
    if role != "student" or effective_tier == "full":
        return {"has_full_access": True, "module_ids": []}
    
    if not batch_id:
        return {"has_full_access": False, "module_ids": []}
        
    res = supabase.table("batch_module_access").select("module_id").eq("batch_id", batch_id).eq("tier", effective_tier).execute().data
    module_ids = [r["module_id"] for r in res] if res else []
    
    return {"has_full_access": False, "module_ids": module_ids}

@api.post("/admin/payment/record")
async def record_payment(payload: PaymentRecordIn, user: dict = Depends(require_roles("admin"))):
    target_user = get_single_or_none(supabase.table("users").select("*").eq("id", payload.user_id))
    if not target_user:
        raise HTTPException(status_code=404, detail="Student not found")
        
    current_tier = target_user.get("access_tier", "demo")
    current_paid = target_user.get("amount_paid", 0)
    
    # State transitions check
    new_tier = current_tier
    new_paid = current_paid + payload.amount
    
    if payload.payment_type == "partial":
        if current_tier not in ["demo", "expired"]:
            raise HTTPException(status_code=400, detail=f"Cannot record partial payment for user in '{current_tier}' tier.")
        new_tier = "partial"
    elif payload.payment_type == "full":
        if current_tier not in ["demo", "expired"]:
            raise HTTPException(status_code=400, detail=f"Cannot record full payment for user in '{current_tier}' tier.")
        new_tier = "full"
    elif payload.payment_type == "balance":
        if current_tier != "partial":
            raise HTTPException(status_code=400, detail="Cannot record balance payment unless current tier is 'partial'.")
        new_tier = "full"
        
    # Start transaction-like flow (insert payment record, update user)
    payment_res = supabase.table("payments").insert({
        "user_id": payload.user_id,
        "amount": payload.amount,
        "payment_type": payload.payment_type,
        "reference_id": payload.reference_id,
        "notes": payload.notes,
        "recorded_by": user["id"]
    }).execute()
    
    if not payment_res.data:
        raise HTTPException(status_code=500, detail="Failed to create payment record")
        
    # Update user in DB
    user_update = {
        "access_tier": new_tier,
        "amount_paid": new_paid,
        "payment_status": new_tier
    }
    
    supabase.table("users").update(user_update).eq("id", payload.user_id).execute()
    
    return {
        "status": "success",
        "user_id": payload.user_id,
        "new_tier": new_tier,
        "amount_paid": new_paid,
        "payment_id": payment_res.data[0]["id"]
    }

@api.get("/admin/payment/students")
async def get_admin_students(tier: Optional[str] = None, batch_id: Optional[str] = None, user: dict = Depends(require_roles("admin"))):
    query = supabase.table("users").select("id, name, email, access_tier, amount_paid, demo_expired_at, role")
    if tier:
        query = query.eq("access_tier", tier)
    else:
        query = query.eq("role", "student")
        
    users_data = query.execute().data or []
    
    batch_students = supabase.table("batch_students").select("student_id, batch_id, batches(name)").execute().data or []
    student_to_batch = {
        bs["student_id"]: {
            "batch_id": bs["batch_id"],
            "batch_name": bs["batches"]["name"] if bs.get("batches") else "Unknown"
        }
        for bs in batch_students
    }
    
    enriched_students = []
    for u in users_data:
        effective = get_effective_tier(u)
        b_info = student_to_batch.get(u["id"], {"batch_id": None, "batch_name": "Unassigned"})
        
        if batch_id and b_info["batch_id"] != batch_id:
            continue
            
        enriched_students.append({
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "access_tier": u["access_tier"],
            "effective_tier": effective,
            "amount_paid": u["amount_paid"],
            "demo_expired_at": u["demo_expired_at"],
            "batch_id": b_info["batch_id"],
            "batch_name": b_info["batch_name"]
        })
        
    return enriched_students

@api.get("/admin/payment/history/{user_id}")
async def get_payment_history(user_id: str, user: dict = Depends(require_roles("admin"))):
    payments = supabase.table("payments").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    if payments:
        admin_ids = list({p["recorded_by"] for p in payments if p.get("recorded_by")})
        if admin_ids:
            admins = supabase.table("users").select("id, name").in_("id", admin_ids).execute().data or []
            admin_map = {a["id"]: a["name"] for a in admins}
            for p in payments:
                p["recorded_by_name"] = admin_map.get(p.get("recorded_by"), "System")
        else:
            for p in payments:
                p["recorded_by_name"] = "System"
    return payments

@api.post("/admin/batch/{batch_id}/module-access")
async def set_batch_module_access(batch_id: str, payload: BatchModuleAccessIn, user: dict = Depends(require_roles("admin"))):
    supabase.table("batch_module_access").delete().eq("batch_id", batch_id).eq("tier", payload.tier).execute()
    
    if not payload.module_ids:
        return {"status": "success", "message": "All module access removed for this tier"}
        
    records = [
        {"batch_id": batch_id, "module_id": mid, "tier": payload.tier}
        for mid in payload.module_ids
    ]
    
    supabase.table("batch_module_access").insert(records).execute()
    return {"status": "success", "count": len(payload.module_ids)}

@api.get("/admin/batch/{batch_id}/module-access")
async def get_batch_module_access(batch_id: str, user: dict = Depends(require_roles("admin"))):
    res = supabase.table("batch_module_access").select("module_id, tier").eq("batch_id", batch_id).execute().data or []
    
    grouped = {"demo": [], "partial": []}
    for r in res:
        tier = r["tier"]
        if tier in grouped:
            grouped[tier].append(r["module_id"])
            
    return grouped

@api.post("/admin/batch/{batch_id}/expire-demos")
async def expire_demos_manually(batch_id: str, user: dict = Depends(require_roles("admin"))):
    batch_students_data = supabase.table("batch_students").select("student_id").eq("batch_id", batch_id).execute().data or []
    student_ids = [s["student_id"] for s in batch_students_data]
    
    if not student_ids:
        return {"status": "success", "updated_count": 0}
        
    res = supabase.table("users").update({
        "access_tier": "expired",
        "demo_expired_at": iso(now_utc())
    }).in_("id", student_ids).eq("access_tier", "demo").execute()
    
    return {"status": "success", "updated_count": len(res.data or [])}


class ReferralValidateIn(BaseModel):
    code: str

@api.post("/referral/validate")
async def validate_referral(payload: ReferralValidateIn, user: dict = Depends(get_current_user)):
    code = payload.code.strip()
    
    # Check 1: Self-referral
    if user.get("referral_code") == code:
        raise HTTPException(400, "You cannot use your own referral code.")
        
    # Check 2: Already referred
    if user.get("referred_by"):
        raise HTTPException(400, "You have already used a referral code.")
        
    # Check 3: Code exists
    referrer = get_single_or_none(supabase.table("users").select("id, name").eq("referral_code", code))
    if not referrer:
        raise HTTPException(404, "Invalid referral code.")
        
    # Check 4: Duplicate referral (just in case, though Check 2 covers it mostly)
    existing_ref = get_single_or_none(supabase.table("referrals").select("id").eq("referrer_id", referrer["id"]).eq("referred_id", user["id"]))
    if existing_ref:
        raise HTTPException(400, "Referral already recorded.")
        
    return {
        "valid": True,
        "referrer_name": referrer["name"],
        "discount": 500
    }

# --- Razorpay Payment Gateway Integration ---

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_SrKC5KJ2yJhtWF")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "rzp_test_secret_placeholder")

class RazorpayOrderIn(BaseModel):
    amount: int
    payment_type: Literal["partial", "full", "balance"]
    referral_code: Optional[str] = None

class RazorpayVerifyIn(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    payment_type: Literal["partial", "full", "balance"]
    amount: int

@api.post("/payment/create-order")
async def create_razorpay_order(payload: RazorpayOrderIn, user: dict = Depends(get_current_user)):
    import requests
    import time
    
    final_amount = payload.amount
    discount = 0
    
    # Auto-apply existing referral if no code provided and this is their first payment
    ref_to_use = payload.referral_code
    if not ref_to_use and user.get("referred_by"):
        ref_to_use = user.get("referred_by")
    
    if ref_to_use:
        code = ref_to_use.strip()
        
        # Fraud checks
        if user.get("referral_code") == code:
            raise HTTPException(400, "You cannot use your own referral code.")
            
        # If trying to use a DIFFERENT code than what they registered with
        if user.get("referred_by") and user.get("referred_by") != code:
            raise HTTPException(400, "You have already used a different referral code.")
            
        referrer = get_single_or_none(supabase.table("users").select("id").eq("referral_code", code))
        if not referrer:
            raise HTTPException(404, "Invalid referral code.")
            
        # Only apply discount if they haven't paid anything yet (first payment)
        if user.get("amount_paid", 0) == 0:
            discount = 500
            final_amount = max(0, payload.amount - discount)
        
    rz_payload = {
        "amount": final_amount * 100,  # in paise
        "currency": "INR",
        "receipt": f"rcpt_{user['id'][:8]}_{int(time.time())}"
    }
    
    auth = (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
    try:
        res = requests.post(
            "https://api.razorpay.com/v1/orders",
            json=rz_payload,
            auth=auth,
            timeout=10
        )
        if res.status_code != 200:
            logger.error(f"Razorpay API Error: {res.text}")
            raise HTTPException(400, f"Failed to create Razorpay order: {res.text}")
            
        rz_order = res.json()
        
        # Store in payment_orders
        order_doc = {
            "student_id": user["id"],
            "razorpay_order_id": rz_order["id"],
            "amount": final_amount,
            "payment_type": payload.payment_type,
            "status": "created",
            "discount_applied": discount,
            "referral_code_used": payload.referral_code if discount > 0 else None
        }
        supabase.table("payment_orders").insert(order_doc).execute()
        
        return {
            "id": rz_order["id"],
            "amount": rz_order["amount"],
            "currency": rz_order["currency"],
            "discount_applied": discount
        }
    except Exception as e:
        logger.error(f"Razorpay order creation exception: {str(e)}")
        raise HTTPException(500, f"Internal server error when contacting Razorpay: {str(e)}")

@api.post("/payment/verify")
async def verify_razorpay_payment(payload: RazorpayVerifyIn, user: dict = Depends(get_current_user)):
    import hmac
    import hashlib
    
    # 1. Verify Razorpay Signature
    msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
    if RAZORPAY_KEY_SECRET == "rzp_test_secret_placeholder":
        logger.warning("Bypassing signature check because RAZORPAY_KEY_SECRET is still a placeholder.")
    else:
        generated_sig = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            msg.encode(),
            hashlib.sha256
        ).hexdigest()
        if generated_sig != payload.razorpay_signature:
            logger.error(f"Signature mismatch. Got: {payload.razorpay_signature}, Expected: {generated_sig}")
            raise HTTPException(400, "Payment signature verification failed")

    # 2. Record payment in the database
    payment_record = {
        "user_id": user["id"],
        "amount": payload.amount,
        "payment_type": payload.payment_type,
        "recorded_by": None,  # Online checkout self-payment
        "notes": f"Razorpay Payment ID: {payload.razorpay_payment_id}"
    }
    
    supabase.table("payments").insert(payment_record).execute()
    
    # 3. Calculate new tier and total amount paid
    current_amount_paid = user.get("amount_paid") or 0
    new_amount_paid = current_amount_paid + payload.amount
    
    if payload.payment_type == "full" or new_amount_paid >= 8500:
        new_tier = "full"
    else:
        new_tier = "partial"
        
    supabase.table("users").update({
        "access_tier": new_tier,
        "amount_paid": new_amount_paid,
        "payment_status": new_tier,
        "demo_expired_at": None
    }).eq("id", user["id"]).execute()
    
    # 4. Update referral journey status on payment (wrapped in try-except)
    try:
        order = get_single_or_none(supabase.table("payment_orders").select("*").eq("razorpay_order_id", payload.razorpay_order_id))
        if order:
            # Update order status
            supabase.table("payment_orders").update({"status": "paid", "razorpay_payment_id": payload.razorpay_payment_id, "paid_at": iso(now_utc())}).eq("id", order["id"]).execute()
            
            ref_code = order.get("referral_code_used") or user.get("referred_by")
            if ref_code:
                referrer = get_single_or_none(supabase.table("users").select("id").eq("referral_code", ref_code))
                if referrer:
                    # Ensure referred_by is set on the user
                    supabase.table("users").update({"referred_by": ref_code}).eq("id", user["id"]).execute()

                    # Check if a referral record already exists (created at registration)
                    existing_ref = get_single_or_none(
                        supabase.table("referrals").select("*")
                            .eq("referrer_id", referrer["id"])
                            .eq("referred_id", user["id"])
                    )

                    if new_tier == "full":
                        # Full payment → payout is now eligible (pending)
                        if existing_ref:
                            supabase.table("referrals").update({
                                "status": "pending",
                                "discount_applied": order.get("discount_applied", 0),
                                "converted_at": iso(now_utc())
                            }).eq("id", existing_ref["id"]).execute()
                        else:
                            supabase.table("referrals").insert({
                                "referrer_id": referrer["id"],
                                "referred_id": user["id"],
                                "code": ref_code,
                                "status": "pending",
                                "discount_applied": order.get("discount_applied", 0),
                                "payout_amount": 1500,
                                "converted_at": iso(now_utc())
                            }).execute()
                        
                        # Award XP and notify referrer
                        award_xp(referrer["id"], "referral_bonus")
                        supabase.table("notifications").insert({
                            "user_id": referrer["id"],
                            "title": "Referral Reward Unlocked! 🎉",
                            "body": "Your referred friend paid in full! ₹1,500 payout is now pending admin approval.",
                            "type": "info"
                        }).execute()

                    elif new_tier == "partial":
                        # Partial payment → advance to awaiting_full stage
                        if existing_ref:
                            supabase.table("referrals").update({
                                "status": "awaiting_full",
                                "discount_applied": order.get("discount_applied", 0),
                            }).eq("id", existing_ref["id"]).execute()
                        else:
                            supabase.table("referrals").insert({
                                "referrer_id": referrer["id"],
                                "referred_id": user["id"],
                                "code": ref_code,
                                "status": "awaiting_full",
                                "discount_applied": order.get("discount_applied", 0),
                                "payout_amount": 1500,
                            }).execute()
                        
                        # Notify referrer about partial progress
                        supabase.table("notifications").insert({
                            "user_id": referrer["id"],
                            "title": "Referral Update 📊",
                            "body": "Your referred friend made a partial payment. Payout will unlock when they complete full payment.",
                            "type": "info"
                        }).execute()
    except Exception as e:
        logger.error(f"Error updating referral status after payment: {e}")
    
    return {
        "status": "success",
        "new_tier": new_tier,
        "total_paid": new_amount_paid
    }


# -------------------- Referral Endpoints --------------------

@api.post("/admin/backfill-referral-codes")
async def admin_backfill_referral_codes(_: dict = Depends(require_roles("admin"))):
    users = supabase.table("users").select("id").is_("referral_code", "null").execute().data or []
    count = 0
    for u in users:
        code = generate_referral_code()
        supabase.table("users").update({"referral_code": code}).eq("id", u["id"]).execute()
        count += 1
    return {"status": "success", "updated": count}

@api.get("/admin/referrals")
async def get_admin_referrals(status: Optional[str] = None, _: dict = Depends(require_roles("admin"))):
    q = supabase.table("referrals").select("*, referrer:users!referrals_referrer_id_fkey(name, upi_id), referred:users!referrals_referred_id_fkey(name, access_tier, amount_paid)")
    if status:
        q = q.eq("status", status)
    data = q.order("created_at", desc=True).execute().data or []
    return data

class MarkPaidIn(BaseModel):
    utr_number: str

@api.post("/admin/referrals/{referral_id}/mark-paid")
async def mark_referral_paid(referral_id: str, payload: MarkPaidIn, _: dict = Depends(require_roles("admin"))):
    ref = get_single_or_none(supabase.table("referrals").select("*").eq("id", referral_id))
    if not ref:
        raise HTTPException(404, "Referral not found")
        
    supabase.table("referrals").update({
        "status": "paid",
        "utr_number": payload.utr_number,
        "paid_at": iso(now_utc())
    }).eq("id", referral_id).execute()
    
    supabase.table("notifications").insert({
        "user_id": ref["referrer_id"],
        "title": "₹1500 Referral Payout Sent!",
        "body": f"Your referral payout of ₹1500 has been sent. UTR: {payload.utr_number}",
        "type": "success"
    }).execute()
    return {"status": "success"}

@api.post("/admin/referrals/{referral_id}/reject")
async def reject_referral(referral_id: str, _: dict = Depends(require_roles("admin"))):
    ref = get_single_or_none(supabase.table("referrals").select("*").eq("id", referral_id))
    if not ref:
        raise HTTPException(404, "Referral not found")
        
    supabase.table("referrals").update({"status": "rejected"}).eq("id", referral_id).execute()
    
    supabase.table("notifications").insert({
        "user_id": ref["referrer_id"],
        "title": "Referral Payout Rejected",
        "body": "Unfortunately, one of your pending referral payouts has been rejected by an admin.",
        "type": "error"
    }).execute()
    return {"status": "success"}

@api.get("/admin/referral-leaderboard")
async def get_referral_leaderboard(_: dict = Depends(require_roles("admin"))):
    # Could do this in SQL, but for now we aggregate in python or simple query
    referrals = supabase.table("referrals").select("referrer_id, status, payout_amount").execute().data or []
    users = supabase.table("users").select("id, name, total_xp").execute().data or []
    
    user_map = {u["id"]: {"id": u["id"], "name": u["name"], "total_referrals": 0, "total_paid": 0, "total_pending": 0, "total_xp_earned": u["total_xp"]} for u in users}
    
    for r in referrals:
        rid = r["referrer_id"]
        if rid in user_map:
            user_map[rid]["total_referrals"] += 1
            if r["status"] == "paid":
                user_map[rid]["total_paid"] += r.get("payout_amount", 0)
            elif r["status"] == "pending":
                user_map[rid]["total_pending"] += r.get("payout_amount", 0)
                
    leaderboard = [u for u in user_map.values() if u["total_referrals"] > 0]
    leaderboard.sort(key=lambda x: x["total_referrals"], reverse=True)
    return leaderboard

@api.get("/student/referral")
async def get_student_referral(user: dict = Depends(get_current_user)):
    code = user.get("referral_code")
    if not code:
        # Auto-generate if missing
        code = generate_referral_code()
        supabase.table("users").update({"referral_code": code}).eq("id", user["id"]).execute()
        
    refs = supabase.table("referrals").select("*, referred:users!referrals_referred_id_fkey(name)").eq("referrer_id", user["id"]).order("created_at", desc=True).execute().data or []
    
    total_earned = sum(r.get("payout_amount", 0) for r in refs if r["status"] == "paid")
    pending = sum(r.get("payout_amount", 0) for r in refs if r["status"] == "pending")
    
    formatted_refs = [{
        "referred_name": r.get("referred", {}).get("name", "Unknown"),
        "status": r["status"],
        "converted_at": r.get("converted_at"),
        "created_at": r.get("created_at")
    } for r in refs]
    
    return {
        "my_code": code,
        "upi_id": user.get("upi_id") or "",
        "total_referrals": len(refs),
        "pending_payout": pending,
        "total_earned": total_earned,
        "referrals": formatted_refs
    }

class UpiIdIn(BaseModel):
    upi_id: str

@api.put("/student/upi-id")
async def save_upi_id(payload: UpiIdIn, user: dict = Depends(get_current_user)):
    upi = payload.upi_id.strip()
    supabase.table("users").update({"upi_id": upi}).eq("id", user["id"]).execute()
    return {"status": "success", "upi_id": upi}

app.include_router(api)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
