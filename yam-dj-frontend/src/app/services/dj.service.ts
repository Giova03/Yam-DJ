import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { environment } from '../../environments/environment';
import { AutoMixSuggestion, Mixtape, MixtapePurchaseResponse, Track, TrackPage } from '../models/models';

/**
 * Service DJ : studio, Auto-Mix IA, mixtapes + notifications temps reel.
 */
@Injectable({ providedIn: 'root' })
export class DjService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  private wsSubject: WebSocketSubject<any> | null = null;
  private notifications = new Subject<any>();
  notifications$ = this.notifications.asObservable();

  /**
   * Bibliothèque du Studio DJ : TOUTES les pages du catalogue (le backend
   * attend page+size, max 50/page — l'ancien paramètre « limit » était ignoré
   * et le studio ne voyait que 20 pistes au total).
   * Fusionne les pages, dédoublonne et renvoie un TrackPage unique.
   */
  studioLibrary(genre?: string, country?: string): Observable<TrackPage> {
    const base = new URLSearchParams();
    if (genre && genre !== 'all') base.set('genre', genre);
    if (country && country !== 'all') base.set('country', country);
    base.set('size', '50');
    const requests = [0, 1, 2, 3].map(p => {
      const params = new URLSearchParams(base);
      params.set('page', String(p));
      return this.http.get<TrackPage>(`${this.apiUrl}/api/tracks?${params.toString()}`)
        .pipe(catchError(() => of<TrackPage>({ content: [], page: p, size: 50, totalElements: 0, totalPages: 0 })));
    });
    return forkJoin(requests).pipe(
      map((pages: TrackPage[]) => {
        const seen = new Set<string>();
        const content: Track[] = [];
        for (const pg of pages) {
          for (const t of (pg?.content || [])) {
            if (t?.id && !seen.has(t.id)) { seen.add(t.id); content.push(t); }
          }
          if (pg && pg.totalPages > 0 && pg.page + 1 >= pg.totalPages) break; // dernière page atteinte
        }
        return {
          content,
          page: 0,
          size: content.length,
          totalElements: content.length,
          totalPages: 1
        };
      })
    );
  }

  suggestAutoMix(trackIds: string[]): Observable<AutoMixSuggestion> {
    return this.http.post<AutoMixSuggestion>(`${this.apiUrl}/api/dj/auto-mix`, { trackIds });
  }

  createMixtape(data: { title: string; trackIds: string[]; crossfadeSec: number; autoOrder: boolean; priceXof?: number }): Observable<Mixtape> {
    return this.http.post<Mixtape>(`${this.apiUrl}/api/dj/create-mixtape`, data);
  }

  /**
   * PUBLIE UN MIX ENREGISTRE EN DIRECT dans le Studio DJ (blob MediaRecorder :
   * webm/opus ou mp4). Le serveur le transcode en MP3 et le reference comme
   * mixtape du DJ connecte.
   */
  uploadMixtape(file: Blob, title: string, priceXof: number, durationSec: number): Observable<Mixtape> {
    const fd = new FormData();
    const ext = file.type.includes('mp4') ? 'm4a' : (file.type.includes('mpeg') ? 'mp3' : 'webm');
    fd.append('file', file, `mix-yam-dj.${ext}`);
    fd.append('title', title || 'Live YAM DJ');
    fd.append('priceXof', String(priceXof || 0));
    fd.append('durationSec', String(Math.max(0, Math.round(durationSec))));
    return this.http.post<Mixtape>(`${this.apiUrl}/api/dj/mixtapes/upload`, fd);
  }

  myMixtapes(): Observable<Mixtape[]> {
    return this.http.get<Mixtape[]>(`${this.apiUrl}/api/dj/my-mixtapes`);
  }

  /** Mixtapes payantes achetees par le fan connecte (boutique 3.4). */
  purchasedMixtapes(): Observable<Mixtape[]> {
    return this.http.get<Mixtape[]>(`${this.apiUrl}/api/dj/mixtapes/purchased`);
  }

  publicMixtapes(limit = 20): Observable<Mixtape[]> {
    return this.http.get<Mixtape[]>(`${this.apiUrl}/api/mixtapes/public?limit=${limit}`);
  }

  // ============ BOUTIQUE DE MIXTAPES (Phase 3.4, 70/30) ============

  /** Initiation de l'achat d'une mixtape payante (FedaPay). */
  purchaseMixtape(mixtapeId: string): Observable<MixtapePurchaseResponse> {
    return this.http.post<MixtapePurchaseResponse>(`${this.apiUrl}/api/payment/mixtape/${mixtapeId}`, {});
  }

  /** Verification post-paiement (apres retour FedaPay). */
  verifyMixtapePurchase(paymentToken: string): Observable<MixtapePurchaseResponse> {
    return this.http.post<MixtapePurchaseResponse>(`${this.apiUrl}/api/payment/mixtape/verify`, { paymentToken });
  }

  mixtapeStreamUrl(mixtapeId: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.apiUrl}/api/dj/mixtapes/${mixtapeId}/stream`);
  }

  registerMixtapePlay(mixtapeId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/api/dj/mixtapes/${mixtapeId}/play`, {});
  }

  /** Supprime une mixtape du DJ connecte. */
  // TODO(backend) : l'endpoint DELETE /api/dj/mixtapes/{id} n'est pas encore expose par DjController — activer cote backend avant la prod.
  deleteMixtape(mixtapeId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/dj/mixtapes/${mixtapeId}`);
  }

  /**
   * WebSocket STOMP simplifie : ecoute des notifications de tips recus.
   * Le backend diffuse sur /topic/notifications/{userId}.
   */
  connectNotifications(userId: string): void {
    if (this.wsSubject) return;
    try {
      const wsUrl = environment.wsUrl.replace('http', 'ws');
      this.wsSubject = webSocket(`${wsUrl}?userId=${userId}`);
      this.wsSubject.subscribe({
        next: (msg: any) => this.notifications.next(msg),
        error: () => { this.wsSubject = null; },
        complete: () => { this.wsSubject = null; }
      });
    } catch {
      this.wsSubject = null;
    }
  }

  disconnectNotifications(): void {
    this.wsSubject?.complete();
    this.wsSubject = null;
  }
}
