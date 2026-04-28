"""HatchKod LMS Backend Test Suite - covers auth, courses, modules, lessons, tasks,
submissions, lock/unlock progression, role enforcement, and dashboards."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hatchkod-lms.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@hatchkod.com", "password": "admin123"}
MENTOR = {"email": "mentor@hatchkod.com", "password": "mentor123"}
STUDENT = {"email": "student@hatchkod.com", "password": "student123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="session")
def admin_ctx():
    token, user = _login(ADMIN)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def mentor_ctx():
    token, user = _login(MENTOR)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def student_ctx():
    token, user = _login(STUDENT)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == ADMIN["email"]
        assert isinstance(d["token"], str) and len(d["token"]) > 0

    def test_login_mentor(self):
        r = requests.post(f"{API}/auth/login", json=MENTOR)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "mentor"

    def test_login_student(self):
        r = requests.post(f"{API}/auth/login", json=STUDENT)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["role"] == "student"
        assert u.get("assigned_mentor_id"), "Student should be auto-assigned to mentor"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@y.z", "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, student_ctx):
        r = requests.get(f"{API}/auth/me", headers=student_ctx["h"])
        assert r.status_code == 200
        assert r.json()["email"] == STUDENT["email"]

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_new_student(self):
        email = f"TEST_stud_{uuid.uuid4().hex[:8]}@hatchkod.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "TEST New Student", "email": email, "password": "passw0rd", "role": "student"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == email.lower()
        assert d["user"]["role"] == "student"
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={
            "name": "dup", "email": email, "password": "passw0rd", "role": "student"
        })
        assert r2.status_code == 400


# ---------------- Courses ----------------
class TestCourses:
    def test_list_courses_authed(self, student_ctx):
        r = requests.get(f"{API}/courses", headers=student_ctx["h"])
        assert r.status_code == 200
        courses = r.json()
        assert isinstance(courses, list) and len(courses) >= 1

    def test_list_courses_unauth(self):
        r = requests.get(f"{API}/courses")
        assert r.status_code == 401

    def test_get_course_for_student_includes_unlocked(self, student_ctx):
        courses = requests.get(f"{API}/courses", headers=student_ctx["h"]).json()
        cid = courses[0]["id"]
        r = requests.get(f"{API}/courses/{cid}", headers=student_ctx["h"])
        assert r.status_code == 200
        c = r.json()
        assert "modules" in c and len(c["modules"]) >= 1
        first_mod = c["modules"][0]
        assert "lessons" in first_mod and len(first_mod["lessons"]) >= 1
        first_lesson = first_mod["lessons"][0]
        assert "unlocked" in first_lesson
        assert "completed" in first_lesson
        assert "submission" in first_lesson


# ---------------- Lock / Unlock Progression ----------------
class TestProgression:
    @pytest.fixture(scope="class")
    def lessons(self, student_ctx):
        courses = requests.get(f"{API}/courses", headers=student_ctx["h"]).json()
        seeded = next((c for c in courses if "Java Full Stack" in c["title"]), courses[0])
        cid = seeded["id"]
        c = requests.get(f"{API}/courses/{cid}", headers=student_ctx["h"]).json()
        ordered = []
        for m in c["modules"]:
            for l in m["lessons"]:
                ordered.append(l)
        assert len(ordered) >= 2
        return {"course_id": cid, "ordered": ordered}

    def test_first_lesson_accessible(self, student_ctx, lessons):
        first = lessons["ordered"][0]
        r = requests.get(f"{API}/lessons/{first['id']}", headers=student_ctx["h"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lesson"]["id"] == first["id"]
        assert d["task"] is not None

    def test_second_lesson_locked_initially(self, student_ctx, lessons):
        # If approved already from previous run, this test is informational
        second = lessons["ordered"][1]
        # check unlocked flag
        course = requests.get(f"{API}/courses/{lessons['course_id']}", headers=student_ctx["h"]).json()
        flat = [l for m in course["modules"] for l in m["lessons"]]
        s = next(l for l in flat if l["id"] == second["id"])
        if s["unlocked"]:
            pytest.skip("Second lesson already unlocked from previous test runs")
        r = requests.get(f"{API}/lessons/{second['id']}", headers=student_ctx["h"])
        assert r.status_code == 403
        assert "lock" in r.json()["detail"].lower()

    def test_full_submit_review_flow(self, student_ctx, mentor_ctx, lessons):
        first = lessons["ordered"][0]
        second = lessons["ordered"][1]

        # 1) student submits to first lesson
        sub = requests.post(
            f"{API}/lessons/{first['id']}/submit",
            json={"submission_url": "https://github.com/test/repo", "submission_text": "TEST submission"},
            headers=student_ctx["h"],
        )
        assert sub.status_code == 200, sub.text
        sd = sub.json()
        assert sd["status"] == "pending"
        assert sd["lesson_id"] == first["id"]
        sid = sd["id"]

        # 2) mentor sees it in pending
        pend = requests.get(f"{API}/submissions/pending", headers=mentor_ctx["h"])
        assert pend.status_code == 200
        ids = [s["id"] for s in pend.json()]
        assert sid in ids

        # 3) reject as rework first - student should still be locked on second lesson
        rev = requests.post(
            f"{API}/submissions/{sid}/review",
            json={"status": "rework", "feedback": "TEST please fix"},
            headers=mentor_ctx["h"],
        )
        assert rev.status_code == 200
        assert rev.json()["status"] == "rework"

        # second still locked
        r = requests.get(f"{API}/lessons/{second['id']}", headers=student_ctx["h"])
        assert r.status_code == 403

        # 4) student resubmits - should overwrite to pending
        resub = requests.post(
            f"{API}/lessons/{first['id']}/submit",
            json={"submission_url": "https://github.com/test/repo-v2"},
            headers=student_ctx["h"],
        )
        assert resub.status_code == 200
        assert resub.json()["status"] == "pending"
        assert resub.json()["id"] == sid  # same submission id (overwrite)

        # 5) mentor approves
        appr = requests.post(
            f"{API}/submissions/{sid}/review",
            json={"status": "approved", "feedback": "TEST good"},
            headers=mentor_ctx["h"],
        )
        assert appr.status_code == 200
        assert appr.json()["status"] == "approved"

        # 6) student can now access second lesson
        r2 = requests.get(f"{API}/lessons/{second['id']}", headers=student_ctx["h"])
        assert r2.status_code == 200, r2.text

        # 7) course view reflects completion
        course = requests.get(f"{API}/courses/{lessons['course_id']}", headers=student_ctx["h"]).json()
        flat = [l for m in course["modules"] for l in m["lessons"]]
        first_l = next(l for l in flat if l["id"] == first["id"])
        second_l = next(l for l in flat if l["id"] == second["id"])
        assert first_l["completed"] is True
        assert second_l["unlocked"] is True


# ---------------- Role Enforcement ----------------
class TestRoles:
    def test_student_cannot_create_course(self, student_ctx):
        r = requests.post(f"{API}/courses", json={"title": "TEST nope"}, headers=student_ctx["h"])
        assert r.status_code == 403

    def test_mentor_cannot_list_users(self, mentor_ctx):
        r = requests.get(f"{API}/users", headers=mentor_ctx["h"])
        assert r.status_code == 403

    def test_student_cannot_view_pending(self, student_ctx):
        r = requests.get(f"{API}/submissions/pending", headers=student_ctx["h"])
        assert r.status_code == 403


# ---------------- Admin CRUD ----------------
class TestAdminCRUD:
    def test_full_course_module_lesson_task_delete(self, admin_ctx):
        # Create course
        r = requests.post(f"{API}/courses", json={
            "title": "TEST Course", "description": "desc", "status": "published"
        }, headers=admin_ctx["h"])
        assert r.status_code == 200
        cid = r.json()["id"]

        # Module
        r = requests.post(f"{API}/courses/{cid}/modules",
                          json={"title": "TEST Module", "sequence_order": 0},
                          headers=admin_ctx["h"])
        assert r.status_code == 200
        mid = r.json()["id"]

        # Lesson
        r = requests.post(f"{API}/modules/{mid}/lessons",
                          json={"title": "TEST Lesson", "content": "x", "sequence_order": 0},
                          headers=admin_ctx["h"])
        assert r.status_code == 200
        lid = r.json()["id"]

        # Task
        r = requests.post(f"{API}/lessons/{lid}/task",
                          json={"description": "TEST task", "instructions": "i", "expected_output": "o"},
                          headers=admin_ctx["h"])
        assert r.status_code == 200
        assert r.json()["lesson_id"] == lid

        # Verify GET
        r = requests.get(f"{API}/courses/{cid}", headers=admin_ctx["h"])
        assert r.status_code == 200
        course = r.json()
        assert len(course["modules"]) == 1
        assert len(course["modules"][0]["lessons"]) == 1
        assert course["modules"][0]["lessons"][0]["task"]["description"] == "TEST task"

        # Delete cascade
        r = requests.delete(f"{API}/courses/{cid}", headers=admin_ctx["h"])
        assert r.status_code == 200

        r = requests.get(f"{API}/courses/{cid}", headers=admin_ctx["h"])
        assert r.status_code == 404

    def test_list_users_and_assign_mentor(self, admin_ctx, mentor_ctx):
        # list students
        r = requests.get(f"{API}/users?role=student", headers=admin_ctx["h"])
        assert r.status_code == 200
        students = r.json()
        assert all(s["role"] == "student" for s in students)
        assert len(students) >= 1

        # create a fresh student then assign mentor
        email = f"TEST_assign_{uuid.uuid4().hex[:8]}@hatchkod.com"
        reg = requests.post(f"{API}/auth/register", json={
            "name": "TEST Assign", "email": email, "password": "passw0rd", "role": "student"
        })
        assert reg.status_code == 200
        sid = reg.json()["user"]["id"]
        mentor_id = mentor_ctx["user"]["id"]

        r = requests.post(f"{API}/users/{sid}/assign-mentor",
                          json={"mentor_id": mentor_id}, headers=admin_ctx["h"])
        assert r.status_code == 200

        # Verify via list
        students = requests.get(f"{API}/users?role=student", headers=admin_ctx["h"]).json()
        s = next(x for x in students if x["id"] == sid)
        assert s["assigned_mentor_id"] == mentor_id


# ---------------- Dashboards ----------------
class TestDashboards:
    def test_student_dashboard(self, student_ctx):
        r = requests.get(f"{API}/dashboard/student", headers=student_ctx["h"])
        assert r.status_code == 200
        d = r.json()
        assert "courses" in d and isinstance(d["courses"], list)
        assert "next_lesson" in d
        assert "pending_count" in d
        if d["courses"]:
            assert "progress" in d["courses"][0]
            assert isinstance(d["courses"][0]["progress"], int)

    def test_mentor_dashboard(self, mentor_ctx):
        r = requests.get(f"{API}/dashboard/mentor", headers=mentor_ctx["h"])
        assert r.status_code == 200
        d = r.json()
        for k in ("pending_reviews", "approved_total", "students_assigned"):
            assert k in d
            assert isinstance(d[k], int)

    def test_admin_dashboard(self, admin_ctx):
        r = requests.get(f"{API}/dashboard/admin", headers=admin_ctx["h"])
        assert r.status_code == 200
        d = r.json()
        for k in ("courses", "modules", "lessons", "students", "mentors", "pending_submissions", "approved_submissions"):
            assert k in d
        assert d["students"] >= 1
        assert d["mentors"] >= 1
