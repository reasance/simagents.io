import { translate, translateLabel, formatActionLabel, useLocale } from '../../i18n';
import { estimateRecordedCost } from '../../services/token-cost';
import { DRY_RUN_MODEL_PREFIX } from '@simagents/engine/engine/llm/dry-run-provider';
import { actionsPerSimMinute, useAgentStats } from '../../stores/agentStats';
import { useAgent, useAgentDecisions, useWorldStore, type WorldEvent } from '../../stores/world';
import { useAgentRoster } from '../../stores/roster';
import { effortLabel, modelLabel, providerLabel, rosterEntryFor } from '../../services/participants';
import { eventTime } from './Feed';

function VitalRow({ label, value }: { label: string; value: number }) {
  const percent = Math.max(0, Math.min(100, value));
  return <div className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-3 text-sm">
    <span className="muted">{label}</span>
    <div className="meter" data-level={percent < 25 ? 'low' : undefined}><span style={{ width: `${percent}%` }} /></div>
    <span className={`figure text-right ${percent < 25 ? 'text-alert' : ''}`}>{Math.round(value)}</span>
  </div>;
}

function decisionLabel(event: WorldEvent): string {
  if (event.type === 'agent_undecided') return translate('Undecided');
  if (event.type === 'action_failed') return translate('Failed: {action}', { action: formatActionLabel(String(event.payload.action ?? '')) });
  return formatActionLabel(String(event.payload.action ?? event.type));
}

const STATES: Record<string, string> = { idle: 'Idle', walking: 'Walking', working: 'Working', sleeping: 'Sleeping', dead: 'Dead' };

/** Everything the observer can know about one agent, including what it keeps private from the others. */
export function AgentDetail({ agentId, onBack }: { agentId: string; onBack?: () => void }) {
  const locale = useLocale();
  const agent = useAgent(agentId);
  const stats = useAgentStats(agentId);
  const decisions = useAgentDecisions(agentId);
  const roster = useAgentRoster();
  const select = useWorldStore(s => s.selectAgent);
  if (!agent) return <p className="hint p-4">{translate('Agent not found')}</p>;
  const entry = rosterEntryFor(agent, roster);
  const cost = estimateRecordedCost(stats);
  const reportedModel = stats?.lastModelId;
  const dryRun = !!reportedModel?.startsWith(DRY_RUN_MODEL_PREFIX);
  const back = onBack ?? (() => select(null));

  return <div className="grid gap-5 p-4 pt-2">
    <button type="button" className="btn btn-quiet btn-small justify-self-start -ml-2" onClick={back}>← {translate('All participants')}</button>
    <header className="grid gap-1">
      <h2 className="m-0 flex items-center gap-2 text-lg font-medium"><span className="dot" style={{ color: agent.color }} aria-hidden="true" />{agent.name ?? agent.llmType}</h2>
      {entry && <p className="m-0 text-sm"><span>{modelLabel(entry)}</span>{effortLabel(entry) && <span className="figure text-brass"> · {effortLabel(entry)}</span>}<span className="muted"> · {providerLabel(entry)}</span></p>}
      <p className="m-0 hint">{translateLabel(STATES[agent.state] ?? agent.state)} · <span className="figure">({agent.x}, {agent.y})</span></p>
    </header>

    <section className="grid gap-2" aria-label={translate('Vitals')}>
      <VitalRow label={translate('Hunger')} value={agent.hunger} />
      <VitalRow label={translate('Energy')} value={agent.energy} />
      <VitalRow label={translate('Health')} value={agent.health} />
      <div className="grid grid-cols-[5rem_1fr] gap-3 text-sm"><span className="muted">{translate('Balance')}</span><span className="figure">{agent.balance.toLocaleString(locale)} CITY</span></div>
    </section>

    <section className="grid gap-2">
      <h3 className="engraved m-0">{translate('Private notes')}</h3>
      {agent.privateNotes ? <p className="m-0 text-sm whitespace-pre-wrap border-l-2 border-rule pl-3">{agent.privateNotes}</p> : <p className="hint m-0">{translate('This agent has not written any notes.')}</p>}
      <p className="hint m-0">{translate('Only this agent reads its notes. You see them as the observer.')}</p>
    </section>

    <section className="grid gap-2">
      <h3 className="engraved m-0">{translate('Recent decisions')}</h3>
      {decisions.length === 0 ? <p className="hint m-0">{translate('No decisions yet')}</p> : <ol className="m-0 p-0 list-none grid gap-3">
        {decisions.slice(0, 8).map(event => <li key={event.id} className="grid gap-1 text-sm">
          <div className="flex items-baseline justify-between gap-2"><span className={event.type === 'action_failed' ? 'text-alert' : ''}>{decisionLabel(event)}</span><time className="figure text-xs muted">{eventTime(event)}</time></div>
          {typeof event.payload.reasoning === 'string' && <p className="hint m-0 line-clamp-3">{event.payload.reasoning}</p>}
          {typeof event.payload.processingTimeMs === 'number' && <span className="figure text-xs muted">{translate('{ms} ms to decide', { ms: Math.round(event.payload.processingTimeMs) })}</span>}
        </li>)}
      </ol>}
    </section>

    <section className="grid gap-2">
      <h3 className="engraved m-0">{translate('Speed and usage')}</h3>
      <div className="stat-grid">
        <div className="stat"><span className="engraved">{translate('Avg latency')}</span><span className="stat-value text-base">{stats?.latencySamples ? `${Math.round(stats.avgLatencyMs)} ms` : '—'}</span></div>
        <div className="stat"><span className="engraved" title={translate('Attempts per simulated minute since the first recorded action; minimum window one minute.')}>{translate('Attempts/min')}</span><span className="stat-value text-base">{actionsPerSimMinute(stats).toFixed(2)}</span></div>
        <div className="stat"><span className="engraved">{translate(dryRun ? 'Estimated tokens' : 'Known reported tokens')}</span><span className="stat-value text-base">{stats && stats.totalTokens > 0 ? stats.totalTokens : '—'}</span></div>
        <div className="stat"><span className="engraved">{translate('Listed-rate estimate')}</span><span className="stat-value text-base">{cost.available ? new Intl.NumberFormat(locale, { style: 'currency', currency: cost.currency, maximumFractionDigits: 4 }).format(cost.amount) : '—'}</span></div>
      </div>
      {dryRun
        ? <p className="hint m-0">{translate('Scripted replies in this tab (dry run); no model was called. Tokens are estimated from the prompt length.')}</p>
        : <>
          {reportedModel && <p className="hint m-0">{translate('Model reported by the provider')}: <span className="figure">{reportedModel}</span></p>}
          <p className="hint m-0">{translate('Recorded decisions only. Probes, failed or cancelled requests and unreported usage may still be billed. This estimate is not a provider invoice or spending guarantee.')}</p>
        </>}
    </section>
  </div>;
}
