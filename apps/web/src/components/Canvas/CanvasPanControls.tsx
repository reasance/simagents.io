import { useId, useRef, type KeyboardEventHandler } from 'react';
import { translate, useLocale } from '../../i18n';
/** Click/tap alternatives to panning gestures; the popover escapes canvas clipping. */
export function CanvasPanControls({ move, reset, onKeyDown, label = 'Move map view', resetLabel = 'Reset camera', disabled = false }: { move: (x: number, y: number) => void; reset: () => void; onKeyDown: KeyboardEventHandler<HTMLButtonElement>; label?: 'Move map view' | 'Move selected graph agent'; resetLabel?: 'Reset camera' | 'Release agent position'; disabled?: boolean }) {
  useLocale();
  const id = useId(), popover = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const actions = [['Move left', -40, 0, '←'], ['Move right', 40, 0, '→'], ['Move up', 0, -40, '↑'], ['Move down', 0, 40, '↓']] as const;
  return <>
    <button ref={trigger} type="button" disabled={disabled} popoverTarget={id} aria-label={translate(label)} title={translate(label === 'Move map view' ? 'Map keyboard help' : label)} onKeyDown={onKeyDown}>{label === 'Move map view' ? '↔' : '⊕'}</button>
    <div ref={popover} id={id} popover="auto" role="group" aria-label={translate(label)} className="canvas-pan-popover">
      <h3>{translate(label)}</h3>
      <div className="panel-adjustment-grid">
        {actions.map(([label, x, y, icon]) => <button type="button" key={label} aria-label={translate(label)} title={translate(label)} onClick={() => move(x, y)}>{icon}</button>)}
        <button type="button" aria-label={translate(resetLabel)} title={translate(resetLabel)} onClick={reset}>↺</button>
      </div>
      <button type="button" onClick={() => { popover.current?.hidePopover(); trigger.current?.focus(); }}>{translate('Close')}</button>
    </div>
  </>;
}
