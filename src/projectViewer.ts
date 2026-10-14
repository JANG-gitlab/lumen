import { PROJECTS } from './projects';
import { playLift } from './sound';
import { projectScrollTop } from './workScroll';

/**
 * Ouverture d'un projet : la lame avance vers la caméra jusqu'à couvrir
 * l'écran, puis la page projet prend le relais en fondu. La fermeture joue
 * la même chose à l'envers. L'adresse suit (#/projets/slug) pour que le
 * bouton retour du navigateur et les liens directs fonctionnent.
 */

export type ViewerPhase = 'idle' | 'opening' | 'open' | 'closing';

export interface ViewerState {
  readonly phase: ViewerPhase;
  readonly index: number;
}

const OPEN_DURATION = 1000;
const CLOSE_DURATION = 850;
// Doit rester égal à la transition d'opacité de .project-page (index.css).
export const PAGE_FADE = 380;
const HOVER_LIFT = 0.035;
const HOVER_RATE = 10;
const POINTER_RATE = 14;
const ROUTE_PREFIX = '#/projets/';
const VIEWING_CLASS = 'is-viewing';

interface LiftTween {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly duration: number;
}

let state: ViewerState = { phase: 'idle', index: -1 };
const listeners = new Set<() => void>();
let tween: LiftTween | null = null;
let restingLift = 0;
let hovered = false;
let hoverLift = 0;
let focus = 0;
let pointerGoal: [number, number] = [0.5, 0.5];
const pointer: [number, number] = [0.5, 0.5];
let lastRead = performance.now();
let ownsHistoryEntry = false;
let pendingTimer = 0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function setState(next: ViewerState) {
  state = next;
  for (const listener of listeners) listener();
}

function currentLift(now: number): number {
  if (!tween) return restingLift;
  const t = Math.min(1, (now - tween.start) / tween.duration);
  return tween.from + (tween.to - tween.from) * easeInOutCubic(t);
}

function animateLift(to: number, duration: number, then: () => void) {
  const now = performance.now();
  tween = { from: currentLift(now) + hoverLift, to, start: now, duration };
  hoverLift = 0;
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    restingLift = to;
    tween = null;
    then();
  }, duration);
}

function lockScroll(locked: boolean) {
  document.documentElement.classList.toggle(VIEWING_CLASS, locked);
}

function routeIndex(): number {
  if (!location.hash.startsWith(ROUTE_PREFIX)) return -1;
  const slug = decodeURIComponent(location.hash.slice(ROUTE_PREFIX.length));
  return PROJECTS.findIndex((project) => project.slug === slug);
}

function jumpToProject(index: number) {
  const top = projectScrollTop(index);
  if (top !== null) window.scrollTo(0, top);
}

function runOpen(index: number) {
  lockScroll(true);
  setState({ phase: 'opening', index });
  playLift('in', OPEN_DURATION);
  animateLift(1, OPEN_DURATION, () => setState({ phase: 'open', index }));
}

function runClose() {
  if (state.phase !== 'open') return;
  const { index } = state;
  jumpToProject(index);
  setState({ phase: 'closing', index });
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    playLift('out', CLOSE_DURATION);
    animateLift(0, CLOSE_DURATION, () => {
      lockScroll(false);
      setState({ phase: 'idle', index: -1 });
    });
  }, PAGE_FADE);
}

export function subscribeViewer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function viewerState(): ViewerState {
  return state;
}

export function isViewing(): boolean {
  return state.phase !== 'idle';
}

export interface PanelFeedback {
  readonly lift: number;
  readonly focus: number;
  readonly pointer: readonly [number, number];
}

/**
 * Réaction de la lame à transmettre au rendu : avancée (survol et ouverture)
 * et loupe qui suit le curseur, lissées dans le temps.
 */
export function panelFeedback(): PanelFeedback {
  const now = performance.now();
  const deltaTime = Math.min(0.1, (now - lastRead) / 1000);
  lastRead = now;
  const active = hovered && state.phase === 'idle';
  const hoverBlend = 1 - Math.exp(-HOVER_RATE * deltaTime);
  hoverLift += ((active ? HOVER_LIFT : 0) - hoverLift) * hoverBlend;
  focus += ((active ? 1 : 0) - focus) * hoverBlend;
  const pointerBlend = 1 - Math.exp(-POINTER_RATE * deltaTime);
  pointer[0] += (pointerGoal[0] - pointer[0]) * pointerBlend;
  pointer[1] += (pointerGoal[1] - pointer[1]) * pointerBlend;
  return { lift: currentLift(now) + hoverLift, focus, pointer };
}

/** Curseur sur la lame, en coordonnées de texture ; `null` quand il la quitte. */
export function setPanelPointer(position: readonly [number, number] | null) {
  hovered = position !== null;
  if (!position) return;
  // À l'entrée, la loupe apparaît sous le curseur au lieu d'y glisser.
  if (focus < 0.01) pointer.splice(0, 2, position[0], position[1]);
  pointerGoal = [position[0], position[1]];
}

export function openProject(index: number) {
  if (state.phase !== 'idle' || !PROJECTS[index]) return;
  history.pushState(null, '', `${ROUTE_PREFIX}${PROJECTS[index].slug}`);
  ownsHistoryEntry = true;
  runOpen(index);
}

export function closeProject() {
  if (state.phase !== 'open') return;
  if (ownsHistoryEntry) {
    ownsHistoryEntry = false;
    history.back();
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  runClose();
}

/** Passe au projet suivant sans quitter la page (la lame suit en arrière-plan). */
export function showProject(index: number) {
  if (state.phase !== 'open' || !PROJECTS[index]) return;
  history.replaceState(null, '', `${ROUTE_PREFIX}${PROJECTS[index].slug}`);
  setState({ phase: 'open', index });
}

/** Branche l'adresse : lien direct vers un projet, boutons précédent et suivant. */
export function installProjectRouting(): () => void {
  const initial = routeIndex();
  if (initial >= 0) {
    lockScroll(true);
    jumpToProject(initial);
    restingLift = 1;
    setState({ phase: 'open', index: initial });
  }

  const onPopState = () => {
    const index = routeIndex();
    if (index >= 0 && state.phase === 'idle') {
      ownsHistoryEntry = true;
      jumpToProject(index);
      runOpen(index);
    } else if (index < 0) {
      ownsHistoryEntry = false;
      runClose();
    } else if (state.phase === 'open' && index !== state.index) {
      setState({ phase: 'open', index });
    }
  };
  window.addEventListener('popstate', onPopState);
  return () => {
    window.removeEventListener('popstate', onPopState);
    window.clearTimeout(pendingTimer);
  };
}
