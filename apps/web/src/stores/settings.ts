import { create } from 'zustand';

const PROXY_URL_KEY = 'simagents_proxy_url';

function loadProxyUrlFromStorage(): string {
  try {
    return localStorage.getItem(PROXY_URL_KEY) ?? '';
  } catch (e) {
    console.warn('[Settings] Failed to load proxy URL from localStorage:', e);
    return '';
  }
}

function saveProxyUrlToStorage(proxyUrl: string): void {
  try {
    const trimmed = proxyUrl.trim();
    if (trimmed) localStorage.setItem(PROXY_URL_KEY, trimmed);
    else localStorage.removeItem(PROXY_URL_KEY);
  } catch (e) {
    console.warn('[Settings] Failed to save proxy URL to localStorage:', e);
  }
}

export interface SettingsState {
  /** User relay for providers that do not accept direct browser calls. */
  proxyUrl: string;
  setProxyUrl: (proxyUrl: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  proxyUrl: loadProxyUrlFromStorage(),
  setProxyUrl: (proxyUrl) => {
    set({ proxyUrl });
    saveProxyUrlToStorage(proxyUrl);
  },
}));

export const useProxyUrl = () => useSettingsStore((state) => state.proxyUrl);
