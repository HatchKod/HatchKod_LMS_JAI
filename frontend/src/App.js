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
import AdminCourseEditor from "./pages/AdminCourseEditor";
import PlaygroundPage from "./pages/PlaygroundPage";
import ProblemLibraryPage from "./pages/ProblemLibraryPage";
import ProblemDetailPage from "./pages/ProblemDetailPage";
import ProblemManagementPage from "./pages/admin/ProblemManagementPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  return (
    <div className="App">
      <TooltipProvider delayDuration={0}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={
                <ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute roles={["student"]}><ProfilePage /></ProtectedRoute>
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
