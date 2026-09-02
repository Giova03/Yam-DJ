import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * MOT DE PASSE OUBLIE (etape 1) : l'utilisateur entre son email, un lien
 * de reinitialisation (valable 30 min, usage unique) part par email Brevo.
 */
@Component({
  selector: 'yam-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-yam-dark">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <a routerLink="/" class="yam-gradient-text font-display font-extrabold text-4xl">YAM DJ</a>
          <h1 class="text-2xl font-bold mt-6 mb-2">Mot de passe oublie ?</h1>
          <p class="text-white/50 text-sm">
            Entre ton email : on t'envoie un lien pour choisir un nouveau mot de passe.
          </p>
        </div>

        <div class="yam-card p-6">
          @if (sent()) {
            <div class="text-center py-4">
              <div class="text-5xl mb-4">📧</div>
              <p class="font-semibold mb-2">Verifie ta boite mail</p>
              <p class="text-white/50 text-sm mb-6">
                Si un compte YAM DJ existe avec <b>{{ email() }}</b>, le lien de
                reinitialisation vient d'etre envoye (verifie aussi tes spams).
                Le lien est valable 30 minutes.
              </p>
              <button (click)="resend()" [disabled]="loading()"
                      class="yam-btn-secondary w-full mb-3">
                {{ loading() ? 'Envoi...' : 'Renvoyer le lien' }}
              </button>
              <a routerLink="/login" class="text-yam-orange text-sm font-semibold hover:underline">← Retour a la connexion</a>
            </div>
          } @else {
            @if (error()) {
              <div class="bg-red-400/10 border border-red-400/40 text-red-400 rounded-xl p-3 mb-4 text-sm">
                {{ error() }}
              </div>
            }
            <label class="text-sm text-white/60 mb-1 block">Ton adresse email</label>
            <input type="email" [(ngModel)]="emailValue" (input)="error.set('')"
                   placeholder="ton@email.com" class="yam-input mb-5"
                   [disabled]="loading()">
            <button (click)="submit()" [disabled]="loading() || !emailValue.includes('@')"
                    class="yam-btn-primary w-full">
              {{ loading() ? 'Envoi en cours...' : 'Recevoir le lien de reinitialisation' }}
            </button>
            <div class="text-center mt-5">
              <a routerLink="/login" class="text-white/50 text-sm hover:text-white">← J'ai retrouve mon mot de passe</a>
            </div>
          }
        </div>

        <p class="text-center text-white/30 text-xs mt-6">
          Ta musique t'attend — l'equipe YAM DJ 🇧🇫
        </p>
      </div>
    </div>
  `
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);

  emailValue = '';
  email = signal('');
  sent = signal(false);
  loading = signal(false);
  error = signal('');

  submit(): void { this.send(); }
  resend(): void { this.send(); }

  private send(): void {
    const email = this.emailValue.trim().toLowerCase();
    if (!email.includes('@')) {
      this.error.set('Entre une adresse email valide.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.loading.set(false);
        this.email.set(email);
        this.sent.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Envoi impossible pour le moment. Verifie ta connexion et reessaie.');
      }
    });
  }
}
