import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ArtistStats, ArtistPublic, Playlist, SearchResults, TipHistory, Track } from '../models/models';

/** Services annexes : recherche globale, stats artiste, moderation, playlists. */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  globalSearch(q: string): Observable<SearchResults> {
    return this.http.get<SearchResults>(`${this.apiUrl}/api/search?q=${encodeURIComponent(q)}`);
  }

  artistProfile(id: string): Observable<ArtistPublic> {
    return this.http.get<ArtistPublic>(`${this.apiUrl}/api/artists/${id}`);
  }

  artistTracks(id: string): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/artists/${id}/tracks`);
  }

  artistStats(): Observable<ArtistStats> {
    return this.http.get<ArtistStats>(`${this.apiUrl}/api/artist/me/stats`);
  }

  artistTips(limit = 50): Observable<TipHistory[]> {
    return this.http.get<TipHistory[]>(`${this.apiUrl}/api/artist/me/tips?limit=${limit}`);
  }

  myTracks(): Observable<{ tracks: Track[] }> {
    return this.http.get<{ tracks: Track[] }>(`${this.apiUrl}/api/artist/me/tracks`);
  }

  pendingTracks(page = 0, size = 30): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/api/admin/validate-tracks?page=${page}&size=${size}`);
  }

  approveTrack(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/admin/validate-tracks/${id}/approve`, {});
  }

  rejectTrack(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/admin/validate-tracks/${id}/reject`, {});
  }

  // ============================ PLAYLISTS ============================

  myPlaylists(): Observable<Playlist[]> {
    return this.http.get<Playlist[]>(`${this.apiUrl}/api/playlists/my`);
  }

  publicPlaylists(limit = 12): Observable<Playlist[]> {
    return this.http.get<Playlist[]>(`${this.apiUrl}/api/playlists/public?limit=${limit}`);
  }

  playlist(id: string): Observable<Playlist> {
    return this.http.get<Playlist>(`${this.apiUrl}/api/playlists/${id}`);
  }

  createPlaylist(name: string, description: string, isPublic: boolean): Observable<Playlist> {
    return this.http.post<Playlist>(`${this.apiUrl}/api/playlists`, { name, description, isPublic });
  }

  addTrack(playlistId: string, trackId: string): Observable<Playlist> {
    return this.http.post<Playlist>(`${this.apiUrl}/api/playlists/${playlistId}/tracks/${trackId}`, {});
  }

  removeTrack(playlistId: string, trackId: string): Observable<Playlist> {
    return this.http.delete<Playlist>(`${this.apiUrl}/api/playlists/${playlistId}/tracks/${trackId}`);
  }

  deletePlaylist(playlistId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/api/playlists/${playlistId}`);
  }

  trackById(id: string): Observable<Track> {
    return this.http.get<Track>(`${this.apiUrl}/api/tracks/${id}`);
  }

  // ============================ ABONNEMENTS ============================

  followStatus(artistId: string): Observable<{ following: boolean; followers: number }> {
    return this.http.get<{ following: boolean; followers: number }>(
      `${this.apiUrl}/api/artists/${artistId}/follow-status`);
  }

  follow(artistId: string): Observable<{ following: boolean; followers: number }> {
    return this.http.post<{ following: boolean; followers: number }>(
      `${this.apiUrl}/api/artists/${artistId}/follow`, {});
  }

  unfollow(artistId: string): Observable<{ following: boolean; followers: number }> {
    return this.http.delete<{ following: boolean; followers: number }>(
      `${this.apiUrl}/api/artists/${artistId}/follow`);
  }

  followFeed(limit = 20): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/api/follow/feed?limit=${limit}`);
  }
}
