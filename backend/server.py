from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import logging
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


# -------------------- Config --------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
ACCESS_TOKEN_MIN = int(os.getenv("ACCESS_TOKEN_MIN", 60))

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="HatchKod LMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify origins like ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")

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
    url = "https://9vsd5hlgu3.execute-api.ap-south-1.amazonaws.com/Dev/onboard_student"
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


class CourseIn(BaseModel):
    title: str
    description: str = ""
    thumbnail_url: Optional[str] = None
    status: Literal["draft", "published"] = "published"


class ModuleIn(BaseModel):
    title: str
    sequence_order: int = 0


class LessonIn(BaseModel):
    title: str
    video_url: Optional[str] = None
    content: str = ""
    sequence_order: int = 0


class TaskIn(BaseModel):
    description: str
    instructions: str = ""
    expected_output: str = ""


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
@api.get("/courses")
async def list_courses(_: dict = Depends(get_current_user)):
    courses = supabase.table("courses").select("*").order("created_at").execute().data
    return courses


@api.post("/courses")
async def create_course(payload: CourseIn, _: dict = Depends(require_roles("admin"))):
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "title": payload.title,
        "description": payload.description,
        "thumbnail_url": payload.thumbnail_url,
        "status": payload.status,
        "created_at": iso(now_utc()),
    }
    supabase.table("courses").insert(doc).execute()
    return doc


@api.put("/courses/{course_id}/status")
async def update_course_status(course_id: str, payload: CourseStatusIn, _: dict = Depends(require_roles("admin"))):
    supabase.table("courses").update({"status": payload.status}).eq("id", course_id).execute()
    return {"ok": True}


@api.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    course = get_single_or_none(supabase.table("courses").select("*").eq("id", course_id))
    if not course:
        raise HTTPException(404, "Course not found")
    modules = supabase.table("modules").select("*").eq("course_id", course_id).order("sequence_order").execute().data
    module_ids = [m["id"] for m in modules]

    # Batch-fetch all lessons for all modules in one query
    if module_ids:
        all_lessons = supabase.table("lessons").select("*").in_("module_id", module_ids).order("sequence_order").execute().data
    else:
        all_lessons = []
    lesson_ids = [l["id"] for l in all_lessons]
    lessons_by_module = {}
    for l in all_lessons:
        lessons_by_module.setdefault(l["module_id"], []).append(l)

    # Batch-fetch tasks for all lessons
    if lesson_ids:
        tasks_list = supabase.table("tasks").select("*").in_("lesson_id", lesson_ids).execute().data
    else:
        tasks_list = []
    task_by_lesson = {t["lesson_id"]: t for t in tasks_list}

    progress_by_lesson = {}
    sub_by_lesson = {}
    if user["role"] == "student" and lesson_ids:
        # Batch-fetch student progress
        prog_list = supabase.table("student_progress").select("*").eq("student_id", user["id"]).in_("lesson_id", lesson_ids).eq("is_completed", True).execute().data
        progress_by_lesson = {p["lesson_id"]: True for p in prog_list}

        # Batch-fetch latest submission per lesson
        subs_list = supabase.table("submissions").select("*").eq("student_id", user["id"]).in_("lesson_id", lesson_ids).order("submitted_at", desc=True).execute().data
        for s in subs_list:
            sub_by_lesson.setdefault(s["lesson_id"], s)  # first is latest due to sort desc

    # Compute unlocked status using ordered lessons (no extra queries)
    ordered_all = []
    for m in modules:
        ordered_all.extend(lessons_by_module.get(m["id"], []))

    unlocked_map = {}
    if user["role"] == "student":
        prev_unlocked = True
        for l in ordered_all:
            if prev_unlocked and (
                # first lesson always unlocked OR previous was approved OR previous had no task
                len(unlocked_map) == 0
                or True
            ):
                pass
        # simple sequential scan
        prev_approved_or_no_task = True
        for idx, l in enumerate(ordered_all):
            if idx == 0:
                unlocked_map[l["id"]] = True
            else:
                prev = ordered_all[idx - 1]
                prev_task = task_by_lesson.get(prev["id"])
                prev_sub = sub_by_lesson.get(prev["id"])
                unlocked_map[l["id"]] = (not prev_task) or (prev_sub is not None and prev_sub.get("status") == "approved")

    for m in modules:
        ls = lessons_by_module.get(m["id"], [])
        for l in ls:
            l["task"] = task_by_lesson.get(l["id"])
            if user["role"] == "student":
                l["unlocked"] = unlocked_map.get(l["id"], False)
                l["completed"] = bool(progress_by_lesson.get(l["id"]))
                l["submission"] = sub_by_lesson.get(l["id"])
            else:
                l["unlocked"] = True
                l["completed"] = False
                l["submission"] = None
        m["lessons"] = ls
    course["modules"] = modules
    return course


