import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';
import { ChartEntry, Track } from '../models/models';

/**
 * Charts hebdomadaires : top des pistes les plus ecoutees de la semaine
 * (agregation play_history, recompute horaire cote backend).
 * Top 10 mis en cache dans un signal pour les badges sur les cartes.
 */
@Injectable({ providedIn: 'root' })
export class ChartsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Map trackId -> rang, chargee une seule fois (badges "Top 10"). */
  readonly top10Ranks = signal<Map<string, number> | null>(null);

  private top10$?: Observable<ChartEntry[]> = null as unknown as Observable<ChartEntry[]>;

  /** Chart complet de la semaine (optionnellement filtre par pays). */
  getCharts(country?: string, limit = 20): Observable<ChartEntry[]> {
    const params: string[] = [`limit=${limit}`];
    if (country && country !== 'all') params.push(`country=${encodeURIComponent(country)}`);
    return this.http.get<ChartEntry[]>(`${this.apiUrl}/api/charts?${params.join('&')}`);
  }

  /** Pays disponibles dans le chart courant. */
  getChartCountries(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/api/charts/countries`);
  }

  /** Charge le top 10 global une seule fois (partage entre toutes les cartes). */
  ensureTop10Loaded(): void {
    if (this.top10Ranks() !== null || this.top10$) return;
    this.top10$ = this.getCharts(undefined, 10).pipe(shareReplay(1));
    this.top10$.subscribe({
      next: (entries) => {
        const map = new Map<string, number>();
        for (const e of entries) map.set(e.trackId, e.rank);
        this.top10Ranks.set(map);
      },
      error: () => this.top10Ranks.set(new Map())
    });
  }

  /** Rang Top 10 de la semaine pour une piste (null si hors top). */
  rankOf(track: Track): number | null {
    const map = this.top10Ranks();
    if (!map) return null;
    return map.get(track.id) ?? null;
  }
}
