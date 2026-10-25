import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RelaySessionGate } from './components/RelaySessionGate';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/press-start-2p/latin-400.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RelaySessionGate />
  </StrictMode>
);

