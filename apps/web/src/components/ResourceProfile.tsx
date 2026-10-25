import { useMemo } from 'react';
import { translate, translateLabel, useLocale } from '../i18n';
import { useAgents, useSelectedResource, useWorldStore } from '../stores/world';

const LABELS: Record<string, 'Food' | 'Energy' | 'Material'> = { food: 'Food', energy: 'Energy', material: 'Material' };
const BIOMES: Record<string, 'Forest' | 'Tundra' | 'Desert' | 'Plains'> = { forest: 'Forest', tundra: 'Tundra', desert: 'Desert', plains: 'Plains' };

/** A resource spawn as the observer sees it: how much is left and who is standing on it. */
export function ResourceProfile({ onBack }: { onBack?: () => void }) {
  useLocale();
  const resource = useSelectedResource();
  const agents = useAgents();
  const selectResource = useWorldStore(s => s.selectResource);
  const selectAgent = useWorldStore(s => s.selectAgent);
  const here = useMemo(() => resource ? agents.filter(a => a.x === resource.x && a.y === resource.y && a.health > 0) : [], [agents, resource]);
  if (!resource) return <p className="hint p-4">{translate('Resource not found')}</p>;
  const percent = Math.max(0, Math.min(100, (resource.currentAmount / Math.max(1, resource.maxAmount)) * 100));
  return <div className="grid gap-5 p-4 pt-2">
    <button type="button" className="btn btn-quiet btn-small justify-self-start -ml-2" onClick={onBack ?? (() => selectResource(null))}>← {translate('All participants')}</button>
    <header className="grid gap-1">
      <h2 className="m-0 text-lg font-medium">{translate('Resource {type}', { type: translateLabel(LABELS[resource.resourceType] ?? resource.resourceType) })}</h2>
      <p className="m-0 hint">{translate('at')} <span className="figure">({resource.x}, {resource.y})</span>{resource.biome && ` · ${translateLabel(BIOMES[resource.biome] ?? resource.biome)}`}</p>
    </header>
    <section className="grid gap-2">
      <h3 className="engraved m-0">{translate('Quantity')}</h3>
      <div className="meter"><span style={{ width: `${percent}%` }} /></div>
      <p className="m-0 figure text-sm">{resource.currentAmount.toFixed(1)} / {resource.maxAmount}</p>
    </section>
    <section className="grid gap-2">
      <h3 className="engraved m-0">{translate('Agents here')}</h3>
      {here.length === 0 ? <p className="hint m-0">{translate('No one is here.')}</p>
        : <ul className="m-0 p-0 list-none grid gap-1">{here.map(agent => <li key={agent.id}><button type="button" className="btn btn-quiet btn-small" onClick={() => selectAgent(agent.id)}><span className="dot" style={{ color: agent.color }} aria-hidden="true" />{agent.name ?? agent.llmType}</button></li>)}</ul>}
    </section>
  </div>;
}
