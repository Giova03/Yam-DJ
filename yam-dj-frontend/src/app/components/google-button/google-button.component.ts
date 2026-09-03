import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * BOUTON "CONTINUER AVEC GOOGLE" (login + inscription).
 * Deroule l'OAuth cote serveur : le navigateur est redirige vers Google,
 * puis le backend ramene la session sur /oauth/callback.
 * Si Google n'est pas encore active cote serveur (identifiants absents
 * ou backend pas encore deploye), un message clair s'affiche sans bloquer
 * les identifiants classiques.
 */
@Component({
  selector: 'yam-google-button',
  standalone: true,
  template: `
    <button (click)="start()" [disabled]="loading()"
            class="w-full flex items-center justify-center gap-3 !py-3 rounded-2xl bg-white text-yam-dark font-semibold
                   hover:bg-white/90 active:scale-[0.98] transition shadow-sm disabled:opacity-60">
      @if (loading()) {
        <span class="animate-pulse">Connexion a Google...</span>
      } @else {
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        <span>Continuer avec Google</span>
      }
    </button>

    @if (message()) {
      <p class="text-xs mt-2 rounded-xl px-3 py-2"
         [class]="messageOk() ? 'bg-yam-green/10 text-yam-green' : 'bg-yam-orange/10 text-yam-orange'">
        {{ message() }}
      </p>
    }
  `
})
export class GoogleButtonComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  /** Role souhaite pour un NOUVEAU compte (USER | ARTIST | DJ). */
  role = input<string>('USER');

  loading = signal(false);
  message = signal<string | null>(null);
  messageOk = signal(false);

  start(): void {
    this.loading.set(true);
    this.message.set(null);
    this.auth.googleLogin(this.role()).subscribe({
      next: res => {
        if (res?.url) {
          // Redirection navigateur vers le consentement Google
          window.location.href = res.url;
        } else {
          this.loading.set(false);
          this.fail('Reponse Google invalide — reessaie.');
        }
      },
      error: err => {
        this.loading.set(false);
        const status = err?.status;
        const backendMessage = err?.error?.message || (typeof err?.error === 'string' ? err.error : '') || '';
        if (status === 404 || backendMessage.includes('No static resource')) {
          // Backend pas encore deploye (route inexistante)
          this.fail('Connexion Google prete cote code : le serveur doit etre mis a jour '
            + '(deploiement en cours). En attendant, connecte-toi avec ton email.');
        } else if (status === 429) {
          this.fail('Trop de tentatives — patiente un peu avant de reessayer.');
        } else if (backendMessage.includes('non configuree') || backendMessage.includes('non configur')
            || backendMessage.includes('GOOGLE_CLIENT_ID')) {
          this.fail('Google doit etre active : renseigne GOOGLE_CLIENT_ID et '
            + 'GOOGLE_CLIENT_SECRET sur le serveur (instructions fournies). '
            + 'En attendant, connecte-toi avec ton email.');
        } else {
          this.fail(backendMessage || 'Connexion Google indisponible pour le moment.');
        }
      }
    });
  }

  private fail(msg: string): void {
    this.message.set(msg);
    this.messageOk.set(false);
  }
}
