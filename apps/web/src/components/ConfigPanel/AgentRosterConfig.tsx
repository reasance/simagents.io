import { translateLabel, useLocale, translate } from '../../i18n';

import {
  BASELINE_PROVIDER_IDS,
  LLM_CATALOG,
  getDefaultModelId,
  getModelCatalogEntry,
  getProviderCatalogEntry,
  isLLMProviderId,
  type AgentRosterEntry,
  type AgentRosterProvider,
  type LLMType,
  type ReasoningCapability,
} from '@simagents/shared';
import { AgentConnectionConfig } from './AgentConnectionConfig';
import { internalFixturesEnabled } from '../../services/byok-preflight';
import { providerAvailability } from '@simagents/engine/engine/llm/keys';
import { getActiveApiKeys, useApiKeysStore } from '../../stores/apiKeys';
import { useAgentRoster, useRosterStore } from '../../stores/roster';
import { useProxyUrl } from '../../stores/settings';

const BASELINE_LABELS: Record<string, string> = {
  baseline_random: 'Random baseline',
  baseline_rule: 'Rule baseline',
  baseline_sugarscape: 'Sugarscape baseline',
  baseline_qlearning: 'Q-learning baseline',
};

const COLOR_PALETTE = [
  { value: '#ef4444', name: 'Red' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#10b981', name: 'Green' },
  { value: '#f59e0b', name: 'Amber' },
  { value: '#8b5cf6', name: 'Violet' },
  { value: '#ec4899', name: 'Pink' },
  { value: '#1d4ed8', name: 'Dark blue' },
  { value: '#9ca3af', name: 'Light gray' },
  { value: '#6b7280', name: 'Gray' },
  { value: '#4b5563', name: 'Dark gray' },
] as const;

function providerLabel(provider: AgentRosterProvider): string {
  if (isLLMProviderId(provider)) {
    return getProviderCatalogEntry(provider)?.displayName ?? provider;
  }
  return BASELINE_LABELS[provider] ?? provider;
}

function availabilityLabel(reason?: 'no-key' | 'needs-proxy'): string {
  if (reason === 'needs-proxy') return translate('needs proxy');
  if (reason === 'no-key') return translate('no key');
  return '';
}

function modelReasoning(provider: AgentRosterProvider, modelId: string): ReasoningCapability {
  if (!isLLMProviderId(provider)) return { kind: 'none' };
  return getModelCatalogEntry(provider, modelId)?.reasoning ?? { kind: 'none' };
}

function normalizeReasoningValue(reasoning: ReasoningCapability, current: AgentRosterEntry['reasoningLevel']) {
  switch (reasoning.kind) {
    case 'effort':
      return typeof current === 'string' ? current : reasoning.default ?? reasoning.levels[0] ?? 'medium';
    case 'budget':
      return typeof current === 'number' ? current : reasoning.default;
    case 'toggle':
      return typeof current === 'boolean' ? current : false;
    default:
      return current;
  }
}

interface ReasoningControlProps {
  entry: AgentRosterEntry;
  reasoning: ReasoningCapability;
  onUpdate: (patch: Partial<AgentRosterEntry>) => void;
}

function ReasoningControl({ entry, reasoning, onUpdate }: ReasoningControlProps) {
  useLocale();
  if (reasoning.kind === 'none') return null;

  if (reasoning.kind === 'effort') {
    const value = normalizeReasoningValue(reasoning, entry.reasoningLevel) as string;
    return (
      <label className="block">
        <span className="text-[11px] text-gray-400">{translate("Reasoning effort")}</span>
        <select
          aria-label={translate('Reasoning value for {agent}', { agent: entry.name })}
          value={value}
          onChange={(event) => onUpdate({ reasoningLevel: event.target.value })}
          className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
        >
          {reasoning.levels.map((level) => (
            <option key={level} value={level}>
              {translateLabel(level)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (reasoning.kind === 'budget') {
    const value = normalizeReasoningValue(reasoning, entry.reasoningLevel) as number;
    return (
      <label className="block">
        <span className="text-[11px] text-gray-400">{translate("Thinking budget")}</span>
        <input
          aria-label={translate('Reasoning value for {agent}', { agent: entry.name })}
          type="number"
          min={reasoning.min}
          max={reasoning.max}
          step={128}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isFinite(parsed)) return;
            onUpdate({ reasoningLevel: Math.max(reasoning.min, Math.min(reasoning.max, parsed)) });
          }}
          className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
        />
      </label>
    );
  }

  if (reasoning.kind === 'toggle') {
    const value = normalizeReasoningValue(reasoning, entry.reasoningLevel) as boolean;
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-gray-400">{translate("Reasoning mode")}</span>
        <button
          type="button"
          role="switch"
          aria-label={translate('Reasoning value for {agent}', { agent: entry.name })}
          aria-checked={value}
          onClick={() => onUpdate({ reasoningLevel: !value })}
          className={`w-9 h-5 rounded-full relative transition-colors ${value ? 'bg-blue-500' : 'bg-gray-600'}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              value ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </label>
    );
  }

  const checked = entry.modelId === reasoning.reasoningModelId;
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-400">{translate("Use reasoning variant")}</span>
      <input
        aria-label={translate('Reasoning value for {agent}', { agent: entry.name })}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onUpdate({
            modelId: event.target.checked
              ? reasoning.reasoningModelId
              : getDefaultModelId(entry.provider as LLMType),
          });
        }}
        className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
      />
    </label>
  );
}

export function AgentRosterConfig() {
  useLocale();
  const roster = useAgentRoster();
  const { addEntry, duplicateEntry, removeEntry, updateEntry, resetRoster } = useRosterStore();
  useApiKeysStore((state) => state.status);
  const keys = getActiveApiKeys();
  const proxyUrl = useProxyUrl();
  const availability = providerAvailability({ getKey: (provider) => keys[provider] }, proxyUrl.trim() || undefined);

  const providerOptions: AgentRosterProvider[] = [
    ...(internalFixturesEnabled() ? BASELINE_PROVIDER_IDS : []),
    ...LLM_CATALOG.map((provider) => provider.id),
  ];

  const update = (index: number, patch: Partial<AgentRosterEntry>) => updateEntry(index, patch);

  return (
    <div className="py-3 px-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-200">{translate("Agents")}</span>
          <p className="text-xs text-gray-500 mt-0.5">{translate("Local browser runs spawn exactly this roster.")}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addEntry({ provider: 'claude' })}
            className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
          >{translate("Add")}</button>
          <button
            type="button"
            onClick={resetRoster}
            className="px-2.5 py-1.5 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
          >{translate("Reset")}</button>
        </div>
      </div>

      <div className="space-y-3">
        {roster.map((entry, index) => {
          const models = isLLMProviderId(entry.provider)
            ? getProviderCatalogEntry(entry.provider)?.models ?? []
            : [];
          const isCustomModel = isLLMProviderId(entry.provider) &&
            !models.some((model) => model.id === entry.modelId);
          const reasoning = modelReasoning(entry.provider, entry.modelId);

          return (
            // Key by index only: keying by name remounts the row (and drops
            // input focus) on every keystroke while renaming an agent.
            <div key={index} className="rounded border border-gray-700 bg-gray-800/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs font-medium text-gray-300 truncate">{translate("Agent")}{" "}{index + 1}</span>
                </div>
                <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => duplicateEntry(index)}
                  aria-label={translate('Duplicate {agent} with another effort level', { agent: entry.name })}
                  className="text-xs text-gray-400 hover:text-blue-300"
                >{translate("Duplicate")}</button>
                <button
                  type="button"
                  onClick={() => removeEntry(index)}
                  disabled={roster.length <= 1}
                  className="text-xs text-gray-500 hover:text-red-300 disabled:opacity-40 disabled:hover:text-gray-500"
                >{translate("Remove")}</button>
                </div>
              </div>

              <AgentConnectionConfig entry={entry} update={(patch) => update(index, patch)} />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label>
                  <span className="text-[11px] text-gray-400">{translate("Name")}</span>
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label>
                  <span className="text-[11px] text-gray-400">{translate("Color")}</span>
                  <input
                    type="color"
                    aria-label={translate('Color for {agent}', { agent: entry.name })}
                    value={entry.color}
                    onChange={(event) => update(index, { color: event.target.value })}
                    className="mt-1 w-11 h-11 p-0.5 bg-gray-900 border border-gray-700 rounded"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-1">
                {COLOR_PALETTE.map(({ value: color, name }) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => update(index, { color })}
                    aria-label={translate('Use {color} for {agent}', { color: translate(name), agent: entry.name })}
                    aria-pressed={entry.color.toLowerCase() === color}
                    className={`w-11 h-11 grid place-items-center rounded border ${
                      entry.color.toLowerCase() === color.toLowerCase()
                        ? 'border-white'
                        : 'border-white/10'
                    }`}
                    style={{ backgroundColor: color }}
                    title={`${translate(name)} (${color})`}
                  >
                    {entry.color.toLowerCase() === color && (
                      <span aria-hidden="true" className="w-5 h-5 grid place-items-center rounded bg-gray-950 text-white">✓</span>
                    )}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-[11px] text-gray-400">{translate("Provider")}</span>
                <select
                  disabled={!!entry.connectionId}
                  value={entry.provider}
                  onChange={(event) => update(index, { provider: event.target.value as AgentRosterProvider })}
                  className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                >
                  {providerOptions.map((provider) => {
                    const disabled = !entry.connectionId && isLLMProviderId(provider) && !availability[provider].available;
                    const reason = isLLMProviderId(provider) ? availabilityLabel(availability[provider].reason) : '';
                    return (
                      <option key={provider} value={provider} disabled={disabled}>
                        {providerLabel(provider)}{reason ? ` - ${reason}` : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              {isLLMProviderId(entry.provider) && (
                <>
                  <label className="block">
                    <span className="text-[11px] text-gray-400">{translate("Model")}</span>
                    <select
                      aria-label={translate("Model for {agent}", { agent: entry.name })}
                      value={isCustomModel ? '__custom__' : entry.modelId}
                      onChange={(event) => {
                        const next = event.target.value === '__custom__'
                          ? `${entry.provider}:custom-model`
                          : event.target.value;
                        update(index, { modelId: next, reasoningLevel: undefined });
                      }}
                      className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {translateLabel(model.label)}
                        </option>
                      ))}
                      <option value="__custom__">{translate("Custom model ID")}</option>
                    </select>
                  </label>

                  {isCustomModel && (
                    <label className="block">
                      <span className="text-[11px] text-gray-400">{translate("Custom model ID")}</span>
                      <input
                        type="text"
                        aria-label={translate("Custom model ID for {agent}", { agent: entry.name })}
                        value={entry.modelId}
                        onChange={(event) => update(index, { modelId: event.target.value })}
                        className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                      />
                    </label>
                  )}

                  {!entry.connectionId && <ReasoningControl
                    entry={entry}
                    reasoning={reasoning}
                    onUpdate={(patch) => update(index, patch)}
                  />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
