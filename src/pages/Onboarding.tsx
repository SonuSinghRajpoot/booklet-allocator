import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/useAppStore";
import CycleCard from "../components/CycleCard";

const TOTAL_STEPS = 4;

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i <= step
              ? "bg-blue-500 w-8"
              : "bg-gray-200 dark:bg-gray-700 w-5"
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 0 — Nickname
// ---------------------------------------------------------------------------

function Step0({ onNext }: { onNext: () => void }) {
  const { nickname, setNickname } = useAppStore();
  const [local, setLocal] = useState(nickname);

  const proceed = () => {
    if (!local.trim()) return;
    setNickname(local.trim());
    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">What should we call you?</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          This name will appear on your welcome banner.
        </p>
      </div>
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && proceed()}
        placeholder="Your name or nickname"
        autoFocus
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3
                   text-base bg-white dark:bg-gray-700 focus:outline-none
                   focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={proceed}
        disabled={!local.trim()}
        className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium
                   hover:bg-blue-700 disabled:opacity-50 transition"
      >
        Continue →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Cycle Setup
// ---------------------------------------------------------------------------

function Step1({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { cycles, addCycle, updateCycle, removeCycle, reorderCycles } =
    useAppStore();
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cycles.findIndex((c) => c.id === active.id);
      const newIndex = cycles.findIndex((c) => c.id === over.id);
      reorderCycles(arrayMove(cycles, oldIndex, newIndex));
    }
  };

  const addNew = () => {
    addCycle({
      id: crypto.randomUUID(),
      name: `Cycle ${cycles.length + 1}`,
      percentage: 100,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold mb-1">Set up your exam cycles</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Add at least one cycle. You can change these later in Settings.
        </p>
      </div>

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
        <div className="text-center py-6 border-2 border-dashed border-gray-200
                        dark:border-gray-700 rounded-lg text-gray-400 dark:text-gray-500 text-sm">
          No cycles yet. Add one to continue.
        </div>
      )}

      <button
        onClick={addNew}
        className="w-full py-2 rounded-lg border-2 border-dashed border-blue-300
                   dark:border-blue-700 text-blue-500 dark:text-blue-400
                   hover:border-blue-500 text-sm font-medium transition"
      >
        + Add Cycle
      </button>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                     text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          disabled={cycles.length === 0}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium
                     hover:bg-blue-700 disabled:opacity-50 transition text-sm"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Field Mappings
// ---------------------------------------------------------------------------

const FIELD_OPTIONS = ["Member Id", "Email"];

function Step2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { studentField, evaluatorField, setStudentField, setEvaluatorField } =
    useAppStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Tell us about your data</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Which columns in your Excel file identify students and evaluators?
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Student identifier column
          </label>
          <select
            value={studentField}
            onChange={(e) => setStudentField(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                       bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2
                       focus:ring-blue-500"
          >
            {FIELD_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Evaluator identifier (used in output files)
          </label>
          <select
            value={evaluatorField}
            onChange={(e) => setEvaluatorField(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                       bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2
                       focus:ring-blue-500"
          >
            {FIELD_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                     text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium
                     hover:bg-blue-700 transition text-sm"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Ready
// ---------------------------------------------------------------------------

function Step3({ onFinish }: { onFinish: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState("");

  const downloadSample = async () => {
    setDownloading(true);
    setDlError("");
    try {
      const path = await save({
        defaultPath: "TID1234_sample_booklets.xlsx",
        filters: [{ name: "Excel files", extensions: ["xlsx"] }],
      });
      if (path) {
        await invoke("cmd_generate_sample_file", { outputPath: path });
      }
    } catch (e: unknown) {
      setDlError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">You're ready to go 🎉</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
          Booklet Allocator helps you distribute exam booklets to evaluators across
          multiple cycles. Load a student Excel file, enter evaluator IDs with optional
          percentages, preview the allocation, and write the output files in one click.
          All runs are logged with an encrypted audit trail.
        </p>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border
                      border-blue-200 dark:border-blue-800 text-sm">
        <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">
          Sample file format
        </p>
        <p className="text-blue-700 dark:text-blue-400 text-xs">
          The sample file has a merged title row, then column headers (Member Id, Email, Name),
          then 50 student rows — perfect for testing your setup.
        </p>
      </div>

      {dlError && <p className="text-red-500 text-sm">{dlError}</p>}

      <button
        onClick={downloadSample}
        disabled={downloading}
        className="w-full py-2.5 rounded-lg border border-blue-500 text-blue-600
                   dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20
                   disabled:opacity-50 transition text-sm"
      >
        {downloading ? "Generating…" : "⬇ Download sample file"}
      </button>

      <button
        onClick={onFinish}
        className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium
                   hover:bg-blue-700 transition"
      >
        Open the app →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { setOnboardingComplete } = useAppStore();

  const finish = () => {
    setOnboardingComplete(true);
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center
                    bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-mono">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ← Back
            </button>
          )}
        </div>
        <StepIndicator step={step} />

        {step === 0 && <Step0 onNext={() => setStep(1)} />}
        {step === 1 && (
          <Step1 onNext={() => setStep(2)} onSkip={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step2 onNext={() => setStep(3)} onSkip={() => setStep(3)} />
        )}
        {step === 3 && <Step3 onFinish={finish} />}
      </div>
    </div>
  );
}
