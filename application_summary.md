# HatchKod LMS — Comprehensive Project Summary

## 1. Overview
HatchKod LMS is a production-grade Learning Management System built for a "learn-by-building" methodology. It is specifically designed for technical education, featuring automated code execution, mandatory task progression, and a robust mentor review system.

### Core Technology Stack
| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Tailwind CSS, Radix UI, Lucide, Axios, Sonner, **TanStack Query (React Query)** |
| **Backend** | FastAPI (Python 3.9+), PyJWT, Bcrypt, HTTPX, **Redis**, **FastAPI-Cache2** |
| **Database/BaaS** | Supabase (PostgreSQL, Storage, Real-time) |
| **Infrastructure** | Judge0 (Code Execution), AWS Lambda (Email Triggers), PM2, Nginx |

---

## 2. Technical Architecture Details

### Performance & Caching Architecture
To ensure high stability and sub-second response times, the system employs a multi-layered caching strategy:
- **Frontend Caching (TanStack Query)**:
    - Implemented global state management for server data with `staleTime` and `cacheTime` optimizations.
    - Automatic request deduplication prevents redundant API calls from multiple components (e.g., Navbar and Dashboard).
    - Background refetching and window-focus synchronization keep the UI fresh without manual reloads.
- **Backend Caching (Redis + FastAPI-Cache)**:
    - **Global Cache**: Common metadata like course lists and syllabus structure are cached with a 1-hour TTL.
    - **User-Scoped Caching**: Dynamic data like the Student Dashboard is cached using a custom `user_key_builder` that hashes the User ID into the cache key, ensuring security and data isolation.
    - **Automatic Fallback**: The system detects Redis availability at startup; if Redis is unreachable, it gracefully falls back to an `InMemoryBackend` to maintain performance.
- **Database Connection Stability**:
    - **Forced HTTP/1.1**: Disables HTTP/2 to prevent "Server disconnected" errors common in Postgrest/Supabase stream handling.
    - **Safe Execution Wrapper**: All critical database queries are wrapped in `safe_supabase_execute`, which provides **exponential backoff and automatic retries** for transient network failures.

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

### Live Class & Teaching Mode
1. **Scheduling**: Mentor schedules a live session for a batch.
2. **Teaching Mode**: A specialized mentor interface for live instruction:
    - **Real-time Attendance**: The system polls for active student connections every 10 seconds.
    - **Interactive Syllabus**: Mentor can navigate through subtopics, which syncs the view for students.
    - **Broadcast Reminders**: Mentors can send one-click "Join Now" notifications to absent students via Supabase Broadcast.
    - **Content Delivery**: Supports multi-page markdown rendering for structured lessons.
3. **Ending**: Mentor ends class → Session status becomes `ended` → Automated notifications sent → System backfills "absent" status for non-attendees.
4. **Attendance Upload**: Mentor/Admin can upload Google Meet reports with fuzzy-matching logic to override/finalize attendance.
5. **Recording**: Integrated recording upload flow makes the session available to students immediately after the class.

### Task Review Flow
- **Submission**: Students submit a GitHub URL or upload a ZIP/PDF to Supabase Storage.
- **Review Scoping**: Mentors only see "Pending" submissions for students **assigned to them** or students who are currently **unassigned**.
- **Approval**: If "Approved", the student's subtopic progress is marked complete, they receive 150 XP, and the next topic is unlocked.

### Problem Library & Coding Challenges
- **Standalone Challenges**: A library of coding problems (`problems` table) independent of the course syllabus.
- **Execution**: Supports multiple languages (Python, JS, C++) via Judge0.
- **Tracking**: Tracks "Solved" vs "Attempted" status for students, rewarding XP upon successful submission.

### Referral & Payout System
- **Generation**: Unique referral codes generated for all users.
- **Incentives**:
    - **Referrer**: Receives ₹1500 payout (tracked via Admin Dashboard) and XP bonuses.
    - **Referred Student**: Receives a ₹500 discount on their course payment.
- **Management**: Admin interface for validating, rejecting, or marking referral payouts as "Paid" with UTR tracking.

### Billing & Tiered Access Flow
- **Access Tiers**: Students are assigned a `demo`, `partial`, or `full` tier which dictates which modules they can view.
- **PaymentWall**: Throwing custom `403 TIER_LOCKED` errors which the frontend intercepts to render a checkout UI.
- **Checkout Integration**: Razorpay integration for automated tier upgrades and payment tracking.

---

## 4. Frontend Implementation

### State Management
- **Philosophy**: Lightweight and optimized.
- **Authentication**: Managed via global `AuthContext`.
- **Data Fetching**: Refactored to use **TanStack Query** for caching, deduplication, and background synchronization, replacing raw `useEffect` patterns.

### Design System
- **Typography**: `Outfit` (Headings), `IBM Plex Sans` (Body), `JetBrains Mono` (Code).
- **Aesthetic**: Swiss-style high-contrast grid layout with 1px borders and cobalt blue accents.

---

## 5. Maintenance & Design Debt

### Technical Pain Points
- **Monolithic Backend**: The backend is currently housed in a single **~5,400 line `server.py`**. While stability and performance have been optimized via caching and safe-execution wrappers, modularizing this into dedicated routers is a priority.
- **Mixed Database Logic**: Database queries are often mixed with business logic; moving towards a Service/Repository pattern would improve testability.

### Deployment & Environment
- **Target**: Frontend is deployed via **Vercel** for global CDN delivery, while the backend API runs on a Self-hosted Linux VPS (Ubuntu).
- **Process Management**: **PM2** handles the backend FastAPI process.
- **Reverse Proxy**: **Nginx** handles SSL and traffic routing for the backend.
- **Environment**: Requires `.env` with `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`.
- **Onboarding**: Integrated with **AWS Lambda** for automated student onboarding flows.
