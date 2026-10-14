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
    const apply = () => {
      const fraction = Math.min(1, Math.max(0, progressRef.current));
      // L'opacité grimpe en puissance 0.4 : accumulation « liquide ».
      const inOpacity = Math.pow(fraction, 0.4);
      const outOpacity = Math.pow(1 - fraction, 0.4);
      if (outRef.current) {
        outRef.current.style.opacity = `${hasMorph ? outOpacity : inOpacity}`;
        outRef.current.style.filter = `blur(${blurPx(hasMorph ? 1 - fraction : fraction)}px)`;
      }
      if (inRef.current) {
        inRef.current.style.opacity = `${inOpacity}`;
        inRef.current.style.filter = `blur(${blurPx(fraction)}px)`;
      }
      raf = requestAnimationFrame(apply);
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

function blurPx(opacity: number): number {
  if (opacity <= 0) return 100;
  return Math.min(8 / opacity - 8, 100);
}