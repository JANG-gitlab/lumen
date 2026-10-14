import { useEffect } from 'react';
import { closeProject, isViewing } from '../projectViewer';
import { WORK_SECTION_ID, nearestWorkStop, workDestination, workStops } from '../workScroll';

// Unités de WheelEvent.deltaMode : lignes (molette sous Firefox) et pages.
const LINE_HEIGHT = 100 / 6;
// Un pavé tactile reste « le pavé » tant que ses événements se suivent :
// une rafale n'est jamais coupée en deux entre natif et lissé.
const TRACKPAD_MEMORY = 300;
// Délai sans défilement natif avant d'aimanter sur un arrêt.
const NATIVE_SETTLE_DELAY = 140;
const SMOOTH_RATE = 9;
const WHEEL_FACTOR = 0.62;
// Passage d'un projet au suivant : assez long pour voir la lame se replier,
// changer de projet puis se redéplier.
const CROSSING_DURATION = 1500;
// Après un glissement, les entrées sont ignorées un court instant.
const GLIDE_GRACE = 120;
// Un geste au pavé commence après une pause, un changement de sens, ou une
// accélération nette (on reprend la main au milieu de l'élan précédent).
const GESTURE_GAP = 160;
const GESTURE_BOOST = 1.6;
const GESTURE_THRESHOLD = 10;
const SWIPE_THRESHOLD = 24;

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

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * Courbe du passage d'un projet à l'autre : départ et arrivée en douceur,
 * mais un net ralenti au milieu du trajet, là où la lame se replie et se
 * redéplie. Tabulée une fois (intégrale d'un profil de vitesse).
 */
const crossingCurve = (() => {
  const samples = 128;
  const curve = [0];
  for (let i = 1; i <= samples; i++) {
    const t = (i - 0.5) / samples;
    const speed = Math.sin(Math.PI * t) * (1 - 0.65 * Math.exp(-(((t - 0.5) / 0.16) ** 2)));
    curve.push(curve[i - 1] + speed);
  }
  const total = curve[samples];
  return curve.map((value) => value / total);
})();

function easeCrossing(t: number): number {
  const position = t * (crossingCurve.length - 1);
  const index = Math.min(crossingCurve.length - 2, Math.floor(position));
  const fraction = position - index;
  return crossingCurve[index] + (crossingCurve[index + 1] - crossingCurve[index]) * fraction;
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName))
  );
}

