import { Component, ElementRef, AfterViewInit, ViewChildren, QueryList, inject, signal, effect, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlayerService } from '../../services/player.service';
import { AmbienceService } from '../../services/ambience.service';
import { LyricsService, LyricLine } from '../../services/lyrics.service';
import { ShareModalComponent } from '../share-modal/share-modal.component';
import { Track } from '../../models/models';
import { IconComponent } from '../icon/icon.component';

/**
 * PLAYER V2 — SIGNATURE YAM DJ (§08).
 * Architecture UX : MINI (simple par defaut) + FULL (puissant a la demande).
 *  - MINI : pochette, titre, artiste, play/pause, next, progression ;
 *  - FULL : grande pochette, visualizer, paroles synchronisees (LRC),
 *    extrait partageable 30 s, mode voiture, volume, queue, EQ, Data-Lite,
 *    Nightclub, minuterie sommeil, ambiances, vitesse, compteur data.
 * Hote YouTube PERSISTANT hors des @if (fix boucle V1 conserve).
 */
@Component({
  selector: 'yam-audio-player',
  standalone: true,
  imports: [RouterLink, DecimalPipe, IconComponent, ShareModalComponent],
  template: `
    <!-- ================= HOTE YOUTUBE PERSISTANT ================= -->
    <div class="fixed z-40 left-3 w-[224px] sm:w-[256px] transition-all duration-300
                bottom-[calc(160px+env(safe-area-inset-bottom))] md:bottom-[92px]"
         [class.opacity-0]="!showVideo() || player.fullOpen()"
         [class.pointer-events-none]="!showVideo() || player.fullOpen()"
         [class.translate-y-2]="!showVideo()">
      <div #ytHost class="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl"
           [attr.aria-label]="'Lecteur video YouTube'"></div>
      @if (showVideo() && !player.fullOpen()) {
        <div class="flex items-center justify-between mt-1.5 px-1">
          <span class="text-[10px] font-bold text-red-500/90 flex items-center gap-1"><yam-icon name="play" [size]="10" class="fill-current"/> YouTube</span>
          <div class="flex gap-2">
            <a [href]="ytWatchUrl()" target="_blank" rel="noopener"
               class="text-[10px] font-semibold text-white/50 hover:text-white inline-flex items-center gap-1">Ouvrir <yam-icon name="external-link" [size]="10"/></a>
            <button (click)="player.toggleYoutubeAudioOnly()"
                    class="text-[10px] font-semibold text-yam-orange hover:underline inline-flex items-center gap-1">Mode audio <yam-icon name="headphones" [size]="11"/></button>
          </div>
        </div>
      }
    </div>

    @if (player.currentTrack(); as track) {

      <!-- ================= FULL PLAYER (puissant a la demande) ================= -->
      @if (player.fullOpen()) {
        <div class="fixed inset-0 z-[55] bg-yam-dark/97 backdrop-blur-2xl overflow-y-auto animate-fade-up"
             role="dialog" aria-modal="true" aria-label="Lecteur plein ecran">

          <div class="yam-glow w-[52rem] h-[52rem] -top-72 left-1/2 -translate-x-1/2 opacity-60 pointer-events-none fixed"></div>

          <div class="max-w-6xl mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 items-center min-h-screen">

            <!-- ===== GAUCHE : pochette + visualizer ===== -->
            <div class="relative mx-auto w-full max-w-[420px]">
              <div class="relative aspect-square rounded-[2rem] overflow-hidden border border-white/12 shadow-2xl bg-gradient-to-br from-yam-orange/25 to-yam-gold/15">
                @if (track.coverUrl) {
                  <img [src]="track.coverUrl" [alt]="track.title" class="w-full h-full object-cover">
                } @else {
                  <span class="w-full h-full flex items-center justify-center text-yam-orange"><yam-icon name="disc" [size]="96"/></span>
                }
                @if (player.isYouTube()) {
                  <span class="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-lg">
                    <yam-icon name="play" [size]="10" class="fill-current"/> YouTube
                  </span>
                }
                @if (player.isLocal()) {
                  <span class="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-yam-violet/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-lg">
                    <yam-icon name="folder" [size]="10"/> Fichier local
                  </span>
                }
              </div>
              <div class="yam-viz mx-auto mt-5 justify-center" [class.paused]="!player.isPlaying()" aria-hidden="true">
                <span></span><span></span><span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span><span></span><span></span>
              </div>
              <p class="text-center text-white/30 text-xs yam-num mt-3">
                {{ dataLabel() }} de data {{ player.dataLite() ? '· Data-Lite 48 kbps' : '' }}
              </p>
            </div>

            <!-- ===== DROITE : le controle ===== -->
            <div class="min-w-0">

              <div class="flex items-start justify-between gap-4 mb-5">
                <div class="min-w-0">
                  <p class="yam-kicker mb-1.5">
                    @if (player.radioMode(); as radio) { Radio {{ radioLabel(radio) }} }
                    @else if (player.isYouTube()) { YouTube }
                    @else { YAM DJ }
                  </p>
                  <h2 class="yam-display text-3xl sm:text-4xl leading-tight break-words">{{ track.title }}</h2>
                  @if (track.artistId && !track.artistId.startsWith('yt')) {
                    <a [routerLink]="['/artist', track.artistId]" class="text-white/55 hover:text-yam-orange transition text-base mt-1.5 inline-block">
                      {{ track.sourceArtist || track.artistName }}
                    </a>
                  } @else {
                    <p class="text-white/55 text-base mt-1.5">{{ track.sourceArtist || track.artistName }}</p>
                  }
                </div>
                <button (click)="player.fullOpen.set(false)" class="shrink-0 w-11 h-11 rounded-full border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition" aria-label="Fermer le lecteur">
                  <yam-icon name="chevron-down" [size]="20"/>
                </button>
              </div>

              <!-- Progression -->
              <div class="flex items-center gap-3 text-xs text-white/50 yam-num mb-6">
                <span class="w-11 text-right">{{ player.formatTime(player.position()) }}</span>
                <input type="range" min="0" [max]="player.duration() || track.durationSec || 100" [value]="player.position()"
                       (input)="onSeek($event)" class="flex-1 h-1.5 accent-yam-orange cursor-pointer" aria-label="Position de lecture">
                <span class="w-11">{{ player.formatTime(player.duration() || track.durationSec) }}</span>
              </div>

              <!-- Controles principaux -->
              <div class="flex items-center justify-center gap-5 sm:gap-7 mb-7">
                <button (click)="player.toggleShuffle()" [class.text-yam-orange]="player.shuffle()"
                        class="text-white/45 hover:text-white transition" aria-label="Lecture aléatoire"><yam-icon name="shuffle" [size]="18"/></button>
                <button (click)="player.previous()" class="text-white/70 hover:text-white transition" aria-label="Piste précédente"><yam-icon name="skip-previous" [size]="24"/></button>
                <button (click)="player.toggle()"
                        class="w-16 h-16 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-[0_8px_30px_-8px_rgba(255,138,36,.5)]"
                        [disabled]="player.loading()" aria-label="Play ou pause">
                  @if (player.loading()) { <yam-icon name="loader" [size]="26" class="animate-spin"/> }
                  @else if (player.isPlaying()) { <yam-icon name="pause" [size]="26"/> }
                  @else { <yam-icon name="play" [size]="26" class="fill-current translate-x-[1px]"/> }
                </button>
                <button (click)="player.next()" class="text-white/70 hover:text-white transition" aria-label="Piste suivante"><yam-icon name="skip-next" [size]="24"/></button>
                <button (click)="player.cycleRepeat()" [class.text-yam-orange]="player.repeat() !== 'off'"
                        class="text-white/45 hover:text-white transition relative" aria-label="Répétition">
                  <yam-icon name="repeat" [size]="18"/>
                  @if (player.repeat() === 'one') {
                    <span class="absolute -top-1 -right-1 text-[9px] bg-yam-orange text-yam-ink rounded-full w-4 h-4 flex items-center justify-center font-bold yam-num">1</span>
                  }
                </button>
              </div>

              <!-- Volume (desktop) -->
              <div class="hidden sm:flex items-center gap-3 mb-6 max-w-sm mx-auto">
                <button (click)="player.setVolume(player.volume() === 0 ? 0.9 : 0)" class="text-white/50 hover:text-white transition shrink-0"
                        [attr.aria-label]="player.volume() === 0 ? 'Rétablir le volume' : 'Couper le son'">
                  <yam-icon name="volume" [size]="17"/>
                </button>
                <input type="range" min="0" max="1" step="0.05" [value]="player.volume()"
                       (input)="onVolume($event)" class="flex-1 h-1.5 accent-yam-orange cursor-pointer" aria-label="Volume">
                <span class="yam-num text-xs text-white/40 w-10 text-right">{{ (player.volume() * 100) | number:'1.0-0' }}%</span>
              </div>

              <!-- ===== ACTIONS : simple par defaut, puissant a la demande ===== -->
              <div class="flex flex-wrap justify-center gap-2 mb-6">
                <button (click)="toggleLyrics()" [class]="panel() === 'lyrics' ? 'yam-badge !bg-yam-orange/20 !text-yam-orange !border-yam-orange/40' : 'yam-badge !text-white/60 hover:!text-white'"
                        [class]="lyricsAvailable() ? '!border-yam-orange/40' : ''" title="Paroles synchronisées">
                  <yam-icon name="text" [size]="13"/> Paroles
                </button>
                <button (click)="openClip()" [class]="panel() === 'clip' ? 'yam-badge !bg-yam-orange/20 !text-yam-orange !border-yam-orange/40' : 'yam-badge !text-white/60 hover:!text-white'"
                        title="Partager un extrait de 30 secondes">
                  <yam-icon name="scissors" [size]="13"/> Extrait 30 s
                </button>
                <a routerLink="/car" class="yam-badge !text-white/60 hover:!text-white" title="Mode voiture — interface simplifiée">
                  <yam-icon name="car" [size]="13"/> Voiture
                </a>
                @if (!player.isYouTube()) {
                  <button (click)="player.toggleDataLite()" [class]="player.dataLite() ? 'yam-badge !bg-yam-gold/20 !text-yam-gold !border-yam-gold/40' : 'yam-badge !text-white/60 hover:!text-white'"
                          title="Mode Data-Lite : 48 kbps, 3x moins de data">
                    <yam-icon name="smartphone" [size]="13"/> Data-Lite
                  </button>
                  <button (click)="player.toggleNightMode()" [class]="player.nightMode() ? 'yam-badge !bg-yam-orange/20 !text-yam-orange !border-yam-orange/40' : 'yam-badge !text-white/60 hover:!text-white'"
                          title="Mode Nightclub : bass boost + reverb club">
                    <yam-icon name="discoball" [size]="13"/> Nightclub
                  </button>
                } @else {
                  <button (click)="player.toggleYoutubeAudioOnly()" [class]="player.youtubeAudioOnly() ? 'yam-badge !bg-yam-green/20 !text-yam-green !border-yam-green/40' : 'yam-badge !text-white/60 hover:!text-white'"
                          title="Mode audio : vidéo repliée, son uniquement">
                    <yam-icon name="headphones" [size]="13"/> Audio seul
                  </button>
                }
                <button (click)="togglePanel('queue')" [class]="panel() === 'queue' ? 'yam-badge !bg-yam-orange/20 !text-yam-orange !border-yam-orange/40' : 'yam-badge !text-white/60 hover:!text-white'"
                        title="File d'attente">
                  <yam-icon name="list-music" [size]="13"/> File
                  @if (player.radioMode()) { <span class="w-2 h-2 bg-yam-orange rounded-full animate-pulse"></span> }
                </button>
                <button (click)="togglePanel('advanced')" [class]="panel() === 'advanced' ? 'yam-badge !bg-yam-orange/20 !text-yam-orange !border-yam-orange/40' : 'yam-badge !text-white/60 hover:!text-white'"
                        title="Options avancées (EQ, vitesse, dodo)">
                  <yam-icon name="settings" [size]="13"/> Options
                </button>
              </div>

              <!-- ===== PANNEAU PAROLES ===== -->
              @if (panel() === 'lyrics') {
                <div class="yam-card !rounded-2xl p-4 sm:p-6 max-h-[40vh] overflow-y-auto" #lyricsBox>
                  @if (lyricsLines(); as lines) {
                    <div class="space-y-1">
                      @for (line of lines; track $index) {
                        <p #lyr class="text-white/35 text-base sm:text-lg leading-relaxed transition-colors duration-300 py-1"
                           [class.text-white]="$index === activeLyric()" [class.font-bold]="$index === activeLyric()"
                           [class.text-yam-orange]="$index === activeLyric() && karaoke()">{{ line.text || '· · ·' }}</p>
                      }
                    </div>
                  } @else if (lyricsLoading()) {
                    <div class="space-y-3">
                      @for (i of [1,2,3,4,5,6]; track i) {
                        <div class="h-5 bg-white/5 rounded animate-pulse" [style.width.%]="55 + (i * 7) % 40"></div>
                      }
                    </div>
                  } @else {
                    <div class="text-center py-8">
                      <div class="text-white/20 mb-3 flex justify-center"><yam-icon name="text" [size]="36"/></div>
                      <p class="text-white/50 text-sm">Pas encore de paroles pour ce son.</p>
                      <p class="text-white/35 text-xs mt-1">L'artiste peut les ajouter (format LRC) depuis son tableau de bord — le mode karaoké est prêt.</p>
                    </div>
                  }
                </div>
                @if (lyricsLines()) {
                  <button (click)="karaoke.set(!karaoke())" class="mt-3 yam-badge !text-white/60 hover:!text-white cursor-pointer"
                          [class]="karaoke() ? '!bg-yam-orange/15 !text-yam-orange' : ''">
                    <yam-icon name="mic" [size]="12"/> {{ karaoke() ? 'Karaoké activé' : 'Activer le karaoké' }}
                  </button>
                }
              }

              <!-- ===== PANNEAU EXTRAIT 30 s ===== -->
              @if (panel() === 'clip') {
                <div class="yam-card !rounded-2xl p-5">
                  <p class="yam-kicker mb-1.5">Extrait partageable</p>
                  <p class="text-white/60 text-sm mb-4">Choisis le départ — YAM DJ génère un lien de 30 secondes à envoyer sur WhatsApp, Instagram, TikTok…</p>
                  <div class="flex items-center gap-3 text-xs text-white/50 yam-num mb-2">
                    <span class="w-11 text-right">{{ player.formatTime(clipStart()) }}</span>
                    <input type="range" min="0" [max]="clipMax()" step="1" [value]="clipStart()"
                           (input)="onClipStart($event)" class="flex-1 h-1.5 accent-yam-orange cursor-pointer" aria-label="Début de l'extrait">
                    <span class="w-11">{{ player.formatTime(clipStart() + 30) }}</span>
                  </div>
                  <div class="flex flex-wrap gap-2 mt-4">
                    <button (click)="previewClip()" class="yam-btn-secondary !px-4 !py-2 text-sm inline-flex items-center gap-1.5">
                      <yam-icon name="play" [size]="14" class="fill-current"/> Écouter l'extrait
                    </button>
                    <button (click)="openClipShare()" class="yam-btn-primary !px-4 !py-2 text-sm inline-flex items-center gap-1.5">
                      <yam-icon name="share" [size]="14"/> Générer le lien
                    </button>
                  </div>
                </div>
              }

              <!-- ===== PANNEAU FILE D'ATTENTE ===== -->
              @if (panel() === 'queue') {
                <div class="yam-card !rounded-2xl p-4 max-h-[40vh] overflow-y-auto">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-bold text-sm flex items-center gap-2 flex-wrap">
                      <yam-icon name="list-music" [size]="16" class="text-yam-orange"/>
                      File d'attente
                      <span class="text-white/40 font-normal yam-num">{{ player.queue().length }} pistes</span>
                      @if (player.radioMode(); as radio) {
                        <span class="yam-badge !bg-yam-orange/20 !text-yam-orange"><yam-icon name="radio" [size]="11"/> Radio {{ radioLabel(radio) }}</span>
                      }
                    </h3>
                    @if (player.radioMode()) {
                      <button (click)="player.stopRadio()" class="text-xs text-white/50 hover:text-white">Stop radio</button>
                    }
                  </div>
                  <div class="space-y-1">
                    @for (q of player.queue(); track q.id; let i = $index) {
                      <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                           [class]="q.id === track.id ? 'bg-yam-orange/15' : 'hover:bg-white/5'">
                        <button (click)="playFromQueue(i)" class="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center" [attr.aria-label]="'Lire ' + q.title">
                          @if (q.coverUrl) {
                            <img [src]="q.coverUrl" [alt]="q.title" class="w-full h-full object-cover">
                          } @else {
                            <yam-icon name="music-note" [size]="16"/>
                          }
                        </button>
                        <button (click)="playFromQueue(i)" class="min-w-0 flex-1 text-left">
                          <p class="text-sm font-medium truncate" [class.text-yam-orange]="q.id === track.id">{{ q.title }}</p>
                          <p class="text-xs text-white/40 truncate">{{ q.artistName || q.sourceArtist || 'YAM DJ' }}</p>
                        </button>
                        <span class="text-[10px] text-white/30 shrink-0 hidden sm:inline yam-num">{{ labelFor(q) }}</span>
                        <div class="flex flex-col shrink-0">
                          <button (click)="moveUp(i)" [disabled]="i === 0"
                                  class="text-white/30 hover:text-white leading-none py-0.5 disabled:opacity-20" aria-label="Monter"><yam-icon name="chevron-up" [size]="12"/></button>
                          <button (click)="moveDown(i)" [disabled]="i === player.queue().length - 1"
                                  class="text-white/30 hover:text-white leading-none py-0.5 disabled:opacity-20" aria-label="Descendre"><yam-icon name="chevron-down" [size]="12"/></button>
                        </div>
                        <button (click)="player.removeFromQueue(q.id)" [disabled]="q.id === track.id"
                                class="text-white/30 hover:text-red-400 shrink-0 px-1 disabled:opacity-20" aria-label="Retirer"><yam-icon name="x" [size]="13"/></button>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- ===== PANNEAU OPTIONS AVANCEES ===== -->
              @if (panel() === 'advanced') {
                <div class="yam-card !rounded-2xl p-5 max-h-[46vh] overflow-y-auto">
                  <h3 class="font-bold text-sm flex items-center gap-2 mb-4"><yam-icon name="settings" [size]="16" class="text-yam-orange"/> Options de lecture</h3>

                  <p class="text-xs text-white/40 mb-1.5">Vitesse de lecture</p>
                  <div class="flex gap-1.5 mb-4 flex-wrap">
                    @for (s of [0.75, 1, 1.25, 1.5, 2]; track s) {
                      <button (click)="player.setSpeed(s)"
                              class="text-xs font-semibold px-3 py-1.5 rounded-full transition yam-num"
                              [class]="player.speed() === s ? 'bg-yam-orange text-yam-ink' : 'bg-white/10 text-white/60 hover:bg-white/20'">
                        {{ s }}×
                      </button>
                    }
                  </div>

                  <p class="text-xs text-white/40 mb-1.5">Minuterie sommeil</p>
                  @if (player.sleepRemaining() != null) {
                    <div class="flex items-center justify-between mb-4">
                      <span class="text-sm text-yam-gold font-semibold yam-num inline-flex items-center gap-1.5"><yam-icon name="moon" [size]="14"/> {{ sleepLabel() }}</span>
                      <button (click)="player.clearSleepTimer()" class="text-xs text-white/50 hover:text-white underline">Annuler</button>
                    </div>
                  } @else {
                    <div class="flex gap-1.5 mb-4 flex-wrap">
                      @for (m of [15, 30, 60, 90]; track m) {
                        <button (click)="player.startSleepTimer(m)"
                                class="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/60 hover:bg-white/20 transition yam-num">
                          {{ m }} min
                        </button>
                      }
                    </div>
                  }

                  <p class="text-xs text-white/40 mb-1.5">Mode ambiance (sons gratuits hors ligne)</p>
                  <div class="flex gap-1.5 mb-4 flex-wrap">
                    @for (a of ambienceOpts; track a.id) {
                      <button (click)="ambience.toggle(a.id)"
                              class="text-xs font-semibold px-3 py-1.5 rounded-full transition inline-flex items-center gap-1.5"
                              [class]="ambience.active() === a.id ? 'bg-yam-green text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'">
                        <yam-icon [name]="a.icon" [size]="12"/> {{ a.label }}
                      </button>
                    }
                  </div>

                  <p class="text-xs text-white/40 mb-1.5">Équaliseur</p>
                  <div class="flex gap-1.5 mb-3 flex-wrap">
                    @for (p of eqPresetNames; track p) {
                      <button (click)="player.setEqPreset(p)"
                              class="text-xs font-semibold px-3 py-1.5 rounded-full transition"
                              [class]="player.eqPreset() === p ? 'bg-yam-orange text-yam-ink' : 'bg-white/10 text-white/60 hover:bg-white/20'">
                        {{ p }}
                      </button>
                    }
                  </div>
                  <div class="space-y-1.5">
                    @for (b of eqBands; track b.freq; let i = $index) {
                      <div class="flex items-center gap-2">
                        <span class="text-[10px] text-white/40 w-10 shrink-0 yam-num">{{ b.label }}</span>
                        <input type="range" min="-8" max="8" step="1" [value]="player.eqGains()[i]"
                               (input)="onEqBand(i, $event)"
                               class="flex-1 h-1 accent-yam-orange cursor-pointer" [attr.aria-label]="'EQ ' + b.label">
                        <span class="text-[10px] text-white/40 w-8 text-right shrink-0 yam-num">{{ player.eqGains()[i] > 0 ? '+' : '' }}{{ player.eqGains()[i] }}</span>
                      </div>
                    }
                  </div>

                  <div class="text-xs text-white/40 border-t border-white/10 mt-4 pt-3 flex items-center justify-between">
                    <span class="inline-flex items-center gap-1.5"><yam-icon name="smartphone" [size]="13"/> Ta data, ta manière</span>
                    <span class="text-white/60 font-semibold yam-num">{{ dataLabel() }}</span>
                  </div>
                </div>
              }

            </div>
          </div>
        </div>
      }

      <!-- ================= MINI PLAYER (simple par défaut) ================= -->
      <div class="fixed left-0 right-0 z-50 md:bottom-0 bg-yam-surface/95 backdrop-blur-xl border-t border-white/10
                  bottom-[calc(64px+env(safe-area-inset-bottom))]">

        <!-- Banniere publicite non intrusive (jamais pour les Premium) -->
        @if (player.adPlaying()) {
          <div class="bg-yam-gold/15 border-b border-yam-gold/30 px-4 py-1.5 flex items-center justify-between gap-3 text-xs">
            <span class="text-yam-gold truncate inline-flex items-center gap-1.5"><yam-icon name="megaphone" [size]="14" class="shrink-0"/> {{ player.adText() }}</span>
            <div class="flex items-center gap-3 shrink-0">
              <a routerLink="/premium" class="text-yam-gold font-semibold hover:underline">Passe Premium</a>
              <button (click)="player.skipAd()" class="text-white/60 hover:text-white font-semibold inline-flex items-center gap-1">Passer <yam-icon name="skip-next" [size]="12"/></button>
            </div>
          </div>
        }

        <div class="max-w-editorial mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3 sm:gap-4">

          <!-- Pochette + infos : clic = plein ecran -->
          <button (click)="player.fullOpen.set(true)" class="flex items-center gap-3 min-w-0 flex-1 sm:flex-none sm:w-1/4 text-left group" aria-label="Ouvrir le lecteur plein écran">
            <div class="w-11 h-11 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center overflow-hidden shrink-0 relative">
              @if (track.coverUrl) {
                <img [src]="track.coverUrl" [alt]="track.title" class="w-full h-full object-cover">
              } @else {
                <yam-icon name="music-note" [size]="20"/>
              }
              @if (player.isYouTube() && player.youtubeAudioOnly()) {
                <span class="absolute bottom-0.5 right-0.5 text-red-500/90 bg-black/60 rounded p-0.5 flex"><yam-icon name="play" [size]="9" class="fill-current"/></span>
              }
            </div>
            <div class="min-w-0">
              <p class="font-semibold truncate text-sm group-hover:text-yam-orange transition">{{ track.title }}</p>
              <p class="text-white/50 text-xs truncate">
                @if (track.youtubeId) { <span class="text-red-500/90 font-semibold">YouTube</span> · }
                {{ track.sourceArtist || track.artistName }}
              </p>
            </div>
            <yam-icon name="chevron-up" [size]="15" class="text-white/30 group-hover:text-yam-orange transition shrink-0 hidden sm:block"/>
          </button>

          <!-- Controles + progression (desktop) -->
          <div class="hidden sm:flex flex-1 flex-col items-center gap-1">
            <div class="flex items-center gap-3 sm:gap-4">
              <button (click)="player.toggleShuffle()" [class.text-yam-orange]="player.shuffle()"
                      class="text-white/50 hover:text-white transition" aria-label="Lecture aléatoire"><yam-icon name="shuffle" [size]="16"/></button>
              <button (click)="player.previous()" class="text-white/60 hover:text-white transition" aria-label="Précédent"><yam-icon name="skip-previous" [size]="18"/></button>
              <button (click)="player.toggle()"
                      class="w-11 h-11 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center hover:scale-105 active:scale-95 transition"
                      [disabled]="player.loading()" aria-label="Play ou pause">
                @if (player.loading()) { <yam-icon name="loader" [size]="20" class="animate-spin"/> }
                @else if (player.isPlaying()) { <yam-icon name="pause" [size]="20"/> }
                @else { <yam-icon name="play" [size]="20" class="fill-current translate-x-[1px]"/> }
              </button>
              <button (click)="player.next()" class="text-white/60 hover:text-white transition" aria-label="Suivant"><yam-icon name="skip-next" [size]="18"/></button>
              <button (click)="player.cycleRepeat()" [class.text-yam-orange]="player.repeat() !== 'off'"
                      class="text-white/50 hover:text-white transition relative" aria-label="Répétition">
                <yam-icon name="repeat" [size]="16"/>
                @if (player.repeat() === 'one') {
                  <span class="absolute -top-1 -right-1 text-[9px] bg-yam-orange text-yam-ink rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold yam-num">1</span>
                }
              </button>
            </div>
            <div class="w-full flex items-center gap-2 text-xs text-white/50 yam-num">
              <span class="w-10 text-right">{{ player.formatTime(player.position()) }}</span>
              <input type="range" min="0" [max]="player.duration() || track.durationSec || 100" [value]="player.position()"
                     (input)="onSeek($event)" class="flex-1 h-1.5 accent-yam-orange cursor-pointer" aria-label="Position de lecture">
              <span class="w-10">{{ player.formatTime(player.duration() || track.durationSec) }}</span>
            </div>
          </div>

          <!-- Droite : toggles + volume + fermer -->
          <div class="hidden md:flex items-center gap-2 justify-end shrink-0">
            @if (!player.isYouTube()) {
              <button (click)="player.toggleDataLite()"
                      class="yam-badge cursor-pointer hover:bg-white/20 !px-2"
                      [class]="player.dataLite() ? '!bg-yam-gold/20 !text-yam-gold border border-yam-gold/40' : ''"
                      title="Mode Data-Lite : 48 kbps, 3x moins de data" aria-label="Data-Lite">
                <yam-icon name="smartphone" [size]="14"/>
              </button>
              <button (click)="player.toggleNightMode()"
                      class="yam-badge cursor-pointer hover:bg-white/20 !px-2"
                      [class]="player.nightMode() ? '!bg-yam-orange/20 !text-yam-orange border border-yam-orange/40' : ''"
                      title="Mode Nightclub : bass boost + reverb club" aria-label="Nightclub">
                <yam-icon name="discoball" [size]="14"/>
              </button>
            } @else {
              <button (click)="player.toggleYoutubeAudioOnly()"
                      class="yam-badge cursor-pointer hover:bg-white/20 !px-2"
                      [class]="player.youtubeAudioOnly() ? '!bg-yam-green/20 !text-yam-green border border-yam-green/40' : ''"
                      title="Mode audio : video repliee, son uniquement (economie batterie)" aria-label="Mode audio">
                <yam-icon name="headphones" [size]="14"/>
              </button>
            }

            <button (click)="openFullWith('queue')" class="text-white/50 hover:text-white transition relative" title="File d'attente" aria-label="File d'attente">
              <yam-icon name="list-music" [size]="16"/>
              @if (player.radioMode()) {
                <span class="absolute -top-1 -right-1 w-2 h-2 bg-yam-orange rounded-full animate-pulse"></span>
              }
            </button>
            <button (click)="openFullWith('advanced')" class="text-white/50 hover:text-white transition" title="Options (EQ, vitesse, dodo)" aria-label="Options"><yam-icon name="settings" [size]="16"/></button>

            <div class="hidden lg:flex items-center gap-2">
              <span class="text-white/50"><yam-icon name="volume" [size]="16"/></span>
              <input type="range" min="0" max="1" step="0.05" [value]="player.volume()"
                     (input)="onVolume($event)" class="w-20 h-1 accent-yam-orange cursor-pointer" aria-label="Volume">
            </div>

            <button (click)="player.stop()"
                    class="text-white/40 hover:text-red-400 transition px-1.5" title="Fermer le lecteur" aria-label="Fermer le lecteur"><yam-icon name="x" [size]="16"/></button>
          </div>

          <!-- Mobile : play + next -->
          <div class="flex md:hidden items-center gap-1 shrink-0">
            <button (click)="player.toggle()" class="w-10 h-10 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center" [disabled]="player.loading()" aria-label="Play ou pause">
              @if (player.loading()) { <yam-icon name="loader" [size]="18" class="animate-spin"/> }
              @else if (player.isPlaying()) { <yam-icon name="pause" [size]="18"/> }
              @else { <yam-icon name="play" [size]="18" class="fill-current translate-x-[1px]"/> }
            </button>
            <button (click)="player.next()" class="w-9 h-9 flex items-center justify-center text-white/60" aria-label="Suivant"><yam-icon name="skip-next" [size]="17"/></button>
          </div>
        </div>

        <!-- Progression mobile (ligne fine signature) -->
        <div class="md:hidden px-3 pb-2">
          <div class="yam-progress-thin" role="progressbar" [attr.aria-valuenow]="player.position()" [attr.aria-valuemax]="player.duration() || track.durationSec">
            <span [style.width.%]="miniPct()"></span>
          </div>
        </div>
      </div>

      <!-- Modale de partage d'extrait (clip) -->
      <yam-share-modal [visible]="shareOpen()" [track]="track" [clip]="shareClipData()" (close)="shareOpen.set(false); shareClipData.set(null)"/>
    }
  `,
  styles: [`:host { display: block; }`]
})
export class AudioPlayerComponent implements AfterViewInit {
  player = inject(PlayerService);
  ambience = inject(AmbienceService);
  private lyricsService = inject(LyricsService);

