import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const COUNTRIES = [
  'Burkina Faso', "Cote d'Ivoire", 'Mali', 'Senegal', 'Guinee', 'Benin', 'Togo',
  'Niger', 'Cameroun', 'RDC', 'Congo', 'Gabon', 'France', 'Autre'
];

@Component({
  selector: 'yam-register',
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
          <h1 class="text-2xl font-bold mb-1">Rejoins le mouvement 🌍</h1>
          <p class="text-white/50 text-sm mb-6">Fan, artiste ou DJ — choisis ton role.</p>

          <!-- Choix du role -->
          <div class="grid grid-cols-3 gap-2 mb-6">
            @for (r of roles; track r.value) {
              <button type="button" (click)="role.set(r.value)"
                      class="p-3 rounded-2xl border text-center transition-all"
                      [class]="role() === r.value
                        ? 'bg-yam-orange/20 border-yam-orange text-yam-orange'
                        : 'bg-yam-surface border-white/10 text-white/60 hover:border-white/30'">
                <div class="text-2xl mb-1">{{ r.icon }}</div>
                <div class="text-xs font-semibold">{{ r.label }}</div>
              </button>
            }
          </div>

          @if (!codeSent()) {
            <div class="space-y-4">
              <div>
                <label class="text-sm text-white/60 mb-1 block">Pseudo</label>
                <input type="text" [(ngModel)]="pseudo" placeholder="Ton pseudo unique" class="yam-input">
              </div>
              @if (role() !== 'USER') {
                <div>
                  <label class="text-sm text-white/60 mb-1 block">Nom de scene {{ role() === 'DJ' ? '(DJ)' : '(artiste)' }}</label>
                  <input type="text" [(ngModel)]="stageName" [placeholder]="role() === 'DJ' ? 'DJ Faso' : 'Faso King'" class="yam-input">
                </div>
              }
              <div>
                <label class="text-sm text-white/60 mb-1 block">Email</label>
                <input type="email" [(ngModel)]="email" placeholder="ton@email.com" class="yam-input">
              </div>
              <div>
                <label class="text-sm text-white/60 mb-1 block">Mot de passe (min 8 caracteres)</label>
                <input type="password" [(ngModel)]="password" placeholder="••••••••" class="yam-input">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-sm text-white/60 mb-1 block">Telephone (Orange Money)</label>
                  <input type="tel" [(ngModel)]="phone" placeholder="+226 70 00 00 00" class="yam-input">
                </div>
                <div>
                  <label class="text-sm text-white/60 mb-1 block">Pays</label>
                  <select [(ngModel)]="country" class="yam-input">
                    @for (c of countries; track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                </div>
              </div>

              @if (error()) {
                <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3">{{ error() }}</p>
              }

              <button (click)="doRegister()" [disabled]="loading()"
                      class="yam-btn-primary w-full !py-3.5 text-lg">
                @if (loading()) { <span class="animate-pulse">Creation...</span> } @else { Creer mon compte }
              </button>
            </div>
          } @else {
            <div class="space-y-4">
              <div class="bg-yam-orange/10 border border-yam-orange/30 rounded-xl p-4 text-center">
                <div class="text-4xl mb-2">📧</div>
                <p class="text-sm">Un code de verification vient d'etre envoye a<br><b class="text-white">{{ email }}</b></p>
              </div>
              <input type="text" maxlength="12" inputmode="numeric" autocomplete="one-time-code"
                     placeholder="Code a 6 chiffres" [ngModel]="verificationCode"
                     (ngModelChange)="onCodeInput($event)" #codeInput
                     class="yam-input text-center text-2xl tracking-[0.5em] !py-2.5">
              @if (error()) {
                <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3">{{ error() }}</p>
              }
              <button (click)="verify()" [disabled]="verifying() || verificationCode.length !== 6"
                      class="yam-btn-primary w-full !py-3.5 text-lg">
                @if (verifying()) { Verification... } @else { Activer mon compte }
              </button>
              <button (click)="resend()" class="w-full text-white/40 hover:text-white text-sm transition">
                Renvoyer le code
              </button>
            </div>
          }

          <p class="text-center text-white/40 text-sm mt-6">
            Deja inscrit ?
            <a routerLink="/login" class="text-yam-orange font-semibold hover:underline">Connecte-toi</a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  countries = COUNTRIES;
  roles = [
    { value: 'USER', label: 'Auditeur', icon: '🎧' },
    { value: 'ARTIST', label: 'Artiste', icon: '🎤' },
    { value: 'DJ', label: 'DJ', icon: '🎚️' }
  ];

  role = signal<string>('USER');
  pseudo = '';
  stageName = '';
  email = '';
  password = '';
  phone = '';
  country = 'Burkina Faso';
  verificationCode = '';

  loading = signal(false);
  verifying = signal(false);
  codeSent = signal(false);
  error = signal<string | null>(null);

  doRegister(): void {
    this.error.set(null);
    if (this.password.length < 8) {
      this.error.set('Le mot de passe doit faire au moins 8 caracteres.');
      return;
    }
    this.email = this.email.trim();
    this.pseudo = this.pseudo.trim();
    this.loading.set(true);
    this.auth.register({
      email: this.email,
      password: this.password,
      pseudo: this.pseudo,
      role: this.role(),
      phone: this.phone,
      country: this.country,
      stageName: this.stageName
    }).subscribe({
      next: res => {
        this.loading.set(false);
        this.codeSent.set(true);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Erreur lors de l\'inscription.');
      }
    });
  }

  /** Ne garde que les chiffres (le copier-coller mail insere des espaces). */
  onCodeInput(value: string): void {
    this.verificationCode = (value || '').replace(/\D/g, '').slice(0, 6);
  }

  verify(): void {
    this.verifying.set(true);
    this.error.set(null);
    this.auth.verifyEmail(this.email.trim(), this.verificationCode).subscribe({
      next: res => {
        this.verifying.set(false);
        if (res.token) this.router.navigate(['/']);
        else this.error.set(res.message);
      },
      error: err => {
        this.verifying.set(false);
        this.error.set(err?.error?.message || 'Code invalide.');
      }
    });
  }

  resend(): void {
    this.auth.resendVerification(this.email.trim()).subscribe({
      next: () => this.error.set('Nouveau code envoye !'),
      error: err => this.error.set(err?.error?.message || 'Erreur d\'envoi.')
    });
  }
}
