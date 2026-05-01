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
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
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
    supabase.table("courses").delete().eq("id", course_id).execute()
    mods = supabase.table("modules").select("id").eq("course_id", course_id).execute().data
    mod_ids = [m["id"] for m in mods]
    
    lesson_ids = []
    if mod_ids:
        lessons = supabase.table("lessons").select("id").in_("module_id", mod_ids).execute().data
        lesson_ids = [l["id"] for l in lessons]
        supabase.table("modules").delete().eq("course_id", course_id).execute()
        supabase.table("lessons").delete().in_("module_id", mod_ids).execute()
        
    if lesson_ids:
        supabase.table("tasks").delete().in_("lesson_id", lesson_ids).execute()
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
    supabase.table("modules").delete().eq("id", module_id).execute()
    supabase.table("lessons").delete().eq("module_id", module_id).execute()
    if lesson_ids:
        supabase.table("tasks").delete().in_("lesson_id", lesson_ids).execute()
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
    supabase.table("lessons").delete().eq("id", lesson_id).execute()
    supabase.table("tasks").delete().eq("lesson_id", lesson_id).execute()
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

    return {"lesson": lesson, "module": module, "course": course, "task": task, "submission": sub}


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
    sub = get_single_or_none(supabase.table("submissions").select("*").eq("student_id", student_id).eq("lesson_id", prev["id"]).eq("status", "approved"))
    # If previous lesson has no task, treat as auto-unlocked
    prev_task = get_single_or_none(supabase.table("tasks").select("*").eq("lesson_id", prev["id"]))
    if not prev_task:
        return True
    return bool(sub)


# -------------------- Submissions --------------------
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
        # Simple regex for github URL: https://github.com/username/repo
        github_regex = r"^https?://(www\.)?github\.com/[\w.-]+/[\w.-]+/?.*$"
        if not re.match(github_regex, payload.submission_url):
            raise HTTPException(400, "Invalid GitHub URL format")

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

    for c in courses:
        ordered = []
        for m in modules_by_course.get(c["id"], []):
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

    return {
        "courses": result_courses,
        "next_lesson": next_lesson,
        "pending_submissions": pending,
        "pending_count": len(pending),
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


@api.get("/")
async def root():
    return {"service": "HatchKod LMS", "status": "ok"}


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
