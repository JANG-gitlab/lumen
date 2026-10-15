import { useState, useSyncExternalStore } from 'react';
import { Example as GlassSculpture } from '../../glass-sculpture';
import type { ScenePanelFrame } from '../../glass-sculpture/scene';
import { flushFrame } from '../frameClock';
import { PROJECTS } from '../projects';
import { panelFeedback, viewerState } from '../projectViewer';
import { currentTheme, subscribeTheme } from '../theme';
import { WORK_SECTION_ID, panelTarget, workCrossing } from '../workScroll';


function pageProgress(): number {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(1, Math.max(0, window.scrollY / maxScroll));
}

// Même mesure que useSectionProgress : 0 au haut de la section, 1 quand son
// bas atteint le bas de l'écran.
function sectionProgress(id: string): number {
  const element = document.getElementById(id);
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  const span = Math.max(1, rect.height - window.innerHeight);
  return Math.min(1, Math.max(0, -Math.min(0, rect.top) / span));
}

// Dérive de la sculpture au repos (unités de temps du shader par seconde :
// environ un tour toutes les 40 s, et ses mouvements internes continuent).
const IDLE_SPIN = 0.6;

interface GlassBackdropProps {
  readonly shapeCount: number;
}

/**
 * Sculpture de verre en fond de page, pleine page et fixe.
 * Elle suit le scroll global : rotation continue, morph en douceur, une
 * seule pièce de verre du début à la fin.
 * Dans la zone projets, chaque projet est porté par un panneau de verre
 * rendu dans le canvas lui-même (inspiration activetheory.net) : plus rien
 * ne passe par-dessus le rendu, tout vit dans la même matière.
 */
export function GlassBackdrop({ shapeCount }: GlassBackdropProps) {
  // Le scroll est lu à chaque image, après que la page a avancé (voir
  // frameClock) : la sculpture suit exactement la position affichée.
  const workProgress = () => sectionProgress(WORK_SECTION_ID);
  const night = useSyncExternalStore(subscribeTheme, currentTheme) === 'night';
  const [hasGpu] = useState(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator,
  );

  if (!hasGpu) {
    return <div className="glass-backdrop glass-backdrop--fallback" aria-hidden="true" />;
  }

  // Rotation liée au scroll, plus une lente dérive dans le temps : la forme
  // n'est jamais figée, même quand personne ne fait défiler la page.
  const rotation = () => pageProgress() * Math.PI * 8 + (performance.now() / 1000) * IDLE_SPIN;
  // Chaque forme tient un palier, le passage à la suivante se fait au milieu
  // de sa tranche de scroll : hors passage, une seule forme à calculer.
  // Dans la zone projets, chaque passage entre deux lames montre une forme
  // nouvelle (le changement a lieu pendant que la lame la cache).
  const shapeMorph = () => {
    const position = pageProgress() * (shapeCount * 0.33);
    const step = Math.floor(position);
    const local = Math.min(1, Math.max(0, (position - step - 0.3) / 0.4));
    return step + local * local * (3 - 2 * local) + workCrossing(workProgress());
  };
  // Projet ouvert : la lame reste déployée sur ce projet, quel que soit le
  // scroll, pour pouvoir avancer vers la caméra puis revenir en place.
  const scrollPanel = (): ScenePanelFrame => {
    const viewer = viewerState();
    const target = viewer.phase === 'idle' ? panelTarget(workProgress()) : { morph: 1, index: viewer.index };
    return { ...target, ...panelFeedback() };
  };
  // Page projet opaque par-dessus : inutile de faire tourner le GPU.
  const paused = () => viewerState().phase === 'open';

  return (
    <div className="glass-backdrop">
      <GlassSculpture
        controls={{
          shape: 'gyroid',
          glass: 'clear',
          light: night ? 'noir' : 'paper',
          dispersion: false,
          spin: false,
          renderScale: 0.5,
        }}
        gui={false}
        interactive={false}
        scrollRotation={rotation}
        scrollShapeMorph={shapeMorph}
        projects={PROJECTS}
        scrollPanel={scrollPanel}
        paused={paused}
        beforeFrame={flushFrame}
        adaptiveScale
      />
    </div>
  );
}
