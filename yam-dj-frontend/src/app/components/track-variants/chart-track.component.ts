import { Component, inject, input, output } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { TrackMenuComponent } from './track-menu.component';
import { IconComponent } from '../icon/icon.component';
import { ChartEntry, Track } from '../../models/models';

/**
 * CHART TRACK — ligne de classement (V2 §05-4 / §08) :
 * numero en Syne, variation de la semaine, pochette, titre, ecoutes.
 * Sensation "magazine musical + competition + culture".
 */
@Component({
  selector: 'yam-chart-track',
  standalone: true,
  imports: [TrackMenuComponent, IconComponent],
  template: `
    <div class="group flex items-center gap-3 sm:gap-4 p-2.5 -mx-2.5 rounded-2xl hover:bg-white/5 transition cursor-pointer"
         (click)="play.emit(entry().track!)" (keydown.enter)="play.emit(entry().track!)" tabindex="0"
         [attr.aria-label]="'Position ' + entry().rank + ' : ' + entry().track?.title">
      <span class="yam-display text-2xl sm:text-3xl w-12 sm:w-14 text-center shrink-0 tabular-nums"
            [class]="entry().rank === 1 ? 'text-yam-orange' : 'text-white/30'"
            [class.opacity-90]="entry().rank === 1">{{ entry().rank }}</span>

      @if (entry().rank <= 3) {
        <span class="hidden sm:flex flex-col items-center gap-0.5 w-9 shrink-0" [attr.aria-label]="movementLabel()">
          @if (movement() === 'new') {
            <span class="text-[10px] font-extrabold yam-kicker !text-[9px]">NEW</span>
          } @else if (movement() === 'up') {
            <span class="flex items-center text-yam-green text-xs font-bold yam-num"><yam-icon name="trending-up" [size]="13"/>{{ entry().movement }}</span>
          } @else if (movement() === 'down') {
            <span class="flex items-center text-red-400/90 text-xs font-bold yam-num"><yam-icon name="trending-down" [size]="13"/>{{ -entry().movement! }}</span>
          } @else {
            <span class="text-white/25 text-xs">—</span>
          }
        </span>
      }

      <div class="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/25 to-yam-gold/20 flex items-center justify-center">
        @if (entry().track?.coverUrl) {
          <img [src]="entry().track?.coverUrl" [alt]="entry().track?.title" loading="lazy" decoding="async" class="w-full h-full object-cover">
        } @else {
          <yam-icon name="music-note" [size]="20" class="text-white/30"/>
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
           [class.text-yam-orange]="isPlaying()">{{ entry().track?.title }}</p>
        <p class="text-xs text-white/45 truncate">{{ artistName() }}</p>
      </div>

      <div class="text-right shrink-0 hidden sm:block">
        <p class="yam-num text-sm text-white/70">{{ formatPlays(entry().plays) }}</p>
        <p class="text-[10px] text-white/35">ecoutes cette semaine</p>
      </div>

      <div class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition" (click)="$event.stopPropagation()">
        <yam-track-menu [track]="entry().track!" (tip)="tip.emit($event)"/>
      </div>
    </div>
  `
})
export class ChartTrackComponent {
  entry = input.required<ChartEntry>();
  play = output<Track>();
  tip = output<Track>();
  player = inject(PlayerService);

  artistName(): string {
    const t = this.entry().track;
    return t?.sourceArtist || t?.artistName || 'YAM DJ';
  }

  isPlaying(): boolean {
    const t = this.entry().track;
    return !!t && this.player.currentTrack()?.id === t.id && this.player.isPlaying();
  }

  movement(): 'up' | 'down' | 'new' | 'same' {
    const m = this.entry().movement;
    if (m == null) return 'new';
    if (m > 0) return 'up';
    if (m < 0) return 'down';
    return 'same';
  }

  movementLabel(): string {
    switch (this.movement()) {
      case 'new': return 'Nouvelle entree cette semaine';
      case 'up': return 'Monte de ' + this.entry().movement + ' places';
      case 'down': return 'Descend de ' + (-this.entry().movement!) + ' places';
      default: return 'Position stable';
    }
  }

  formatPlays(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }
}
