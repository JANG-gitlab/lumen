import { useSyncExternalStore } from 'react';
import { isSoundEnabled, setSoundEnabled, subscribeSound } from '../sound';
import { currentTheme, setTheme, subscribeTheme } from '../theme';

export function Header() {
  const soundOn = useSyncExternalStore(subscribeSound, isSoundEnabled);
  const night = useSyncExternalStore(subscribeTheme, currentTheme) === 'night';

  return (
    <header className="site-header">
      <a className="site-header__mark" href="#top">
        LUMEN®
      </a>
      <span />
      <nav className="site-header__nav" aria-label="Sections">
        <a href="#studio">Studio</a>
        <a href="#work">Work</a>
        <a href="#contact">Contact</a>
        <button
          type="button"
          className="site-header__toggle"
          aria-pressed={night}
          onClick={() => setTheme(night ? 'day' : 'night')}
        >
          Nuit <span aria-hidden="true">[{night ? 'on' : 'off'}]</span>
        </button>
        <button
          type="button"
          className="site-header__toggle"
          aria-pressed={soundOn}
          onClick={() => setSoundEnabled(!soundOn)}
        >
          Son <span aria-hidden="true">[{soundOn ? 'on' : 'off'}]</span>
        </button>
      </nav>
    </header>
  );
}
