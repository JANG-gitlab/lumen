import { useEffect } from 'react';
import { cancelFrame, requestFrame } from '../frameClock';
import { closeProject, isViewing } from '../projectViewer';
import { WORK_SECTION_ID, workStops } from '../workScroll';

// Unités de WheelEvent.deltaMode : lignes (molette sous Firefox) et pages.
const LINE_HEIGHT = 100 / 6;
// Un pavé tactile reste « le pavé » tant que ses événements se suivent :
// une rafale n'est jamais coupée en deux entre natif et lissé.
const TRACKPAD_MEMORY = 300;
const SMOOTH_RATE = 9;
const WHEEL_FACTOR = 0.62;

type LegacyWheelEvent = WheelEvent & { readonly wheelDeltaY?: number };

/**
 * Pas d'API pour distinguer pavé tactile et molette. Heuristique la plus
 * fiable connue : sous Chrome et Safari, un pavé donne wheelDeltaY = -3 ×
 * deltaY, une molette des crans de 120 ; sous Firefox (sans wheelDeltaY),
 * la molette compte en lignes et le pavé en pixels.
 */
function looksLikeTrackpad(event: LegacyWheelEvent): boolean {
  if (event.deltaX !== 0) return true;
  if (event.wheelDeltaY) return event.wheelDeltaY === -3 * event.deltaY;
  return event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
}

function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_HEIGHT;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

/**
 * Défilement du site, sans re-render React (tout passe par le scroll réel
 * du document, les ancres et position:sticky restent valables). Aucune
 * aimantation : la page reste là où l'utilisateur la laisse, et toutes les
 * animations (lame, formes) suivent directement la position du scroll.
 * - la molette est lissée (ses crans donneraient des sauts) ;
 * - le pavé, le doigt et le clavier restent natifs : le système leur donne
 *   déjà leur inertie.
 */
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;

    const html = document.documentElement;
    const previousScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';

    let target = window.scrollY;
    let current = target;
    let lerpFrame = 0;
    let lastTime = performance.now();
    let trackpadUntil = 0;

    const maxScroll = () => Math.max(0, html.scrollHeight - window.innerHeight);

    const lerp = (time: number) => {
      const dt = Math.max(0, Math.min(0.05, (time - lastTime) / 1000));
      lastTime = time;
      current += (target - current) * (1 - Math.exp(-SMOOTH_RATE * dt));
      const done = Math.abs(target - current) < 0.5;
      if (done) current = target;
      window.scrollTo(0, current);
      lerpFrame = done ? 0 : requestFrame(lerp);
    };
    const startLerp = () => {
      if (lerpFrame) return;
      lastTime = performance.now();
      lerpFrame = requestFrame(lerp);
    };
    const stopLerp = () => {
      cancelFrame(lerpFrame);
      lerpFrame = 0;
    };
    const scrollToSmoothly = (top: number) => {
      target = Math.min(maxScroll(), Math.max(0, top));
      startLerp();
    };

    const onWheel = (event: WheelEvent) => {
      // Page projet ouverte : elle défile nativement, le document est figé.
      if (event.ctrlKey || event.metaKey || isViewing()) return;
      const delta = wheelPixels(event);
      if (delta === 0) return;
      const now = performance.now();
      if (now < trackpadUntil || looksLikeTrackpad(event)) {
        trackpadUntil = now + TRACKPAD_MEMORY;
        stopLerp();
        return;
      }
      event.preventDefault();
      scrollToSmoothly(target + delta * WHEEL_FACTOR);
    };

    // Un scroll natif (pavé, doigt, clavier, barre, programme) resynchronise
    // la cible du lissage.
    const onScroll = () => {
      const external = window.scrollY;
      if (Math.abs(external - current) <= 2) return;
      target = external;
      current = external;
      stopLerp();
    };

    const onClickAnchor = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute('href');
      if (!id || id.length < 2 || id.startsWith('#/')) return;
      const element = document.getElementById(id.slice(1));
      if (!element) return;
      event.preventDefault();
      if (isViewing()) {
        closeProject();
        return;
      }
      // « Work » mène directement au premier projet, lame déployée.
      const stops = id.slice(1) === WORK_SECTION_ID ? workStops() : null;
      scrollToSmoothly(stops ? stops[1] : element.getBoundingClientRect().top + window.scrollY);
    };

    const onResize = () => {
      target = Math.min(maxScroll(), target);
    };

    if (!coarse) window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onClickAnchor);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onClickAnchor);
      stopLerp();
      html.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);
}
