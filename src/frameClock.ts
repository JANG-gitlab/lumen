/**
 * Horloge d'image partagée par le défilement et le rendu de la sculpture.
 *
 * Avec des boucles requestAnimationFrame séparées, l'ordre entre « la page
 * glisse » et « la sculpture se dessine » dépend de qui s'est inscrit en
 * premier : la sculpture affiche parfois la position de l'image précédente,
 * parfois celle de l'image courante, et ce retard irrégulier se voit comme
 * une saccade. Ici, les tâches de défilement passent par cette file, que le
 * rendu vide au début de chaque image (`flushFrame`) : elles s'exécutent
 * toujours avant le dessin. Sans rendu actif (pas de WebGPU, page projet
 * ouverte), la file tourne seule sur requestAnimationFrame.
 */

type FrameCallback = (now: number) => void;

let queue = new Map<number, FrameCallback>();
let nextId = 1;
let rafId = 0;
let lastFlush = -1;

// Horodatage commun à tous les rappels d'une même image (celui que reçoit
// requestAnimationFrame) : il sert à ne vider la file qu'une fois par image.
function frameTime(): number | null {
  const time = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
  return typeof time === 'number' ? time : null;
}

function run(now: number) {
  lastFlush = now;
  const due = queue;
  queue = new Map();
  for (const callback of due.values()) callback(now);
}

function loop(timestamp: number) {
  rafId = 0;
  const now = frameTime() ?? timestamp;
  if (now !== lastFlush) run(now);
  if (queue.size > 0) rafId = requestAnimationFrame(loop);
}

/** Comme requestAnimationFrame, mais garanti avant le rendu de la sculpture. */
export function requestFrame(callback: FrameCallback): number {
  const id = nextId++;
  queue.set(id, callback);
  if (!rafId) rafId = requestAnimationFrame(loop);
  return id;
}

export function cancelFrame(id: number) {
  queue.delete(id);
}

/** Exécute les tâches de l'image courante (appelé par le rendu avant de dessiner). */
export function flushFrame() {
  const now = frameTime();
  if (now === null || now === lastFlush) return;
  run(now);
}
