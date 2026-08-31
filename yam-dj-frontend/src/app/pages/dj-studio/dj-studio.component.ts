import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DjService } from '../../services/dj.service';
import { Track } from '../../models/models';

/**
 * STUDIO DJ — 2 PLATINES WEB.
 *
 * Chaque deck : waveform (canvas), play/pause, pitch BPM (+-8%),
 * volume deck + master, crossfader.
 * Effets nightclub : filtre (LPF) + delay + reverb par deck.
 * AUTO-MIX IA : bouton qui ordonne la selection via l'API backend
 * (Camelot + BPM) puis enchainement harmonique automatique.
 */
@Component({
  selector: 'yam-dj-studio',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-10">
      <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 class="yam-title">🎚️ Studio DJ</h1>
          <p class="text-white/50 text-sm">2 platines, crossfade, effets — mixe comme en boite.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button (click)="loadLibrary()" class="yam-btn-secondary text-sm">🔄 Rafraichir la bibliotheque</button>
          <button (click)="autoMix()" [disabled]="selected().length < 2"
                  class="yam-btn-primary text-sm">
            🤖 Auto-Mix IA ({{ selected().length }} pistes)
          </button>
        </div>
      </div>

      <!-- Analyse IA -->
      @if (analysis()) {
        <div class="yam-card p-4 mb-6 border-yam-orange/30 bg-yam-orange/5">
          <p class="text-sm text-yam-orange font-medium">🤖 {{ analysis() }}</p>
        </div>
      }

      <!-- LES 2 PLATINES -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        @for (deck of decks; track deck.id) {
          <div class="yam-card p-5" [class]="deck.active ? 'border-yam-orange/50' : ''">
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-bold text-lg">Deck {{ deck.id === 'A' ? 'A' : 'B' }} <span class="text-yam-orange">⚫</span></h2>
              @if (deck.track) {
                <div class="text-right min-w-0">
                  <p class="font-semibold truncate max-w-[180px]">{{ deck.track.title }}</p>
                  <p class="text-white/50 text-xs truncate max-w-[180px]">{{ deck.track.artistName }}
                    @if (deck.track.bpm) { · {{ deck.track.bpm }} BPM }
                    @if (deck.track.camelot) { · {{ deck.track.camelot }} }
                  </p>
                </div>
              }
            </div>

            <!-- Waveform -->
            <div class="h-20 rounded-xl bg-black/40 mb-4 overflow-hidden relative cursor-pointer"
                 [id]="'waveform-' + deck.id">
              <div class="absolute inset-0 flex items-center justify-center text-white/20 text-sm">
                @if (deck.track) { Waveform {{ deck.id }} } @else { Charge une piste ci-dessous }
              </div>
            </div>

            <!-- Controles -->
            <div class="flex items-center gap-3 mb-4">
              <button (click)="toggleDeck(deck)" class="w-12 h-12 rounded-full bg-white text-yam-dark text-xl font-bold hover:scale-105 active:scale-95 transition shrink-0">
                {{ deck.playing ? '⏸' : '▶' }}
              </button>
              <div class="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-white/40 block mb-1">Pitch {{ deck.pitch >= 0 ? '+' : '' }}{{ deck.pitch.toFixed(1) }}%</label>
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

            <!-- Effets nightclub -->
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

      <!-- CROSSFADER + MASTER -->
      <div class="yam-card p-5 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div>
            <label class="text-xs text-white/40 block mb-2">CROSSFADER (A ⟷ B)</label>
            <input type="range" min="0" max="1" step="0.01" [value]="crossfade()"
                   (input)="setCrossfade($event)" class="w-full h-2 accent-yam-orange cursor-pointer">
            <div class="flex justify-between text-xs text-white/30 mt-1"><span>DECK A</span><span>DECK B</span></div>
          </div>
          <div>
            <label class="text-xs text-white/40 block mb-2">MASTER VOLUME</label>
            <input type="range" min="0" max="1" step="0.05" [value]="masterVolume()"
                   (input)="setMasterVolume($event)" class="w-full h-2 accent-yam-gold cursor-pointer">
          </div>
          <div class="text-center">
            <div class="text-xs text-white/40 mb-1">BPM SYNC</div>
            <button (click)="syncBpm()" class="yam-btn-secondary !py-2 text-sm w-full"
                    [disabled]="!decks[0].track || !decks[1].track">⚡ Sync Deck B sur A</button>
          </div>
        </div>
      </div>

      <!-- Bibliothque du studio -->
      <section>
        <h2 class="text-xl font-bold mb-4">🎵 Bibliotheque du studio
          <span class="text-white/40 text-sm">— clique pour charger dans le deck libre</span>
        </h2>

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
              <button (click)="loadDeck(item)" class="w-10 h-10 rounded-full bg-yam-orange/20 text-yam-orange flex items-center justify-center hover:bg-yam-orange hover:text-white transition shrink-0">▶</button>
              <div class="min-w-0 flex-1 cursor-pointer" (click)="loadDeck(item)">
                <p class="font-medium truncate">{{ item.title }}</p>
                <p class="text-white/40 text-xs truncate">{{ item.artistName }} · {{ item.genre }}
                  @if (item.bpm) { · {{ item.bpm }} BPM } @if (item.camelot) { · 🎹 {{ item.camelot }} }
                </p>
              </div>
              <button (click)="toggleSelect(item)"
                      class="w-9 h-9 rounded-full border flex items-center justify-center text-sm transition shrink-0"
                      [class]="isSelected(item) ? 'bg-yam-orange border-yam-orange text-white' : 'border-white/20 text-white/40'">
                {{ isSelected(item) ? '✓' : '+' }}
              </button>
            </div>
          } @empty {
            <div class="yam-card p-10 text-center text-white/40">
              <div class="text-4xl mb-2">🎼</div>
              Chargement de la bibliotheque...
            </div>
          }
        </div>
      </section>

      <!-- Creation mixtape -->
      @if (selected().length >= 2) {
        <div class="fixed bottom-24 right-4 z-40">
          <button (click)="mixModalVisible.set(true)" class="yam-btn-primary !px-6 !py-3 shadow-2xl">
            🎛️ Creer une mixtape ({{ selected().length }})
          </button>
        </div>
      }

      <!-- Modal mixtape -->
      @if (mixModalVisible()) {
        <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" (click)="mixModalVisible.set(false)">
          <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10" (click)="$event.stopPropagation()">
            <h2 class="yam-title mb-4">🎛️ Nouvelle mixtape</h2>
            <label class="text-sm text-white/60 mb-1 block">Titre du mix</label>
            <input type="text" [(ngModel)]="mixTitle" placeholder="Mix Nuit Ouaga Vol.1" class="yam-input mb-4">
            <label class="text-sm text-white/60 mb-1 block">Crossfade : {{ crossfadeSec }} secondes</label>
            <input type="range" min="2" max="16" [(ngModel)]="crossfadeSec" class="w-full h-2 accent-yam-orange cursor-pointer mb-4">
            <label class="flex items-center gap-2 text-sm text-white/60 cursor-pointer mb-4">
              <input type="checkbox" [(ngModel)]="autoOrder" class="accent-yam-orange w-4 h-4">
              Ordonner avec l'Auto-Mix IA (Camelot + BPM)
            </label>
            @if (creatingMix()) {
              <p class="text-center text-yam-orange text-sm mb-4 animate-pulse">FFmpeg genere ton mix... (ca peut prendre 1-2 min)</p>
            }
            @if (mixUrl()) {
              <a [href]="mixUrl()" target="_blank" class="yam-btn-primary w-full block text-center mb-2">▶ Ecouter le mix</a>
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
export class DjStudioComponent implements OnInit, OnDestroy {
  private djService = inject(DjService);

  library = signal<Track[]>([]);
  filteredLibrary = signal<Track[]>([]);
  selected = signal<Track[]>([]);
  filter = '';
  genreFilter = 'all';

  analysis = signal<string | null>(null);
  mixModalVisible = signal(false);
  mixTitle = 'Mon mix YAM';
  crossfadeSec = 8;
  autoOrder = true;
  creatingMix = signal(false);
  mixUrl = signal<string | null>(null);

  crossfade = signal(0.5);
  masterVolume = signal(0.9);

  decks: any[] = [];

  // Web Audio par deck
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  ngOnInit(): void {
    this.decks = [
      this.newDeck('A'),
      this.newDeck('B')
    ];
    this.initAudioContext();
    this.loadLibrary();
  }

  ngOnDestroy(): void {
    this.decks.forEach(d => d.audio.pause());
    this.ctx?.close();
  }

  private newDeck(id: string): any {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    return {
      id, audio, track: null, playing: false, pitch: 0, volume: 1,
      gainNode: null, filterNode: null, delayNode: null, delayGain: null,
      reverbNode: null, reverbGain: null,
      filterOn: false, delayOn: false, reverbOn: false, active: false
    };
  }

  private initAudioContext(): void {
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

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
        delayGain.gain.value = 0;

        const reverb = this.ctx!.createConvolver();
        reverb.buffer = this.makeReverbIR(1.8);
        const reverbGain = this.ctx!.createGain();
        reverbGain.gain.value = 0;

        source.connect(filter);
        filter.connect(delay);
        delay.connect(gain);
        filter.connect(gain);
        filter.connect(reverb);
        reverb.connect(reverbGain);
        reverbGain.connect(gain);
        delayGain.connect(gain);
        delay.connect(delayGain);

        gain.connect(this.master!);
        deck.gainNode = gain;
        deck.filterNode = filter;
        deck.delayNode = delay;
        deck.delayGain = delayGain;
        deck.reverbNode = reverb;
        deck.reverbGain = reverbGain;
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

  loadLibrary(): void {
    this.djService.studioLibrary().subscribe({
      next: (page: any) => {
        this.library.set(page.content || []);
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
        || t.artistName.toLowerCase().includes(q)
        || String(t.bpm || '').includes(q));
    }
    this.filteredLibrary.set(items);
  }

  loadDeck(track: Track): void {
    // Deck libre = celui qui ne joue pas, sinon remplace le deck A
    const target = this.decks.find(d => !d.playing && !d.track) || this.decks.find(d => !d.playing) || this.decks[0];
    target.track = track;
    target.audio.src = track.audioUrlHq || track.audioUrlLq || '';
    target.playing = false;
    this.decks = [...this.decks];
  }

  toggleDeck(deck: any): void {
    if (!deck.track) return;
    if (deck.playing) {
      deck.audio.pause();
      deck.playing = false;
    } else {
      this.ctx?.resume();
      deck.audio.play().catch(() => {});
      deck.playing = true;
      deck.active = true;
    }
    this.decks = [...this.decks];
  }

  setPitch(deck: any, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    deck.pitch = value;
    deck.audio.playbackRate = 1 + value / 100;
    this.decks = [...this.decks];
  }

  setDeckVolume(deck: any, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    deck.volume = value;
    if (deck.gainNode) deck.gainNode.gain.value = value;
    this.decks = [...this.decks];
  }

  setCrossfade(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.crossfade.set(value);
    // A = 1 - x ; B = x
    const [a, b] = this.decks;
    if (a?.gainNode) a.gainNode.gain.value = a.volume * (1 - value);
    if (b?.gainNode) b.gainNode.gain.value = b.volume * value;
  }

  setMasterVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.masterVolume.set(value);
    if (this.master) this.master.gain.value = value;
  }

  toggleEffect(deck: any, effect: 'filter' | 'delay' | 'reverb'): void {
    if (effect === 'filter') {
      deck.filterOn = !deck.filterOn;
      if (deck.filterNode) deck.filterNode.frequency.value = deck.filterOn ? 800 : 20000;
    } else if (effect === 'delay') {
      deck.delayOn = !deck.delayOn;
      if (deck.delayGain) deck.delayGain.gain.value = deck.delayOn ? 0.35 : 0;
    } else {
      deck.reverbOn = !deck.reverbOn;
      if (deck.reverbGain) deck.reverbGain.gain.value = deck.reverbOn ? 0.3 : 0;
    }
    this.decks = [...this.decks];
  }

  /** Sync : aligne le tempo du deck B sur le deck A (pitch auto). */
  syncBpm(): void {
    const a = this.decks[0], b = this.decks[1];
    if (a.track?.bpm && b.track?.bpm) {
      const ratio = a.track.bpm / b.track.bpm;
      if (ratio > 0.92 && ratio < 1.08) {
        const pitch = (ratio - 1) * 100;
        b.pitch = Math.max(-8, Math.min(8, pitch));
        b.audio.playbackRate = 1 + b.pitch / 100;
        this.analysis.set(`Sync effectue : Deck B aligne sur ${a.track.bpm} BPM (pitch ${b.pitch >= 0 ? '+' : ''}${b.pitch.toFixed(1)}%).`);
        this.decks = [...this.decks];
      } else {
        this.analysis.set(`Ecart de BPM trop important (${a.track.bpm} vs ${b.track.bpm}). L'IA recommande de choisir une autre piste.`);
      }
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

  /** AUTO-MIX IA : ordonnancement harmonique via le backend. */
  autoMix(): void {
    const ids = this.selected().map(t => t.id);
    this.djService.suggestAutoMix(ids).subscribe({
      next: suggestion => {
        this.analysis.set(suggestion.analysis);
        // Reordonner la selection selon l'ordre IA
        const ordered = suggestion.orderedTrackIds
          .map((id: string) => this.library().find(t => t.id === id))
          .filter((t: Track | undefined): t is Track => !!t);
        this.selected.set(ordered);
        // Chargement auto des 2 premieres pistes dans les decks
        if (ordered.length >= 2) {
          this.loadDeck(ordered[0]);
          this.loadDeck(ordered[1]);
        }
      },
      error: () => {
        this.analysis.set('Auto-Mix IA indisponible pour le moment.');
      }
    });
  }

  createMixtape(): void {
    this.creatingMix.set(true);
    this.mixUrl.set(null);
    this.djService.createMixtape({
      title: this.mixTitle,
      trackIds: this.selected().map(t => t.id),
      crossfadeSec: this.crossfadeSec,
      autoOrder: this.autoOrder
    }).subscribe({
      next: mix => {
        this.creatingMix.set(false);
        this.djService.mixtapeStreamUrl(mix.id).subscribe({
          next: res => this.mixUrl.set(res.url),
          error: () => this.mixUrl.set(null)
        });
        this.analysis.set('Mixtape generee : ' + mix.title + ' (' + mix.durationSec + ' s).');
      },
      error: err => {
        this.creatingMix.set(false);
        this.analysis.set(err?.error?.message || 'Echec de la generation du mix.');
      }
    });
  }
}
