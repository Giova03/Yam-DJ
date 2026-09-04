import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon.component';
import { SeoService } from '../../services/seo.service';
import { AuthService } from '../../services/auth.service';
import { PaymentService } from '../../services/payment.service';

/**
 * PAGE PREMIUM FAN : abonnement 500 F / mois via FedaPay (mobile money).
 * Hero degrade, 4 avantages, etat premium actif (via /api/me) et FAQ.
 */
@Component({
  selector: 'yam-premium-page',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="max-w-5xl mx-auto px-4 pt-8 pb-16">

      <!-- Hero degrade orange / or -->
      <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-yam-orange via-orange-500 to-yam-gold p-8 sm:p-12 text-center shadow-2xl shadow-yam-orange/20">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.15),transparent_60%)]"></div>
        <div class="relative">
          <h1 class="font-display text-4xl sm:text-5xl font-extrabold text-white mb-3">YAM DJ Premium</h1>
          <p class="text-2xl sm:text-3xl font-extrabold text-white mb-3">500 F <span class="text-white/80 text-lg font-semibold">/ mois</span></p>
          <p class="text-white/90 max-w-xl mx-auto">Soutiens la plateforme et tes artistes preferes, profite d'une experience sans limites.</p>
        </div>
      </section>

      <!-- Etat : Premium actif -->
      @if (premium()) {
        <section class="yam-card p-8 mt-8 text-center border-yam-green/40 bg-yam-green/10">
          <div class="mb-3 text-yam-gold"><yam-icon name="star" [size]="44"/></div>
          <h2 class="text-2xl font-bold text-yam-green mb-2">Premium actif</h2>
          <p class="text-white/80">Merci pour ton soutien ! Ton abonnement court jusqu'au
            <b class="text-yam-green">{{ premiumUntilLabel() }}</b>.
          </p>
          <span class="yam-badge !bg-yam-gold/20 !text-yam-gold mt-4"><yam-icon name="star" [size]="12"/> Membre Premium</span>
        </section>
      }

      <!-- Etat : connecte, non premium -> paiement -->
      @if (!premium() && !premiumLoading()) {
        <section class="yam-card p-8 mt-8 text-center">
          @if (auth.isLoggedIn()) {
            <p class="text-white/60 mb-4">Rejoins les membres Premium des aujourd'hui.</p>
            <button (click)="startPremium()" [disabled]="paying()"
                    class="yam-btn-primary text-lg !px-10 !py-4">
              @if (paying()) {
                <span class="animate-pulse">Redirection vers le paiement...</span>
              } @else {
                Passer Premium — 500 F
              }
            </button>
            @if (payError()) {
              <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3 mt-4 max-w-md mx-auto">{{ payError() }}</p>
            }
          } @else {
            <p class="text-white/60 mb-6">Connecte-toi ou cree un compte pour souscrire.</p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center">
              <a routerLink="/login" class="yam-btn-primary">Se connecter</a>
              <a routerLink="/register" class="yam-btn-secondary">Creer un compte</a>
            </div>
          }
        </section>
      }

      <!-- Grille d'avantages -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <div class="yam-card p-6">
          <div class="text-yam-gold mb-3"><yam-icon name="trophy" [size]="28"/></div>
          <h3 class="font-bold mb-2">Badge supporteur</h3>
          <p class="text-white/50 text-sm">Badge Premium visible sur ton profil.</p>
        </div>
        <div class="yam-card p-6">
          <div class="text-yam-orange mb-3"><yam-icon name="megaphone" [size]="28"/></div>
          <h3 class="font-bold mb-2">Zero publicite</h3>
          <p class="text-white/50 text-sm">Aucune pub audio, pour toujours.</p>
        </div>
        <div class="yam-card p-6">
          <div class="text-yam-orange mb-3"><yam-icon name="headphones" [size]="28"/></div>
          <h3 class="font-bold mb-2">Avant-premieres</h3>
          <p class="text-white/50 text-sm">Acces prioritaire aux nouveautes.</p>
        </div>
        <div class="yam-card p-6">
          <div class="text-yam-green mb-3"><yam-icon name="heart" [size]="28"/></div>
          <h3 class="font-bold mb-2">Soutien direct</h3>
          <p class="text-white/50 text-sm">Ta contribution finance les redevances artistes.</p>
        </div>
      </section>

      <!-- FAQ -->
      <section class="yam-card p-6 mt-8">
        <h2 class="text-xl font-bold mb-4">Questions frequentes</h2>
        <div class="space-y-3 text-sm">
          <p class="text-white/60"><b class="text-white">Comment je paie ?</b>
            En mobile money via FedaPay : Orange, Moov, MTN, Wave.</p>
          <p class="text-white/60"><b class="text-white">⏳ Combien de temps ?</b>
            L'abonnement dure 30 jours et se renouvelle quand tu veux.</p>
          <p class="text-white/60"><b class="text-white">Et si j'arrete ?</b>
            Annulation libre a tout moment, sans frais.</p>
        </div>
      </section>
    </div>
  `
})
export class PremiumComponent implements OnInit {
  auth = inject(AuthService);
  private payment = inject(PaymentService);
  private seo = inject(SeoService);

  premium = signal(false);
  premiumUntil = signal<string | null>(null);
  premiumLoading = signal(true);

  paying = signal(false);
  payError = signal<string | null>(null);

  readonly PRICE_XOF = 500;

  ngOnInit(): void {
    this.seo.page(
      'Premium Fan — 500 F/mois : hors ligne, qualité max, badge d\'or | YAM DJ',
      'Passe en Premium Fan sur YAM DJ : téléchargements hors ligne illimités, qualité audio maximale, badge doré et soutiens directs des artistes d\'Afrique de l\'Ouest.',
      'https://yam-dj-frontend.vercel.app/premium');
    if (this.auth.isLoggedIn()) {
      this.auth.me().subscribe({
        next: me => {
          this.premium.set(!!me?.premium);
          this.premiumUntil.set(me?.premiumUntil ?? null);
          this.premiumLoading.set(false);
        },
        error: () => {
          // Fallback : cache local (pas de champ premium -> considere non premium)
          this.premium.set(false);
          this.premiumUntil.set(null);
          this.premiumLoading.set(false);
        }
      });
    } else {
      this.premiumLoading.set(false);
    }
  }

  /** Initie l'abonnement puis redirige vers la page de paiement FedaPay. */
  startPremium(): void {
    if (this.paying()) return;
    this.paying.set(true);
    this.payError.set(null);
    this.payment.initPremium().subscribe({
      next: res => {
        if (res?.paymentUrl) {
          window.location.href = res.paymentUrl;
        } else {
          this.paying.set(false);
          this.payError.set('Paiement indisponible pour l\'instant. Reessaie dans un instant.');
        }
      },
      error: err => {
        this.paying.set(false);
        this.payError.set(err?.error?.message || 'Impossible de demarrer le paiement. Reessaie.');
      }
    });
  }

  /** Date d'expiration formatee "dd MMMM yyyy" (p. ex. 14 mars 2027). */
  premiumUntilLabel(): string {
    const until = this.premiumUntil();
    if (!until) return '30 jours';
    const d = new Date(until);
    if (isNaN(d.getTime())) return until;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
