import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { WithdrawalRequest } from '../models/models';

/**
 * Retraits artistes : demande de retrait du solde vers mobile money
 * (Orange / Moov / MTN / Wave), validation manuelle par un admin.
 */
@Injectable({ providedIn: 'root' })
export class WithdrawalService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Demande de retrait (artiste connecte, solde suffisant, min 5 000 F). */
  create(amountXof: number, operator: string, phone: string): Observable<WithdrawalRequest> {
    return this.http.post<WithdrawalRequest>(`${this.apiUrl}/api/artist/withdrawals`, {
      amountXof, operator, phone
    });
  }

  /** Historique des demandes de l'artiste connecte. */
  mine(): Observable<WithdrawalRequest[]> {
    return this.http.get<WithdrawalRequest[]>(`${this.apiUrl}/api/artist/withdrawals/mine`);
  }

  /** File de validation (admin). Statut optionnel : PENDING | APPROVED | REJECTED. */
  all(status?: string): Observable<WithdrawalRequest[]> {
    const q = status ? `?status=${status}` : '';
    return this.http.get<WithdrawalRequest[]>(`${this.apiUrl}/api/admin/withdrawals${q}`);
  }

  /** Valide une demande (debite le solde artiste, envoie email + notification). */
  approve(id: string): Observable<WithdrawalRequest> {
    return this.http.post<WithdrawalRequest>(`${this.apiUrl}/api/admin/withdrawals/${id}/approve`, {});
  }

  /** Rejette une demande avec note admin. */
  reject(id: string, note?: string): Observable<WithdrawalRequest> {
    return this.http.post<WithdrawalRequest>(`${this.apiUrl}/api/admin/withdrawals/${id}/reject`, { note });
  }
}
