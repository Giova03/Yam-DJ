import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrackService } from '../../services/track.service';
import { AuthService } from '../../services/auth.service';
import { PlayerService } from '../../services/player.service';
import { Track } from '../../models/models';

/**
 * « TON ANNEE EN SONS » — statistiques d'ecoute personnalisees (Wrapped-like) :
 * minutes ecoutees, top artistes, top genres, top sons — calculees depuis
 * l'historique d'ecoute + compteur data (« Ta data, ta maniere »).
 */
@Component({
  selector: 'yam-stats-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-4xl mx-auto px-4 pt-8 pb-12">

      <div class="text-center mb-10">
        <p class="yam-gradient-text font-display font-extrabold text-3xl md:text-4xl">Ton annee en sons 🎧</p>
        <p class="text-white/50 mt-2">Ce que tes oreilles ont fait de mieux.</p>
      </div>

      @if (loading()) {
        <div class="yam-card p-12 text-center text-white/40">
          <span class="inline-block w-6 h-6 border-2 border-yam-orange border-t-transparent rounded-full animate-spin"></span>
          <p class="mt-3">Calcul de tes stats...</p>
        </div>
      } @else if (!history().length) {
        <div class="yam-card p-12 text-center">
          <div class="text-5xl mb-4">🎼</div>
          <p class="font-semibold mb-2">Pas encore d'ecoutes</p>
          <p class="text-white/50 text-sm mb-6">Ecoute quelques sons, reviens ici et decouvre ton profil d'auditeur.</p>
          <a routerLink="/" class="yam-btn-primary inline-block">Decouvrir des sons</a>
        </div>
      } @else {
        <!-- Cartes chiffres -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div class="yam-card p-5 text-center">
            <p class="text-3xl font-black text-yam-orange">{{ history().length }}</p>
            <p class="text-white/40 text-xs mt-1">sons ecoutes</p>
          </div>
          <div class="yam-card p-5 text-center">
            <p class="text-3xl font-black text-yam-gold">{{ minutes() }}</p>
            <p class="text-white/40 text-xs mt-1">minutes environ</p>
          </div>
          <div class="yam-card p-5 text-center">
            <p class="text-3xl font-black text-yam-green">{{ topArtist()?.name || '—' }}</p>
            <p class="text-white/40 text-xs mt-1">artiste prefere</p>
          </div>
          <div class="yam-card p-5 text-center">
            <p class="text-3xl font-black">{{ topGenre()?.name || '—' }}</p>
            <p class="text-white/40 text-xs mt-1">genre prefere</p>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <!-- Top artistes -->
          <div class="yam-card p-5">
            <h2 class="font-bold mb-4">🎤 Tes artistes</h2>
            <div class="space-y-3">
              @for (a of artists(); track a.name) {
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="truncate">{{ a.name }}</span>
                    <span class="text-white/40 tabular-nums">{{ a.plays }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-yam-orange to-yam-gold"
                         [style.width.%]="bar(a.plays, artists()[0].plays)"></div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Top genres -->
          <div class="yam-card p-5">
            <h2 class="font-bold mb-4">🎶 Tes genres</h2>
            <div class="space-y-3">
              @for (g of genres(); track g.name) {
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="truncate">{{ g.name }}</span>
                    <span class="text-white/40 tabular-nums">{{ g.plays }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-yam-gold to-yam-orange"
                         [style.width.%]="bar(g.plays, genres()[0].plays)"></div>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Top sons -->
        <div class="yam-card p-5 mt-6">
          <h2 class="font-bold mb-4">🔥 Tes sons les plus ecoutes</h2>
          <div class="space-y-2">
            @for (t of topTracks(); track t.track.id; let i = $index) {
              <button (click)="playTop(t.track)"
                      class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left transition">
                <span class="w-7 text-center font-black text-yam-orange shrink-0">{{ i + 1 }}</span>
                @if (t.track.coverUrl) {
                  <img [src]="t.track.coverUrl" [alt]="t.track.title" class="w-11 h-11 rounded-lg object-cover shrink-0">
                } @else {
                  <div class="w-11 h-11 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center shrink-0">🎵</div>
                }
                <div class="min-w-0 flex-1">
                  <p class="font-medium truncate text-sm">{{ t.track.title }}</p>
                  <p class="text-white/40 text-xs truncate">{{ t.track.artistName }}</p>
                </div>
                <span class="text-white/40 text-xs tabular-nums shrink-0">{{ t.plays }}×</span>
              </button>
            }
          </div>
        </div>

        <!-- Data -->
        <div class="yam-card p-5 mt-6">
          <h2 class="font-bold mb-2">📱 Ta data, ta maniere</h2>
          <p class="text-white/50 text-sm">
            Aujourd'hui : <b class="text-yam-orange">{{ dataLabel() }}</b> d'ecoute estimes.
            Le mode Data-Lite consomme <b>3 fois moins</b> que la qualite standard (48 kbps) —
            active-le depuis le lecteur pour faire durer ton forfait.
          </p>
        </div>

        <p class="text-center text-white/30 text-xs mt-8">
          Partage tes stats avec tes potes — « yaka montrer qui ecoute le mieux » 🇧🇫
        </p>
      }
    </div>
  `
})
export class StatsComponent implements OnInit {
  private trackService = inject(TrackService);
  private auth = inject(AuthService);
  player = inject(PlayerService);

  history = signal<Track[]>([]);
  loading = signal(true);

  artists = signal<{ name: string; plays: number }[]>([]);
  genres = signal<{ name: string; plays: number }[]>([]);
  topTracks = signal<{ track: Track; plays: number }[]>([]);

  ngOnInit(): void {
    if (!this.auth.isLoggedIn()) {
      this.history.set([]);
      this.loading.set(false);
      return;
    }
    this.trackService.history(80).subscribe({
      next: (tracks: Track[]) => {
        this.history.set(tracks || []);
        this.compute();
        this.loading.set(false);
      },
      error: () => {
        this.history.set([]);
        this.loading.set(false);
      }
    });
  }

  private compute(): void {
    const list = this.history();
    const byArtist = new Map<string, number>();
    const byGenre = new Map<string, number>();
    const byTrack = new Map<string, { track: Track; plays: number }>();

    list.forEach(t => {
      const artist = t.artistName || t.sourceArtist || 'Inconnu';
      byArtist.set(artist, (byArtist.get(artist) || 0) + 1);
      const genre = t.genre || 'Autre';
      byGenre.set(genre, (byGenre.get(genre) || 0) + 1);
      if (byTrack.has(t.id)) {
        byTrack.get(t.id)!.plays++;
      } else {
        byTrack.set(t.id, { track: t, plays: 1 });
      }
    });

    const sort = (m: Map<string, number>) =>
      [...m.entries()].map(([name, plays]) => ({ name, plays }))
        .sort((a, b) => b.plays - a.plays).slice(0, 6);

    this.artists.set(sort(byArtist));
    this.genres.set(sort(byGenre));
    this.topTracks.set([...byTrack.values()].sort((a, b) => b.plays - a.plays).slice(0, 10));
  }

  topArtist() { return this.artists()[0]; }

  /** Lance un des sons les plus ecoutes (file = top complet). */
  playTop(track: Track): void {
    this.player.play(track, this.topTracks().map(t => t.track));
  }
  topGenre() { return this.genres()[0]; }

  minutes(): number {
    const totalSec = this.history().reduce((sum, t) => sum + (t.durationSec || 180), 0);
    return Math.round(totalSec / 60);
  }

  bar(plays: number, max: number): number {
    return max ? Math.max(6, Math.round((plays / max) * 100)) : 0;
  }

  dataLabel(): string {
    const mo = this.player.dataUsedMo();
    if (mo < 1) return `${Math.round(mo * 1024)} Ko`;
    return `${mo.toFixed(1)} Mo`;
  }
}
