// Concept and visual design by Kazuyuki Chinda (@ckazu).

import GUI from 'lil-gui';
import { clock, frameLoop, init, surface, type Gpu, type Texture } from 'vgpu';
import { installPointerInput } from './pointer-input';
import { createProjectGallery, tileLayout, type ProjectGallery, type ProjectVisual } from './screens';
import {
  DEFAULT_CONTROLS,
  LIGHT_RIG_NAMES,
  OFF_PANEL_FRAME,
  RENDER_SCALES,
  SHAPES,
  createScene,
  normalizeControls,
  type LightRigName,
  type ScenePanelFrame,
  type SculptureControls,
  type Shape,
} from './scene';

export interface RendererOptions {
  readonly gui?: boolean;
  /** Retourne un offset de rotation (en secondes de sculptureTime) piloté par le scroll. */
  readonly scrollRotation?: () => number;
  /** Retourne un décalage d'indice de forme (0..SHAPES.length), piloté par le scroll. */
  readonly scrollShapeMorph?: () => number;
  /** Retourne l'écartement de fragmentation (0..1), piloté par le scroll. */
  readonly scrollSplit?: () => number;
  /** Liste des projets affichés dans l'atlas (panneaux de verre). */
  readonly projects?: readonly ProjectVisual[];
  /** Fournit l'état courant de la transition de panneaux. */
  readonly scrollPanel?: () => ScenePanelFrame;
  /** Suspend le rendu tant que la scène est entièrement masquée. */
  readonly paused?: () => boolean;
  /**
   * Appelé au début de chaque image, avant toute lecture du scroll : la page
   * y avance d'abord, la sculpture se dessine ensuite sur la même position.
   */
  readonly beforeFrame?: () => void;
  /**
   * Définition adaptative : si la machine ne tient pas la cadence, le rendu
   * descend d'un cran (jamais l'inverse, voir createScaleGovernor).
   */
  readonly adaptiveScale?: boolean;
}

const SHAPE_MORPH_RATE = 0.85;
const SHAPE_SNAP = 0.002;
// Au-delà, la forme centrale est entièrement absorbée par la lame (voir
// sculpt.scale dans sculpture.wgsl, seuil 0.02 sur l'échelle 1 - ease).
const HIDDEN_SHAPE_MORPH = 0.95;
// Un déploiement complet de la lame prend 0,45 s, à vitesse constante.
const PANEL_MORPH_SPEED = 1 / 0.45;
// Sous ~50 images/s en moyenne pendant 1,5 s, la définition baisse d'un
// cran. Les premières secondes (compilation, chargement des visuels)
// faussent la mesure : elles sont ignorées.
const SLOW_FRAME = 1 / 50;
const SCALE_DOWN_AFTER = 1.5;
const SCALE_WARM_UP = 3;

