import { Injectable, signal } from '@angular/core';

/**
 * THEME SOMBRE / CLAIR — pilote la classe html.light.
 * - Mode clair actif PAR DEFAUT (demande produit V1.1)
 * - Choix persiste en localStorage ("yam-theme")
 * - Script anti-FOUC dans index.html : la classe est appliquee avant
 *   le demarrage d'Angular (pas de flash blanc/noir au chargement).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

  readonly theme = signal<'light' | 'dark'>(this.initialTheme());

  constructor() {
    this.apply(this.theme());
  }

  toggle(): void {
    const next = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(next);
    localStorage.setItem('yam-theme', next);
    this.apply(next);
  }

  isLight(): boolean {
    return this.theme() === 'light';
  }

  private apply(theme: 'light' | 'dark'): void {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    // couleur de la barre navigateur mobile (PWA)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#F6F7F9' : '#0A0A0A');
    }
  }

  private initialTheme(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem('yam-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* localStorage indisponible (mode prive) */ }
    return 'light'; // defaut : mode clair
  }
}
