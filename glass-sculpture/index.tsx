'use client';

import { useEffect, useRef } from 'react';
import { createRenderer } from './renderer';
import type { ProjectVisual } from './screens';
import { SHAPES, type ScenePanelFrame, type SculptureControls, type Shape } from './scene';

export interface ExampleProps {
  readonly controls?: SculptureControls;
  readonly gui?: boolean;
  readonly scrollRotation?: () => number;
  readonly scrollShapeMorph?: () => number;
  /** Écartement de fragmentation (0..1), piloté par le scroll. */
  readonly scrollSplit?: () => number;
  /** Projets affichés dans des panneaux de verre rendus dans le canvas. */
  readonly projects?: readonly ProjectVisual[];
  /** État courant de la transition de panneaux projets. */
  readonly scrollPanel?: () => ScenePanelFrame;
  /** Suspend le rendu tant que la scène est entièrement masquée. */
  readonly paused?: () => boolean;
  /** Appelé au début de chaque image, avant les lectures du scroll. */
  readonly beforeFrame?: () => void;
  /** Baisse la définition si la machine ne tient pas la cadence. */
  readonly adaptiveScale?: boolean;
  readonly randomShapeOnMount?: boolean;
  readonly onShapeChange?: (shape: Shape) => void;
  readonly interactive?: boolean;
}

export function Example({
  controls,
  gui = false,
  scrollRotation,
  scrollShapeMorph,
  scrollSplit,
  projects,
  scrollPanel,
  paused,
  beforeFrame,
  adaptiveScale,
  randomShapeOnMount = false,
  onShapeChange,
  interactive = true,
}: ExampleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const light = controls?.light;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas, controls, {
      gui,
      scrollRotation,
      scrollShapeMorph,
      scrollSplit,
      projects,
      scrollPanel,
      paused,
      beforeFrame,
      adaptiveScale,
    });
    rendererRef.current = renderer;
    void renderer.ready;

    if (randomShapeOnMount) {
      renderer.setShape(SHAPES[Math.floor(Math.random() * SHAPES.length)]);
    }

    const onPointerDown = (event: PointerEvent) => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!interactive) return;
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!start) return;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance > 6) return;
      renderer.cycleShape();
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      renderer.setShape(shape);
      onShapeChange?.(shape);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Changer de jeu de lumières en cours de route (mode nuit) : le rendu
  // glisse d'un éclairage à l'autre au lieu de basculer.
  useEffect(() => {
    if (light) rendererRef.current?.setLight(light);
  }, [light]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}

export default Example;