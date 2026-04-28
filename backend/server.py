from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


# -------------------- Config --------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "hatchkod-dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MIN = 60 * 24 * 7  # 7 days for simplicity in MVP

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@hatchkod.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="HatchKod LMS")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hatchkod")


# -------------------- Helpers --------------------
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
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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


# -------------------- Auth Endpoints --------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
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
    await db.users.insert_one(user_doc)
    token = create_token(user_id, email, payload.role)
    set_auth_cookie(response, token)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"user": user_doc, "token": token}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# -------------------- Courses (Admin) --------------------
@api.get("/courses")
async def list_courses(_: dict = Depends(get_current_user)):
    courses = await db.courses.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
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
    await db.courses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(404, "Course not found")
    modules = await db.modules.find({"course_id": course_id}, {"_id": 0}).sort("sequence_order", 1).to_list(1000)
    for m in modules:
        lessons = await db.lessons.find({"module_id": m["id"]}, {"_id": 0}).sort("sequence_order", 1).to_list(1000)
        for l in lessons:
            l["task"] = await db.tasks.find_one({"lesson_id": l["id"]}, {"_id": 0})
            if user["role"] == "student":
                l["unlocked"] = await is_lesson_unlocked(user["id"], l["id"])
                l["completed"] = bool(
                    await db.student_progress.find_one(
                        {"student_id": user["id"], "lesson_id": l["id"], "is_completed": True}
                    )
                )
                sub = await db.submissions.find_one(
                    {"student_id": user["id"], "lesson_id": l["id"]},
                    {"_id": 0},
                    sort=[("submitted_at", -1)],
                )
                l["submission"] = sub
            else:
                l["unlocked"] = True
                l["completed"] = False
                l["submission"] = None
        m["lessons"] = lessons
    course["modules"] = modules
    return course


@api.delete("/courses/{course_id}")
async def delete_course(course_id: str, _: dict = Depends(require_roles("admin"))):
    await db.courses.delete_one({"id": course_id})
    mods = await db.modules.find({"course_id": course_id}, {"_id": 0}).to_list(1000)
    mod_ids = [m["id"] for m in mods]
    lessons = await db.lessons.find({"module_id": {"$in": mod_ids}}, {"_id": 0}).to_list(1000)
    lesson_ids = [l["id"] for l in lessons]
    await db.modules.delete_many({"course_id": course_id})
    await db.lessons.delete_many({"module_id": {"$in": mod_ids}})
    await db.tasks.delete_many({"lesson_id": {"$in": lesson_ids}})
    return {"ok": True}


# -------------------- Modules --------------------
@api.post("/courses/{course_id}/modules")
async def create_module(course_id: str, payload: ModuleIn, _: dict = Depends(require_roles("admin"))):
    if not await db.courses.find_one({"id": course_id}):
        raise HTTPException(404, "Course not found")
    mid = str(uuid.uuid4())
    doc = {
        "id": mid,
        "course_id": course_id,
        "title": payload.title,
        "sequence_order": payload.sequence_order,
        "created_at": iso(now_utc()),
    }
    await db.modules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/modules/{module_id}")
async def delete_module(module_id: str, _: dict = Depends(require_roles("admin"))):
    lessons = await db.lessons.find({"module_id": module_id}, {"_id": 0}).to_list(1000)
    lesson_ids = [l["id"] for l in lessons]
    await db.modules.delete_one({"id": module_id})
    await db.lessons.delete_many({"module_id": module_id})
    await db.tasks.delete_many({"lesson_id": {"$in": lesson_ids}})
    return {"ok": True}


# -------------------- Lessons --------------------
@api.post("/modules/{module_id}/lessons")
async def create_lesson(module_id: str, payload: LessonIn, _: dict = Depends(require_roles("admin"))):
    if not await db.modules.find_one({"id": module_id}):
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
    await db.lessons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, _: dict = Depends(require_roles("admin"))):
    await db.lessons.delete_one({"id": lesson_id})
    await db.tasks.delete_many({"lesson_id": lesson_id})
    return {"ok": True}