  /** Panneau ouvert dans le player plein ecran. */
  panel = signal<'lyrics' | 'clip' | 'queue' | 'advanced' | null>(null);
  shareOpen = signal(false);
  shareClipData = signal<{ start: number; end: number } | null>(null);

  /** Paroles synchronisees. */
  lyricsLines = signal<LyricLine[] | null>(null);
  lyricsLoading = signal(false);
  karaoke = signal(false);
  private lyricsTrackId: string | null = null;
  private lastActive = -1;

  clipStart = signal(0);

  readonly ambienceOpts = [
    { id: 'rain' as const, label: 'Pluie', icon: 'cloud-rain' },
    { id: 'ocean' as const, label: 'Ocean', icon: 'waves' },
    { id: 'wind' as const, label: 'Vent', icon: 'wind' }
  ];

  readonly eqPresetNames = Object.keys(this.player.EQ_PRESETS);
  readonly eqBands = [
    { freq: 60, label: '60 Hz' },
    { freq: 250, label: '250 Hz' },
    { freq: 1000, label: '1 kHz' },
    { freq: 4000, label: '4 kHz' },
    { freq: 12000, label: '12 kHz' }
  ];

  @ViewChildren('lyr') lyrRefs!: QueryList<ElementRef<HTMLParagraphElement>>;

