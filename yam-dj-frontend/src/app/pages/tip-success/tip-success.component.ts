import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PaymentService } from '../../services/payment.service';

/** Page de retour FedaPay apres paiement du tip. */
@Component({
  selector: 'yam-tip-success',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="yam-card p-10 text-center max-w-md w-full">
        @if (status() === 'COMPLETED') {
          <div class="text-6xl mb-4 animate-bounce-eq">🎉</div>
          <h1 class="text-2xl font-bold text-yam-gold mb-2">Tip envoye !</h1>
          <p class="text-white/60 mb-6">Merci pour ton soutien — l'artiste vient de recevoir ton tip Orange Money.</p>
        } @else if (status() === 'PENDING') {
          <div class="text-6xl mb-4 animate-pulse">⏳</div>
          <h1 class="text-2xl font-bold mb-2">Verification du paiement...</h1>
          <p class="text-white/60 mb-6"> patiente quelques secondes.</p>
          <button (click)="verify()" class="yam-btn-primary">Verifier maintenant</button>
        } @else {
          <div class="text-6xl mb-4">💳</div>
          <h1 class="text-2xl font-bold mb-2">Retour de paiement</h1>
          <p class="text-white/60 mb-6">Statut : {{ status() || 'inconnu' }}</p>
          <button (click)="verify()" class="yam-btn-secondary">Verifier le paiement</button>
        }
        <a routerLink="/" class="block text-yam-orange text-sm mt-6 hover:underline">← Retour a l'accueil</a>
      </div>
    </div>
  `
})
export class TipSuccessComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private paymentService = inject(PaymentService);

  status = signal<string>('PENDING');
  token = '';

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || '';
      if (this.token) this.verify();
    });
  }

  verify(): void {
    if (!this.token) return;
    this.paymentService.verifyTip(this.token).subscribe({
      next: res => this.status.set(res.status),
      error: () => this.status.set('UNKNOWN')
    });
  }
}
