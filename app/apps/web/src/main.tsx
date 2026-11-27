import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { SessionGate } from "./components/SessionGate.tsx";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "./index.css";
import "./palettes.css";
import "./layouts.css";
import "./design-layouts.css";
import "./fieldbook.css";
import "./study-instrument.css";
const Activity = lazy(() => import("./pages/Activity.tsx").then((m) => ({ default: m.Activity })));
const Guide = lazy(() => import("./pages/Guide.tsx").then((m) => ({ default: m.Guide })));
const VisualPage = lazy(() => import("./pages/VisualPage.tsx").then((m) => ({ default: m.VisualPage })));
const Settings = lazy(() => import("./pages/Settings.tsx").then((m) => ({ default: m.Settings })));
import { Home } from "./pages/Home.tsx";
const Learning = lazy(() => import("./pages/Learning.tsx").then((m) => ({ default: m.Learning })));
const ClassroomPage = lazy(() => import("./pages/Classroom.tsx").then(m => ({ default: m.ClassroomPage })));
const LearningDetail = lazy(() => import("./pages/LearningDetail.tsx").then((m) => ({ default: m.LearningDetail })));
const More = lazy(() => import("./pages/More.tsx").then((m) => ({ default: m.More })));
const NoteDetail = lazy(() => import("./pages/NoteDetail.tsx").then((m) => ({ default: m.NoteDetail })));
const Notes = lazy(() => import("./pages/Notes.tsx").then((m) => ({ default: m.Notes })));
import { NotFound } from "./pages/NotFound.tsx";
const ProjectDetail = lazy(() => import("./pages/ProjectDetail.tsx").then((m) => ({ default: m.ProjectDetail })));
const Projects = lazy(() => import("./pages/Projects.tsx").then((m) => ({ default: m.Projects })));
const Quizzes = lazy(() => import("./pages/Quizzes.tsx").then((m) => ({ default: m.Quizzes })));
const QuizTake = lazy(() => import("./pages/QuizTake.tsx").then((m) => ({ default: m.QuizTake })));
const Schedule = lazy(() => import("./pages/Schedule.tsx").then((m) => ({ default: m.Schedule })));
const Skills = lazy(() => import("./pages/Skills.tsx").then((m) => ({ default: m.Skills })));

const queryClient = new QueryClient({
  defaultOptions: {
    // AI clients edit the same files, so refresh when the window regains focus.
    queries: { refetchOnWindowFocus: true, staleTime: 2_000, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionGate>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="learning" element={<Learning />} />
              <Route path="learning/classroom/:id" element={<ClassroomPage />} />
              <Route path="learning/drafts/:id" element={<ClassroomPage draft />} />
              <Route path="learning/:id" element={<LearningDetail />} />
              <Route path="learning/:id/visuals/:vid" element={<VisualPage />} />
              <Route path="skills" element={<Skills />} />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="quizzes/:id" element={<QuizTake />} />
              <Route path="notes" element={<Notes />} />
              <Route path="notes/:id" element={<NoteDetail />} />
              <Route path="activity" element={<Activity />} />
              <Route path="guide" element={<Guide />} />
              <Route path="settings" element={<Settings />} />
              <Route path="more" element={<More />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionGate>
    </QueryClientProvider>
  </StrictMode>,
);

// Keep-alive while a window is open: the desktop launcher runs the server with --idle-exit,
// so it shuts down (0 RAM) only after every window is closed.
if (import.meta.env.PROD) {
  setInterval(() => fetch("/api/session").catch(() => {}), 4 * 60_000);
}

// Installable app (PWA). Browsers only allow service workers on https or localhost.
if (import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
