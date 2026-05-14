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
// Password modal for Log Viewer
// ---------------------------------------------------------------------------

function LogPasswordModal({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    setError("");
    try {
      const ok = await invoke<boolean>("cmd_verify_log_password", { password });
      if (ok) {
        onSuccess();
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch (e: unknown) {
      // If the env var was never set, the error message explains why
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">Log Viewer — Password Required</h2>
        <input
          type="password"
          className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 mb-3
                     bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verify()}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm border border-gray-300 dark:border-gray-600
                       hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={verify}
            disabled={checking || !password}
            className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700
                       disabled:opacity-50"
          >
            {checking ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner app with keyboard shortcuts
// ---------------------------------------------------------------------------

function AppInner() {
  const navigate = useNavigate();
  const [showLogModal, setShowLogModal] = useState(false);
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
        setShowLogModal(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  return (
    <>
      {showLogModal && (
        <LogPasswordModal
          onSuccess={() => {
            setShowLogModal(false);
            navigate("/logs");
          }}
          onClose={() => setShowLogModal(false)}
        />
      )}

      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<Main />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/preview" element={<Preview />} />
        <Route path="/summary" element={<Summary />} />
        <Route path="/logs" element={<LogViewer />} />
      </Routes>
    </>
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