  private ytHostRef = viewChild<ElementRef<HTMLDivElement>>('ytHost');

  constructor() {
    // Paroles : suivi de la ligne active pendant la lecture (karaoké).
    effect(() => {
      const pos = this.player.position();
      if (!this.lyricsOpenNow()) return;
      const idx = this.activeLyricAt(pos);
      if (idx !== this.lastActive) {
        this.lastActive = idx;
        const els = this.lyrRefs?.toArray?.() || [];
        const el = els[idx]?.nativeElement;
        if (el) {
          const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
          el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        }
      }
    });

    // Nouvelle piste -> paroles rechargees si le panneau etait ouvert.
    // allowSignalWrites : l'effet pilote lyricsLines (autorisé explicitement).
    effect(() => {
      const t = this.player.currentTrack();
      if (t && this.lyricsOpenNow() && t.id !== this.lyricsTrackId) {
        window.setTimeout(() => this.loadLyrics(), 0);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.player.isYouTube() && this.player.isPlaying()) {
        // On garde le son (arriere-plan) : YouTube iframe continue en cache.
      }
    });
  }

  ngAfterViewInit(): void {
    const host = this.ytHostRef()?.nativeElement || null;
    if (host) this.player.attachYoutubeHost(host);
  }

  private lyricsOpenNow(): boolean {
    return this.panel() === 'lyrics' && this.player.fullOpen();
  }

