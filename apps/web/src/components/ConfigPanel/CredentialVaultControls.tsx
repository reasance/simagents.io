import { formatError } from '../../i18n/errors';
import { useLocale, translate } from '../../i18n';
import { useEffect, useState } from 'react';
import { useApiKeysStore } from '../../stores/apiKeys';

export function CredentialVaultControls() {
  useLocale();
  const keys = useApiKeysStore();
  const [passphrase, setPassphrase] = useState('');
  // Vault and legacy-key state is read from storage on demand.
  useEffect(() => { void useApiKeysStore.getState().fetchStatus(); }, []);
  const button = 'btn btn-small';
  const perform = async (action: () => Promise<void>) => {
    try { await action(); } finally { setPassphrase(''); }
  };
  return (
    <div className="grid gap-3 pt-2">
      <p className="hint m-0">{translate("Keys stay in memory for this tab and are lost on reload. Changes to session keys stop an active simulation and save its world.")}</p>
      {keys.hasLegacyKeys && (
        <div className="notice" role="status">
          <p>{translate("Old unencrypted keys were found on this device. They are not loaded automatically. Choose how to migrate them below.")}</p>
          <button className={`${button} mt-2`} disabled={keys.isLoading} onClick={() => void perform(() => keys.migrateLegacy())}>{translate("Move old keys to this session")}</button>
        </div>
      )}
      {keys.error && <p role="alert" className="notice notice-alert m-0">{formatError(keys.error)}</p>}
      <p className="m-0 text-sm" role="status">
        {keys.hasSavedVault ? (keys.vaultUnlocked ? translate("Encrypted vault unlocked for this tab.") : translate("Encrypted vault locked.")) : translate("No encrypted vault saved.")}
      </p>
      <label className="field max-w-md"><span>{translate("Vault passphrase (at least 12 characters)")}</span><input type="password" autoComplete="off" aria-label={translate("Vault passphrase")} value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)} disabled={keys.isLoading} maxLength={1024}
          />
      </label>
      <p className="hint m-0">{translate("Optional device storage uses AES-GCM encryption. The passphrase is never saved and cannot be recovered. Saving is explicit; edits to session keys do not update the saved vault.")}</p>
      <div className="flex flex-wrap gap-2">
        {keys.hasSavedVault && !keys.vaultUnlocked && <button className={button} disabled={keys.isLoading || passphrase.length < 12} onClick={() => void perform(() => keys.unlockVault(passphrase))}>{translate("Unlock vault")}</button>}
        <button className={button} disabled={keys.isLoading || passphrase.length < 12 || (!keys.vaultUnlocked && keys.hasSavedVault) || keys.hasPendingChanges() || Object.keys(keys.getActiveKeys()).length === 0}
          onClick={() => void perform(() => keys.saveVault(passphrase))}>{translate("Save session keys encrypted")}</button>
        {keys.hasLegacyKeys && <button className={button} disabled={keys.isLoading || passphrase.length < 12} onClick={() => void perform(() => keys.migrateLegacy(passphrase))}>{translate("Encrypt and migrate old keys")}</button>}
        <button className={button} disabled={keys.isLoading} onClick={() => void perform(keys.lockVault)}>{translate("Lock and clear session keys")}</button>
        {keys.hasSavedVault && <button className={button} disabled={keys.isLoading} onClick={() => void perform(keys.forgetVault)}>{translate("Remove saved vault")}</button>}
      </div>
    </div>
  );
}
