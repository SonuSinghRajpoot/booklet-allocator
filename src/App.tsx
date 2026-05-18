import { useEffect, useState } from "react";
import { MemoryRouter as Router, Route, Routes, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./store/useAppStore";
import Onboarding from "./pages/Onboarding";
import Main from "./pages/Main";
import Settings from "./pages/Settings";
import Preview from "./pages/Preview";
import Summary from "./pages/Summary";
import LogViewer from "./pages/LogViewer";

// ---------------------------------------------------------------------------
// Inner app with keyboard shortcuts
// ---------------------------------------------------------------------------

function AppInner() {
  const navigate = useNavigate();
  const darkMode = useAppStore((s) => s.darkMode);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    getCurrentWindow().setTheme(darkMode ? "dark" : "light").catch(() => {});
  }, [darkMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        navigate("/");
      }
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
      }
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        navigate("/logs");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={<Main />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/preview" element={<Preview />} />
      <Route path="/summary" element={<Summary />} />
      <Route path="/logs" element={<LogViewer />} />
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// Root bootstrap
// ---------------------------------------------------------------------------

export default function App() {
  const { initStore, setLastCleanupDate, resetSession } =
    useAppStore();
  const [ready, setReady] = useState(false);
  const [startPath, setStartPath] = useState("/");

  useEffect(() => {
    (async () => {
      await initStore();
      resetSession();
      const state = useAppStore.getState();

      // Decide initial route
      setStartPath(state.onboardingComplete ? "/" : "/onboarding");

      // Run cleanup if not done today
      const today = new Date().toISOString().split("T")[0];
      if (state.lastCleanupDate !== today) {
        try {
          await invoke("cmd_run_log_cleanup");
          setLastCleanupDate(today);
        } catch {
          // Non-critical — ignore cleanup errors
        }
      }

      setReady(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <Router initialEntries={[startPath]}>
      <AppInner />
    </Router>
  );
}