@api.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    module = await db.modules.find_one({"id": lesson["module_id"]}, {"_id": 0})
    course = await db.courses.find_one({"id": module["course_id"]}, {"_id": 0}) if module else None
    task = await db.tasks.find_one({"lesson_id": lesson_id}, {"_id": 0})

    if user["role"] == "student":
        unlocked = await is_lesson_unlocked(user["id"], lesson_id)
        if not unlocked:
            raise HTTPException(status_code=403, detail="Lesson is locked. Complete previous tasks first.")
        sub = await db.submissions.find_one(
            {"student_id": user["id"], "lesson_id": lesson_id},
            {"_id": 0},
            sort=[("submitted_at", -1)],
        )
    else:
        sub = None

    return {"lesson": lesson, "module": module, "course": course, "task": task, "submission": sub}


# -------------------- Tasks --------------------
@api.post("/lessons/{lesson_id}/task")
async def upsert_task(lesson_id: str, payload: TaskIn, _: dict = Depends(require_roles("admin"))):
    if not await db.lessons.find_one({"id": lesson_id}):
        raise HTTPException(404, "Lesson not found")
    existing = await db.tasks.find_one({"lesson_id": lesson_id})
    if existing:
        await db.tasks.update_one(
            {"lesson_id": lesson_id},
            {"$set": {
                "description": payload.description,
                "instructions": payload.instructions,
                "expected_output": payload.expected_output,
            }},
        )
        return await db.tasks.find_one({"lesson_id": lesson_id}, {"_id": 0})
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "lesson_id": lesson_id,
        "description": payload.description,
        "instructions": payload.instructions,
        "expected_output": payload.expected_output,
        "created_at": iso(now_utc()),
    }
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


# -------------------- Lock/Unlock helper --------------------
async def get_ordered_lessons(course_id: str) -> list:
    modules = await db.modules.find({"course_id": course_id}, {"_id": 0}).sort("sequence_order", 1).to_list(1000)
    ordered = []
    for m in modules:
        lessons = await db.lessons.find({"module_id": m["id"]}, {"_id": 0}).sort("sequence_order", 1).to_list(1000)
        ordered.extend(lessons)
    return ordered


async def is_lesson_unlocked(student_id: str, lesson_id: str) -> bool:
    """Lesson N+1 unlocks only when Lesson N's task is approved."""
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        return False
    module = await db.modules.find_one({"id": lesson["module_id"]}, {"_id": 0})
    if not module:
        return False
    ordered = await get_ordered_lessons(module["course_id"])
    idx = next((i for i, l in enumerate(ordered) if l["id"] == lesson_id), -1)
    if idx <= 0:
        return True
    prev = ordered[idx - 1]
    sub = await db.submissions.find_one(
        {"student_id": student_id, "lesson_id": prev["id"], "status": "approved"},
        {"_id": 0},
    )
    # If previous lesson has no task, treat as auto-unlocked
    prev_task = await db.tasks.find_one({"lesson_id": prev["id"]}, {"_id": 0})
    if not prev_task:
        return True
    return bool(sub)


# -------------------- Submissions --------------------
@api.post("/lessons/{lesson_id}/submit")
async def submit_task(lesson_id: str, payload: SubmissionIn, user: dict = Depends(require_roles("student"))):
    task = await db.tasks.find_one({"lesson_id": lesson_id}, {"_id": 0})
    if not task:
        raise HTTPException(404, "No task for this lesson")
    if not await is_lesson_unlocked(user["id"], lesson_id):
        raise HTTPException(403, "Lesson locked")
    if not (payload.submission_url or payload.submission_text):
        raise HTTPException(400, "Provide GitHub link or text")

    # If a previous submission is in 'rework' or 'pending', overwrite it; else create new
    existing = await db.submissions.find_one(
        {"student_id": user["id"], "lesson_id": lesson_id},
        sort=[("submitted_at", -1)],
    )
    if existing and existing.get("status") in ("rework", "pending"):
        await db.submissions.update_one(
            {"id": existing["id"]},
            {"$set": {
                "submission_url": payload.submission_url or "",
                "submission_text": payload.submission_text or "",
                "status": "pending",
                "feedback": "",
                "submitted_at": iso(now_utc()),
                "reviewed_at": None,
            }},
        )
        return await db.submissions.find_one({"id": existing["id"]}, {"_id": 0})

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
    await db.submissions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/submissions/pending")