@api.delete("/courses/{course_id}")
async def delete_course(course_id: str, _: dict = Depends(require_roles("admin"))):
    # Get modules to find lessons
    mods = supabase.table("modules").select("id").eq("course_id", course_id).execute().data
    mod_ids = [m["id"] for m in mods]
    
    if mod_ids:
        # Get lessons to find tasks/subs
        lessons = supabase.table("lessons").select("id").in_("module_id", mod_ids).execute().data
        lesson_ids = [l["id"] for l in lessons]
        
        if lesson_ids:
            # Delete lesson dependencies in correct FK order
            # 1. Submissions (depends on tasks and lessons)
            supabase.table("submissions").delete().in_("lesson_id", lesson_ids).execute()
            # 2. Tasks (depends on lessons)
            supabase.table("tasks").delete().in_("lesson_id", lesson_ids).execute()
            # 3. Student Progress (depends on lessons)
            supabase.table("student_progress").delete().in_("lesson_id", lesson_ids).execute()
            # 4. Lessons
            supabase.table("lessons").delete().in_("module_id", mod_ids).execute()
        
        # 5. Modules
        supabase.table("modules").delete().eq("course_id", course_id).execute()

    # 6. Course
    supabase.table("courses").delete().eq("id", course_id).execute()
    return {"ok": True}


# -------------------- Modules --------------------
@api.post("/courses/{course_id}/modules")
async def create_module(course_id: str, payload: ModuleIn, _: dict = Depends(require_roles("admin"))):
    existing = supabase.table("courses").select("id").eq("id", course_id).execute()
    if not existing.data:
        raise HTTPException(404, "Course not found")
    mid = str(uuid.uuid4())
    doc = {
        "id": mid,
        "course_id": course_id,
        "title": payload.title,
        "sequence_order": payload.sequence_order,
        "created_at": iso(now_utc()),
    }
    supabase.table("modules").insert(doc).execute()
    return doc


@api.delete("/modules/{module_id}")
async def delete_module(module_id: str, _: dict = Depends(require_roles("admin"))):
    lessons = supabase.table("lessons").select("id").eq("module_id", module_id).execute().data
    lesson_ids = [l["id"] for l in lessons]
    
    if lesson_ids:
        # Delete in correct FK order
        supabase.table("submissions").delete().in_("lesson_id", lesson_ids).execute()
        supabase.table("tasks").delete().in_("lesson_id", lesson_ids).execute()
        supabase.table("student_progress").delete().in_("lesson_id", lesson_ids).execute()
        supabase.table("lessons").delete().eq("module_id", module_id).execute()
        
    supabase.table("modules").delete().eq("id", module_id).execute()
    return {"ok": True}


# -------------------- Lessons --------------------
@api.post("/modules/{module_id}/lessons")
async def create_lesson(module_id: str, payload: LessonIn, _: dict = Depends(require_roles("admin"))):
    existing = supabase.table("modules").select("id").eq("id", module_id).execute()
    if not existing.data:
        raise HTTPException(404, "Module not found")
    lid = str(uuid.uuid4())
    doc = {
        "id": lid,
        "module_id": module_id,
        "title": payload.title,
        "video_url": payload.video_url,
        "content": payload.content,
        "sequence_order": payload.sequence_order,
        "created_at": iso(now_utc()),
    }
    supabase.table("lessons").insert(doc).execute()
    return doc


@api.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, _: dict = Depends(require_roles("admin"))):
    # Delete in correct FK order
    supabase.table("submissions").delete().eq("lesson_id", lesson_id).execute()
    supabase.table("tasks").delete().eq("lesson_id", lesson_id).execute()
    supabase.table("student_progress").delete().eq("lesson_id", lesson_id).execute()
    supabase.table("lessons").delete().eq("id", lesson_id).execute()
    return {"ok": True}


@api.patch("/lessons/{lesson_id}")
async def update_lesson(lesson_id: str, payload: LessonIn, _: dict = Depends(require_roles("admin"))):
    update_data = {
        "title": payload.title,
        "video_url": payload.video_url,
        "content": payload.content,
    }
    supabase.table("lessons").update(update_data).eq("id", lesson_id).execute()
    return {"ok": True}


