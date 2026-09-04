import { Injectable, signal } from '@angular/core';

/**
 * THEME SOMBRE / CLAIR — pilote la classe html.light.
 * - V2 AFROPULSE NIGHT : mode sombre PAR DEFAUT (identite de marque).
 * - Choix persiste en localStorage ("yam-theme").
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
    // Transition douce entre les themes (palette V2 : ivoire chaud en clair)
    document.documentElement.classList.add('theme-anim');
    this.apply(next);
    setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
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
    // couleur de la barre navigateur mobile (PWA) — nuit AFROPULSE en sombre
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#FBF5EC' : '#09090F');
    }
  }

  private initialTheme(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem('yam-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* localStorage indisponible (mode prive) */ }
    return 'dark'; // defaut V2 : AFROPULSE NIGHT
  }
}
