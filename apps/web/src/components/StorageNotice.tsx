import { useLocale, translate } from '../i18n';
import { useSyncExternalStore } from 'react';
import { getSecondaryWarning, subscribeSecondaryWarning, resumeSecondaryCollection, reportSecondaryFailure } from '../services/secondary-data';
import { clearReplayFrames } from '../services/replayFrames';
import { clearPromptLogs } from '../services/promptLogs';
import { clearExperimentRuns } from '../services/experiments';
export function StorageNotice() {
  useLocale();
  const warning = useSyncExternalStore(subscribeSecondaryWarning, getSecondaryWarning);
  if (!warning) return null;
  const removeSecondary = async () => {
    if (!window.confirm(translate('Delete saved replay frames, prompt summaries and experiment runs? The saved world will be kept.'))) return;
    try { await clearReplayFrames(); await clearPromptLogs(); await clearExperimentRuns(); }
    catch (error) { reportSecondaryFailure(error); }
  };
  return <div role="alert" className="fixed top-16 left-4 right-4 z-[250] bg-night border border-brass rounded p-3 text-sm text-brass">
    {warning} <button className="underline ml-2" onClick={resumeSecondaryCollection}>{translate("Retry collection")}</button>
    <button className="underline ml-2" onClick={removeSecondary}>{translate("Delete secondary data")}</button>
  </div>;
}
