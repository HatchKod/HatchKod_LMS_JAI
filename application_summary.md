# HatchKod LMS — Comprehensive Project Summary

## 1. Overview
HatchKod LMS is a production-grade Learning Management System built for a "learn-by-building" methodology. It is specifically designed for technical education, featuring automated code execution, mandatory task progression, and a robust mentor review system.

### Core Technology Stack
| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Tailwind CSS, Radix UI, Lucide, Axios, Sonner (Toasts) |
| **Backend** | FastAPI (Python 3.9+), PyJWT, Bcrypt, HTTPX |
| **Database/BaaS** | Supabase (PostgreSQL, Storage, Real-time) |
| **Infrastructure** | Judge0 (Code Execution), AWS Lambda (Email Triggers), PM2, Nginx |

---

## 2. Technical Architecture Details

### Authentication & Authorization (Custom Layered Flow)
The project implements a **Custom JWT + Bcrypt** flow, layered on top of Supabase PostgreSQL.
- **Custom Auth vs Supabase Auth**: The system **does not** use Supabase's native Auth (GoTrue). It manages users manually in a standard PostgreSQL table for maximum control over the onboarding and role assignment logic.
- **Password Security**: Hashed using `bcrypt` before storage in the `users` table.
- **Token Management**: Manual generation and decoding of JWTs using `PyJWT`. Tokens are stored in `localStorage` on the frontend (`hk_token`) and sent via the `Authorization: Bearer` header.
- **Role Enforcement**: A custom `require_roles` dependency in FastAPI restricts access to `admin`, `mentor`, or `student` roles.

### Database Schema (Supabase/PostgreSQL)
Key tables and their primary roles:
- `users`: Core user data including `total_xp`, `level`, `current_streak`, and `assigned_mentor_id`.
- `batches`: Grouping of students for specific courses and mentors.
- `batch_students`: Mapping table for student-to-batch enrollment.
- `courses`, `modules`, `lessons`, `tasks`: The content hierarchy.
- `submissions`: Records student task submissions (GitHub URLs or file paths) and mentor feedback/status.
- `student_progress`: Tracks completion of lessons to handle the locking/unlocking logic.
- `class_sessions`: Manages the lifecycle of live classes.
- `attendance`: Tracks student join times and "late" status for live classes.
- `problems`, `test_cases`, `problem_submissions`: Support for the coding challenge library.
- `notifications`: Stores broadcast and automated alerts.

### Business Logic & Code Execution
- **Sequential Unlocking**: `is_lesson_unlocked` helper verifies that Lesson N-1's task is `approved` before allowing access to Lesson N.
- **Gamification Engine**:
    - `award_xp`: Calculates and updates XP based on actions (Lesson: 20, Quiz: 40, Problem: 50, Project: 150).
    - `sync_student_xp`: A retroactive sync utility that ensures a student's XP matches their approved work history.
- **Judge0 Proxy (Multi-language Potential)**:
    - **Current Focus**: The `/api/execute` (Playground) is hardcoded to Java.
    - **Extensibility**: The `/api/problems/{id}/submit` endpoint already contains a `lang_map` for **Python, JavaScript, and C++**, making it easy to support these in the future.

---

## 3. Key Workflows

### Live Class Lifecycle
1. **Scheduling**: Mentor creates a session in a specific batch.
2. **Start**: Mentor clicks "Start Class" → Session status becomes `live` → Automated notifications sent to all batch students.
3. **Joining**: Students join via the dashboard; the system logs their `joined_at` time and marks them `is_late` if they join 10+ minutes after the start.
4. **Ending**: Mentor ends class → Session status becomes `ended` → System backfills `absent` status for students who didn't join.
5. **Recording**: Mentor uploads a recording URL → Students receive a "Recording Available" notification.

### Task Review Flow
- **Submission**: Students submit a GitHub URL or upload a ZIP/PDF to Supabase Storage.
- **Review Scoping**: Mentors only see "Pending" submissions for students **assigned to them** or students who are currently **unassigned**.
- **Approval**: If "Approved", the student receives XP and the next lesson is unlocked. If "Rework", the student must resubmit based on feedback.

---

## 4. Frontend Implementation

### State Management
- **Philosophy**: Lightweight and dependency-free.
- **Authentication**: Managed via a global `AuthContext` (`frontend/src/lib/auth.jsx`) which provides `user` and `loading` states.
- **Application State**: Purely local `useState` and `useEffect` patterns. Data is fetched via Axios on a per-page/per-component basis. No Redux or Zustand is used.

### Design System
The application follows a **Swiss & High-Contrast** aesthetic:
- **Typography**: `Outfit` for headings, `IBM Plex Sans` for body, and `JetBrains Mono` for code.
- **Color Palette**: Primary Cobalt Blue (`#194BFB`), Success Green (`#10B981`), and High-Contrast Grayscale (#09090B to #FFFFFF).
- **Layout**: "Control Room" grid layout—dense, functional, 1px borders, and sharp corners (minimal border-radius).

---

## 5. Maintenance & Design Debt

### Technical Pain Points
- **Monolithic Backend**: The backend is currently housed in a single **3,300+ line `server.py`**. This makes maintenance difficult and is a primary candidate for refactoring into modular routers (e.g., `auth_router`, `course_router`).
- **Mixed Database Logic**: Database queries (Supabase client calls) are mixed directly with business logic and route handlers.

### Deployment & Environment
- **Target**: Self-hosted Linux VPS (Ubuntu).
- **Process Management**: **PM2** handles the backend FastAPI process and frontend serving.
- **Reverse Proxy**: **Nginx** handles SSL and traffic routing.
- **Environment**: Requires `.env` with `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`, and `ADMIN_EMAIL`.
- **Onboarding**: Integrated with **AWS Lambda** for automated student onboarding flows.
