import { translateLabel, useLocale, translate } from '../../i18n';


/**
 * PromptEditor Component
 *
 * Editor for the agent system prompt with:
 * - Status badge (Custom / Default)
 * - Monospace text area for editing
 * - Apply / Reset / Discard buttons
 * - Placeholder documentation
 */

import { useEffect, useState } from 'react';
import { usePromptStore } from '../../stores/promptStore';

export function PromptEditor() {
  useLocale();
  const {
    pendingPrompt,
    placeholders,
    isLoading,
    error,
    warning,
    isSynced,
    jsonErrors,
    fetchPrompt,
    setPendingPrompt,
    applyPrompt,
    resetToDefault,
    discardChanges,
    hasPendingChanges,
    isUsingCustom,
    hasJsonErrors,
  } = usePromptStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Fetch prompt on mount
  useEffect(() => {
    if (!isSynced) {
      fetchPrompt();
    }
  }, [isSynced, fetchPrompt]);

  const badge = hasJsonErrors() ? { text: 'JSON Error', tone: 'badge-alert' } : hasPendingChanges() ? { text: 'Unsaved', tone: 'badge-brass' }
    : isUsingCustom() ? { text: 'Custom', tone: 'badge-ok' } : { text: 'Default', tone: '' };

  const handleReset = async () => {
    if (showResetConfirm) {
      await resetToDefault();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
    }
  };

  const handleCancelReset = () => {
    setShowResetConfirm(false);
  };

  // Calculate line count for textarea
  const lineCount = pendingPrompt.split('\n').length;
  const minRows = Math.min(Math.max(lineCount, 10), 30);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{translate("System Prompt")}</span>
        <span className={`badge ${badge.tone}`}>{translateLabel(badge.text)}</span>
      </div>
      <p className="hint m-0">{translate("The default prompt describes only the world's physics. A custom prompt replaces it for every agent.")}</p>
      {error && <p role="alert" className="notice notice-alert m-0">{error}</p>}
      {warning && <p role="status" className="notice m-0">{warning}</p>}
      <label className="field">
        <span className="sr-only">{translate("System Prompt")}</span>
        <textarea value={pendingPrompt} onChange={(e) => setPendingPrompt(e.target.value)} disabled={isLoading} rows={minRows}
          aria-invalid={hasJsonErrors()} placeholder={translate("Enter your custom system prompt...")} />
      </label>
      {jsonErrors.length > 0 && (
        <div className="notice notice-alert">
          <div className="text-sm font-medium mb-2">{translate("JSON Validation Errors (")}{jsonErrors.length})</div>
          <div className="grid gap-2 max-h-32 overflow-y-auto">
            {jsonErrors.map((err, idx) => (
              <div key={idx} className="text-xs">
                <div className="font-medium">{translate("Block")}{" "}{err.blockIndex + 1}{" "}{translate("(line")}{" "}{err.lineNumber}): {err.error}</div>
                <div className="figure muted truncate">{err.preview}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {placeholders.length > 0 && (
        <div className="grid gap-1 text-xs">
          <div className="muted">{translate("Available Placeholders:")}</div>
          {placeholders.map((p) => <div key={p.key}><code className="figure text-brass">{p.key}</code><span className="muted ml-2">- {translateLabel(p.description)}</span></div>)}
        </div>
      )}
      <div className="hint figure">{pendingPrompt.length.toLocaleString()}{" "}{translate("characters")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={applyPrompt} disabled={isLoading || !hasPendingChanges() || hasJsonErrors()} title={hasJsonErrors() ? translate("Fix JSON errors before applying") : undefined} className="btn btn-primary btn-small">
          {isLoading ? translate("Saving...") : translate("Apply Changes")}
        </button>
        {isUsingCustom() && !showResetConfirm && <button type="button" onClick={handleReset} disabled={isLoading} className="btn btn-small">{translate("Reset to Default")}</button>}
        {showResetConfirm && <>
          <button type="button" onClick={handleReset} disabled={isLoading} className="btn btn-danger btn-small">{translate("Confirm Reset")}</button>
          <button type="button" onClick={handleCancelReset} disabled={isLoading} className="btn btn-small">{translate("Cancel")}</button>
        </>}
        {hasPendingChanges() && <button type="button" onClick={discardChanges} disabled={isLoading} className="btn btn-quiet btn-small">{translate("Discard")}</button>}
      </div>
      <p className="hint m-0">{translate("Prompt stored in browser localStorage. Changes affect new agent decisions.")}</p>
    </div>
  );
}

export default PromptEditor;
