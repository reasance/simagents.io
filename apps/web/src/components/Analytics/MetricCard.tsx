import { translateLabel, useLocale } from '../../i18n';

interface MetricCardProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'alert';
  subtitle?: string;
}

/** One figure with an engraved label; sits inside a `.stat-grid`. */
export function MetricCard({ label, value, tone = 'default', subtitle }: MetricCardProps) {
  useLocale();
  return <div className="stat">
    <span className="engraved">{translateLabel(label)}</span>
    <span className={`stat-value${tone === 'alert' ? ' text-alert' : ''}`}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    {subtitle && <span className="hint">{translateLabel(subtitle)}</span>}
  </div>;
}
