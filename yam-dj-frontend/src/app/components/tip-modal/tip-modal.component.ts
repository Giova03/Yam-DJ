import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentService } from '../../services/payment.service';

const AMOUNTS = [500, 1000, 2000, 5000];

/**
 * MODALE DE TIP — "Soutenir l'artiste" en 1 clic.
 * Montant -> paiement Orange Money (CinetPay) -> confirmation.
 */
@Component({
  selector: 'yam-tip-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (visible()) {
      <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" (click)="close.emit()">
        <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10" (click)="$event.stopPropagation()">

          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="yam-title">💰 YAM Tip</h2>
              <p class="text-white/50 text-sm mt-1">Soutiens <b class="text-white">{{ artistName() }}</b> via Orange Money</p>
            </div>
            <button (click)="close.emit()" class="text-white/40 hover:text-white text-2xl leading-none">×</button>
          </div>

          @if (!paymentUrl() && !confirmed()) {
            <div class="space-y-4">
              <div class="grid grid-cols-4 gap-2">
                @for (amount of amounts; track amount) {
                  <button (click)="selectedAmount.set(amount)"
                          class="yam-btn-secondary !px-2 !py-2.5 text-sm"
                          [class]="selectedAmount() === amount ? '!bg-yam-orange' : ''">
                    {{ amount }} F
                  </button>
                }
              </div>

              <div>
                <label class="text-sm text-white/60 mb-1 block">Montant libre (FCFA)</label>
                <input type="number" min="100" max="100000" step="100"
                       [ngModel]="selectedAmount()"
                       (ngModelChange)="selectedAmount.set($event)"
                       class="yam-input">
                <p class="text-xs text-white/40 mt-1">Minimum 100 FCFA — maximum 100 000 FCFA</p>
              </div>

              <div>
                <label class="text-sm text-white/60 mb-1 block">Message (optionnel)</label>
                <input type="text" maxlength="200" [(ngModel)]="message"
                       placeholder="Continue comme ca ! 🔥"
                       class="yam-input">
              </div>

              <label class="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input type="checkbox" [(ngModel)]="anonymous" class="accent-yam-orange w-4 h-4">
                Rester anonyme
              </label>

              @if (error()) {
                <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3">{{ error() }}</p>
              }

              <button (click)="sendTip()" [disabled]="sending() || !validAmount()"
                      class="yam-btn-primary w-full !py-3.5 text-lg">
                @if (sending()) { <span class="animate-pulse">Connexion a CinetPay...</span> }
                @else { Envoyer {{ selectedAmount() }} FCFA 🎁 }
              </button>

              <p class="text-center text-xs text-white/30">
                Paiement securise par CinetPay — Orange Money, Moov Money, MTN
              </p>
            </div>
          }

          @if (paymentUrl()) {
            <div class="text-center space-y-4 py-4">
              <div class="text-5xl">📱</div>
              <h3 class="text-xl font-bold">Finalise ton paiement</h3>
              <p class="text-white/60 text-sm">
                Une page Orange Money s'est ouverte dans un nouvel onglet.<br>
                Entre ton numero et valide avec ton code secret.
              </p>
              <a [href]="paymentUrl()" target="_blank" rel="noopener"
                 class="yam-btn-primary inline-block">Reouvrir la page de paiement</a>
              <button (click)="checkPayment()" [disabled]="checking()"
                      class="yam-btn-secondary w-full">
                @if (checking()) { <span class="animate-pulse">Verification...</span> }
                @else { J'ai paye — verifier }
              </button>
            </div>
          }

          @if (confirmed()) {
            <div class="text-center space-y-4 py-6">
              <div class="text-6xl animate-bounce-eq">🎉</div>
              <h3 class="text-2xl font-bold text-yam-gold">Tip envoye !</h3>
              <p class="text-white/60">{{ artistName() }} vient de recevoir ton soutien.<br>Merci de faire vibrer la musique africaine !</p>
              <button (click)="close.emit()" class="yam-btn-primary">Fermer</button>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class TipModalComponent {
  visible = input.required<boolean>();
  artistId = input.required<string>();
  artistName = input.required<string>();
  close = output<void>();
  tipped = output<number>();

  private paymentService = inject(PaymentService);

  amounts = AMOUNTS;
  selectedAmount = signal<number>(1000);
  message = '';
  anonymous = false;
  sending = signal<boolean>(false);
  checking = signal<boolean>(false);
  confirmed = signal<boolean>(false);
  paymentUrl = signal<string | null>(null);
  currentToken = signal<string | null>(null);
  error = signal<string | null>(null);

  validAmount(): boolean {
    const a = this.selectedAmount();
    return a >= 100 && a <= 100000;
  }

  sendTip(): void {
    this.error.set(null);
    this.sending.set(true);
    this.paymentService.createTip(this.artistId(), this.selectedAmount(), this.message, this.anonymous)
      .subscribe({
        next: res => {
          this.sending.set(false);
          if (res.paymentUrl) {
            this.paymentUrl.set(res.paymentUrl);
            this.currentToken.set(res.paymentToken);
            window.open(res.paymentUrl, '_blank');
          } else {
            this.confirmed.set(true);
            this.tipped.emit(this.selectedAmount());
          }
        },
        error: err => {
          this.sending.set(false);
          this.error.set(err?.error?.message || 'Erreur de connexion au service de paiement. Reessaie.');
        }
      });
  }

  checkPayment(): void {
    if (!this.currentToken()) return;
    this.checking.set(true);
    this.paymentService.verifyTip(this.currentToken()!).subscribe({
      next: res => {
        this.checking.set(false);
        if (res.status === 'COMPLETED') {
          this.paymentUrl.set(null);
          this.confirmed.set(true);
          this.tipped.emit(this.selectedAmount());
        } else if (res.status === 'FAILED' || res.status === 'REFUSED') {
          this.error.set('Le paiement a ete refuse. Reessaie ou change de moyen de paiement.');
          this.paymentUrl.set(null);
        } else {
          this.error.set('Paiement en cours de confirmation... Reessaie dans quelques secondes.');
        }
      },
      error: () => {
        this.checking.set(false);
        this.error.set('Impossible de verifier le paiement. Reessaie.');
      }
    });
  }
}
