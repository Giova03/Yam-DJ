import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

/**
 * Analytics produit (V1.1) — funnel artiste + KPI North Star
 * "Published Artists" (directive marketing/data de l'equipe).
 *
 * Fire-and-forget : aucune erreur ne remonte jamais a l'UI, les envois
 * echoues sont silencieusement ignores (l'analytics ne doit jamais casser
 * l'experience). Liste blanche cote backend.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Un evenement de ce nom a-t-il deja ete envoye cette session ? */
  private sent = new Set<string>();

  /**
   * Enregistre un evenement du funnel.
   * @param name  landing_view | artist_cta_click | signup_started |
   *              signup_completed | upload_started | upload_completed |
   *              track_published | track_played | track_shared | ...
   * @param once  true = un seul envoi par session (pages vues dedupliquees)
   */
  track(name: string, metadata?: string, once = false): void {
    try {
      if (once && this.sent.has(name)) return;
      this.sent.add(name);
      this.http.post<void>(`${this.apiUrl}/api/analytics/event`, {
        name, metadata
      }).subscribe({ error: () => {} });
    } catch {
      // Jamais bloquant
    }
  }
}
