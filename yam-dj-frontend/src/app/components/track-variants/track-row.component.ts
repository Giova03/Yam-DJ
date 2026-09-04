import { Component, inject, input, output } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { TrackMenuComponent } from './track-menu.component';
import { IconComponent } from '../icon/icon.component';
import { Track } from '../../models/models';

/**
 * TRACK ROW — ligne compacte pour listes editoriales (V2 §07) :
 * index optionnel, petite pochette, titre/artiste, UNE info, actions en •••.
 * Utilise par la home (decouverte, actualites), la page artiste, la radio.
 */
@Component({
  selector: 'yam-track-row',
  standalone: true,
  imports: [TrackMenuComponent, IconComponent],
  template: `
    <div class="group flex items-center gap-3 p-2 -mx-2 rounded-2xl hover:bg-white/5 transition cursor-pointer"
         (click)="play.emit(track())" (keydown.enter)="play.emit(track())" tabindex="0"
         [attr.aria-label]="'Ecouter ' + track().title + ' de ' + artistName()">
      @if (index() !== null) {
        <span class="yam-num w-6 text-center text-sm shrink-0"
              [class]="isPlaying() ? 'text-yam-orange' : 'text-white/35'">{{ index()! + 1 }}</span>
      }

      <div class="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/25 to-yam-gold/20 flex items-center justify-center">
        @if (track().coverUrl) {
          <img [src]="track().coverUrl" [alt]="track().title" loading="lazy" decoding="async" class="w-full h-full object-cover">
        } @else {
          <yam-icon name="music-note" [size]="18" class="text-white/30"/>
        }
        @if (isPlaying()) {
          <div class="absolute inset-0 bg-black/45 flex items-center justify-center" aria-hidden="true">
            <div class="flex items-end gap-0.5 h-3.5">
              <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
            </div>
          </div>
        }
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold truncate group-hover:text-yam-orange transition"
           [class.text-yam-orange]="isPlaying()">{{ track().title }}</p>
        <p class="text-xs text-white/45 truncate">{{ artistName() }}@if (track().genre) { · {{ track().genre }} }</p>
      </div>

      <span class="yam-num text-xs text-white/35 shrink-0 hidden sm:inline">{{ formatPlays(track().playCount) }} ecoutes</span>

      @if (track().youtubeId) {
        <span class="shrink-0 text-red-500/90" title="Lecture via YouTube" aria-label="YouTube"><yam-icon name="play" [size]="13" class="fill-current"/></span>
      }

      <div class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition" (click)="$event.stopPropagation()">
        <yam-track-menu [track]="track()" (tip)="tip.emit($event)"/>
      </div>
    </div>
  `
})
export class TrackRowComponent {
  track = input.required<Track>();
  index = input<number | null>(null);
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
}
