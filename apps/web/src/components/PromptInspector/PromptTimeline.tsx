import { formatError } from '../../i18n/errors';
import { useLocale, translate } from '../../i18n';
/**
 * PromptTimeline - List of decisions for selected agent
 *
 * Shows tick, action, and status indicators
 */

import {
  usePromptInspectorStore,
  useSelectedAgentId,
  useInspectorTimeline,
  useInspectorTimelineLoading,
  useInspectorTimelineError,
  useCurrentPromptLog,
} from '../../stores/promptInspectorStore';

export function PromptTimeline() {
  useLocale();
  const selectedAgentId = useSelectedAgentId();
  const timeline = useInspectorTimeline();
  const timelineLoading = useInspectorTimelineLoading();
  const timelineError = useInspectorTimelineError();
  const currentLog = useCurrentPromptLog();
  const { fetchLogDetail, fetchTimeline } = usePromptInspectorStore();

  // No agent selected
  if (!selectedAgentId) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-city-text-muted text-sm text-center">{translate("Select an agent to view their prompt history")}</p>
      </div>
    );
  }

  // Loading
  if (timelineLoading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-city-text-muted text-sm">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>{translate("Loading timeline...")}</div>
      </div>
    );
  }

  // Error
  if (timelineError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <p className="text-alert text-sm mb-2">{formatError(timelineError)}</p>
        <button
          onClick={() => fetchTimeline(selectedAgentId)}
          className="text-city-text-muted hover:text-city-text text-xs underline"
        >{translate("Retry")}</button>
      </div>
    );
  }

  // Empty timeline
  if (timeline.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-city-text-muted text-sm text-center">{translate("No prompt logs found for this agent")}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none px-3 py-2 bg-city-surface-hover/30 border-b border-city-border/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-city-text">{translate("Decision History (")}{timeline.length})
          </span>
          <button
            onClick={() => fetchTimeline(selectedAgentId)}
            className="text-city-text-muted hover:text-city-text"
            title={translate("Refresh timeline")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto">
        {timeline.map((entry) => {
          const isSelected = entry.eventId ? currentLog?.eventId === entry.eventId : currentLog?.id === entry.id;
          const isFallback = entry.usedFallback;
          const isCache = entry.usedCache;

          return (
            <button
              key={entry.eventId ?? `${entry.agentId}-${entry.tick}-${entry.id}`}
              onClick={() => fetchLogDetail(selectedAgentId, entry.tick, entry.eventId)}
              className={`w-full text-left px-3 py-2 border-b border-city-border/20 transition-colors ${
                isSelected
                  ? 'bg-city-accent/10 border-l-2 border-l-city-accent'
                  : 'hover:bg-city-surface-hover border-l-2 border-l-transparent'
              }`}
            >
              <span className="text-xs text-city-text-muted">{entry.source === 'captured' ? translate("Captured request") : translate("Event summary")}</span>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isSelected ? 'text-city-accent' : 'text-city-text'}`}>{translate("Tick")}{" "}{entry.tick}
                </span>
                <div className="flex items-center gap-1">
                  {isFallback && (
                    <span className="px-1.5 py-0.5 bg-brass/15 text-brass text-[10px] rounded" title={translate("Fallback decision")}>{translate("F")}</span>
                  )}
                  {isCache && (
                    <span className="px-1.5 py-0.5 bg-raised text-star text-[10px] rounded" title={translate("Cache hit")}>{translate("C")}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-sm ${isSelected ? 'text-city-text' : 'text-city-text-muted'}`}>
                  {entry.action ?? translate('Unknown')}
                </span>
                {entry.processingTimeMs !== null && (
                  <span className="text-[10px] text-city-text-muted">
                    {entry.processingTimeMs}ms
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