async def pending_submissions(user: dict = Depends(require_roles("mentor", "admin"))):
    query = {"status": {"$in": ["pending", "rework"]}}
    if user["role"] == "mentor":
        # Show submissions from students assigned to this mentor + unassigned
        query["$or"] = [{"mentor_id": user["id"]}, {"mentor_id": None}]
    subs = await db.submissions.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    # Enrich with student name and lesson title
    for s in subs:
        st = await db.users.find_one({"id": s["student_id"]}, {"_id": 0, "password_hash": 0})
        s["student"] = st
        l = await db.lessons.find_one({"id": s["lesson_id"]}, {"_id": 0})
        s["lesson"] = l
    return subs


@api.get("/submissions/{submission_id}")
async def get_submission(submission_id: str, user: dict = Depends(get_current_user)):
    sub = await db.submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Submission not found")
    if user["role"] == "student" and sub["student_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    sub["student"] = await db.users.find_one(
        {"id": sub["student_id"]}, {"_id": 0, "password_hash": 0}
    )
    sub["lesson"] = await db.lessons.find_one({"id": sub["lesson_id"]}, {"_id": 0})
    sub["task"] = await db.tasks.find_one({"id": sub["task_id"]}, {"_id": 0})
    return sub


@api.post("/submissions/{submission_id}/review")
async def review_submission(
    submission_id: str, payload: ReviewIn, user: dict = Depends(require_roles("mentor", "admin"))
):
    sub = await db.submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Submission not found")
    update = {
        "status": payload.status,
        "feedback": payload.feedback,
        "mentor_id": user["id"],
        "reviewed_at": iso(now_utc()),
    }
    await db.submissions.update_one({"id": submission_id}, {"$set": update})
    if payload.status == "approved":
        await db.student_progress.update_one(
            {"student_id": sub["student_id"], "lesson_id": sub["lesson_id"]},
            {"$set": {
                "student_id": sub["student_id"],
                "lesson_id": sub["lesson_id"],
                "is_completed": True,
                "completed_at": iso(now_utc()),
            }},
            upsert=True,
        )
    return await db.submissions.find_one({"id": submission_id}, {"_id": 0})


# -------------------- Users / Admin --------------------
@api.get("/users")
async def list_users(role: Optional[str] = None, _: dict = Depends(require_roles("admin"))):
    q = {}
    if role:
        q["role"] = role
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api.post("/users/{user_id}/assign-mentor")
async def assign_mentor(user_id: str, payload: AssignMentorIn, _: dict = Depends(require_roles("admin"))):
    student = await db.users.find_one({"id": user_id})
    if not student or student["role"] != "student":
        raise HTTPException(404, "Student not found")
    mentor = await db.users.find_one({"id": payload.mentor_id})
    if not mentor or mentor["role"] != "mentor":
        raise HTTPException(404, "Mentor not found")
    await db.users.update_one({"id": user_id}, {"$set": {"assigned_mentor_id": payload.mentor_id}})
    # Update existing pending submissions
    await db.submissions.update_many(
        {"student_id": user_id, "status": {"$in": ["pending", "rework"]}},
        {"$set": {"mentor_id": payload.mentor_id}},
    )
    return {"ok": True}


# -------------------- Dashboards --------------------
@api.get("/dashboard/student")
async def student_dashboard(user: dict = Depends(require_roles("student"))):
    courses = await db.courses.find({"status": "published"}, {"_id": 0}).to_list(1000)
    result_courses = []
    next_lesson = None
    pending_count = 0

    for c in courses:
        ordered = await get_ordered_lessons(c["id"])
        total = len(ordered)
        completed = 0
        first_unfinished = None
        for l in ordered:
            done = await db.student_progress.find_one(
                {"student_id": user["id"], "lesson_id": l["id"], "is_completed": True}
            )
            if done:
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

    pending = await db.submissions.find(
        {"student_id": user["id"], "status": {"$in": ["pending", "rework"]}},
        {"_id": 0},
    ).to_list(1000)
    for p in pending:
        p["lesson"] = await db.lessons.find_one({"id": p["lesson_id"]}, {"_id": 0})
    pending_count = len(pending)

    return {
        "courses": result_courses,
        "next_lesson": next_lesson,
        "pending_submissions": pending,
        "pending_count": pending_count,
    }


