import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import StudentDashboard from "./pages/StudentDashboard";
import CourseView from "./pages/CourseView";
import LessonView from "./pages/LessonView";
import MentorDashboard from "./pages/MentorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminCourseEditor from "./pages/AdminCourseEditor";

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={
              <ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>
            } />
            <Route path="/course/:id" element={
              <ProtectedRoute roles={["student", "mentor", "admin"]}><CourseView /></ProtectedRoute>
            } />
            <Route path="/lesson/:id" element={
              <ProtectedRoute roles={["student", "mentor", "admin"]}><LessonView /></ProtectedRoute>
            } />
            <Route path="/mentor" element={
              <ProtectedRoute roles={["mentor"]}><MentorDashboard /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/admin/course/:id" element={
              <ProtectedRoute roles={["admin"]}><AdminCourseEditor /></ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </div>
  );
}
