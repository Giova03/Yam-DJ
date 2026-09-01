import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerService } from '../../services/player.service';

/**
 * BARRE DE LECTURE GLOBALE (bas d'ecran, style Spotify).
 * Play/Pause/Next/Prev + progression + volume + toggles
 * Data-Lite / Nightclub + banniere pub non intrusive (Phase 3.5).
 */
@Component({
  selector: 'yam-audio-player',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (player.currentTrack(); as track) {
      <div class="fixed bottom-0 left-0 right-0 z-50 bg-yam-surface/95 backdrop-blur-md border-t border-white/10">
        <!-- Banniere publicite non intrusive (jamais pour les Premium) -->
        @if (player.adPlaying()) {
          <div class="bg-yam-gold/15 border-b border-yam-gold/30 px-4 py-1.5 flex items-center justify-between gap-3 text-xs">
            <span class="text-yam-gold truncate">📣 {{ player.adText() }}</span>
            <div class="flex items-center gap-3 shrink-0">
              <a routerLink="/premium" class="text-yam-gold font-semibold hover:underline">Passe Premium</a>
              <button (click)="player.skipAd()" class="text-white/60 hover:text-white font-semibold" title="Passer la pub">Passer ⏭</button>
            </div>
          </div>
        }
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

          <!-- Infos piste -->
          <div class="flex items-center gap-3 min-w-0 w-1/4">
            <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center overflow-hidden shrink-0">
              @if (track.coverUrl) {
                <img [src]="track.coverUrl" [alt]="track.title" class="w-full h-full object-cover">
              } @else {
                <span class="text-xl">🎵</span>
              }
            </div>
            <div class="min-w-0">
              <p class="font-semibold truncate">{{ track.title }}</p>
              <p class="text-white/50 text-sm truncate">{{ track.artistName }}</p>
            </div>
          </div>

          <!-- Controles + progression -->
          <div class="flex-1 flex flex-col items-center gap-1">
            <div class="flex items-center gap-4">
              <button (click)="player.previous()" class="text-white/60 hover:text-white text-lg transition" title="Precedent">⏮</button>
              <button (click)="player.toggle()"
                      class="w-11 h-11 rounded-full bg-white text-yam-dark flex items-center justify-center text-xl font-bold hover:scale-105 active:scale-95 transition"
                      [disabled]="player.loading()">
                @if (player.loading()) {
                  <span class="animate-spin">◌</span>
                } @else if (player.isPlaying()) {
                  <span>⏸</span>
                } @else {
                  <span>▶</span>
                }
              </button>
              <button (click)="player.next()" class="text-white/60 hover:text-white text-lg transition" title="Suivant">⏭</button>
            </div>
            <div class="w-full flex items-center gap-2 text-xs text-white/50">
              <span>{{ player.formatTime(player.position()) }}</span>
              <input type="range" min="0" [max]="player.duration() || track.durationSec" [value]="player.position()"
                     (input)="onSeek($event)"
                     class="flex-1 h-1 accent-yam-orange cursor-pointer">
              <span>{{ player.formatTime(player.duration() || track.durationSec) }}</span>
            </div>
          </div>

          <!-- Toggles + volume -->
          <div class="flex items-center gap-3 w-1/4 justify-end">
            <button (click)="player.toggleDataLite()"
                    class="yam-badge cursor-pointer hover:bg-white/20"
                    [class]="player.dataLite() ? '!bg-yam-gold/20 !text-yam-gold border border-yam-gold/40' : ''"
                    title="Mode Data-Lite : 48 kbps pour economiser ta data (2G/3G)">
              📱 Data-Lite
            </button>
            <button (click)="player.toggleNightMode()"
                    class="yam-badge cursor-pointer hover:bg-white/20"
                    [class]="player.nightMode() ? '!bg-yam-orange/20 !text-yam-orange border border-yam-orange/40' : ''"
                    title="Mode Nightclub : bass boost + reverb club">
              🪩 Nightclub
            </button>
            <div class="hidden lg:flex items-center gap-2">
              <span class="text-white/50">🔊</span>
              <input type="range" min="0" max="1" step="0.05" [value]="player.volume()"
                     (input)="onVolume($event)"
                     class="w-20 h-1 accent-yam-orange cursor-pointer">
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class AudioPlayerComponent {
  player = inject(PlayerService);

  onSeek(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.player.seek(Number(value));
  }

  onVolume(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.player.setVolume(Number(value));
  }
}
