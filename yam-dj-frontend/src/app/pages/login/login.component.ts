import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'yam-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-yam-dark to-black">
      <div class="w-full max-w-md">
        <a routerLink="/" class="flex items-center justify-center gap-3 mb-8">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-yam-orange to-yam-gold flex items-center justify-center text-2xl font-black">Y</div>
          <span class="font-display font-extrabold text-3xl yam-gradient-text">YAM DJ</span>
        </a>

        <div class="yam-card p-8">
          <h1 class="text-2xl font-bold mb-1">Bon retour ! 🎧</h1>
          <p class="text-white/50 text-sm mb-6">La musique africaine t'attend.</p>

          @if (needsVerification()) {
            <div class="bg-yam-orange/10 border border-yam-orange/30 rounded-xl p-4 mb-4">
              <p class="text-sm text-yam-orange font-medium mb-3">{{ verificationMessage() }}</p>
              <input type="text" maxlength="12" inputmode="numeric" autocomplete="one-time-code"
                     placeholder="Code a 6 chiffres" [ngModel]="verificationCode"
                     (ngModelChange)="onCodeInput($event)"
                     class="yam-input text-center text-2xl tracking-[0.5em] !py-2.5 mb-3">
              <button (click)="verify()" [disabled]="verifying() || verificationCode.length !== 6"
                      class="yam-btn-primary w-full">
                @if (verifying()) { Verification... } @else { Activer mon compte }
              </button>
              <button (click)="resend()" class="w-full text-white/40 hover:text-white text-sm transition mt-2">
                Renvoyer le code
              </button>
            </div>
          } @else {
            <div class="space-y-4">
              <div>
                <label class="text-sm text-white/60 mb-1 block">Email</label>
                <input type="email" [(ngModel)]="email" placeholder="ton@email.com" class="yam-input">
              </div>
              <div>
                <label class="text-sm text-white/60 mb-1 block">Mot de passe</label>
                <input type="password" [(ngModel)]="password" placeholder="••••••••" class="yam-input" (keyup.enter)="doLogin()">
              </div>
            </div>
          }

          @if (error()) {
            <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3 mt-4">{{ error() }}</p>
          }

          @if (!needsVerification()) {
            <button (click)="doLogin()" [disabled]="loading() || !email || !password"
                    class="yam-btn-primary w-full mt-6 !py-3.5 text-lg">
              @if (loading()) { <span class="animate-pulse">Connexion...</span> } @else { Se connecter }
            </button>
          }

          <p class="text-center text-white/40 text-sm mt-6">
            Pas encore de compte ?
            <a routerLink="/register" class="text-yam-orange font-semibold hover:underline">Inscris-toi</a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  verificationCode = '';
  loading = signal(false);
  verifying = signal(false);
  error = signal<string | null>(null);
  needsVerification = signal(false);
  verificationMessage = signal('');

  doLogin(): void {
    this.error.set(null);
    this.email = this.email.trim();
    this.loading.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.token) {
          this.router.navigate(['/']);
        } else {
          this.needsVerification.set(true);
          this.verificationMessage.set(res.message);
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Erreur de connexion. Verifie tes identifiants.');
      }
    });
  }

  /** Ne garde que les chiffres (le copier-coller mail insere des espaces). */
  onCodeInput(value: string): void {
    this.verificationCode = (value || '').replace(/\D/g, '').slice(0, 6);
  }

  resend(): void {
    this.auth.resendVerification(this.email.trim()).subscribe({
      next: () => this.error.set('Nouveau code envoye !'),
      error: err => this.error.set(err?.error?.message || 'Erreur d\'envoi.')
    });
  }

  verify(): void {
    this.verifying.set(true);
    this.error.set(null);
    this.auth.verifyEmail(this.email.trim(), this.verificationCode).subscribe({
      next: res => {
        this.verifying.set(false);
        if (res.token) {
          this.router.navigate(['/']);
        } else {
          this.error.set(res.message);
        }
      },
      error: err => {
        this.verifying.set(false);
        this.error.set(err?.error?.message || 'Code invalide.');
      }
    });
  }
}
