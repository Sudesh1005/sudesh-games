// Shared by every page: makes the collection an installable app (manifest + service worker)
// and keeps phones in landscape: full screen + orientation lock on the first tap, and a
// "turn your phone" screen while it's held upright.
(() => {
  const root = new URL('.', document.currentScript.src).href;
  const head = document.head;
  const tag = (name, attrs) => { const el = document.createElement(name); for (const k in attrs) el.setAttribute(k, attrs[k]); head.appendChild(el); return el; };
  tag('link', { rel: 'manifest', href: root + 'manifest.webmanifest' });
  tag('link', { rel: 'icon', type: 'image/png', href: root + 'icons/icon-192.png' });
  tag('link', { rel: 'apple-touch-icon', href: root + 'icons/apple-touch-icon.png' });
  tag('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  tag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  tag('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  tag('meta', { name: 'apple-mobile-web-app-title', content: 'Games' });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register(root + 'sw.js', { scope: root }).catch(() => {}));
  }

  const touch = matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search);
  if (!touch) return;

  // "turn your phone" screen, shown only in portrait
  const css = document.createElement('style');
  css.textContent = `
    #pwa-rotate { display: none; position: fixed; inset: 0; z-index: 2147483647; background: #0d0b1e; color: #f4f1ff;
      flex-direction: column; align-items: center; justify-content: center; gap: 18px; text-align: center; padding: 24px;
      font: 600 17px/1.4 Rubik, system-ui, -apple-system, 'Segoe UI', sans-serif; }
    #pwa-rotate svg { width: 92px; height: 92px; animation: pwa-turn 2.2s ease-in-out infinite; }
    #pwa-rotate small { font-weight: 400; font-size: 13px; color: #a9a3c9; }
    @keyframes pwa-turn { 0%, 25% { transform: rotate(0deg); } 55%, 100% { transform: rotate(-90deg); } }
    @media (orientation: portrait) { #pwa-rotate { display: flex; } }`;
  head.appendChild(css);
  const show = () => {
    if (document.getElementById('pwa-rotate')) return;
    const d = document.createElement('div');
    d.id = 'pwa-rotate';
    d.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="#ffd23f" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="20" y="6" width="24" height="44" rx="5"/><path d="M29 43h6"/></svg>
      <div>Turn your phone sideways to play</div><small>The games are made for landscape. Tap anywhere to go full screen.</small>`;
    document.body.appendChild(d);
  };
  if (document.body) show(); else addEventListener('DOMContentLoaded', show);

  // full screen + landscape lock (Android/Chrome; iPhones rely on the screen above)
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  const lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not supported */ } };
  if (standalone) lock();
  const go = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen && !standalone) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(lock, lock);
    } else lock();
  };
  addEventListener('pointerup', go, { capture: true, passive: true });
  addEventListener('orientationchange', () => setTimeout(lock, 300));
})();
