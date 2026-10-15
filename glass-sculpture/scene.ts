import {
  effect,
  sampler,
  target,
  texture,
  type Effect,
  type Frame,
  type Gpu,
  type Surface,
  type Target,
  type Texture,
} from 'vgpu';
import { DEFAULT_PITCH, DEFAULT_RADIUS, type CameraState } from './camera';
import type { ProjectGallery } from './screens';
import bloomBlurWgsl from './bloom-blur.wgsl';
import bloomExtractWgsl from './bloom-extract.wgsl';
import presentWgsl from './present.wgsl';
import sculptureWgsl from './sculpture.wgsl';
import temporalWgsl from './temporal.wgsl';

type Output = Surface | Target;
type Vec3 = readonly [number, number, number];

export const SHAPES = [
  'knot',
  'gyroid',
  'droplets',
  'flame',
  'torus',
  'heart',
  'cnoidal',
  'dna',
  'mobius',
] as const;
export const GLASS_TINTS = ['clear', 'rose', 'cobalt', 'emerald'] as const;
export const LIGHT_RIG_NAMES = ['studio', 'noir', 'gel', 'golden', 'mono', 'paper'] as const;
export const RENDER_SCALES = [0.4, 0.5, 0.6, 0.75, 1] as const;

export type Shape = (typeof SHAPES)[number];
export type GlassTint = (typeof GLASS_TINTS)[number];
export type LightRigName = (typeof LIGHT_RIG_NAMES)[number];
export type RenderScale = (typeof RENDER_SCALES)[number];

export interface SculptureControls {
  shape: Shape;
  glass: GlassTint;
  light: LightRigName;
  dispersion: boolean;
  spin: boolean;
  renderScale: RenderScale;
}

export const DEFAULT_CONTROLS: SculptureControls = {
  shape: 'gyroid',
  glass: 'clear',
  light: 'studio',
  dispersion: true,
  spin: true,
  renderScale: 0.75,
};

interface LightRig {
  readonly keyColor: Vec3;
  readonly keyPower: number;
  readonly rimColor: Vec3;
  readonly rimPower: number;
  readonly backgroundTop: Vec3;
  readonly backgroundBottom: Vec3;
  readonly floorLuminance: number;
}

interface MutableLightRig {
  keyColor: [number, number, number];
  keyPower: number;
  rimColor: [number, number, number];
  rimPower: number;
  backgroundTop: [number, number, number];
  backgroundBottom: [number, number, number];
  floorLuminance: number;
}

const LIGHT_RIGS: Readonly<Record<LightRigName, LightRig>> = {
  studio: {
    keyColor: [1, 0.92, 0.82],
    keyPower: 6,
    rimColor: [0.65, 0.8, 1],
    rimPower: 5,
    backgroundTop: [0.95, 0.96, 1],
    backgroundBottom: [0.3, 0.31, 0.34],
    floorLuminance: 1.4,
  },
  noir: {
    keyColor: [1, 0.97, 0.92],
    keyPower: 16,
    rimColor: [0.35, 0.45, 0.8],
    rimPower: 9,
    backgroundTop: [0.1, 0.1, 0.12],
    backgroundBottom: [0.02, 0.02, 0.03],
    floorLuminance: 1.6,
  },
  gel: {
    keyColor: [1, 0.4, 0.3],
    keyPower: 11,
    rimColor: [0.15, 0.8, 1],
    rimPower: 11,
    backgroundTop: [0.16, 0.08, 0.22],
    backgroundBottom: [0.04, 0.02, 0.07],
    floorLuminance: 1.3,
  },
  golden: {
    keyColor: [1, 0.72, 0.42],
    keyPower: 9,
    rimColor: [0.45, 0.55, 0.9],
    rimPower: 3,
    backgroundTop: [1, 0.78, 0.55],
    backgroundBottom: [0.36, 0.2, 0.14],
    floorLuminance: 1.25,
  },
  mono: {
    keyColor: [1, 1, 1],
    keyPower: 9,
    rimColor: [1, 1, 1],
    rimPower: 7,
    backgroundTop: [0.02, 0.02, 0.02],
    backgroundBottom: [0.005, 0.005, 0.005],
    floorLuminance: 1.1,
  },
  paper: {
    keyColor: [1.6, 1.6, 1.6],
    keyPower: 8,
    rimColor: [1.15, 1.15, 1.15],
    rimPower: 5,
    backgroundTop: [0.98, 0.98, 0.98],
    backgroundBottom: [0.42, 0.42, 0.42],
    floorLuminance: 1.15,
  },
};

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';
const BLOOM_STRENGTH = 0.45;
const RIG_EASE_RATE = 2.45;

