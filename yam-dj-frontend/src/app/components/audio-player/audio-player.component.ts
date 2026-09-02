import { Component, ElementRef, AfterViewInit, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerService } from '../../services/player.service';
import { AmbienceService } from '../../services/ambience.service';
import { Track } from '../../models/models';

/**
 * BARRE DE LECTURE GLOBALE (bas d'ecran, style Spotify adapte mobile).
 *
 * CORRECTIFS (V2) :
 *  - Bouton FERMER (arret complet) : la petite fenetre du bas est enfin
 *    fermable.
 *  - YouTube : hote persistant hors du @if — l'iframe ne se recharge
 *    PLUS a chaque re-render (cause de la lecture en boucle au debut).
 *  - Progression + duree reelles sur YouTube (polling service).
 *  - Controles ecran verrouille via MediaSession (cote service).
 *
 * NOUVEAUTES : file d'attente visible, shuffle/repetition, vitesse,
 * equalisateur, minuterie sommeil, mode ambiance, compteur data,
 * mode audio YouTube (video repliee).
 */
@Component({
  selector: 'yam-audio-player',
  standalone: true,
  imports: [RouterLink],
  template: `
    <!-- ================= HOTE YOUTUBE PERSISTANT =================
         Toujours dans le DOM (jamais detruit par un @if) : c'est la cle du
         fix "musique qui redemarre en boucle". L'API IFrame officielle cree
         le player dedans ; on ne fait que le montrer / cacher. -->
    <div class="fixed z-40 left-3 bottom-[92px] w-[224px] sm:w-[256px] transition-all duration-300"
         [class.opacity-0]="!showVideo()"
         [class.pointer-events-none]="!showVideo()"
         [class.translate-y-2]="!showVideo()">
      <div #ytHost class="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl"
           [attr.aria-label]="'Lecteur video YouTube'"></div>
      @if (showVideo()) {
        <div class="flex items-center justify-between mt-1.5 px-1">
          <span class="text-[10px] font-bold text-red-500/90">▶ YouTube</span>
          <div class="flex gap-2">
            <a [href]="ytWatchUrl()" target="_blank" rel="noopener"
               class="text-[10px] font-semibold text-white/50 hover:text-white">Ouvrir ↗</a>
            <button (click)="player.toggleYoutubeAudioOnly()"
                    class="text-[10px] font-semibold text-yam-orange hover:underline">Mode audio 🎧</button>
          </div>
        </div>
      }
    </div>

    @if (player.currentTrack(); as track) {
      <div class="fixed bottom-0 left-0 right-0 z-50 bg-yam-surface/95 backdrop-blur-md border-t border-white/10"
           style="padding-bottom: env(safe-area-inset-bottom)">

        <!-- Banniere publicite non intrusive (jamais pour les Premium) -->
        @if (player.adPlaying()) {
          <div class="bg-yam-gold/15 border-b border-yam-gold/30 px-4 py-1.5 flex items-center justify-between gap-3 text-xs">
            <span class="text-yam-gold truncate">📣 {{ player.adText() }}</span>
            <div class="flex items-center gap-3 shrink-0">
              <a routerLink="/premium" class="text-yam-gold font-semibold hover:underline">Passe Premium</a>
              <button (click)="player.skipAd()" class="text-white/60 hover:text-white font-semibold">Passer ⏭</button>
            </div>
          </div>
        }

        <!-- ============ PANNEAU FILE D'ATTENTE (coulissant) ============ -->
        @if (player.queueOpen()) {
          <div class="max-h-[45vh] overflow-y-auto border-b border-white/10 bg-yam-dark/98">
            <div class="max-w-7xl mx-auto px-4 py-3">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-sm">
                  📋 File d'attente
                  <span class="text-white/40 font-normal">{{ player.queue().length }} pistes</span>
                  @if (player.radioMode(); as radio) {
                    <span class="ml-2 yam-badge !bg-yam-orange/20 !text-yam-orange">📡 Radio {{ radioLabel(radio) }}</span>
                  }
                </h3>
                <div class="flex items-center gap-3">
                  @if (player.radioMode()) {
                    <button (click)="player.stopRadio()" class="text-xs text-white/50 hover:text-white">Stop radio</button>
                  }
                  <button (click)="player.queueOpen.set(false)" class="text-white/50 hover:text-white text-lg leading-none" aria-label="Fermer la file">✕</button>
                </div>
              </div>
              <div class="space-y-1">
                @for (q of player.queue(); track q.id; let i = $index) {
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                       [class]="q.id === track.id ? 'bg-yam-orange/15' : 'hover:bg-white/5'">
                    <button (click)="playFromQueue(i)" class="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center">
                      @if (q.coverUrl) {
                        <img [src]="q.coverUrl" [alt]="q.title" class="w-full h-full object-cover">
                      } @else {
                        <span class="text-sm">🎵</span>
                      }
                    </button>
                    <button (click)="playFromQueue(i)" class="min-w-0 flex-1 text-left">
                      <p class="text-sm font-medium truncate" [class.text-yam-orange]="q.id === track.id">{{ q.title }}</p>
                      <p class="text-xs text-white/40 truncate">{{ q.artistName || q.sourceArtist || 'YAM DJ' }}</p>
                    </button>
                    <span class="text-[10px] text-white/30 shrink-0 hidden sm:inline">{{ labelFor(q) }}</span>
                    <div class="flex flex-col shrink-0">
                      <button (click)="moveUp(i)" [disabled]="i === 0"
                              class="text-white/30 hover:text-white text-[10px] leading-none py-0.5 disabled:opacity-20" aria-label="Monter">▲</button>
                      <button (click)="moveDown(i)" [disabled]="i === player.queue().length - 1"
                              class="text-white/30 hover:text-white text-[10px] leading-none py-0.5 disabled:opacity-20" aria-label="Descendre">▼</button>
                    </div>
                    <button (click)="player.removeFromQueue(q.id)" [disabled]="q.id === track.id"
                            class="text-white/30 hover:text-red-400 text-xs shrink-0 px-1 disabled:opacity-20" aria-label="Retirer">✕</button>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- ============ MENU POPUP (EQ, vitesse, dodo, ambiance) ============ -->
        @if (menuOpen()) {
          <div class="absolute bottom-full right-2 mb-2 w-[300px] max-w-[92vw] yam-card p-4 shadow-2xl max-h-[70vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-sm">⚙️ Options de lecture</h3>
              <button (click)="menuOpen.set(false)" class="text-white/40 hover:text-white" aria-label="Fermer">✕</button>
            </div>

            <!-- Vitesse -->
            <p class="text-xs text-white/40 mb-1.5">Vitesse de lecture (VLC)</p>
            <div class="flex gap-1.5 mb-4 flex-wrap">
              @for (s of [0.75, 1, 1.25, 1.5, 2]; track s) {
                <button (click)="player.setSpeed(s)"
                        class="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                        [class]="player.speed() === s ? 'bg-yam-orange text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'">
                  {{ s }}×
                </button>
              }
            </div>

            <!-- Minuterie sommeil -->
            <p class="text-xs text-white/40 mb-1.5">Dodo musique (minuterie sommeil)</p>
            @if (player.sleepRemaining() != null) {
              <div class="flex items-center justify-between mb-4">
                <span class="text-sm text-yam-gold font-semibold">🌙 {{ sleepLabel() }}</span>
                <button (click)="player.clearSleepTimer()" class="text-xs text-white/50 hover:text-white underline">Annuler</button>
              </div>
            } @else {
              <div class="flex gap-1.5 mb-4 flex-wrap">
                @for (m of [15, 30, 60, 90]; track m) {
                  <button (click)="player.startSleepTimer(m)"
                          class="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/60 hover:bg-white/20 transition">
                    {{ m }} min
                  </button>
                }
              </div>
            }

            <!-- Mode ambiance -->
            <p class="text-xs text-white/40 mb-1.5">Mode ambiance (sons gratuits hors ligne)</p>
            <div class="flex gap-1.5 mb-4 flex-wrap">
              @for (a of ambienceOpts; track a.id) {
                <button (click)="ambience.toggle(a.id)"
                        class="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                        [class]="ambience.active() === a.id ? 'bg-yam-green text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'">
                  {{ a.icon }} {{ a.label }}
                </button>
              }
            </div>

            <!-- Equalisateur -->
            <p class="text-xs text-white/40 mb-1.5">Equalisateur</p>
            <div class="flex gap-1.5 mb-3 flex-wrap">
              @for (p of eqPresetNames; track p) {
                <button (click)="player.setEqPreset(p)"
                        class="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                        [class]="player.eqPreset() === p ? 'bg-yam-orange text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'">
                  {{ p }}
                </button>
              }
            </div>
            <div class="space-y-1.5 mb-4">
              @for (b of eqBands; track b.freq; let i = $index) {
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-white/40 w-10 shrink-0">{{ b.label }}</span>
                  <input type="range" min="-8" max="8" step="1" [value]="player.eqGains()[i]"
                         (input)="onEqBand(i, $event)"
                         class="flex-1 h-1 accent-yam-orange cursor-pointer">
                  <span class="text-[10px] text-white/40 w-8 text-right shrink-0">{{ player.eqGains()[i] > 0 ? '+' : '' }}{{ player.eqGains()[i] }}</span>
                </div>
              }
            </div>

            <!-- Compteur data -->
            <div class="text-xs text-white/40 border-t border-white/10 pt-3 flex items-center justify-between">
              <span>📱 Ta data, ta maniere</span>
              <span class="text-white/60 font-semibold">{{ dataLabel() }}</span>
            </div>
          </div>
        }

        <!-- ============ BARRE PRINCIPALE ============ -->
        <div class="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3 sm:gap-4">

          <!-- Infos piste (cliquable si piste de la plateforme) -->
          <div class="flex items-center gap-3 min-w-0 flex-1 sm:flex-none sm:w-1/4">
            <div class="w-11 h-11 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center overflow-hidden shrink-0 relative">
              @if (track.coverUrl) {
                <img [src]="track.coverUrl" [alt]="track.title" class="w-full h-full object-cover">
              } @else {
                <span class="text-xl">🎵</span>
              }
              @if (player.isYouTube() && player.youtubeAudioOnly()) {
                <span class="absolute bottom-0.5 right-0.5 text-[9px] font-bold text-red-500/90 bg-black/60 rounded px-1">▶</span>
              }
            </div>
            <div class="min-w-0">
              <p class="font-semibold truncate text-sm">{{ track.title }}</p>
              <p class="text-white/50 text-xs truncate">
                @if (track.youtubeId) { <span class="text-red-500/90 font-semibold">YouTube</span> · }
                {{ track.sourceArtist || track.artistName }}
              </p>
            </div>
          </div>

          <!-- Controles + progression -->
          <div class="hidden sm:flex flex-1 flex-col items-center gap-1">
            <div class="flex items-center gap-3 sm:gap-4">
              <button (click)="player.toggleShuffle()" [class.text-yam-orange]="player.shuffle()"
                      class="text-white/50 hover:text-white text-sm transition" title="Lecture aleatoire">🔀</button>
              <button (click)="player.previous()" class="text-white/60 hover:text-white text-lg transition" title="Precedent">⏮</button>
              <button (click)="player.toggle()"
                      class="w-11 h-11 rounded-full bg-white text-yam-dark flex items-center justify-center text-xl font-bold hover:scale-105 active:scale-95 transition"
                      [disabled]="player.loading()">
                @if (player.loading()) { <span class="animate-spin">◌</span> }
                @else if (player.isPlaying()) { <span>⏸</span> }
                @else { <span>▶</span> }
              </button>
              <button (click)="player.next()" class="text-white/60 hover:text-white text-lg transition" title="Suivant">⏭</button>
              <button (click)="player.cycleRepeat()" [class.text-yam-orange]="player.repeat() !== 'off'"
                      class="text-white/50 hover:text-white text-sm transition relative"
                      title="Repetition">
                🔁
                @if (player.repeat() === 'one') {
                  <span class="absolute -top-1 -right-1 text-[9px] bg-yam-orange text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">1</span>
                }
              </button>
            </div>
            <div class="w-full flex items-center gap-2 text-xs text-white/50">
              <span class="tabular-nums w-10 text-right">{{ player.formatTime(player.position()) }}</span>
              <input type="range" min="0" [max]="player.duration() || track.durationSec || 100" [value]="player.position()"
                     (input)="onSeek($event)"
                     class="flex-1 h-1.5 accent-yam-orange cursor-pointer">
              <span class="tabular-nums w-10">{{ player.formatTime(player.duration() || track.durationSec) }}</span>
            </div>
          </div>

          <!-- Toggles + volume + menu + fermer -->
          <div class="flex items-center gap-2 justify-end shrink-0">
            @if (!player.isYouTube()) {
              <button (click)="player.toggleDataLite()"
                      class="yam-badge cursor-pointer hover:bg-white/20 hidden md:inline-flex"
                      [class]="player.dataLite() ? '!bg-yam-gold/20 !text-yam-gold border border-yam-gold/40' : ''"
                      title="Mode Data-Lite : 48 kbps, 3x moins de data">
                📱
              </button>
              <button (click)="player.toggleNightMode()"
                      class="yam-badge cursor-pointer hover:bg-white/20 hidden md:inline-flex"
                      [class]="player.nightMode() ? '!bg-yam-orange/20 !text-yam-orange border border-yam-orange/40' : ''"
                      title="Mode Nightclub : bass boost + reverb club">
                🪩
              </button>
            } @else {
              <button (click)="player.toggleYoutubeAudioOnly()"
                      class="yam-badge cursor-pointer hover:bg-white/20 hidden md:inline-flex"
                      [class]="player.youtubeAudioOnly() ? '!bg-yam-green/20 !text-yam-green border border-yam-green/40' : ''"
                      title="Mode audio : video repliee, son uniquement (economie batterie)">
                🎧
              </button>
            }

            <!-- File d'attente -->
            <button (click)="player.queueOpen.set(!player.queueOpen())"
                    class="text-white/50 hover:text-white text-base transition relative"
                    title="File d'attente" aria-label="File d'attente">
              📋
              @if (player.radioMode()) {
                <span class="absolute -top-1 -right-1 w-2 h-2 bg-yam-orange rounded-full animate-pulse"></span>
              }
            </button>

            <!-- Menu options -->
            <button (click)="menuOpen.set(!menuOpen())"
                    class="text-white/50 hover:text-white text-base transition"
                    title="Options (EQ, vitesse, dodo)" aria-label="Options">⚙️</button>

            <div class="hidden lg:flex items-center gap-2">
              <span class="text-white/50">🔊</span>
              <input type="range" min="0" max="1" step="0.05" [value]="player.volume()"
                     (input)="onVolume($event)"
                     class="w-20 h-1 accent-yam-orange cursor-pointer">
            </div>

            <!-- FERMER la barre de lecture (arret complet) -->
            <button (click)="player.stop()"
                    class="text-white/40 hover:text-red-400 transition text-base font-bold px-1.5"
                    title="Fermer le lecteur" aria-label="Fermer le lecteur">✕</button>
          </div>
        </div>

        <!-- Controles mobiles compacts (progression + play) -->
        <div class="sm:hidden px-3 pb-2">
          <div class="flex items-center gap-2 text-[10px] text-white/50">
            <span class="tabular-nums w-8">{{ player.formatTime(player.position()) }}</span>
            <input type="range" min="0" [max]="player.duration() || track.durationSec || 100" [value]="player.position()"
                   (input)="onSeek($event)"
                   class="flex-1 h-1.5 accent-yam-orange cursor-pointer">
            <span class="tabular-nums w-8">{{ player.formatTime(player.duration() || track.durationSec) }}</span>
            <button (click)="player.toggle()"
                    class="w-9 h-9 rounded-full bg-white text-yam-dark flex items-center justify-center text-lg font-bold shrink-0 -mt-1"
                    [disabled]="player.loading()">
              @if (player.loading()) { <span class="animate-spin text-sm">◌</span> }
              @else if (player.isPlaying()) { ⏸ } @else { ▶ }
            </button>
          </div>
          <div class="flex items-center justify-center gap-4 mt-1">
            <button (click)="player.toggleShuffle()" [class.text-yam-orange]="player.shuffle()"
                    class="text-white/40 text-xs">🔀</button>
            <button (click)="player.previous()" class="text-white/60 text-sm">⏮</button>
            <button (click)="player.next()" class="text-white/60 text-sm">⏭</button>
            <button (click)="player.cycleRepeat()" [class.text-yam-orange]="player.repeat() !== 'off'"
                    class="text-white/40 text-xs">🔁</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class AudioPlayerComponent implements AfterViewInit {
  player = inject(PlayerService);
  ambience = inject(AmbienceService);

  menuOpen = signal(false);

  readonly ambienceOpts = [
    { id: 'rain' as const, label: 'Pluie', icon: '🌧' },
    { id: 'ocean' as const, label: 'Ocean', icon: '🌊' },
    { id: 'wind' as const, label: 'Vent', icon: '🍃' }
  ];

  readonly eqPresetNames = Object.keys(this.player.EQ_PRESETS);
  readonly eqBands = [
    { freq: 60, label: '60 Hz' },
    { freq: 250, label: '250 Hz' },
    { freq: 1000, label: '1 kHz' },
    { freq: 4000, label: '4 kHz' },
    { freq: 12000, label: '12 kHz' }
  ];

  private ytHostRef = viewChild<ElementRef<HTMLDivElement>>('ytHost');

  constructor() {
    // Suspend la video si l'onglet est cache (economie batterie/data)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.player.isYouTube() && this.player.isPlaying()) {
        // On garde le son (arriere-plan) : YouTube iframe continue en cache.
      }
    });
  }

  ngAfterViewInit(): void {
    // Le hote est persistant : enregistre-le des maintenant. Le service
    // y creera le player YouTube au premier besoin (jamais recharge).
    const host = this.ytHostRef()?.nativeElement || null;
    if (host) this.player.attachYoutubeHost(host);
  }

  /** La video YouTube est visible seulement en mode video. */
  showVideo(): boolean {
    return this.player.isYouTube() && !this.player.youtubeAudioOnly() && !!this.player.currentTrack();
  }

  ytWatchUrl(): string {
    const id = this.player.currentTrack()?.youtubeId;
    return id ? `https://www.youtube.com/watch?v=${id}` : '#';
  }

  radioLabel(radio: { genre?: string; country?: string }): string {
    return radio.genre || radio.country || 'Decouverte';
  }

  labelFor(t: Track): string {
    if (t.id.startsWith('local:')) return '📱 local';
    if (t.youtubeId) return '▶ YouTube';
    return t.genre || '';
  }

  playFromQueue(index: number): void {
    this.player.playQueueIndex(index);
  }

  moveUp(i: number): void { this.player.moveInQueue(i, i - 1); }
  moveDown(i: number): void { this.player.moveInQueue(i, i + 1); }

  sleepLabel(): string {
    const r = this.player.sleepRemaining();
    if (r == null) return '';
    const m = Math.floor(r / 60);
    const s = r % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  dataLabel(): string {
    const mo = this.player.dataUsedMo();
    if (mo < 1) return `${Math.round(mo * 1024)} Ko`;
    return `${mo.toFixed(1)} Mo`;
  }

  onSeek(event: Event): void {
    this.player.seek(Number((event.target as HTMLInputElement).value));
  }

  onVolume(event: Event): void {
    this.player.setVolume(Number((event.target as HTMLInputElement).value));
  }

  onEqBand(i: number, event: Event): void {
    this.player.setEqBand(i, Number((event.target as HTMLInputElement).value));
  }
}