export function createRenderer(
  canvas: HTMLCanvasElement,
  initialControls: Readonly<SculptureControls> = DEFAULT_CONTROLS,
  options: RendererOptions = {},
) {
  let disposed = false;
  let gpu: Gpu | undefined;
  const browserCleanups: Array<() => void> = [];
  const controls = normalizeControls(initialControls);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    let firstError: unknown;
    for (const cleanup of [...browserCleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        firstError ??= error;
      }
    }
    browserCleanups.length = 0;
    try {
      gpu?.dispose();
    } catch (error) {
      firstError ??= error;
    }
    if (firstError !== undefined) throw firstError;
  };

  const ready = (async () => {
    const context = await init();
    if (disposed) {
      context.dispose();
      return;
    }
    gpu = context;
    const output = surface(context, canvas, { dpr: [1, 1.5] });
    const projects = options.projects ?? [];
    const viewportLayout = () => tileLayout(canvas.clientWidth, canvas.clientHeight);
    let gallery: ProjectGallery | undefined;
    browserCleanups.push(() => gallery?.destroy());
    let panelFrame = OFF_PANEL_FRAME;
    // La lame reste repliée tant que les visuels des projets ne sont pas
    // arrivés : la sculpture, elle, s'affiche sans les attendre.
    const panel =
      projects.length > 0
        ? {
            atlas: undefined as Texture | undefined,
            count: projects.length,
            aspect: 1,
            state: () => (panel?.atlas ? panelFrame : OFF_PANEL_FRAME),
          }
        : undefined;

    // Premier dessin de l'atlas, puis à chaque rotation d'écran (ou fenêtre
    // qui passe en portrait) au nouveau format. L'ancien sert encore à
    // l'image en vol, il n'est libéré que deux images plus tard.
    let rebuildingGallery = false;
    const refreshGallery = async () => {
      if (!panel || rebuildingGallery) return;
      const layout = viewportLayout();
      if (layout === gallery?.layout) return;
      rebuildingGallery = true;
      try {
        const next = await createProjectGallery(context, projects, layout);
        if (disposed) {
          next.destroy();
          return;
        }
        const previous = gallery;
        gallery = next;
        panel.atlas = next.atlas;
        panel.aspect = layout.width / layout.height;
        if (previous) requestAnimationFrame(() => requestAnimationFrame(() => previous.destroy()));
      } finally {
        rebuildingGallery = false;
      }
      await refreshGallery();
    };
    const scene = createScene(context, output, controls, panel);
    browserCleanups.push(() => scene.destroy());
    await scene.prepare(output);
    if (disposed) return;

    const input = installPointerInput(canvas);
    browserCleanups.push(() => input.dispose());
    const resizeScene = () => {
      try {
        scene.resize(output.size, controls.renderScale);
      } catch (error) {
        try {
          dispose();
        } catch {
          // Teardown must not replace the resize failure.
        }
        throw error;
      }
    };
    const gui = options.gui === false ? undefined : buildGui(canvas, controls, resizeScene);
    browserCleanups.push(() => gui?.destroy());
    const unsubscribeResize = output.onResize(resizeScene);
    browserCleanups.push(unsubscribeResize);
    // En cas d'échec, l'atlas courant reste en place (ou la lame reste repliée).
    const loadGallery = () => void refreshGallery().catch(() => undefined);
    browserCleanups.push(output.onResize(loadGallery));
    loadGallery();

    // Le redimensionnement détruit les cibles de rendu : il attend l'image
    // suivante pour ne pas toucher une image déjà encodée.
    let scaleChanged = false;
    const adaptScale = options.adaptiveScale
      ? createScaleGovernor(controls, () => {
          scaleChanged = true;
        })
      : undefined;
    const time = clock(context);
    let sculptureTime = 0;
    let shapeValue = SHAPES.indexOf(controls.shape);
    let canvasVisible = true;
    if (typeof IntersectionObserver !== 'undefined') {
      const visibilityObserver = new IntersectionObserver(
        (entries) => {
          canvasVisible = entries.some((entry) => entry.isIntersecting);
        },
        { threshold: 0 },
      );
      visibilityObserver.observe(canvas);
      browserCleanups.push(() => visibilityObserver.disconnect());
    }
    frameLoop(context, (currentFrame) => {
      try {
        options.beforeFrame?.();
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!canvasVisible || options.paused?.()) return;
        if (scaleChanged) {
          scaleChanged = false;
          resizeScene();
        }
        input.advance(time.deltaTime);
        const scrollExtra = options.scrollRotation?.() ?? 0;
        if (controls.spin && !options.scrollRotation) sculptureTime += time.deltaTime;
        const shapeTarget = SHAPES.indexOf(controls.shape) + (options.scrollShapeMorph?.() ?? 0);
        const shapeCount = SHAPES.length;
        let adjustedTarget = shapeTarget;
        if (shapeValue - shapeTarget > shapeCount / 2) adjustedTarget += shapeCount;
        else if (shapeValue - shapeTarget < -shapeCount / 2) adjustedTarget -= shapeCount;
        shapeValue += (adjustedTarget - shapeValue) * Math.min(1, time.deltaTime * SHAPE_MORPH_RATE);
        // Arrivée franche sur la forme visée : tant qu'il reste un écart, le
        // shader calcule deux formes au lieu d'une.
        if (Math.abs(adjustedTarget - shapeValue) < SHAPE_SNAP) shapeValue = adjustedTarget;
        panelFrame = easePanel(panelFrame, options.scrollPanel?.() ?? OFF_PANEL_FRAME, time.deltaTime);
        // Lame entièrement déployée : la forme centrale est invisible, elle
        // passe d'un coup à la suivante au lieu de se transformer à vue.
        if (panelFrame.morph >= HIDDEN_SHAPE_MORPH) shapeValue = adjustedTarget;
        scene.render(currentFrame, output, input.camera, controls, {
          sculptureTime: options.scrollRotation ? scrollExtra : sculptureTime,
          clockTime: time.time,
          deltaTime: time.deltaTime,
          light: input.light,
          split: options.scrollSplit?.() ?? 0,
          shape: ((shapeValue % shapeCount) + shapeCount) % shapeCount,
        });
        adaptScale?.(time.deltaTime);
      } catch (error) {
        try {
          dispose();
        } catch {
          // Teardown must not replace the frame failure.
        }
        throw error;
      }
    });
  })().catch((error: unknown) => {
    if (disposed) return;
    try {
      dispose();
    } catch {
      // Teardown must not replace the initialization or render failure.
    }
    throw error;
  });

  const cycleShape = () => {
    const currentIndex = SHAPES.indexOf(controls.shape);
    if (currentIndex < 0) {
      controls.shape = DEFAULT_CONTROLS.shape;
      return;
    }
    controls.shape = SHAPES[(currentIndex + 1) % SHAPES.length];
  };

  const setLight = (light: LightRigName) => {
    controls.light = LIGHT_RIG_NAMES.includes(light) ? light : DEFAULT_CONTROLS.light;
  };

  const setShape = (shape: Shape) => {
    controls.shape = SHAPES.includes(shape) ? shape : DEFAULT_CONTROLS.shape;
  };

  return { ready, dispose, setShape, setLight, cycleShape };
}

