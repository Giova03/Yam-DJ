import { Component, inject, input, output, signal } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { AddToPlaylistComponent } from '../add-to-playlist/add-to-playlist.component';
import { Track } from '../../models/models';

/** Carte d'une piste : lecture, ajout file, playlist, tip. */
@Component({
  selector: 'yam-track-card',
  standalone: true,
  imports: [AddToPlaylistComponent],
  template: `
    <div class="yam-card p-4 group cursor-pointer" (click)="play.emit(track())" (dblclick)="player.play(track())">
      <div class="relative mb-3 aspect-square rounded-xl bg-gradient-to-br from-yam-card to-yam-surface overflow-hidden flex items-center justify-center">
        @if (track().coverUrl) {
          <img [src]="track().coverUrl" [alt]="track().title" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        } @else {
          <span class="text-4xl opacity-40">🎵</span>
        }
        <button (click)="player.play(track()); $event.stopPropagation()"
                class="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-yam-orange text-white flex items-center justify-center text-lg shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
          ▶
        </button>
        @if (isPlaying()) {
          <div class="absolute top-3 left-3 flex items-end gap-0.5 h-4">
            <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
          </div>
        }
      </div>
      <p class="font-semibold truncate group-hover:text-yam-orange transition">{{ track().title }}</p>
      <p class="text-white/50 text-sm truncate">{{ track().artistName }}</p>
      <div class="flex items-center justify-between mt-2">
        <div class="flex gap-1.5 flex-wrap">
          @if (track().genre) { <span class="yam-badge">{{ track().genre }}</span> }
          @if (track().bpm) { <span class="yam-badge">{{ track().bpm }} BPM</span> }
        </div>
        <div class="flex items-center gap-2 text-white/40 text-xs">
          <button (click)="player.addToQueue(track()); $event.stopPropagation()" class="hover:text-white transition" title="Ajouter a la file">➕</button>
          <button (click)="openPlaylist(); $event.stopPropagation()" class="hover:text-white transition" title="Ajouter a une playlist">🗂</button>
          <button (click)="tip.emit(track()); $event.stopPropagation()" class="hover:text-yam-gold transition" title="Soutenir l'artiste">💰</button>
          <span class="flex items-center gap-1">▶ {{ formatPlays(track().playCount) }}</span>
        </div>
      </div>
    </div>
    <yam-add-to-playlist [visible]="playlistOpen()" [track]="track()" (close)="playlistOpen.set(false)" />
  `
})
export class TrackCardComponent {
  track = input.required<Track>();
  player = inject(PlayerService);
  auth = inject(AuthService);
  play = output<Track>();
  tip = output<Track>();
  playlistOpen = signal<boolean>(false);

  openPlaylist(): void {
    this.playlistOpen.set(true);
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
