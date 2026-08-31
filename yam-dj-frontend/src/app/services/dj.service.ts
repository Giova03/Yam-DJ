import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { environment } from '../../environments/environment';
import { AutoMixSuggestion, Mixtape, Track, TrackPage } from '../models/models';

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

  studioLibrary(genre?: string, country?: string, limit = 100): Observable<TrackPage> {
    const params = new URLSearchParams();
    if (genre && genre !== 'all') params.set('genre', genre);
    if (country && country !== 'all') params.set('country', country);
    params.set('limit', String(limit));
    // Reutilise l'endpoint de recherche public (pistes approuvees)
    return this.http.get<TrackPage>(`${this.apiUrl}/api/tracks?${params.toString()}`);
  }

  suggestAutoMix(trackIds: string[]): Observable<AutoMixSuggestion> {
    return this.http.post<AutoMixSuggestion>(`${this.apiUrl}/api/dj/auto-mix`, { trackIds });
  }

  createMixtape(data: { title: string; trackIds: string[]; crossfadeSec: number; autoOrder: boolean }): Observable<Mixtape> {
    return this.http.post<Mixtape>(`${this.apiUrl}/api/dj/create-mixtape`, data);
  }

  myMixtapes(): Observable<Mixtape[]> {
    return this.http.get<Mixtape[]>(`${this.apiUrl}/api/dj/my-mixtapes`);
  }

  publicMixtapes(limit = 20): Observable<Mixtape[]> {
    return this.http.get<Mixtape[]>(`${this.apiUrl}/api/mixtapes/public?limit=${limit}`);
  }

  mixtapeStreamUrl(mixtapeId: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.apiUrl}/api/dj/mixtapes/${mixtapeId}/stream`);
  }

  registerMixtapePlay(mixtapeId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/api/dj/mixtapes/${mixtapeId}/play`, {});
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