@api.get("/dashboard/mentor")
async def mentor_dashboard(user: dict = Depends(require_roles("mentor"))):
    pending = await db.submissions.count_documents({
        "$or": [{"mentor_id": user["id"]}, {"mentor_id": None}],
        "status": {"$in": ["pending", "rework"]},
    })
    approved = await db.submissions.count_documents({"mentor_id": user["id"], "status": "approved"})
    students = await db.users.count_documents({"assigned_mentor_id": user["id"]})
    return {"pending_reviews": pending, "approved_total": approved, "students_assigned": students}


@api.get("/dashboard/admin")
async def admin_dashboard(_: dict = Depends(require_roles("admin"))):
    return {
        "courses": await db.courses.count_documents({}),
        "modules": await db.modules.count_documents({}),
        "lessons": await db.lessons.count_documents({}),
        "students": await db.users.count_documents({"role": "student"}),
        "mentors": await db.users.count_documents({"role": "mentor"}),
        "pending_submissions": await db.submissions.count_documents({"status": {"$in": ["pending", "rework"]}}),
        "approved_submissions": await db.submissions.count_documents({"status": "approved"}),
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
async def seed_data():
    await db.users.create_index("email", unique=True)
    await db.courses.create_index("id", unique=True)
    await db.modules.create_index("id", unique=True)
    await db.lessons.create_index("id", unique=True)
    await db.tasks.create_index("id", unique=True)
    await db.submissions.create_index("id", unique=True)

    # Admin
    admin = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id,
            "name": "HatchKod Admin",
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "assigned_mentor_id": None,
            "created_at": iso(now_utc()),
        })
        logger.info("Seeded admin")

    # Mentor
    mentor_email = "mentor@hatchkod.com"
    mentor = await db.users.find_one({"email": mentor_email})
    if not mentor:
        mentor_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": mentor_id,
            "name": "Riya Mentor",
            "email": mentor_email,
            "password_hash": hash_password("mentor123"),
            "role": "mentor",
            "assigned_mentor_id": None,
            "created_at": iso(now_utc()),
        })
        mentor = await db.users.find_one({"email": mentor_email})
        logger.info("Seeded mentor")

    # Student
    student_email = "student@hatchkod.com"
    student = await db.users.find_one({"email": student_email})
    if not student:
        student_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": student_id,
            "name": "Aman Student",
            "email": student_email,
            "password_hash": hash_password("student123"),
            "role": "student",
            "assigned_mentor_id": mentor["id"],
            "created_at": iso(now_utc()),
        })
        logger.info("Seeded student")

    # Sample course
    if await db.courses.count_documents({}) == 0:
        course_id = str(uuid.uuid4())
        await db.courses.insert_one({
            "id": course_id,
            "title": "Java Full Stack Bootcamp",
            "description": "Become a job-ready full-stack developer. Learn Java, Spring Boot, React, and ship real projects.",
            "thumbnail_url": "https://images.pexels.com/photos/6424589/pexels-photo-6424589.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            "status": "published",
            "created_at": iso(now_utc()),
        })

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
            await db.modules.insert_one({
                "id": mid,
                "course_id": course_id,
                "title": m["title"],
                "sequence_order": m_idx,
                "created_at": iso(now_utc()),
            })
            for l_idx, l in enumerate(m["lessons"]):
                lid = str(uuid.uuid4())
                await db.lessons.insert_one({
                    "id": lid,
                    "module_id": mid,
                    "title": l["title"],
                    "video_url": "https://www.youtube.com/embed/eIrMbAQSU34",
                    "content": l["content"],
                    "sequence_order": l_idx,
                    "created_at": iso(now_utc()),
                })
                tid = str(uuid.uuid4())
                await db.tasks.insert_one({
                    "id": tid,
                    "lesson_id": lid,
                    "description": l["task"]["description"],
                    "instructions": l["task"]["instructions"],
                    "expected_output": l["task"]["expected_output"],
                    "created_at": iso(now_utc()),
                })
        logger.info("Seeded sample course")


@app.on_event("startup")
async def on_startup():
    try:
        await seed_data()
    except Exception as e:
        logger.exception("Seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
