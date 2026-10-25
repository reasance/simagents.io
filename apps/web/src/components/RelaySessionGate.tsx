import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { admissionConfig, relaySession, useRelaySession } from '../services/relay-access';
import { loadTurnstile, proofSnapshot, subscribeProof } from '../services/turnstile';
import { translate, useLocale } from '../i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';
export function RelayAccessButton() {
  useLocale();
  const state = useRelaySession();
  if (!admissionConfig()) return null;
  return <div className="grid gap-2 text-sm">
    <button type="button" className="btn btn-small" disabled={state.status === 'checking' || state.status === 'interaction-required'} onClick={() => void relaySession.start()}>{translate(state.status === 'ready' ? 'Renew relay access' : 'Get relay access')}</button>
    <p role="status">{translate(state.status === 'ready' ? 'Relay access is ready in this tab.' : 'Complete the security check to use the public relay. No account is needed.')}</p>
  </div>;
}
export function RelaySessionGate() {
  const locale = useLocale();
  const state = useRelaySession();
  const proof = useSyncExternalStore(subscribeProof, proofSnapshot, proofSnapshot);
  const container = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const visible = !dismissed && (!!state.warmUntil || state.status === 'interaction-required' || state.status === 'failed' || state.status === 'expired' || (state.status === 'checking' && !state.renewing));
  const close = useCallback(() => { relaySession.cancel(); setDismissed(true); }, []);
  useDialogFocus(dialog, visible, close);
  useEffect(() => { if (state.status === 'checking' || state.status === 'interaction-required') setDismissed(false); }, [state.status]);
  useLayoutEffect(() => {
    if (!visible) return;
    const root = document.getElementById('root');
    const previous = root?.inert;
    if (root) root.inert = true;
    return () => { if (root) root.inert = previous ?? false; };
  }, [visible]);
  useEffect(() => {
    if (!proof || !container.current) return;
    const config = admissionConfig(); if (!config) { proof.fail(); return; }
    let disposed = false, remove: (() => void) | undefined;
    void loadTurnstile().then(api => {
      if (disposed || proof.signal.aborted || !container.current) return;
      const id = api.render(container.current, {
        sitekey: config.siteKey, action: 'simagents-session', language: locale, size: 'compact', theme: 'auto',
        appearance: 'interaction-only', retry: 'never', 'refresh-expired': 'never', 'refresh-timeout': 'never', 'response-field': false,
        callback: (token: string) => { if (!disposed) proof.succeed(token); },
        'before-interactive-callback': () => { if (!disposed) proof.interact(); },
        'error-callback': () => { if (!disposed) proof.fail(); },
        'expired-callback': () => { if (!disposed) proof.fail(); },
        'timeout-callback': () => { if (!disposed) proof.fail(); },
        'unsupported-callback': () => { if (!disposed) proof.fail(); },
      });
      remove = () => api.remove(id);
    }).catch(() => { if (!disposed) proof.fail(); });
    return () => { disposed = true; remove?.(); };
    // Changing product language must not issue a second proof for this attempt.
  }, [proof]);
  if (!admissionConfig()) return null;
  return createPortal(<div className={visible ? 'relay-access-backdrop' : 'relay-access-background'} aria-hidden={!visible}>
    <div ref={dialog} role={visible ? 'dialog' : undefined} aria-modal={visible || undefined} aria-labelledby="relay-access-title" tabIndex={-1} className="relay-access-dialog">
      {visible && <><h2 id="relay-access-title">{translate('Public relay access')}</h2>
        <p>{translate(state.warmUntil && state.status === 'checking' ? 'Preparing relay access. This can take up to 90 seconds after a restart. No new inference will be retried.' : state.status === 'interaction-required' ? 'Complete the security check. New requests are paused.' : state.status === 'expired' ? 'Relay access expired. Get new access, then resume explicitly.' : state.status === 'failed' ? 'Relay access could not be verified. No inference was retried.' : 'Checking relay access…')}</p>
        {state.failure && <p role="alert">{translate(state.failure === 'rate-limit' ? 'Too many access attempts. Wait before trying again.' : state.failure === 'not-configured' ? 'Public relay access is not configured for this build.' : 'Security verification is unavailable or was cancelled.')}</p>}
        <p>{translate('Security verification connects to Cloudflare. Provider keys and experiment content are not sent to the admission service.')}</p></>}
      <div ref={container} />
      {visible && <div className="flex flex-wrap gap-2">
        {(state.status === 'failed' || state.status === 'expired') && <button onClick={() => { setDismissed(false); void relaySession.start(); }}>{translate('Try security verification again')}</button>}
        <button onClick={close}>{translate('Close')}</button>
        <p>{translate('The simulation stays paused. Resume it explicitly after access is ready.')}</p>
      </div>}
    </div>
  </div>, document.body);
}
