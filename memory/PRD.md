# HatchKod LMS — PRD

## Original Problem Statement
Production-ready LMS for edtech startup "HatchKod". Task-driven, learn-by-building methodology for Tier-3 college students. Course → Module → Lesson → Task hierarchy with locked progression (no advancement until mentor approves the task). Roles: Admin, Mentor, Student. Student dashboard with Continue Learning, progress %, pending tasks. Admin panel to create courses/modules/lessons and manage students/mentors. Mentor review system with Pending/Approved/Rework states.

## Architecture
- Frontend: React 19 + react-router-dom + Tailwind + shadcn/ui + sonner + lucide-react
- Backend: FastAPI + Motor (async MongoDB) + PyJWT + bcrypt
- Auth: JWT Bearer (Authorization header) + httpOnly cookie fallback; bcrypt password hashing
- Database: MongoDB (collections: users, courses, modules, lessons, tasks, submissions, student_progress)
- Design System: Swiss / High-Contrast — Outfit + IBM Plex Sans + JetBrains Mono, Cobalt #194BFB primary

## User Personas
- Student — Tier-3 engineering student, learns by building, submits GitHub repos.
- Mentor — Reviews submissions, approves or sends back for rework.
- Admin — Creates content (courses/modules/lessons/tasks), manages users, assigns mentors.

## Core Requirements (Static)
1. Course → Module → Lesson → Task structure
2. Lock/unlock progression — Lesson N+1 unlocks only when Task N is approved
3. GitHub link / text submissions with Pending → Approved/Rework state machine
4. Three role dashboards: Student, Mentor, Admin
5. Admin CRUD for content + user/mentor assignment
6. Mentor review with feedback

## What's Been Implemented (2026-04-28)
### Backend (`/app/backend/server.py`)
- Auth: register / login / logout / me — bcrypt + JWT, lowercased emails, unique index
- Seed on startup: Admin (admin@hatchkod.com), Mentor (mentor@hatchkod.com), Student (student@hatchkod.com auto-assigned to seeded mentor) + "Java Full Stack Bootcamp" course (2 modules, 4 lessons, 4 tasks)
- Courses CRUD (admin) with cascade delete of modules/lessons/tasks
- Modules / Lessons / Tasks CRUD (admin); upsert task on lesson
- Lock/unlock helper (`is_lesson_unlocked`) — checks previous lesson submission status
- Submissions: `/api/lessons/{id}/submit` — overwrites pending/rework, creates new otherwise
- Mentor review: `/api/submissions/pending`, `/api/submissions/{id}/review`
- Dashboards: `/api/dashboard/{student|mentor|admin}`
- User mgmt: `/api/users`, `/api/users/{id}/assign-mentor`
- Role enforcement via `require_roles` dependency

### Frontend (`/app/frontend/src/`)
- Pages: Landing, Login (with demo-fill buttons), Register, StudentDashboard (Continue Learning + progress %), CourseView (lesson list w/ lock icons), LessonView (video + content + task + submission form), MentorDashboard (split-view review panel), AdminDashboard (stats + courses tab + users tab), AdminCourseEditor (modules/lessons editor)
- AuthContext with localStorage token + axios interceptor
- ProtectedRoute with role-based redirects
- All interactive elements have `data-testid` attributes
- Sonner toasts, lucide icons, no purple gradients, Swiss/high-contrast aesthetic

### Tests
- Backend: 21/21 pytest passing (`/app/backend/tests/backend_test.py`)
- Frontend: All Playwright flows passing (login, register, dashboards, lesson submission, mentor review, admin CRUD)

## Prioritized Backlog

### P0 (next)
- Add login brute-force protection (5 failed attempts → 15 min lockout) per playbook
- Per-mentor pending submission scoping (currently unassigned subs visible to all mentors)

### P1 (deferred per "core only" choice)
- Streak system + automated nudges for inactivity
- File upload submissions (ZIP/PDF) via object storage
- Payments (Razorpay/Stripe) + tiered access (UNPAID/PARTIAL/FULL) + gated modules
- Certificate generation on 100% completion

### P2 (future)
- AI code review on submissions
- In-browser IDE
- Peer-to-peer debugging
- Analytics dashboard with drop-off / bottleneck charts

## Test Credentials
See `/app/memory/test_credentials.md`.
