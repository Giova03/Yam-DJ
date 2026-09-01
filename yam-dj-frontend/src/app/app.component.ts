import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'yam-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, AudioPlayerComponent],
  template: `
    <div class="min-h-screen bg-yam-dark">
      <yam-navbar />
      <main class="pb-40">
        <router-outlet />
      </main>
      <yam-audio-player />
    </div>
  `
})
export class AppComponent {
  private auth = inject(AuthService);

  constructor() {
    this.registerServiceWorker();
  }

  /**
   * Enregistre le service worker (PWA installable + reception des push).
   * L'abonnement PUSH lui-meme reste un opt-in explicite utilisateur
   * (cloche navbar -> "Activer les notifications push").
   */
  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW indisponible (contexte non securise...) : non bloquant
      });
    });
  }
}
