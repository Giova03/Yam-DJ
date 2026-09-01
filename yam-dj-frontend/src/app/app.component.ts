import { Component, NgZone, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NavbarComponent } from './components/navbar/navbar.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';
import { environment } from '../environments/environment';

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
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  /** Intervalle du heartbeat serveur (4 min < seuil de veille Render 15 min). */
  private static readonly HEARTBEAT_MS = 4 * 60 * 1000;

  constructor() {
    this.registerServiceWorker();
    this.startServerHeartbeat();
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

  /**
   * Heartbeat serveur : pendant qu'au moins UN visiteur a l'onglet
   * visible, un ping ultra-leger (/actuator/health, ~80 octets) toutes
   * les 4 min maintient le backend Render eveille. Complement du
   * keep-alive GitHub Actions (qui peut subir des retards de cron) :
   * la double couverture rend les cold starts statistiquement rares.
   * - Onglet masque : pause (economie de data mobile).
   * - Zone hors Angular : pas de cycle de detection inutile.
   */
  private startServerHeartbeat(): void {
    if (typeof window === 'undefined' || !window.setInterval) return;
    this.zone.runOutsideAngular(() => {
      const beat = () => {
        if (document.visibilityState === 'visible') {
          this.http.get(`${environment.apiUrl}/actuator/health`)
            .subscribe({ error: () => { /* silencieux : simple battement */ } });
        }
      };
      window.setInterval(beat, AppComponent.HEARTBEAT_MS);
    });
  }
}
