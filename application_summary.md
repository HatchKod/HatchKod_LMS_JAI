# HatchKod LMS - Application Summary

HatchKod is a high-performance, task-driven Learning Management System (LMS) specifically designed for engineering education. Unlike traditional LMS platforms that focus on passive video consumption, HatchKod emphasizes a **"Learn-by-Building"** philosophy, where progression is gated by human (mentor) validation of practical work.

## 🚀 Core Philosophy
The platform operates on a strict feedback loop:
1. **Consume**: Watch a lesson or read a technical brief.
2. **Build**: Implement the task locally and push to a version control system (GitHub).
3. **Submit**: Provide the work URL for review.
4. **Review**: A dedicated mentor reviews the code/project.
5. **Progress**: The next lesson unlocks **only** after mentor approval. No skipping ahead.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React.js
- **Styling**: Tailwind CSS with a custom Design System.
- **UI Components**: Radix UI (via shadcn/ui) for accessible, premium-feel components.
- **Icons**: Lucide React.
- **Routing**: React Router DOM.
- **State Management**: React Hooks (useState, useEffect, useMemo).
- **API Client**: Axios with interceptors for JWT management.

### Backend
- **Framework**: FastAPI (Python 3.x) - Selected for its speed and asynchronous capabilities.
- **Authentication**: JWT (JSON Web Tokens) with secure HTTP-only cookie storage.
- **Security**: Hashed passwords using `bcrypt`.
- **Concurrency**: Asynchronous database operations using `httpx`.

### Database & Backend-as-a-Service
- **Provider**: Supabase (PostgreSQL).
- **Storage**: Real-time database for user profiles, course structures, and submission tracking.

---

## ✨ Key Features

### 1. Role-Based Access Control (RBAC)
- **Administrators**: Full platform control, curriculum management, and user lifecycle oversight.
- **Mentors**: Dedicated dashboard for reviewing submissions and managing assigned students.
- **Students**: Personalized learning path, task submission portal, and progress tracking.

### 2. Comprehensive Course Engine
- Hierarchical content structure: **Courses ➔ Modules ➔ Lessons**.
- Support for embedded video content and detailed markdown/text briefs.
- Status management (Draft, Published, Inactive) for curriculum control.

### 3. Mentor-Driven Workflow
- **Assignment System**: Admins can map students to specific mentors to balance workload.
- **Review Portal**: Mentors can approve, request rework, or provide feedback on student submissions.
- **Validation-Locked Progression**: Ensures students master the current topic before moving to the next.

### 4. Advanced Admin Dashboard
- **Metric Chips**: Quick-glance statistics for platform health (Active Students, Pending Submissions, etc.).
- **User Lifecycle Management**:
    - Admin-only account creation (Closed Registration Flow).
    - One-click user deactivation/reactivation.
    - Collapsible "Inactive Users" archive for historical tracking.
- **Unified Interface**: Clean, tabbed layout that scopes actions (like "Add User" or "New Course") to the current context.

### 5. Interactive Java Playground
- **Real-time IDE**: Integrated Monaco Editor (the core of VS Code) for a professional coding experience directly in the browser.
- **Remote Execution**: Leverages the Piston API to safely compile and run Java code without local setup.
- **Live Console**: Instant feedback with a terminal-style output panel for stdout, stderr, and exit codes.

### 6. Security & Privacy
- **Closed Onboarding**: Registration is restricted to admin-created accounts to maintain a private, high-quality learning environment.
- **Secure Auth**: Protected endpoints and session management to prevent unauthorized access.

---

## 🎨 Design Aesthetics
- **Modern UI**: A clean, "Inter" and "Outfit" typography-based design with a professional blue (`#194BFB`) primary accent.
- **Information Density**: Optimized for productivity with compact metric chips and scannable lists.
- **User Context**: Avatars, student-count badges for mentors, and status indicators provide instant visual context.

---

## 📈 Future Scalability
- **Modular Backend**: Easy to add new review types or integration with external CI/CD tools.
- **Component-Driven Frontend**: Reusable UI library allows for rapid expansion of new features like "Community Forums" or "Live Workshops".
