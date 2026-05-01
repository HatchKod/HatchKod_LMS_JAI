# HatchKod LMS

HatchKod LMS is a full-stack learning management system built with React (Frontend), FastAPI (Backend), and Supabase (Database).

## Prerequisites
- Node.js (v16+)
- Python (3.9+)
- A [Supabase](https://supabase.com/) account and project.

## Local Development Setup

Follow these steps to get the application running on your local machine.

### Step 1: Configure Your Supabase Credentials

1. Go to your **Supabase Dashboard** -> Project Settings -> API.
2. In the `backend` directory, open the `.env` file (create it if it doesn't exist).
3. Update the file with your specific credentials:

```env
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_KEY="your-supabase-anon-key"

JWT_SECRET="super-secret-jwt-key-change-me"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_MIN=60

ADMIN_EMAIL="admin@hatchkod.com"
ADMIN_PASSWORD="secure_admin_password"
```

### Step 2: Database Schema
Make sure you have executed the required SQL schema for the application (`users`, `courses`, `modules`, `lessons`, `tasks`, `submissions`, `student_progress` tables) directly in your Supabase SQL Editor before starting the server.

### Step 3: Start the Backend Server

The backend is built with FastAPI and runs on Python.

1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI server using Uvicorn:
   ```bash
   uvicorn server:app --reload
   ```

> **Note:** The first time your server starts, it will automatically run a seed script to create an Admin, a Mentor, a Student, and a sample Course in your Supabase database.

### Step 4: Start the Frontend Application

The frontend is built with React.

1. Open a **new, separate terminal** window and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the React development server:
   ```bash
   npm start
   ```

### Step 5: Test the System

1. Your frontend will automatically open in your browser at `http://localhost:3000`.
2. Try logging in with the seeded accounts to verify everything works:
   - **Admin Login:** `admin@hatchkod.com` | `secure_admin_password` (or whatever you set in `.env`)
   - **Student Login:** `student@hatchkod.com` | `student123`
   - **Mentor Login:** `mentor@hatchkod.com` | `mentor123`

# npm install @monaco-editor/react