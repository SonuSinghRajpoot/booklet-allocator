import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/useAppStore";
import WelcomeBanner from "../components/WelcomeBanner";
import EvaluatorInput, {
  parseEvaluatorInput,
  validateEvaluators,
} from "../components/EvaluatorInput";
import InfoButton from "../components/InfoButton";

const FILE_VALIDATION_TIP =
  "The app detects merged header rows automatically:\n\n" +
  "  Row 0: [=== Merged Title ===]\n" +
  "  Row 1: Member Id | Email | Name   ← used as headers\n" +
  "  Row 2+: student data\n\n" +
  "If there is no merged row:\n" +
  "  Row 0: Member Id | Email | Name   ← used as headers\n" +
  "  Row 1+: student data";



interface AllocationResult {
  cycle_name: string;
  pool_size: number;
  allocations: Array<{
    evaluator_id: string;
    student_ids: string[];
    booklet_count: number;
  }>;
}

export default function Main() {
  const navigate = useNavigate();
  const {
    cycles,
    studentField,
    evaluatorField,
    evaluatorInputs,
    setEvaluatorInput,
    lastFilePath,
    setLastFilePath,
    setTestId,
    masterData,
    setMasterData,
    setAllocationResults,
    darkMode,
    setDarkMode,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dupWarning, setDupWarning] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>([]);

  // -------------------------------------------------------------------------
  // File selection
  // -------------------------------------------------------------------------

  const openFile = async () => {
    setFileError("");
    const selected = await open({
      filters: [{ name: "Excel files", extensions: ["xlsx"] }],
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    await loadFile(selected);
  };

  const loadFile = async (path: string) => {
    setLoading(true);
    setFileError("");
    setDupWarning("");
    try {
      const result = await invoke<{
        master_data: Array<{ id: string; data: Record<string, string> }>;
        test_id: string | null;
        duplicate_count: number;
        row_count: number;
        headers: string[];
      }>("cmd_validate_input_file", {
        path,
        studentIdColumn: studentField,
      });

      setMasterData({
        rows: result.master_data,
        headers: result.headers,
        rowCount: result.row_count,
        duplicateCount: result.duplicate_count,
      });
      setLastFilePath(path);
      setTestId(result.test_id ?? "");

      if (result.duplicate_count > 0) {
        setDupWarning(
          `${result.duplicate_count} duplicate student ID${
            result.duplicate_count > 1 ? "s were" : " was"
          } removed from the input.`
        );
      }
    } catch (e: unknown) {
      setFileError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        openFile();
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (!isBlocked) handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const parsedByCycle = cycles.map((c) => {
    const input = evaluatorInputs[c.id] ?? "";
    const parsed = parseEvaluatorInput(input, evaluatorField);
    const summary = validateEvaluators(parsed, []);
    return { cycle: c, input, parsed, summary };
  });

  // Cross-cycle duplicates
  const idCount: Record<string, number> = {};
  for (const { parsed } of parsedByCycle) {
    for (const e of parsed.filter((e) => !e.error)) {
      idCount[e.id] = (idCount[e.id] ?? 0) + 1;
    }
  }
  const crossCycleEvals = Object.entries(idCount)
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  const blockingErrors: string[] = [];
  for (const { cycle, summary } of parsedByCycle) {
    if (summary.isOverHundred)
      blockingErrors.push(
        `${cycle.name}: percentages sum to ${summary.sumPct.toFixed(1)}% (>100%)`
      );
    if (summary.isUnderHundredNoFree)
      blockingErrors.push(
        `${cycle.name}: percentages sum to ${summary.sumPct.toFixed(1)}% with no free evaluators`
      );
    if (summary.duplicateIds.length > 0)
      blockingErrors.push(
        `${cycle.name}: duplicate evaluator IDs — ${summary.duplicateIds.join(", ")}`
      );
  }

  const noEvaluatorsAnywhere = parsedByCycle.every(
    ({ parsed }) => parsed.filter((e) => !e.error).length === 0
  );
  if (noEvaluatorsAnywhere && cycles.length > 0) {
    blockingErrors.push("Enter at least one evaluator in at least one cycle.");
  }

  const isBlocked = blockingErrors.length > 0 || !masterData || !lastFilePath;

  // -------------------------------------------------------------------------
  // Run
  // -------------------------------------------------------------------------

  const handleRun = async () => {
    if (isBlocked) return;
    setRunning(true);
    setRunError("");
    try {
      const cycleInputs = parsedByCycle
        .filter(({ parsed }) => parsed.filter((e) => !e.error).length > 0)
        .map(({ cycle, parsed }) => ({
          cycle: { name: cycle.name, percentage: cycle.percentage },
          evaluators: parsed
            .filter((e) => !e.error)
            .map((e) => ({ id: e.id, explicit_pct: e.explicitPct ?? null })),
        }));

      const results = await invoke<AllocationResult[]>("cmd_run_allocation", {
        masterData: masterData!.rows,
        cycles: cycleInputs,
      });

      setAllocationResults(results);
      navigate("/preview");
    } catch (e: unknown) {
      setRunError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setLastFilePath("");
    setMasterData(null);
    setTestId("");
    cycles.forEach((c) => setEvaluatorInput(c.id, ""));
    setFileError("");
    setDupWarning("");
    setRunError("");
    setDismissedWarnings([]);
  };

  const filename = lastFilePath ? lastFilePath.split(/[\\/]/).pop() : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header
        className="shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200
                    dark:border-gray-700 px-4 py-2 flex items-center justify-between"
      >
        <span className="text-base font-bold text-blue-600 dark:text-blue-400">
          Booklet Allocator
        </span>
        <div className="flex items-center gap-2">
          <WelcomeBanner />
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                       border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1
                       bg-transparent dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Toggle light/dark mode"
          >
            {darkMode ? "☀ Light" : "☾ Dark"}
          </button>
          <button
            onClick={() => navigate("/logs")}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                       border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1
                       bg-transparent dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Audit Logs (Ctrl+Shift+L)"
          >
            📋 Logs
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                       border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1
                       bg-transparent dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Settings (Ctrl+,)"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* File Section */}
        <section
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200
                      dark:border-gray-700 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              Input File
              <InfoButton tip={FILE_VALIDATION_TIP} />
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openFile}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium
                         hover:bg-blue-700 transition shrink-0"
              title="Open file (Ctrl+O)"
            >
              Browse…
            </button>
            {filename ? (
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-500 dark:text-gray-400">Selected: </span>
                <span className="text-xs font-medium text-gray-800 dark:text-gray-200 break-all">
                  {filename}
                </span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                No file selected
              </span>
            )}
          </div>

          {loading && <p className="text-xs text-blue-500">Validating file…</p>}
          {fileError && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
              {fileError}
            </p>
          )}
          {dupWarning && (
            <p
              className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50
                          dark:bg-amber-900/20 px-2 py-1 rounded"
            >
              ⚠ {dupWarning}
            </p>
          )}
          {masterData && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {masterData.rowCount} student records loaded
            </p>
          )}

        </section>

        {/* Evaluator Inputs */}
        {cycles.length === 0 ? (
          <div
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200
                        dark:border-gray-700 p-6 text-center"
          >
            <p className="text-gray-400 dark:text-gray-500 text-xs mb-2">
              No cycles configured yet.
            </p>
            <button
              onClick={() => navigate("/settings")}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium
                         hover:bg-blue-700 transition"
            >
              Open Settings to add cycles
            </button>
          </div>
        ) : (
          <section
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200
                        dark:border-gray-700 p-4 space-y-4"
          >
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Evaluators per Cycle
            </h2>
            {cycles.map((cycle) => (
              <EvaluatorInput
                key={cycle.id}
                cycleId={cycle.id}
                cycleName={cycle.name}
                value={evaluatorInputs[cycle.id] ?? ""}
                onChange={(v) => setEvaluatorInput(cycle.id, v)}
                totalStudents={masterData?.rowCount}
                cyclePercent={cycle.percentage}
                evaluatorField={evaluatorField}
              />
            ))}
          </section>
        )}

        {/* Warnings Panel */}
        {(crossCycleEvals.length > 0 || blockingErrors.length > 0) && (
          <section className="space-y-1.5">
            {crossCycleEvals
              .filter((id) => !dismissedWarnings.includes(id))
              .map((id) => (
                <div
                  key={id}
                  className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20
                             border border-amber-200 dark:border-amber-700 rounded-lg text-xs"
                >
                  <span className="text-amber-600 dark:text-amber-400 shrink-0">⚠</span>
                  <span className="flex-1 text-amber-700 dark:text-amber-300">
                    Evaluator <strong>{id}</strong> appears in multiple cycles.
                  </span>
                  <button
                    onClick={() => setDismissedWarnings((w) => [...w, id])}
                    className="text-amber-500 hover:text-amber-700 shrink-0 text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            {blockingErrors.map((err, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20
                           border border-red-200 dark:border-red-700 rounded-lg text-xs"
              >
                <span className="text-red-500 shrink-0">✗</span>
                <span className="text-red-700 dark:text-red-300">{err}</span>
              </div>
            ))}
          </section>
        )}

        {runError && (
          <div
            className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200
                        dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-300"
          >
            {runError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex-none px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                       text-gray-600 dark:text-gray-400 font-medium text-xs
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            Reset
          </button>
          <button
            onClick={handleRun}
            disabled={isBlocked || running}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm
                       hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition shadow-sm"
            title="Preview allocation (Ctrl+Enter)"
          >
            {running ? "Computing allocation…" : "Preview allocation"}
          </button>
        </div>

        {!masterData && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Load an Excel file to enable the run button.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
