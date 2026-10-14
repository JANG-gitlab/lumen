import { useEffect, useRef, useState } from 'react';
import { Example as Ocean } from '../../fft-ocean';
import { useReducedMotion } from '../hooks/useReducedMotion';

function OceanLayer() {
  return (
    <div className="footer__canvas">
      <Ocean />
    </div>
  );
}

export function Footer() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // L'océan (FFT, coûteux) n'est monté que lorsque le footer
    // s'approche du viewport, pour ne pas charger le GPU au départ.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
        }
      },
      { rootMargin: '600px 0px 0px 0px' },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <footer id="contact" ref={sectionRef} className="footer" aria-label="Contact">
      {inView && !reduceMotion && <OceanLayer />}
      <div className="footer__scrim" aria-hidden="true" />

      <div className="footer__content">
        <div className="footer__cta">
          <h2>
            Parlons
            <br />
            <span>lumens.</span>
          </h2>
          <a className="footer__mail" href="mailto:hello@lumen.studio">
            hello@lumen.studio
          </a>
        </div>

        <div className="footer__bottom">
          <span>© 2026 Lumen — Blois, France</span>
          <span className="footer__social">
            <a href="https://instagram.com" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href="https://behance.net" target="_blank" rel="noreferrer">
              Behance
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}