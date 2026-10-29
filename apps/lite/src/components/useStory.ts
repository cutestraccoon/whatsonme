import { useCallback, useEffect, useRef, useState } from 'react';

/** Shared story mechanics for the Wrapped story: index, auto-advance timer, tap/swipe/hold, arrow keys, Escape. */
export function useStory(durations: number[], onExit: () => void) {
  const n = durations.length;
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false); const [elapsed, setElapsed] = useState(0);
  const dur = durations[i] ?? 6500;
  const next = useCallback(() => { setI((x) => Math.min(n - 1, x + 1)); setElapsed(0); }, [n]);
  const prev = useCallback(() => { setI((x) => Math.max(0, x - 1)); setElapsed(0); }, []);
  const acc = useRef(0);
  useEffect(() => { acc.current = 0; setElapsed(0); }, [i]);
  useEffect(() => { if (paused || i === n - 1) return; let raf = 0; let last = performance.now(); const tick = (t: number) => { acc.current += t - last; last = t; if (acc.current >= dur) { next(); return; } setElapsed(acc.current); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [i, paused, dur, next, n]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement | null)?.closest?.('button,a,input,textarea,select')) return; if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); } if (e.key === 'ArrowLeft') prev(); if (e.key === 'Escape') onExit(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [next, prev, onExit]);
  const down = useRef<{ x: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { if ((e.target as HTMLElement).closest('button,a,input')) return; down.current = { x: e.clientX, t: Date.now() }; setPaused(true); };
  const onPointerUp = (e: React.PointerEvent) => { setPaused(false); const d = down.current; down.current = null; if (!d) return; const dx = e.clientX - d.x; const held = Date.now() - d.t > 350; if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); return; } if (held) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); (e.clientX - r.left) < r.width * 0.3 ? prev() : next(); };
  const onPointerLeave = () => { if (down.current) { down.current = null; setPaused(false); } };
  return { i, n, dur, elapsed, paused, next, prev, handlers: { onPointerDown, onPointerUp, onPointerLeave } };
}