  togglePanel(which: 'queue' | 'advanced'): void {
    this.panel.set(this.panel() === which ? null : which);
  }

  openFullWith(which: 'queue' | 'advanced' | 'lyrics' | 'clip'): void {
    this.player.fullOpen.set(true);
    this.panel.set(which);
    if (which === 'lyrics') this.loadLyrics();
  }

  // ===== PAROLES =====

  toggleLyrics(): void {
    if (this.panel() === 'lyrics') {
      this.panel.set(null);
    } else {
      this.panel.set('lyrics');
      this.loadLyrics();
    }
  }

  loadLyrics(): void {
    const t = this.player.currentTrack();
    if (!t || t.id === this.lyricsTrackId) return;
    this.lyricsTrackId = t.id;
    this.lyricsLines.set(null);
    this.lyricsLoading.set(true);
    this.lastActive = -1;
    this.lyricsService.lyricsFor(t.id).subscribe(lines => {
      this.lyricsLines.set(lines);
      this.lyricsLoading.set(false);
    });
  }

  lyricsAvailable(): boolean {
    return !!this.lyricsLines();
  }

  activeLyric(): number {
    return this.activeLyricAt(this.player.position());
  }

  private activeLyricAt(pos: number): number {
    const lines = this.lyricsLines();
    if (!lines || !lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= pos + 0.25) idx = i; else break;
    }
    return idx;
  }

  // ===== EXTRAIT 30 s =====

  openClip(): void {
    if (this.panel() === 'clip') { this.panel.set(null); return; }
    this.panel.set('clip');
    const dur = this.player.duration() || this.player.currentTrack()?.durationSec || 30;
    this.clipStart.set(Math.max(0, Math.min(this.player.position(), Math.max(0, dur - 30))));
  }

  clipMax(): number {
    const dur = this.player.duration() || this.player.currentTrack()?.durationSec || 30;
    return Math.max(0, dur - 30);
  }

  onClipStart(event: Event): void {
    this.clipStart.set(Number((event.target as HTMLInputElement).value));
  }

  previewClip(): void {
    this.player.seek(this.clipStart());
    if (!this.player.isPlaying()) this.player.toggle();
  }

  openClipShare(): void {
    const start = Math.round(this.clipStart());
    const dur = this.player.duration() || this.player.currentTrack()?.durationSec || 30;
    const end = Math.min(Math.round(start + 30), Math.round(dur));
    this.shareClipData.set({ start, end });
    this.shareOpen.set(true);
  }

  // ===== DIVERS =====

  openFull(): void {
    this.player.fullOpen.set(true);
  }

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
    if (t.id.startsWith('local:')) return 'Local';
    if (t.youtubeId) return 'YouTube';
    return t.genre || '';
  }

  miniPct(): number {
    const dur = this.player.duration() || this.player.currentTrack()?.durationSec || 0;
    if (!dur) return 0;
    return Math.min(100, (this.player.position() / dur) * 100);
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
