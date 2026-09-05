import { Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, AfterViewInit, inject, signal, viewChildren, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { DjService } from '../../services/dj.service';
import { DjLiveService } from '../../services/dj-live.service';
import { TrackService } from '../../services/track.service';
import { Mixtape, Track } from '../../models/models';
import { DjDeck, DjEngine, detectBpm } from './dj-engine';
import { IconComponent } from '../../components/icon/icon.component';
import { estimateCamelot } from './mix-analyzer';
import { MixPlan, MixParams, MixTransition, MOODS, TRANSITION_INFO, TransitionType, Mood, planAutoMix } from './auto-mix-planner';
import { LocalFileEntry } from '../../services/dj-live.service';

/**
 * ============================================================================
 *  STUDIO DJ PRO — console de mixage reelle (remplacement complet V2)
 * ============================================================================
 *  - 2 decks Web Audio (AudioBuffer) charges depuis le rendu HLS :
 *    telechargement des segments + extraction AAC + decodage navigateur ;
 *  - waveform REELLE (pics du signal), grille de temps (BPM), playhead ;
 *  - CUE / hot cues 4 pads / boucles 1-16 temps exactes a l'echantillon ;
 *  - pitch ±8 % (le ton suit le tempo, comme une vraie platine vinyle) ;
 *  - EQ 3 bandes, filtre bipolaire, echo synchronise au BPM, reverb ;
 *  - crossfader equal-power, limiteur master, VU live ;
 *  - SYNC B vers A (half/double auto) + harmonie Camelot A<->B ;
 *  - ENREGISTREMENT du mix de sortie (MediaRecorder) + publication en
 *    mixtape (MP3 transcode cote serveur) ou telechargement local ;
 *  - MIX AUTO : DJ IA complet (selection, courbe d'energie, BPM, Camelot,
 *    8 types de transitions, analyse reelle au chargement) ;
 *  - LECTURE EN ARRIERE-PLAN : le moteur vit dans DjLiveService — la
 *    musique continue quand on quitte le studio (indicateur navbar) ;
 *  - raccourcis clavier (Espace, fleches, S, 1-4).
 */
@Component({
  selector: 'yam-dj-studio',
  standalone: true,
  imports: [FormsModule, IconComponent],
  styles: [`
    .dj-console-grid { display: grid; grid-template-columns: 1fr 235px 1fr; grid-template-areas: 'deck-a mixer deck-b'; }
    @media (max-width: 1023px) {
      .dj-console-grid { grid-template-columns: 1fr; grid-template-areas: 'mixer' 'deck-a' 'deck-b'; }
    }
    /* Ecran "console" : sombre dans les DEUX themes (c'est un scope audio,
       comme un vrai ecran de platine) — les textes dedans restent clairs. */
    .dj-scope { background: #0A0A15; }
    .dj-t90 { color: rgba(247, 245, 242, .92); }
    .dj-t50 { color: rgba(247, 245, 242, .55); }
    .dj-t20 { color: rgba(247, 245, 242, .28); }
    .dj-crossfader::-webkit-slider-thumb {
      width: 26px; height: 26px; border-radius: 8px;
      background: linear-gradient(135deg, #FF6B35, #FFD166);
      box-shadow: 0 2px 10px rgba(0, 0, 0, .6);
    }
    @keyframes dj-rec-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
    .dj-rec-dot { animation: dj-rec-blink 1.1s infinite; }
    canvas.dj-wave { image-rendering: auto; }
  `],
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-6 pb-24">

      <!-- ============ EN-TETE ============ -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p class="yam-kicker">Console de mixage</p>
          <h1 class="yam-title">Studio DJ <span class="yam-gradient-text">PRO</span></h1>
          <p class="text-white/50 text-sm">Moteur Web Audio réel : waveform, EQ, effets, sync BPM, boucles précises — et Mix Auto, ton DJ IA. La musique continue en arrière-plan.</p>
        </div>
        <div class="flex gap-2 flex-wrap items-center">
          <button (click)="toggleHelp()" class="yam-btn-secondary text-sm flex items-center gap-1.5"><yam-icon name="book-open" [size]="14"/> Aide</button>
          <button (click)="loadLibrary()" class="yam-btn-secondary text-sm flex items-center gap-1.5"><yam-icon name="history" [size]="14"/> Bibliothèque</button>
        </div>
      </div>

      <!-- ============ MIX AUTO — DJ IA ============ -->
      <section class="yam-card p-4 md:p-6 mb-5 border-yam-violet/30">
        <div class="flex items-start justify-between flex-wrap gap-3 mb-1">
          <div>
            <p class="yam-kicker !text-yam-violet">Assistant DJ · IA locale</p>
            <h2 class="yam-display text-2xl md:text-3xl mt-1">MIX AUTO</h2>
          </div>
          <span class="yam-badge text-yam-violet border border-yam-violet/30 gap-1.5"><yam-icon name="disc" [size]="12"/> aucune donnée envoyée</span>
        </div>
        <p class="text-white/50 text-sm max-w-2xl mb-5">Choisis une ambiance : le DJ IA sélectionne les morceaux, construit la courbe d'énergie, synchronise les BPM, accorde les tonalités (roue Camelot) et enchaîne les transitions comme en soirée. Chaque piste est réellement analysée (structure, énergie, loudness) et le mix <b class="text-white/70">continue en arrière-plan</b> pendant que tu navigues.</p>

        @if (djLive.autoActive()) {
          <!-- ===== LECTURE EN COURS ===== -->
          <div class="rounded-2xl border border-yam-violet/30 bg-yam-violet/10 p-4">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="yam-viz" [class.paused]="djLive.autoPhase() !== 'playing' && djLive.autoPhase() !== 'transition'">
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                </span>
                <div class="min-w-0">
                  <p class="font-semibold truncate text-sm">{{ currentAutoSeg()?.track?.title || 'Préparation…' }}</p>
                  <p class="text-white/40 text-xs truncate">{{ currentAutoSeg()?.track?.artistName }}</p>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <button (click)="djLive.togglePauseAutoMix()" class="yam-btn-secondary !px-4 !py-2 text-sm">
                  {{ djLive.autoPhase() === 'paused' ? 'Reprendre' : 'Pause' }}
                </button>
                <button (click)="stopAutoMix()" class="px-4 py-2 rounded-full font-bold text-sm bg-red-500/10 text-red-400 border border-red-400/40 hover:bg-red-500 hover:text-white transition">Stop</button>
              </div>
            </div>
            <div class="yam-progress-thin mb-1.5"><span [style.width.%]="autoProgressPct()"></span></div>
            <div class="flex justify-between text-[11px] text-white/40 yam-num mb-2">
              <span>{{ fmt(djLive.autoMixPosition()) }} / {{ fmt(djLive.autoMixDuration()) }}</span>
              <span class="text-right">
                @if (djLive.autoPhase() === 'transition' && djLive.autoTransitionLabel()) { {{ djLive.autoTransitionLabel() }} }
                @else if (djLive.autoCountdown() != null) { prochaine transition dans {{ ceil(djLive.autoCountdown()!) }} s }
              </span>
            </div>
            <div class="flex items-center gap-2 text-xs text-white/50 flex-wrap">
              <span class="yam-badge !text-yam-violet border border-yam-violet/30 !px-2">Piste {{ djLive.autoIndex() + 1 }}/{{ autoSegCount() }}</span>
              @if (nextAutoSeg(); as nx) {
                <span class="truncate">Ensuite : <b class="text-white/70">{{ nx.track.title }}</b> — {{ nx.track.artistName }}</span>
              }
              @if (currentAutoMeasured(); as m) {
                <span class="yam-num text-white/35 hidden sm:inline">{{ m.bpm || '?' }} BPM · énergie {{ (m.energy * 10).toFixed(1) }}/10</span>
              }
            </div>
            @if (djLive.autoLoading()) { <p class="text-xs text-yam-orange mt-2 animate-pulse">{{ djLive.autoLoading() }}</p> }
            @if (djLive.autoError()) { <p class="text-xs text-red-400 mt-2">{{ djLive.autoError() }}</p> }
            <p class="text-[11px] text-white/35 mt-2 flex items-center gap-1.5"><yam-icon name="smartphone" [size]="12"/> Arrière-plan actif : navigue librement, la musique continue — contrôle aussi depuis l'écran verrouillé.</p>
          </div>
        } @else {
          <!-- ===== SOURCES DU MIX (catalogue + mes fichiers) ===== -->
          <div class="flex items-center gap-2 flex-wrap mb-4">
            <span class="yam-badge !px-2.5 !py-1 gap-1.5 border-yam-violet/30 text-white/60"><yam-icon name="disc" [size]="12"/> Catalogue mixable : <b class="text-white/85 yam-num">{{ library().length }}</b></span>
            <span class="yam-badge !px-2.5 !py-1 gap-1.5 border-yam-gold/30 text-white/60"><yam-icon name="folder" [size]="12"/> Mes fichiers : <b class="text-white/85 yam-num">{{ localFiles().length }}</b></span>
            @if (library().length + localFiles().length < 2) {
              <button (click)="localFilesInput.click()" class="yam-btn-primary text-xs !py-1.5 !px-3 ml-auto">
                <yam-icon name="plus" [size]="13"/> Ajouter ma musique
              </button>
            }
          </div>
          @if (library().length + localFiles().length < 2) {
            <div class="rounded-2xl border border-dashed border-yam-gold/40 bg-yam-gold/5 p-4 mb-5 text-center">
              <p class="text-sm font-semibold text-yam-gold flex items-center justify-center gap-2"><yam-icon name="folder" [size]="16"/> Charge au moins 2 morceaux pour mixer</p>
              <p class="text-white/50 text-xs mt-1 max-w-md mx-auto">Tes mp3, m4a, wav… restent sur ton appareil : le DJ IA les analyse (BPM, tonalité, énergie) et construit un vrai mix. Tu peux aussi publier tes titres depuis l'espace artiste pour les retrouver dans le catalogue.</p>
              <button (click)="localFilesInput.click()" class="yam-btn-primary text-sm mt-3">
                <yam-icon name="folder" [size]="15"/> Choisir mes fichiers
              </button>
            </div>
          }

          <!-- ===== PARAMETRES ===== -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="col-span-2">
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">Ambiance</label>
              <div class="flex flex-wrap gap-1.5">
                @for (m of moods; track m.key) {
                  <button (click)="mixMood.set(m.key)"
                          class="text-xs font-semibold px-3 py-1.5 rounded-full border transition"
                          [class]="mixMood() === m.key ? 'bg-yam-violet/20 border-yam-violet/50 text-yam-violet' : 'border-white/10 text-white/50 hover:border-yam-violet/30'"
                          [title]="m.desc">{{ m.label }}</button>
                }
              </div>
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">Genre</label>
              <select [(ngModel)]="mixGenre" class="yam-input !py-2 !px-2 text-sm">
                <option value="all">Tous</option>
                @for (g of genres(); track g) { <option [value]="g">{{ g }}</option> }
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">Morceaux</label>
              <select [(ngModel)]="mixCount" class="yam-input !py-2 !px-2 text-sm">
                <option [ngValue]="null">Auto</option>
                @for (n of [2, 3, 4, 5, 6, 8, 10, 12]; track n) { <option [ngValue]="n">{{ n }}</option> }
              </select>
            </div>
            <div class="col-span-2 md:col-span-1">
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">
                Durée max <span class="yam-num text-white/60">{{ mixMaxMin }} min</span>
              </label>
              <input type="range" min="10" max="90" step="5" [(ngModel)]="mixMaxMin" class="w-full h-1.5 accent-yam-violet cursor-pointer">
            </div>
            <div class="col-span-2 md:col-span-1">
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">
                Intensité <span class="yam-num text-white/60">{{ mixEnergy }}/10</span>
              </label>
              <input type="range" min="1" max="10" step="1" [(ngModel)]="mixEnergy" class="w-full h-1.5 accent-yam-violet cursor-pointer">
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">Transitions</label>
              <select [(ngModel)]="mixStyle" class="yam-input !py-2 !px-2 text-sm">
                <option value="auto">Auto (le DJ IA choisit)</option>
                @for (s of styleOptions; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase tracking-[.14em] text-white/40 block mb-1.5">Artistes (facultatif)</label>
              <input type="text" [(ngModel)]="mixArtists" placeholder="ex : Floby, Dee Jay" class="yam-input !py-2 !px-2 text-sm">
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <button (click)="generateMix()" [disabled]="generating() || library().length + localFiles().length < 2" class="yam-btn-primary text-sm flex items-center gap-1.5">
              <yam-icon name="sparkles" [size]="15"/> {{ generating() ? (generatingLabel() || 'Analyse…') : 'Générer le mix' }}
            </button>
            <span class="text-xs text-white/40">{{ mixSourceLabel() }}</span>
          </div>
          <div class="flex items-center gap-3 flex-wrap text-xs text-white/45">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" [(ngModel)]="mixRecord" class="accent-yam-violet w-4 h-4"> Enregistrer le mix auto
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" [(ngModel)]="mixVoice" class="accent-yam-violet w-4 h-4"> Voix DJ (annonces)
            </label>
          </div>
        }

        <!-- ===== RAPPORT DU PLAN ===== -->
        @if (djLive.autoPlan(); as plan) {
          @if (!djLive.autoActive()) {
            <div class="mt-5 border-t border-white/10 pt-4">
              <p class="text-sm font-semibold mb-1">{{ plan.summary }}</p>
              @for (w of plan.warnings; track $index) {
                <p class="text-xs text-yam-gold mb-0.5 flex items-start gap-1.5"><yam-icon name="alert-circle" [size]="13" class="shrink-0 mt-0.5"/>{{ w }}</p>
              }
              @if (plan.segments.length >= 2) {
                <!-- Courbe d'energie du mix -->
                <div class="flex items-end gap-1 h-12 mb-4 mt-3" aria-hidden="true">
                  @for (s of plan.segments; track s.track.id) {
                    <div class="flex-1 rounded-t-sm bg-gradient-to-t from-yam-violet/50 to-yam-violet min-h-[6%]"
                         [style.height.%]="(s.measuredEnergy ?? s.estEnergy) * 100"></div>
                  }
                </div>
                <div class="grid grid-cols-1 gap-1.5 mb-4">
                  @for (s of plan.segments; track s.track.id; let i = $index) {
                    <div class="flex items-center gap-3 rounded-xl bg-black/20 border border-white/10 px-3 py-2">
                      <span class="yam-num text-xs text-white/40 w-6 text-center">{{ i + 1 }}</span>
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium truncate">{{ s.track.title }}</p>
                        <p class="text-[11px] text-white/40 truncate">{{ s.track.artistName }} · {{ s.track.bpm || '?' }} BPM @if (s.track.camelot) { · {{ s.track.camelot }} } @if (s.pitchPct) { · pitch {{ s.pitchPct > 0 ? '+' : '' }}{{ s.pitchPct }} % }</p>
                      </div>
                      <span class="yam-num text-[11px] text-white/40 hidden sm:inline">{{ fmt(s.mixStart) }}</span>
                    </div>
                    @if (plan.transitions[i]; as tr) {
                      <p class="text-[10px] text-yam-violet/90 pl-9 flex items-center gap-1.5 flex-wrap">
                        <yam-icon name="arrow-right" [size]="11"/>{{ transitionLabelOf(tr) }} · {{ tr.durationSec.toFixed(0) }} s
                        <span class="text-white/35">— {{ tr.reason }}</span>
                      </p>
                    }
                  }
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <button (click)="launchAutoMix()" class="yam-btn-primary text-sm flex items-center gap-1.5"><yam-icon name="play" [size]="14"/> Lancer le mix</button>
                  <button (click)="generateMix()" class="yam-btn-secondary text-sm">Régénérer</button>
                  <button (click)="discardMix()" class="yam-btn-secondary text-sm">Effacer le plan</button>
                </div>
              }
            </div>
          }
        }
      </section>

      <!-- ============ BARRE MASTER + ENREGISTREMENT ============ -->
      <div class="yam-card p-3 md:p-4 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center">
          <div class="flex items-center gap-3 justify-center">
            @if (!isRecording()) {
              <button (click)="startRecording()" [disabled]="!anyDeckReady()"
                      class="px-5 py-2.5 rounded-full font-bold text-sm bg-red-500/10 text-red-400 border border-red-400/40 hover:bg-red-500 hover:text-white hover:border-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Enregistrer la sortie master de ton mix">
                <span class="dj-rec-dot block w-2 h-2 rounded-full bg-current"></span> ENREGISTRER LE MIX
              </button>
            } @else {
              <button (click)="stopRecording()"
                      class="px-5 py-2.5 rounded-full font-bold text-sm bg-red-500 text-white shadow-lg shadow-red-500/30 transition">
                <span class="dj-rec-dot block w-2 h-2 rounded-full bg-current"></span> STOP ({{ recTimeText() }})
              </button>
            }
            @if (!engine?.canRecord) {
              <span class="text-[10px] text-red-400/70">Enregistrement non supporté par ce navigateur</span>
            }
          </div>
          <div class="flex items-center gap-4">
            <div class="flex-1 min-w-[120px]">
              <div class="flex justify-between text-[10px] text-white/40 mb-1">
                <span>MASTER · limiteur actif</span><span class="tabular-nums">{{ masterPct() }}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" [value]="masterVolume()"
                     (input)="setMasterVolume($event)" class="w-full h-1.5 accent-yam-gold cursor-pointer">
            </div>
            <div>
              <div class="text-[10px] text-white/40 mb-1 text-center">VU</div>
              <div class="w-24 h-2.5 rounded-full bg-black/40 overflow-hidden border border-white/10">
                <div #masterVuEl class="h-full bg-gradient-to-r from-yam-green via-yam-gold to-red-500" style="width:0%"></div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 justify-center">
            <span class="text-[10px] text-white/40">QUALITÉ DE CHARGEMENT</span>
            <div class="flex rounded-full bg-black/30 p-1 border border-white/10">
              <button (click)="quality.set('lite')"
                      class="px-3 py-1 rounded-full text-xs font-bold transition"
                      [class]="quality() === 'lite' ? 'bg-yam-orange text-white' : 'text-white/50 hover:text-white'">LITE</button>
              <button (click)="quality.set('hq')"
                      class="px-3 py-1 rounded-full text-xs font-bold transition"
                      [class]="quality() === 'hq' ? 'bg-yam-orange text-white' : 'text-white/50 hover:text-white'">HQ</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ CONSOLE : DECKS + MIXER ============ -->
      <div class="yam-card p-3 md:p-4 mb-5">
        <div class="dj-console-grid gap-4">

          @for (panel of panels; track panel.id) {
            <div [style.grid-area]="panel.id === 'A' ? 'deck-a' : 'deck-b'"
                 class="rounded-2xl border p-3 md:p-4 transition-all duration-300"
                 [class]="deckBorderClass(panel)">

              <!-- En-tete deck -->
              <div class="flex items-center gap-3 mb-3">
                <span class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                      [class]="panel.id === 'A' ? 'bg-yam-orange/20 text-yam-orange' : 'bg-yam-gold/20 text-yam-gold'">{{ panel.id }}</span>
                @if (panel.deck.track) {
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold truncate text-sm">{{ panel.deck.track.title }}</p>
                    <p class="text-white/50 text-xs truncate">{{ panel.deck.track.artistName }}
                      @if (panel.deck.track.bpm) { · <b class="tabular-nums">{{ liveBpm(panel) }}</b> BPM }
                      @if (panel.deck.track.camelot) { · {{ panel.deck.track.camelot }} }
                    </p>
                  </div>
                  <button (click)="pickLocalFile(panel)" title="Charger un fichier de mon téléphone / ordinateur"
                          class="w-8 h-8 rounded-full text-white/40 hover:text-yam-gold hover:bg-yam-gold/10 transition shrink-0 flex items-center justify-center"><yam-icon name="folder" [size]="15"/></button>
                  <button (click)="ejectDeck(panel)" title="Ejecter la piste"
                          class="w-8 h-8 rounded-full text-white/40 hover:text-red-400 hover:bg-red-400/10 transition shrink-0 flex items-center justify-center"><yam-icon name="x" [size]="15"/></button>
                } @else {
                  <p class="text-white/30 text-sm flex-1">Deck libre — charge une piste ou un fichier local</p>
                  <button (click)="pickLocalFile(panel)" title="Charger un fichier de mon téléphone / ordinateur"
                          class="w-8 h-8 rounded-full text-yam-gold/60 hover:text-yam-gold hover:bg-yam-gold/10 transition shrink-0 flex items-center justify-center"><yam-icon name="folder" [size]="15"/></button>
                }
              </div>

              <!-- Waveform reelle -->
              <div class="relative h-28 rounded-xl dj-scope border border-white/10 overflow-hidden mb-3 cursor-pointer group"
                   (click)="seekWave(panel, $event)">
                <canvas #waveEl class="dj-wave w-full h-full block" [attr.data-deck]="panel.id"></canvas>
                @if (panel.loading()) {
                  <div class="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 pointer-events-none">
                    <p class="text-xs text-yam-orange font-medium mb-2">{{ panel.detail() }}</p>
                    <div class="w-3/4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div class="h-full bg-gradient-to-r from-yam-orange to-yam-gold transition-all duration-300"
                           [style.width.%]="panel.pct()"></div>
                    </div>
                  </div>
                } @else if (!panel.deck.track) {
                  <div class="absolute inset-0 flex items-center justify-center dj-t20 text-xs pointer-events-none">
                    Charge une piste pour afficher sa vraie waveform
                  </div>
                } @else if (panel.error()) {
                  <div class="absolute inset-0 bg-red-500/10 flex items-center justify-center p-3 pointer-events-none">
                    <p class="text-xs text-red-300 text-center">{{ panel.error() }}</p>
                  </div>
                }
                <div class="absolute bottom-1 left-2 right-2 flex justify-between text-[10px] dj-t90 tabular-nums pointer-events-none drop-shadow">
                  <span #timeEl>0:00</span><span #remainEl>-0:00</span>
                </div>
                <div class="absolute top-1.5 right-2 w-20 h-2 rounded-full bg-black/60 overflow-hidden pointer-events-none border border-white/10">
                  <div #vuEl class="h-full bg-yam-green" style="width:0%"></div>
                </div>
              </div>

              <!-- Transport -->
              <div class="flex items-center gap-2 mb-3">
                <button (click)="cueDeck(panel)" [disabled]="!panel.deck.track"
                        class="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold transition disabled:opacity-30"
                        title="CUE : en lecture = retour au cue ; en pause = lecture depuis le cue ; 1er appui = pose le cue">CUE</button>
                <button (click)="toggleDeck(panel)" [disabled]="!panel.deck.track"
                        class="w-14 h-14 rounded-full bg-white text-yam-dark flex items-center justify-center hover:scale-105 active:scale-95 transition disabled:opacity-30 shrink-0"
                        [class]="panel.id === 'A' ? 'shadow-[0_0_20px_rgba(255,107,53,0.4)]' : 'shadow-[0_0_20px_rgba(255,209,102,0.4)]'">
                  <yam-icon [name]="panel.playing() ? 'pause' : 'play'" [size]="22" class="fill-current ml-0.5"/>
                </button>
                <div class="flex flex-col gap-1">
                  <button (mousedown)="nudge(panel, 1)" (mouseup)="nudgeEnd(panel)" (mouseleave)="nudgeEnd(panel)"
                          (touchstart)="nudge(panel, 1)" (touchend)="nudgeEnd(panel)"
                          [disabled]="!panel.playing()"
                          class="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold disabled:opacity-30" title="Avance le tempo (appui maintenu)">»</button>
                  <button (mousedown)="nudge(panel, -1)" (mouseup)="nudgeEnd(panel)" (mouseleave)="nudgeEnd(panel)"
                          (touchstart)="nudge(panel, -1)" (touchend)="nudgeEnd(panel)"
                          [disabled]="!panel.playing()"
                          class="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold disabled:opacity-30" title="Recule le tempo (appui maintenu)">«</button>
                </div>
                <div class="flex-1"></div>
                <button (click)="syncDeck(panel)" [disabled]="!canSync(panel)"
                        class="text-xs font-bold px-3 py-2 rounded-xl bg-yam-orange/15 text-yam-orange hover:bg-yam-orange hover:text-white transition disabled:opacity-30"
                        title="Asservit le BPM de ce deck sur l'autre (half/double auto)">SYNC</button>
              </div>

              <!-- Pitch -->
              <div class="mb-3">
                <div class="flex justify-between text-[10px] text-white/40 mb-1">
                  <span>PITCH</span>
                  <span class="tabular-nums cursor-pointer hover:text-yam-orange underline" (click)="resetPitch(panel)">
                    {{ panel.pitch() >= 0 ? '+' : '' }}{{ panel.pitch().toFixed(1) }} % · {{ liveBpm(panel) }} BPM (reset)
                  </span>
                </div>
                <input type="range" min="-8" max="8" step="0.1" [value]="panel.pitch()"
                       (input)="setPitch(panel, $event)" class="w-full h-1.5 accent-yam-orange cursor-pointer">
              </div>

              <!-- EQ 3 bandes + volume -->
              <div class="grid grid-cols-4 gap-2 mb-3">
                @for (band of eqBands; track band.key) {
                  <div>
                    <label class="text-[10px] text-white/40 block text-center mb-1">
                      {{ band.label }} <b class="tabular-nums text-white/70">{{ eqDbText(panel, band.key) }}</b>
                    </label>
                    <input type="range" min="-30" max="9" step="1" [value]="eqValue(panel, band.key)"
                           (input)="setEq(panel, band.key, $event)" class="w-full h-1.5 accent-yam-gold cursor-pointer">
                  </div>
                }
                <div>
                  <label class="text-[10px] text-white/40 block text-center mb-1">
                    VOL <b class="tabular-nums text-white/70">{{ volText(panel) }}</b>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" [value]="panel.vol()"
                         (input)="setVolume(panel, $event)" class="w-full h-1.5 accent-yam-gold cursor-pointer">
                </div>
              </div>

              <!-- Filtre + effets -->
              <div class="mb-3">
                <div class="flex justify-between text-[10px] text-white/40 mb-1">
                  <span>FILTRE <b class="text-white/70">{{ filterText(panel) }}</b></span>
                  <span>EFFETS — clic ON, molette = intensité</span>
                </div>
                <input type="range" min="0" max="1" step="0.02" [value]="panel.filter()"
                       (input)="setFilter(panel, $event)" class="w-full h-1.5 accent-yam-orange cursor-pointer"
                       title="Gauche = passe-bas (basse) · droite = passe-haut (aigu)">
                <div class="grid grid-cols-3 gap-2 mt-2">
                  <div class="rounded-xl border p-1.5 transition"
                        [class]="panel.echoOn() ? 'border-yam-orange/60 bg-yam-orange/10' : 'border-white/10'">
                    <button (click)="toggleEcho(panel)" [disabled]="!panel.deck.track"
                            class="w-full text-xs font-bold py-1 rounded-lg transition disabled:opacity-30"
                            [class]="panel.echoOn() ? 'bg-yam-orange text-white' : 'text-white/60 hover:bg-white/10'">
                      ECHO {{ panel.echoOn() ? 'ON' : '' }}
                    </button>
                    @if (panel.echoOn()) {
                      <input type="range" min="0.05" max="0.9" step="0.05" [value]="panel.echoWet()"
                             (input)="setEchoWet(panel, $event)" class="w-full h-1 mt-1.5 accent-yam-orange cursor-pointer"
                             title="Intensité de l'écho">
                    }
                  </div>
                  <div class="rounded-xl border p-1.5 transition"
                        [class]="panel.reverbOn() ? 'border-yam-gold/60 bg-yam-gold/10' : 'border-white/10'">
                    <button (click)="toggleReverb(panel)" [disabled]="!panel.deck.track"
                            class="w-full text-xs font-bold py-1 rounded-lg transition disabled:opacity-30"
                            [class]="panel.reverbOn() ? 'bg-yam-gold text-yam-dark' : 'text-white/60 hover:bg-white/10'">
                      REVERB {{ panel.reverbOn() ? 'ON' : '' }}
                    </button>
                    @if (panel.reverbOn()) {
                      <input type="range" min="0.05" max="0.9" step="0.05" [value]="panel.reverbWet()"
                             (input)="setReverbWet(panel, $event)" class="w-full h-1 mt-1.5 accent-yam-gold cursor-pointer"
                             title="Intensité de la réverbe">
                    }
                  </div>
                  <div class="rounded-xl border p-1.5 transition"
                        [class]="panel.flangerOn() ? 'border-yam-green/60 bg-yam-green/10' : 'border-white/10'">
                    <button (click)="toggleFlanger(panel)" [disabled]="!panel.deck.track"
                            class="w-full text-xs font-bold py-1 rounded-lg transition disabled:opacity-30"
                            [class]="panel.flangerOn() ? 'bg-yam-green text-white' : 'text-white/60 hover:bg-white/10'">
                      FLANGER {{ panel.flangerOn() ? 'ON' : '' }}
                    </button>
                    @if (panel.flangerOn()) {
                      <input type="range" min="0.05" max="0.9" step="0.05" [value]="panel.flangerWet()"
                             (input)="setFlangerWet(panel, $event)" class="w-full h-1 mt-1.5 accent-yam-green cursor-pointer"
                             title="Profondeur de l'effet avion">
                    }
                  </div>
                </div>
                <!-- Presets d'effets 1 clic -->
                <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span class="text-[10px] text-white/30 shrink-0">PRESETS</span>
                  @for (p of fxPresets; track p.name) {
                    <button (click)="applyPreset(panel, p)" [disabled]="!panel.deck.track"
                            class="text-[10px] font-bold px-2 py-1 rounded-full transition shrink-0 disabled:opacity-30
                                   bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
                            [title]="p.desc">{{ p.label }}</button>
                  }
                </div>
              </div>

              <!-- Boucles + hot cues -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[10px] text-white/30 shrink-0">LOOP</span>
                @for (bars of loopChoices; track bars) {
                  <button (click)="toggleLoop(panel, bars)" [disabled]="!panel.deck.track"
                          class="text-xs font-bold px-2.5 py-1.5 rounded-lg transition shrink-0 disabled:opacity-30"
                          [class]="panel.deck.loop && panel.deck.loop.bars === bars
                            ? 'bg-yam-orange text-white'
                            : 'bg-white/10 text-white/50 hover:bg-white/20'">{{ bars }}</button>
                }
                @if (panel.deck.loop) {
                  <span class="text-[10px] text-yam-orange tabular-nums">boucle {{ loopLenText(panel) }}</span>
                }
                <span class="text-[10px] text-white/30 shrink-0 ml-2">CUES</span>
                @for (i of [0, 1, 2, 3]; track i) {
                  <button (click)="cuePadClick(panel, i, $event)" [disabled]="!panel.deck.track"
                          class="w-9 h-9 rounded-lg text-xs font-bold transition shrink-0 disabled:opacity-30"
                          [class]="panel.cues()[i] != null
                            ? 'bg-yam-gold/25 text-yam-gold hover:bg-yam-gold/40 border border-yam-gold/40'
                            : 'bg-white/10 text-white/40 hover:bg-white/20 border border-white/10'"
                          title="Clic : place/saute · Shift+clic : efface">{{ i + 1 }}</button>
                }
              </div>
            </div>
          }

          <!-- MIXER central -->
          <div style="grid-area: mixer" class="flex flex-col gap-4 justify-center">
            <div>
              <div class="text-[10px] text-white/40 mb-2 text-center">CROSSFADER</div>
              <div class="flex items-center gap-2">
                <span class="text-yam-orange font-black text-xs">A</span>
                <input type="range" min="0" max="1" step="0.01" [value]="crossfade()"
                       (input)="setCrossfade($event)"
                       class="flex-1 h-2.5 accent-yam-gold cursor-pointer dj-crossfader">
                <span class="text-yam-gold font-black text-xs">B</span>
              </div>
              <div class="flex justify-between text-[9px] text-white/30 mt-1">
                <span>Plein A</span><span>Milieu</span><span>Plein B</span>
              </div>
            </div>
            <div class="text-center">
              <button (click)="syncBtoA()" [disabled]="!canSync(panels[1])"
                      class="yam-btn-secondary text-xs w-full">SYNC B → A</button>
              <p class="text-[10px] text-white/40 mt-1">{{ syncHint() }}</p>
            </div>
            <div class="text-center">
              <div class="text-[10px] text-white/40 mb-1">HARMONIE A ↔ B</div>
              <span class="yam-badge mx-auto" [class]="keyCompatClass()">{{ keyCompatText() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ BIBLIOTHEQUE ============ -->
      <section>
        <h2 class="text-xl font-bold mb-1 flex items-center gap-2"><yam-icon name="music-4" [size]="18" class="text-yam-orange"/> Ma musique &amp; bibliothèque</h2>
        <p class="text-white/40 text-sm mb-4">
          Charge TES fichiers (mp3, m4a, wav...) ou choisis dans le catalogue — BPM détecté automatiquement.
          Chargement complet en mémoire pour un mix précis (rendu {{ quality() === 'lite' ? 'Data-Lite 48 kbps' : 'HQ 128 kbps' }}).
          @if (ytExcluded > 0) { {{ ytExcluded }} pistes YouTube non mixables masquées. }
        </p>

        <!-- Zone fichiers locaux -->
        <div class="yam-card p-4 mb-4 border-dashed border-yam-gold/30">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p class="font-semibold text-sm flex items-center gap-1.5"><yam-icon name="folder" [size]="15" class="text-yam-gold"/> Ma musique locale</p>
              <p class="text-white/40 text-xs mt-0.5">Tes fichiers ne quittent jamais ton appareil — chargés en mémoire pour le mix.</p>
            </div>
            <button (click)="localFilesInput.click()" class="yam-btn-primary text-sm shrink-0">
              <yam-icon name="plus" [size]="15"/> Ajouter des fichiers
            </button>
            <input #localFilesInput type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac" multiple
                   class="hidden" (change)="onLocalFilesSelected($event)">
          </div>
          @if (localFiles().length) {
            <div class="grid grid-cols-1 gap-2 mt-3">
              @for (item of localFiles(); track item.id) {
                <div class="flex items-center gap-3 rounded-xl bg-black/30 border border-white/10 p-2.5">
                  <button (click)="loadLocalToDeck(item, panels[0])" [disabled]="rowLoadingLocal(item) || panels[0].loading()"
                          class="w-10 h-10 rounded-full font-black text-xs shrink-0 transition bg-yam-orange/15 text-yam-orange hover:bg-yam-orange hover:text-white disabled:opacity-30"
                          title="Charger dans le deck A">A</button>
                  <button (click)="loadLocalToDeck(item, panels[1])" [disabled]="rowLoadingLocal(item) || panels[1].loading()"
                          class="w-10 h-10 rounded-full font-black text-xs shrink-0 transition bg-yam-gold/15 text-yam-gold hover:bg-yam-gold hover:text-yam-dark disabled:opacity-30 -ml-2"
                          title="Charger dans le deck B">B</button>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate text-sm">{{ item.track.title }}</p>
                    <p class="text-white/40 text-xs truncate">Fichier local · {{ fmt(item.track.durationSec) }}
                      @if (item.track.bpm) { · <b class="tabular-nums">{{ item.track.bpm }}</b> BPM (détecté) }
                    </p>
                  </div>
                  @if (item.loading) {
                    <span class="text-xs text-yam-orange animate-pulse shrink-0">analyse…</span>
                  }
                  <button (click)="removeLocalFile(item)" title="Retirer"
                          class="w-8 h-8 rounded-full text-white/30 hover:text-red-400 hover:bg-red-400/10 transition shrink-0 flex items-center justify-center"><yam-icon name="x" [size]="14"/></button>
                </div>
              }
            </div>
          }
        </div>

        <!-- Catalogue plateforme -->
        <h3 class="text-sm font-bold text-white/60 mb-2">Catalogue YAM DJ</h3>

        <div class="flex gap-2 mb-4 flex-wrap">
          <input type="text" [(ngModel)]="filterText_" (ngModelChange)="filterLibrary()"
                 placeholder="Filtrer par titre, artiste, BPM..." class="yam-input !py-2 max-w-xs">
          <select [(ngModel)]="genreFilter" (ngModelChange)="filterLibrary()" class="yam-input !py-2 max-w-[180px]">
            <option value="all">Tous genres</option>
            @for (g of genres(); track g) { <option [value]="g">{{ g }}</option> }
          </select>
          <button (click)="compatOnly.set(!compatOnly()); filterLibrary()"
                  class="text-xs font-bold px-4 py-2 rounded-full border transition"
                  [class]="compatOnly() ? 'bg-yam-green/20 text-yam-green border-yam-green/40' : 'border-white/20 text-white/50'">
            <yam-icon name="activity" [size]="13"/> BPM compatibles deck A
          </button>
        </div>

        <div class="grid grid-cols-1 gap-2">
          @for (item of filteredLibrary(); track item.id) {
            <div class="yam-card p-3 flex items-center gap-3 hover:border-yam-orange/40">
              <button (click)="loadTrackToDeck(item, panels[0])" [disabled]="rowLoading(item) || panels[0].loading()"
                      class="w-10 h-10 rounded-full font-black text-xs shrink-0 transition bg-yam-orange/15 text-yam-orange hover:bg-yam-orange hover:text-white disabled:opacity-30"
                      title="Charger dans le deck A">A</button>
              <button (click)="loadTrackToDeck(item, panels[1])" [disabled]="rowLoading(item) || panels[1].loading()"
                      class="w-10 h-10 rounded-full font-black text-xs shrink-0 transition bg-yam-gold/15 text-yam-gold hover:bg-yam-gold hover:text-yam-dark disabled:opacity-30 -ml-2"
                      title="Charger dans le deck B">B</button>
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">{{ item.title }}</p>
                <p class="text-white/40 text-xs truncate">{{ item.artistName }}
                  @if (item.genre) { · {{ item.genre }} }
                  @if (item.bpm) { · <b class="tabular-nums">{{ item.bpm }}</b> BPM }
                  @if (item.camelot) { · {{ item.camelot }} }
                  · {{ fmt(item.durationSec) }}
                </p>
              </div>
              @if (rowLoading(item)) {
                <span class="text-xs text-yam-orange animate-pulse shrink-0">chargement…</span>
              }
              <button (click)="toggleSelect(item)"
                      class="w-9 h-9 rounded-full border flex items-center justify-center text-sm transition shrink-0"
                      [class]="isSelected(item) ? 'bg-yam-orange border-yam-orange text-white' : 'border-white/20 text-white/40'">
                {{ isSelected(item) ? '✓' : '+' }}
              </button>
            </div>
          } @empty {
            <div class="yam-card p-10 text-center text-white/40">
              <div class="mb-2 text-white/30"><yam-icon name="disc" [size]="40"/></div>
              @if (library().length === 0 && ytExcluded > 0) {
                Les {{ ytExcluded }} pistes du catalogue sont lues via YouTube (pas d'audio mixable) :
                publie tes propres titres depuis l'espace artiste pour les mixer ici.
              } @else if (library().length === 0) { Aucune piste audio disponible pour le mix. }
              @else { Aucun résultat avec ces filtres. }
            </div>
          }
        </div>
      </section>

      <!-- ============ ENREGISTREMENT DU MIX ============ -->
      @if (recUrl()) {
        <section class="mt-10">
          <h2 class="text-xl font-bold mb-4 flex items-center gap-2"><yam-icon name="mic" [size]="18" class="text-yam-orange"/> Mon mix enregistré</h2>
          <div class="yam-card p-4">
            <div class="flex items-center gap-3 flex-wrap">
              <audio #recAudio controls [src]="recUrl()" (loadedmetadata)="fixRecDuration($event)" class="flex-1 min-w-[220px] h-10"></audio>
              <a [href]="recUrl()" [download]="recFileName()" class="yam-btn-secondary text-sm flex items-center gap-1.5"><yam-icon name="download" [size]="15"/> Télécharger</a>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mt-4 items-end">
              <div>
                <label class="text-xs text-white/50 mb-1 block">Titre du mix</label>
                <input type="text" [(ngModel)]="recTitle" placeholder="Mon live Vol. 1" class="yam-input !py-2">
              </div>
              <div>
                <label class="text-xs text-white/50 mb-1 block">Prix FCFA (0 = gratuit)</label>
                <input type="number" min="0" max="50000" step="50" [(ngModel)]="recPriceXof" class="yam-input !py-2 w-32" inputmode="numeric">
              </div>
              <button (click)="publishRecording()" [disabled]="publishing()"
                      class="yam-btn-primary text-sm">
                @if (publishing()) { Publication... } @else { Publier sur YAM DJ }
              </button>
            </div>
            @if (recMessage()) {
              <p class="text-sm mt-3 rounded-xl px-3 py-2" [class]="recMessageOk() ? 'bg-yam-green/10 text-yam-green' : 'bg-yam-orange/10 text-yam-orange'">
                {{ recMessage() }}
              </p>
            }
          </div>
        </section>
      }

      <!-- ============ MES MIXTAPES ============ -->
      <section class="mt-10">
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2"><yam-icon name="disc" [size]="18" class="text-yam-orange"/> Mes mixtapes</h2>

        @if (mixMessage()) {
          <div class="yam-card p-3 mb-4"
               [class]="mixMessageOk() ? 'border-yam-green/40 bg-yam-green/10' : 'border-red-400/40 bg-red-400/10'">
            <p class="text-sm font-medium" [class]="mixMessageOk() ? 'text-yam-green' : 'text-red-400'">
              {{ mixMessage() }}
            </p>
          </div>
        }

        @if (mixtapes().length) {
          <div class="space-y-2">
            @for (mix of mixtapes(); track mix.id) {
              <div class="yam-card p-4 flex items-center gap-3">
                <button (click)="playMixtape(mix)" title="Ecouter le mix"
                        class="w-10 h-10 rounded-full bg-yam-orange/20 text-yam-orange flex items-center justify-center hover:bg-yam-orange hover:text-white transition shrink-0">
                  <yam-icon [name]="djLive.mixPlayingId() === mix.id ? 'pause' : 'play'" [size]="16" class="fill-current"/>
                </button>
                <div class="min-w-0 flex-1">
                  <p class="font-medium truncate">{{ mix.title }}</p>
                  <p class="text-white/40 text-xs truncate">
                    <yam-icon name="headphones" [size]="12" class="inline"/> {{ mix.playCount }} écoutes · {{ fmt(mix.durationSec) }} · {{ formatDate(mix.createdAt) }}
                    @if (mix.priceXof && mix.priceXof > 0) { · <span class="text-yam-gold flex items-center gap-1"><yam-icon name="banknote" [size]="12"/> {{ mix.priceXof }} F</span> }
                  </p>
                </div>
                <button (click)="askDeleteMixtape(mix)" [disabled]="deletingMixId() === mix.id" title="Supprimer"
                        class="shrink-0 text-xs font-semibold px-3 py-2 rounded-full transition"
                        [class]="confirmDeleteMixId() === mix.id
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'text-white/40 hover:text-red-400 hover:bg-red-400/10'">
                  @if (deletingMixId() === mix.id) { <span class="animate-pulse">…</span> }
                  @else if (confirmDeleteMixId() === mix.id) { Confirmer ? }
                  @else { Supprimer }
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="yam-card p-8 text-center text-white/40">
            <div class="mb-2 text-white/30"><yam-icon name="disc" [size]="40"/></div>
            Aucune mixtape. Mixe en direct et enregistre, ou lance un Mix Auto puis publie-le.
          </div>
        }
      </section>

      <!-- Bouton flottant creation mixtape -->
      @if (selected().length >= 2) {
        <div class="fixed bottom-24 right-4 z-40">
          <button (click)="mixModalVisible.set(true)" class="yam-btn-primary !px-6 !py-3 shadow-2xl">
            Créer une mixtape ({{ selected().length }})
          </button>
        </div>
      }

      <!-- Modal mixtape -->
      @if (mixModalVisible()) {
        <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
             (click)="!creatingMix() && mixModalVisible.set(false)">
          <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10" (click)="$event.stopPropagation()">
            <h2 class="yam-title mb-4">Nouvelle mixtape</h2>
            <label class="text-sm text-white/60 mb-1 block">Titre du mix</label>
            <input type="text" [(ngModel)]="mixTitle" placeholder="Ma mixtape Vol. 1" class="yam-input mb-4">
            <label class="text-sm text-white/60 mb-1 block">Crossfade : {{ crossfadeSec }} secondes</label>
            <input type="range" min="2" max="16" [(ngModel)]="crossfadeSec" class="w-full h-2 accent-yam-orange cursor-pointer mb-4">
            <label class="flex items-center gap-2 text-sm text-white/60 cursor-pointer mb-4">
              <input type="checkbox" [(ngModel)]="autoOrder" class="accent-yam-orange w-4 h-4">
              Ordonner intelligemment (tonalités + BPM)
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
              <p class="text-center text-yam-orange text-sm mb-4 animate-pulse">FFmpeg génère ton mix... (1-2 min)</p>
            }
            <button (click)="createMixtape()" [disabled]="creatingMix()" class="yam-btn-secondary w-full">
              {{ creatingMix() ? 'Génération en cours...' : 'Générer le mix' }}
            </button>
          </div>
        </div>
      }

      <!-- Modal aide / raccourcis -->
      @if (helpVisible()) {
        <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
             (click)="helpVisible.set(false)">
          <div class="bg-yam-card rounded-3xl p-6 w-full max-w-lg border border-white/10 max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <h2 class="yam-title mb-4">Pilotage du studio</h2>
            <ul class="space-y-2 text-sm text-white/70">
              <li><b class="text-yam-orange">Ma musique locale</b> — charge TES mp3/m4a/wav dans un deck (bouton dossier du deck ou zone « Ma musique locale ») — BPM détecté automatiquement</li>
              <li><b class="text-yam-violet">Mix Auto</b> — le DJ IA analyse tes morceaux (BPM, tonalité, énergie), construit le plan complet du mix puis l'enchaîne tout seul — il continue en arrière-plan quand tu quittes le studio</li>
              <li><b class="text-yam-orange">Espace</b> — lecture/pause deck A · <b class="text-yam-gold">Maj+Espace</b> — deck B</li>
              <li><b class="text-yam-orange">← / →</b> — déplacer le crossfader</li>
              <li><b class="text-yam-orange">S</b> — synchroniser le deck B sur A</li>
              <li><b class="text-yam-orange">1 à 4</b> — hot cues du deck A (Maj+1-4 : deck B)</li>
              <li><b>Effets</b> — ECHO / REVERB / FLANGER : clic = ON, molette = intensité · presets 1 clic (CLUB, SPACE, SWEEP...)</li>
              <li><b>CUE</b> : en lecture = retour au point ; en pause = lecture depuis le point ; premier appui = pose le point</li>
              <li><b>Loop</b> : boucle exacte de 1 à 16 temps relancée à l'échantillon près</li>
              <li><b>Sync</b> : aligne le BPM (moitié/double auto) — affine la phase avec « »</li>
              <li><b>Pitch</b> : le ton suit le tempo, comme sur une vraie platine vinyle</li>
              <li><b>Enregistrer</b> : capture la sortie master (limiteur inclus) — publie-la ou télécharge-la</li>
            </ul>
            <button (click)="helpVisible.set(false)" class="yam-btn-primary w-full mt-5">Compris !</button>
          </div>
        </div>
      }
    </div>
  `
})
export class DjStudioComponent implements OnInit, OnDestroy, AfterViewInit {

  private djService = inject(DjService);
  private trackService = inject(TrackService);
  private zone = inject(NgZone);
  private destroy$ = new Subject<void>();

  /** Studio vivant en arrière-plan : moteur, mix auto et mixtapes. */
  djLive = inject(DjLiveService);

  // ================= MOTEUR =================
  engine: DjEngine | null = null;
  panels: DeckPanel[] = [];
  quality = signal<'lite' | 'hq'>('lite');
  crossfade = signal(0.5);
  masterVolume = signal(0.9);
  isRecording = signal(false);
  recSeconds = 0;

  // refs DOM pilotées hors Angular (performance)
  private waveCanvases = viewChildren<ElementRef<HTMLCanvasElement>>('waveEl');
  private timeEls = viewChildren<ElementRef<HTMLSpanElement>>('timeEl');
  private remainEls = viewChildren<ElementRef<HTMLSpanElement>>('remainEl');
  private vuEls = viewChildren<ElementRef<HTMLDivElement>>('vuEl');
  private masterVuEl = viewChildren<ElementRef<HTMLDivElement>>('masterVuEl');
  private rafId: any = null;
  private staticWaves = new Map<string, HTMLCanvasElement>();

  // ================= BIBLIOTHEQUE =================
  library = signal<Track[]>([]);
  filteredLibrary = signal<Track[]>([]);
  selected = signal<Track[]>([]);
  filterText_ = '';
  genreFilter = 'all';
  genres = signal<string[]>([]);
  compatOnly = signal(false);
  ytExcluded = 0;
  loadingRows = signal<string[]>([]);

  // ================= FICHIERS LOCAUX =================
  /** Fichiers locaux du DJ — propriété du service racine : la liste SURVIT
   *  à la navigation (le DJ revient au studio, ses morceaux sont toujours là). */
  get localFiles() { return this.djLive.localFiles; }
  private filePickerTarget: DeckPanel | null = null;

  /** Presets d'effets 1 clic (EQ + filtre + FX). */
  readonly fxPresets: FxPreset[] = [
    { name: 'clean', label: 'CLEAN', desc: 'EQ neutre, aucun effet', eq: [0, 0, 0], filter: 0.5, echo: false, reverb: false, flanger: false, wet: 0.5 },
    { name: 'bass', label: 'BASS+', desc: 'Graves boostés +4 dB, aigus -2 dB', eq: [4, 0, -2], filter: 0.42, echo: false, reverb: false, flanger: false, wet: 0.5 },
    { name: 'club', label: 'CLUB', desc: 'EQ club + echo léger synchro BPM', eq: [2, 1, 2], filter: 0.5, echo: true, reverb: false, flanger: false, wet: 0.25 },
    { name: 'radio', label: 'RADIO', desc: 'Passe-haut type radio FM', eq: [-6, 3, 4], filter: 0.68, echo: false, reverb: false, flanger: false, wet: 0.5 },
    { name: 'space', label: 'SPACE', desc: 'Reverb ample + echo profond', eq: [0, 1, 3], filter: 0.5, echo: true, reverb: true, flanger: false, wet: 0.55 },
    { name: 'sweep', label: 'SWEEP', desc: 'Flanger montée davion (build-up)', eq: [0, 0, 1], filter: 0.5, echo: false, reverb: false, flanger: true, wet: 0.6 }
  ];

  // ================= AUTO-MIX / MIXTAPES =================
  mixModalVisible = signal(false);
  mixTitle = 'Mon mix YAM';
  crossfadeSec = 8;
  autoOrder = true;
  mixPriceXof = 0;
  creatingMix = signal(false);
  mixtapes = signal<Mixtape[]>([]);
  confirmDeleteMixId = signal<string | null>(null);
  deletingMixId = signal<string | null>(null);
  mixMessage = signal<string | null>(null);
  mixMessageOk = signal(false);
  private mixConfirmTimer: any = null;
  private mixMessageTimer: any = null;

  // ================= MIX AUTO (DJ IA) =================
  readonly moods = MOODS;
  mixMood = signal<Mood>('fete');
  mixGenre = 'all';
  mixCount: number | null = null;
  mixMaxMin = 45;
  mixEnergy = 8;
  mixStyle: 'auto' | TransitionType = 'auto';
  mixArtists = '';
  mixRecord = true;
  mixVoice = false;
  generating = signal(false);
  /** Libellé de progression pendant l'analyse des morceaux locaux. */
  generatingLabel = signal('');
  readonly styleOptions: { value: 'auto' | TransitionType; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    ...(Object.keys(TRANSITION_INFO) as TransitionType[])
      .map(k => ({ value: k, label: TRANSITION_INFO[k].label }))
  ];

  constructor() {
    // Un mix auto terminé (même après avoir quitté le studio) atterrit ici :
    // l'enregistrement devient publiable / téléchargeable.
    // Writes différés hors contexte réactif (NG0600 : interdit d'écrire des
    // signaux directement dans un effect — ça tuait l'affichage du mix fini).
    effect(() => {
      const r = this.djLive.autoResult();
      if (r?.blob) {
        const blob = r.blob;
        const completed = r.completed;
        window.setTimeout(() => {
          if (this.recUrl()) URL.revokeObjectURL(this.recUrl()!);
          this.recBlob = blob;
          this.recUrl.set(URL.createObjectURL(blob));
          this.recTitle = 'Mix Auto YAM ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          this.setRecMessage(completed
            ? 'Mix auto terminé et enregistré — prêt à publier ou télécharger.'
            : 'Mix auto arrêté : enregistrement partiel récupéré.', true);
        }, 0);
      }
    });
  }

  // ================= ENREGISTREMENT =================
  recBlob: Blob | null = null;
  recUrl = signal<string | null>(null);
  recTitle = 'Mon live YAM';
  recPriceXof = 0;
  publishing = signal(false);
  recMessage = signal<string | null>(null);
  recMessageOk = signal(false);

  // ================= UI =================
  helpVisible = signal(false);
  readonly eqBands = [
    { key: 'low' as const, label: 'LOW' },
    { key: 'mid' as const, label: 'MID' },
    { key: 'high' as const, label: 'HIGH' }
  ];
  readonly loopChoices = [1, 2, 4, 8, 16];

  recTime = signal(0);

  // ================= CYCLE DE VIE =================

  ngOnInit(): void {
    // Le moteur vit dans le SERVICE : il survit à la navigation (arrière-plan).
    this.engine = this.djLive.ensureEngine();
    this.panels = [
      new DeckPanel('A', this.engine.deckA),
      new DeckPanel('B', this.engine.deckB)
    ];
    // Restaure l'état des decks (ils peuvent jouer depuis une visite précédente)
    for (const p of this.panels) this.syncPanelFromDeck(p);
    this.engine.onDeckEnded = (deck) => {
      const panel = this.panelOf(deck);
      if (panel) this.zone.run(() => panel.playing.set(false));
    };
    // fichiers locaux connus du service (mix auto après navigation)
    for (const f of this.localFiles()) this.djLive.registerLocalFile(f.track.id, f.file);
    // un mix auto terminé en arrière-plan : on récupère l'enregistrement
    const prev = this.djLive.autoResult();
    if (prev?.blob && !this.recBlob) {
      this.recBlob = prev.blob;
      this.recUrl.set(URL.createObjectURL(prev.blob));
    }
    this.loadLibrary();
    this.loadMyMixtapes();
  }

  ngAfterViewInit(): void {
    // Boucle de rendu (waveforms, VU, temps) HORS zone Angular :
    // les canvas et libelles sont mis a jour en direct sans declencher
    // la detection de changements 60 fois par seconde.
    this.zone.runOutsideAngular(() => {
      const tick = () => {
        this.renderFrame();
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    });
    setTimeout(() => this.sizeCanvases(), 50);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.mixConfirmTimer) clearTimeout(this.mixConfirmTimer);
    if (this.mixMessageTimer) clearTimeout(this.mixMessageTimer);
    // Le moteur N'EST PAS détruit : decks, mix auto et mixtape continuent
    // en arrière-plan. Les buffers sont libérés seulement si tout est inactif.
    this.djLive.releaseEngineIfIdle();
    if (this.recUrl()) URL.revokeObjectURL(this.recUrl()!);
  }

  /** Réaligne les signaux d'un panneau sur l'état réel du deck (retour de navigation). */
  private syncPanelFromDeck(panel: DeckPanel): void {
    panel.playing.set(panel.deck.playing);
    panel.pitch.set(panel.deck.pitchPct);
    panel.cues.set([...panel.deck.cues]);
    panel.vol.set(panel.deck.volume);
    panel.loading.set(false);
    panel.error.set(null);
    panel.detail.set(panel.deck.track ? 'Prêt' : '');
    if (panel.deck.track && panel.deck.peaks.length) {
      setTimeout(() => this.renderStaticWave(panel), 80);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.sizeCanvases();
  }

  // ================= MOTEUR / RENDU =================

  private ensureEngine(): void {
    this.engine?.ctx.resume().catch(() => { });
  }

  private panelOf(deck: DjDeck): DeckPanel | null {
    return this.panels.find(p => p.deck === deck) || null;
  }

  private otherPanel(panel: DeckPanel): DeckPanel {
    return panel.id === 'A' ? this.panels[1] : this.panels[0];
  }

  /** Mesure les canvas (device pixel ratio) et regenere les waveforms statiques. */
  private sizeCanvases(): void {
    const waves = this.waveCanvases();
    if (!waves.length) return;
    waves.forEach((el, i) => {
      const panel = this.panels[i];
      if (!panel) return;
      const canvas = el.nativeElement;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      this.renderStaticWave(panel);
    });
  }

  /** Waveform statique (pics + grille de temps) pre-rendue hors boucle. */
  private renderStaticWave(panel: DeckPanel): void {
    const deck = panel.deck;
    const idx = panel.id === 'A' ? 0 : 1;
    const canvas = this.waveCanvases()[idx]?.nativeElement;
    if (!canvas || !deck.peaks.length) return;
    let staticCv = this.staticWaves.get(panel.id);
    if (!staticCv) {
      staticCv = document.createElement('canvas');
      this.staticWaves.set(panel.id, staticCv);
    }
    staticCv.width = canvas.width;
    staticCv.height = canvas.height;
    const g = staticCv.getContext('2d')!;
    const W = staticCv.width, H = staticCv.height;
    const mid = H / 2;

    g.clearRect(0, 0, W, H);

    // ligne centrale
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(0, mid - 0.5, W, 1);

    // pics (miroir vertical)
    const n = deck.peaks.length;
    const color = panel.id === 'A' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.55)';
    g.fillStyle = color;
    for (let x = 0; x < W; x++) {
      const v = deck.peaks[Math.floor((x / W) * n)] || 0;
      const h = Math.max(1, v * (H / 2 - 2));
      g.fillRect(x, mid - h, 1, h * 2);
    }

    // grille de temps : marqueurs de mesure (tous les 4 temps) si BPM connu
    const bpm = deck.track?.bpm;
    if (bpm && bpm > 0 && deck.duration > 0) {
      const beatLen = 60 / bpm;
      const barLen = beatLen * 4;
      const bars = Math.floor(deck.duration / barLen);
      for (let b = 0; b <= bars; b++) {
        const x = Math.floor((b * barLen / deck.duration) * W);
        g.fillStyle = b % 4 === 0 ? 'rgba(255,209,102,0.5)' : 'rgba(255,255,255,0.18)';
        g.fillRect(x, H - 8, 1, 8);
      }
    }

    // cue markers
    const cueColors = ['#FF6B35', '#FFD166', '#22C55E', '#60A5FA'];
    deck.cues.forEach((c, i) => {
      if (c == null || !deck.duration) return;
      const x = Math.floor((c / deck.duration) * W);
      g.fillStyle = cueColors[i];
      g.fillRect(x - 1, 0, 2, 10);
    });
    if (deck.mainCue != null && deck.duration) {
      const x = Math.floor((deck.mainCue / deck.duration) * W);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(x - 1, 0, 2, 14);
    }
  }

  /** Une frame : waveforms dynamiques + temps + VU. */
  private renderFrame(): void {
    if (!this.engine) return;
    this.engine.updateVu();

    // Le mix auto pilote aussi les decks : l'UI suit (lecture/pitch) sans
    // déclencher de détection de changement inutile (écriture seulement au changement).
    for (const panel of this.panels) {
      if (panel.playing() !== panel.deck.playing) {
        this.zone.run(() => panel.playing.set(panel.deck.playing));
      }
      if (Math.abs(panel.pitch() - panel.deck.pitchPct) > 0.05) {
        this.zone.run(() => panel.pitch.set(panel.deck.pitchPct));
      }
    }

    const waves = this.waveCanvases();
    const times = this.timeEls();
    const remains = this.remainEls();
    const vus = this.vuEls();

    this.panels.forEach((panel, i) => {
      const deck = panel.deck;

      // waveform dynamique
      const canvas = waves[i]?.nativeElement;
      const staticCv = this.staticWaves.get(panel.id);
      if (canvas && staticCv && canvas.width === staticCv.width) {
        const g = canvas.getContext('2d')!;
        const W = canvas.width, H = canvas.height;
        g.clearRect(0, 0, W, H);
        g.drawImage(staticCv, 0, 0);

        // progression teintee (source-atop ne teinte que les pixels dessines)
        if (deck.duration > 0) {
          const ratio = Math.max(0, Math.min(1, deck.position / deck.duration));
          if (ratio > 0) {
            g.save();
            g.globalCompositeOperation = 'source-atop';
            const grad = g.createLinearGradient(0, 0, W, 0);
            grad.addColorStop(0, 'rgba(255,107,53,0.85)');
            grad.addColorStop(1, 'rgba(255,209,102,0.85)');
            g.fillStyle = grad;
            g.fillRect(0, 0, W * ratio, H);
            g.restore();
          }

          // zone de boucle
          if (deck.loop) {
            const x0 = (deck.loop.start / deck.duration) * W;
            const x1 = (deck.loop.end / deck.duration) * W;
            g.fillStyle = 'rgba(255,107,53,0.18)';
            g.fillRect(x0, 0, x1 - x0, H);
            g.strokeStyle = 'rgba(255,107,53,0.8)';
            g.lineWidth = 2;
            g.strokeRect(x0, 1, x1 - x0, H - 2);
          }

          // playhead
          const px = (deck.position / deck.duration) * W;
          g.fillStyle = '#FFFFFF';
          g.fillRect(px - 1, 0, 2.5, H);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(px - 4, 0, 8, H);
        } else {
          g.drawImage(staticCv, 0, 0);
        }
      }

      // libelles temps (hors Angular)
      const tEl = times[i]?.nativeElement;
      const rEl = remains[i]?.nativeElement;
      if (tEl) tEl.textContent = this.fmt(deck.position);
      if (rEl && deck.duration) rEl.textContent = '-' + this.fmt(Math.max(0, deck.duration - deck.position));

      // VU
      const vuEl = vus[i]?.nativeElement;
      if (vuEl) {
        const level = Math.min(1, deck.vu);
        vuEl.style.width = (level * 100).toFixed(1) + '%';
        vuEl.className = 'h-full ' + (level > 0.85 ? 'bg-red-500' : level > 0.65 ? 'bg-yam-gold' : 'bg-yam-green');
      }
    });

    // master VU
    const mEl = this.masterVuEl()[0]?.nativeElement;
    if (mEl) {
      const level = Math.min(1, this.engine.masterVu);
      mEl.style.width = (level * 100).toFixed(1) + '%';
    }

    // chrono enregistrement (signal ~1 Hz, via zone pour le template)
    if (this.engine.recording) {
      const s = Math.floor(this.engine.recordDurationSec);
      if (s !== this.recTime()) {
        this.zone.run(() => this.recTime.set(s));
      }
    }
  }

  // ================= CHARGEMENT DES PISTES =================

  loadTrackToDeck(track: Track, panel: DeckPanel): void {
    if (!this.engine || panel.loading()) return;
    if (this.deckLockedByAutoMix(panel)) return;
    // Garde DJ : jamais couper un deck en lecture (pause d'abord, comme en boite)
    if (panel.playing()) {
      panel.error.set('Ce deck joue — mets-le en pause avant de charger une autre piste.');
      return;
    }
    this.ensureEngine();
    panel.loading.set(true);
    panel.error.set(null);
    panel.pct.set(0);
    panel.pitch.set(0); // anti pitch fantôme : le deck est reset, l'affichage aussi
    panel.detail.set('Connexion...');

    this.djLive.loadTrackIntoDeck(track, panel.deck, this.quality(), (p, detail) => {
      panel.pct.set(Math.round(p * 100));
      panel.detail.set(detail);
    }).then(() => {
      panel.loading.set(false);
      panel.playing.set(false);
      this.renderStaticWave(panel);
    }).catch(() => {
      panel.loading.set(false);
      panel.error.set(panel.deck.loadError
        || 'Impossible de decoder cette piste sur ce navigateur (essaie Chrome/Edge).');
    });
  }

  /** Le mix auto occupe les 2 decks en ping-pong : on bloque la manipulation manuelle. */
  private deckLockedByAutoMix(panel: DeckPanel): boolean {
    if (!this.djLive.autoActive()) return false;
    panel.error.set('Mix auto en cours — clique Stop dans MIX AUTO pour reprendre la main sur les decks.');
    return true;
  }

  ejectDeck(panel: DeckPanel): void {
    if (this.deckLockedByAutoMix(panel)) return;
    panel.deck.pause();
    panel.deck.track = null;
    panel.deck.buffer = null;
    panel.deck.peaks = new Float32Array(0);
    panel.deck.loop = null;
    panel.deck.cues = [null, null, null, null];
    panel.deck.mainCue = null;
    panel.deck.setPitch(0);
    panel.pitch.set(0);
    panel.playing.set(false);
    panel.error.set(null);
    panel.loading.set(false);
    this.staticWaves.delete(panel.id);
    const idx = panel.id === 'A' ? 0 : 1;
    const canvas = this.waveCanvases()[idx]?.nativeElement;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ================= TRANSPORT =================

  toggleDeck(panel: DeckPanel): void {
    this.ensureEngine();
    panel.deck.toggle();
    panel.playing.set(panel.deck.playing);
  }

  cueDeck(panel: DeckPanel): void {
    this.ensureEngine();
    panel.deck.cue();
    panel.playing.set(panel.deck.playing);
  }

  cuePadClick(panel: DeckPanel, index: number, event: MouseEvent | KeyboardEvent): void {
    if (event.shiftKey) {
      panel.deck.clearCuePad(index);
      panel.cues.set([...panel.deck.cues]);
      this.renderStaticWave(panel);
      return;
    }
    this.ensureEngine();
    panel.deck.setCuePad(index);
    panel.playing.set(panel.deck.playing);
    panel.cues.set([...panel.deck.cues]);
    this.renderStaticWave(panel);
  }

  seekWave(panel: DeckPanel, event: MouseEvent): void {
    const deck = panel.deck;
    if (!deck.buffer || !deck.duration) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    this.ensureEngine();
    deck.seek(ratio * deck.duration);
    panel.playing.set(deck.playing);
  }

  setPitch(panel: DeckPanel, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    panel.deck.setPitch(value);
    panel.pitch.set(panel.deck.pitchPct);
  }

  resetPitch(panel: DeckPanel): void {
    panel.deck.setPitch(0);
    panel.pitch.set(0);
  }

  nudge(panel: DeckPanel, direction: 1 | -1): void {
    panel.deck.nudgeStart(direction);
  }

  nudgeEnd(panel: DeckPanel): void {
    panel.deck.nudgeEnd();
  }

  // ================= SYNC / HARMONIE =================

  canSync(panel: DeckPanel): boolean {
    const other = this.otherPanel(panel);
    return !!(panel.deck.track?.bpm && other.deck.track?.bpm);
  }

  syncDeck(panel: DeckPanel): void { this.syncTo(panel, this.otherPanel(panel)); }

  syncBtoA(): void { this.syncTo(this.panels[1], this.panels[0]); }

  private syncTo(panel: DeckPanel, reference: DeckPanel): void {
    const deck = panel.deck;
    const ref = reference.deck;
    if (!deck.track?.bpm || !ref.track?.bpm) return;
    const targetBpm = ref.effectiveBpm!;
    let ratio = targetBpm / deck.track.bpm;
    while (ratio > 1.08) ratio /= 2;   // half-time
    while (ratio < 0.92) ratio *= 2;   // double-time
    if (ratio > 1.085 || ratio < 0.915) {
      this.setRecMessage('Écart de BPM trop grand même en moitié/double — choisis une autre piste.', false);
      return;
    }
    deck.setPitch((ratio - 1) * 100);
    panel.pitch.set(deck.pitchPct);
  }

  syncHint(): string {
    const a = this.panels[0]?.deck;
    const b = this.panels[1]?.deck;
    if (!a?.track?.bpm || !b?.track?.bpm) return 'Sync disponible quand les 2 decks ont un BPM';
    const aBpm = a.effectiveBpm!;
    let ratio = aBpm / b.track.bpm;
    while (ratio > 1.08) ratio /= 2;
    while (ratio < 0.92) ratio *= 2;
    if (ratio > 1.085 || ratio < 0.915) return 'Écart trop grand (half/double insuffisant)';
    const pct = (ratio - 1) * 100;
    return `B aligné à ${aBpm.toFixed(1)} BPM → pitch ${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %`;
  }

  /** Compatibilite harmonique Camelot entre les 2 decks. */
  keyCompatClass(): string {
    const c = this.keyCompat();
    return c === 'ok' ? 'bg-yam-green/20 text-yam-green border border-yam-green/30'
      : c === 'near' ? 'bg-yam-gold/20 text-yam-gold border border-yam-gold/30'
        : 'bg-white/10 text-white/50 border border-white/10';
  }

  keyCompatText(): string {
    const a = this.panels[0]?.deck.track?.camelot;
    const b = this.panels[1]?.deck.track?.camelot;
    const c = this.keyCompat();
    if (!a || !b) return 'Charge 2 pistes avec tonalité';
    if (c === 'ok') return `✓ ${a} ↔ ${b} : compatible`;
    if (c === 'near') return `≈ ${a} ↔ ${b} : proche`;
    return `✗ ${a} ↔ ${b} : dissonant`;
  }

  private keyCompat(): 'ok' | 'near' | 'none' {
    const a = this.panels[0]?.deck.track?.camelot;
    const b = this.panels[1]?.deck.track?.camelot;
    if (!a || !b) return 'none';
    const na = parseInt(a), nb = parseInt(b);
    if (isNaN(na) || isNaN(nb)) return 'none';
    const la = a.slice(-1), lb = b.slice(-1);
    const numDiff = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
    if (numDiff === 0) return la === lb ? 'ok' : 'near';  // meme tonalite ou relatif majeur/mineur
    if (numDiff === 1) return 'ok';                        // adjacent dans la roue Camelot
    if (numDiff === 2) return 'near';
    return 'none';
  }

  // ================= MIX =================

  setCrossfade(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.crossfade.set(value);
    this.engine?.setCrossfade(value);
  }

  setMasterVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.masterVolume.set(value);
    this.engine?.setMasterVolume(value);
  }

  setVolume(panel: DeckPanel, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    panel.deck.setVolume(value);
    panel.vol.set(value);
  }

  setEq(panel: DeckPanel, band: 'low' | 'mid' | 'high', event: Event): void {
    const db = Number((event.target as HTMLInputElement).value);
    panel.deck.setEq(band, db);
    if (band === 'low') panel.eqLow.set(db);
    if (band === 'mid') panel.eqMid.set(db);
    if (band === 'high') panel.eqHigh.set(db);
  }

  setFilter(panel: DeckPanel, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    panel.deck.setFilter(value);
    panel.filter.set(value);
  }

  toggleEcho(panel: DeckPanel): void {
    const on = !panel.echoOn();
    const bpm = panel.deck.effectiveBpm;
    const beatSync = bpm ? 60 / bpm : undefined;
    panel.deck.setEcho(on, panel.echoWet(), beatSync);
    panel.echoOn.set(on);
  }

  setEchoWet(panel: DeckPanel, event: Event): void {
    const wet = Number((event.target as HTMLInputElement).value);
    panel.echoWet.set(wet);
    const bpm = panel.deck.effectiveBpm;
    const beatSync = bpm ? 60 / bpm : undefined;
    if (panel.echoOn()) panel.deck.setEcho(true, wet, beatSync);
  }

  toggleReverb(panel: DeckPanel): void {
    const on = !panel.reverbOn();
    panel.deck.setReverb(on, panel.reverbWet());
    panel.reverbOn.set(on);
  }

  setReverbWet(panel: DeckPanel, event: Event): void {
    const wet = Number((event.target as HTMLInputElement).value);
    panel.reverbWet.set(wet);
    if (panel.reverbOn()) panel.deck.setReverb(true, wet);
  }

  toggleFlanger(panel: DeckPanel): void {
    const on = !panel.flangerOn();
    panel.deck.setFlanger(on, panel.flangerWet());
    panel.flangerOn.set(on);
  }

  setFlangerWet(panel: DeckPanel, event: Event): void {
    const wet = Number((event.target as HTMLInputElement).value);
    panel.flangerWet.set(wet);
    if (panel.flangerOn()) panel.deck.setFlanger(true, wet);
  }

  /** Applique un preset d'effets (EQ + filtre + effets) au deck. */
  applyPreset(panel: DeckPanel, preset: FxPreset): void {
    panel.deck.setEq('low', preset.eq[0]);
    panel.deck.setEq('mid', preset.eq[1]);
    panel.deck.setEq('high', preset.eq[2]);
    panel.eqLow.set(preset.eq[0]);
    panel.eqMid.set(preset.eq[1]);
    panel.eqHigh.set(preset.eq[2]);
    panel.deck.setFilter(preset.filter);
    panel.filter.set(preset.filter);
    const bpm = panel.deck.effectiveBpm;
    const beatSync = bpm ? 60 / bpm : undefined;
    panel.deck.setEcho(preset.echo, preset.wet, beatSync);
    panel.echoOn.set(preset.echo);
    panel.echoWet.set(preset.wet);
    panel.deck.setReverb(preset.reverb, preset.wet);
    panel.reverbOn.set(preset.reverb);
    panel.reverbWet.set(Math.min(0.9, preset.wet));
    panel.deck.setFlanger(preset.flanger, preset.wet);
    panel.flangerOn.set(preset.flanger);
    panel.flangerWet.set(preset.wet);
  }

  toggleLoop(panel: DeckPanel, bars: number): void {
    this.ensureEngine();
    panel.deck.setLoopBars(bars, panel.deck.track?.bpm ?? null);
  }

  // ================= FICHIERS LOCAUX =================

  /** Ouvre le selecteur de fichier pour charger directement dans un deck. */
  pickLocalFile(panel: DeckPanel): void {
    if (this.deckLockedByAutoMix(panel)) return;
    if (panel.playing()) {
      panel.error.set('Ce deck joue — mets-le en pause avant de charger un autre fichier.');
      return;
    }
    this.filePickerTarget = panel;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file && this.filePickerTarget) {
        const [entry] = this.djLive.addLocalFiles([file]);
        if (entry) this.loadLocalToDeck(entry, this.filePickerTarget);
      }
      this.filePickerTarget = null;
    };
    input.click();
  }

  /** Selection multiple depuis la zone "Ma musique locale". */
  onLocalFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.djLive.addLocalFiles(input.files);
    input.value = '';
  }

  rowLoadingLocal(item: LocalFileEntry): boolean { return item.loading; }

  removeLocalFile(item: LocalFileEntry): void {
    this.djLive.removeLocalFile(item.id);
  }

  /** Charge un fichier local dans un deck (avec BPM detecte automatiquement). */
  loadLocalToDeck(item: LocalFileEntry, panel: DeckPanel): void {
    if (!this.engine || panel.loading()) return;
    if (this.deckLockedByAutoMix(panel)) return;
    if (panel.playing()) {
      panel.error.set('Ce deck joue — mets-le en pause avant de charger un autre fichier.');
      return;
    }
    this.ensureEngine();
    // fichier connu du service (mix auto en arriere-plan)
    this.djLive.registerLocalFile(item.track.id, item.file);
    panel.loading.set(true);
    panel.error.set(null);
    panel.pct.set(0);
    panel.pitch.set(0); // anti pitch fantôme : le deck est reset, l'affichage aussi
    panel.detail.set('Lecture du fichier...');
    item.loading = true;
    this.djLive.touchLocalFiles();

    panel.deck.loadLocalFile(item.file, item.track, (p, phase, detail) => {
      panel.pct.set(Math.round(p * 100));
      panel.detail.set(detail);
    }).then(bpm => {
      // synchronise la piste (BPM/duree mis a jour par le moteur)
      item.track = panel.deck.track!;
      this.djLive.registerLocalFile(item.track.id, item.file);
      item.loading = false;
      this.djLive.touchLocalFiles();
      panel.loading.set(false);
      panel.playing.set(false);
      this.renderStaticWave(panel);
      if (bpm) {
        panel.detail.set('BPM détecté : ' + bpm);
      }
    }).catch(() => {
      item.loading = false;
      this.djLive.touchLocalFiles();
      panel.loading.set(false);
      panel.error.set(panel.deck.loadError || 'Fichier illisible sur ce navigateur.');
    });
  }

  // ================= ENREGISTREMENT =================

  anyDeckReady(): boolean {
    return !!this.panels?.some(p => !!p.deck.buffer);
  }

  startRecording(): void {
    if (!this.engine?.canRecord) return;
    this.ensureEngine();
    this.recMessage.set(null);
    this.recTime.set(0);
    if (this.recUrl()) { URL.revokeObjectURL(this.recUrl()!); this.recUrl.set(null); }
    this.recBlob = null;
    if (this.engine.startRecording()) {
      this.isRecording.set(true);
    }
  }

  stopRecording(): void {
    if (!this.engine) return;
    this.engine.stopRecording().then(blob => {
      this.zone.run(() => {
        this.isRecording.set(false);
        if (!blob) {
          this.setRecMessage('Rien à enregistrer (mix vide ou trop court).', false);
          return;
        }
        this.recBlob = blob;
        this.recUrl.set(URL.createObjectURL(blob));
        this.recTitle = this.recTitle || 'Mon live YAM';
      });
    });
  }

  recFileName(): string {
    return (this.recTitle || 'mix-yam-dj').replace(/[^a-zA-Z0-9-_]+/g, '-').toLowerCase()
      + (this.recBlob?.type.includes('mp4') ? '.m4a' : '.webm');
  }

  publishRecording(): void {
    if (!this.recBlob) return;
    this.publishing.set(true);
    this.recMessage.set(null);
    this.djService.uploadMixtape(
      this.recBlob, this.recTitle, this.recPriceXof || 0, Math.round(this.recTime()))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: mix => {
          this.publishing.set(false);
          this.setRecMessage(`Mix publié ! "${mix.title}" est en ligne dans tes mixtapes.`, true);
          this.loadMyMixtapes();
        },
        error: err => {
          this.publishing.set(false);
          const status = err?.status;
          const msg = err?.error?.message || (typeof err?.error === 'string' ? err.error : '') || '';
          if (status === 404 || msg.includes('not supported') || msg.includes('No static resource')) {
            this.setRecMessage('Publication prête côté code : le serveur doit être mis à jour '
              + '(déploiement en cours). Télécharge ton mix en attendant — rien n\'est perdu.', false);
          } else if (status === 429) {
            this.setRecMessage('Trop de tentatives — patiente un instant.', false);
          } else {
            this.setRecMessage(msg || 'Publication impossible pour le moment.', false);
          }
        }
      });
  }

  private setRecMessage(msg: string, ok: boolean): void {
    this.recMessage.set(msg);
    this.recMessageOk.set(ok);
  }

  // ================= BIBLIOTHEQUE =================

  loadLibrary(): void {
    this.djService.studioLibrary().pipe(takeUntil(this.destroy$)).subscribe({
      next: (page: any) => {
        const all: Track[] = page?.content || [];
        this.ytExcluded = all.filter(t => !t.audioUrlHq && !t.audioUrlLq).length;
        const mixable = all.filter(t => t.audioUrlHq || t.audioUrlLq);
        this.library.set(mixable);
        const g = [...new Set(mixable.map(t => t.genre).filter((x): x is string => !!x))].sort();
        this.genres.set(g);
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
    if (this.compatOnly()) {
      const refBpm = this.panels[0]?.deck.effectiveBpm;
      if (refBpm) {
        items = items.filter(t => t.bpm && Math.abs(t.bpm - refBpm) <= 6);
      }
    }
    if (this.filterText_.trim()) {
      const q = this.filterText_.toLowerCase();
      items = items.filter(t =>
        t.title.toLowerCase().includes(q)
        || (t.artistName || '').toLowerCase().includes(q)
        || String(t.bpm || '').includes(q)
        || (t.camelot || '').toLowerCase().includes(q));
    }
    this.filteredLibrary.set(items);
  }

  rowLoading(item: Track): boolean {
    return this.loadingRows().includes(item.id);
  }

  toggleSelect(item: Track): void {
    const current = this.selected();
    const idx = current.findIndex(t => t.id === item.id);
    this.selected.set(idx >= 0 ? current.filter(t => t.id !== item.id) : [...current, item]);
  }

  isSelected(item: Track): boolean {
    return this.selected().some(t => t.id === item.id);
  }

  // ================= MIX AUTO (DJ IA) + MIXTAPES =================

  /** Génère le plan du mix (sélection + courbe + transitions). */
  generateMix(): void {
    if (this.library().length + this.localFiles().length < 2) {
      this.setMixMessage('Il faut au moins 2 pistes mixables : charge tes fichiers (mp3, m4a, wav…) ou publie tes titres depuis l\'espace artiste.', false);
      return;
    }
    const params: Partial<MixParams> = {
      mood: this.mixMood(),
      genre: this.mixGenre,
      trackCount: this.mixCount,
      trackIds: this.selected().length >= 2 ? this.selected().map(t => t.id) : [],
      artists: this.mixArtists.split(',').map(s => s.trim()).filter(Boolean),
      targetBpm: null,
      maxDurationSec: this.mixMaxMin * 60,
      trackDurationSec: null,
      energyLevel: this.mixEnergy,
      transitionStyle: this.mixStyle,
      introOutro: true,
      djVoice: this.mixVoice
    };
    this.generating.set(true);
    this.generatingLabel.set('Préparation…');
    // 1) analyse des fichiers locaux jamais analysés (BPM/tonalité réels)
    // 2) puis construction du pool (références à jour) et planification
    this.analyzeLocalPoolForMix().then(() => {
      try {
        const localTracks = this.localFiles().map(f => f.track);
        const pool: Track[] = this.selected().length >= 2
          ? [...this.selected(), ...localTracks.filter(t => !this.selected().some(s => s.id === t.id))]
          : [...this.library(), ...localTracks];
        if (pool.length < 2) {
          this.setMixMessage('Il faut au moins 2 pistes mixables (catalogue ou fichiers locaux).', false);
          return;
        }
        const plan = planAutoMix(pool, params);
        this.djLive.autoPlan.set(plan);
        if (plan.segments.length < 2) {
          this.setMixMessage(plan.warnings[0] || 'Pas assez de pistes pour construire un mix.', false);
        } else {
          this.setMixMessage(`Plan prêt : ${plan.summary}`, true);
        }
      } catch (e: any) {
        this.setMixMessage('Génération impossible : ' + (e?.message || 'erreur'), false);
      } finally {
        this.generating.set(false);
      }
    });
  }

  /**
   * Analyse les fichiers locaux sans métriques (BPM, tonalité, durée)
   * AVANT la planification : le DJ IA planifie sur des données réelles.
   * Progression affichée dans le bouton (« Analyse 2/5… »).
   */
  private async analyzeLocalPoolForMix(): Promise<void> {
    const unanalyzed = this.localFiles().filter(f => !f.track.bpm && !f.loading);
    if (!unanalyzed.length) return;
    this.generatingLabel.set('Analyse des morceaux…');
    let done = 0;
    for (const entry of unanalyzed) {
      if (entry.loading) continue;
      done++;
      this.generatingLabel.set(`Analyse ${done}/${unanalyzed.length} : ${entry.track.title.slice(0, 18)}`);
      await this.analyzeLocalEntry(entry);
    }
    this.generatingLabel.set('');
  }

  /** Décode un fichier local et remplit BPM / tonalité / durée (silencieux si échec). */
  private async analyzeLocalEntry(entry: LocalFileEntry): Promise<void> {
    entry.loading = true;
    this.djLive.touchLocalFiles();
    try {
      const engine = this.djLive.ensureEngine();
      const data = await entry.file.arrayBuffer();
      const buf = await engine.ctx.decodeAudioData(data);
      const bpm = detectBpm(buf);
      const camelot = entry.track.camelot || estimateCamelot(buf);
      entry.track = {
        ...entry.track,
        bpm: bpm || entry.track.bpm,
        camelot: camelot || entry.track.camelot,
        durationSec: Math.round(buf.duration) || entry.track.durationSec
      };
      this.djLive.registerLocalFile(entry.track.id, entry.file);
    } catch { /* on planifie sans métriques : l'analyse au chargement rattrapera */ }
    finally {
      entry.loading = false;
      this.djLive.touchLocalFiles();
    }
  }

  /** Lance la lecture du mix par le DJ IA (arrière-plan + MediaSession). */
  launchAutoMix(): void {
    const plan: MixPlan | null = this.djLive.autoPlan();
    if (!plan || plan.segments.length < 2) return;
    // fichiers locaux utilisés par le plan → connus du service
    for (const f of this.localFiles()) this.djLive.registerLocalFile(f.track.id, f.file);
    this.djLive.startAutoMix(plan, { record: this.mixRecord, djVoice: this.mixVoice });
  }

  stopAutoMix(): void { this.djLive.stopAutoMix(1.5); }

  discardMix(): void { this.djLive.autoPlan.set(null); }

  currentAutoSeg() { return this.djLive.autoPlan()?.segments[this.djLive.autoIndex()] || null; }
  nextAutoSeg() { return this.djLive.autoPlan()?.segments[this.djLive.autoIndex() + 1] || null; }
  currentAutoMeasured() { return this.djLive.activeAutoPlayer?.snapshot?.currentMeasured || null; }
  autoSegCount(): number { return this.djLive.autoPlan()?.segments.length || 0; }

  autoProgressPct(): number {
    const dur = this.djLive.autoMixDuration();
    if (!dur) return 0;
    return Math.max(0, Math.min(100, (this.djLive.autoMixPosition() / dur) * 100));
  }

  transitionLabelOf(tr: MixTransition): string {
    const info = TRANSITION_INFO[tr.type];
    return `${info.label} · ${tr.bars} mesures`;
  }

  mixSourceLabel(): string {
    if (this.selected().length >= 2) {
      return `Sélection manuelle : ${this.selected().length} pistes — le DJ IA les réordonne`;
    }
    const lib = this.library().length;
    const loc = this.localFiles().length;
    if (lib && loc) return `Sélection automatique : ${lib} du catalogue + ${loc} fichiers locaux`;
    if (loc) return `Sélection automatique : tes ${loc} fichiers locaux`;
    return `Sélection automatique : ${lib} pistes du catalogue`;
  }

  ceil(v: number): number { return Math.ceil(v); }

  djSharePreview(): number {
    return Math.floor((this.mixPriceXof || 0) * 70 / 100);
  }

  createMixtape(): void {
    const ids = this.selected().map(t => t.id);
    if (ids.length < 2) return;
    this.creatingMix.set(true);
    this.djService.createMixtape({
      title: this.mixTitle,
      trackIds: ids,
      crossfadeSec: this.crossfadeSec,
      autoOrder: this.autoOrder,
      priceXof: this.mixPriceXof || 0
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: mix => {
        this.creatingMix.set(false);
        this.mixModalVisible.set(false);
        this.setMixMessage(`Mixtape "${mix.title}" créée et publiée !`, true);
        this.loadMyMixtapes();
      },
      error: err => {
        this.creatingMix.set(false);
        this.setMixMessage(err?.error?.message || 'Création impossible pour le moment.', false);
      }
    });
  }

  loadMyMixtapes(): void {
    this.djService.myMixtapes().pipe(takeUntil(this.destroy$)).subscribe({
      next: (list: Mixtape[]) => this.mixtapes.set(list || []),
      error: () => this.mixtapes.set([])
    });
  }

  playMixtape(mix: Mixtape): void {
    // lecture via le service : continue en arrière-plan
    this.djLive.playMixtape(mix, (ok, msg) => this.setMixMessage(msg, ok));
  }

  stopMixtape(): void {
    this.djLive.stopMixtape();
  }

  askDeleteMixtape(mix: Mixtape): void {
    if (this.confirmDeleteMixId() === mix.id) {
      this.confirmDeleteMixId.set(null);
      if (this.mixConfirmTimer) { clearTimeout(this.mixConfirmTimer); this.mixConfirmTimer = null; }
      this.deletingMixId.set(mix.id);
      this.djService.deleteMixtape(mix.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.deletingMixId.set(null);
          this.setMixMessage(`"${mix.title}" supprimée.`, true);
          this.loadMyMixtapes();
        },
        error: err => {
          this.deletingMixId.set(null);
          this.setMixMessage(err?.error?.message || 'Suppression impossible.', false);
        }
      });
    } else {
      this.confirmDeleteMixId.set(mix.id);
      if (this.mixConfirmTimer) clearTimeout(this.mixConfirmTimer);
      this.mixConfirmTimer = setTimeout(() => this.confirmDeleteMixId.set(null), 3500);
    }
  }

  private setMixMessage(msg: string, ok: boolean): void {
    this.mixMessage.set(msg);
    this.mixMessageOk.set(ok);
    if (this.mixMessageTimer) clearTimeout(this.mixMessageTimer);
    this.mixMessageTimer = setTimeout(() => this.mixMessage.set(null), 6000);
  }

  // ================= CLAVIER =================

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (!this.panels.length) return;
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        this.toggleDeck(event.shiftKey ? this.panels[1] : this.panels[0]);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.nudgeCrossfade(-0.04);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.nudgeCrossfade(0.04);
        break;
      case 'KeyS':
        this.syncBtoA();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
        const idx = Number(event.code.slice(-1)) - 1;
        this.cuePadClick(event.shiftKey ? this.panels[1] : this.panels[0], idx, event);
        break;
      }
    }
  }

  private nudgeCrossfade(delta: number): void {
    if (!this.engine) return;
    const x = Math.max(0, Math.min(1, this.engine.crossfade + delta));
    this.engine.setCrossfade(x);
    this.crossfade.set(x);
  }

  toggleHelp(): void { this.helpVisible.set(!this.helpVisible()); }

  // ================= AFFICHAGE / HELPERS =================

  liveBpm(panel: DeckPanel): string {
    const bpm = panel.deck.effectiveBpm;
    return bpm ? bpm.toFixed(1) : '—';
  }

  eqValue(panel: DeckPanel, band: 'low' | 'mid' | 'high'): number {
    return band === 'low' ? panel.eqLow() : band === 'mid' ? panel.eqMid() : panel.eqHigh();
  }

  eqDbText(panel: DeckPanel, band: 'low' | 'mid' | 'high'): string {
    const db = this.eqValue(panel, band);
    return db <= -29 ? 'CUT' : (db > 0 ? '+' : '') + db + 'dB';
  }

  volText(panel: DeckPanel): string {
    return Math.round(panel.vol() * 100) + '%';
  }

  filterText(panel: DeckPanel): string {
    const f = panel.filter();
    if (Math.abs(f - 0.5) < 0.03) return 'OFF';
    if (f < 0.5) return 'LPF';
    return 'HPF';
  }

  loopLenText(panel: DeckPanel): string {
    const loop = panel.deck.loop;
    if (!loop) return '';
    return this.fmt(loop.end - loop.start);
  }

  deckBorderClass(panel: DeckPanel): string {
    const playing = panel.deck.playing;
    if (panel.id === 'A') {
      return playing ? 'border-yam-orange/50 bg-yam-orange/5' : 'border-white/10';
    }
    return playing ? 'border-yam-gold/50 bg-yam-gold/5' : 'border-white/10';
  }

  masterPct(): string {
    return String(Math.round(this.masterVolume() * 100));
  }

  recTimeText(): string {
    return this.fmt(this.recTime());
  }

  /** Fix Chrome : les webm MediaRecorder signalent une duree Infinity
   *  jusqu'a ce qu'on seek — on force la lecture des metadonnees. */
  fixRecDuration(event: Event): void {
    const audio = event.target as HTMLAudioElement;
    if (audio.duration === Infinity || isNaN(audio.duration)) {
      const onSeek = () => {
        audio.removeEventListener('timeupdate', onSeek);
        audio.currentTime = 0;
      };
      audio.addEventListener('timeupdate', onSeek);
      audio.currentTime = 1e7;
    }
  }

  fmt(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('fr-FR'); } catch { return ''; }
  }
}

/** Panneau UI d'un deck : signaux pour le template, deck = moteur audio. */
class DeckPanel {
  playing = signal(false);
  loading = signal(false);
  pct = signal(0);
  detail = signal('');
  error = signal<string | null>(null);
  pitch = signal(0);
  eqLow = signal(0);
  eqMid = signal(0);
  eqHigh = signal(0);
  vol = signal(1);
  filter = signal(0.5);
  echoOn = signal(false);
  echoWet = signal(0.5);
  reverbOn = signal(false);
  reverbWet = signal(0.4);
  flangerOn = signal(false);
  flangerWet = signal(0.5);
  cues = signal<(number | null)[]>([null, null, null, null]);

  constructor(readonly id: 'A' | 'B', readonly deck: DjDeck) { }
}

/** Preset d'effets appliquable en 1 clic. */
interface FxPreset {
  name: string;
  label: string;
  desc: string;
  eq: [number, number, number];
  filter: number;
  echo: boolean;
  reverb: boolean;
  flanger: boolean;
  wet: number;
}
