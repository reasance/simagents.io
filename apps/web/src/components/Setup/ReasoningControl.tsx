import { translate, translateLabel, useLocale } from '../../i18n';
import { getDefaultModelId, type AgentRosterEntry, type LLMType, type ModelCapabilities, type ReasoningCapability } from '@simagents/shared';

interface Props {
  entry: AgentRosterEntry;
  /** Catalog controls for a known model; capability controls for a custom model id. */
  reasoning?: ReasoningCapability;
  capabilities?: ModelCapabilities;
  onUpdate: (patch: Partial<AgentRosterEntry>) => void;
}

const GENERIC_EFFORT = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const GEMINI_LEVELS = ['minimal', 'low', 'medium', 'high'];

/** One control for the reasoning setting, labelled "Effort" whatever the vendor calls it. */
export function ReasoningControl({ entry, reasoning, capabilities, onUpdate }: Props) {
  useLocale();
  const label = translate('Effort for {agent}', { agent: entry.name });
  const select = (levels: string[], fallback?: string) => <label className="field"><span>{translate('Effort')}</span>
    <select aria-label={label} value={typeof entry.reasoningLevel === 'string' ? entry.reasoningLevel : ''} onChange={event => onUpdate({ reasoningLevel: event.target.value || undefined })}>
      <option value="">{fallback ? translate('Provider default ({level})', { level: translateLabel(fallback) }) : translate('Provider default')}</option>
      {levels.map(level => <option key={level} value={level}>{translateLabel(level)}</option>)}
    </select>
  </label>;
  const toggle = <label className="field"><span>{translate('Effort')}</span>
    <select aria-label={label} value={entry.reasoningLevel === undefined ? '' : String(entry.reasoningLevel)} onChange={event => onUpdate({ reasoningLevel: event.target.value === '' ? undefined : event.target.value === 'true' })}>
      <option value="">{translate('Provider default')}</option><option value="true">{translate('Thinking on')}</option><option value="false">{translate('Thinking off')}</option>
    </select>
  </label>;
  const budget = (min: number, max: number) => <label className="field"><span>{translate('Thinking budget (tokens)')}</span>
    <input aria-label={label} type="number" min={min} max={max} step={128} value={typeof entry.reasoningLevel === 'number' ? entry.reasoningLevel : ''} placeholder={translate('Provider default')}
      onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); if (value === undefined || Number.isFinite(value)) onUpdate({ reasoningLevel: value === undefined ? undefined : Math.max(min, Math.min(max, value)) }); }} />
  </label>;

  if (reasoning) {
    if (reasoning.kind === 'effort') return select(reasoning.levels, reasoning.default);
    if (reasoning.kind === 'budget') return budget(reasoning.min, reasoning.max);
    if (reasoning.kind === 'toggle') return toggle;
    if (reasoning.kind === 'model-swap') {
      const swap = reasoning.reasoningModelId;
      return <label className="field"><span>{translate('Effort')}</span>
        <select aria-label={label} value={entry.modelId === swap ? 'on' : 'off'} onChange={event => onUpdate({ modelId: event.target.value === 'on' ? swap : getDefaultModelId(entry.provider as LLMType), reasoningLevel: undefined })}>
          <option value="off">{translate('Thinking off')}</option><option value="on">{translate('Thinking on')}</option>
        </select>
      </label>;
    }
    return null;
  }
  switch (capabilities?.reasoning) {
    case 'effort': return select(GENERIC_EFFORT);
    case 'gemini-level': return select(GEMINI_LEVELS);
    case 'budget': return budget(0, capabilities.maxOutputTokens);
    case 'thinking-toggle': case 'enable-thinking': return toggle;
    default: return null;
  }
}
