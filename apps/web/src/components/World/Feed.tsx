import { memo, useMemo, useState } from 'react';
import { translate, useLocale } from '../../i18n';
import { eventLabel } from '../../i18n/events';
import { useAgents, useEvents, useNotableEvents, useWorldStore, type Agent, type WorldEvent } from '../../stores/world';
import { formatSimTime } from '../../utils/format';
import { describeNotable, nameLookup } from './describe';

/** Housekeeping the engine logs on every heartbeat; hidden unless asked for. */
const BOOKKEEPING = new Set(['needs_updated', 'needs_warning', 'items_spoiled', 'balance_changed', 'minute_elapsed', 'tick_start', 'tick_end', 'health_regenerated', 'resources_regenerated', 'resource_regenerated', 'agent_heard', 'agent_received', 'agent_received_trade']);

export const eventTime = (event: WorldEvent) => formatSimTime(typeof event.payload?.simTimeMs === 'number' ? event.payload.simTimeMs : event.tick * 60_000);

function Who({ agent }: { agent?: Agent }) {
  if (!agent) return null;
  return <span className="feed-who"><span className="dot" style={{ color: agent.color }} aria-hidden="true" />{agent.name ?? agent.llmType}</span>;
}

const NotableItem = memo(function NotableItem({ event, agents }: { event: WorldEvent; agents: Agent[] }) {
  const name = nameLookup(agents);
  const { text, quote } = describeNotable(event, name);
  const select = useWorldStore(s => s.selectAgent);
  return <li className={`feed-item${event.type === 'agent_spoke' || quote ? ' feed-speech' : ''}`}>
    <div className="flex items-baseline justify-between gap-3">
      <button type="button" className="text-left text-sm hover:underline" onClick={() => event.agentId && select(event.agentId)}>{text}</button>
      <time>{eventTime(event)}</time>
    </div>
    {quote !== undefined && quote !== '' && <blockquote>{quote}</blockquote>}
  </li>;
});

const RawItem = memo(function RawItem({ event, agent }: { event: WorldEvent; agent?: Agent }) {
  const reasoning = typeof event.payload?.reasoning === 'string' ? event.payload.reasoning : undefined;
  return <li className="feed-item">
    <div className="flex items-baseline justify-between gap-3"><span className="flex items-center gap-2 min-w-0"><Who agent={agent} /><span className="muted truncate">{eventLabel(event)}</span></span><time>{eventTime(event)}</time></div>
    {reasoning && <p className="hint m-0 mt-1 line-clamp-2">{reasoning}</p>}
  </li>;
});

/** What the agents said and did to each other, with the raw log one tab away. */
export function Feed() {
  useLocale();
  const [view, setView] = useState<'notable' | 'all'>('notable');
  const [bookkeeping, setBookkeeping] = useState(false);
  const notable = useNotableEvents();
  const events = useEvents();
  const agents = useAgents();
  const byId = useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const raw = useMemo(() => events.filter(event => event?.id && event.type && (bookkeeping || !BOOKKEEPING.has(event.type))).slice(0, 60), [events, bookkeeping]);

  return <section className="rail-section" aria-labelledby="feed-title">
    <div className="rail-head">
      <h2 id="feed-title" className="engraved m-0">{translate('Feed')}</h2>
      <div className="segmented" role="group" aria-label={translate('Feed view')}>
        <button type="button" aria-pressed={view === 'notable'} onClick={() => setView('notable')}>{translate('Said and done')}</button>
        <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>{translate('All events')}</button>
      </div>
    </div>
    {view === 'all' && <label className="flex items-center gap-2 px-4 pb-2 text-xs muted"><input type="checkbox" checked={bookkeeping} onChange={event => setBookkeeping(event.target.checked)} />{translate('Include bookkeeping events')}</label>}
    <div className="rail-scroll" role="region" tabIndex={0} aria-label={translate('Event Feed')}>
      {view === 'notable'
        ? notable.length === 0
          ? <p className="hint p-4 m-0">{translate('Nothing said or exchanged yet. Speech, gifts, blows and deaths appear here as they happen.')}</p>
          : <ul className="m-0 p-0 list-none">{notable.map(event => <NotableItem key={event.id} event={event} agents={agents} />)}</ul>
        : raw.length === 0
          ? <p className="hint p-4 m-0">{translate('No events yet...')}</p>
          : <ul className="m-0 p-0 list-none">{raw.map(event => <RawItem key={event.id} event={event} agent={event.agentId ? byId.get(event.agentId) : undefined} />)}</ul>}
    </div>
  </section>;
}