@api.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    lesson = get_single_or_none(supabase.table("lessons").select("*").eq("id", lesson_id))
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    module = get_single_or_none(supabase.table("modules").select("*").eq("id", lesson["module_id"]))
    course = get_single_or_none(supabase.table("courses").select("*").eq("id", module["course_id"])) if module else None
    task = get_single_or_none(supabase.table("tasks").select("*").eq("lesson_id", lesson_id))

    if user["role"] == "student":
        unlocked = await is_lesson_unlocked(user["id"], lesson_id)
        if not unlocked:
            raise HTTPException(status_code=403, detail="Lesson is locked. Complete previous tasks first.")
        sub = supabase.table("submissions").select("*").eq("student_id", user["id"]).eq("lesson_id", lesson_id).order("submitted_at", desc=True).limit(1).execute().data
        sub = sub[0] if sub else None
    else:
        sub = None

    # Get full course structure for navigator
    course_data = await get_course(course["id"], user)
    
    # Navigation and index
    ordered = await get_ordered_lessons(course["id"])
    idx = next((i for i, l in enumerate(ordered) if l["id"] == lesson_id), -1)
    
    prev_lesson = ordered[idx - 1] if idx > 0 else None
    next_lesson = ordered[idx + 1] if idx < len(ordered) - 1 else None
    
    return {
        "lesson": lesson, 
        "module": module, 
        "course": course_data, 
        "task": task, 
        "submission": sub,
        "prev_lesson": prev_lesson,
        "next_lesson": next_lesson,
        "lesson_index": idx + 1,
        "total_lessons": len(ordered)
    }


@api.post("/lessons/{lesson_id}/complete")
async def mark_lesson_complete(lesson_id: str, user: dict = Depends(require_roles("student"))):
    # Check if lesson has a task. If it does, they MUST submit the task instead.
    task = get_single_or_none(supabase.table("tasks").select("id").eq("lesson_id", lesson_id))
    if task:
        raise HTTPException(400, "This lesson has a task that must be submitted and approved.")
    
    # Check if already completed to avoid double XP
    existing = get_single_or_none(supabase.table("student_progress").select("*").eq("student_id", user["id"]).eq("lesson_id", lesson_id).eq("is_completed", True))
    
    supabase.table("student_progress").upsert({
        "student_id": user["id"],
        "lesson_id": lesson_id,
        "is_completed": True,
        "completed_at": iso(now_utc()),
    }).execute()
    
    xp_data = None
    if not existing:
        xp_data = award_xp(user["id"], "lesson_completed")
        
    return {"ok": True, "gamification": xp_data}


# -------------------- Tasks --------------------
@api.post("/lessons/{lesson_id}/task")
async def upsert_task(lesson_id: str, payload: TaskIn, _: dict = Depends(require_roles("admin"))):
    existing = supabase.table("lessons").select("id").eq("id", lesson_id).execute()
    if not existing.data:
        raise HTTPException(404, "Lesson not found")
    existing_task_resp = supabase.table("tasks").select("*").eq("lesson_id", lesson_id).execute().data
    existing_task = existing_task_resp[0] if existing_task_resp else None
    if existing_task:
        supabase.table("tasks").update({
            "description": payload.description,
            "instructions": payload.instructions,
            "expected_output": payload.expected_output,
        }).eq("lesson_id", lesson_id).execute()
        return supabase.table("tasks").select("*").eq("lesson_id", lesson_id).execute().data[0]
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "lesson_id": lesson_id,
        "description": payload.description,
        "instructions": payload.instructions,
        "expected_output": payload.expected_output,
        "created_at": iso(now_utc()),
    }
    supabase.table("tasks").insert(doc).execute()
    return doc


