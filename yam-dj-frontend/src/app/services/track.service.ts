import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Track, TrackPage, ReceivedShare } from '../models/models';

/** Service des pistes : recherche, feed, plays, uploads. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  search(params: { q?: string; genre?: string; country?: string; page?: number; size?: number }): Observable<TrackPage> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.genre && params.genre !== 'all') query.set('genre', params.genre);
    if (params.country && params.country !== 'all') query.set('country', params.country);
    query.set('page', String(params.page ?? 0));
    query.set('size', String(params.size ?? 20));
    return this.http.get<TrackPage>(`${this.apiUrl}/api/tracks?${query.toString()}`);
  }

  feed(limit = 20): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/feed?limit=${limit}`);
  }

  trending(limit = 20): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/trending?limit=${limit}`);
  }

  latest(limit = 20): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/latest?limit=${limit}`);
  }

  forYou(limit = 20): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/for-you?limit=${limit}`);
  }

  history(limit = 50): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/history?limit=${limit}`);
  }

  /** Pistes aimees par l'utilisateur connecte. */
  myLikes(limit = 50): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/me/likes?limit=${limit}`);
  }

  byArtist(artistId: string): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/artist/${artistId}`);
  }

  streamUrl(trackId: string, quality: 'hq' | 'lite'): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.apiUrl}/api/tracks/${trackId}/stream?quality=${quality}`);
  }

  registerPlay(trackId: string, quality: 'hq' | 'lite' = 'hq'): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/api/tracks/${trackId}/play`, { quality });
  }

  like(trackId: string): Observable<{ likeCount: number; liked: boolean }> {
    return this.http.post<{ likeCount: number; liked: boolean }>(`${this.apiUrl}/api/tracks/${trackId}/like`, {});
  }

  download(trackId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/api/tracks/${trackId}/download`, {});
  }

  upload(formData: FormData): Observable<Track> {
    return this.http.post<Track>(`${this.apiUrl}/api/tracks/upload`, formData);
  }

  /** Pistes de l'artiste connecte (tous statuts : PENDING / APPROVED / REJECTED). */
  getMyTracks(): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/mine`);
  }

  /** Supprime une piste (artiste proprietaire ou admin) — 204 No Content. */
  deleteTrack(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/tracks/${id}`);
  }

  // ================== VAGUE 2 ==================

  /** YAM RADIO : suite aleatoire infinie par genre et/ou pays. */
  radio(genre?: string, country?: string, limit = 12): Observable<Track[]> {
    const p = new URLSearchParams();
    if (genre) p.set('genre', genre);
    if (country) p.set('country', country);
    p.set('limit', String(limit));
    return this.http.get<Track[]>(`${this.apiUrl}/api/tracks/radio?${p.toString()}`);
  }

  /** Envoie une piste a un ami YAM DJ (par pseudo) + notification. */
  shareTrack(trackId: string, toPseudo: string, message?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/tracks/${trackId}/share`, {
      toPseudo, message
    });
  }

  /** Partages recus (sons envoyes par d'autres utilisateurs). */
  myShares(limit = 30): Observable<ReceivedShare[]> {
    return this.http.get<ReceivedShare[]>(`${this.apiUrl}/api/me/shares?limit=${limit}`);
  }
}
