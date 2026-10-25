import { useEffect, useRef, useState } from 'react';
import { formatError } from '../../i18n/errors';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { translate, useLocale, type TranslationKey } from '../../i18n';
import { useConfigStore } from '../../stores/config';
import { PromptEditor } from './PromptEditor';
import { getPersistenceInfo, exportUnsavedWorld, subscribePersistenceInfo, type PersistenceInfo } from '../../services/persistence';

const DEFAULT_AGENT = { startingBalance: 50, startingHunger: 80, startingEnergy: 80, startingHealth: 100 };
const DEFAULT_NEEDS = { hungerDecay: 0.6, energyDecay: 0.3, lowHungerThreshold: 20, criticalHungerThreshold: 10, lowEnergyThreshold: 20, criticalEnergyThreshold: 10 };

type AgentKey = keyof typeof DEFAULT_AGENT;
type NeedsKey = keyof typeof DEFAULT_NEEDS;
const AGENT_FIELDS: Array<[AgentKey, TranslationKey, TranslationKey, number?]> = [
  ['startingBalance', 'Balance', 'Initial currency for newly spawned agents'],
  ['startingHunger', 'Hunger', 'Initial hunger for newly spawned agents', 100],
  ['startingEnergy', 'Energy', 'Initial energy for newly spawned agents', 100],
  ['startingHealth', 'Health', 'Initial health for newly spawned agents', 100],
];
const NEEDS_FIELDS: Array<[NeedsKey, TranslationKey, TranslationKey, number, number?]> = [
  ['hungerDecay', 'Hunger Decay', 'Base hunger loss during housekeeping', 10, 0.1],
  ['energyDecay', 'Energy Decay', 'Base energy loss during housekeeping', 10, 0.1],
  ['lowHungerThreshold', 'Low Hunger', 'Below this threshold, hunger starts draining energy', 100],
  ['criticalHungerThreshold', 'Critical Hunger', 'Below this threshold, hunger damages health', 100],
  ['lowEnergyThreshold', 'Low Energy', 'Below this threshold, exhaustion warnings begin', 100],
  ['criticalEnergyThreshold', 'Critical Energy', 'Below this threshold, exhaustion damages health', 100],
];

/** Settings that are not part of the guided setup: the system prompt and the world's starting physics. */
export function ConfigPanel({ onClose }: { onClose: () => void }) {
  useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, true, onClose);
  const { pendingChanges, updateAgent, updateNeeds, discardChanges } = useConfigStore();
  const [info, setInfo] = useState<PersistenceInfo>(getPersistenceInfo());
  useEffect(() => subscribePersistenceInfo(setInfo), []);
  const agentValue = (key: AgentKey) => pendingChanges.agent?.[key] ?? DEFAULT_AGENT[key];
  const needsValue = (key: NeedsKey) => pendingChanges.needs?.[key] ?? DEFAULT_NEEDS[key];
  const changed = Object.keys(pendingChanges).length > 0;
  const otherSections = Object.keys(pendingChanges).filter(section => section !== 'agent' && section !== 'needs');
  const number = (label: TranslationKey, hint: TranslationKey, value: number, onChange: (value: number) => void, max?: number, step = 1) =>
    <label className="field" key={label}><span>{translate(label)}</span>
      <input type="number" className="figure" min={0} max={max} step={step} value={value} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next) && next >= 0 && (max === undefined || next <= max)) onChange(next); }} />
      <span className="hint">{translate(hint)}</span>
    </label>;

  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="config-panel-title" className="config-dialog">
    <div className="dialog-head">
      <div><span className="engraved">{translate('Settings')}</span><h2 id="config-panel-title">{translate('Advanced settings')}</h2></div>
      <button type="button" className="btn btn-quiet" onClick={onClose} aria-label={translate('Close configuration panel')}>{translate('Close')}</button>
    </div>
    <div className="flex-1 overflow-y-auto">
      <details className="config-section" open>
        <summary>{translate('Agent System Prompt')}</summary>
        <div><PromptEditor /></div>
      </details>
      <details className="config-section">
        <summary>{translate('Starting values')}</summary>
        <div>
          <p className="hint m-0">{translate('Apply to agents in a new world. Resuming a saved world keeps its own values.')}</p>
          {AGENT_FIELDS.map(([key, label, hint, max]) => number(label, hint, agentValue(key), value => updateAgent({ [key]: value }), max))}
        </div>
      </details>
      <details className="config-section">
        <summary>{translate('Needs decay')}</summary>
        <div>{NEEDS_FIELDS.map(([key, label, hint, max, step]) => number(label, hint, needsValue(key), value => updateNeeds({ [key]: value }), max, step))}</div>
      </details>
    </div>
    <div className="grid gap-2 border-t border-rule px-5 py-4 text-sm">
      {changed && <div className="flex items-center justify-between gap-3"><span className="muted">{translate('Saved for next start')}</span><button type="button" className="btn btn-small" onClick={discardChanges}>{translate('Restore defaults')}</button></div>}
      {otherSections.length > 0 && <p className="notice m-0">{translate('Also saved from an earlier setup and applied at the next start: {sections}. Restore defaults clears them.', { sections: otherSections.join(', ') })}</p>}
      <div className="flex items-center justify-between gap-3"><span className="muted">{translate('World saved on this device')}</span><span className={info.warning ? 'text-brass' : 'figure'}>{formatPersistenceStatus(info)}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="muted">{translate('World / 50 MiB budget')}</span><span className="figure">{formatBytes(info.snapshotBytes + info.ringBytes)} ({Math.round(info.quotaFraction * 100)}%)</span></div>
      {info.warning && <div className="notice">{formatError(info.warning)}<button type="button" className="btn btn-small mt-2" onClick={exportUnsavedWorld}>{translate('Export latest world')}</button></div>}
    </div>
  </div>;
}

function formatPersistenceStatus(info: PersistenceInfo): string {
  if (info.pending) return translate('Saving…');
  if (info.disabled) return translate('Saving paused');
  if (info.lastSavedSimTimeMs === undefined) return translate('Not saved yet');
  return translate('Saved at {minutes}m', { minutes: Math.floor(info.lastSavedSimTimeMs / 60_000) });
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
