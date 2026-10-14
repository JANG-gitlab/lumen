import { PROJECTS } from '../projects';
import { openProject } from '../projectViewer';
import { WORK_SECTION_ID, projectScrollTop } from '../workScroll';

/**
 * Zone projets : chaque tranche ne sert qu'à la hauteur de défilement, le
 * visuel vit dans le canvas (lame de verre). Un bouton par projet, visible
 * seulement au clavier, amène la lame à l'écran et ouvre la page projet.
 */
export function Work() {
  const bringIntoView = (index: number) => {
    const top = projectScrollTop(index);
    if (top !== null) window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <section id={WORK_SECTION_ID} className="work" aria-label="Projets">
      {PROJECTS.map((project, index) => (
        <div className="work__screen" key={project.slug}>
          <button
            type="button"
            className="work__open"
            onFocus={() => bringIntoView(index)}
            onClick={() => openProject(index)}
          >
            [{project.index}] {project.title}, voir le projet
          </button>
        </div>
      ))}
    </section>
  );
}
