'use client';

import { useEffect, useState } from 'react';

export function PwaRegistration() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((next) => {
        if (next.waiting) { setWaitingRegistration(next); setUpdateReady(true); }
        next.addEventListener('updatefound', () => {
          const installing = next.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) { setWaitingRegistration(next); setUpdateReady(true); }
          });
        });
      }).catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  if (!updateReady) return null;
  return <aside className="pwa-update-notice" role="status">新版本已准备好。当前写作不会被中断，保存完后再更新。<button onClick={() => { waitingRegistration?.waiting?.postMessage({ type: 'MOJIE_ACTIVATE_UPDATE' }); window.location.reload(); }} type="button">立即更新</button></aside>;
}
