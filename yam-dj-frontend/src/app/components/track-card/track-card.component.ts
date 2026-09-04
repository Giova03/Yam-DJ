import { Component, inject, input, output } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { ChartsService } from '../../services/charts.service';
import { TrackMenuComponent } from '../track-variants/track-menu.component';
import { IconComponent } from '../icon/icon.component';
import { Track } from '../../models/models';

/**
 * CARTE D'UNE PISTE (V2 §07 — bruit reduit).
 * Visible : pochette, play, titre, artiste, UNE information utile.
 * Tout le reste (file, playlist, partage, commentaires, tip, telechargement,
 * YouTube) vit dans le menu ••• (yam-track-menu).
 */
@Component({
  selector: 'yam-track-card',
  standalone: true,
  imports: [TrackMenuComponent, IconComponent],
  template: `
    <div class="yam-card p-3.5 group cursor-pointer" (click)="play.emit(track())" (dblclick)="player.play(track())"
         (keydown.enter)="play.emit(track())" tabindex="0"
         [attr.aria-label]="'Ecouter ' + track().title + ' de ' + artistName()">
      <div class="relative mb-3 aspect-square rounded-2xl bg-gradient-to-br from-yam-card to-yam-surface overflow-hidden flex items-center justify-center">
        @if (track().coverUrl) {
          <img [src]="track().coverUrl" [alt]="track().title" loading="lazy" decoding="async"
               class="w-full h-full object-cover group-hover:scale-105 transition duration-700">
        } @else {
          <yam-icon name="music-note" [size]="34" class="opacity-30"/>
        }
        @if (track().youtubeId) {
          <span class="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-red-600/90 text-white text-[10px] font-bold shadow flex items-center gap-1" title="Lecture via le player YouTube integre"><yam-icon name="play" [size]="9" class="fill-current"/> YouTube</span>
        }
        @if (chartRank(); as rank) {
          <span class="absolute top-3 left-3 yam-badge bg-yam-gold/90 text-yam-ink border-none font-bold !text-yam-dark" title="Top 10 chart hebdo">
            <yam-icon name="trophy" [size]="12"/> #{{ rank }}
          </span>
        } @else if (isPlaying()) {
          <div class="absolute top-3 left-3 flex items-end gap-0.5 h-4" aria-hidden="true">
            <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
          </div>
        }
        <button (click)="player.play(track()); $event.stopPropagation()"
                class="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300"
                aria-label="Lire">
          <yam-icon name="play" [size]="18" class="fill-current translate-x-[1px]"/>
        </button>
      </div>
      <div class="flex items-start justify-between gap-1.5">
        <div class="min-w-0 flex-1">
          <p class="font-semibold truncate group-hover:text-yam-orange transition">{{ track().title }}</p>
          <p class="text-white/50 text-sm truncate">{{ artistName() }}</p>
        </div>
        <div class="shrink-0 -mt-1 -mr-1.5" (click)="$event.stopPropagation()">
          <yam-track-menu [track]="track()" (tip)="tip.emit($event)"/>
        </div>
      </div>
      <p class="text-white/40 text-xs yam-num mt-1.5 flex items-center gap-1.5">
        @if (track().genre) { <span class="yam-badge !text-[10px] !px-2 !py-0.5">{{ track().genre }}</span> }
        @else if (track().bpm) { <span>{{ track().bpm }} BPM</span> }
        <span class="flex items-center gap-1"><yam-icon name="play" [size]="10" class="fill-current"/>{{ formatPlays(track().playCount) }}</span>
      </p>
    </div>
  `
})
export class TrackCardComponent {
  track = input.required<Track>();
  player = inject(PlayerService);
  charts = inject(ChartsService);
  play = output<Track>();
  tip = output<Track>();

  constructor() {
    this.charts.ensureTop10Loaded();
  }

  artistName(): string {
    return this.track().sourceArtist || this.track().artistName || 'YAM DJ';
  }

  /** Rang Top 10 de la semaine (null si hors chart). */
  chartRank(): number | null {
    return this.charts.rankOf(this.track());
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
