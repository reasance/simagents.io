import { translateLabel, useLocale, translate } from '../../../i18n';

/**
 * BarChart - Simple horizontal SVG bar chart
 */

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  height?: number;
  showValues?: boolean;
  formatValue?: (value: number) => string;
}



export function BarChart({
  data,
  height = 120,
  showValues = true,
  formatValue = (v) => v.toLocaleString(),
}: BarChartProps) {
  useLocale();
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-city-text-muted text-sm">{translate("No data")}</div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barHeight = Math.min(24, (height - 20) / data.length);
  const gap = 4;

  return (
    <div className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barWidth = (d.value / maxValue) * 100;
        const color = d.color || 'var(--color-mist)';

        return (
          <div
            key={d.label}
            className="flex items-center gap-2"
            style={{ height: barHeight + gap, marginBottom: gap }}
          >
            <div className="w-24 text-xs text-city-text-muted truncate text-right">
              {translateLabel(d.label)}
            </div>
            <div className="flex-1 h-full bg-rule/40 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            {showValues && (
              <div className="w-16 text-xs figure text-right">
                {formatValue(d.value)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
