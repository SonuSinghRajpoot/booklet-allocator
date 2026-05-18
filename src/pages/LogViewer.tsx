import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

interface LogEntry {
  datetime?: string;
  nickname?: string;
  mac_address?: string;
  settings_snapshot?: {
    cycles?: Array<{ name: string; percentage: number }>;
    student_field?: string;
    evaluator_field?: string;
  };
  input_filename?: string;
  test_id?: string;
  cycles?: Array<{
    cycle_name: string;
    pool_size: number;
    evaluators: Array<{ id: string; booklets: number; share_pct?: number; input_pct?: number | null }>;
  }>;
  error?: string;
}

export default function LogViewer() {
  const navigate = useNavigate();

  // All available log files
  const [logFiles, setLogFiles] = useState<string[]>([]);

  // Single-file mode
  const [selectedFile, setSelectedFile] = useState("");

  // Multi-file / date-range mode
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [dateRangeMode, setDateRangeMode] = useState(false);

  // Loaded entries + metadata
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadedFrom, setLoadedFrom] = useState<string[]>([]); // which files were loaded
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedSettings, setExpandedSettings] = useState<Set<number>>(new Set());

  // In-memory filters (applied to already-loaded entries)
  const [filterMac, setFilterMac] = useState("");
  const [filterCycle, setFilterCycle] = useState("");
  const [filterFilename, setFilterFilename] = useState("");

  // -----------------------------------------------------------------------
  // Load log file list on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    invoke<string[]>("cmd_list_log_files")
      .then((files) => {
        setLogFiles(files);
        if (files.length > 0) {
          setSelectedFile(files[0]);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  // -----------------------------------------------------------------------
  // Single-file load: triggers when file selector changes (and not in range mode)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (dateRangeMode || !selectedFile) return;
    loadSingleFile(selectedFile);
  }, [selectedFile, dateRangeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const loadSingleFile = async (filename: string) => {
    setLoading(true);
    setError("");
    setEntries([]);
    setLoadedFrom([]);
    try {
      const data = await invoke<LogEntry[]>("cmd_read_log_file", { filename });
      setEntries(data as LogEntry[]);
      setLoadedFrom([filename]);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Load all files whose date falls within [from, to]
  const loadDateRange = async () => {
    if (!filterDateFrom && !filterDateTo) return;
    setLoading(true);
    setError("");
    setEntries([]);
    setLoadedFrom([]);

    const matched = logFiles.filter((f) => {
      // filename format: YYYY-MM-DD.log.enc
      const datePart = f.replace(".log.enc", "");
      if (filterDateFrom && datePart < filterDateFrom) return false;
      if (filterDateTo && datePart > filterDateTo) return false;
      return true;
    });

    if (matched.length === 0) {
      setError("No log files found for the selected date range.");
      setLoading(false);
      return;
    }

    const combined: LogEntry[] = [];
    const loaded: string[] = [];
    for (const filename of matched) {
      try {
        const data = await invoke<LogEntry[]>("cmd_read_log_file", { filename });
        combined.push(...(data as LogEntry[]));
        loaded.push(filename);
      } catch {
        // Mark file as tampered/unreadable but continue
        combined.push({ error: `Could not read ${filename}` });
      }
    }

    setEntries(combined);
    setLoadedFrom(loaded);
    setDateRangeMode(true);
    setLoading(false);
  };

  const resetToSingleFile = () => {
    setDateRangeMode(false);
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMac("");
    setFilterCycle("");
    setFilterFilename("");
    if (selectedFile) loadSingleFile(selectedFile);
  };

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const uniqueMacs = useMemo(() => {
    const macs = new Set<string>();
    for (const e of entries) {
      if (e.mac_address) macs.add(e.mac_address);
    }
    return Array.from(macs).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (e.error) return true;
      if (filterMac && e.mac_address !== filterMac) return false;
      if (
        filterFilename &&
        !e.input_filename?.toLowerCase().includes(filterFilename.toLowerCase())
      )
        return false;
      if (filterCycle) {
        const hasCycle = e.cycles?.some((c) =>
          c.cycle_name.toLowerCase().includes(filterCycle.toLowerCase())
        );
        if (!hasCycle) return false;
      }
      return true;
    });
  }, [entries, filterMac, filterFilename, filterCycle]);

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  const exportVisible = async (format: "txt" | "csv") => {
    const ext = format === "csv" ? "csv" : "txt";
    const path = await save({
      defaultPath: `log-export.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (!path) return;

    let content = "";
    if (format === "csv") {
      content =
        "datetime,nickname,mac_address,input_filename,test_id,cycle_name,evaluator,input_pct,booklets,share_pct\n";
      for (const e of filtered) {
        if (e.error) {
          content += `,,,,,,⚠ Tampered entry,,,\n`;
          continue;
        }
        for (const c of e.cycles ?? []) {
          for (const ev of c.evaluators) {
            content += [
              e.datetime ?? "",
              e.nickname ?? "",
              e.mac_address ?? "",
              e.input_filename ?? "",
              e.test_id ?? "",
              c.cycle_name,
              ev.id,
              ev.input_pct != null ? `${ev.input_pct}%` : "",
              ev.booklets,
              ev.share_pct != null ? `${ev.share_pct}%` : "",
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(",");
            content += "\n";
          }
        }
      }
    } else {
      for (const e of filtered) {
        if (e.error) {
          content +=
            "⚠ This log entry could not be decrypted. It may have been tampered with.\n\n";
          continue;
        }
        content += `Timestamp : ${e.datetime ?? ""}\n`;
        content += `User      : ${e.nickname ?? ""}\n`;
        content += `MAC       : ${e.mac_address ?? ""}\n`;
        content += `File      : ${e.input_filename ?? ""}\n`;
        content += `Test ID   : ${e.test_id ?? ""}\n`;
        for (const c of e.cycles ?? []) {
          content += `\n  ${c.cycle_name} (pool: ${c.pool_size})\n`;
          for (const ev of c.evaluators) {
            const inputStr =
              ev.input_pct != null ? ` [input: ${ev.input_pct}%]` : " [free]";
            const shareStr =
              ev.share_pct != null ? ` (${ev.share_pct}%)` : "";
            content += `    ${ev.id}${inputStr}: ${ev.booklets} booklets${shareStr}\n`;
          }
        }
        content += "\n" + "─".repeat(60) + "\n\n";
      }
    }

    await invoke("cmd_write_text_file", { path, content });
  };

  const toggleSettings = (idx: number) => {
    setExpandedSettings((s) => {
      const n = new Set(s);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
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
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Audit Log Viewer</h1>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportVisible("txt")}
            className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
                       hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Export .txt
          </button>
          <button
            onClick={() => exportVisible("csv")}
            className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
                       hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Export .csv
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* ── Control panel ── */}
        <div
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200
                      dark:border-gray-700 p-4 space-y-4"
        >
          {/* Row 1: single-file selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase
                          tracking-wide mb-2">
              Load a specific day
            </p>
            <div className="flex items-center gap-2">
              <select
                value={selectedFile}
                onChange={(e) => {
                  setSelectedFile(e.target.value);
                  setDateRangeMode(false);
                  setFilterDateFrom("");
                  setFilterDateTo("");
                }}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5
                           text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2
                           focus:ring-blue-500"
              >
                {logFiles.length === 0 && (
                  <option value="">No log files found</option>
                )}
                {logFiles.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(".log.enc", "")}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setDateRangeMode(false);
                  loadSingleFile(selectedFile);
                }}
                disabled={!selectedFile || loading}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium
                           hover:bg-blue-700 disabled:opacity-40 transition shrink-0"
              >
                Load
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              or search across days
            </span>
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          </div>

          {/* Row 2: date-range loader */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase
                          tracking-wide mb-2">
              Load by date range
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5
                             text-sm bg-white dark:bg-gray-700 focus:outline-none
                             focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5
                             text-sm bg-white dark:bg-gray-700 focus:outline-none
                             focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={loadDateRange}
                disabled={(!filterDateFrom && !filterDateTo) || loading}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium
                           hover:bg-blue-700 disabled:opacity-40 transition"
              >
                🔍 Search
              </button>
              {dateRangeMode && (
                <button
                  onClick={resetToSingleFile}
                  className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
                             text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100
                             dark:hover:bg-gray-700 transition"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Row 3: in-memory filters */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase
                          tracking-wide mb-2">
              Filter loaded entries
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  MAC address
                </label>
                <select
                  value={filterMac}
                  onChange={(e) => setFilterMac(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1
                             text-sm bg-white dark:bg-gray-700"
                >
                  <option value="">All</option>
                  {uniqueMacs.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Cycle name
                </label>
                <input
                  type="text"
                  value={filterCycle}
                  onChange={(e) => setFilterCycle(e.target.value)}
                  placeholder="Filter…"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1
                             text-sm bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Filename
                </label>
                <input
                  type="text"
                  value={filterFilename}
                  onChange={(e) => setFilterFilename(e.target.value)}
                  placeholder="Search…"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1
                             text-sm bg-white dark:bg-gray-700"
                />
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>
              {dateRangeMode
                ? `Loaded ${loadedFrom.length} file(s): ${loadedFrom.map((f) => f.replace(".log.enc", "")).join(", ")}`
                : selectedFile
                ? `Loaded: ${selectedFile.replace(".log.enc", "")}`
                : "No file loaded"}
            </span>
            <span>
              Showing {filtered.length} of {entries.length} entries
            </span>
          </div>
        </div>

        {/* Error / loading */}
        {error && (
          <div
            className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200
                        dark:border-red-700 rounded text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}
        {loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Decrypting log file{loadedFrom.length > 1 ? "s" : ""}…
          </p>
        )}

        {logFiles.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            No log files found. Logs are created when you run an allocation.
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-4">
          {filtered.map((entry, idx) => {
            if (entry.error) {
              return (
                <div
                  key={idx}
                  className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200
                              dark:border-red-700 rounded-xl text-sm text-red-600 dark:text-red-400"
                >
                  ⚠ This log entry could not be decrypted. It may have been tampered with or
                  is corrupt.
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200
                            dark:border-gray-700 overflow-hidden"
              >
                {/* Entry header */}
                <div
                  className="px-5 py-3 border-b border-gray-100 dark:border-gray-700
                              bg-gray-50 dark:bg-gray-700"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {entry.input_filename}
                  </p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {entry.datetime}
                    </span>
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                      {entry.mac_address}
                    </span>
                  </div>
                </div>

                {/* Settings snapshot (collapsible) */}
                <div className="px-5 py-2 border-b border-gray-50 dark:border-gray-700/50">
                  <button
                    onClick={() => toggleSettings(idx)}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    {expandedSettings.has(idx) ? "▼" : "▶"} Settings snapshot
                  </button>
                  {expandedSettings.has(idx) && (
                    <pre
                      className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 rounded p-3
                                  overflow-x-auto text-gray-600 dark:text-gray-400 leading-relaxed"
                    >
                      {JSON.stringify(entry.settings_snapshot, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Cycle breakdown */}
                <div className="px-5 py-3 space-y-3">
                  {entry.cycles?.map((c) => (
                    <div key={c.cycle_name}>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                        {c.cycle_name} — {c.pool_size} booklets
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-700">
                            <th className="py-0.5 text-left font-medium text-gray-400 dark:text-gray-500">
                              Evaluator
                            </th>
                            <th className="py-0.5 text-right font-medium text-gray-400 dark:text-gray-500">
                              Input %
                            </th>
                            <th className="py-0.5 text-right font-medium text-gray-400 dark:text-gray-500">
                              Booklets
                            </th>
                            <th className="py-0.5 text-right font-medium text-gray-400 dark:text-gray-500">
                              Share %
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.evaluators.map((ev) => (
                            <tr
                              key={ev.id}
                              className="border-b border-gray-50 dark:border-gray-700/30"
                            >
                              <td className="py-0.5 font-mono text-gray-700 dark:text-gray-300">
                                {ev.id}
                              </td>
                              <td className="py-0.5 text-right text-gray-500 dark:text-gray-400">
                                {ev.input_pct != null ? `${ev.input_pct}%` : "—"}
                              </td>
                              <td className="py-0.5 text-right font-medium text-gray-800 dark:text-gray-200">
                                {ev.booklets}
                              </td>
                              <td className="py-0.5 text-right text-gray-500 dark:text-gray-400">
                                {ev.share_pct != null ? `${ev.share_pct}%` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
