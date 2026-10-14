import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { tileLayout } from '../../glass-sculpture/screens';
import { PROJECTS } from '../projects';
import { closeProject, showProject, subscribeViewer, viewerState } from '../projectViewer';

/**
 * Page projet, posée par-dessus la scène une fois que la lame couvre
 * l'écran. Le héros reprend au pixel près la composition de la tuile
 * dessinée dans la lame (photo, voiles, index, titre, rôle) : le relais
 * entre le verre et la page ne se voit pas, l'image gagne juste en netteté.
 */
export function ProjectPage() {
  const { phase, index } = useSyncExternalStore(subscribeViewer, viewerState);
  const pageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const visible = phase === 'open';
  const [layout, setLayout] = useState(() => tileLayout(window.innerWidth, window.innerHeight));

  useEffect(() => {
    const onResize = () => setLayout(tileLayout(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (phase === 'opening') {
      // La zone cliquable posée sur la lame n'est pas un repère clavier.
      const active = document.activeElement as HTMLElement | null;
      returnFocusRef.current = active?.getAttribute('aria-hidden') === 'true' ? null : active;
    } else if (phase === 'open') {
      closeRef.current?.focus({ preventScroll: true });
    } else if (phase === 'idle') {
      returnFocusRef.current?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
  }, [phase]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeProject();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  useEffect(() => {
    pageRef.current?.scrollTo(0, 0);
  }, [index]);

  const project = PROJECTS[index];
  if (phase === 'idle' || !project) return null;
  const next = PROJECTS[(index + 1) % PROJECTS.length];

  return (
    <div
      ref={pageRef}
      className="project-page"
      data-visible={visible}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-title"
    >
      <button ref={closeRef} type="button" className="project-page__close" onClick={closeProject}>
        Fermer <span aria-hidden="true">[Esc]</span>
      </button>

      <header
        className="project-hero"
        style={
          {
            '--hero-image': `url("${project.image}")`,
            '--tile-width': layout.width,
            '--tile-height': layout.height,
            '--tile-title': layout.title,
          } as CSSProperties
        }
      >
        <div className="project-hero__tile">
          <span className="project-hero__index">[{project.index}]</span>
          <h1 id="project-title" className="project-hero__title">
            {project.title}
          </h1>
          <span className="project-hero__role">{project.role}</span>
        </div>
      </header>

      <section className="project-intro">
        <p className="project-intro__summary">{project.summary}</p>
        <dl className="project-intro__meta">
          <div>
            <dt>Année</dt>
            <dd>{project.year}</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>{project.client}</dd>
          </div>
          <div>
            <dt>Services</dt>
            <dd>
              {project.services.map((service) => (
                <span key={service}>{service}</span>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      <figure className="project-figure project-figure--wide">
        <img src={project.image} alt="" loading="lazy" />
      </figure>

      <section className="project-body">
        {project.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>

      <div className="project-pair">
        <figure className="project-figure project-figure--detail">
          <img src={project.image} alt="" loading="lazy" />
        </figure>
        <figure className="project-figure project-figure--detail project-figure--mono">
          <img src={project.image} alt="" loading="lazy" />
        </figure>
      </div>

      <nav className="project-next" aria-label="Projet suivant">
        <button type="button" onClick={() => showProject((index + 1) % PROJECTS.length)}>
          <span className="project-next__label">Projet suivant [{next.index}]</span>
          <span className="project-next__title">{next.title}</span>
        </button>
      </nav>
    </div>
  );
}
