// Concept and visual design by Kazuyuki Chinda (@ckazu).

import { texture, type Gpu, type Texture } from 'vgpu';

export interface ProjectVisual {
  readonly index: string;
  readonly title: string;
  readonly role: string;
  readonly image: string;
}

export interface ProjectGallery {
  readonly atlas: Texture;
  readonly layout: TileLayout;
  destroy(): void;
}

/** Format d'une tuile de l'atlas, qui est aussi celui de la lame de verre. */
export interface TileLayout {
  readonly width: number;
  readonly height: number;
  /** Corps du titre, en px de tuile. */
  readonly title: number;
}

// Paysage 16/10 sur écran large. Sur téléphone, portrait 1/2 : proche du
// format de l'écran, la lame qui le couvre n'a presque rien à rogner.
const LANDSCAPE_TILE: TileLayout = { width: 1024, height: 640, title: 84 };
const PORTRAIT_TILE: TileLayout = { width: 560, height: 1120, title: 64 };
const MAX_ROWS = 8; // 8 projets au plus dans une colonne (hauteur 8*1120 = 8960)

export function tileLayout(viewportWidth: number, viewportHeight: number): TileLayout {
  return viewportWidth < viewportHeight ? PORTRAIT_TILE : LANDSCAPE_TILE;
}

// Les photos sont gardées en mémoire : changer d'orientation redessine
// l'atlas sans les retélécharger.
const coverImages = new Map<string, Promise<HTMLImageElement | null>>();
const ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm';

/**
 * Dessine le visuel de chaque projet (photo Unsplash couvrante + index +
 * titre + rôle) et les concatène dans un atlas 2D unique (un rang par
 * projet), puis l'uploade en GPU. Le panneau projet est ensuite affiché à
 * l'intérieur du rendu WebGPU, comme une lame de verre portant le contenu.
 */
export async function createProjectGallery(
  gpu: Gpu,
  projects: readonly ProjectVisual[],
  layout: TileLayout,
): Promise<ProjectGallery> {
  const count = Math.max(1, projects.length);
  if (count > MAX_ROWS) throw new Error('Too many projects for one atlas column');
  const width = layout.width;
  const height = count * layout.height;

  const atlas = texture(gpu, {
    kind: '2d',
    size: [width, height],
    format: ATLAS_FORMAT,
    usage: ['texture_binding', 'copy_dst'],
    label: 'lumen-project-atlas',
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    atlas.destroy();
    throw new Error('2D context unavailable for project atlas');
  }

  // Chargement des photos en parallèle (CORS requis avant getImageData).
  const images = await Promise.all(projects.map((p) => loadCoverImage(p.image)));

  for (let index = 0; index < count; index++) {
    drawProjectTile(ctx, projects[index], images[index], layout, index * layout.height);
  }

  // Lecture des pixels du canvas (opaque, RGBA) et upload direct.
  const pixels = ctx.getImageData(0, 0, width, height).data;
  if (pixels.length !== width * height * 4) {
    atlas.destroy();
    throw new Error('Unexpected atlas pixel layout');
  }
  gpu.gpu.queue.writeTexture(
    { texture: atlas.gpu },
    pixels,
    { bytesPerRow: width * 4, rowsPerImage: height },
    { width, height },
  );

  return {
    atlas,
    layout,
    destroy() {
      atlas.destroy();
    },
  };
}

/**
 * Charge une image depuis une URL distante avec crossOrigin anonyme pour
 * pouvoir relire ses pixels (sinon le canvas serait « contaminé »). Retourne
 * null si le chargement échoue (se replie alors sur un fond tramé).
 */
function loadCoverImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  let pending = coverImages.get(src);
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    coverImages.set(src, pending);
  }
  return pending;
}

// Interlignage du titre, repris par le héros de la page projet (index.css).
const TITLE_LEADING = 82 / 84;
const FONT_ROLE = '13px ui-monospace, "SF Mono", Menlo, monospace';
const FONT_INDEX = '15px ui-monospace, "SF Mono", Menlo, monospace';

function drawProjectTile(
  ctx: CanvasRenderingContext2D,
  project: ProjectVisual,
  image: HTMLImageElement | null,
  layout: TileLayout,
  ty: number,
): void {
  const { width, height } = layout;
  if (image && image.naturalWidth > 0) {
    drawCover(ctx, image, 0, ty, width, height);
  } else {
    // Repli : fond gris tramé si la photo n'a pas pu être chargée.
    ctx.fillStyle = 'rgb(196,196,200)';
    ctx.fillRect(0, ty, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let offset = 0; offset < height; offset += 26) {
      ctx.moveTo(0, ty + offset + 0.5);
      ctx.lineTo(width, ty + offset + 0.5);
    }
    for (let offset = 0; offset < width; offset += 26) {
      ctx.moveTo(offset + 0.5, ty);
      ctx.lineTo(offset + 0.5, ty + height);
    }
    ctx.stroke();
  }

  // Voile sombre en bas et haut de la carte pour garder le texte lisible
  // sur n'importe quelle photo.
  const legibility = ctx.createLinearGradient(0, ty, 0, ty + height);
  legibility.addColorStop(0, 'rgba(0,0,0,0.28)');
  legibility.addColorStop(0.45, 'rgba(0,0,0,0)');
  legibility.addColorStop(0.8, 'rgba(0,0,0,0.38)');
  legibility.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = legibility;
  ctx.fillRect(0, ty, width, height);

  const gloss = ctx.createLinearGradient(0, ty, width, ty + height);
  gloss.addColorStop(0, 'rgba(255,255,255,0.12)');
  gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
  gloss.addColorStop(1, 'rgba(255,255,255,0.2)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, ty, width, height);

  const margin = 54;
  ctx.textBaseline = 'top';

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = FONT_INDEX;
  ctx.letterSpacing = '0.14em';
  ctx.fillText(`[${project.index}]`, margin, ty + margin);

  ctx.fillStyle = '#fff';
  ctx.font = `900 ${layout.title}px Archivo, system-ui, sans-serif`;
  ctx.letterSpacing = '-0.02em';
  const titleLines = wrapCanvasTitle(ctx, project.title, width - margin * 2);
  let titleY = ty + margin + 42;
  for (const line of titleLines) {
    if (line.length > 0) ctx.fillText(line, margin, titleY);
    titleY += layout.title * TITLE_LEADING;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = FONT_ROLE;
  ctx.letterSpacing = '0.14em';
  ctx.fillText(project.role.toUpperCase(), margin, ty + height - margin - 20);

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.strokeRect(0.5, ty + 0.5, width - 1, height - 1);
}

/** Dessine l'image en mode « cover » : rognée au centre, couvre toute la carte. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const scale = Math.max(dw / image.naturalWidth, dh / image.naturalHeight);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function wrapCanvasTitle(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string[] {
  if (ctx.measureText(title).width <= maxWidth) return [title];
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}