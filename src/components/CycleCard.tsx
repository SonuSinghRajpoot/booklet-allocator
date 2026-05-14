import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CycleConfig } from "../store/useAppStore";
import InfoButton from "./InfoButton";

interface CycleCardProps {
  cycle: CycleConfig;
  onUpdate: (updates: Partial<CycleConfig>) => void;
  onDelete: () => void;
}

const PCT_TIP =
  "The number of booklets picked for this cycle = ceil(total students × percentage).\n" +
  "Example: 15% of 340 students = ceil(340 × 0.15) = ceil(51.0) = 51 booklets.";

export default function CycleCard({ cycle, onUpdate, onDelete }: CycleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cycle.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200
                 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600
                   dark:hover:text-gray-300 select-none px-1"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Cycle name */}
      <input
        type="text"
        value={cycle.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Cycle name"
        className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm
                   bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Percentage */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={cycle.percentage}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0.1 && v <= 100) onUpdate({ percentage: v });
          }}
          min={0.1}
          max={100}
          step={0.1}
          className="w-20 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm
                     bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
        <InfoButton tip={PCT_TIP} />
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-sm px-1"
        aria-label="Delete cycle"
      >
        ✕
      </button>
    </div>
  );
}
