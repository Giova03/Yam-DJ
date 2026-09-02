import { Component, inject, input, output, signal } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { ChartsService } from '../../services/charts.service';
import { OfflineService } from '../../services/offline.service';
import { AddToPlaylistComponent } from '../add-to-playlist/add-to-playlist.component';
import { ShareModalComponent } from '../share-modal/share-modal.component';
import { CommentsComponent } from '../comments/comments.component';
import { Track } from '../../models/models';

/** Carte d'une piste : lecture, ajout file, playlist, partage, commentaires, tip. */
@Component({
  selector: 'yam-track-card',
  standalone: true,
  imports: [AddToPlaylistComponent, ShareModalComponent, CommentsComponent],
  template: `
    <div class="yam-card p-4 group cursor-pointer" (click)="play.emit(track())" (dblclick)="player.play(track())">
      <div class="relative mb-3 aspect-square rounded-xl bg-gradient-to-br from-yam-card to-yam-surface overflow-hidden flex items-center justify-center">
        @if (track().coverUrl) {
          <img [src]="track().coverUrl" [alt]="track().title" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        } @else {
          <span class="text-4xl opacity-40">🎵</span>
        }
        @if (track().youtubeId) {
          <span class="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-red-600/90 text-white text-[10px] font-bold shadow" title="Lecture via le player YouTube integre">▶ YouTube</span>
        }
        @if (chartRank(); as rank) {
          <span class="absolute top-3 left-3 yam-badge bg-yam-gold/90 text-yam-dark border-none font-bold" title="Top 10 chart hebdo">
            🏆 #{{ rank }}
          </span>
        } @else {
          @if (isPlaying()) {
            <div class="absolute top-3 left-3 flex items-end gap-0.5 h-4">
              <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
            </div>
          }
        }
        <button (click)="player.play(track()); $event.stopPropagation()"
                class="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-yam-orange text-white flex items-center justify-center text-lg shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
          ▶
        </button>
      </div>
      <p class="font-semibold truncate group-hover:text-yam-orange transition">{{ track().title }}</p>
      <p class="text-white/50 text-sm truncate">{{ track().sourceArtist || track().artistName }}</p>
      <div class="flex items-center justify-between mt-2">
        <div class="flex gap-1.5 flex-wrap">
          @if (track().genre) { <span class="yam-badge">{{ track().genre }}</span> }
          @if (track().bpm) { <span class="yam-badge">{{ track().bpm }} BPM</span> }
        </div>
        <div class="flex items-center gap-2 text-white/40 text-xs">
          <button (click)="player.addToQueue(track()); $event.stopPropagation()" class="hover:text-white transition" title="Ajouter a la file">➕</button>
          <button (click)="openPlaylist(); $event.stopPropagation()" class="hover:text-white transition" title="Ajouter a une playlist">🗂</button>
          <button (click)="openShare(); $event.stopPropagation()" class="hover:text-white transition" title="Partager la piste">🔗</button>
          <button (click)="openComments(); $event.stopPropagation()" class="hover:text-yam-orange transition" title="Commentaires">💬</button>
          <button (click)="tip.emit(track()); $event.stopPropagation()" class="hover:text-yam-gold transition" title="Soutenir l'artiste">💰</button>
          @if (!track().youtubeId) {
            <button (click)="toggleDownload(); $event.stopPropagation()"
                    class="transition"
                    [class]="downloadState() === 'done' ? 'text-yam-green' : (downloadState() === 'loading' ? 'text-yam-gold animate-pulse' : 'hover:text-white')"
                    [title]="downloadTitle()">{{ downloadIcon() }}</button>
          }
          @if (track().youtubeId) {
            <a [href]="track().sourceUrl || ('https://www.youtube.com/watch?v=' + track().youtubeId)" target="_blank" rel="noopener"
               (click)="$event.stopPropagation()" class="hover:text-red-500 transition" title="Ouvrir sur YouTube">↗</a>
          }
          <span class="flex items-center gap-1">▶ {{ formatPlays(track().playCount) }}</span>
        </div>
      </div>
    </div>
    @if (downloadError(); as err) {
      <p class="text-yam-gold text-xs mt-1">{{ err }}</p>
    }
    <yam-add-to-playlist [visible]="playlistOpen()" [track]="track()" (close)="playlistOpen.set(false)" />
    <yam-share-modal [visible]="shareOpen()" [track]="track()" (close)="shareOpen.set(false)" />

    <!-- Modale commentaires (meme pattern que add-to-playlist / share) -->
    @if (commentsOpen()) {
      <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
           (click)="commentsOpen.set(false)">
        <div class="bg-yam-card rounded-3xl p-6 w-full max-w-lg border border-white/10 max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <div class="min-w-0">
              <h2 class="yam-title">💬 Commentaires</h2>
              <p class="text-white/50 text-sm mt-1 truncate">
                <b class="text-white">{{ track().title }}</b> — {{ track().artistName }}
              </p>
            </div>
            <button (click)="commentsOpen.set(false)" class="text-white/40 hover:text-white text-2xl leading-none">×</button>
          </div>
          <yam-comments [trackId]="track().id" />
        </div>
      </div>
    }
  `
})
export class TrackCardComponent {
  track = input.required<Track>();
  player = inject(PlayerService);
  auth = inject(AuthService);
  charts = inject(ChartsService);
  offline = inject(OfflineService);
  play = output<Track>();
  tip = output<Track>();
  playlistOpen = signal<boolean>(false);
  shareOpen = signal<boolean>(false);
  commentsOpen = signal<boolean>(false);
  downloadError = signal<string | null>(null);

