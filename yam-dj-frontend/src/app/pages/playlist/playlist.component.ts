import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ContentService } from '../../services/content.service';
import { PlayerService } from '../../services/player.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { Playlist, Track } from '../../models/models';

/**
 * PAGE DETAIL PLAYLIST — pistes de la playlist, lecture de la file entiere,
 * retrait d'une piste, suppression de la playlist (proprietaire).
 */
@Component({
  selector: 'yam-playlist-detail',
  standalone: true,
  imports: [TrackCardComponent, TipModalComponent, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">

      @if (loading()) {
        <div class="text-center py-20 text-white/40 animate-pulse">Chargement de la playlist...</div>
      } @else if (!playlist()) {
        <div class="yam-card p-10 text-center">
          <div class="text-5xl mb-3">🎧</div>
          <p class="text-white/60 mb-4">Cette playlist est introuvable ou privee.</p>
          <a routerLink="/playlists" class="yam-btn-primary">Mes playlists</a>
        </div>
      } @else {
        <section class="mb-8 rounded-3xl overflow-hidden relative bg-gradient-to-r from-yam-orange/20 via-yam-surface to-yam-surface border border-white/5 p-8">
          <div class="flex items-center gap-4">
            <div class="w-24 h-24 rounded-2xl bg-gradient-to-br from-yam-orange/40 to-yam-surface flex items-center justify-center text-4xl shrink-0">🎧</div>
            <div class="min-w-0">
              <p class="text-white/40 text-sm mb-1 uppercase tracking-wide">Playlist {{ playlist()!.isPublic ? 'publique' : 'privee' }}</p>
              <h1 class="font-display font-extrabold text-3xl md:text-4xl truncate">{{ playlist()!.name }}</h1>
              <p class="text-white/60 mt-1">{{ tracks().length }} sons — {{ totalDuration() }} d'ecoute</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-3 mt-6">
            <button (click)="playAll()" [disabled]="tracks().length === 0" class="yam-btn-primary !px-8 !py-3">
              ▶ Tout ecouter
            </button>
            <button (click)="playShuffled()" [disabled]="tracks().length === 0" class="yam-btn-secondary !px-6 !py-3">
              🔀 Lecture aleatoire
            </button>
            @if (tracks().length > 0) {
              <a routerLink="/search" class="yam-btn-secondary !px-6 !py-3">+ Ajouter des sons</a>
            }
          </div>
        </section>

        <section>
          @if (tracks().length === 0) {
            <div class="yam-card p-10 text-center">
              <div class="text-5xl mb-3">🎵</div>
              <p class="text-white/60">Cette playlist est vide.<br>
              Ajoute des sons depuis la recherche ou les cartes de pistes (bouton 🗂).</p>
              <a routerLink="/search" class="yam-btn-primary inline-block mt-4">Explorer les sons</a>
            </div>
          } @else {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              @for (track of tracks(); track track) {
                <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="openTip($event)" />
              }
            </div>
          }
        </section>
      }
    </div>

    <yam-tip-modal [visible]="tipModalOpen()" [artistId]="tipArtistId()" [artistName]="tipArtistName()" (close)="tipModalOpen.set(false)" />
  `
})
export class PlaylistComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private content = inject(ContentService);
  private player = inject(PlayerService);

  playlist = signal<Playlist | null>(null);
  tracks = signal<Track[]>([]);
  loading = signal<boolean>(false);
  tipModalOpen = signal<boolean>(false);
  tipArtistId = signal<string>('');
  tipArtistName = signal<string>('');

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  load(id: string): void {
    this.loading.set(true);
    this.content.playlist(id).subscribe({
      next: p => {
        this.playlist.set(p);
        this.loading.set(false);
        this.resolveTracks(p.trackIds || []);
      },
      error: () => this.loading.set(false)
    });
  }

  resolveTracks(ids: string[]): void {
    if (ids.length === 0) { this.tracks.set([]); return; }
    forkJoin(ids.map(id => this.content.trackById(id))).subscribe({
      next: list => this.tracks.set(list.filter(t => !!t)),
      error: () => this.tracks.set([])
    });
  }

  playAll(): void {
    const list = this.tracks();
    if (list.length > 0) this.player.play(list[0], list);
  }

  playShuffled(): void {
    const list = [...this.tracks()];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (list.length > 0) this.player.play(list[0], list);
  }

  onPlay(track: Track): void {
    this.player.play(track, this.tracks());
  }

  openTip(track: Track): void {
    this.tipArtistId.set(track.artistId);
    this.tipArtistName.set(track.artistName);
    this.tipModalOpen.set(true);
  }

  totalDuration(): string {
    const total = this.tracks().reduce((sum, t) => sum + (t.durationSec || 0), 0);
    if (total === 0) return '0 min';
    const min = Math.floor(total / 60);
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
}