# -------------------- Lock/Unlock helper --------------------
async def get_ordered_lessons(course_id: str) -> list:
    modules = supabase.table("modules").select("*").eq("course_id", course_id).order("sequence_order").execute().data
    ordered = []
    for m in modules:
        lessons = supabase.table("lessons").select("*").eq("module_id", m["id"]).order("sequence_order").execute().data
        ordered.extend(lessons)
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
        # Award XP for project approval
        award_xp(sub["student_id"], "project_approved")
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
    users = supabase.table("users").select("*").eq("is_active", False).order("created_at", desc=True).execute().data
    return users


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
    courses = supabase.table("courses").select("*").eq("status", "published").execute().data
    result_courses = []
    next_lesson = None

    # Batch-fetch all student progress once
    progress_records = supabase.table("student_progress").select("*").eq("student_id", user["id"]).eq("is_completed", True).execute().data
    progress_set = {p["lesson_id"] for p in progress_records}

    # Batch-fetch all modules for all courses, then all lessons for those modules
    course_ids = [c["id"] for c in courses]
    all_modules = supabase.table("modules").select("*").in_("course_id", course_ids).order("sequence_order").execute().data if course_ids else []
    modules_by_course = {}
    for m in all_modules:
        modules_by_course.setdefault(m["course_id"], []).append(m)
    module_ids = [m["id"] for m in all_modules]
    all_lessons = supabase.table("lessons").select("*").in_("module_id", module_ids).order("sequence_order").execute().data if module_ids else []
    lessons_by_module = {}
    for l in all_lessons:
        lessons_by_module.setdefault(l["module_id"], []).append(l)

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
        result_courses.append({
            "course": c,
            "progress": progress,
            "total_lessons": total,
            "completed_lessons": completed,
            "module_count": len(c_modules),
            "next_lesson": first_unfinished,
        })
        if next_lesson is None and first_unfinished is not None:
            next_lesson = {"course": c, "lesson": first_unfinished}

    pending = supabase.table("submissions").select("*").eq("student_id", user["id"]).in_("status", ["pending", "rework"]).execute().data
    if pending:
        p_lesson_ids = list({p["lesson_id"] for p in pending})
        p_lessons = supabase.table("lessons").select("*").in_("id", p_lesson_ids).execute().data
        p_lesson_map = {l["id"]: l for l in p_lessons}
        for p in pending:
            p["lesson"] = p_lesson_map.get(p["lesson_id"])

    # Get Weekly Rank - Robust against missing tables
    rank = "N/A"
    try:
        today = now_utc().date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        weekly_records = supabase.table("leaderboard_weekly").select("user_id, xp").eq("week_start_date", week_start).order("xp", desc=True).execute().data
        
        for i, rec in enumerate(weekly_records):
            if rec["user_id"] == user["id"]:
                rank = i + 1
                break
    except Exception as ge:
        logger.error(f"Gamification rank error (likely missing tables): {ge}")

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


@api.get("/gamification/leaderboard")
async def get_weekly_leaderboard(user: dict = Depends(get_current_user)):
    try:
        today = now_utc().date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        
        # Fetch top 10
        top_records = supabase.table("leaderboard_weekly")\
            .select("xp, user:user_id(id, name, email)")\
            .eq("week_start_date", week_start)\
            .order("xp", desc=True)\
            .limit(10)\
            .execute().data
        
        # Format results
        leaderboard = []
        user_rank = None
        
        for i, rec in enumerate(top_records):
            leaderboard.append({
                "rank": i + 1,
                "name": rec["user"]["name"],
                "xp": rec["xp"],
                "is_me": rec["user"]["id"] == user["id"]
            })
        
        # If user is not in top 10, find their rank
        if not any(entry["is_me"] for entry in leaderboard):
            all_records = supabase.table("leaderboard_weekly")\
                .select("user_id")\
                .eq("week_start_date", week_start)\
                .order("xp", desc=True)\
                .execute().data
            for i, rec in enumerate(all_records):
                if rec["user_id"] == user["id"]:
                    user_rank = i + 1
                    break
        
        return {
            "week_start": week_start,
            "leaderboard": leaderboard,
            "user_rank": user_rank
        }
    except Exception as e:
        logger.error(f"Leaderboard error: {e}")
        return {
            "week_start": None,
            "leaderboard": [],
            "user_rank": "N/A",
            "error": "Leaderboard tables not found. Please run the SQL schema."
        }


app.include_router(api)

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

    # Mentor
    mentor_email = "mentor@hatchkod.com"
    mentor = supabase.table("users").select("*").eq("email", mentor_email).execute().data
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

    # Student
    student_email = "student@hatchkod.com"
    student = supabase.table("users").select("*").eq("email", student_email).execute().data
    if not student:
        student_id = str(uuid.uuid4())
        supabase.table("users").insert({
            "id": student_id,
            "name": "Aman Student",
            "email": student_email,
            "password_hash": hash_password("student123"),
            "role": "student",
            "assigned_mentor_id": mentor["id"],
            "created_at": iso(now_utc()),
        }).execute()
        logger.info("Seeded student")

    # Sample course
    courses_count = supabase.table("courses").select("*", count="exact").execute().count
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
    seed_data()


@app.on_event("shutdown")
async def on_shutdown():
    pass
