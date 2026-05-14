import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";

export default function Preview() {
  const navigate = useNavigate();
  const {
    allocationResults,
    lastFilePath,
    testId,
    cycles,
    evaluatorInputs,
    studentField,
    evaluatorField,
    nickname,
    setWrittenFilePaths,
  } = useAppStore();

  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");

  if (!allocationResults.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <p className="text-gray-500 dark:text-gray-400">No allocation results to preview.</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Evaluators appearing in multiple cycles
  const idCount: Record<string, number> = {};
  for (const result of allocationResults) {
    for (const alloc of result.allocations) {
      idCount[alloc.evaluator_id] = (idCount[alloc.evaluator_id] ?? 0) + 1;
    }
  }
  const crossCycleEvals = new Set(
    Object.entries(idCount)
      .filter(([, c]) => c > 1)
      .map(([id]) => id)
  );

  // Cycles that were skipped (empty evaluator box)
  const skippedCycles = cycles.filter((c) => {
    const input = (evaluatorInputs[c.id] ?? "").trim();
    return !input;
  });

  const filename = lastFilePath ? lastFilePath.split(/[\\/]/).pop() ?? "" : "";
  const outputDir = lastFilePath
    ? lastFilePath.substring(
        0,
        Math.max(lastFilePath.lastIndexOf("\\"), lastFilePath.lastIndexOf("/"))
      )
    : "";

  const confirmAndWrite = async () => {
    setWriting(true);
    setWriteError("");
    try {
      // Build write inputs
      const writeInputs = allocationResults.map((result) => {
        const rows: Array<{ test_id: string; evaluator_id: string; user_id: string }> = [];
        for (const alloc of result.allocations) {
          for (const studentId of alloc.student_ids) {
            rows.push({
              test_id: testId || "",
              evaluator_id: alloc.evaluator_id,
              user_id: studentId,
            });
          }
        }
        return {
          cycle_name: result.cycle_name,
          original_filename: filename,
          output_dir: outputDir,
          rows,
        };
      });

      const writtenPaths = await invoke<string[]>("cmd_write_output_files", {
        cycles: writeInputs,
      });

      // Build and append audit log entry
      try {
        const entry = await invoke("cmd_build_audit_entry", {
          nickname,
          settingsSnapshot: {
            cycles: cycles.map((c) => ({ name: c.name, percentage: c.percentage })),
            student_field: studentField,
            evaluator_field: evaluatorField,
          },
          inputFilename: filename,
          testId: testId || "",
          cycleResults: allocationResults,
        });
        await invoke("cmd_append_audit_log", { entry });
      } catch {
        // Audit log failure is non-fatal
      }

      setWrittenFilePaths(writtenPaths);
      navigate("/summary");
    } catch (e: unknown) {
      setWriteError(String(e));
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header
        className="bg-white dark:bg-gray-800 border-b border-gray-200
                    dark:border-gray-700 px-6 py-4 flex items-center gap-4"
      >
        <button
          onClick={() => navigate("/")}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
        >
          ← Go back &amp; edit
        </button>
        <h1 className="text-lg font-semibold">Preview Allocation</h1>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Cross-cycle warning */}
        {crossCycleEvals.size > 0 && (
          <div
            className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200
                        dark:border-amber-700 rounded-lg text-sm"
          >
            <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">
              ⚠ Evaluators in multiple cycles
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-xs">
              {Array.from(crossCycleEvals).join(", ")}
            </p>
          </div>
        )}

        {/* Skipped cycles */}
        {skippedCycles.map((c) => (
          <div
            key={c.id}
            className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200
                        dark:border-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400"
          >
            {c.name} — skipped (no evaluators defined)
          </div>
        ))}

        {/* Allocation results */}
        {allocationResults.map((result) => (
          <div
            key={result.cycle_name}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200
                        dark:border-gray-700 overflow-hidden"
          >
            {/* Cycle header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700
                            bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                  {result.cycle_name}
                </h2>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>Pool: {result.pool_size} booklets</span>
                  <span>{result.allocations.length} evaluators</span>
                </div>
              </div>
            </div>

            {/* Evaluator breakdown */}
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {result.allocations.map((alloc) => (
                <div
                  key={alloc.evaluator_id}
                  className={`flex items-center justify-between px-5 py-3 text-sm ${
                    crossCycleEvals.has(alloc.evaluator_id)
                      ? "bg-amber-50 dark:bg-amber-900/10"
                      : ""
                  }`}
                >
                  <span
                    className={`font-mono text-xs ${
                      crossCycleEvals.has(alloc.evaluator_id)
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {alloc.evaluator_id}
                    {crossCycleEvals.has(alloc.evaluator_id) && (
                      <span className="ml-1 text-amber-500">⚠</span>
                    )}
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {alloc.booklet_count} booklets
                  </span>
                </div>
              ))}
            </div>

            {/* Output path preview */}
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700 border-t
                            border-gray-100 dark:border-gray-700 text-xs text-gray-400">
              → {result.cycle_name} - {filename}
            </div>
          </div>
        ))}

        {writeError && (
          <div
            className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200
                        dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300"
          >
            {writeError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600
                       text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            ← Go back &amp; edit
          </button>
          <button
            onClick={confirmAndWrite}
            disabled={writing}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold
                       hover:bg-green-700 disabled:opacity-50 transition shadow-sm"
          >
            {writing ? "Writing files…" : "✓ Confirm & write files"}
          </button>
        </div>
      </div>
    </div>
  );
}
