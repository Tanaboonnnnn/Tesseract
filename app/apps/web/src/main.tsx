import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { SessionGate } from "./components/SessionGate.tsx";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./index.css";
import "./palettes.css";
import "./layouts.css";
import { Activity } from "./pages/Activity.tsx";
import { Guide } from "./pages/Guide.tsx";
import { VisualPage } from "./pages/VisualPage.tsx";
import { Settings } from "./pages/Settings.tsx";
import { Home } from "./pages/Home.tsx";
import { Learning } from "./pages/Learning.tsx";
import { LearningDetail } from "./pages/LearningDetail.tsx";
import { More } from "./pages/More.tsx";
import { NoteDetail } from "./pages/NoteDetail.tsx";
import { Notes } from "./pages/Notes.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { ProjectDetail } from "./pages/ProjectDetail.tsx";
import { Projects } from "./pages/Projects.tsx";
import { Quizzes } from "./pages/Quizzes.tsx";
import { QuizTake } from "./pages/QuizTake.tsx";
import { Schedule } from "./pages/Schedule.tsx";
import { Skills } from "./pages/Skills.tsx";

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
