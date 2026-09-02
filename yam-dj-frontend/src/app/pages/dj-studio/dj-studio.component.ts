import { Component, inject, signal, OnInit, OnDestroy, AfterViewInit, viewChildren, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { DjService } from '../../services/dj.service';
import { TrackService } from '../../services/track.service';
import { Mixtape, Track } from '../../models/models';
import Hls from 'hls.js';

/**
 * STUDIO DJ — 2 PLATINES WEB (V2, corrige avec l'avis des DJ de terrain).
 *
 * CORRECTIFS MAJEURS :
 *  - Effet delay : l'echo etait TOUJOURS actif (delay.connect(gain) direct).
 *    Câblage correct : dry -> gain ; wet : filter -> delay -> delayGain ->
 *    gain, avec boucle de feedback reglable.
 *  - HLS : les decks jouent maintenant via hls.js (les .m3u8 ne se lisent
 *    pas nativement sur Chrome/Android — cause du "studio muet").
 *  - Chargement via l'API /stream (respecte la moderation + la qualite),
 *    pistes YouTube exclues (aucun audio a mixer).
 *  - Volume deck x facteur crossfader (l'ancien code ecrasait le crossfade).
 *  - Limiteur master (DynamicsCompressor) : plus de clipping en sortie.
 *  - Pitch avec preservesPitch = false (vrai pitch DJ, l'ancien gardait
 *    la tonalite -> l'Auto-Mix harmonique etait inoperant).
 *  - Reset du pitch au chargement d'une piste.
 *  - Listeners ended/error par deck, unsubscribe propre, timers nettoyes.
 *
 * NOUVEAUTES : waveform live (spectre reel + progression), VU-metres,
 * hot cues 4 pads, boucle 4/8/16 temps, boutons A/B dans la bibliotheque,
 * eject, sync half/double-time, modal non fermable pendant la generation.
 */
@Component({
  selector: 'yam-dj-studio',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-12">

      <!-- En-tete -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-4">
        <div>
          <h1 class="yam-title">🎚️ Studio DJ</h1>
          <p class="text-white/50 text-sm">2 platines, effets, hot cues, boucles — mixe comme en boite.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button (click)="loadLibrary()" class="yam-btn-secondary text-sm">🔄 Rafraichir</button>
          <button (click)="autoMix()" [disabled]="selected().length < 2"
                  class="yam-btn-primary text-sm">
            🤖 Auto-Mix IA ({{ selected().length }})
          </button>
        </div>
      </div>

      <!-- Analyse IA -->
      @if (analysis()) {
        <div class="yam-card p-4 mb-5 border-yam-orange/30 bg-yam-orange/5">
          <p class="text-sm text-yam-orange font-medium">🤖 {{ analysis() }}</p>
        </div>
      }

      <!-- ============ CROSSFADER (visible en premier, meme sur mobile) ============ -->
      <div class="yam-card p-4 mb-5">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
          <div>
            <div class="flex justify-between text-xs text-white/40 mb-1">
              <span>DECK A {{ decks[0].volume.toFixed(2) }}</span>
              <span>CROSSFADER</span>
              <span>DECK B {{ decks[1].volume.toFixed(2) }}</span>
            </div>
            <input type="range" min="0" max="1" step="0.01" [value]="crossfade()"
                   (input)="setCrossfade($event)" class="w-full h-2 accent-yam-orange cursor-pointer">
          </div>
          <div>
            <label class="text-xs text-white/40 block mb-1">MASTER (limiteur actif 🔒)</label>
            <input type="range" min="0" max="1" step="0.05" [value]="masterVolume()"
                   (input)="setMasterVolume($event)" class="w-full h-2 accent-yam-gold cursor-pointer">
          </div>
          <div class="text-center">
            <div class="text-xs text-white/40 mb-1">BPM SYNC</div>
            <button (click)="syncBpm()" class="yam-btn-secondary !py-2 text-sm w-full"
                    [disabled]="!decks[0].track || !decks[1].track">⚡ Sync B sur A (half/double auto)</button>
          </div>
        </div>
      </div>

      <!-- ============ LES 2 DECKS ============ -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        @for (deck of decks; track deck.id) {
          <div class="yam-card p-4" [class]="deck.active ? 'yam-card p-4 border-yam-orange/40' : 'yam-card p-4'">
            <div class="flex items-center justify-between mb-3 gap-3">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                    [class]="deck.id === 'A' ? 'bg-yam-orange/20 text-yam-orange' : 'bg-yam-gold/20 text-yam-gold'">
                {{ deck.id }}
              </span>
              @if (deck.track) {
                <div class="text-right min-w-0 flex-1">
                  <p class="font-semibold truncate max-w-[200px] ml-auto">{{ deck.track.title }}</p>
                  <p class="text-white/50 text-xs truncate max-w-[200px] ml-auto">{{ deck.track.artistName }}
                    @if (deck.track.bpm) { · {{ deck.track.bpm }} BPM }
                    @if (deck.track.camelot) { · 🎹 {{ deck.track.camelot }} }
                  </p>
                </div>
                <button (click)="ejectDeck(deck)" title="Ejecter la piste"
                        class="w-8 h-8 rounded-full text-white/40 hover:text-red-400 hover:bg-red-400/10 transition shrink-0">⏏</button>
              } @else {
                <p class="text-white/30 text-sm flex-1 text-right">Deck libre — charge une piste</p>
              }
            </div>

            <!-- Waveform : spectre live + progression -->
            <div class="h-24 rounded-xl bg-black/40 mb-3 overflow-hidden relative" (click)="seekDeck(deck, $event)">
              <canvas #deckCanvas class="w-full h-full block" [attr.data-deck]="deck.id"></canvas>
              @if (!deck.track) {
                <div class="absolute inset-0 flex items-center justify-center text-white/20 text-xs pointer-events-none">
                  Charge une piste ci-dessous 🎵
                </div>
              }
              @if (deck.track) {
                <div class="absolute bottom-1 left-2 right-2 flex justify-between text-[10px] text-white/60 tabular-nums pointer-events-none">
                  <span>{{ fmt(deck.position) }}</span>
                  <span>-{{ fmt(deck.duration - deck.position) }}</span>
                </div>
                <!-- VU-metre -->
                <div class="absolute top-1.5 right-2 w-16 h-2 rounded-full bg-black/50 overflow-hidden pointer-events-none">
                  <div class="h-full rounded-full transition-all duration-100"
                       [class]="deck.vu > 0.85 ? 'bg-red-500' : 'bg-yam-green'"
                       [style.width.%]="deck.vu * 100"></div>
                </div>
              }
            </div>

            <!-- Controles -->
            <div class="flex items-center gap-3 mb-3">
              <button (click)="toggleDeck(deck)" [disabled]="!deck.track"
                      class="w-12 h-12 rounded-full bg-white text-yam-dark text-xl font-bold hover:scale-105 active:scale-95 transition shrink-0 disabled:opacity-30">
                {{ deck.playing ? '⏸' : '▶' }}
              </button>
              <div class="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-white/40 block mb-1 cursor-pointer" (click)="resetPitch(deck)">
                    Pitch {{ deck.pitch >= 0 ? '+' : '' }}{{ deck.pitch.toFixed(1) }}% <span class="underline">reset</span>
                  </label>
                  <input type="range" min="-8" max="8" step="0.1" [value]="deck.pitch"
                         (input)="setPitch(deck, $event)" class="w-full h-1 accent-yam-orange cursor-pointer">
                </div>
                <div>
                  <label class="text-xs text-white/40 block mb-1">Volume deck</label>
                  <input type="range" min="0" max="1" step="0.05" [value]="deck.volume"
                         (input)="setDeckVolume(deck, $event)" class="w-full h-1 accent-yam-orange cursor-pointer">
                </div>
              </div>
            </div>

            <!-- Hot cues + boucle -->
            @if (deck.track) {
              <div class="flex items-center gap-2 mb-3 flex-wrap">
                <span class="text-[10px] text-white/30 shrink-0">CUES</span>
                @for (c of deck.cues; track $index) {
                  <button (click)="hotCue(deck, $index)"
                          class="w-9 h-9 rounded-lg text-xs font-bold transition shrink-0"
                          [class]="deck.cues[$index] != null
                            ? 'bg-yam-gold/25 text-yam-gold hover:bg-yam-gold/40 border border-yam-gold/40'
                            : 'bg-white/10 text-white/40 hover:bg-white/20 border border-white/10'"
                          title="Clic : place/saute · Shift+clic : efface">
                    {{ $index + 1 }}
                  </button>
                }
                <span class="text-[10px] text-white/30 shrink-0 ml-2">LOOP</span>
                @for (bars of [4, 8, 16]; track bars) {
                  <button (click)="toggleLoop(deck, bars)"
                          class="text-xs font-bold px-2.5 py-1.5 rounded-lg transition shrink-0"
                          [class]="deck.loop?.active && deck.loop.bars === bars
                            ? 'bg-yam-orange text-white'
                            : 'bg-white/10 text-white/50 hover:bg-white/20'">
                    {{ bars }}
                  </button>
                }
                @if (deck.loop?.active) {
                  <span class="text-[10px] text-yam-orange">↻ {{ fmt(loopLength(deck)) }}</span>
                }
              </div>
            }

            <!-- Effets -->
            <div class="grid grid-cols-3 gap-2">
              <button (click)="toggleEffect(deck, 'filter')"
                      class="yam-badge cursor-pointer justify-center !py-2"
                      [class]="deck.filterOn ? '!bg-yam-orange !text-white' : ''">🌊 Filtre</button>
              <button (click)="toggleEffect(deck, 'delay')"
                      class="yam-badge cursor-pointer justify-center !py-2"
                      [class]="deck.delayOn ? '!bg-yam-orange !text-white' : ''">⏱ Delay</button>
              <button (click)="toggleEffect(deck, 'reverb')"
                      class="yam-badge cursor-pointer justify-center !py-2"
                      [class]="deck.reverbOn ? '!bg-yam-orange !text-white' : ''">🏛 Reverb</button>
            </div>
          </div>
        }
      </div>

      <!-- Bibliotheque du studio (pistes avec VRAI audio, YouTube exclu) -->
      <section>
        <h2 class="text-xl font-bold mb-2">🎵 Bibliotheque du studio</h2>
        <p class="text-white/40 text-sm mb-4">
          Charge dans le deck A ou B — les pistes YouTube ne sont pas mixables (pas de fichier audio).
          @if (ytExcluded > 0) { {{ ytExcluded }} pistes YouTube masquees. }
        </p>

        <div class="flex gap-2 mb-4 flex-wrap">
          <input type="text" [(ngModel)]="filter" (ngModelChange)="filterLibrary()"
                 placeholder="Filtrer par titre, genre, BPM..." class="yam-input !py-2 max-w-xs">
          <select [(ngModel)]="genreFilter" (ngModelChange)="filterLibrary()" class="yam-input !py-2 max-w-[180px]">
            <option value="all">Tous genres</option>
            <option value="Afrobeats">Afrobeats</option>
            <option value="Coupe-Decale">Coupe-Decale</option>
            <option value="Rap">Rap</option>
            <option value="Ndombolo">Ndombolo</option>
          </select>
        </div>

        <div class="grid grid-cols-1 gap-2">
          @for (item of filteredLibrary(); track item.id) {
            <div class="yam-card p-3 flex items-center gap-3 hover:border-yam-orange/40">
              <button (click)="playPreview(item)"
                      class="w-10 h-10 rounded-full bg-yam-orange/20 text-yam-orange flex items-center justify-center hover:bg-yam-orange hover:text-white transition shrink-0"
                      [title]="'Ecouter ' + item.title">▶</button>
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">{{ item.title }}</p>
                <p class="text-white/40 text-xs truncate">{{ item.artistName }} · {{ item.genre }}
                  @if (item.bpm) { · {{ item.bpm }} BPM } @if (item.camelot) { · 🎹 {{ item.camelot }} }
                </p>
              </div>
              <!-- Chargement DIRECT dans le deck choisi -->
              <button (click)="loadDeck(item, decks[0])" [disabled]="!!decks[0].track && decks[0].playing"
                      class="w-9 h-9 rounded-lg font-black text-xs shrink-0 transition bg-yam-orange/15 text-yam-orange hover:bg-yam-orange hover:text-white disabled:opacity-30"
                      title="Charger dans le deck A">A</button>
              <button (click)="loadDeck(item, decks[1])" [disabled]="!!decks[1].track && decks[1].playing"
                      class="w-9 h-9 rounded-lg font-black text-xs shrink-0 transition bg-yam-gold/15 text-yam-gold hover:bg-yam-gold hover:text-white disabled:opacity-30"
                      title="Charger dans le deck B">B</button>
              <button (click)="toggleSelect(item)"
                      class="w-9 h-9 rounded-full border flex items-center justify-center text-sm transition shrink-0"
                      [class]="isSelected(item) ? 'bg-yam-orange border-yam-orange text-white' : 'border-white/20 text-white/40'">
                {{ isSelected(item) ? '✓' : '+' }}
              </button>
            </div>
          } @empty {
            <div class="yam-card p-10 text-center text-white/40">
              <div class="text-4xl mb-2">🎼</div>
              @if (library().length === 0) { Aucune piste audio disponible pour le mix. }
              @else { Aucun resultat avec ces filtres. }
            </div>
          }
        </div>
      </section>

      <!-- MES MIXTAPES -->
      <section class="mt-10">
        <h2 class="text-xl font-bold mb-4">🎛️ Mes mixtapes</h2>

        @if (mixMessage()) {
          <div class="yam-card p-3 mb-4"
               [class]="mixMessageOk() ? 'border-yam-green/40 bg-yam-green/10' : 'border-red-400/40 bg-red-400/10'">
            <p class="text-sm font-medium" [class]="mixMessageOk() ? 'text-yam-green' : 'text-red-400'">
              {{ mixMessageOk() ? '✔' : '✖' }} {{ mixMessage() }}
            </p>
          </div>
        }

        @if (mixtapes().length) {
          <div class="space-y-2">
            @for (mix of mixtapes(); track mix.id) {
              <div class="yam-card p-4 flex items-center gap-3">
                <button (click)="playMixtape(mix)" title="Ecouter le mix"
                        class="w-10 h-10 rounded-full bg-yam-orange/20 text-yam-orange flex items-center justify-center hover:bg-yam-orange hover:text-white transition shrink-0">
                  {{ mixPlayingId() === mix.id ? '⏸' : '▶' }}
                </button>
                <div class="min-w-0 flex-1">
                  <p class="font-medium truncate">{{ mix.title }}</p>
                  <p class="text-white/40 text-xs truncate">
                    🎧 {{ mix.playCount }} ecoutes · {{ formatDuration(mix.durationSec) }} · {{ formatDate(mix.createdAt) }}
                    @if (mix.priceXof && mix.priceXof > 0) { · <span class="text-yam-gold">💰 {{ mix.priceXof }} F</span> }
                  </p>
                </div>
                <button (click)="askDeleteMixtape(mix)" [disabled]="deletingMixId() === mix.id" title="Supprimer"
                        class="shrink-0 text-xs font-semibold px-3 py-2 rounded-full transition"
                        [class]="confirmDeleteMixId() === mix.id
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'text-white/40 hover:text-red-400 hover:bg-red-400/10'">
                  @if (deletingMixId() === mix.id) { <span class="animate-pulse">⏳</span> }
                  @else if (confirmDeleteMixId() === mix.id) { Confirmer ? }
                  @else { Supprimer }
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="yam-card p-8 text-center text-white/40">
            <div class="text-4xl mb-2">🎛️</div>
            Aucune mixtape. Selectionne 2+ pistes audio puis « Creer une mixtape ».
          </div>
        }
      </section>

      <!-- Bouton flottant creation mixtape -->
      @if (selected().length >= 2) {
        <div class="fixed bottom-24 right-4 z-40">
          <button (click)="mixModalVisible.set(true)" class="yam-btn-primary !px-6 !py-3 shadow-2xl">
            🎛️ Creer une mixtape ({{ selected().length }})
          </button>
        </div>
      }

      <!-- Modal mixtape -->
      @if (mixModalVisible()) {
        <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
             (click)="!creatingMix() && mixModalVisible.set(false)">
          <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10" (click)="$event.stopPropagation()">
            <h2 class="yam-title mb-4">🎛️ Nouvelle mixtape</h2>
            <label class="text-sm text-white/60 mb-1 block">Titre du mix</label>
            <input type="text" [(ngModel)]="mixTitle" placeholder="Mix Nuit Ouaga Vol.1" class="yam-input mb-4">
            <label class="text-sm text-white/60 mb-1 block">Crossfade : {{ crossfadeSec }} secondes</label>
            <input type="range" min="2" max="16" [(ngModel)]="crossfadeSec" class="w-full h-2 accent-yam-orange cursor-pointer mb-4">
            <label class="flex items-center gap-2 text-sm text-white/60 cursor-pointer mb-4">
              <input type="checkbox" [(ngModel)]="autoOrder" class="accent-yam-orange w-4 h-4">
              Ordonner avec l'Auto-Mix IA (tonalites + BPM)
            </label>
            <div class="yam-card !bg-yam-surface p-3 mb-4">
              <label class="text-sm text-white/60 mb-1 block">
                Prix (FCFA) — <span class="text-yam-gold">0 = gratuite</span>
              </label>
              <input type="number" min="0" max="50000" step="50" [(ngModel)]="mixPriceXof"
                     placeholder="0" class="yam-input mb-2" inputmode="numeric">
              @if (mixPriceXof > 0) {
                <p class="text-xs text-white/50">Ta part : <b class="text-yam-green">{{ djSharePreview() }} F</b> par vente (70 %).</p>
              }
            </div>
            @if (creatingMix()) {
              <p class="text-center text-yam-orange text-sm mb-4 animate-pulse">FFmpeg genere ton mix... (1-2 min)</p>
            }
            @if (mixUrl()) {
              <a [href]="mixUrl()" target="_blank" rel="noopener" class="yam-btn-primary w-full block text-center mb-2">▶ Ecouter le mix</a>
            }
            <button (click)="createMixtape()" [disabled]="creatingMix()" class="yam-btn-secondary w-full">
              {{ creatingMix() ? 'Generation en cours...' : 'Generer le mix' }}
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export class DjStudioComponent implements OnInit, OnDestroy, AfterViewInit {
  private djService = inject(DjService);
  private trackService = inject(TrackService);
  private destroy$ = new Subject<void>();

  library = signal<Track[]>([]);
  filteredLibrary = signal<Track[]>([]);
  selected = signal<Track[]>([]);
  filter = '';
  genreFilter = 'all';
  ytExcluded = 0;

  analysis = signal<string | null>(null);
  mixModalVisible = signal(false);
  mixTitle = 'Mon mix YAM';
  crossfadeSec = 8;
  autoOrder = true;
  mixPriceXof = 0;

  djSharePreview(): number {
    return Math.floor((this.mixPriceXof || 0) * 70 / 100);
  }
  creatingMix = signal(false);
  mixUrl = signal<string | null>(null);

  mixtapes = signal<Mixtape[]>([]);
  mixPlayingId = signal<string | null>(null);
  confirmDeleteMixId = signal<string | null>(null);
  deletingMixId = signal<string | null>(null);
  mixMessage = signal<string | null>(null);
  mixMessageOk = signal(false);
  private mixAudio: HTMLAudioElement | null = null;
  private mixConfirmTimer: any = null;
  private mixMessageTimer: any = null;

  crossfade = signal(0.5);
  masterVolume = signal(0.9);

  decks: any[] = [];

  // Web Audio
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private rafId: any = null;

  private canvases = new Map<string, HTMLCanvasElement>();
  private canvasRefs = viewChildren<ElementRef<HTMLCanvasElement>>('deckCanvas');

  ngAfterViewInit(): void {
    // Associe chaque canvas a son deck (ordre du template = A puis B)
    const els = this.canvasRefs();
    els.forEach((el, i) => {
      if (this.decks[i]) this.canvases.set(this.decks[i].id, el.nativeElement);
    });
  }

  ngOnInit(): void {
    this.decks = [this.newDeck('A'), this.newDeck('B')];
    this.initAudioContext();
    this.loadLibrary();
    this.loadMyMixtapes();
    this.startRenderLoop();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.decks.forEach(d => this.teardownDeck(d));
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.mixConfirmTimer) clearTimeout(this.mixConfirmTimer);
    if (this.mixMessageTimer) clearTimeout(this.mixMessageTimer);
    this.stopMixtape();
    this.ctx?.close();
  }

  private newDeck(id: string): any {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.preservesPitch = false; // VRAI pitch DJ (le ton suit le tempo)
    const deck: any = {
      id, audio, hls: null, track: null, playing: false, pitch: 0, volume: 1,
      gainNode: null, filterNode: null, delayNode: null, delayGain: null,
      delayFeedback: null, reverbNode: null, reverbGain: null, analyser: null,
      filterOn: false, delayOn: false, reverbOn: false, active: false,
      position: 0, duration: 0, vu: 0,
      cues: [null, null, null, null],
      loop: null as { active: boolean; start: number; bars: number } | null
    };

    audio.addEventListener('timeupdate', () => {
      deck.position = audio.currentTime;
      // Boucle active : replay auto
      if (deck.loop?.active) {
        const len = this.loopLength(deck);
        if (audio.currentTime >= deck.loop.start + len) {
          audio.currentTime = deck.loop.start;
        }
      }
    });
    audio.addEventListener('durationchange', () => {
      if (isFinite(audio.duration)) deck.duration = audio.duration;
    });
    audio.addEventListener('playing', () => { deck.playing = true; });
    audio.addEventListener('pause', () => { deck.playing = false; });
    audio.addEventListener('ended', () => {
      deck.playing = false;
      deck.loop = null;
    });
    audio.addEventListener('error', () => {
      if (deck.track) {
        deck.playing = false;
        // Fallback URL directe (si HLS a echoue et qu'un MP3 existe)
        const direct = deck.track.audioUrlHq || deck.track.audioUrlLq;
        if (direct && !direct.endsWith('.m3u8') && deck.hls) {
          this.teardownHls(deck);
          audio.src = direct;
          audio.play().catch(() => {});
        }
      }
    });
    return deck;
  }

  /** Câblage Web Audio CORRIGE : dry + wet separe, feedback, limiteur master. */
  private initAudioContext(): void {
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      // Limiteur master : protege la sortie des saturations 2 decks + effets
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);

      this.decks.forEach(deck => {
        const source = this.ctx!.createMediaElementSource(deck.audio);
        const gain = this.ctx!.createGain();
        gain.gain.value = 1;

        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 20000;

        const delay = this.ctx!.createDelay(2.0);
        delay.delayTime.value = 0.35;
        const delayGain = this.ctx!.createGain();
        delayGain.gain.value = 0;          // wet OFF par defaut
        const delayFeedback = this.ctx!.createGain();
        delayFeedback.gain.value = 0.35;   // boucle d'echo reglable

        const reverb = this.ctx!.createConvolver();
        reverb.buffer = this.makeReverbIR(1.8);
        const reverbGain = this.ctx!.createGain();
        reverbGain.gain.value = 0;

        const analyser = this.ctx!.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        // === CABLAGE CORRIGE ===
        // dry :  source -> filter -> gain
        source.connect(filter);
        filter.connect(gain);
        // wet :  filter -> delay -> delayGain -> gain   (AVANT : delay->gain direct
        //        = echo permanent plein pot, meme bouton OFF)
        filter.connect(delay);
        delay.connect(delayGain);
        delayGain.connect(gain);
        // feedback : delay -> feedback -> delay (vrai echo multiple)
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        // reverb : filter -> reverb -> reverbGain -> gain
        filter.connect(reverb);
        reverb.connect(reverbGain);
        reverbGain.connect(gain);
        // analyse (post-fader, pour un VU realiste)
        gain.connect(analyser);
        gain.connect(this.master!);

        deck.gainNode = gain;
        deck.filterNode = filter;
        deck.delayNode = delay;
        deck.delayGain = delayGain;
        deck.delayFeedback = delayFeedback;
        deck.reverbNode = reverb;
        deck.reverbGain = reverbGain;
        deck.analyser = analyser;
      });
    } catch {
      this.ctx = null;
    }
  }

  private makeReverbIR(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.floor(seconds * rate);
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return ir;
  }

  // ================= BIBLIOTHEQUE =================

  loadLibrary(): void {
    this.djService.studioLibrary().pipe(takeUntil(this.destroy$)).subscribe({
      next: (page: any) => {
        const all: Track[] = page.content || [];
        // Seules les pistes avec un VRAI fichier audio sont mixables
        this.ytExcluded = all.filter(t => !t.audioUrlHq && !t.audioUrlLq).length;
        this.library.set(all.filter(t => t.audioUrlHq || t.audioUrlLq));
        this.filterLibrary();
      },
      error: () => {
        this.library.set([]);
        this.filterLibrary();
      }
    });
  }

  filterLibrary(): void {
    let items = this.library();
    if (this.genreFilter !== 'all') items = items.filter(t => t.genre === this.genreFilter);
    if (this.filter.trim()) {
      const q = this.filter.toLowerCase();
      items = items.filter(t =>
        t.title.toLowerCase().includes(q)
        || (t.artistName || '').toLowerCase().includes(q)
        || String(t.bpm || '').includes(q));
    }
    this.filteredLibrary.set(items);
  }

  /** Charge une piste dans le deck CHOISI (boutons A/B). */
  loadDeck(track: Track, deck: any): void {
    if (deck.playing) return; // jamais couper un deck en lecture
    this.teardownDeck(deck);
    deck.track = track;
    deck.pitch = 0;                 // reset pitch (ancienne piste n'herite plus)
    deck.audio.preservesPitch = false;
    deck.audio.playbackRate = 1;
    deck.cues = [null, null, null, null];
    deck.loop = null;
    deck.position = 0;
    deck.duration = track.durationSec || 0;

    // Chargement via l'API stream (moderation + qualite + fallback)
    this.trackService.streamUrl(track.id, 'hq').pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: { url: string }) => this.attachDeckSource(deck, res.url),
      error: () => {
        const fallback = track.audioUrlHq || track.audioUrlLq;
        if (fallback) this.attachDeckSource(deck, fallback);
      }
    });
  }

  private attachDeckSource(deck: any, url: string): void {
    this.teardownHls(deck);
    if (url.endsWith('.m3u8') && Hls.isSupported()) {
      // HLS via hls.js : OBLIGATOIRE sur Chrome/Android (pas de HLS natif)
      deck.hls = new Hls({ maxBufferLength: 20 });
      deck.hls.loadSource(url);
      deck.hls.attachMedia(deck.audio);
    } else {
      deck.audio.src = url;
    }
  }

  ejectDeck(deck: any): void {
    if (this.confirmEjectTimer) { clearTimeout(this.confirmEjectTimer); this.confirmEjectTimer = null; }
    const doEject = () => {
      this.teardownDeck(deck);
      deck.track = null;
      deck.active = false;
    };
    if (deck.playing) {
      // double protection : premier clic arrete, l'eject est immediate apres pause
      deck.audio.pause();
    }
    doEject();
  }
  private confirmEjectTimer: any = null;

  private teardownDeck(deck: any): void {
    deck.audio.pause();
    deck.audio.removeAttribute('src');
    this.teardownHls(deck);
    deck.playing = false;
    deck.loop = null;
    deck.position = 0;
    deck.duration = 0;
    deck.vu = 0;
  }

  private teardownHls(deck: any): void {
    if (deck.hls) {
      try { deck.hls.destroy(); } catch { }
      deck.hls = null;
    }
  }

  toggleDeck(deck: any): void {
    if (!deck.track) return;
    if (deck.playing) {
      deck.audio.pause();
    } else {
      this.ctx?.resume().catch(() => {});
      deck.audio.play().catch(() => { deck.playing = false; });
      deck.active = true;
    }
  }

  playPreview(item: Track): void {
    // Pre-ecoute rapide dans le deck libre
    const target = this.decks.find(d => !d.playing) || this.decks[0];
    this.loadDeck(item, target);
    this.toggleDeck(target);
  }

  seekDeck(deck: any, event: MouseEvent): void {
    if (!deck.track || !deck.duration) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    deck.audio.currentTime = Math.max(0, Math.min(deck.duration, ratio * deck.duration));
  }

  setPitch(deck: any, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    deck.pitch = value;
    deck.audio.playbackRate = 1 + value / 100;
  }

  resetPitch(deck: any): void {
    deck.pitch = 0;
    deck.audio.playbackRate = 1;
  }

  /** Volume deck : conserve le facteur crossfader (fix du saut de niveau). */
  setDeckVolume(deck: any, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    deck.volume = value;
    this.applyDeckGain(deck);
  }

  private applyDeckGain(deck: any): void {
    if (!deck.gainNode) return;
    const x = this.crossfade();
    const factor = deck.id === 'A' ? (1 - x) : x;
    deck.gainNode.gain.value = deck.volume * factor;
  }

  setCrossfade(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.crossfade.set(value);
    this.decks.forEach(d => this.applyDeckGain(d));
  }

  setMasterVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.masterVolume.set(value);
    if (this.master) this.master.gain.value = value;
  }

  toggleEffect(deck: any, effect: 'filter' | 'delay' | 'reverb'): void {
    if (effect === 'filter') {
      deck.filterOn = !deck.filterOn;
      if (deck.filterNode) {
        deck.filterNode.frequency.setTargetAtTime(deck.filterOn ? 800 : 20000,
          this.ctx?.currentTime || 0, 0.05); // transition douce, pas de clic
      }
    } else if (effect === 'delay') {
      deck.delayOn = !deck.delayOn;
      if (deck.delayGain) {
        deck.delayGain.gain.setTargetAtTime(deck.delayOn ? 0.35 : 0,
          this.ctx?.currentTime || 0, 0.05);
      }
    } else {
      deck.reverbOn = !deck.reverbOn;
      if (deck.reverbGain) {
        deck.reverbGain.gain.setTargetAtTime(deck.reverbOn ? 0.3 : 0,
          this.ctx?.currentTime || 0, 0.05);
      }
    }
  }

  // ================= HOT CUES + BOUCLES =================

  hotCue(deck: any, index: number): void {
    const cue = deck.cues[index];
    if (cue != null) {
      deck.audio.currentTime = cue;
      if (!deck.playing) this.toggleDeck(deck);
    } else {
      deck.cues[index] = deck.audio.currentTime;
    }
  }

  clearCue(deck: any, index: number, event: Event): void {
    if ((event as any).shiftKey) {
      deck.cues[index] = null;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  toggleLoop(deck: any, bars: number): void {
    if (deck.loop?.active && deck.loop.bars === bars) {
      deck.loop = null;
      return;
    }
    const bpm = deck.track?.bpm || 100;
    deck.loop = { active: true, start: deck.audio.currentTime, bars };
    if (!deck.playing) this.toggleDeck(deck);
    void bpm;
  }

  loopLength(deck: any): number {
    if (!deck.loop) return 0;
    const bpm = deck.track?.bpm || 100;
    return deck.loop.bars * 4 * (60 / bpm);
  }

  // ================= SYNC BPM (half/double auto) =================

  syncBpm(): void {
    const a = this.decks[0], b = this.decks[1];
    if (!a.track?.bpm || !b.track?.bpm) {
      this.analysis.set('BPM manquant sur une piste — sync impossible.');
      return;
    }
    let ratio = a.track.bpm / b.track.bpm;
    // half/double-time : si l'ecart depasse 8 %, on teste x2 et /2
    while (ratio > 1.08) ratio /= 2;
    while (ratio < 0.92) ratio *= 2;
    if (ratio > 0.92 && ratio < 1.08) {
      const pitch = (ratio - 1) * 100;
      b.pitch = Math.max(-8, Math.min(8, pitch));
      b.audio.playbackRate = 1 + b.pitch / 100;
      const mode = a.track.bpm / b.track.bpm > 1.08 ? ' (half/double-time applique)' : '';
      this.analysis.set(`Sync : Deck B aligne sur ${a.track.bpm} BPM (pitch ${b.pitch >= 0 ? '+' : ''}${b.pitch.toFixed(1)}%)${mode}.`);
    } else {
      this.analysis.set(`Ecart de BPM trop important (${a.track.bpm} vs ${b.track.bpm} BPM) — choisis une autre piste.`);
    }
  }

  isSelected(track: Track): boolean {
    return !!this.selected().find(t => t.id === track.id);
  }

  toggleSelect(track: Track): void {
    if (this.isSelected(track)) {
      this.selected.set(this.selected().filter(t => t.id !== track.id));
    } else {
      this.selected.set([...this.selected(), track]);
    }
  }

  autoMix(): void {
    const ids = this.selected().map(t => t.id);
    this.djService.suggestAutoMix(ids).pipe(takeUntil(this.destroy$)).subscribe({
      next: suggestion => {
        this.analysis.set(suggestion.analysis);
        const ordered = suggestion.orderedTrackIds
          .map((id: string) => this.library().find(t => t.id === id))
          .filter((t: Track | undefined): t is Track => !!t);
        this.selected.set(ordered);
        if (ordered.length >= 2) {
          this.loadDeck(ordered[0], this.decks[0]);
          this.loadDeck(ordered[1], this.decks[1]);
        }
      },
      error: () => this.analysis.set('Auto-Mix IA indisponible pour le moment.')
    });
  }

  createMixtape(): void {
    this.creatingMix.set(true);
    this.mixUrl.set(null);
    this.djService.createMixtape({
      title: this.mixTitle,
      trackIds: this.selected().map(t => t.id),
      crossfadeSec: this.crossfadeSec,
      autoOrder: this.autoOrder,
      priceXof: this.mixPriceXof || 0
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: mix => {
        this.creatingMix.set(false);
        this.djService.mixtapeStreamUrl(mix.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: res => this.mixUrl.set(res.url),
          error: () => this.mixUrl.set(null)
        });
        this.analysis.set('Mixtape generee : ' + mix.title + ' (' + mix.durationSec + ' s).');
        this.loadMyMixtapes();
      },
      error: err => {
        this.creatingMix.set(false);
        this.analysis.set(err?.error?.message || 'Echec de la generation du mix (verifie que les pistes ont un fichier audio).');
      }
    });
  }

  // ================= MES MIXTAPES =================

  loadMyMixtapes(): void {
    this.djService.myMixtapes().pipe(takeUntil(this.destroy$)).subscribe({
      next: list => this.mixtapes.set(list || []),
      error: () => this.mixtapes.set([])
    });
  }

  playMixtape(mix: Mixtape): void {
    if (this.mixPlayingId() === mix.id) {
      this.stopMixtape();
      return;
    }
    this.stopMixtape();
    this.djService.mixtapeStreamUrl(mix.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.mixAudio = new Audio(res.url);
        this.mixPlayingId.set(mix.id);
        this.mixAudio.addEventListener('ended', () => this.stopMixtape());
        this.mixAudio.play().catch(() => this.stopMixtape());
        this.djService.registerMixtapePlay(mix.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.mixtapes.set(this.mixtapes().map(m => m.id === mix.id ? { ...m, playCount: m.playCount + 1 } : m));
          },
          error: () => {}
        });
      },
      error: () => this.showMixMessage('Lecture du mix impossible pour le moment.', false)
    });
  }

  stopMixtape(): void {
    if (this.mixAudio) {
      this.mixAudio.pause();
      this.mixAudio.src = '';
      this.mixAudio = null;
    }
    this.mixPlayingId.set(null);
  }

  askDeleteMixtape(mix: Mixtape): void {
    if (this.deletingMixId()) return;
    if (this.confirmDeleteMixId() === mix.id) {
      this.confirmDeleteMixId.set(null);
      if (this.mixConfirmTimer) clearTimeout(this.mixConfirmTimer);
      this.deleteMixtape(mix);
    } else {
      this.confirmDeleteMixId.set(mix.id);
      if (this.mixConfirmTimer) clearTimeout(this.mixConfirmTimer);
      this.mixConfirmTimer = setTimeout(() => this.confirmDeleteMixId.set(null), 4000);
    }
  }

  private deleteMixtape(mix: Mixtape): void {
    this.deletingMixId.set(mix.id);
    this.djService.deleteMixtape(mix.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.deletingMixId.set(null);
        if (this.mixPlayingId() === mix.id) this.stopMixtape();
        this.mixtapes.set(this.mixtapes().filter(m => m.id !== mix.id));
        this.showMixMessage('Mixtape supprimee', true);
      },
      error: err => {
        this.deletingMixId.set(null);
        this.showMixMessage(err?.error?.message || 'Echec de la suppression.', false);
      }
    });
  }

  private showMixMessage(msg: string, ok: boolean): void {
    this.mixMessage.set(msg);
    this.mixMessageOk.set(ok);
    if (this.mixMessageTimer) clearTimeout(this.mixMessageTimer);
    this.mixMessageTimer = setTimeout(() => this.mixMessage.set(null), 4000);
  }

  // ================= RENDU WAVEFORM + VU =================

  /** Enregistre les canvas (appele depuis le template via @ref). */
  registerCanvas(deckId: string, el: HTMLCanvasElement): void {
    this.canvases.set(deckId, el);
  }

  private startRenderLoop(): void {
    const draw = () => {
      this.decks.forEach(deck => this.drawDeck(deck));
      this.rafId = requestAnimationFrame(draw);
    };
    this.rafId = requestAnimationFrame(draw);
  }

  private drawDeck(deck: any): void {
    const canvas = this.canvases.get(deck.id);
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    // taille reelle (dpr)
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);

    if (!deck.analyser || !deck.track) return;
    const n = deck.analyser.frequencyBinCount;
    const data = new Uint8Array(n);
    deck.analyser.getByteFrequencyData(data);

    // Spectre live (barres)
    const bars = Math.min(48, Math.floor(w / 5));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = data[Math.floor((i / bars) * (n * 0.7))] / 255;
      const bh = Math.max(2, v * h * 0.92);
      const hue = 18 + (i / bars) * 28; // degrade orange->or
      ctx2d.fillStyle = `hsl(${hue}, 90%, ${deck.playing ? 55 : 38}%)`;
      ctx2d.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }

    // Progression (ligne de lecture)
    if (deck.duration > 0) {
      const x = (deck.position / deck.duration) * w;
      ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
      ctx2d.fillRect(x - 1, 0, 2, h);
      // zone jouee legerement voilee
      ctx2d.fillStyle = 'rgba(255,107,53,0.12)';
      ctx2d.fillRect(0, 0, x, h);
    }

    // VU (RMS en domaine temps)
    const td = new Uint8Array(deck.analyser.fftSize);
    deck.analyser.getByteTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i++) {
      const v = (td[i] - 128) / 128;
      sum += v * v;
    }
    deck.vu = Math.min(1, Math.sqrt(sum / td.length) * 2.2);
  }

  // ================= FORMATAGE =================

  fmt(sec: number): string {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  formatDuration(sec: number): string { return this.fmt(sec); }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
}
