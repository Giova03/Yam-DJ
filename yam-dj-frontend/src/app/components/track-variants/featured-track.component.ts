import { Component, inject, input, output } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { TrackMenuComponent } from './track-menu.component';
import { IconComponent } from '../icon/icon.component';
import { Track } from '../../models/models';

/**
 * FEATURED TRACK — la vedette d'une composition asymetrique (V2 §05-3).
 * Grande pochette, titre Syne, meta essentielle, actions secondaires en •••.
 */
@Component({
  selector: 'yam-featured-track',
  standalone: true,
  imports: [TrackMenuComponent, IconComponent],
  template: `
    <article class="yam-card !rounded-3xl overflow-hidden group cursor-pointer relative h-full flex flex-col min-w-0"
             (click)="play.emit(track())" (keydown.enter)="play.emit(track())" tabindex="0"
             [attr.aria-label]="'Ecouter ' + track().title + ' de ' + artistName()">
      <div class="relative aspect-square overflow-hidden bg-gradient-to-br from-yam-card to-yam-surface">
        @if (track().coverUrl) {
          <img [src]="track().coverUrl" [alt]="track().title" loading="lazy" decoding="async"
               class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700">
        } @else {
          <div class="w-full h-full flex items-center justify-center text-white/15">
            <yam-icon name="music-note" [size]="72"/>
          </div>
        }
        <div class="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent pointer-events-none"></div>

        @if (track().youtubeId) {
          <span class="absolute top-4 left-4 px-2 py-0.5 rounded-full bg-red-600/90 text-white text-[10px] font-bold shadow flex items-center gap-1">
            <yam-icon name="play" [size]="9" class="fill-current"/> YouTube
          </span>
        }
        @if (isPlaying()) {
          <div class="absolute top-4 left-4 flex items-end gap-0.5 h-4" aria-hidden="true">
            <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
          </div>
        }

        <div class="absolute top-3 right-3" (click)="$event.stopPropagation()">
          <yam-track-menu [track]="track()" (tip)="tip.emit($event)"/>
        </div>

        <button class="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center shadow-xl
                        opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300"
                (click)="play.emit(track()); $event.stopPropagation()" aria-label="Lire">
          <yam-icon name="play" [size]="22" class="fill-current translate-x-[1px]"/>
        </button>
      </div>

      <div class="p-5 flex-1 flex flex-col gap-1.5">
        <p class="yam-kicker">{{ track().genre || 'Decouverte' }}</p>
        <h3 class="font-display font-bold text-xl leading-tight group-hover:text-yam-orange transition line-clamp-2">{{ track().title }}</h3>
        <p class="text-white/55 text-sm truncate">{{ artistName() }}</p>
        <p class="text-white/40 text-xs yam-num mt-auto pt-2 flex items-center gap-3">
          <span class="flex items-center gap-1"><yam-icon name="play" [size]="11" class="fill-current"/>{{ formatPlays(track().playCount) }}</span>
          @if (track().bpm) { <span>{{ track().bpm }} BPM</span> }
          @if (track().durationSec) { <span>{{ formatDuration(track().durationSec) }}</span> }
        </p>
      </div>
    </article>
  `
})
export class FeaturedTrackComponent {
  track = input.required<Track>();
  play = output<Track>();
  tip = output<Track>();
  player = inject(PlayerService);

  artistName(): string {
    return this.track().sourceArtist || this.track().artistName || 'YAM DJ';
  }

  isPlaying(): boolean {
    return this.player.currentTrack()?.id === this.track().id && this.player.isPlaying();
  }

  formatPlays(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }

  formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}
