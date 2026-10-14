import { useEffect, useRef } from 'react';

/**
 * Progression globale du scroll (0 à 1 sur tout le document),
 * lue via rAF sans re-render : on utilise la ref renvoyée.
 */
export function usePageProgress() {
  const progressRef = useRef(0);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      progressRef.current = Math.min(1, Math.max(0, window.scrollY / maxScroll));
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
  }, []);

  return progressRef;
}