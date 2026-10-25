import { formatError } from '../../i18n/errors';
import { translateLabel, useLocale, translate } from '../../i18n';

/**
 * PromptViewer - Detailed view of a prompt log
 *
 * Shows:
 * - System prompt
 * - Observation prompt
 * - Full prompt
 * - Decision result
 * - Raw response
 */

import { useState } from 'react';
import {
  useSelectedAgentId,
  useCurrentPromptLog,
  useCurrentLogLoading,
  useCurrentLogError,
} from '../../stores/promptInspectorStore';

type TabId = 'full' | 'system' | 'observation' | 'decision' | 'raw';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    id: 'full',
    label: 'Full Prompt',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'system',
    label: 'System',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'observation',
    label: 'Observation',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    id: 'decision',
    label: 'Decision',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'raw',
    label: 'Raw Response',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
];

function CodeViewer({ content, lineNumbers = true }: { content: string; lineNumbers?: boolean }) {
  useLocale();
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative h-full">
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 px-2 py-1 bg-city-surface hover:bg-city-surface-hover text-city-text-muted hover:text-city-text text-xs rounded border border-city-border flex items-center gap-1"
      >
        {copied ? (
          <>
            <svg className="w-3 h-3 text-ok" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>{translate("Copied")}</>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>{translate("Copy")}</>
        )}
      </button>

      {/* Code content */}
      <pre tabIndex={0} aria-label={translate("Prompt content")} className="h-full overflow-auto p-4 pt-10 bg-city-bg text-city-text text-xs font-mono leading-relaxed">
        {lineNumbers ? (
          <table className="w-full">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-city-surface-hover/30">
                  <td className="pr-4 text-right text-city-text-muted select-none w-12 align-top">
                    {i + 1}
                  </td>
                  <td className="whitespace-pre-wrap break-words">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <code className="whitespace-pre-wrap break-words">{content}</code>
        )}
      </pre>
    </div>
  );
}

export function PromptViewer() {
  useLocale();
  const selectedAgentId = useSelectedAgentId();
  const currentLog = useCurrentPromptLog();
  const currentLogLoading = useCurrentLogLoading();
  const currentLogError = useCurrentLogError();
  const [activeTab, setActiveTab] = useState<TabId>('observation');

  // No agent selected
  if (!selectedAgentId) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-city-surface rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-city-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-city-text mb-2">{translate("Select an Agent")}</h3>
          <p className="text-city-text-muted text-sm">{translate("Choose an agent from the sidebar to inspect their prompts")}</p>
        </div>
      </div>
    );
  }

  // Loading
  if (currentLogLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-city-text-muted">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>{translate("Loading prompt details...")}</span>
        </div>
      </div>
    );
  }

  // Error
  if (currentLogError) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="bg-alert/10 border border-alert/30 rounded-lg p-6 max-w-md">
          <h3 className="text-alert font-medium mb-2">{translate("Error Loading Prompt")}</h3>
          <p className="text-city-text-muted text-sm">{formatError(currentLogError)}</p>
        </div>
      </div>
    );
  }

  // No log selected
  if (!currentLog) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-city-surface rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-city-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-city-text mb-2">{translate("Select a Tick")}</h3>
          <p className="text-city-text-muted text-sm">{translate("Choose a tick from the timeline to view the prompt details")}</p>
        </div>
      </div>
    );
  }

  // Get content for active tab
  const getTabContent = (): string => {
    switch (currentLog.source === 'captured' && !['full', 'raw'].includes(activeTab) ? 'full' : activeTab) {
      case 'full':
        return currentLog.fullPrompt;
      case 'system':
        return currentLog.systemPrompt;
      case 'observation':
        return currentLog.observationPrompt;
      case 'decision':
        return currentLog.decision
          ? JSON.stringify(currentLog.decision, null, 2)
          : translate('No decision recorded');
      case 'raw':
        return currentLog.rawResponse ?? translate('No raw response recorded');
      default:
        return '';
    }
  };

  return (
    <div className="prompt-viewer h-full flex flex-col">
      {currentLog.source !== 'captured' && <p role="note" className="p-3 text-sm text-brass">{translate("Reconstructed event summary. The actual request and raw response were not captured.")}</p>}
      {currentLog.requestTrace && <p role="note" className="p-3 text-sm text-city-text-muted">{translate("Captured request ·")}{currentLog.requestTrace.protocol} · {currentLog.requestTrace.outcome}{" "}{translate("· HTTP")}{" "}{currentLog.requestTrace.status ?? translate('Not available')} · {currentLog.requestTrace.durationMs} ms
        {currentLog.requestTrace.errorCode && ` · ${currentLog.requestTrace.errorCode}`}
        {currentLog.requestTrace.truncated && ` · ${translate('Truncated: body exceeds capture limit')}`}
        {currentLog.requestTrace.redacted && ` · ${translate('Known credentials redacted')}`}
      </p>}
      {/* Header with metadata */}
      <div className="flex-none px-4 py-3 bg-city-surface border-b border-city-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-city-text">{translate("Tick")}{" "}{currentLog.tick}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              currentLog.promptMode === 'emergent'
                ? 'bg-raised text-mist'
                : 'bg-raised text-star'
            }`}>
              {translateLabel(currentLog.promptMode)}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              currentLog.safetyLevel === 'none'
                ? 'bg-alert/10 text-alert'
                : currentLog.safetyLevel === 'minimal'
                  ? 'bg-brass/15 text-brass'
                  : 'bg-ok/20 text-ok'
            }`}>
              {translateLabel(currentLog.safetyLevel)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-city-text-muted">
            {currentLog.usedFallback && (
              <span className="px-2 py-0.5 bg-brass/15 text-brass rounded">{translate("Fallback")}</span>
            )}
            {currentLog.usedCache && (
              <span className="px-2 py-0.5 bg-raised text-star rounded">{translate("Cached")}</span>
            )}
            {currentLog.processingTimeMs !== null && (
              <span>{currentLog.processingTimeMs}ms</span>
            )}
            {currentLog.inputTokens !== null && (
              <span>{currentLog.inputTokens}{" "}{translate("in")}</span>
            )}
            {currentLog.outputTokens !== null && (
              <span>{currentLog.outputTokens}{" "}{translate("out")}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-city-text-muted">
          <span>{translate("LLM:")}{" "}{currentLog.llmType}</span>
          {currentLog.personality && <span>{translate("| Personality:")}{" "}{currentLog.personality}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-none border-b border-city-border bg-city-surface/50">
        <div className="flex">
          {TABS.filter(tab => currentLog.source !== 'captured' || tab.id === 'full' || tab.id === 'raw').map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-city-accent border-city-accent bg-city-accent/5'
                  : 'text-city-text-muted border-transparent hover:text-city-text hover:bg-city-surface-hover'
              }`}
            >
              {tab.icon}
              {currentLog.source === 'captured' && tab.id === 'full' ? translate("Request body") : translateLabel(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <CodeViewer content={getTabContent()} lineNumbers={activeTab !== 'decision'} />
      </div>
    </div>
  );
}
