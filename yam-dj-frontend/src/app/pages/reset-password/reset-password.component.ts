import { Component, inject, signal, OnInit } from '@angular/core';
import { IconComponent } from '../../components/icon/icon.component';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * MOT DE PASSE OUBLIE (etape 2) : arrive depuis le lien email
 * /reset-password?token=xxxx — choix du nouveau mot de passe.
 */
@Component({
  selector: 'yam-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-yam-dark">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <a routerLink="/" class="yam-gradient-text font-display font-extrabold text-4xl">YAM DJ</a>
          <h1 class="text-2xl font-bold mt-6 mb-2">Nouveau mot de passe</h1>
          <p class="text-white/50 text-sm">Choisis un mot de passe solide (8 caracteres minimum).</p>
        </div>

        <div class="yam-card p-6">
          @if (done()) {
            <div class="text-center py-4">
              <div class="text-5xl mb-4"></div>
              <p class="font-semibold mb-2">Mot de passe modifie !</p>
              <p class="text-white/50 text-sm mb-6">Connecte-toi maintenant avec ton nouveau mot de passe.</p>
              <a routerLink="/login" class="yam-btn-primary w-full inline-block">Se connecter</a>
            </div>
          } @else {
            @if (error()) {
              <div class="bg-red-400/10 border border-red-400/40 text-red-400 rounded-xl p-3 mb-4 text-sm">
                {{ error() }}
                @if (invalidToken()) {
                  <a routerLink="/forgot-password" class="block mt-2 text-yam-orange font-semibold hover:underline">
                    Demander un nouveau lien →
                  </a>
                }
              </div>
            }
            <label class="text-sm text-white/60 mb-1 block">Nouveau mot de passe</label>
            <input type="password" [(ngModel)]="password" (input)="error.set('')"
                   placeholder="••••••••" class="yam-input mb-4" autocomplete="new-password">
            <label class="text-sm text-white/60 mb-1 block">Confirme le mot de passe</label>
            <input type="password" [(ngModel)]="confirm" (input)="error.set('')"
                   placeholder="••••••••" class="yam-input mb-6" autocomplete="new-password">
            @if (password.length > 0) {
              <p class="text-xs mb-4" [class]="password.length >= 8 ? 'text-yam-green' : 'text-red-400'">
                @if (password.length < 8) { 8 caracteres minimum ({{ password.length }}/8) }
                @else if (password === confirm) { Mots de passe identiques }
                @else { Les mots de passe ne correspondent pas }
              </p>
            }
            <button (click)="submit()" [disabled]="loading() || password.length < 8 || password !== confirm"
                    class="yam-btn-primary w-full">
              {{ loading() ? 'Modification...' : 'Changer mon mot de passe' }}
            </button>
          }
        </div>
      </div>
    </div>
  `
})
export class ResetPasswordComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  password = '';
  confirm = '';
  token = '';
  done = signal(false);
  loading = signal(false);
  error = signal('');
  invalidToken = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.error.set('Lien incomplet — clique sur le bouton dans ton email.');
      this.invalidToken.set(true);
    }
  }

  submit(): void {
    if (this.password !== this.confirm) {
      this.error.set('Les deux mots de passe ne correspondent pas.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: err => {
        this.loading.set(false);
        const msg = err?.error?.message || '';
        this.error.set(msg || 'Impossible de changer le mot de passe. Le lien est peut-etre expire.');
        this.invalidToken.set(msg.includes('invalide') || msg.includes('expire'));
      }
    });
  }
}
