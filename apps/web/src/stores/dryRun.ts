import { create } from 'zustand';

const KEY = 'simagents_dry_run_v1';

function read(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 64) return false;
    const value = JSON.parse(raw) as { schemaVersion?: unknown; enabled?: unknown };
    return value.schemaVersion === 1 && value.enabled === true;
  } catch { return false; }
}

function write(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, enabled: true }));
    else localStorage.removeItem(KEY);
  } catch { /* The choice still applies to this tab. */ }
}

interface DryRunState {
  /** The next session runs on scripted local replies instead of models. */
  enabled: boolean;
  /** The session in the worker now is a dry run. */
  session: boolean;
  setEnabled: (enabled: boolean) => void;
  setSession: (session: boolean) => void;
}

export const useDryRunStore = create<DryRunState>(set => ({
  enabled: read(),
  session: false,
  setEnabled: enabled => { write(enabled); set({ enabled }); },
  setSession: session => set({ session }),
}));