/**
 * Défilement du site, sans re-render React (tout passe par le scroll réel
 * du document, les ancres et position:sticky restent valables) :
 * - hors zone projets, la molette est lissée ; le pavé et le doigt restent
 *   natifs (le système leur donne déjà leur inertie) ;
 * - dans la zone projets, un geste vaut un projet, quelle que soit sa force :
 *   la page glisse d'arrêt en arrêt à vitesse maîtrisée, pour que chaque
 *   lame se replie et se redéplie en entier. L'élan du pavé qui traîne
 *   derrière un geste est ignoré ;
 * - si un défilement natif (barre, programme, élan tactile) s'arrête entre
 *   deux arrêts, la page rejoint le plus proche.
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
    let glideFrame = 0;
    let acceptInputAt = 0;
    let settleTimer = 0;
    let trackpadUntil = 0;
    let lastPadAt = 0;
    let lastPadSize = 0;
    let lastPadDirection = 0;
    let gestureTravel = 0;
    let gestureUsed = false;

    const maxScroll = () => Math.max(0, html.scrollHeight - window.innerHeight);
    const busy = (now: number) => glideFrame !== 0 || now < acceptInputAt;

    const lerp = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      current += (target - current) * (1 - Math.exp(-SMOOTH_RATE * dt));
      const done = Math.abs(target - current) < 0.5;
      if (done) current = target;
      window.scrollTo(0, current);
      lerpFrame = done ? 0 : requestAnimationFrame(lerp);
    };
    const startLerp = () => {
      if (lerpFrame) return;
      lastTime = performance.now();
      lerpFrame = requestAnimationFrame(lerp);
    };
    const stopLerp = () => {
      cancelAnimationFrame(lerpFrame);
      lerpFrame = 0;
    };

    /** Glisse jusqu'à `destination`, entrées gelées pendant le trajet. */
    const glide = (destination: number) => {
      stopLerp();
      cancelAnimationFrame(glideFrame);
      const stops = workStops();
      const spacing = stops ? stops[2] - stops[1] : window.innerHeight;
      const from = window.scrollY;
      const distance = Math.abs(destination - from);
      const crossing = distance > spacing * 0.9;
      const duration = crossing ? CROSSING_DURATION : 700 + 800 * Math.min(1, distance / spacing);
      const ease = crossing ? easeCrossing : easeInOutSine;
      const startAt = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startAt) / duration);
        current = target = from + (destination - from) * ease(t);
        window.scrollTo(0, current);
        if (t < 1) {
          glideFrame = requestAnimationFrame(step);
        } else {
          glideFrame = 0;
          acceptInputAt = now + GLIDE_GRACE;
        }
      };
      glideFrame = requestAnimationFrame(step);
    };

    /** Au pavé : ce mouvement ouvre-t-il un geste, ou prolonge-t-il un élan déjà utilisé ? */
    const readPadGesture = (delta: number, now: number): boolean => {
      const size = Math.abs(delta);
      const direction = Math.sign(delta);
      const fresh =
        now - lastPadAt > GESTURE_GAP || direction !== lastPadDirection || size > lastPadSize * GESTURE_BOOST + 6;
      lastPadAt = now;
      lastPadSize = size;
      lastPadDirection = direction;
      if (fresh) {
        gestureTravel = 0;
        gestureUsed = false;
      }
      gestureTravel += size;
      return !gestureUsed && gestureTravel >= GESTURE_THRESHOLD;
    };

    const settle = () => {
      if (isViewing() || busy(performance.now())) return;
      const stops = workStops();
      const nearest = stops ? nearestWorkStop(stops, window.scrollY) : null;
      if (nearest !== null) glide(nearest);
    };

    const onWheel = (event: WheelEvent) => {
      // Page projet ouverte : elle défile nativement, le document est figé.
      if (event.ctrlKey || event.metaKey || isViewing()) return;
      const delta = wheelPixels(event);
      if (delta === 0) return;
      const now = performance.now();
      const trackpad = now < trackpadUntil || looksLikeTrackpad(event);
      if (trackpad) trackpadUntil = now + TRACKPAD_MEMORY;
      const startsGesture = trackpad && readPadGesture(delta, now);

      if (busy(now)) {
        event.preventDefault();
        return;
      }
      const stops = workStops();
      const from = trackpad ? window.scrollY : target;
      const destination = stops ? workDestination(stops, from, trackpad ? delta : delta * WHEEL_FACTOR) : null;
      if (destination !== null) {
        event.preventDefault();
        if (trackpad && !startsGesture) return;
        gestureUsed = true;
        glide(destination);
        return;
      }
      if (trackpad) {
        stopLerp();
        return;
      }
      event.preventDefault();
      target = Math.min(maxScroll(), Math.max(0, target + delta * WHEEL_FACTOR));
      startLerp();
    };

    // Un scroll natif (pavé, clavier, barre, programme) resynchronise la
    // cible, puis aimante la page sur un arrêt une fois qu'il s'est arrêté.
    const onScroll = () => {
      const external = window.scrollY;
      if (glideFrame || Math.abs(external - current) <= 2) return;
      target = external;
      current = external;
      stopLerp();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, NATIVE_SETTLE_DELAY);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isViewing() || event.altKey || event.ctrlKey || event.metaKey || isInteractive(event.target)) return;
      const page = window.innerHeight * 0.9;
      const deltas: Record<string, number> = {
        ArrowDown: 40,
        ArrowUp: -40,
        PageDown: page,
        PageUp: -page,
        ' ': event.shiftKey ? -page : page,
      };
      const delta = deltas[event.key];
      if (delta === undefined) return;
      const stops = workStops();
      const destination = stops ? workDestination(stops, window.scrollY, delta) : null;
      if (destination === null) return;
      event.preventDefault();
      if (!busy(performance.now())) glide(destination);
    };

    // Au doigt : dans la zone projets, un balayage vaut un projet. Le sens
    // se décide au premier mouvement, avant que le navigateur ne défile.
    let touchStartY = 0;
    let touchDecided = false;
    let touchManaged = false;
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0].clientY;
      touchDecided = false;
      touchManaged = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (isViewing()) return;
      const delta = touchStartY - event.touches[0].clientY;
      if (!touchDecided && Math.abs(delta) > 6) {
        touchDecided = true;
        const stops = workStops();
        touchManaged =
          stops !== null &&
          (busy(performance.now()) || workDestination(stops, window.scrollY, Math.sign(delta)) !== null);
      }
      if (touchManaged) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!touchManaged || busy(performance.now())) return;
      const delta = touchStartY - event.changedTouches[0].clientY;
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      const stops = workStops();
      const destination = stops ? workDestination(stops, window.scrollY, Math.sign(delta)) : null;
      if (destination !== null) glide(destination);
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
      if (stops) {
        glide(stops[1]);
        return;
      }
      target = Math.min(maxScroll(), Math.max(0, element.getBoundingClientRect().top + window.scrollY));
      startLerp();
    };

    const onResize = () => {
      target = Math.min(maxScroll(), target);
    };

    if (!coarse) window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onClickAnchor);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onClickAnchor);
      stopLerp();
      cancelAnimationFrame(glideFrame);
      window.clearTimeout(settleTimer);
      html.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);
}
