import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useAppStore } from "../store/useAppStore";
import CycleCard from "../components/CycleCard";
import InfoButton from "../components/InfoButton";

const FIELD_OPTIONS = ["Member Id", "Email"];

const STUDENT_TIP =
  "The column in your input Excel file that uniquely identifies each student. " +
  "This value is read and placed in the 'User Id' column of each output file.";

const EVAL_TIP =
  "The identifier you type in the evaluator boxes — and the value written to the " +
  "'Evaluator Id' column of each output file.";

export default function Settings() {
  const navigate = useNavigate();
  const {
    nickname,
    setNickname,
    cycles,
    addCycle,
    updateCycle,
    removeCycle,
    reorderCycles,
    studentField,
    setStudentField,
    evaluatorField,
    setEvaluatorField,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
  } = useAppStore();

  const [nicknameLocal, setNicknameLocal] = useState(nickname);
  const [presetName, setPresetName] = useState("");
  const [sampleError, setSampleError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));

  const downloadSample = async () => {
    setSampleError("");
    const path = await save({
      defaultPath: "TID1234_sample_booklets.xlsx",
      filters: [{ name: "Excel files", extensions: ["xlsx"] }],
    });
    if (path) {
      try {
        await invoke("cmd_generate_sample_file", { outputPath: path });
      } catch (e: unknown) {
        setSampleError(String(e));
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cycles.findIndex((c) => c.id === active.id);
      const newIndex = cycles.findIndex((c) => c.id === over.id);
      reorderCycles(arrayMove(cycles, oldIndex, newIndex));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200
                          dark:border-gray-700 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
        <span className="text-xs text-gray-400 ml-auto">
          Changes save automatically
        </span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">
        {/* Nickname */}
        <section>
          <h2 className="text-base font-semibold mb-3">Display Name</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={nicknameLocal}
              onChange={(e) => setNicknameLocal(e.target.value)}
              onBlur={() => nicknameLocal.trim() && setNickname(nicknameLocal.trim())}
              placeholder="Your nickname"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-sm bg-white dark:bg-gray-700 focus:outline-none
                         focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>

        {/* Cycles */}
        <section>
          <h2 className="text-base font-semibold mb-1">Exam Cycles</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Drag to reorder. Order determines processing sequence.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={cycles.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {cycles.map((cycle) => (
                  <CycleCard
                    key={cycle.id}
                    cycle={cycle}
                    onUpdate={(u) => updateCycle(cycle.id, u)}
                    onDelete={() => removeCycle(cycle.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {cycles.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed border-gray-200
                            dark:border-gray-700 rounded-lg text-gray-400 text-sm">
              No cycles configured yet.
            </div>
          )}

          <button
            onClick={() =>
              addCycle({
                id: crypto.randomUUID(),
                name: `Cycle ${cycles.length + 1}`,
                percentage: 100,
              })
            }
            className="mt-3 w-full py-2 rounded-lg border-2 border-dashed border-blue-300
                       dark:border-blue-700 text-blue-500 dark:text-blue-400
                       hover:border-blue-500 text-sm font-medium transition"
          >
            + Add Cycle
          </button>
        </section>

        {/* Field Mappings */}
        <section>
          <h2 className="text-base font-semibold mb-3">Field Mappings</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="w-48 text-sm text-gray-600 dark:text-gray-400 shrink-0">
                Student identifier
              </label>
              <select
                value={studentField}
                onChange={(e) => setStudentField(e.target.value)}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg
                           px-3 py-2 bg-white dark:bg-gray-700 text-sm focus:outline-none
                           focus:ring-2 focus:ring-blue-500"
              >
                {FIELD_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <InfoButton tip={STUDENT_TIP} />
            </div>

            <div className="flex items-center gap-3">
              <label className="w-48 text-sm text-gray-600 dark:text-gray-400 shrink-0">
                Evaluator identifier
              </label>
              <select
                value={evaluatorField}
                onChange={(e) => setEvaluatorField(e.target.value)}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg
                           px-3 py-2 bg-white dark:bg-gray-700 text-sm focus:outline-none
                           focus:ring-2 focus:ring-blue-500"
              >
                {FIELD_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <InfoButton tip={EVAL_TIP} />
            </div>
          </div>
        </section>

        {/* Sample File */}
        <section>
          <h2 className="text-base font-semibold mb-1">Sample File</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Download a sample Excel file to see the expected input format.
          </p>
          <button
            onClick={downloadSample}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                       text-sm text-gray-700 dark:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            ⬇ Download sample file
          </button>
          {sampleError && (
            <p className="mt-2 text-xs text-red-500">{sampleError}</p>
          )}
        </section>

        {/* Named Presets */}
        <section>
          <h2 className="text-base font-semibold mb-1">Named Presets</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Save your current configuration (cycles + evaluator inputs + file path) as a
            preset for quick restore.
          </p>

          {/* Save new preset */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-sm bg-white dark:bg-gray-700 focus:outline-none
                         focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (presetName.trim()) {
                  savePreset(presetName.trim());
                  setPresetName("");
                }
              }}
              disabled={!presetName.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                         hover:bg-blue-700 disabled:opacity-50 transition"
            >
              Save
            </button>
          </div>

          {/* Preset list */}
          {presets.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No presets saved yet.</p>
          ) : (
            <div className="space-y-2">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 p-2.5 rounded-lg border
                             border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                >
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-gray-400">
                    {p.cycles.length} cycle{p.cycles.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => loadPreset(p.id)}
                    className="text-xs text-blue-500 hover:text-blue-700 px-2"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deletePreset(p.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Keyboard shortcuts reference */}
        <section>
          <h2 className="text-base font-semibold mb-3">Keyboard Shortcuts</h2>
          <div className="space-y-1.5">
            {[
              ["Ctrl+O", "Open file picker"],
              ["Ctrl+Enter", "Preview allocation"],
              ["Ctrl+,", "Open settings"],
              ["Ctrl+Shift+L", "Open log viewer (password gated)"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-3 text-sm">
                <kbd
                  className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700
                             border border-gray-300 dark:border-gray-600 font-mono text-xs"
                >
                  {key}
                </kbd>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
