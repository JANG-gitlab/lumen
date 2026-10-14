import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Studio } from './components/Studio';
import { Work } from './components/Work';
import { Footer } from './components/Footer';
import { CustomCursor } from './components/CustomCursor';
import { GlassBackdrop } from './components/GlassBackdrop';
import { SHAPES } from '../glass-sculpture/scene';
import { useEffect } from 'react';
import { ProjectHotspot } from './components/ProjectHotspot';
import { ProjectPage } from './components/ProjectPage';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { installProjectRouting } from './projectViewer';

export default function App() {
  useSmoothScroll();
  useEffect(installProjectRouting, []);

  return (
    <main className="site">
      <a className="skip-link" href="#work">
        Aller au contenu
      </a>
      <GlassBackdrop shapeCount={SHAPES.length} />
      <Header />
      <Hero />
      <Studio />
      <Work />
      <ProjectHotspot />
      <Footer />
      <ProjectPage />
      <CustomCursor />
    </main>
  );
}