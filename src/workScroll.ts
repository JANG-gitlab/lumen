import { PROJECTS } from './projects';

export const WORK_SECTION_ID = 'work';

// Part de la fenêtre d'un projet occupée par le dépliage (et par le repli) :
// assez long pour suivre la déformation au scroll, cran par cran.
export const PANEL_RAMP = 0.28;
// Part de chaque bord de la fenêtre où la lame reste repliée : entre deux
// projets, la sculpture se montre entière avant de redevenir lame.
export const PANEL_HOLD = 0.12;

interface WorkSpan {
  readonly top: number;
  readonly span: number;
}

function workSpan(): WorkSpan | null {
  const element = document.getElementById(WORK_SECTION_ID);
  if (!element) return null;
  return {
    top: element.getBoundingClientRect().top + window.scrollY,
    span: Math.max(1, element.offsetHeight - window.innerHeight),
  };
}

/** Position de scroll où le projet est entièrement déployé (milieu de sa fenêtre). */
export function projectScrollTop(index: number): number | null {
  const work = workSpan();
  if (!work) return null;
  return work.top + (work.span * (index + 0.5)) / PROJECTS.length;
}

/**
 * Arrêts de la zone projets, dans l'ordre : l'entrée (lame repliée), le
 * centre de chaque projet (lame entière), la sortie (lame repliée).
 */
export function workStops(): number[] | null {
  const work = workSpan();
  if (!work) return null;
  const centers = PROJECTS.map((_, index) => work.top + (work.span * (index + 0.5)) / PROJECTS.length);
  return [work.top, ...centers, work.top + work.span];
}

export interface PanelTarget {
  readonly morph: number;
  readonly index: number;
}

/**
 * Déformation du verre dans la zone projets : la pièce centrale de la
 * sculpture se transforme en lame qui porte le projet courant, puis se replie
 * dans la matière avant le suivant. Morph à 0 sur les premiers et derniers
 * 12 % de la fenêtre du projet (la forme entière, de part et d'autre de
 * chaque frontière), puis dépliage et repli sur 28 % chacun ; la lame reste
 * entière sur les 20 % du milieu. Rampe linéaire : le shader applique la même courbe douce que le
 * passage d'une forme à l'autre.
 */
export function panelTarget(progress: number): PanelTarget {
  const count = PROJECTS.length;
  if (progress <= 0 || count === 0) return { morph: 0, index: -1 };
  const position = progress * count;
  const index = Math.min(count - 1, Math.floor(position));
  const local = position - index;
  const morph = Math.max(0, Math.min(1, (Math.min(local, 1 - local) - PANEL_HOLD) / PANEL_RAMP));
  return { morph, index };
}

/**
 * Rang du passage entre projets le plus proche (0 avant le premier projet,
 * 1 entre le premier et le deuxième…). Il change au milieu d'un projet, lame
 * entièrement déployée : la sculpture suivante se prépare cachée par la lame.
 */
export function workCrossing(progress: number): number {
  const count = PROJECTS.length;
  if (progress <= 0 || count === 0) return 0;
  return Math.min(count, Math.floor(Math.min(1, progress) * count + 0.5));
}
