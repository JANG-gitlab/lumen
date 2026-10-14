import { useState, useSyncExternalStore } from 'react';
import { Example as GlassSculpture } from '../../glass-sculpture';
import type { ScenePanelFrame } from '../../glass-sculpture/scene';
import { usePageProgress } from '../hooks/usePageProgress';
import { useSectionProgress } from '../hooks/useSectionProgress';
import { PROJECTS } from '../projects';
import { panelFeedback, viewerState } from '../projectViewer';
import { currentTheme, subscribeTheme } from '../theme';
import { WORK_SECTION_ID, panelTarget } from '../workScroll';

// Part de la zone projets pendant laquelle les fragments s'écartent.
const FRAGMENTS_OPENING = 0.04;

interface GlassBackdropProps {
  readonly shapeCount: number;
}

/**
 * Sculpture de verre en fond de page, pleine page et fixe.
 * Elle suit le scroll global : rotation continue, morph en douceur,
 * puis fragmentation (écarts sur les côtés) en approchant des projets.
 * Dans la zone projets, chaque projet est porté par un panneau de verre
 * rendu dans le canvas lui-même (inspiration activetheory.net) : plus rien
 * ne passe par-dessus le rendu, tout vit dans la même matière.
 */
export function GlassBackdrop({ shapeCount }: GlassBackdropProps) {
  const progressRef = usePageProgress();
  const workProgressRef = useSectionProgress(`#${WORK_SECTION_ID}`);
  const night = useSyncExternalStore(subscribeTheme, currentTheme) === 'night';
  const [hasGpu] = useState(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator,
  );

  if (!hasGpu) {
    return <div className="glass-backdrop glass-backdrop--fallback" aria-hidden="true" />;
  }

  const rotation = () => progressRef.current * Math.PI * 8;
  // Chaque forme tient un palier, le passage à la suivante se fait au milieu
  // de sa tranche de scroll : hors passage, une seule forme à calculer.
  const shapeMorph = () => {
    const position = progressRef.current * (shapeCount * 0.33);
    const step = Math.floor(position);
    const local = Math.min(1, Math.max(0, (position - step - 0.3) / 0.4));
    return step + local * local * (3 - 2 * local);
  };
  // Les fragments s'ouvrent à l'entrée de la zone projets, en même temps que
  // la première lame, puis restent écartés : entre deux projets, seule la
  // pièce centrale se replie (0.83, même écart que PANEL_CLEARANCE dans
  // sculpture.wgsl). Ils s'éloignent encore un peu vers la fin de la zone.
  const split = () => {
    const progress = workProgressRef.current;
    const opening = Math.min(1, progress / FRAGMENTS_OPENING);
    const spread = Math.min(1, Math.max(0, (progress - 0.4) / 0.47));
    return Math.max(opening * opening * (3 - 2 * opening) * 0.83, spread);
  };
  // Projet ouvert : la lame reste déployée sur ce projet, quel que soit le
  // scroll, pour pouvoir avancer vers la caméra puis revenir en place.
  const scrollPanel = (): ScenePanelFrame => {
    const viewer = viewerState();
    const target = viewer.phase === 'idle' ? panelTarget(workProgressRef.current) : { morph: 1, index: viewer.index };
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
        scrollSplit={split}
        projects={PROJECTS}
        scrollPanel={scrollPanel}
        paused={paused}
        adaptiveScale
      />
    </div>
  );
}
