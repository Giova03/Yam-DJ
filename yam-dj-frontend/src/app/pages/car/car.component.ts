import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { PlayerService } from '../../services/player.service';
import { IconComponent } from '../../components/icon/icon.component';

/**
 * MODE VOITURE (P1 V2 §13) — interface EXTREMEMENT simple :
 * pochette, titre, artiste, precedent, play, next, volume.
 * Cibles tactiles generouses (>= 64 px), zero distraction, grand contraste.
 * Les controles ecran verrouille restent geres par MediaSession (service).
 */
@Component({
  selector: 'yam-car-page',
  standalone: true,
  imports: [IconComponent, DecimalPipe],
  template: `
    <div class="fixed inset-0 z-[70] bg-yam-dark flex flex-col items-center justify-between py-8 px-6 select-none"
         style="padding-top: max(2rem, env(safe-area-inset-top)); padding-bottom: max(2rem, env(safe-area-inset-bottom));"
         (keydown.escape)="exit()" role="dialog" aria-modal="true" aria-label="Mode voiture">

      <div class="yam-glow w-[34rem] h-[34rem] -top-24 left-1/2 -translate-x-1/2 opacity-40 fixed"></div>

      <!-- Sortie -->
      <button (click)="exit()" class="relative self-start flex items-center gap-2 text-white/60 hover:text-white text-sm font-semibold px-4 py-3 rounded-2xl">
        <yam-icon name="x" [size]="18"/> Quitter le mode voiture
      </button>

      @if (player.currentTrack(); as t) {
        <!-- Pochette -->
        <div class="relative w-56 h-56 sm:w-72 sm:h-72 rounded-[2rem] overflow-hidden border border-white/12 shadow-2xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/20">
          @if (t.coverUrl) {
            <img [src]="t.coverUrl" [alt]="t.title" class="w-full h-full object-cover">
          } @else {
            <span class="w-full h-full flex items-center justify-center text-yam-orange"><yam-icon name="disc" [size]="90"/></span>
          }
        </div>

        <!-- Titre -->
        <div class="text-center min-w-0 max-w-2xl">
          <h1 class="yam-display text-3xl leading-tight break-words">{{ t.title }}</h1>
          <p class="text-white/55 text-lg mt-2">{{ t.sourceArtist || t.artistName }}</p>
          <p class="yam-num text-white/35 text-sm mt-2">{{ player.formatTime(player.position()) }} / {{ player.formatTime(player.duration() || t.durationSec) }}</p>
        </div>

        <!-- Controles : 3 boutons enormes -->
        <div class="flex items-center justify-center gap-8 sm:gap-12">
          <button (click)="player.previous()" class="w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-white/15 flex items-center justify-center text-white/80 active:scale-90 active:bg-white/10 transition" aria-label="Piste précédente">
            <yam-icon name="skip-previous" [size]="38"]/>
          </button>
          <button (click)="player.toggle()" [disabled]="player.loading()"
                  class="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center shadow-2xl active:scale-90 transition" aria-label="Play ou pause">
            @if (player.loading()) { <yam-icon name="loader" [size]="40" class="animate-spin"/> }
            @else if (player.isPlaying()) { <yam-icon name="pause" [size]="40"/> }
            @else { <yam-icon name="play" [size]="40" class="fill-current translate-x-[3px]"/> }
          </button>
          <button (click)="player.next()" class="w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-white/15 flex items-center justify-center text-white/80 active:scale-90 active:bg-white/10 transition" aria-label="Piste suivante">
            <yam-icon name="skip-next" [size]="38"]/>
          </button>
        </div>

        <!-- Volume -->
        <div class="w-full max-w-md flex items-center gap-4 pb-4">
          <yam-icon name="volume" [size]="22" class="text-white/40"/>
          <input type="range" min="0" max="1" step="0.05" [value]="player.volume()"
                 (input)="onVolume($event)" class="flex-1 h-2 accent-yam-orange cursor-pointer" aria-label="Volume">
          <span class="yam-num text-white/40 text-sm w-10 text-right">{{ (player.volume() * 100) | number:'1.0-0' }}%</span>
        </div>
      } @else {
        <div class="text-center">
          <div class="flex justify-center mb-4 text-white/20"><yam-icon name="disc" [size]="64"/></div>
          <h1 class="yam-display text-2xl mb-2">Rien en lecture</h1>
          <p class="text-white/50">Lance un son, puis reviens en mode voiture.</p>
        </div>
      }
    </div>
  `
})
export class CarComponent {
  player = inject(PlayerService);
  private router = inject(Router);
  startedAt = signal(Date.now());

  exit(): void {
    this.router.navigate(['/']);
  }

  onVolume(event: Event): void {
    this.player.setVolume(Number((event.target as HTMLInputElement).value));
  }
}
