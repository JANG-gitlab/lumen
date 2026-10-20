import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

interface BlurDissolveProps {
  /** Texte affiché. Sans `incoming`, il se résout seul (révélation). */
  readonly outgoing: ReactNode;
  /** Texte vers lequel morpher (optionnel). */
  readonly incoming?: string;
  /**
   * Progression 0..1 lue via une ref mutable : 0 = flou/dissous,
   * 1 = texte net. Aucun re-render React par frame.
   */
  readonly progressRef: RefObject<number>;
  readonly className?: string;
}

/**
 * « Blur dissolve » façon composant Framer : le texte est passé dans un
 * filtre SVG feColorMatrix seuillé (gooey threshold). Son blur décroît à
 * mesure que la progression monte : les lettres semblent fondre d'un état
 * liquide vers un texte net, plutôt qu'un simple fondu de transparence.
 * Avec `incoming`, deux couches se morphent l'une dans l'autre.
 *
 * Les couches sont empilées en grid (même cellule) pour que le conteneur
 * garde une taille dérivée du texte sans dépendre de la position absolue.
 */
export function BlurDissolve({ outgoing, incoming, progressRef, className }: BlurDissolveProps) {
  const filterId = useId();
  const outRef = useRef<HTMLSpanElement>(null);
  const inRef = useRef<HTMLSpanElement>(null);
  const hasMorph = Boolean(incoming);

  useEffect(() => {
    let raf = 0;
    let applied = -1;
    const paint = (element: HTMLSpanElement | null, opacity: number, blur: number) => {
      if (!element) return;
      // Presque invisible : on retire la couche du rendu au lieu de payer un
      // grand flou que personne ne voit.
      const hidden = opacity < MIN_VISIBLE_OPACITY;
      element.style.visibility = hidden ? 'hidden' : '';
      element.style.opacity = `${opacity}`;
      element.style.filter = hidden || blur < 0.05 ? '' : `blur(${blur.toFixed(2)}px)`;
    };
    const apply = () => {
      raf = requestAnimationFrame(apply);
      const fraction = Math.min(1, Math.max(0, progressRef.current));
      // Rien n'a bougé : aucune écriture, donc aucun nouveau calcul du flou.
      if (Math.abs(fraction - applied) < 0.001) return;
      applied = fraction;
      // L'opacité grimpe en puissance 0.4 : accumulation « liquide ».
      const inOpacity = Math.pow(fraction, 0.4);
      const outOpacity = Math.pow(1 - fraction, 0.4);
      paint(outRef.current, hasMorph ? outOpacity : inOpacity, blurPx(hasMorph ? 1 - fraction : fraction));
      paint(inRef.current, inOpacity, blurPx(fraction));
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [hasMorph, progressRef]);

  return (
    <span
      className={className}
      style={hasMorph ? { filter: `url(#${filterId}) blur(0.6px)` } : undefined}
    >
      <span className="blur-dissolve__layer blur-dissolve__layer--out" ref={outRef} aria-hidden={hasMorph}>
        {outgoing}
      </span>
      {hasMorph && (
        <span className="blur-dissolve__layer blur-dissolve__layer--in" ref={inRef}>
          {incoming}
        </span>
      )}
      {hasMorph && (
        <svg className="blur-dissolve__svg" aria-hidden="true">
          <defs>
            <filter id={filterId}>
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 255 -140"
              />
            </filter>
          </defs>
        </svg>
      )}
    </span>
  );
}

// En deçà, la couche n'est plus rendue du tout.
const MIN_VISIBLE_OPACITY = 0.02;
// Le coût d'un flou CSS croît avec son rayon, sur des textes grands comme
// l'écran : mesuré, au-delà de 10 px le rendu tombe sous 60 images/s
// pendant la dissolution. À 10 px, le texte est déjà méconnaissable.
const MAX_BLUR = 10;

function blurPx(opacity: number): number {
  if (opacity <= 0) return MAX_BLUR;
  return Math.min(8 / opacity - 8, MAX_BLUR);
}