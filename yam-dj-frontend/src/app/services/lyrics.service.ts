import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, map, catchError } from 'rxjs';
import { environment } from '../../environments/environment';

/** Une ligne de paroles synchronisee. */
export interface LyricLine {
  /** Temps en secondes. */
  time: number;
  text: string;
}

/**
 * LYRICS SYNCHRONISES (P1 V2 §13) — format LRC :
 *   [00:12.34] Premiere ligne de paroles
 * Le parseur accepte plusieurs timestamps par ligne, les centisecondes
 * ([mm:ss] ou [mm:ss.xx] ou [mm:ss:xx]) et ignore les balises de metadata
 * ([ar:], [ti:], [offset:...] — ce dernier est applique).
 * Architecture prete pour le mode karaoke : le composant n'a plus qu'a
 * surligner la ligne active selon player.position().
 */
@Injectable({ providedIn: 'root' })
export class LyricsService {

  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Cache par trackId (null = pas de paroles, pour eviter les refetch). */
  private cache = new Map<string, Observable<LyricLine[] | null>>();

  /** Paroles synchronisees d'une piste (null si absentes). */
  lyricsFor(trackId: string): Observable<LyricLine[] | null> {
    if (!trackId || trackId.startsWith('local:') || trackId.startsWith('yt-import-')) {
      return of(null);
    }
    let cached = this.cache.get(trackId);
    if (!cached) {
      cached = this.http.get<{ lyrics: string | null }>(`${this.apiUrl}/api/tracks/${trackId}/lyrics`).pipe(
        map(res => (res && res.lyrics ? LyricsService.parseLrc(res.lyrics) : null)),
        catchError(() => of(null)),
        shareReplay(1)
      );
      this.cache.set(trackId, cached);
    }
    return cached;
  }

  /** Efface le cache (apres enregistrement de nouvelles paroles). */
  invalidate(trackId: string): void {
    this.cache.delete(trackId);
  }

  /** Parseur LRC (statique — testable). */
  static parseLrc(raw: string): LyricLine[] | null {
    if (!raw || !raw.trim()) return null;
    const lines = raw.split(/\r?\n/);
    let offsetMs = 0;
    const out: LyricLine[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Offset global : [offset:+500] (millisecondes)
      const offsetMatch = trimmed.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
      if (offsetMatch) {
        offsetMs = Number(offsetMatch[1]);
        continue;
      }
      // Balises metadata ignorees : [ar:..] [ti:..] [al:..] [by:..] [length:..]
      if (/^\[(ar|ti|al|by|length|re|ve):/i.test(trimmed)) continue;

      // Un ou plusieurs timestamps en debut de ligne
      const stamps: number[] = [];
      let rest = trimmed;
      let m: RegExpExecArray | null;
      const stampRe = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*/;
      while ((m = stampRe.exec(rest)) !== null) {
        const min = Number(m[1]);
        const sec = Number(m[2]);
        const fracRaw = m[3] ?? '0';
        // [mm:ss.xx] (centiemes) OU [mm:ss:xxx] (millisecondes)
        const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
        stamps.push(min * 60 + sec + frac);
        rest = rest.slice(m[0].length);
      }

      if (!stamps.length) continue; // ligne de texte brut sans timestamp : ignoree
      const text = rest.trim();
      const timeShift = offsetMs / 1000;
      for (const s of stamps) {
        out.push({ time: Math.max(0, s + timeShift), text });
      }
    }

    if (!out.length) return null;
    out.sort((a, b) => a.time - b.time);
    return out;
  }
}
