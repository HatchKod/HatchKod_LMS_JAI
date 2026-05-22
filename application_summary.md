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
- `users`: Core user data including `total_xp`, `level`, `current_streak`, `access_tier`, `payment_status`, and `amount_paid`.
- `batches`: Grouping of students for specific courses and mentors.
- `batch_students`: Mapping table for student-to-batch enrollment.
- `batch_module_access`, `batch_demo_modules`, `batch_partial_modules`: Control module accessibility based on tiers.
- `courses`, `modules`, `topics`, `subtopics`, `tasks`: The 3-level content hierarchy.
- `submissions`: Records student task submissions (GitHub URLs or file paths) and mentor feedback/status.
- `student_progress`: Tracks completion of subtopics (`is_completed = True`) to handle the locking/unlocking logic at the topic level.
- `subtopic_completions`: Tracks completion of subtopics, time spent (for analytics), and completion timestamps.
- `user_activity`: Stores granular logs of student activities (e.g., lesson completed, project approved, problem solved) and awarded XP.
- `leaderboard_weekly`: Tracks student XP earned on a week-by-week basis to support the leaderboard ranking.
- `class_sessions`: Manages the lifecycle of live classes.
- `recordings`: Tracks session recordings uploaded by mentors.
- `attendance`: Tracks student attendance statuses (`present`, `absent`, `late`) for class sessions.
- `problems`, `test_cases`, `problem_submissions`: Support for the coding challenge library.
- `notifications`: Stores broadcast and automated alerts.
- `payments`, `payment_orders`: Tracks financial transactions, Razorpay checkouts, and student tier upgrades.

### Business Logic & Code Execution
- **Tier-Based Access & Sequential Unlocking**: The system strictly enforces content access based on a user's `access_tier` (demo, partial, full) preventing unauthorized API fetches. Within accessible modules, `is_topic_unlocked` verifies that Topic N-1 is complete before allowing access to Topic N. A Topic N-1 is complete when all its mandatory subtopics are finished.
- **Gamification Engine**:
    - `award_xp`: Calculates and updates XP based on actions (`lesson_completed`: 20 XP, `quiz_passed`: 40 XP, `problem_solved`: 50 XP, `project_approved`: 150 XP).
    - `sync_student_xp`: A retroactive sync utility that ensures a student's XP matches their approved work history.
- **Judge0 Proxy (Multi-language Potential)**:
    - **Current Focus**: The `/api/execute` (Playground) is hardcoded to Java.
    - **Extensibility**: The `/api/problems/{id}/submit` endpoint already contains a `lang_map` for **Python, JavaScript, and C++**, making it easy to support these in the future.

---

## 3. Key Workflows

### Live Class Lifecycle
1. **Scheduling**: Mentor schedules a live session for a batch.
2. **Start**: Mentor clicks "Start Class" → Session status becomes `live` → Automated notifications sent to all batch students.
3. **Joining**: Students join the class via the dashboard link. Note: The app does not log real-time attendance upon joining; Google Meet attendance reports are the sole source of truth.
4. **Ending**: Mentor ends class → Session status becomes `ended` → The system automatically creates a recording entry and backfills "absent" status for all batch students who haven't yet been marked.
5. **Attendance Upload**: Mentor/Admin uploads a Google Meet CSV/HTML report. The system parses it, performs fuzzy matching on student names/emails (exact, word-order independent, or Levenshtein distance), calculates attendance based on percentage of time spent ($\ge 75\%$ duration), and allows mentors to review, override, and bulk-save attendance.
6. **Recording**: After the class ends, the recording is made available, and students receive automated notifications.

### Task Review Flow
- **Submission**: Students submit a GitHub URL or upload a ZIP/PDF to Supabase Storage.
- **Review Scoping**: Mentors only see "Pending" submissions for students **assigned to them** or students who are currently **unassigned**.
- **Approval**: If "Approved", the student's subtopic progress is marked complete, they receive 150 XP, and the next topic is unlocked (if all other mandatory subtopics in the current topic are complete). If "Rework", the student must resubmit based on feedback.

### Billing & Tiered Access Flow
- **Access Tiers**: Students are assigned a `demo`, `partial`, or `full` tier which dictates which modules they can fetch and view.
- **PaymentWall**: When a student attempts to access a restricted module or subtopic (throwing a custom `403 TIER_LOCKED` error), the frontend intercepts this and renders a PaymentWall component.
- **Checkout Integration**: Integrated with Razorpay for online checkouts, updating the user's `access_tier` and `payment_status` automatically upon successful signature verification. Admins can also manually record payments and upgrade tiers via the Admin Dashboard.

---

## 4. Frontend Implementation

### State Management
- **Philosophy**: Lightweight and dependency-free.
- **Authentication**: Managed via a global `AuthContext` (`frontend/src/lib/auth.jsx`) which provides `user`, `loading`, `login`, `register`, `logout`, and `refresh` functions.
- **Application State**: Purely local `useState` and `useEffect` patterns. Data is fetched via Axios on a per-page/per-component basis. No Redux or Zustand is used.

### Design System
The application follows a **Swiss & High-Contrast** aesthetic:
- **Typography**: `Outfit` for headings, `IBM Plex Sans` for body, and `JetBrains Mono` for code.
- **Color Palette**: Primary Cobalt Blue (`#194BFB`), Success Green (`#10B981`), and High-Contrast Grayscale (#09090B to #FFFFFF).
- **Layout**: "Control Room" grid layout—dense, functional, 1px borders, and sharp corners (minimal border-radius).

---

## 5. Maintenance & Design Debt

### Technical Pain Points
### Technical Pain Points
- **Monolithic Backend**: The backend is currently housed in a single **~5,000 line `server.py`**. This makes maintenance difficult and is a primary candidate for refactoring into modular routers (e.g., `auth_router`, `course_router`, `payment_router`).
- **Mixed Database Logic**: Database queries (Supabase client calls) are mixed directly with business logic and route handlers.

### Deployment & Environment
- **Target**: Frontend is deployed via **Vercel** for global CDN delivery, while the backend API runs on a Self-hosted Linux VPS (Ubuntu).
- **Process Management**: **PM2** handles the backend FastAPI process.
- **Reverse Proxy**: **Nginx** handles SSL and traffic routing for the backend.
- **Environment**: Requires `.env` with `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`.
- **Onboarding**: Integrated with **AWS Lambda** for automated student onboarding flows.
