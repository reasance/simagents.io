import { translate, useLocale } from '../i18n';
import { PromptInspector } from '../components/PromptInspector';

/** The prompts agents actually received and what they answered, logged on this device. */
export function PromptsPage() {
  useLocale();
  return <div className="feature-page">
    <header className="feature-header">
      <div><span className="engraved">{translate('Observer only')}</span><h1>{translate('Prompts')}</h1>
        <p className="hint m-0 mt-1 max-w-2xl">{translate('The exact prompt each agent read and the answer it gave, decision by decision.')}</p></div>
    </header>
    <main className="flex-1 min-h-0 overflow-hidden"><PromptInspector /></main>
    <footer className="feature-footer"><span>{translate('Local prompt logs are stored on this device')}</span></footer>
  </div>;
}