function buildGui(
  canvas: HTMLCanvasElement,
  controls: SculptureControls,
  resize: () => void,
): GUI {
  const gui = new GUI({
    title: 'Glass sculpture',
    container: canvas.parentElement ?? undefined,
    width: 200,
  });
  try {
    Object.assign(gui.domElement.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: '10',
    });
    const shapeOptions = SHAPES.reduce(
      (acc, shape) => {
        acc[shape.charAt(0).toUpperCase() + shape.slice(1)] = shape;
        return acc;
      },
      {} as Record<string, string>,
    );
    gui.add(controls, 'shape', shapeOptions).name('Shape');
    gui.add(controls, 'glass', {
      Clear: 'clear',
      Rose: 'rose',
      Cobalt: 'cobalt',
      Emerald: 'emerald',
    }).name('Glass');
    gui.add(controls, 'light', {
      Studio: 'studio',
      Noir: 'noir',
      Gel: 'gel',
      Golden: 'golden',
      Mono: 'mono',
      Paper: 'paper',
    }).name('Light rig');
    gui.add(controls, 'dispersion').name('Dispersion');
    gui.add(controls, 'spin').name('Turntable');
    gui.add(controls, 'renderScale', { '50%': 0.5, '75%': 0.75, '100%': 1 })
      .name('Render scale')
      .onChange(resize);
    return gui;
  } catch (error) {
    gui.destroy();
    throw error;
  }
}

/**
 * La lame suit le scroll à vitesse bornée : jamais d'à-coup, et jamais de
 * traîne (elle atteint vraiment 0 ou 1, au lieu de s'en approcher sans
 * fin). Elle ne change de projet qu'une fois entièrement repliée dans la
 * matière, même si le scroll saute d'un projet à l'autre.
 */
function easePanel(current: ScenePanelFrame, goal: ScenePanelFrame, deltaTime: number): ScenePanelFrame {
  const sameProject = goal.index === current.index;
  const goalMorph = sameProject ? goal.morph : 0;
  const step = PANEL_MORPH_SPEED * Math.max(0, Math.min(0.1, deltaTime));
  const morph = current.morph + Math.max(-step, Math.min(step, goalMorph - current.morph));
  if (!sameProject && morph <= 0) return { ...OFF_PANEL_FRAME, index: goal.index };
  if (!sameProject) return { ...OFF_PANEL_FRAME, morph, index: current.index };
  return { ...goal, morph };
}

/**
 * Baisse l'échelle de rendu si la cadence obtenue ne suit pas. Elle ne
 * remonte jamais : alterner ferait du yoyo, et chaque changement recrée les
 * cibles de rendu (une saccade) et efface l'historique de l'anti-crénelage.
 * Les longues pauses (onglet masqué, rendu suspendu) sont ignorées.
 */
function createScaleGovernor(controls: SculptureControls, onChange: () => void): (deltaTime: number) => void {
  let elapsed = 0;
  let averageFrame = 1 / 60;
  let slowFor = 0;
  return (deltaTime) => {
    if (deltaTime <= 0 || deltaTime > 0.1) return;
    elapsed += deltaTime;
    if (elapsed < SCALE_WARM_UP) return;
    averageFrame += (deltaTime - averageFrame) * 0.1;
    slowFor = averageFrame > SLOW_FRAME ? slowFor + deltaTime : 0;
    const current = RENDER_SCALES.indexOf(controls.renderScale);
    if (slowFor < SCALE_DOWN_AFTER || current <= 0) return;
    controls.renderScale = RENDER_SCALES[current - 1];
    slowFor = 0;
    averageFrame = 1 / 60;
    onChange();
  };
}
