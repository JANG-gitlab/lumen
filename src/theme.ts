/**
 * Mode jour ou nuit du site. Sans choix enregistré, on suit le réglage du
 * système. Le thème est posé sur <html data-theme>, le CSS et la sculpture
 * (jeu de lumières) s'en déduisent.
 */

export type Theme = 'day' | 'night';

const STORAGE_KEY = 'lumen-theme';
// Durée des fondus de couleur, alignée sur la transition CSS de .is-theming.
const THEME_FADE = 1200;

const listeners = new Set<() => void>();
let theme: Theme = readInitialTheme();
let fadeTimer = 0;

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'day' || stored === 'night') return stored;
  } catch {
    // Stockage indisponible : on retombe sur le réglage du système.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

/** À appeler avant le premier rendu pour éviter un flash du mauvais thème. */
export function applyTheme() {
  document.documentElement.dataset.theme = theme;
}

export function currentTheme(): Theme {
  return theme;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(next: Theme) {
  if (next === theme) return;
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Le choix vaut pour la visite.
  }
  const html = document.documentElement;
  html.classList.add('is-theming');
  applyTheme();
  window.clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => html.classList.remove('is-theming'), THEME_FADE);
  for (const listener of listeners) listener();
}
