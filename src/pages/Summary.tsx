import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAppStore } from "../store/useAppStore";

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export default function Summary() {
  const navigate = useNavigate();
  const { allocationResults, writtenFilePaths } = useAppStore();

  if (!allocationResults.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <p className="text-gray-500 dark:text-gray-400">No results to display.</p>
          <button
            onClick={() => { useAppStore.getState().resetSession(); navigate("/"); }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Start new run
          </button>
        </div>
      </div>
    );
  }

  const outputDir =
    writtenFilePaths.length > 0
      ? writtenFilePaths[0].substring(
          0,
          Math.max(
            writtenFilePaths[0].lastIndexOf("\\"),
            writtenFilePaths[0].lastIndexOf("/")
          )
        )
      : "";

  const openFolder = async () => {
    if (outputDir) {
      await invoke("cmd_open_folder", { path: outputDir });
    }
  };

  const startNewRun = () => {
    useAppStore.getState().resetSession();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header
        className="bg-white dark:bg-gray-800 border-b border-gray-200
                    dark:border-gray-700 px-6 py-4"
      >
        <h1 className="text-lg font-semibold">Run Complete</h1>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Success banner */}
        <div
          className="p-5 bg-green-50 dark:bg-green-900/20 border border-green-200
                      dark:border-green-700 rounded-xl flex items-start gap-4"
        >
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">
              {writtenFilePaths.length} file{writtenFilePaths.length !== 1 ? "s" : ""} written
              successfully
            </p>
            {outputDir && (
              <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">{outputDir}</p>
            )}
            {writtenFilePaths.map((p) => (
              <p key={p} className="text-xs text-green-600 dark:text-green-500 mt-0.5 font-mono">
                {p.split(/[\\/]/).pop()}
              </p>
            ))}
          </div>
        </div>

        {/* Open folder button */}
        {outputDir && (
          <button
            onClick={openFolder}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300
                       dark:border-gray-600 text-sm font-medium hover:bg-gray-100
                       dark:hover:bg-gray-700 transition"
          >
            📂 Open output folder
          </button>
        )}

        {/* Charts per cycle */}
        {allocationResults.map((result) => {
          const chartData = result.allocations.map((a) => ({
            name: a.evaluator_id.length > 18 ? a.evaluator_id.slice(0, 16) + "…" : a.evaluator_id,
            fullName: a.evaluator_id,
            booklets: a.booklet_count,
          }));

          return (
            <div
              key={result.cycle_name}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200
                          dark:border-gray-700 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                  {result.cycle_name}
                </h2>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-4">
                  <span>Pool: {result.pool_size} booklets</span>
                  <span>{result.allocations.length} evaluators</span>
                </div>
              </div>

              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, _name, props) => [
                        `${value} booklets`,
                        props.payload.fullName,
                      ]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="booklets" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Table breakdown */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Evaluator
                      </th>
                      <th className="text-right py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Booklets
                      </th>
                      <th className="text-right py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Share
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.allocations.map((a) => (
                      <tr
                        key={a.evaluator_id}
                        className="border-b border-gray-50 dark:border-gray-700/50"
                      >
                        <td className="py-1.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                          {a.evaluator_id}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-gray-800 dark:text-gray-200">
                          {a.booklet_count}
                        </td>
                        <td className="py-1.5 text-right text-gray-500 dark:text-gray-400 text-xs">
                          {result.pool_size > 0
                            ? ((a.booklet_count / result.pool_size) * 100).toFixed(1)
                            : 0}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600
                       text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            Run again with same settings
          </button>
          <button
            onClick={startNewRun}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold
                       hover:bg-blue-700 transition shadow-sm text-sm"
          >
            Start new run
          </button>
        </div>
      </div>
    </div>
  );
}
