import { useState, useRef, useEffect } from "react";

interface InfoButtonProps {
  tip: string;
  className?: string;
}

export default function InfoButton({ tip, className = "" }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-gray-300 hover:text-blue-500 dark:text-gray-600 dark:hover:text-blue-400
                   text-xs leading-none select-none transition-colors"
        aria-label="More information"
      >
        ⓘ
      </button>

      {open && (
        <div
          className="absolute z-50 left-6 top-0 w-72 rounded-lg shadow-lg border
                     border-gray-200 dark:border-gray-700
                     bg-white dark:bg-gray-800
                     p-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed"
        >
          {tip}
        </div>
      )}
    </div>
  );
}