interface SceneTargets {
  readonly hdr: Target;
  readonly historyA: Target;
  readonly historyB: Target;
  readonly bloomA: Target;
  readonly bloomB: Target;
}

// Part de l'historique dans chaque image de l'anti-crénelage temporel : forte
// au repos, presque nulle dès que la scène bouge au scroll (rotation, forme,
// lame) : sinon l'image d'avant traîne derrière le mouvement, puis se recale
// d'un coup à l'arrêt.
const HISTORY_WEIGHT = 0.9;
const MOVING_HISTORY_WEIGHT = 0.12;
const LIFT_MOTION_GAIN = 40;
const MORPH_MOTION_GAIN = 15;
const SHAPE_MOTION_GAIN = 30;
// Rotation par image (en temps de sculpture) en deçà de laquelle la scène
// est « au repos » : couvre la lente dérive, pas une rotation au scroll.
const IDLE_ROTATION_STEP = 0.02;
const ROTATION_MOTION_GAIN = 25;
// Décalages sous-pixel successifs (suite de Halton 2, 3) : huit images
// couvrent le pixel de façon régulière.
const JITTER_SEQUENCE: ReadonlyArray<readonly [number, number]> = Array.from({ length: 8 }, (_, index) => [
  halton(index + 1, 2) - 0.5,
  halton(index + 1, 3) - 0.5,
]);

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  for (let value = index; value > 0; value = Math.floor(value / base)) {
    result += fraction * (value % base);
    fraction /= base;
  }
  return result;
}

export interface ScenePanelFrame {
  readonly morph: number;
  readonly index: number;
  /** Avancée de la lame vers la caméra : 0 en place, 1 couvre l'écran. */
  readonly lift: number;
  /** Intensité de la loupe sous le curseur (0 à 1). */
  readonly focus: number;
  /** Position du curseur sur la lame, en coordonnées de texture (0 à 1). */
  readonly pointer: readonly [number, number];
}

// Part de l'écran occupée par la lame déployée : cette hauteur, sans jamais
// dépasser cette largeur (sur mobile en portrait, c'est la largeur qui limite).
const PANEL_SCREEN_HEIGHT = 0.56;
const PANEL_SCREEN_WIDTH = 0.84;
// Doivent rester identiques à CAMERA_LENS et CAMERA_TARGET dans sculpture.wgsl.
const CAMERA_LENS = 2.2;
const CAMERA_TARGET_HEIGHT = -0.05;

function panelScreenFraction(screenAspect: number, panelAspect: number): number {
  return Math.min(PANEL_SCREEN_HEIGHT, (PANEL_SCREEN_WIDTH * screenAspect) / panelAspect);
}

/** Demi-hauteur de la lame déployée en unités monde, pour la caméra par défaut. */
export function panelHalfHeight(screenAspect: number, panelAspect: number): number {
  const distance = Math.hypot(
    DEFAULT_RADIUS * Math.cos(DEFAULT_PITCH),
    DEFAULT_RADIUS * Math.sin(DEFAULT_PITCH) + 0.1 - CAMERA_TARGET_HEIGHT,
  );
  return (panelScreenFraction(screenAspect, panelAspect) * distance) / CAMERA_LENS;
}

/**
 * Demi-taille à l'écran (en px) de la lame déployée et au repos : elle fait
 * face à la caméra et reste centrée, sa projection est un rectangle centré.
 */
export function panelScreenHalfSize(
  viewportWidth: number,
  viewportHeight: number,
  panelAspect: number,
): [number, number] {
  const halfHeight = (panelScreenFraction(viewportWidth / viewportHeight, panelAspect) * viewportHeight) / 2;
  return [halfHeight * panelAspect, halfHeight];
}

