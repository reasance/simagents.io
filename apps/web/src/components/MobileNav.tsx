import { translate, useLocale, type TranslationKey } from '../i18n';

export type MobileView = 'map' | 'participants' | 'feed' | 'details';

interface MobileNavProps {
  current: MobileView;
  onChange: (view: MobileView) => void;
  alive: number;
  notable: number;
  hasSelection: boolean;
}

const ITEMS: Array<{ id: MobileView; label: TranslationKey }> = [
  { id: 'map', label: 'Map' },
  { id: 'participants', label: 'Participants' },
  { id: 'feed', label: 'Feed' },
  { id: 'details', label: 'Details' },
];

/** Bottom navigation for the world on small screens. */
export function MobileNav({ current, onChange, alive, notable, hasSelection }: MobileNavProps) {
  useLocale();
  const count = (id: MobileView) => id === 'participants' ? alive : id === 'feed' ? notable : undefined;
  return <nav className="mobile-nav lg:hidden" aria-label={translate('World views')}>
    {ITEMS.map(item => <button key={item.id} type="button" aria-current={current === item.id ? 'page' : undefined} disabled={item.id === 'details' && !hasSelection}
      onClick={() => onChange(item.id)}>
      <span>{translate(item.label)}</span>
      {count(item.id) !== undefined && <span className="count">{count(item.id)}</span>}
    </button>)}
  </nav>;
}
