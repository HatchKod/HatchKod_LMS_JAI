from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import logging
from collections import defaultdict
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import requests
import httpx
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks, File, UploadFile
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from supabase import create_client

load_dotenv()

def iso(dt: datetime):
    return dt.isoformat()

def now_utc():
    return datetime.now(timezone.utc)

def get_single_or_none(query):
    try:
        res = query.execute()
        return res.data[0] if res.data else None
    except:
        return None



# -------------------- Config --------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
ACCESS_TOKEN_MIN = int(os.getenv("ACCESS_TOKEN_MIN", 60))

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# Production Endpoints
ONBOARDING_LAMBDA_URL = os.getenv("ONBOARDING_LAMBDA_URL", "https://9vsd5hlgu3.execute-api.ap-south-1.amazonaws.com/Dev/onboard_student")
PRODUCTION_DOMAIN = os.getenv("PRODUCTION_DOMAIN", "https://hatchkod.in")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="HatchKod LMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", PRODUCTION_DOMAIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hatchkod")


# -------------------- Helpers --------------------
def get_single_or_none(query):
    res = query.execute().data
    return res[0] if res else None

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
def award_xp(user_id: str, action_type: str):
    try:
        xp_map = {
            "lesson_completed": 20,
            "quiz_passed": 40,
            "project_approved": 150,
            "problem_solved": 50
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
        new_level = (new_total_xp // 100) + 1

        # Update user
        supabase.table("users").update({
            "total_xp": new_total_xp,
            "level": new_level,
            "current_streak": current_streak,
            "last_active_date": today.isoformat(),
            "updated_at": iso(now)
        }).eq("id", user_id).execute()

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


# -------------------- Schemas --------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: Literal["student", "mentor"] = "student"  # admin must be seeded


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminCourseIn(BaseModel):
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    course_type: Optional[str] = "live"
    flow_type: Optional[str] = "linear"
    category: Optional[str] = "Java"
    difficulty: Optional[str] = "beginner"

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


class LessonIn(BaseModel):
    title: Optional[str] = None
    sequence_order: Optional[int] = 0
    content_html: Optional[str] = None
    video_url: Optional[str] = None
    github_link: Optional[str] = None
    estimated_minutes: Optional[int] = 30
    is_published: Optional[bool] = False


class TaskIn(BaseModel):
    description: Optional[str] = None
    instructions: Optional[str] = None
    expected_output: Optional[str] = None
    difficulty: Optional[str] = "easy"


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
    lesson_id: Optional[str] = None
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


class LessonCompleteIn(BaseModel):
    time_spent_minutes: Optional[int] = 0


class LiveClassStatusIn(BaseModel):
    status: Literal["scheduled", "ongoing", "ended"]


class MeetingUrlIn(BaseModel):
    meeting_url: str


class AttendanceOverrideIn(BaseModel):
    status: Literal["present", "absent", "late"]
    override_reason: Optional[str] = None

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


# -------------------- Auth Endpoints --------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response, background_tasks: BackgroundTasks):
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
    modules = supabase.table("modules").select("id, lessons(id)").eq("course_id", course_id).execute().data
    has_lesson = any(len(m.get("lessons") or []) > 0 for m in modules)
    if not modules or not has_lesson:
        raise HTTPException(400, "Cannot publish: course has no modules or lessons.")
    
    supabase.table("courses").update({"is_published": True, "status": "published"}).eq("id", course_id).execute()
    return {"ok": True}

@api.post("/admin/courses/{course_id}/unpublish")
async def unpublish_course_admin(course_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("courses").update({"is_published": False, "status": "draft"}).eq("id", course_id).execute()
    return {"ok": True}

@api.delete("/admin/courses/{course_id}")
async def delete_course_admin(course_id: str, _: dict = Depends(require_roles("admin"))):
    course = get_single_or_none(supabase.table("courses").select("is_published").eq("id", course_id))
    if not course:
        raise HTTPException(404, "Course not found")
    if course.get("is_published"):
        raise HTTPException(400, "Unpublish the course before deleting.")

    # Cascading delete: tasks -> lessons -> modules -> courses
    modules = supabase.table("modules").select("id").eq("course_id", course_id).execute().data or []
    for m in modules:
        lessons = supabase.table("lessons").select("id").eq("module_id", m["id"]).execute().data or []
        for l in lessons:
            supabase.table("tasks").delete().eq("lesson_id", l["id"]).execute()
            supabase.table("lessons").delete().eq("id", l["id"]).execute()
        supabase.table("modules").delete().eq("id", m["id"]).execute()
    
    supabase.table("courses").delete().eq("id", course_id).execute()
    return {"ok": True}

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
    lessons = supabase.table("lessons").select("id").eq("module_id", module_id).execute().data
    if lessons:
        raise HTTPException(400, "Delete all lessons in this module first.")
    supabase.table("modules").delete().eq("id", module_id).execute()
    return {"ok": True}

@api.post("/admin/modules/reorder")
async def reorder_modules_admin(payload: ReorderModulesIn, _: dict = Depends(require_roles("admin"))):
    for i, mid in enumerate(payload.ordered_ids):
        supabase.table("modules").update({"sequence_order": i}).eq("id", mid).execute()
    return {"ok": True}

# --- Lesson Endpoints (Admin) ---

@api.post("/admin/modules/{module_id}/lessons")
async def create_lesson_admin(module_id: str, payload: LessonIn, _: dict = Depends(require_roles("admin"))):
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
    supabase.table("lessons").insert(doc).execute()
    return doc

@api.put("/admin/lessons/{lesson_id}")
async def update_lesson_admin(lesson_id: str, payload: LessonIn, _: dict = Depends(require_roles("admin"))):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if update_data:
        supabase.table("lessons").update(update_data).eq("id", lesson_id).execute()
    return {"ok": True}

@api.delete("/admin/lessons/{lesson_id}")
async def delete_lesson_admin(lesson_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("tasks").delete().eq("lesson_id", lesson_id).execute()
    supabase.table("lessons").delete().eq("id", lesson_id).execute()
    return {"ok": True}

@api.post("/admin/lessons/reorder")
async def reorder_lessons_admin(payload: ReorderModulesIn, _: dict = Depends(require_roles("admin"))):
    for i, lid in enumerate(payload.ordered_ids):
        supabase.table("lessons").update({"sequence_order": i}).eq("id", lid).execute()
    return {"ok": True}

@api.post("/admin/lessons/{lesson_id}/task")
async def upsert_task_admin(lesson_id: str, payload: TaskIn, _: dict = Depends(require_roles("admin"))):
    # Check if task exists
    existing = get_single_or_none(supabase.table("tasks").select("id").eq("lesson_id", lesson_id))
    doc = {
        "lesson_id": lesson_id,
        "description": payload.description,
        "instructions": payload.instructions,
        "expected_output": payload.expected_output,
        "difficulty": payload.difficulty,
        "created_at": iso(now_utc()) if not existing else None
    }
    if existing:
        doc.pop("created_at")
        supabase.table("tasks").update(doc).eq("id", existing["id"]).execute()
    else:
        doc["id"] = str(uuid.uuid4())
        supabase.table("tasks").insert(doc).execute()
    
    # Return full task
    return get_single_or_none(supabase.table("tasks").select("*").eq("lesson_id", lesson_id))

@api.get("/courses/{course_id}/full")
async def get_course_full(course_id: str, _: dict = Depends(require_roles("admin", "mentor"))):
    # Fetch course
    course = get_single_or_none(supabase.table("courses").select("*").eq("id", course_id))
    if not course:
        raise HTTPException(404, "Course not found")
        
    # Fetch modules with lessons in a nested query
    modules = supabase.table("modules")\
        .select("*, lessons(*)")\
        .eq("course_id", course_id)\
        .order("sequence_order")\
        .execute().data
        
    # Deduplicate modules by title
    unique_modules = []
    seen_titles = set()
    for m in modules:
        title = m.get("title", "").strip()
        if title not in seen_titles:
            seen_titles.add(title)
            unique_modules.append(m)
            
    # Sort lessons within each module by sequence_order
    for m in unique_modules:
        if m.get("lessons"):
            # Deduplicate lessons within module by title too
            unique_lessons = []
            seen_lesson_titles = set()
            for l in m["lessons"]:
                l_title = l.get("title", "").strip()
                if l_title not in seen_lesson_titles:
                    seen_lesson_titles.add(l_title)
                    unique_lessons.append(l)
            unique_lessons.sort(key=lambda l: l.get("sequence_order") or 0)
            m["lessons"] = unique_lessons
        else:
            m["lessons"] = []
            
    return {
        "course": course,
        "modules": unique_modules
    }


# -------------------- Modules --------------------



# -------------------- Lessons --------------------
@api.get("/modules/{module_id}/lessons")
async def get_module_lessons(module_id: str, _: dict = Depends(require_roles("admin", "mentor"))):
    lessons = supabase.table("lessons").select("*, tasks(id)").eq("module_id", module_id).order("sequence_order").execute().data
    for l in lessons:
        l["has_task"] = len(l.get("tasks") or []) > 0
    return lessons



@api.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    # Fetch lesson with basic context
    lesson_res = supabase.table("lessons").select("*, tasks(*), modules(*, courses(*))").eq("id", lesson_id).single().execute()
    if not lesson_res.data:
        raise HTTPException(404, "Lesson not found")
    lesson = lesson_res.data
    
    # Extract basic context
    module_raw = lesson.pop("modules") if lesson.get("modules") else {}
    course_raw = module_raw.pop("courses") if module_raw.get("courses") else {}
    course_id = module_raw.get("course_id")
    
    # Fetch FULL course structure for the sidebar syllabus
    course_data = {}
    if course_id:
        # Use our optimized get_course logic
        course_data = await get_course(course_id, user)
    else:
        course_data = course_raw # Fallback to basic course info

    task = lesson["tasks"][0] if lesson.get("tasks") else None
    
    # For student: check unlock and submission
    submission = None
    if user["role"] == "student":
        unlocked = await is_lesson_unlocked(user["id"], lesson_id)
        if not unlocked:
            raise HTTPException(status_code=403, detail="Lesson is locked. Complete previous tasks first.")
            
        if task:
            sub_res = supabase.table("submissions").select("*").eq("task_id", task["id"]).eq("student_id", user["id"]).order("submitted_at", desc=True).limit(1).execute()
            submission = sub_res.data[0] if sub_res.data else None

    # Navigation Context: Find prev/next lessons in the same course
    if not course_id:
        return {
            "lesson": lesson, "course": course_data, "module": module_raw,
            "task": task, "submission": submission,
            "prev_lesson": None, "next_lesson": None,
            "lesson_index": 0, "total_lessons": 1
        }

    ordered = await get_ordered_lessons(course_id)
    idx = next((i for i, l in enumerate(ordered) if l["id"] == lesson_id), -1)
    
    prev_lesson = ordered[idx - 1] if idx > 0 else None
    next_lesson = ordered[idx + 1] if idx < len(ordered) - 1 else None

    return {
        "lesson": lesson,
        "course": course_data,
        "module": module_raw,
        "task": task,
        "submission": submission,
        "prev_lesson": prev_lesson,
        "next_lesson": next_lesson,
        "lesson_index": idx + 1 if idx != -1 else 1,
        "total_lessons": len(ordered)
    }

# -------------------- Tasks --------------------
@api.post("/lessons/{lesson_id}/task")
async def upsert_task(lesson_id: str, payload: TaskIn, _: dict = Depends(require_roles("admin", "mentor"))):
    existing = supabase.table("tasks").select("id").eq("lesson_id", lesson_id).execute().data
    doc = {
        "lesson_id": lesson_id,
        "description": payload.description,
        "instructions": payload.instructions,
        "expected_output": payload.expected_output,
        "difficulty": payload.difficulty
    }
    if existing:
        res = supabase.table("tasks").update(doc).eq("lesson_id", lesson_id).execute().data
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = iso(now_utc())
        res = supabase.table("tasks").insert(doc).execute().data
    return res[0] if res else doc

@api.delete("/lessons/{lesson_id}/task")
async def delete_task(lesson_id: str, _: dict = Depends(require_roles("admin"))):
    supabase.table("tasks").delete().eq("lesson_id", lesson_id).execute()
    return {"ok": True}

# -------------------- Lock/Unlock helper --------------------
async def get_ordered_lessons(course_id: str) -> list:
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
        
    all_lessons_raw = supabase.table("lessons").select("*").in_("module_id", all_module_ids).order("sequence_order").execute().data
    
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


async def is_lesson_unlocked(student_id: str, lesson_id: str) -> bool:
    """Lesson N+1 unlocks only when Lesson N's task is approved."""
    lesson = get_single_or_none(supabase.table("lessons").select("*").eq("id", lesson_id))
    if not lesson:
        return False
    module = get_single_or_none(supabase.table("modules").select("*").eq("id", lesson["module_id"]))
    if not module:
        return False
    ordered = await get_ordered_lessons(module["course_id"])
    idx = next((i for i, l in enumerate(ordered) if l["id"] == lesson_id), -1)
    if idx <= 0:
        return True
    prev = ordered[idx - 1]
    
    # Check if previously completed in student_progress (covers both tasks and content)
    progress = get_single_or_none(supabase.table("student_progress").select("*").eq("student_id", student_id).eq("lesson_id", prev["id"]).eq("is_completed", True))
    if progress:
        return True

    # Fallback: check if previous lesson has a task. If it doesn't, it should be unlocked.
    # (Though it should have been caught by the progress check if they clicked 'Finish')
    prev_task = get_single_or_none(supabase.table("tasks").select("id").eq("lesson_id", prev["id"]))
    if not prev_task:
        return True
        
    return False


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


@api.post("/lessons/{lesson_id}/submit")
async def submit_task(lesson_id: str, payload: SubmissionIn, user: dict = Depends(require_roles("student"))):
    task = get_single_or_none(supabase.table("tasks").select("*").eq("lesson_id", lesson_id))
    if not task:
        raise HTTPException(404, "No task for this lesson")
    if not await is_lesson_unlocked(user["id"], lesson_id):
        raise HTTPException(403, "Lesson locked")
    if not (payload.submission_url or payload.submission_text):
        raise HTTPException(400, "Provide GitHub link or text")

    if payload.submission_url:
        github_regex = r"^https?://(www\.)?github\.com/[\w.-]+/[\w.-]+/?.*$"
        is_github = re.match(github_regex, payload.submission_url)
        is_storage = "/storage/v1/object/public/submissions/" in payload.submission_url
        
        if not (is_github or is_storage):
            raise HTTPException(400, "Invalid submission format. Provide a GitHub URL or upload a file.")

    # If a previous submission is in 'rework' or 'pending', overwrite it; else create new
    existing = supabase.table("submissions").select("*").eq("student_id", user["id"]).eq("lesson_id", lesson_id).order("submitted_at", desc=True).limit(1).execute().data
    if existing and existing[0].get("status") in ("rework", "pending"):
        supabase.table("submissions").update({
            "submission_url": payload.submission_url or "",
            "submission_text": payload.submission_text or "",
            "status": "pending",
            "feedback": "",
            "submitted_at": iso(now_utc()),
            "reviewed_at": None,
        }).eq("id", existing[0]["id"]).execute()
        return get_single_or_none(supabase.table("submissions").select("*").eq("id", existing[0]["id"]))

    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "task_id": task["id"],
        "lesson_id": lesson_id,
        "student_id": user["id"],
        "mentor_id": user.get("assigned_mentor_id"),
        "submission_url": payload.submission_url or "",
        "submission_text": payload.submission_text or "",
        "status": "pending",
        "feedback": "",
        "submitted_at": iso(now_utc()),
        "reviewed_at": None,
    }
    supabase.table("submissions").insert(doc).execute()
    return doc


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
    query = supabase.table("submissions").select("*").in_("status", ["pending", "rework"])
    if user["role"] == "mentor":
        # Show submissions from students assigned to this mentor + unassigned
        query = query.or_("mentor_id.eq." + user["id"] + ",mentor_id.is.null")
    subs = query.order("submitted_at", desc=True).execute().data
    if not subs:
        return subs
    # Batch-fetch students and lessons
    student_ids = list({s["student_id"] for s in subs})
    lesson_ids = list({s["lesson_id"] for s in subs})
    
    students = supabase.table("users").select("*").in_("id", student_ids).execute().data if student_ids else []
    student_map = {st["id"]: st for st in students}
    
    lessons = supabase.table("lessons").select("*").in_("id", lesson_ids).execute().data if lesson_ids else []
    lesson_map = {l["id"]: l for l in lessons}
    for s in subs:
        s["student"] = student_map.get(s["student_id"])
        s["lesson"] = lesson_map.get(s["lesson_id"])
    return subs


@api.get("/submissions/{submission_id}")
async def get_submission(submission_id: str, user: dict = Depends(get_current_user)):
    sub = get_single_or_none(supabase.table("submissions").select("*").eq("id", submission_id))
    if not sub:
        raise HTTPException(404, "Submission not found")
    if user["role"] == "student" and sub["student_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    sub["student"] = get_single_or_none(supabase.table("users").select("*").eq("id", sub["student_id"]))
    sub["lesson"] = get_single_or_none(supabase.table("lessons").select("*").eq("id", sub["lesson_id"]))
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
            "lesson_id": sub["lesson_id"],
            "is_completed": True,
            "completed_at": iso(now_utc()),
        }).execute()
        # Award XP for project approval - wrapped in try/except to prevent blocking main flow
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
    courses = supabase.table("courses").select("*").eq("is_published", True).execute().data
    result_courses = []
    next_lesson = None

    # Batch-fetch all student progress once
    progress_records = supabase.table("student_progress").select("*").eq("student_id", user["id"]).eq("is_completed", True).execute().data
    progress_set = {p["lesson_id"] for p in progress_records}

    # Batch-fetch all modules for all courses, then all lessons for those modules
    course_ids = [c["id"] for c in courses]
    all_modules_raw = supabase.table("modules").select("*").in_("course_id", course_ids).order("sequence_order").execute().data if course_ids else []
    
    # Deduplicate modules by title (per course)
    from collections import OrderedDict
    mods_by_title_per_course = {} # course_id -> OrderedDict(title -> module)
    all_module_ids_for_title = {} # title -> list of ids
    for m in all_modules_raw:
        cid = m["course_id"]
        title = m.get("title", "").strip()
        if cid not in mods_by_title_per_course:
            mods_by_title_per_course[cid] = OrderedDict()
        if title not in mods_by_title_per_course[cid]:
            mods_by_title_per_course[cid][title] = m
            all_module_ids_for_title[title] = [m["id"]]
        else:
            all_module_ids_for_title[title].append(m["id"])
            
    modules_by_course = {cid: list(mods.values()) for cid, mods in mods_by_title_per_course.items()}
    all_module_ids = [mid for ids in all_module_ids_for_title.values() for mid in ids]
    
    all_lessons_raw = supabase.table("lessons").select("*").in_("module_id", all_module_ids).order("sequence_order").execute().data if all_module_ids else []
    
    # Deduplicate lessons by title per canonical module
    title_to_canonical_id = {m.get("title","").strip(): m["id"] for mods in modules_by_course.values() for m in mods}
    id_to_title = {mid: title for title, ids in all_module_ids_for_title.items() for mid in ids}
    
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

    # Get mentor info
    mentor = None
    if user.get("assigned_mentor_id"):
        mentor = get_single_or_none(supabase.table("users").select("id, name, email").eq("id", user["assigned_mentor_id"]))

    for c in courses:
        c_modules = modules_by_course.get(c["id"], [])
        ordered = []
        for m in c_modules:
            ordered.extend(lessons_by_module.get(m["id"], []))
        total = len(ordered)
        completed = 0
        first_unfinished = None
        for l in ordered:
            if l["id"] in progress_set:
                completed += 1
            elif first_unfinished is None:
                first_unfinished = l
        progress = round((completed / total) * 100) if total else 0
        
        course_data = {
            "course": c,
            "progress": progress,
            "total_lessons": total,
            "completed_lessons": completed,
            "module_count": len(c_modules),
            "next_lesson": first_unfinished,
        }
        result_courses.append(course_data)

    # Smart Next Lesson Selection:
    # 1. Look for In-Progress courses (1-99%)
    in_progress_courses = [rc for rc in result_courses if 0 < rc["progress"] < 100]
    if in_progress_courses:
        # Sort by highest progress or just pick the first in-progress
        best = sorted(in_progress_courses, key=lambda x: x["progress"], reverse=True)[0]
        next_lesson = {"course": best["course"], "lesson": best["next_lesson"]}
    else:
        # 2. Fallback to Not Started courses (0%)
        not_started = [rc for rc in result_courses if rc["progress"] == 0 and rc["next_lesson"]]
        if not_started:
            next_lesson = {"course": not_started[0]["course"], "lesson": not_started[0]["next_lesson"]}

    pending = supabase.table("submissions").select("*").eq("student_id", user["id"]).in_("status", ["pending", "rework"]).execute().data
    if pending:
        p_lesson_ids = list({p["lesson_id"] for p in pending})
        p_lessons = supabase.table("lessons").select("*").in_("id", p_lesson_ids).execute().data
        p_lesson_map = {l["id"]: l for l in p_lessons}
        for p in pending:
            p["lesson"] = p_lesson_map.get(p["lesson_id"])

    # --- Robust Retroactive XP Sync ---
    sync_student_xp(user)

    # Get Global/Weekly Rank - Unified with Leaderboard logic
    rank = "N/A"
    try:
        # Find rank among all students with XP
        all_ranking = supabase.table("users")\
            .select("id")\
            .eq("role", "student")\
            .order("total_xp", desc=True)\
            .execute().data
        
        for i, s in enumerate(all_ranking or []):
            if s["id"] == user["id"]:
                rank = i + 1
                break
    except Exception as ge:
        logger.error(f"Ranking error in dashboard: {ge}")

    return {
        "courses": result_courses,
        "next_lesson": next_lesson,
        "pending_submissions": pending,
        "pending_count": len(pending),
        "mentor": mentor,
        "gamification": {
            "total_xp": user.get("total_xp", 0),
            "level": user.get("level", 1),
            "streak": user.get("current_streak", 0),
            "weekly_rank": rank
        }
    }


@api.get("/auth/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    # Fetch mentor if exists
    mentor = None
    if user.get("assigned_mentor_id"):
        mentor = get_single_or_none(supabase.table("users").select("id, name, email").eq("id", user["assigned_mentor_id"]))
    
    # Stats
    progress_count = supabase.table("student_progress").select("*", count="exact").eq("student_id", user["id"]).eq("is_completed", True).execute().count
    
    return {
        "user": user,
        "mentor": mentor,
        "stats": {
            "completed_lessons": progress_count
        }
    }


@api.get("/dashboard/mentor")
async def mentor_dashboard(user: dict = Depends(require_roles("mentor"))):
    pending = supabase.table("submissions").select("*", count="exact").or_("mentor_id.eq." + user["id"] + ",mentor_id.is.null").in_("status", ["pending", "rework"]).execute().count
    approved = supabase.table("submissions").select("*", count="exact").eq("mentor_id", user["id"]).eq("status", "approved").execute().count
    students = supabase.table("users").select("*", count="exact").eq("assigned_mentor_id", user["id"]).execute().count
    return {"pending_reviews": pending, "approved_total": approved, "students_assigned": students}


@api.get("/dashboard/admin")
async def admin_dashboard(_: dict = Depends(require_roles("admin"))):
    return {
        "courses": supabase.table("courses").select("*", count="exact").execute().count,
        "modules": supabase.table("modules").select("*", count="exact").execute().count,
        "lessons": supabase.table("lessons").select("*", count="exact").execute().count,
        "students": supabase.table("users").select("*", count="exact").eq("role", "student").eq("is_active", True).execute().count,
        "mentors": supabase.table("users").select("*", count="exact").eq("role", "mentor").eq("is_active", True).execute().count,
        "pending_submissions": supabase.table("submissions").select("*", count="exact").in_("status", ["pending", "rework"]).execute().count,
        "approved_submissions": supabase.table("submissions").select("*", count="exact").eq("status", "approved").execute().count,
    }


class ExecuteIn(BaseModel):
    code: str
    stdin: str = ""


@app.post("/api/execute")
async def execute_code(payload: ExecuteIn):
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    async with httpx.AsyncClient() as client:
        try:
            # Switch to Judge0 Public CE Instance
            res = await client.post("https://ce.judge0.com/submissions?wait=true", json={
                "source_code": payload.code,
                "language_id": 62, # Java (OpenJDK 13)
                "stdin": payload.stdin
            }, timeout=30.0)
            
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


@api.get("/batches/{batch_id}/lessons")
async def get_batch_lessons(batch_id: str, user: dict = Depends(require_roles("mentor"))):
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
    module_titles = {m["id"]: m["title"] for m in modules}
    module_order = {m["id"]: m["sequence_order"] for m in modules}
    
    # c. Fetch all lessons for those module_ids
    lessons = supabase.table("lessons")\
        .select("id, title, sequence_order, module_id")\
        .in_("module_id", module_ids)\
        .execute().data
        
    # d. Attach module_title and return
    res = []
    for l in lessons:
        l["module_title"] = module_titles.get(l["module_id"])
        res.append(l)
        
    # Ordered by module sequence_order ASC, then lesson sequence_order ASC
    res.sort(key=lambda x: (module_order.get(x["module_id"], 0), x.get("sequence_order", 0)))
    
    return res


@api.get("/live-classes")
async def list_live_classes(user: dict = Depends(require_roles("mentor"))):
    res = supabase.table("class_sessions")\
        .select("*, batches(name, courses(title)), lessons(title), recordings(url)")\
        .eq("mentor_id", user["id"])\
        .order("scheduled_at", desc=True)\
        .execute().data
    
    flattened = []
    for row in res:
        batch_info = row.pop("batches", {}) or {}
        lesson_info = row.pop("lessons", {}) or {}
        course_info = batch_info.get("courses", {}) or {}
        recs = row.pop("recordings", []) or []
        
        row["batch_name"] = batch_info.get("name")
        row["course_title"] = course_info.get("title")
        row["topic_title"] = lesson_info.get("title")
        row["recording_url"] = recs[0]["url"] if recs else None
        flattened.append(row)
    return flattened


@api.post("/live-classes")
async def create_live_class(payload: ScheduleSessionIn, user: dict = Depends(require_roles("mentor", "admin"))):
    try:
        if payload.meeting_url and not payload.meeting_url.startswith("https://"):
            raise HTTPException(status_code=400, detail="Meeting URL must start with https://")
            
        doc = {
            "id": str(uuid.uuid4()),
            "batch_id": payload.batch_id,
            "lesson_id": payload.lesson_id or None,
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

    # 2. Delete
    try:
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
    # Guard: check for live class sessions
    live_sessions = supabase.table("class_sessions")\
        .select("id")\
        .eq("batch_id", batch_id)\
        .eq("status", "live")\
        .execute().data
        
    if live_sessions:
        raise HTTPException(400, "Cannot delete a batch with a live class.")
        
    # Delete in order: batch_students, then batches
    supabase.table("batch_students").delete().eq("batch_id", batch_id).execute()
    supabase.table("batches").delete().eq("id", batch_id).execute()
    
    return {"ok": True}


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

    client_id = os.getenv("JDOODLE_CLIENT_ID")
    client_secret = os.getenv("JDOODLE_CLIENT_SECRET")
    
    results = []
    all_passed = True
    overall_status = "accepted"

    async with httpx.AsyncClient() as client:
        # Map frontend language names to Judge0 language IDs
        lang_map = {
            "java": 62,
            "python": 71,
            "javascript": 63,
            "cpp": 54
        }
        judge0_lang_id = lang_map.get(payload.language.lower(), 62)

        for tc in test_cases:
            try:
                # Use Judge0 API for test case execution
                res = await client.post("https://ce.judge0.com/submissions?wait=true", json={
                    "source_code": payload.code,
                    "language_id": judge0_lang_id,
                    "stdin": tc["input"]
                }, timeout=float(problem["time_limit_seconds"]) + 5.0)
                
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
        progress_records = supabase.table("student_progress").select("lesson_id").eq("student_id", user["id"]).eq("is_completed", True).execute().data
        progress_set = {p["lesson_id"] for p in progress_records}
        
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
    # Trigger sync here too so ranking is always proper
    if user["role"] == "student":
        sync_student_xp(user)
    
    try:
        today = now_utc().date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        
        # Fetch all students with XP from the users table for a full leaderboard
        # (This ensures all 5-6 students show up even if they haven't synced their weekly record yet)
        all_students = supabase.table("users")\
            .select("id, name, total_xp, role")\
            .eq("role", "student")\
            .gt("total_xp", 0)\
            .order("total_xp", desc=True)\
            .limit(20)\
            .execute().data
        
        # Format results
        leaderboard = []
        user_rank = "N/A"
        
        for i, student in enumerate(all_students):
            is_me = student["id"] == user["id"]
            leaderboard.append({
                "rank": i + 1,
                "name": student["name"] or "Unknown Student",
                "xp": student["total_xp"],
                "is_me": is_me
            })
            if is_me:
                user_rank = i + 1
        
        # If current user is not in top 20, find their specific rank
        if user_rank == "N/A" and user["role"] == "student":
            all_ranking = supabase.table("users").select("id").eq("role", "student").order("total_xp", desc=True).execute().data
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
        lesson = get_single_or_none(supabase.table("lessons").select("title").eq("id", session_data["lesson_id"]))
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
    
    # 2. Insert into recordings
    try:
        supabase.table("recordings").insert({
            "class_session_id": session_id,
            "lesson_id": session.get("lesson_id"),
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


@api.post("/sessions/{session_id}/join")
async def join_session(session_id: str, user: dict = Depends(require_roles("student"))):
    session = get_single_or_none(supabase.table("class_sessions").select("*").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
    
    if session["status"] != "live":
        raise HTTPException(status_code=400, detail="Class is not live.")
    
    now = now_utc()
    started_at_str = session["started_at"]
    if 'Z' in started_at_str:
        started_at = datetime.fromisoformat(started_at_str.replace('Z', '+00:00'))
    else:
        started_at = datetime.fromisoformat(started_at_str)

    is_late = now > (started_at + timedelta(minutes=10))
    
    attendance_doc = {
        "class_session_id": session_id,
        "student_id": user["id"],
        "status": "present",
        "joined_at": iso(now),
        "is_late": is_late
    }
    
    supabase.table("attendance").upsert(attendance_doc, on_conflict="class_session_id,student_id").execute()
    
    return {"meeting_url": session["meeting_url"], "is_late": is_late}


# -------------------- Attendance --------------------

@api.get("/sessions/{session_id}/attendance")
async def get_session_attendance(session_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    # 1. Get session info to find the batch_id
    session = get_single_or_none(supabase.table("class_sessions").select("batch_id").eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    batch_id = session["batch_id"]
    
    # 2. Get existing attendance records
    existing_res = supabase.table("attendance")\
        .select("*, users(name)")\
        .eq("class_session_id", session_id)\
        .execute().data
        
    # 3. Get all active students in the batch
    students = supabase.table("users")\
        .select("id, name")\
        .eq("batch_id", batch_id)\
        .eq("role", "student")\
        .eq("is_active", True)\
        .execute().data
        
    # 4. Merge: ensure every student has a record (default to 'absent' if missing)
    attendance_map = {r["student_id"]: r for r in existing_res}
    
    final_records = []
    for s in students:
        if s["id"] in attendance_map:
            record = attendance_map[s["id"]]
            user_info = record.pop("users", {}) or {}
            record["student_name"] = user_info.get("name")
            record["avatar_url"] = None
            final_records.append(record)
        else:
            # Create a virtual 'absent' record
            final_records.append({
                "student_id": s["id"],
                "student_name": s["name"],
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
    
    # 2. Get total lessons in course
    lessons = supabase.table("lessons").select("id").eq("is_published", True).execute().data or []
    # Actually we only want lessons in this specific course
    lessons = [l for l in lessons if l.get("course_id") == course_id] # Simple filter if relation is flat
    # Wait, better query:
    lessons_res = supabase.table("lessons").select("id, module_id(course_id)").execute().data or []
    course_lesson_ids = [l["id"] for l in lessons_res if l.get("module_id", {}).get("course_id") == course_id]
    total_lessons_count = len(course_lesson_ids)

    # 3. Get all students in this batch OR assigned to this mentor
    students = supabase.table("users").select("id, name, email")\
        .eq("role", "student")\
        .or_(f"batch_id.eq.{batch_id},assigned_mentor_id.eq.{user['id']}")\
        .execute().data or []
    if not students: return []
    student_ids = [s["id"] for s in students]

    # 4. Get completion data for all students in bulk
    progress_records = supabase.table("student_progress").select("student_id, lesson_id").in_("student_id", student_ids).eq("is_completed", True).execute().data or []
    lc_records = supabase.table("lesson_completions").select("student_id, lesson_id, time_spent_minutes").in_("student_id", student_ids).execute().data or []
    
    # Filter only relevant lessons
    progress_records = [r for r in progress_records if r["lesson_id"] in course_lesson_ids]
    lc_records = [r for r in lc_records if r["lesson_id"] in course_lesson_ids]

    # 5. Build summary
    summary = []
    for s in students:
        s_id = s["id"]
        # Count unique completed lessons
        completed_set = {r["lesson_id"] for r in progress_records if r["student_id"] == s_id}
        completed_set.update({r["lesson_id"] for r in lc_records if r["student_id"] == s_id})
        
        done = len(completed_set)
        pct = round((done / total_lessons_count * 100)) if total_lessons_count > 0 else 0
        
        # Calculate time spent
        time_spent = sum(r.get("time_spent_minutes", 0) or 0 for r in lc_records if r["student_id"] == s_id)
        
        summary.append({
            "student_id": s_id,
            "student_name": s["name"],
            "completed_lessons": done,
            "total_lessons": total_lessons_count,
            "overall_percentage": pct,
            "total_time_spent_minutes": time_spent
        })

    return summary


@api.get("/batches/{batch_id}/attendance-summary")
async def get_batch_attendance_summary(batch_id: str, user: dict = Depends(require_roles("mentor", "admin"))):
    try:
        # 1. Get all session IDs for this batch
        sessions = supabase.table("class_sessions").select("id").eq("batch_id", batch_id).execute().data
        if not sessions: return []
        session_ids = [s["id"] for s in sessions]

        # 2. Get attendance records for these sessions
        rows = supabase.table("attendance").select("student_id, status").in_("class_session_id", session_ids).execute().data
        if not rows: return []
        
        # 3. Aggregate statistics
        summary = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "total": 0})
        unique_student_ids = set()
        for row in rows:
            sid = row["student_id"]
            if not sid: continue
            unique_student_ids.add(sid)
            status = row["status"]
            if status in summary[sid]:
                summary[sid][status] += 1
            summary[sid]["total"] += 1

        # 4. Fetch student profile info separately (avoiding problematic join)
        student_info = {}
        if unique_student_ids:
            # SCHEMA DISCOVERY: Fetch one user to see all keys
            all_users = supabase.table("users").select("*").limit(1).execute().data
            if all_users:
                available_keys = list(all_users[0].keys())
                logger.info(f"Available user keys: {available_keys}")
                # Try to guess the avatar column
                avatar_key = next((k for k in ["avatar_url", "profile_picture_url", "avatar", "image", "photo"] if k in available_keys), None)
                
                # Fetch actual data
                select_fields = f"id, name, {avatar_key}" if avatar_key else "id, name"
                user_rows = supabase.table("users").select(select_fields).in_("id", list(unique_student_ids)).execute().data
                for u in user_rows:
                    student_info[u["id"]] = {
                        "name": u.get("name") or "Unknown Student",
                        "avatar_url": u.get(avatar_key) if avatar_key else None
                    }
            else:
                # Fallback if no users found (shouldn't happen here)
                for sid in unique_student_ids:
                    student_info[sid] = {"name": "Unknown Student", "avatar_url": None}
                
        # 5. Build final result
        result = []
        for sid, counts in summary.items():
            total = counts["total"]
            present = counts["present"] + counts["late"]
            pct = round((present / total * 100), 1) if total > 0 else 0
            info = student_info.get(sid, {"name": "Unknown Student", "avatar_url": None})
            result.append({
                "student_id": sid,
                "student_name": info["name"],
                "avatar_url": info["avatar_url"],
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


@api.get("/students/{student_id}/progress")
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
    modules = supabase.table("modules").select("*, lessons(*)").eq("course_id", course["id"]).order("sequence_order").execute().data or []
    
    # 5. Get Student Data
    progress_res = supabase.table("student_progress").select("lesson_id").eq("student_id", student_id).eq("is_completed", True).execute().data or []
    progress_set = {p["lesson_id"] for p in progress_res}
    
    sub_res = supabase.table("submissions").select("task_id, status").eq("student_id", student_id).eq("status", "approved").execute().data or []
    approved_tasks = {s["task_id"] for s in sub_res}
    
    lc_res = supabase.table("lesson_completions").select("lesson_id, time_spent_minutes, completed_at").eq("student_id", student_id).execute().data or []
    lc_map = {lc["lesson_id"]: lc for lc in lc_res}

    # 6. Build Result
    res_modules = []
    total_lessons = 0
    completed_lessons = 0
    total_time = 0

    for m in modules:
        m_lessons = []
        m_done = 0
        m_total = 0
        
        # Sort lessons by order
        lessons = sorted(m.get("lessons") or [], key=lambda l: l.get("sequence_order") or 0)
        
        for l in lessons:
            # A lesson is completed if it has an approved task OR it's a content-only lesson marked as done
            has_task = supabase.table("tasks").select("id").eq("lesson_id", l["id"]).limit(1).execute().data
            
            is_done = False
            comp_at = None
            time_spent = 0
            
            if has_task:
                task_id = has_task[0]["id"]
                is_done = task_id in approved_tasks
            else:
                is_done = l["id"] in progress_set or l["id"] in lc_map
            
            if l["id"] in lc_map:
                comp_at = lc_map[l["id"]]["completed_at"]
                time_spent = lc_map[l["id"]]["time_spent_minutes"] or 0

            m_lessons.append({
                "id": l["id"],
                "title": l["title"],
                "is_completed": is_done,
                "completed_at": comp_at,
                "time_spent_minutes": time_spent
            })
            
            m_total += 1
            if is_done: m_done += 1
            total_time += time_spent

        res_modules.append({
            "id": m["id"],
            "title": m["title"],
            "lessons": m_lessons,
            "total_lessons": m_total,
            "completed_lessons": m_done,
            "completion_percentage": round(m_done / m_total * 100) if m_total > 0 else 0
        })
        
        total_lessons += m_total
        completed_lessons += m_done

    # 7. Find next incomplete lesson
    current_lesson = None
    for m in res_modules:
        for l in m["lessons"]:
            if not l["is_completed"]:
                current_lesson = {
                    "lesson_id": l["id"],
                    "lesson_title": l["title"],
                    "module_title": m["title"]
                }
                break
        if current_lesson: break

    return {
        "course_title": course["title"],
        "batch_name": batch["name"],
        "overall_percentage": round(completed_lessons / total_lessons * 100) if total_lessons > 0 else 0,
        "total_lessons": total_lessons,
        "completed_lessons": completed_lessons,
        "total_time_spent_minutes": total_time,
        "modules": res_modules,
        "current_lesson": current_lesson
    }


@api.get("/students/{student_id}/attendance")
async def get_student_attendance(student_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student" and student_id != user["id"]:
        raise HTTPException(403, "Cannot view another student's attendance.")
        
    res = supabase.table("attendance")\
        .select("*, class_sessions!inner(scheduled_at, status, batch_id, lessons(title), batches(name))")\
        .eq("student_id", student_id)\
        .order("class_sessions.scheduled_at", desc=True)\
        .execute().data
        
    flattened = []
    present_count = 0
    late_count = 0
    absent_count = 0
    
    for row in res:
        session_info = row.pop("class_sessions", {}) or {}
        lesson_info = session_info.get("lessons", {}) or {}
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
      .select("id, status, meeting_url, started_at, scheduled_at, batch_id, lesson_id, batches(name, course_id, courses(title)), lessons(title)")
      .eq("id", session_id))
    if not session:
        raise HTTPException(404, "Session not found")
        
    batch_info = session.pop("batches", {}) or {}
    course_info = batch_info.pop("courses", {}) or {}
    lesson_info = session.pop("lessons", {}) or {}
    
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
        doc["lesson_id"] = session["lesson_id"]
        doc["uploaded_by"] = user["id"]
        res = supabase.table("recordings").insert(doc).execute()
        
    recording = res.data[0] if res.data else None

    # --- AUTO-NOTIFY ---
    if recording:
        try:
            lesson = get_single_or_none(supabase.table("lessons").select("title").eq("id", session["lesson_id"]))
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
        .select("*, class_sessions(scheduled_at, status, lessons(title, modules(title)))")\
        .in_("class_session_id", session_ids)\
        .order("uploaded_at", desc=True)\
        .execute().data
        
    flattened = []
    for row in res:
        session_info = row.pop("class_sessions", {}) or {}
        lesson_info = session_info.get("lessons", {}) or {}
        module_info = lesson_info.get("modules", {}) or {}
        row["scheduled_at"] = session_info.get("scheduled_at")
        row["lesson_title"] = lesson_info.get("title")
        row["module_title"] = module_info.get("title")
        flattened.append(row)
        
    return flattened


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
        .select("*, class_sessions(scheduled_at, status, lessons(title, modules(title)))")\
        .in_("class_session_id", session_ids)\
        .order("uploaded_at", desc=True)\
        .execute().data

    # Step 3: attach batch_name from lookup during flattening
    flattened = []
    for row in res:
        session_info = row.pop("class_sessions", {}) or {}
        lesson_info = session_info.get("lessons", {}) or {}
        module_info = lesson_info.get("modules", {}) or {}
        row["batch_name"] = batch_name_map.get(row.get("class_session_id"))
        row["scheduled_at"] = session_info.get("scheduled_at")
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
    res = supabase.table("notifications")\
        .select("id", count="exact")\
        .eq("user_id", user["id"])\
        .eq("is_read", False)\
        .execute()
    return {"count": res.count}


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
            
    # Join with batches (to get course info) and lessons (to get topic title)
    res = supabase.table("class_sessions")\
        .select("*, batches(name, courses(title)), lessons(title)")\
        .eq("batch_id", batch_id)\
        .order("scheduled_at", desc=True)\
        .execute().data
    
    # Flatten the results for the frontend
    flattened = []
    for s in res:
        batch_info = s.pop("batches", {}) or {}
        lesson_info = s.pop("lessons", {}) or {}
        course_info = batch_info.get("courses", {}) or {}
        
        s["batch_name"] = batch_info.get("name")
        s["course_title"] = course_info.get("title")
        s["topic_title"] = lesson_info.get("title")
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



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # using token in header from FE; cookies also set but FE sends Authorization
    allow_methods=["*"],
    allow_headers=["*"],
)


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
            for l_idx, l in enumerate(m["lessons"]):
                lid = str(uuid.uuid4())
                supabase.table("lessons").insert({
                    "id": lid,
                    "module_id": mid,
                    "title": l["title"],
                    "video_url": "https://www.youtube.com/embed/eIrMbAQSU34",
                    "content": l["content"],
                    "sequence_order": l_idx,
                    "created_at": iso(now_utc()),
                }).execute()
                tid = str(uuid.uuid4())
                supabase.table("tasks").insert({
                    "id": tid,
                    "lesson_id": lid,
                    "description": l["task"]["description"],
                    "instructions": l["task"]["instructions"],
                    "expected_output": l["task"]["expected_output"],
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
async def get_courses(user: dict = Depends(get_current_user)):
    q = supabase.table("courses").select("*, users(name)").order("created_at", desc=True)
    if user["role"] == "student":
        q = q.eq("is_published", True)
    
    res = q.execute()
    courses = res.data if res else []
    for c in courses:
        c["created_by_name"] = c.get("users", {}).get("name") if c.get("users") else None
    return courses

@api.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    course_res = supabase.table("courses").select("*, users(name)").eq("id", course_id).single().execute()
    if not course_res.data:
        raise HTTPException(404, "Course not found")
    course = course_res.data
    
    # Bulk fetch modules and lessons
    modules = supabase.table("modules")\
        .select("*, lessons(*, tasks(*))")\
        .eq("course_id", course_id)\
        .order("sequence_order")\
        .execute().data or []
    
    if user["role"] == "student":
        # Bulk fetch all relevant student data for this user
        progress_res = supabase.table("student_progress").select("*").eq("student_id", user["id"]).eq("is_completed", True).execute().data or []
        progress_set = {p["lesson_id"] for p in progress_res}
        
        sub_res = supabase.table("submissions").select("*").eq("student_id", user["id"]).execute().data or []
        # Get latest submission per task
        sub_map = {}
        for s in sorted(sub_res, key=lambda x: x.get("submitted_at") or x.get("created_at") or ""):
            sub_map[s["task_id"]] = s
            
        lc_res = supabase.table("lesson_completions").select("lesson_id").eq("student_id", user["id"]).execute().data or []
        lc_set = {lc["lesson_id"] for lc in lc_res}

        # Filter out unpublished lessons for students
        for m in modules:
            m["lessons"] = [l for l in m["lessons"] if l.get("is_published", True)]

        # Flatten lessons for sequential unlock logic
        ordered_lessons = []
        for m in modules:
            m["lessons"].sort(key=lambda l: l.get("sequence_order") or 0)
            ordered_lessons.extend(m["lessons"])

        # Calculate states in-memory
        for i, l in enumerate(ordered_lessons):
            l["task"] = l["tasks"][0] if l.get("tasks") else None
            
            # 1. Completion State
            if l["task"]:
                submission = sub_map.get(l["task"]["id"])
                l["submission"] = submission
                l["completed"] = (submission and submission["status"] == "approved")
            else:
                l["submission"] = None
                l["completed"] = (l["id"] in progress_set or l["id"] in lc_set)

            # 2. Unlock State (Sequential)
            if i == 0:
                l["unlocked"] = True
            else:
                prev = ordered_lessons[i-1]
                # A lesson is unlocked IF:
                # - The previous lesson is NOT mandatory
                # - OR the previous lesson is completed
                # - OR the previous lesson has no task (and isn't explicitly marked mandatory)
                is_prev_mandatory = prev.get("is_mandatory", True)
                l["unlocked"] = (not is_prev_mandatory) or prev.get("completed", False) or (prev["id"] in progress_set) or (not prev.get("tasks"))

    else:
        # Admins/Mentors see everything
        for m in modules:
            m["lessons"].sort(key=lambda l: l.get("sequence_order") or 0)
            for l in m["lessons"]:
                l["task"] = l["tasks"][0] if l.get("tasks") else None
                l["unlocked"] = True
                l["completed"] = False
                l["submission"] = None

    course["modules"] = modules
    return course


app.include_router(api)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
