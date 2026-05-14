import { useMemo, useRef, useEffect } from "react";
import InfoButton from "./InfoButton";

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParsedEvaluator {
  raw: string;
  id: string;
  explicitPct?: number;
  error?: string;
}

function isValidId(id: string, fieldType?: string): boolean {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const memberRe = /^[a-zA-Z0-9_.@-]+$/;
  if (fieldType === "Email") return emailRe.test(id);
  if (fieldType === "Member Id") return memberRe.test(id) && !emailRe.test(id);
  return emailRe.test(id) || memberRe.test(id);
}

export function parseEvaluatorInput(input: string, fieldType?: string): ParsedEvaluator[] {
  const entries = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return entries.map((raw) => {
    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx === -1) {
      const id = raw.trim();
      if (!isValidId(id, fieldType))
        return {
          raw,
          id,
          error:
            fieldType === "Email"
              ? `Must be a valid email address: "${id}"`
              : fieldType === "Member Id"
              ? `Must be a Member ID (not an email address): "${id}"`
              : `Invalid identifier: "${id}"`,
        };
      return { raw, id };
    }

    const id = raw.slice(0, colonIdx).trim();
    const pctStr = raw.slice(colonIdx + 1).trim();

    if (!isValidId(id, fieldType))
      return {
        raw,
        id,
        error:
          fieldType === "Email"
            ? `Must be a valid email address: "${id}"`
            : `Invalid identifier: "${id}"`,
      };

    if (!pctStr.endsWith("%")) {
      return { raw, id, error: `Percentage must end with % (got "${pctStr}")` };
    }

    const pct = parseFloat(pctStr.slice(0, -1));
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      return {
        raw,
        id,
        error: `Percentage must be between 0 and 100 (got ${pctStr})`,
      };
    }

    return { raw, id, explicitPct: pct };
  });
}

// ---------------------------------------------------------------------------
// Validation summary
// ---------------------------------------------------------------------------

export interface ValidationSummary {
  parsed: ParsedEvaluator[];
  sumPct: number;
  freeCount: number;
  hasErrors: boolean;
  isOverHundred: boolean;
  isUnderHundredNoFree: boolean;
  duplicateIds: string[];
}

export function validateEvaluators(
  parsed: ParsedEvaluator[],
  _allIds: string[][]
): ValidationSummary {
  const sumPct = parsed.reduce((s, e) => s + (e.explicitPct ?? 0), 0);
  const freeCount = parsed.filter((e) => e.explicitPct === undefined && !e.error).length;
  const hasErrors = parsed.some((e) => !!e.error);
  const isOverHundred = sumPct > 100 + 1e-9;
  const isUnderHundredNoFree =
    sumPct < 100 - 1e-9 && freeCount === 0 && parsed.length > 0 && !hasErrors;

  // Detect duplicate IDs within this entry list
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const e of parsed) {
    if (!e.error) {
      if (seen.has(e.id)) duplicateIds.push(e.id);
      seen.add(e.id);
    }
  }

  return {
    parsed,
    sumPct,
    freeCount,
    hasErrors,
    isOverHundred,
    isUnderHundredNoFree,
    duplicateIds,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FORMAT_TIP =
  "Format: evaluator_id[:percentage%], separated by commas.\n\n" +
  "Examples:\n" +
  "  eval1@demo.com:20%, eval2@demo.com:25%, eval3@demo.com\n" +
  "  M001:33%, M002:33%, M003\n\n" +
  "Rules:\n" +
  "• Evaluators without a % get the remaining booklets split equally.\n" +
  "• All explicit % must sum to ≤ 100%.\n" +
  "• If they sum to < 100% and there's no free evaluator, the run is blocked.";

interface EvaluatorInputProps {
  cycleId: string;
  cycleName: string;
  value: string;
  onChange: (v: string) => void;
  totalStudents?: number;
  cyclePercent?: number;
  evaluatorField?: string;
}

export default function EvaluatorInput({
  cycleName,
  value,
  onChange,
  totalStudents,
  cyclePercent,
  evaluatorField,
}: EvaluatorInputProps) {
  const parsed = useMemo(() => parseEvaluatorInput(value, evaluatorField), [value, evaluatorField]);
  const summary = useMemo(() => validateEvaluators(parsed, []), [parsed]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const poolSize =
    totalStudents !== undefined && cyclePercent !== undefined
      ? Math.ceil((totalStudents * cyclePercent) / 100)
      : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {cycleName} — Evaluators
        </label>
        <InfoButton tip={FORMAT_TIP} />
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. eval1@demo.com:20%, eval2@demo.com:25%, eval3@demo.com"
        rows={1}
        className="w-full border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 text-xs
                   bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                   resize-none overflow-hidden font-mono"
      />

      {/* Live validation feedback */}
      {parsed.length > 0 && (
        <div className="space-y-0.5">
          {parsed.map((e, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              {e.error ? (
                <>
                  <span className="text-red-500 font-bold mt-0.5">✗</span>
                  <span className="text-red-500">
                    {e.raw} — {e.error}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-green-500 font-bold mt-0.5">✓</span>
                  <span className="text-green-700 dark:text-green-400">
                    {e.id}
                    {e.explicitPct !== undefined ? ` (${e.explicitPct}%)` : " (free)"}
                    {poolSize !== null && e.explicitPct !== undefined && (
                      <span className="text-gray-500 dark:text-gray-400 ml-1">
                        → {Math.floor((poolSize * e.explicitPct) / 100)} booklets
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>
          ))}

          {/* Duplicate warning */}
          {summary.duplicateIds.length > 0 && (
            <p className="text-red-500 text-xs">
              ✗ Duplicate evaluator ID(s) in this cycle:{" "}
              {summary.duplicateIds.join(", ")}
            </p>
          )}

          {/* Over 100% */}
          {summary.isOverHundred && (
            <p className="text-red-500 text-xs">
              ✗ Percentages sum to {summary.sumPct.toFixed(1)}% — exceeds 100%.
            </p>
          )}

          {/* Under 100%, no free evaluators */}
          {summary.isUnderHundredNoFree && (
            <p className="text-red-500 text-xs">
              ✗ Percentages sum to {summary.sumPct.toFixed(1)}% with no free evaluators.
              Add an evaluator without a % or increase existing percentages to 100%.
            </p>
          )}

          {/* Sum display when valid */}
          {!summary.hasErrors &&
            !summary.isOverHundred &&
            !summary.isUnderHundredNoFree &&
            parsed.length > 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-xs">
                Explicit %: {summary.sumPct.toFixed(1)}% · Free evaluators:{" "}
                {summary.freeCount}
                {poolSize !== null && (
                  <span> · Pool size: {poolSize} booklets</span>
                )}
              </p>
            )}
        </div>
      )}
    </div>
  );
}
