import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AnalyticsService } from '../../services/analytics.service';
import { GoogleButtonComponent } from '../../components/google-button/google-button.component';
import { IconComponent } from '../../components/icon/icon.component';

const COUNTRIES = [
  'Burkina Faso', "Cote d'Ivoire", 'Mali', 'Senegal', 'Guinee', 'Benin', 'Togo',
  'Niger', 'Cameroun', 'RDC', 'Congo', 'Gabon', 'France', 'Autre'
];

@Component({
  selector: 'yam-register',
  standalone: true,
  imports: [FormsModule, RouterLink, GoogleButtonComponent, IconComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-yam-dark to-black">
      <div class="w-full max-w-md">
        <a routerLink="/" class="flex items-center justify-center gap-3 mb-8">
          <img src="assets/favicon.svg" alt="YAM DJ" class="w-14 h-14 rounded-2xl">
          <span class="font-display font-extrabold text-3xl yam-gradient-text">YAM DJ</span>
        </a>

        <div class="yam-card p-8">
          <h1 class="text-2xl font-bold mb-1 flex items-center gap-2"><yam-icon name="globe" [size]="22" class="text-yam-orange"/> Rejoins le mouvement</h1>
          <p class="text-white/50 text-sm mb-6">Fan, artiste ou DJ — choisis ton role.</p>

          <!-- Choix du role -->
          <div class="grid grid-cols-3 gap-2 mb-6">
            @for (r of roles; track r.value) {
              <button type="button" (click)="role.set(r.value)"
                      class="p-3 rounded-2xl border text-center transition-all"
                      [class]="role() === r.value
                        ? 'bg-yam-orange/20 border-yam-orange text-yam-orange'
                        : 'bg-yam-surface border-white/10 text-white/60 hover:border-white/30'">
                <div class="mb-1"><yam-icon [name]="r.icon" [size]="24"/></div>
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
                  <input type="text" [(ngModel)]="stageName" [placeholder]="role() === 'DJ' ? 'Ex : DJ YAM' : 'Ex : Ton nom de scène'" class="yam-input">
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

              <!-- Inscription sociale : Google (reprend le role choisi) -->
              <div class="flex items-center gap-3 my-5">
                <div class="h-px bg-white/10 flex-1"></div>
                <span class="text-xs text-white/40">ou</span>
                <div class="h-px bg-white/10 flex-1"></div>
              </div>
              <yam-google-button [role]="role()" />

              @if (loading() && slowServer()) {
                <p class="text-center text-white/40 text-xs mt-3 animate-pulse">
                  Le serveur se reveille (offre gratuite) : patiente encore un peu, ca arrive...
                </p>
              }
            </div>
          } @else {
            <div class="space-y-4">
              <div class="bg-yam-orange/10 border border-yam-orange/30 rounded-xl p-4 text-center">
                <div class="mb-2 flex items-center justify-center text-yam-orange"><yam-icon name="mail" [size]="34"/></div>
                <p class="text-sm">Un code de verification vient d'etre envoye a<br><b class="text-white">{{ email }}</b></p>
              </div>
              <input type="text" maxlength="12" inputmode="numeric" autocomplete="one-time-code"
                     placeholder="Code a 6 chiffres" [ngModel]="verificationCode"
                     (ngModelChange)="onCodeInput($event)"
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
export class RegisterComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private analytics = inject(AnalyticsService);

  /** Preselection du role depuis l'URL (ex : /register?role=ARTIST
   *  depuis le CTA "Publier ma musique" de l'accueil). */
  ngOnInit(): void {
    const wanted = (this.route.snapshot.queryParamMap.get('role') || '').toUpperCase();
    if (['USER', 'ARTIST', 'DJ'].includes(wanted)) {
      this.role.set(wanted);
    }
  }

  countries = COUNTRIES;
  roles = [
    { value: 'USER', label: 'Auditeur', icon: 'headphones' },
    { value: 'ARTIST', label: 'Artiste', icon: 'mic' },
    { value: 'DJ', label: 'DJ', icon: 'sliders' }
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
  /** Devient vrai apres ~10 s : le serveur (offre gratuite) se reveille. */
  slowServer = signal(false);
  private slowTimer: any = null;

  private startSlowHint(): void {
    this.stopSlowHint();
    this.slowServer.set(false);
    this.slowTimer = setTimeout(() => this.slowServer.set(true), 10000);
  }

  private stopSlowHint(): void {
    if (this.slowTimer) { clearTimeout(this.slowTimer); this.slowTimer = null; }
    this.slowServer.set(false);
  }

  doRegister(): void {
    this.error.set(null);
    if (this.password.length < 8) {
      this.error.set('Le mot de passe doit faire au moins 8 caracteres.');
      return;
    }
    this.email = this.email.trim();
    this.pseudo = this.pseudo.trim();
    this.loading.set(true);
    this.startSlowHint();
    this.analytics.track('signup_started', this.role());
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
        this.stopSlowHint();
        this.codeSent.set(true);
      },
      error: err => {
        this.loading.set(false);
        this.stopSlowHint();
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
        if (res.token) {
          // Funnel : inscription verifiee et terminee
          this.analytics.track('signup_completed', this.role());
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

  resend(): void {
    this.auth.resendVerification(this.email.trim()).subscribe({
      next: () => this.error.set('Nouveau code envoye !'),
      error: err => this.error.set(err?.error?.message || 'Erreur d\'envoi.')
    });
  }
}
