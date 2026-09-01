import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, tap, catchError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { Comment } from '../models/models';

/**
 * Service des commentaires sur les pistes (Phase 2.2).
 * GET public, POST/DELETE avec JWT (injecte par auth.interceptor).
 */
@Injectable({ providedIn: 'root' })
export class CommentsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = environment.apiUrl;

  // Id de l'utilisateur connecte : absent du localStorage (login ne stocke
  // pas l'id), donc resolu une fois via /api/me et mis en cache ici.
  private meId = signal<string | null>(null);
  private meLoaded = false;

  /** Commentaires d'une piste (100 max, plus recents d'abord). */
  getComments(trackId: string): Observable<Comment[]> {
    return this.http.get<Comment[]>(`${this.apiUrl}/api/comments/track/${trackId}`);
  }

  /** Nombre total de commentaires d'une piste. */
  countComments(trackId: string): Observable<number> {
    return this.http.get<{ commentCount: number }>(`${this.apiUrl}/api/comments/track/${trackId}/count`)
      .pipe(map(res => res?.commentCount ?? 0));
  }

  /** Publie un commentaire (body {content}, 1-500 caracteres). */
  addComment(trackId: string, content: string): Observable<Comment> {
    return this.http.post<Comment>(`${this.apiUrl}/api/comments/track/${trackId}`, { content });
  }

  /** Supprime un commentaire (auteur ou admin) — 204 No Content. */
  deleteComment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/comments/${id}`);
  }

  /**
   * Id de l'utilisateur connecte (pour le bouton Supprimer de ses
   * propres commentaires). Cache en memoire, un seul appel /api/me.
   */
  currentUserId(): Observable<string | null> {
    const cached = this.auth.userId();
    if (cached) return of(cached);
    if (!this.auth.isLoggedIn() || this.meLoaded) return of(this.meId());
    return this.auth.me().pipe(
      map((u: any) => (u && u.id) ? String(u.id) : null),
      tap(id => {
        this.meId.set(id);
        this.meLoaded = true;
      }),
      catchError(() => of(null))
    );
  }
}
