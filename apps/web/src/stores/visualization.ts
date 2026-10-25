/**
 * Visualization Store
 *
 * Manages state for:
 * - Heatmap overlays (resource density, agent density, activity)
 * - Social graph settings
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

/** Map layers; speech, exchange and force read the notable-event log. */
export type HeatmapMetric = 'none' | 'agent_density' | 'resource_density' | 'speech' | 'exchange' | 'force';

// Social graph edge types
export type SocialEdgeType = 'speech' | 'gift' | 'swap' | 'force';


// =============================================================================
// Store
// =============================================================================

interface VisualizationState {
  // Heatmap settings
  heatmapMetric: HeatmapMetric;
  heatmapOpacity: number;
  heatmapEnabled: boolean;

  // Social graph settings
  socialGraphVisible: boolean;
  socialGraphEdgeTypes: Set<SocialEdgeType>;

  // Actions - Heatmap
  setHeatmapMetric: (metric: HeatmapMetric) => void;
  setHeatmapOpacity: (opacity: number) => void;
  toggleHeatmap: () => void;

  // Actions - Social Graph
  toggleSocialGraph: () => void;
  toggleSocialEdgeType: (type: SocialEdgeType) => void;
}

export const useVisualizationStore = create<VisualizationState>((set, get) => ({
  // Initial state - Heatmap
  heatmapMetric: 'none',
  heatmapOpacity: 0.5,
  heatmapEnabled: false,

  // Initial state - Social Graph
  socialGraphVisible: false,
  socialGraphEdgeTypes: new Set<SocialEdgeType>(['speech', 'gift', 'swap', 'force']),

  // Heatmap actions
  setHeatmapMetric: (metric) => set({ heatmapMetric: metric, heatmapEnabled: metric !== 'none' }),

  setHeatmapOpacity: (opacity) => set({ heatmapOpacity: Math.max(0.1, Math.min(1, opacity)) }),

  toggleHeatmap: () => set((state) => ({ heatmapEnabled: !state.heatmapEnabled })),

  // Social graph actions
  toggleSocialGraph: () => set((state) => ({ socialGraphVisible: !state.socialGraphVisible })),


  toggleSocialEdgeType: (type) =>
    set((state) => {
      const newSet = new Set(state.socialGraphEdgeTypes);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return { socialGraphEdgeTypes: newSet };
    }),
}));

// =============================================================================
// Selectors
// =============================================================================

export const useHeatmapSettings = () =>
  useVisualizationStore(
    useShallow((state) => ({
      metric: state.heatmapMetric,
      opacity: state.heatmapOpacity,
      enabled: state.heatmapEnabled,
    }))
  );

export const useSocialGraphSettings = () =>
  useVisualizationStore(
    useShallow((state) => ({
      visible: state.socialGraphVisible,
      edgeTypes: state.socialGraphEdgeTypes,
    }))
  );