export interface ScenePanel {
  readonly atlas: Texture | undefined;
  readonly count: number;
  readonly aspect: number;
  readonly state: () => ScenePanelFrame;
}

export interface SceneState {
  readonly sculptureTime: number;
  readonly clockTime: number;
  readonly deltaTime: number;
  readonly light: { readonly azimuth: number; readonly elevation: number };
  readonly shape: number;
}

export interface SculptureScene {
  prepare(output: Output): Promise<void>;
  resize(outputSize: readonly [number, number], renderScale: number): void;
  render(
    currentFrame: Frame,
    output: Output,
    camera: CameraState,
    controls: Readonly<SculptureControls>,
    state: SceneState,
  ): void;
  destroy(): void;
}

export function createScene(
  gpu: Gpu,
  output: Output,
  controls: Readonly<SculptureControls>,
  panel: ScenePanel | undefined,
): SculptureScene {
  const linearSampler = sampler(gpu, {
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  const sculpture = effect(gpu, sculptureWgsl, { label: 'glass-sculpture' });
  const extract = effect(gpu, bloomExtractWgsl, { label: 'glass-sculpture-bloom-extract' });
  const blurHorizontal = effect(gpu, bloomBlurWgsl, { label: 'glass-sculpture-bloom-horizontal' });
  const blurVertical = effect(gpu, bloomBlurWgsl, { label: 'glass-sculpture-bloom-vertical' });
  const temporal = effect(gpu, temporalWgsl, { label: 'glass-sculpture-temporal' });
  const present = effect(gpu, presentWgsl, { label: 'glass-sculpture-present' });
  const targets = createTargets(gpu, output.size, controls.renderScale);
  const fallbackAtlas = texture(gpu, {
    kind: '2d',
    size: [1, 1],
    format: 'rgba8unorm',
    usage: ['texture_binding', 'copy_dst'],
    label: 'glass-sculpture-fallback-atlas',
  });
  gpu.gpu.queue.writeTexture(
    { texture: fallbackAtlas.gpu },
    new Uint8Array([255, 255, 255, 255]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    { width: 1, height: 1 },
  );
  const rig = copyRig(LIGHT_RIGS[controls.light]);
  let destroyed = false;
  let frameIndex = 0;
  let historyValid = false;
  let history = targets.historyA;
  let resolved = targets.historyB;
  let previousPanel = OFF_PANEL_FRAME;
  let previousTime = 0;
  let previousShape = 0;

  try {
    bindTargets();
  } catch (error) {
    destroyTargets(targets);
    fallbackAtlas.destroy();
    throw error;
  }

  return {
    async prepare(currentOutput) {
      await Promise.all([
        sculpture.compile(targets.hdr),
        temporal.compile(targets.historyA),
        extract.compile(targets.bloomA),
        blurHorizontal.compile(targets.bloomB),
        blurVertical.compile(targets.bloomA),
        present.compile({ colors: [currentOutput.format] }),
      ]);
    },
    resize(outputSize, renderScale) {
      if (destroyed) return;
      const [width, height] = scaledSize(outputSize, renderScale);
      targets.hdr.resize([width, height]);
      targets.historyA.resize([width, height]);
      targets.historyB.resize([width, height]);
      historyValid = false;
      const bloomSize: [number, number] = [
        Math.max(1, Math.floor(width / 4)),
        Math.max(1, Math.floor(height / 4)),
      ];
      targets.bloomA.resize(bloomSize);
      targets.bloomB.resize(bloomSize);
      bindTargets();
    },
    render(currentFrame, currentOutput, camera, currentControls, state) {
      if (destroyed) return;
      easeRig(rig, LIGHT_RIGS[currentControls.light], state.deltaTime);
      const keyDirection = lightDirection(camera.yaw + state.light.azimuth, state.light.elevation);
      const rimDirection = lightDirection(camera.yaw + state.light.azimuth + Math.PI * 0.85, 0.35);
      const panelState = panel?.state() ?? OFF_PANEL_FRAME;
      const jitter = JITTER_SEQUENCE[frameIndex++ % JITTER_SEQUENCE.length];
      const motion = Math.min(
        1,
        Math.abs(panelState.lift - previousPanel.lift) * LIFT_MOTION_GAIN +
          Math.abs(panelState.morph - previousPanel.morph) * MORPH_MOTION_GAIN +
          Math.abs(state.shape - previousShape) * SHAPE_MOTION_GAIN +
          Math.max(0, Math.abs(state.sculptureTime - previousTime) - IDLE_ROTATION_STEP) * ROTATION_MOTION_GAIN,
      );
      previousPanel = panelState;
      previousTime = state.sculptureTime;
      previousShape = state.shape;
      const historyWeight = HISTORY_WEIGHT + (MOVING_HISTORY_WEIGHT - HISTORY_WEIGHT) * motion;
      sculpture.set({
        params: {
          resolution: targets.hdr.size,
          shape: state.shape,
          shape_count: SHAPES.length,
          tint: GLASS_TINTS.indexOf(currentControls.glass),
          time: state.sculptureTime,
          quality: currentControls.renderScale,
          yaw: camera.yaw,
          pitch: camera.pitch,
          radius: camera.radius,
          dispersion: currentControls.dispersion ? 1 : 0,
          strip_angle: 0.8 + state.clockTime * 0.1,
          floor_luminance: rig.floorLuminance,
          key: [...keyDirection, rig.keyPower],
          key_color: [...rig.keyColor, 0],
          rim: [...rimDirection, rig.rimPower],
          rim_color: [...rig.rimColor, 0],
          background_top: [...rig.backgroundTop, 0],
          background_bottom: [...rig.backgroundBottom, 0],
          panel_morph: panelState.morph,
          panel_index: panelState.index,
          panel_count: panel?.count ?? 1,
          panel_aspect: panel?.aspect ?? 1,
          panel_half_height: panelHalfHeight(
            targets.hdr.size[0] / Math.max(1, targets.hdr.size[1]),
            panel?.aspect ?? 1,
          ),
          panel_lift: panelState.lift,
          panel_focus: panelState.focus,
          panel_pointer: panelState.pointer,
          clock: state.clockTime,
          jitter,
        },
        project_texture: panel?.atlas ?? fallbackAtlas,
        linear_sampler: linearSampler,
      });
      temporal.set({
        params: {
          texel: targets.hdr.texelSize,
          history_weight: historyValid ? historyWeight : 0,
          padding: 0,
        },
        current_texture: targets.hdr,
        history_texture: history,
        linear_sampler: linearSampler,
      });
      extract.set({ source: resolved });
      present.set({
        params: {
          bloom_strength: BLOOM_STRENGTH,
          time: state.clockTime,
        },
        scene_texture: resolved,
      });
      currentFrame.pass(targets.hdr, sculpture);
      currentFrame.pass(resolved, temporal);
      currentFrame.pass(targets.bloomA, extract);
      currentFrame.pass(targets.bloomB, blurHorizontal);
      currentFrame.pass(targets.bloomA, blurVertical);
      currentFrame.pass(currentOutput, present);
      [history, resolved] = [resolved, history];
      historyValid = true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      destroyTargets(targets);
      fallbackAtlas.destroy();
    },
  };

  function bindTargets() {
    extract.set({
      params: {
        texel: targets.hdr.texelSize,
        threshold: 1,
        padding: 0,
      },
      source: resolved,
      linear_sampler: linearSampler,
    });
    blurHorizontal.set({
      params: { direction: [targets.bloomA.texelSize[0], 0], padding: [0, 0] },
      source: targets.bloomA,
      linear_sampler: linearSampler,
    });
    blurVertical.set({
      params: { direction: [0, targets.bloomB.texelSize[1]], padding: [0, 0] },
      source: targets.bloomB,
      linear_sampler: linearSampler,
    });
    present.set({
      params: {
        bloom_strength: BLOOM_STRENGTH,
        time: 0,
      },
      scene_texture: resolved,
      bloom_texture: targets.bloomA,
      linear_sampler: linearSampler,
    });
  }
}

export const OFF_PANEL_FRAME: ScenePanelFrame = {
  morph: 0,
  index: -1,
  lift: 0,
  focus: 0,
  pointer: [0.5, 0.5],
};

function createTargets(gpu: Gpu, outputSize: readonly [number, number], renderScale: number): SceneTargets {
  const owned: Target[] = [];
  const own = (created: Target) => {
    owned.push(created);
    return created;
  };
  try {
    const [width, height] = scaledSize(outputSize, renderScale);
    const bloomSize: [number, number] = [
      Math.max(1, Math.floor(width / 4)),
      Math.max(1, Math.floor(height / 4)),
    ];
    return {
      hdr: own(target(gpu, { size: [width, height], format: HDR_FORMAT, label: 'glass-sculpture-hdr' })),
      historyA: own(target(gpu, { size: [width, height], format: HDR_FORMAT, label: 'glass-sculpture-history-a' })),
      historyB: own(target(gpu, { size: [width, height], format: HDR_FORMAT, label: 'glass-sculpture-history-b' })),
      bloomA: own(target(gpu, { size: bloomSize, format: HDR_FORMAT, label: 'glass-sculpture-bloom-a' })),
      bloomB: own(target(gpu, { size: bloomSize, format: HDR_FORMAT, label: 'glass-sculpture-bloom-b' })),
    };
  } catch (error) {
    for (const resource of owned.reverse()) destroyTarget(resource);
    throw error;
  }
}

function scaledSize(size: readonly [number, number], renderScale: number): [number, number] {
  const scale = Number.isFinite(renderScale)
    ? Math.max(RENDER_SCALES[0], Math.min(RENDER_SCALES.at(-1)!, renderScale))
    : DEFAULT_CONTROLS.renderScale;
  return [
    Math.max(1, Math.floor(size[0] * scale)),
    Math.max(1, Math.floor(size[1] * scale)),
  ];
}

function lightDirection(azimuth: number, elevation: number): Vec3 {
  const radius = Math.cos(elevation);
  return [Math.sin(azimuth) * radius, Math.sin(elevation), Math.cos(azimuth) * radius];
}

function copyRig(source: LightRig): MutableLightRig {
  return {
    keyColor: [...source.keyColor],
    keyPower: source.keyPower,
    rimColor: [...source.rimColor],
    rimPower: source.rimPower,
    backgroundTop: [...source.backgroundTop],
    backgroundBottom: [...source.backgroundBottom],
    floorLuminance: source.floorLuminance,
  };
}

function easeRig(current: MutableLightRig, goal: LightRig, deltaTime: number): void {
  const blend = 1 - Math.exp(-RIG_EASE_RATE * Math.max(0, Math.min(0.1, deltaTime)));
  for (let channel = 0; channel < 3; channel++) {
    current.keyColor[channel] += (goal.keyColor[channel] - current.keyColor[channel]) * blend;
    current.rimColor[channel] += (goal.rimColor[channel] - current.rimColor[channel]) * blend;
    current.backgroundTop[channel] += (goal.backgroundTop[channel] - current.backgroundTop[channel]) * blend;
    current.backgroundBottom[channel] += (goal.backgroundBottom[channel] - current.backgroundBottom[channel]) * blend;
  }
  current.keyPower += (goal.keyPower - current.keyPower) * blend;
  current.rimPower += (goal.rimPower - current.rimPower) * blend;
  current.floorLuminance += (goal.floorLuminance - current.floorLuminance) * blend;
}

function destroyTargets(targets: SceneTargets): void {
  for (const resource of Object.values(targets)) destroyTarget(resource);
}

function destroyTarget(resource: Target): void {
  (resource as Target & { destroy(): void }).destroy();
}

export function normalizeControls(controls: Readonly<SculptureControls>): SculptureControls {
  return {
    shape: SHAPES.includes(controls.shape) ? controls.shape : DEFAULT_CONTROLS.shape,
    glass: GLASS_TINTS.includes(controls.glass) ? controls.glass : DEFAULT_CONTROLS.glass,
    light: LIGHT_RIG_NAMES.includes(controls.light) ? controls.light : DEFAULT_CONTROLS.light,
    dispersion: controls.dispersion === true,
    spin: controls.spin !== false,
    renderScale: RENDER_SCALES.includes(controls.renderScale)
      ? controls.renderScale
      : DEFAULT_CONTROLS.renderScale,
  };
}
