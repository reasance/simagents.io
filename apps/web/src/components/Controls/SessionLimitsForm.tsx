import { useLocale, translate, translateLabel } from '../../i18n';
import { useState } from 'react';
import { useSessionLimitsStore } from '../../stores/sessionLimits';
const FIELDS = [
  ['maxRequests', 'Requests', 1, 10000],
  ['maxDurationSeconds', 'Duration (seconds)', 1, 3600],
  ['maxOutputTokens', 'Tokens per response', 32, 32768],
] as const;
type Field = typeof FIELDS[number][0];
function valid(value: string, min: number, max: number): boolean {
  return value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}
export function SessionLimitsForm({ onValidityChange }: { onValidityChange: (valid: boolean) => void }) {
  useLocale();
  const { limits, setLimits } = useSessionLimitsStore();
  const [draft, setDraft] = useState<Record<Field, string>>(() => ({
    maxRequests: String(limits.maxRequests), maxDurationSeconds: String(limits.maxDurationSeconds), maxOutputTokens: String(limits.maxOutputTokens),
  }));
  return <fieldset className="grid gap-3 border-0 p-0 m-0">
    <legend className="sr-only">{translate("Session limits")}</legend>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {FIELDS.map(([key, label, min, max]) => <label key={key} className="field"><span>{translateLabel(label)}</span>
        <input aria-label={translateLabel(label)} aria-invalid={!valid(draft[key], min, max)} aria-describedby={`limit-${key}-error`}
          type="number" min={min} max={max} step={1} required value={draft[key]}
          onChange={(event) => {
            const next = { ...draft, [key]: event.target.value }; setDraft(next);
            const allValid = FIELDS.every(([field, , lower, upper]) => valid(next[field], lower, upper));
            onValidityChange(allValid);
            if (allValid) setLimits({ ...limits, maxRequests: Number(next.maxRequests), maxDurationSeconds: Number(next.maxDurationSeconds), maxOutputTokens: Number(next.maxOutputTokens) });
          }}
          className="figure" />
        {!valid(draft[key], min, max) && <span id={`limit-${key}-error`} className="text-alert">{translate("Enter a whole number from")}{" "}{min}{" "}{translate("to")}{" "}{max}.</span>}
      </label>)}
    </div>
    <p className="hint m-0">{translate("All connections share a maximum of six concurrent requests and 50 requests per minute.")}</p>
    <p className="hint m-0">{translate("Wall-clock duration includes pauses. Each provider allows up to")}{" "}{limits.maxConcurrentPerConnection}{" "}{translate("concurrent requests, spaced at")}{" "}{limits.requestsPerMinutePerConnection}{translate("/minute. Failed or cancelled requests may still be billed. This local counter is not a guaranteed provider billing cap.")}</p>
  </fieldset>;
}
