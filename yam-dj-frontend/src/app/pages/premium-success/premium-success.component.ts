import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { IconComponent } from '../../components/icon/icon.component';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PaymentService } from '../../services/payment.service';

/**
 * PAGE DE RETOUR FEDAPAY (route /premium/success?token=YAM-XXXX) :
 * verification du paiement Premium puis etat PENDING / COMPLETED / introuvable.
 * Re-verification automatique (5 s) tant que le paiement reste PENDING.
 */
@Component({
  selector: 'yam-premium-success-page',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="yam-card p-10 text-center max-w-md w-full">

        @if (verifying()) {
          <div class="text-6xl mb-4 animate-pulse"><yam-icon name="search" [size]="28"/></div>
          <h1 class="text-2xl font-bold mb-2">Verification du paiement...</h1>
          <p class="text-white/60 mb-6">Patiente un instant.</p>

        } @else if (status() === 'COMPLETED') {
          <div class="text-6xl mb-4 animate-bounce-eq"></div>
          <h1 class="text-2xl font-bold text-yam-gold mb-2">Premium active !</h1>
          <p class="text-white/60 mb-6">Merci pour ton soutien</p>
          <span class="yam-badge !bg-yam-gold/20 !text-yam-gold mb-6"> Membre Premium 30 jours</span>

        } @else if (status() === 'PENDING') {
          <div class="text-6xl mb-4 animate-pulse">⏳</div>
          <h1 class="text-2xl font-bold mb-2">Paiement en cours de confirmation</h1>
          <p class="text-white/60 mb-6">Recharge dans un instant...</p>
          <button (click)="verify()" [disabled]="verifying()" class="yam-btn-secondary mb-2">Verifier a nouveau</button>
          <p class="text-white/30 text-xs mb-6">Verification automatique toutes les 5 s.</p>

        } @else {
          <div class="text-6xl mb-4"><yam-icon name="x" [size]="28"/></div>
          <h1 class="text-2xl font-bold mb-2">Paiement introuvable</h1>
          <p class="text-white/60 mb-6">Le lien a expire ou le paiement n'a pas abouti. Tu peux reessayer depuis la page Premium.</p>
          <a routerLink="/premium" class="yam-btn-primary inline-block mb-6">Reessayer</a>
        }

        <div class="flex flex-col sm:flex-row gap-2 justify-center mt-2">
          <a routerLink="/" class="yam-btn-primary !py-2.5 text-sm">Retour a l'accueil</a>
          <a routerLink="/profile" class="yam-btn-secondary !py-2.5 text-sm">Voir mon profil</a>
        </div>
      </div>
    </div>
  `
})
export class PremiumSuccessComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private payment = inject(PaymentService);

  status = signal<string>('PENDING');
  verifying = signal(true);

  private token = '';
  private retryTimer: any = null;
  private retryCount = 0;
  private static readonly MAX_AUTO_RETRIES = 12;

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (this.token) {
      this.verify();
    } else {
      this.verifying.set(false);
      this.status.set('ERROR');
    }
  }

  ngOnDestroy(): void {
    this.stopRetry();
  }

  /** Verifie le paiement : COMPLETED / PENDING (re-essai auto) / ERROR. */
  verify(): void {
    if (!this.token) return;
    this.verifying.set(true);
    this.stopRetry();
    this.payment.verifyPremium(this.token).subscribe({
      next: res => {
        this.verifying.set(false);
        this.status.set(res?.status || 'PENDING');
        if (res?.status === 'PENDING') this.scheduleRetry();
      },
      error: () => {
        this.verifying.set(false);
        this.status.set('ERROR');
      }
    });
  }

  /** Relance la verification 5 s plus tard si le statut reste PENDING. */
  private scheduleRetry(): void {
    if (this.retryCount >= PremiumSuccessComponent.MAX_AUTO_RETRIES) return;
    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      if (this.status() === 'PENDING') this.verify();
    }, 5000);
  }

  private stopRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
