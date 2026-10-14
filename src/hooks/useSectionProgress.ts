import { useEffect, useRef } from 'react';

/**
 * Progression du scroll à travers un élément (0 à 1 du premier pixel
 * visible jusqu'au dernier), lue via rAF sans re-render.
 */
export function useSectionProgress(selector: string) {
  const progressRef = useRef(0);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;
      const viewportHeight = window.innerHeight || 1;
      const rect = element.getBoundingClientRect();
      const span = Math.max(1, rect.height - viewportHeight);
      const top = -Math.min(0, rect.top);
      progressRef.current = Math.min(1, Math.max(0, top / span));
      ticking = false;
    };
    const requestTick = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', requestTick);
    return () => {
      window.removeEventListener('scroll', requestTick);
      window.removeEventListener('resize', requestTick);
    };
  }, [selector]);

  return progressRef;
}