import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Track, YoutubeVideo } from '../models/models';

/**
 * Integration YouTube cote client :
 * - recherche directe sur YouTube (via le backend, sans cle API)
 * - import d'une video dans le catalogue YAM DJ (file d'actualite)
 * - catalogue "musiques libres d'acces" (hymnes + tubes)
 */
@Injectable({ providedIn: 'root' })
export class YoutubeService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Recherche YouTube : ?q=...&limit=12 (public). */
  search(q: string, limit = 12): Observable<YoutubeVideo[]> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return this.http.get<YoutubeVideo[]>(`${this.apiUrl}/api/youtube/search?${params.toString()}`);
  }

  /** Import d'une video (URL ou ID) dans la plateforme — auth requis. */
  importVideo(videoIdOrUrl: string): Observable<Track> {
    return this.http.post<Track>(`${this.apiUrl}/api/youtube/import`, { videoIdOrUrl });
  }

  /** Musiques libres d'acces : hymnes nationaux + pistes YouTube. */
  libre(limit = 24): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/youtube/libre?limit=${limit}`);
  }
}
