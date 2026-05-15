import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth";
import { TooltipProvider } from "./components/ui/tooltip";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import StudentDashboard from "./pages/StudentDashboard";
import CourseView from "./pages/CourseView";
import LessonView from "./pages/LessonView";
import MentorDashboard from "./pages/MentorDashboard";
import AdminDashboard from "./pages/AdminDashboard";

import CourseList from "./pages/CourseList";
import CourseEditor from "./pages/CourseEditor";
import AdminCourseEditor from "./pages/AdminCourseEditor";
import PlaygroundPage from "./pages/PlaygroundPage";
import ProblemLibraryPage from "./pages/ProblemLibraryPage";
import ProblemDetailPage from "./pages/ProblemDetailPage";
import ProblemManagementPage from "./pages/admin/ProblemManagementPage";
import ProfilePage from "./pages/ProfilePage";
import Leaderboard from "./pages/Leaderboard";
import TeachingMode from "./pages/TeachingMode";
import StudentProgress from "./pages/StudentProgress";


export default function App() {
  return (
    <div className="App">
      <TooltipProvider delayDuration={0}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={
                <ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute roles={["student"]}><ProfilePage /></ProtectedRoute>
              } />
              <Route path="/student/progress" element={
                <ProtectedRoute roles={["student"]}><StudentProgress /></ProtectedRoute>
              } />
              <Route path="/admin/students/:studentId/progress" element={
                <ProtectedRoute roles={["admin", "mentor"]}><StudentProgress /></ProtectedRoute>
              } />
              <Route path="/leaderboard" element={
                <ProtectedRoute roles={["student"]}><Leaderboard /></ProtectedRoute>
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
              <Route path="/mentor/live/:classId" element={
                <ProtectedRoute roles={["mentor"]}><TeachingMode /></ProtectedRoute>
              } />
              <Route path="/mentor/teach/:classId" element={
                <ProtectedRoute roles={["mentor"]}><TeachingMode /></ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>
              } />

              <Route path="/admin/courses" element={
                <ProtectedRoute roles={["admin", "mentor"]}><CourseList /></ProtectedRoute>
              } />
              <Route path="/admin/course/:id" element={
                <ProtectedRoute roles={["admin"]}><AdminCourseEditor /></ProtectedRoute>
              } />

              <Route path="/playground" element={
                <ProtectedRoute><PlaygroundPage /></ProtectedRoute>
              } />
              <Route path="/problems" element={
                <ProtectedRoute><ProblemLibraryPage /></ProtectedRoute>
              } />
              <Route path="/problems/:id" element={
                <ProtectedRoute><ProblemDetailPage /></ProtectedRoute>
              } />
              <Route path="/admin/problems" element={
                <ProtectedRoute roles={["admin"]}><ProblemManagementPage /></ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
          <Toaster richColors position="top-right" closeButton />
        </AuthProvider>
      </TooltipProvider>
    </div>
  );
}
