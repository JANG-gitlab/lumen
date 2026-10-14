import { useEffect, useRef } from 'react';
import { useSpotlight } from '../hooks/useSpotlight';
import { BlurDissolve } from './BlurDissolve';

const MANIFESTO = [
  { text: 'Nous sculptons', outlined: false },
  { text: 'la lumière', outlined: true },
  { text: 'pour en faire', outlined: false },
  { text: 'des identités.', outlined: false },
] as const;

const FIGURES = [
  { value: '04', label: 'Disciplines, un seul atelier' },
  { value: '02', label: 'Villes, Blois et Paris' },
  { value: '12', label: 'Projets par an, au plus' },
] as const;

const DISCIPLINES = [
  {
    title: 'Identité visuelle',
    text: 'Logos, systèmes typographiques, chartes vivantes pensées pour l’écran autant que pour le papier.',
  },
  {
    title: 'Web3D et WebGPU',
    text: 'Sites en temps réel, scènes sculptées au shader, expériences qui tournent dans le navigateur.',
  },
  {
    title: 'Motion design',
    text: 'Animations de marque, génériques et micro-interactions réglés à l’image près.',
  },
  {
    title: 'Direction artistique',
    text: 'Photo, vidéo, campagnes : une seule lumière, du brief à la livraison.',
  },
] as const;

const METHOD = [
  { title: 'Écouter', text: 'Une journée dans vos murs avant la première esquisse.' },
  { title: 'Esquisser', text: 'Trois pistes, pas une de plus, dessinées à la main puis maquettées.' },
  { title: 'Sculpter', text: 'La piste retenue passe en matière : code, volume, mouvement.' },
  { title: 'Allumer', text: 'Mise en ligne, prise en main par vos équipes, un an de suivi.' },
] as const;

// Une ligne du manifeste se résout entre ces deux hauteurs d'écran.
const REVEAL_START = 0.92;
const REVEAL_SPAN = 0.32;

/**
 * Présentation du studio, posée à même la sculpture de verre. Le manifeste
 * se résout ligne à ligne au scroll (même flou liquide que le mot du héros),
 * le reste apparaît en fondu en entrant dans l'écran. Au survol, un
 * projecteur suit le curseur et les textes portent leur ombre.
 */
export function Studio() {
  const sectionRef = useRef<HTMLElement>(null);
  const lineRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const progressRefs = useRef(MANIFESTO.map(() => ({ current: 0 })));
  useSpotlight(sectionRef);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const viewportHeight = window.innerHeight || 1;
      lineRefs.current.forEach((line, index) => {
        if (!line) return;
        const top = line.getBoundingClientRect().top / viewportHeight;
        progressRefs.current[index].current = Math.min(1, Math.max(0, (REVEAL_START - top) / REVEAL_SPAN));
      });
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-revealed', 'true');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    section.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="studio" ref={sectionRef} className="studio" aria-labelledby="studio-title">
      <div className="studio__spot" aria-hidden="true" />
      <div className="studio__meta">
        <span data-spot>[Studio]</span>
        <span data-spot>Design numérique</span>
        <span data-spot>Fondé en 2026</span>
      </div>

      <h2 id="studio-title" className="studio__manifesto" aria-label="Nous sculptons la lumière pour en faire des identités.">
        {MANIFESTO.map((line, index) => (
          <span
            key={line.text}
            ref={(element) => {
              lineRefs.current[index] = element;
            }}
            className={line.outlined ? 'studio__line studio__line--outlined' : 'studio__line'}
            aria-hidden="true"
            data-spot
          >
            <BlurDissolve outgoing={line.text} progressRef={progressRefs.current[index]} />
          </span>
        ))}
      </h2>

      <div className="studio__about">
        <p className="studio__intro" data-reveal data-spot>
          Lumen est un studio de design numérique installé entre Blois et Paris. Nous dessinons des identités
          qui bougent, des sites qui se regardent comme des objets et des images qui tiennent dans la main.
          Chaque projet part d’une matière : le verre, le papier, la lumière d’une pièce à une heure précise.
        </p>
        <dl className="studio__figures">
          {FIGURES.map((figure) => (
            <div key={figure.label} data-reveal data-spot>
              <dt>{figure.label}</dt>
              <dd>{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="studio__block">
        <h3 className="studio__heading" data-reveal data-spot>
          Disciplines
        </h3>
        <ol className="studio__disciplines">
          {DISCIPLINES.map((discipline, index) => (
            <li key={discipline.title} data-reveal data-spot>
              <span className="studio__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="studio__discipline">{discipline.title}</span>
              <span className="studio__text">{discipline.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="studio__block">
        <h3 className="studio__heading" data-reveal data-spot>
          Méthode
        </h3>
        <ol className="studio__method">
          {METHOD.map((step, index) => (
            <li key={step.title} data-reveal data-spot>
              <span className="studio__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="studio__step">{step.title}</span>
              <span className="studio__text">{step.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
