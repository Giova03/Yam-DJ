import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { TipResponse, PremiumResponse } from '../models/models';

/** Service paiement : YAM Tips + Abonnement Premium Fan via FedaPay (mobile money). */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Etape 1 : creation du tip + URL de paiement FedaPay. */
  createTip(artistId: string, amountXof: number, message: string, anonymous: boolean): Observable<TipResponse> {
    return this.http.post<TipResponse>(`${this.apiUrl}/api/payment/tip`, {
      artistId, amountXof, message, anonymous
    });
  }

  /** Etape 2 : verification post-paiement (fallback webhook). */
  verifyTip(paymentToken: string): Observable<TipResponse> {
    return this.http.post<TipResponse>(`${this.apiUrl}/api/payment/tip/verify`, { paymentToken });
  }

  /** Premium Fan : initiation de l'abonnement 30 jours (500 F). */
  initPremium(): Observable<PremiumResponse> {
    return this.http.post<PremiumResponse>(`${this.apiUrl}/api/payment/premium`, {});
  }

  /** Premium Fan : verification post-paiement (fallback webhook). */
  verifyPremium(paymentToken: string): Observable<PremiumResponse> {
    return this.http.post<PremiumResponse>(`${this.apiUrl}/api/payment/premium/verify`, { paymentToken });
  }
}
