import { useEffect, useState } from 'react';

interface BIP extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/** Install + update plumbing for the PWA. Plain navigator.serviceWorker so there is no hidden registration logic. On an unsupported browser every value is null/false. */
export function usePwa() {
  const [installEvt, setInstallEvt] = useState<BIP | null>(null);
  const [update, setUpdate] = useState<(() => void) | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setInstallEvt(e as BIP); };
    window.addEventListener('beforeinstallprompt', onBip);
    const installed = () => setInstallEvt(null); window.addEventListener('appinstalled', installed);
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
        if (reg.active && !reg.waiting) setOfflineReady(true);
        const offerUpdate = (w: ServiceWorker) => setUpdate(() => () => { w.postMessage({ type: 'SKIP_WAITING' }); });
        if (reg.waiting) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => { const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed') { if (navigator.serviceWorker.controller) offerUpdate(nw); else setOfflineReady(true); } }); });
      }).catch((e) => console.warn('Service worker registration failed', e));
      let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    }
    return () => { window.removeEventListener('beforeinstallprompt', onBip); window.removeEventListener('appinstalled', installed); };
  }, []);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  const install = installEvt ? async () => { await installEvt.prompt(); const c = await installEvt.userChoice; if (c.outcome === 'accepted') setInstallEvt(null); } : null;
  return { install, update, offlineReady, standalone, ios };
}
