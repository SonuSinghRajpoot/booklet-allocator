import { Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CycleConfig {
  id: string;
  name: string;
  percentage: number;
}

export interface Preset {
  id: string;
  name: string;
  cycles: CycleConfig[];
  evaluatorInputs: Record<string, string>;
  lastFilePath?: string;
}

export interface EvaluatorAllocation {
  evaluator_id: string;
  student_ids: string[];
  booklet_count: number;
}

export interface AllocationResult {
  cycle_name: string;
  pool_size: number;
  allocations: EvaluatorAllocation[];
}

export interface MasterData {
  rows: Array<{ id: string; data: Record<string, string> }>;
  headers: string[];
  rowCount: number;
  duplicateCount: number;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface AppState {
  // Persistence keys
  nickname: string;
  onboardingComplete: boolean;
  cycles: CycleConfig[];
  studentField: string;
  evaluatorField: string;
  evaluatorInputs: Record<string, string>;
  lastFilePath: string;
  testId: string;
  presets: Preset[];
  lastCleanupDate: string;
  darkMode: boolean;

  // Transient (not persisted)
  masterData: MasterData | null;
  allocationResults: AllocationResult[];
  writtenFilePaths: string[];

  // Store handle
  _store: Store | null;
  _saveTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  initStore: () => Promise<void>;
  _scheduleSave: () => void;
  setNickname: (name: string) => void;
  setOnboardingComplete: (v: boolean) => void;
  addCycle: (cycle: CycleConfig) => void;
  updateCycle: (id: string, updates: Partial<CycleConfig>) => void;
  removeCycle: (id: string) => void;
  reorderCycles: (cycles: CycleConfig[]) => void;
  setStudentField: (field: string) => void;
  setEvaluatorField: (field: string) => void;
  setEvaluatorInput: (cycleId: string, input: string) => void;
  setLastFilePath: (path: string) => void;
  setTestId: (id: string) => void;
  setMasterData: (data: MasterData | null) => void;
  setAllocationResults: (results: AllocationResult[]) => void;
  setWrittenFilePaths: (paths: string[]) => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  setLastCleanupDate: (date: string) => void;
  setDarkMode: (v: boolean) => void;
  resetSession: () => void;
}

// ---------------------------------------------------------------------------
// Persisted keys mapping
// ---------------------------------------------------------------------------

const STORE_FILE = "booklet-allocator.json";

async function loadFromStore(store: Store): Promise<Partial<AppState>> {
  const get = async <T>(key: string, def: T): Promise<T> => {
    const v = await store.get<T>(key);
    return v !== undefined && v !== null ? v : def;
  };

  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

  const [
    nickname,
    onboardingComplete,
    cycles,
    studentField,
    evaluatorField,
    evaluatorInputs,
    lastFilePath,
    testId,
    presets,
    lastCleanupDate,
    darkMode,
  ] = await Promise.all([
    get<string>("nickname", ""),
    get<boolean>("onboarding_complete", false),
    get<CycleConfig[]>("cycles", []),
    get<string>("student_field", "Member Id"),
    get<string>("evaluator_field", "Member Id"),
    get<Record<string, string>>("evaluator_inputs", {}),
    get<string>("last_file_path", ""),
    get<string>("test_id", ""),
    get<Preset[]>("presets", []),
    get<string>("last_cleanup_date", ""),
    get<boolean>("dark_mode", systemDark),
  ]);

  return {
    nickname,
    onboardingComplete,
    cycles,
    studentField,
    evaluatorField,
    evaluatorInputs,
    lastFilePath,
    testId,
    presets,
    lastCleanupDate,
    darkMode,
  };
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>((set, get) => ({
  nickname: "",
  onboardingComplete: false,
  cycles: [],
  studentField: "Member Id",
  evaluatorField: "Member Id",
  evaluatorInputs: {},
  lastFilePath: "",
  testId: "",
  presets: [],
  lastCleanupDate: "",
  darkMode: false,

  masterData: null,
  allocationResults: [],
  writtenFilePaths: [],

  _store: null,
  _saveTimer: null,

  // ------------------------------------------------------------------
  initStore: async () => {
    const store = await Store.load(STORE_FILE, { autoSave: false, defaults: {} });
    const loaded = await loadFromStore(store);
    set({ _store: store, ...loaded });
  },

  _scheduleSave: () => {
    const state = get();
    if (state._saveTimer) clearTimeout(state._saveTimer);
    const timer = setTimeout(async () => {
      const s = get();
      if (!s._store) return;
      await s._store.set("nickname", s.nickname);
      await s._store.set("onboarding_complete", s.onboardingComplete);
      await s._store.set("cycles", s.cycles);
      await s._store.set("student_field", s.studentField);
      await s._store.set("evaluator_field", s.evaluatorField);
      await s._store.set("evaluator_inputs", s.evaluatorInputs);
      await s._store.set("last_file_path", s.lastFilePath);
      await s._store.set("test_id", s.testId);
      await s._store.set("presets", s.presets);
      await s._store.set("last_cleanup_date", s.lastCleanupDate);
      await s._store.set("dark_mode", s.darkMode);
      await s._store.save();
    }, 500);
    set({ _saveTimer: timer });
  },

  // ------------------------------------------------------------------
  setNickname: (name) => {
    set({ nickname: name });
    get()._scheduleSave();
  },

  setOnboardingComplete: (v) => {
    set({ onboardingComplete: v });
    get()._scheduleSave();
  },

  addCycle: (cycle) => {
    set((s) => ({ cycles: [...s.cycles, cycle] }));
    get()._scheduleSave();
  },

  updateCycle: (id, updates) => {
    set((s) => ({
      cycles: s.cycles.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
    get()._scheduleSave();
  },

  removeCycle: (id) => {
    set((s) => ({
      cycles: s.cycles.filter((c) => c.id !== id),
      evaluatorInputs: Object.fromEntries(
        Object.entries(s.evaluatorInputs).filter(([k]) => k !== id)
      ),
    }));
    get()._scheduleSave();
  },

  reorderCycles: (cycles) => {
    set({ cycles });
    get()._scheduleSave();
  },

  setStudentField: (field) => {
    set({ studentField: field });
    get()._scheduleSave();
  },

  setEvaluatorField: (field) => {
    set({ evaluatorField: field });
    get()._scheduleSave();
  },

  setEvaluatorInput: (cycleId, input) => {
    set((s) => ({
      evaluatorInputs: { ...s.evaluatorInputs, [cycleId]: input },
    }));
    get()._scheduleSave();
  },

  setLastFilePath: (path) => {
    set({ lastFilePath: path });
    get()._scheduleSave();
  },

  setTestId: (id) => {
    set({ testId: id });
    get()._scheduleSave();
  },

  setMasterData: (data) => set({ masterData: data }),

  setAllocationResults: (results) => set({ allocationResults: results }),

  setWrittenFilePaths: (paths) => set({ writtenFilePaths: paths }),

  savePreset: (name) => {
    const s = get();
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      cycles: s.cycles,
      evaluatorInputs: s.evaluatorInputs,
      lastFilePath: s.lastFilePath,
    };
    set((st) => ({ presets: [...st.presets, preset] }));
    get()._scheduleSave();
  },

  loadPreset: (id) => {
    const s = get();
    const preset = s.presets.find((p) => p.id === id);
    if (!preset) return;
    set({
      cycles: preset.cycles,
      evaluatorInputs: preset.evaluatorInputs,
      lastFilePath: preset.lastFilePath ?? "",
    });
    get()._scheduleSave();
  },

  deletePreset: (id) => {
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
    get()._scheduleSave();
  },

  setLastCleanupDate: (date) => {
    set({ lastCleanupDate: date });
    get()._scheduleSave();
  },

  setDarkMode: (v) => {
    set({ darkMode: v });
    get()._scheduleSave();
  },

  resetSession: () => {
    set({
      lastFilePath: "",
      testId: "",
      evaluatorInputs: {},
      masterData: null,
      allocationResults: [],
      writtenFilePaths: [],
    });
    get()._scheduleSave();
  },
}));
