import { useEffect, useRef, type RefObject } from 'react';

/**
 * Suit la progression (0 à 1) du scroll à travers un élément cible
 * via rAF, sans re-render : la valeur est lue via la ref renvoyée.
 * Sans cible, retombe sur la progression simple scrollY / viewport.
 */
export function useScrollProgress(targetRef?: RefObject<HTMLElement | null>) {
  const progressRef = useRef(0);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      const viewportHeight = window.innerHeight || 1;
      let value: number;
      const target = targetRef?.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        const span = Math.max(1, rect.height - viewportHeight);
        value = Math.min(1, Math.max(0, -rect.top / span));
      } else {
        value = Math.min(1, Math.max(0, window.scrollY / viewportHeight));
      }
      if (progressRef.current !== value) progressRef.current = value;
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
  }, [targetRef]);

  return progressRef;
}