import { useEffect, useRef, useState } from 'react';

const HOVER_SELECTOR = 'a, button, [role="button"], input, select, textarea, summary, [data-cursor]';
// Sur la lame de verre, le curseur devient l'anneau d'une loupe.
const LENS_SELECTOR = '[data-cursor="lens"]';

type CursorMode = 'star' | 'sun' | 'lens';

const RAY_COUNT = 12;
const SPARK_PATH =
  'M0 -20.5 C0.9 -7.2 7.2 -0.9 20.5 0 C7.2 0.9 0.9 7.2 0 20.5 C-0.9 7.2 -7.2 0.9 -20.5 0 C-7.2 -0.9 -0.9 -7.2 0 -20.5 Z';

const RAYS = Array.from({ length: RAY_COUNT }, (_, i) => (
  <rect
    key={i}
    x="-0.35"
    y="-36"
    width="0.7"
    height="25"
    transform={`rotate(${(360 / RAY_COUNT) * i})`}
  />
));

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CursorMode>('star');

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const cursor = cursorRef.current;
    if (!cursor) return;

    document.documentElement.classList.add('has-cursor');
    let targetX = -100;
    let targetY = -100;
    let currentX = -100;
    let currentY = -100;
    let raf = 0;

    const follow = () => {
      currentX += (targetX - currentX) * 0.22;
      currentY += (targetY - currentY) * 0.22;
      cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(follow);
    };

    const onMove = (event: MouseEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!raf) raf = requestAnimationFrame(follow);
    };

    const onOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(LENS_SELECTOR)) setMode('lens');
      else setMode(target?.closest?.(HOVER_SELECTOR) ? 'sun' : 'star');
    };

    const onLeave = () => {
      targetX = -100;
      targetY = -100;
      currentX = -100;
      currentY = -100;
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    document.documentElement.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={cursorRef} className="cursor" data-mode={mode} aria-hidden="true">
      <svg className="cursor__svg" viewBox="-50 -50 100 100" width="56" height="56">
        <g className="cursor__core">
          <circle r="7" />
        </g>
        <g className="cursor__star">
          <path d={SPARK_PATH} />
        </g>
        <g className="cursor__rays-spin">
          <g className="cursor__rays">{RAYS}</g>
        </g>
        <circle className="cursor__ring" r="44" />
      </svg>
    </div>
  );
}