  constructor() {
    // Charge le top 10 hebdo une seule fois (badge des cartes, partage entre instances)
    this.charts.ensureTop10Loaded();
  }

  // ============ TELECHARGEMENT HORS LIGNE ============

  downloadState(): 'none' | 'loading' | 'done' {
    if (this.offline.isDownloaded(this.track().id)) return 'done';
    if (this.offline.isDownloading(this.track().id)) return 'loading';
    return 'none';
  }

  downloadIcon(): string {
    const s = this.downloadState();
    return s === 'done' ? '✅' : s === 'loading' ? '⬇' : '📥';
  }

  downloadTitle(): string {
    const s = this.downloadState();
    if (s === 'done') return 'Telechargee hors ligne — clic pour supprimer';
    if (s === 'loading') return 'Telechargement Data-Lite en cours...';
    return 'Telecharger pour ecoute hors ligne (Data-Lite)';
  }

  async toggleDownload(): Promise<void> {
    const t = this.track();
    if (this.downloadState() === 'done') {
      await this.offline.removeDownload(t.id);
      return;
    }
    if (this.downloadState() === 'loading') return;
    if (!navigator.onLine) {
      this.downloadError.set('Connecte-toi a Internet pour telecharger — ensuite la piste restera disponible hors ligne.');
      setTimeout(() => this.downloadError.set(null), 4000);
      return;
    }
    const premium = !!this.auth.currentUser()?.premium;
    const res = await this.offline.downloadTrack(t, premium);
    if (!res.ok && res.error && res.error !== 'deja telecharge') {
      this.downloadError.set(res.error);
      setTimeout(() => this.downloadError.set(null), 4000);
    }
  }

  /** Rang Top 10 de la semaine (null si hors chart). */
  chartRank(): number | null {
    return this.charts.rankOf(this.track());
  }

  openPlaylist(): void {
    this.playlistOpen.set(true);
  }

  openShare(): void {
    this.shareOpen.set(true);
  }

  openComments(): void {
    this.commentsOpen.set(true);
  }

  isPlaying(): boolean {
    return this.player.currentTrack()?.id === this.track().id && this.player.isPlaying();
  }

  formatPlays(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }
}
