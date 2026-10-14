import { useEffect, type RefObject } from 'react';

// Le faisceau rattrape le curseur avec un léger retard, comme un projecteur
// qu'on oriente à la main ; il s'allume et s'éteint en fondu.
const FOLLOW_RATE = 11;
const POWER_RATE = 5;
// Portée de la lumière sur les textes (px) : au-delà, plus d'ombre portée.
const BEAM_REACH = 140;
const SHADOW_LENGTH = 0.035;
const SHADOW_MAX = 18;
const SHADOW_OPACITY = 0.32;

/**
 * Projecteur qui suit le curseur au-dessus d'une section : il éclaire la
 * surface (variables --spot-x, --spot-y, --spot-power lues par le CSS) et
 * chaque élément marqué `data-spot` porte une ombre à l'opposé de la
 * lumière (--cast-x, --cast-y, --cast-blur, --cast-alpha). Réservé aux
 * pointeurs qui survolent : au doigt, rien ne change.
 */
export function useSpotlight(sectionRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const casters = Array.from(section.querySelectorAll<HTMLElement>('[data-spot]'));

    const pointer = { x: 0, y: 0 };
    const beam = { x: 0, y: 0 };
    let inside = false;
    let power = 0;
    let frame = 0;
    let lastTime = 0;

    const render = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      const follow = 1 - Math.exp(-FOLLOW_RATE * dt);
      beam.x += (pointer.x - beam.x) * follow;
      beam.y += (pointer.y - beam.y) * follow;
      power += ((inside ? 1 : 0) - power) * (1 - Math.exp(-POWER_RATE * dt));

      section.style.setProperty('--spot-x', `${beam.x}px`);
      section.style.setProperty('--spot-y', `${beam.y}px`);
      section.style.setProperty('--spot-power', power.toFixed(3));

      for (const caster of casters) {
        const rect = caster.getBoundingClientRect();
        const awayX = rect.left + rect.width / 2 - beam.x;
        const awayY = rect.top + rect.height / 2 - beam.y;
        const reachX = Math.max(rect.left - beam.x, 0, beam.x - rect.right);
        const reachY = Math.max(rect.top - beam.y, 0, beam.y - rect.bottom);
        const lit = Math.exp(-((reachX * reachX + reachY * reachY) / (BEAM_REACH * BEAM_REACH))) * power;
        const length = Math.min(SHADOW_MAX, Math.hypot(awayX, awayY) * SHADOW_LENGTH);
        const scale = length / Math.max(1, Math.hypot(awayX, awayY));
        caster.style.setProperty('--cast-x', `${(awayX * scale).toFixed(2)}px`);
        caster.style.setProperty('--cast-y', `${(awayY * scale).toFixed(2)}px`);
        caster.style.setProperty('--cast-blur', `${(4 + length * 0.9).toFixed(1)}px`);
        caster.style.setProperty('--cast-alpha', (lit * SHADOW_OPACITY).toFixed(3));
      }

      frame = inside || power > 0.005 ? requestAnimationFrame(render) : 0;
    };

    const wake = () => {
      if (frame) return;
      lastTime = performance.now();
      frame = requestAnimationFrame(render);
    };

    const onEnter = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!power) {
        beam.x = event.clientX;
        beam.y = event.clientY;
      }
      inside = true;
      wake();
    };
    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      wake();
    };
    const onLeave = () => {
      inside = false;
      wake();
    };
    // Le texte défile sous un faisceau immobile : les ombres doivent suivre.
    const onScroll = () => {
      if (inside) wake();
    };

    section.addEventListener('pointerenter', onEnter);
    section.addEventListener('pointermove', onMove);
    section.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      section.removeEventListener('pointerenter', onEnter);
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sectionRef]);
}
