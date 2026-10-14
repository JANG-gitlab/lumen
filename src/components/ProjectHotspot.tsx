import { useEffect, useRef, type PointerEvent } from 'react';
import { panelScreenHalfSize } from '../../glass-sculpture/scene';
import { tileLayout } from '../../glass-sculpture/screens';
import { useSectionProgress } from '../hooks/useSectionProgress';
import { openProject, setPanelPointer, viewerState } from '../projectViewer';
import { playFold, playTouch, playUnfold } from '../sound';
import { WORK_SECTION_ID, panelTarget } from '../workScroll';

// En dessous, la lame est encore en train de se déplier : pas de clic.
const CLICKABLE_MORPH = 0.75;
// Seuil du son de dépliage et de repli (avec un écart pour éviter les doublons).
const UNFOLDED_MORPH = 0.4;
const FOLDED_MORPH = 0.2;

/**
 * Zone cliquable posée sur la lame de verre du canvas. Elle épouse la
 * projection de la lame déployée et ne s'active que lorsqu'elle est à
 * l'écran. Elle transmet aussi la position du curseur (loupe dans le verre)
 * et déclenche les sons de dépliage. Doublon souris et tactile des boutons
 * clavier de la section projets.
 */
export function ProjectHotspot() {
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const workProgressRef = useSectionProgress(`#${WORK_SECTION_ID}`);
  const indexRef = useRef(-1);

  useEffect(() => {
    let raf = 0;
    let unfolded = false;
    const update = () => {
      const hotspot = hotspotRef.current;
      const idle = viewerState().phase === 'idle';
      const target = panelTarget(workProgressRef.current);
      if (idle && !unfolded && target.morph > UNFOLDED_MORPH) {
        unfolded = true;
        playUnfold();
      } else if (idle && unfolded && target.morph < FOLDED_MORPH) {
        unfolded = false;
        playFold();
      }
      if (hotspot) {
        const active = idle && target.morph >= CLICKABLE_MORPH;
        indexRef.current = active ? target.index : -1;
        hotspot.dataset.active = String(active);
        if (!active) setPanelPointer(null);
        const layout = tileLayout(window.innerWidth, window.innerHeight);
        const [halfWidth, halfHeight] = panelScreenHalfSize(
          window.innerWidth,
          window.innerHeight,
          layout.width / layout.height,
        );
        hotspot.style.width = `${halfWidth * 2}px`;
        hotspot.style.height = `${halfHeight * 2}px`;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [workProgressRef]);

  const track = (event: PointerEvent<HTMLButtonElement>) => {
    if (indexRef.current < 0 || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPanelPointer([(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]);
  };

  return (
    <button
      ref={hotspotRef}
      type="button"
      className="project-hotspot"
      data-active="false"
      data-cursor="lens"
      tabIndex={-1}
      aria-hidden="true"
      onPointerEnter={(event) => {
        track(event);
        if (indexRef.current >= 0 && event.pointerType === 'mouse') playTouch();
      }}
      onPointerMove={track}
      onPointerLeave={() => setPanelPointer(null)}
      onClick={() => {
        if (indexRef.current >= 0) openProject(indexRef.current);
      }}
    >
      <span className="project-hotspot__label">Voir le projet</span>
    </button>
  );
}
