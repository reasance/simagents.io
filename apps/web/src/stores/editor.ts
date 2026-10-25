import { create } from 'zustand';

/** `editor` is the ready state before a world starts. */
export type AppMode = 'editor' | 'simulation' | 'analytics' | 'replay' | 'prompts';

export interface EditorState {
  mode: AppMode;
  isPaused: boolean;
  setMode: (mode: AppMode) => void;
  setPaused: (paused: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'editor',
  isPaused: false,
  setMode: (mode) => set({ mode }),
  setPaused: (paused) => set({ isPaused: paused }),
}));

export const useAppMode = () => useEditorStore((state) => state.mode);
export const useIsPaused = () => useEditorStore((state) => state.isPaused);
export const useIsAnalyticsMode = () => useEditorStore((state) => state.mode === 'analytics');
export const useIsReplayMode = () => useEditorStore((state) => state.mode === 'replay');
export const useIsPromptsMode = () => useEditorStore((state) => state.mode === 'prompts');
