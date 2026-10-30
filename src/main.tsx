import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// When running inside the compiled Capacitor Android APK (https://localhost),
// transparently route relative /api/* calls to the cloud backend so all server features work natively.
if (
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost' &&
  !window.location.port
) {
  const CLOUD_BACKEND = 'https://ais-pre-m6yacwh3iqmlaxaen2hlaz-961583522635.europe-west2.run.app';
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return originalFetch(`${CLOUD_BACKEND}${input}`, init);
    }
    return originalFetch(input, init);
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore service worker registration errors in preview iframe
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);

