import { memo } from 'react';
import { translate, useLocale } from '../../i18n';
import { useAgents, useWorldStore, type Agent } from '../../stores/world';
import { useAgentRoster } from '../../stores/roster';
import { participantSummary, rosterEntryFor } from '../../services/participants';

function Vital({ label, value }: { label: string; value: number }) {
  const percent = Math.max(0, Math.min(100, value));
  return <div className="meter" data-level={percent < 25 ? 'low' : undefined} title={`${label} ${Math.round(value)}`}><span style={{ width: `${percent}%` }} /></div>;
}

const Row = memo(function Row({ agent, summary, selected, onSelect }: { agent: Agent; summary: string; selected: boolean; onSelect: () => void }) {
  const dead = agent.state === 'dead' || agent.health <= 0;
  return <button type="button" className="participant-row" aria-pressed={selected} data-dead={dead || undefined} onClick={onSelect}
    aria-label={`${agent.name ?? agent.llmType}, ${summary}${dead ? `, ${translate('dead')}` : ''}`}>
    <span className="dot" style={{ color: agent.color }} aria-hidden="true" />
    <span className="min-w-0">
      <span className="participant-name block">{agent.name ?? agent.llmType}{dead ? ' †' : ''}</span>
      <span className="participant-model block">{summary}</span>
    </span>
    <span className="participant-vitals" aria-hidden="true">
      <Vital label={translate('Hunger')} value={agent.hunger} />
      <Vital label={translate('Energy')} value={agent.energy} />
      <Vital label={translate('Health')} value={agent.health} />
    </span>
  </button>;
});

/** Everyone in the world, with model and effort visible to the observer only. */
export function ParticipantList() {
  useLocale();
  const agents = useAgents();
  const roster = useAgentRoster();
  const selected = useWorldStore(s => s.selectedAgentId);
  const select = useWorldStore(s => s.selectAgent);
  const sorted = [...agents].sort((a, b) => Number(b.health > 0) - Number(a.health > 0));
  return <div>
    <div className="rail-head"><h2 className="engraved m-0">{translate('Participants')}</h2><span className="hint figure">{translate('Hunger · energy · health')}</span></div>
    {sorted.length === 0
      ? <p className="hint px-4 m-0">{translate('No one in the world yet.')}</p>
      : sorted.map(agent => {
          const entry = rosterEntryFor(agent, roster);
          return <Row key={agent.id} agent={agent} summary={entry ? participantSummary(entry) : agent.llmType} selected={selected === agent.id} onSelect={() => select(selected === agent.id ? null : agent.id)} />;
        })}
  </div>;
}
