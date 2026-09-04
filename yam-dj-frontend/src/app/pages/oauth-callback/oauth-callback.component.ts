import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../../components/icon/icon.component';

/**
 * RETOUR GOOGLE : le backend redirige ici apres l'echange du code OAuth,
 * avec la session dans le fragment d'URL (#token=...&email=...) — le
 * fragment n'est jamais envoye aux serveurs (ni logs ni Referer).
 */
@Component({
  selector: 'yam-oauth-callback',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-yam-dark to-black">
      <div class="w-full max-w-md text-center">
        <a routerLink="/" class="flex items-center justify-center gap-3 mb-8">
          <img src="assets/favicon.svg" alt="YAM DJ" class="w-14 h-14 rounded-2xl">
          <span class="font-display font-extrabold text-3xl yam-gradient-text">YAM DJ</span>
        </a>

        <div class="yam-card p-8">
          @if (error()) {
            <div class="mb-3 flex items-center justify-center text-white/50"><yam-icon name="alert-circle" [size]="44"/></div>
            <h1 class="text-xl font-bold mb-2">Connexion Google impossible</h1>
            <p class="text-white/50 text-sm mb-6">{{ error() }}</p>
            <a routerLink="/login" class="yam-btn-primary w-full inline-block">Reessayer</a>
          } @else {
            <div class="mb-3 flex items-center justify-center text-yam-orange"><yam-icon name="headphones" [size]="44" class="animate-pulse"/></div>
            <h1 class="text-xl font-bold mb-2">Connexion en cours...</h1>
            <p class="text-white/50 text-sm">Finalisation de ta session Google.</p>
            <div class="mt-6 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div class="h-full w-1/3 bg-gradient-to-r from-yam-orange to-yam-gold animate-pulse"></div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class OauthCallbackComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  error = signal<string | null>(null);

  constructor() {
    // Le fragment (#token=...) est lu IMMEDIATEMENT au constructeur, avant
    // toute navigation Angular, puis purge de la barre d'adresse.
    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1) : window.location.hash;
    if (!raw) {
      this.error.set('Aucune donnee de connexion recue — retourne a la connexion.');
      return;
    }
    const result = this.auth.applyOAuthFragment(raw);
    history.replaceState(null, '', window.location.pathname);
    if (result.ok) {
      this.router.navigate(['/']);
    } else {
      this.error.set(result.error || 'Erreur inconnue');
    }
  }
}
