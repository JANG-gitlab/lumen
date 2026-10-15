import { useEffect, useRef, type CSSProperties } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { BlurDissolve } from './BlurDissolve';

const WORDMARK = 'Lumen';
// Le mot a fini de se dissoudre aux trois quarts de la scène sticky.
const HERO_SCROLL_FADE = 1.35;

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const heroProgressRef = useScrollProgress(heroRef);
  const wordmarkProgressRef = useRef(1);

  // L'entrée du mot est une animation CSS (lettres puis passage de lumière) ;
  // ici, seul le scroll le dissout à mesure qu'on s'éloigne du haut de page.
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const value = Math.max(0, Math.min(1, 1 - HERO_SCROLL_FADE * heroProgressRef.current));
      wordmarkProgressRef.current = value;
      wordmarkRef.current?.style.setProperty('opacity', `${Math.max(0.001, value)}`);
      raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [heroProgressRef]);

  return (
    <section id="top" ref={heroRef} className="hero" aria-label="Lumen studio of light">
      <div className="hero__stage">
        <h1 ref={wordmarkRef} className="hero__wordmark" aria-label="Lumen, studio of light">
          <BlurDissolve
            outgoing={[...WORDMARK].map((letter, index) => (
              <span key={index} className="hero__letter" style={{ '--letter': index } as CSSProperties}>
                {letter}
              </span>
            ))}
            progressRef={wordmarkProgressRef}
          />
        </h1>

        <div className="hero__meta">
          <div className="hero__meta-row">
            <span>A studio of light</span>
            <span>Est. 2026</span>
          </div>
          <div className="hero__meta-row hero__meta-row--bottom">
            <span>Blois — Paris</span>
            <span>Scroll to morph</span>
          </div>
        </div>
      </div>
    </section>
  );
}
