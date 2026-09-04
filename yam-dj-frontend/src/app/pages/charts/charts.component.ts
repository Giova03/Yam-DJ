import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { ChartsService } from '../../services/charts.service';
import { PlayerService } from '../../services/player.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ChartTrackComponent } from '../../components/track-variants/chart-track.component';
import { RevealDirective } from '../../directives/reveal.directive';
import { ChartEntry, Track } from '../../models/models';

/**
 * PAGE CHARTS V2 (§08) — sensation magazine musical + compétition + culture.
 * Le #1 est traité différemment (grande pochette, numéro, variation, écoutes),
 * les positions suivantes restent compactes. Filtres pays, semaine affichée.
 */
@Component({
  selector: 'yam-charts-page',
  standalone: true,
  imports: [RouterLink, IconComponent, ChartTrackComponent, RevealDirective],
  template: `
    <div class="max-w-editorial mx-auto px-4 pt-6 pb-12">

      <!-- En-tete editorial -->
      <header class="mb-8">
        <p class="yam-kicker mb-2">Classement hebdomadaire</p>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="yam-display text-4xl sm:text-5xl">YAM CHARTS</h1>
            @if (weekLabel()) {
              <p class="text-white/50 text-sm mt-2">Semaine du {{ weekLabel() }} — recompté chaque heure</p>
            }
          </div>
          @if (chartTracks().length) {
            <button (click)="playAll()" class="yam-btn-primary !px-6 !py-3 inline-flex items-center gap-2">
              <yam-icon name="play" [size]="17" class="fill-current"/> Tout écouter
            </button>
          }
        </div>
      </header>

      <!-- Filtres pays -->
      <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-6" role="tablist" aria-label="Filtrer le chart par pays">
        <button (click)="load('all')" [attr.aria-selected]="selectedCountry() === 'all'" role="tab"
                class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition"
                [class]="selectedCountry() === 'all' ? 'bg-yam-orange text-yam-ink border-yam-orange' : 'text-white/60 border-white/15 hover:text-white hover:border-white/30'">
          Afrique de l'Ouest
        </button>
        @for (c of countries(); track c) {
          <button (click)="load(c)" [attr.aria-selected]="selectedCountry() === c" role="tab"
                  class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition"
                  [class]="selectedCountry() === c ? 'bg-yam-orange text-yam-ink border-yam-orange' : 'text-white/60 border-white/15 hover:text-white hover:border-white/30'">
            {{ countryFlag(c) }} {{ c }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="yam-card !rounded-3xl p-5 sm:p-7 mb-3 grid sm:grid-cols-[190px_1fr] gap-6 animate-pulse" aria-hidden="true">
          <div class="w-full aspect-square rounded-2xl bg-white/5 max-w-[190px]"></div>
          <div class="space-y-3"><div class="h-12 w-24 bg-white/5 rounded"></div><div class="h-6 w-2/3 bg-white/5 rounded"></div><div class="h-4 w-1/3 bg-white/5 rounded"></div></div>
        </div>
        <div class="yam-card !rounded-3xl p-5 space-y-4 animate-pulse" aria-hidden="true">
          @for (s of [1,2,3,4,5,6]; track s) {
            <div class="flex items-center gap-4"><div class="w-12 h-8 bg-white/5 rounded"></div><div class="w-14 h-14 rounded-xl bg-white/5"></div><div class="flex-1 h-4 bg-white/5 rounded w-1/2"></div></div>
          }
        </div>
      } @else {
        @if (entries().length) {

          <!-- ===== LE NUMERO 1 ===== -->
          @if (entries()[0]; as top) {
            <div class="yam-card !rounded-3xl !border-yam-orange/30 p-5 sm:p-8 mb-3 grid grid-cols-1 sm:grid-cols-[minmax(0,230px)_minmax(0,1fr)] gap-6 sm:gap-8 items-center cursor-pointer group yam-grain relative overflow-hidden"
                 (click)="playEntry(top)" yamReveal>
              <div class="yam-glow w-[20rem] h-[20rem] -top-24 -right-10 opacity-50"></div>
              <div class="relative w-full aspect-square rounded-[1.5rem] overflow-hidden max-w-[230px] shadow-2xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/20">
                @if (top.track?.coverUrl) {
                  <img [src]="top.track?.coverUrl" [alt]="'Pochette de ' + (top.track?.title || '')" class="w-full h-full object-cover group-hover:scale-[1.04] transition duration-700">
                } @else {
                  <span class="w-full h-full flex items-center justify-center text-yam-orange"><yam-icon name="trophy" [size]="64"/></span>
                }
                <span class="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center shadow-2xl">
                  <yam-icon name="play" [size]="24" class="fill-current translate-x-[1px]"/>
                </span>
              </div>
              <div class="relative">
                <div class="flex items-center gap-4 flex-wrap mb-3">
                  <span class="yam-display text-7xl sm:text-8xl text-yam-orange leading-none">{{ top.rank }}</span>
                  <div class="flex flex-col gap-1">
                    <span class="yam-kicker !text-[10px]">Numéro 1 de la semaine</span>
                    @if (top.movement == null) {
                      <span class="text-yam-gold text-sm font-bold yam-num flex items-center gap-1"><yam-icon name="sparkles" [size]="14"/> ENTRÉE</span>
                    } @else if (top.movement! > 0) {
                      <span class="text-yam-green text-sm font-bold yam-num flex items-center gap-1"><yam-icon name="trending-up" [size]="14"/> +{{ top.movement }}</span>
                    } @else if (top.movement! < 0) {
                      <span class="text-red-400/90 text-sm font-bold yam-num flex items-center gap-1"><yam-icon name="trending-down" [size]="14"/> {{ top.movement }}</span>
                    } @else {
                      <span class="text-white/40 text-sm yam-num">position stable</span>
                    }
                  </div>
                </div>
                <h2 class="font-display font-bold text-2xl sm:text-3xl leading-tight group-hover:text-yam-orange transition">{{ top.track?.title }}</h2>
                <a [routerLink]="top.track?.artistId ? ['/artist', top.track?.artistId] : ['/search']" (click)="$event.stopPropagation()"
                   class="text-white/60 mt-1.5 inline-block hover:text-yam-orange transition">{{ top.track?.sourceArtist || top.track?.artistName }}</a>
                <p class="yam-num text-yam-orange text-2xl mt-4">{{ formatNumber(top.plays) }} <span class="text-white/40 text-xs">écoutes cette semaine</span></p>
                <div class="flex flex-wrap gap-2 mt-4">
                  @if (top.track?.genre) { <span class="yam-badge">{{ top.track?.genre }}</span> }
                  @if (top.track?.country) { <span class="yam-badge">{{ countryFlag(top.track?.country || '') }} {{ top.track?.country }}</span> }
                </div>
              </div>
            </div>
          }

          <!-- ===== POSITIONS SUIVANTES (compactes) ===== -->
          <div class="yam-card !rounded-3xl p-3 sm:p-5" yamReveal>
            @for (e of rest(); track e.trackId) {
              <yam-chart-track [entry]="e" (play)="playChartTrack($event)"/>
            }
          </div>

        } @else {
          <!-- Etat vide -->
          <div class="yam-card p-10 text-center max-w-lg mx-auto" yamReveal>
            <div class="text-white/20 mb-4 flex justify-center"><yam-icon name="bar-chart" [size]="44"/></div>
            <h2 class="text-xl font-bold mb-2">Pas encore d'écoutes comptabilisées cette semaine</h2>
            <p class="text-white/50 text-sm mb-6">
              Reviens plus tard ou lance la lecture : chaque écoute compte pour le prochain classement.
            </p>
            <a routerLink="/" class="yam-btn-secondary inline-flex items-center gap-2">
              <yam-icon name="headphones" [size]="16"/> Explorer la musique
            </a>
          </div>
        }
      }
    </div>
  `
})
export class ChartsComponent implements OnInit {
  private chartsService = inject(ChartsService);
  private player = inject(PlayerService);
  private seo = inject(SeoService);

  entries = signal<ChartEntry[]>([]);
  countries = signal<string[]>([]);
  selectedCountry = signal('all');
  loading = signal(true);
  weekLabel = signal('');

  rest = computed<ChartEntry[]>(() => this.entries().slice(1, 20));
  chartTracks = computed<Track[]>(() =>
    this.entries().filter(e => !!e.track).map(e => e.track as Track)
  );

  ngOnInit(): void {
    this.seo.page(
      'YAM CHARTS — le classement des sons d\'Afrique de l\'Ouest cette semaine | YAM DJ',
      'Le classement des pistes les plus écoutées de la semaine sur YAM DJ : Afrobeats, Coupé-Décalé, Rap et plus, pays par pays.',
      'https://yam-dj-frontend.vercel.app/charts');
    this.chartsService.ensureTop10Loaded();
    this.chartsService.getChartCountries().subscribe({
      next: list => this.countries.set(list || []),
      error: () => this.countries.set([])
    });
    this.load('all');
  }

  load(country: string): void {
    this.selectedCountry.set(country);
    this.loading.set(true);
    this.chartsService.getCharts(country, 20).subscribe({
      next: list => {
        this.entries.set(list || []);
        this.weekLabel.set(this.formatWeekStart(list && list.length ? list[0].weekStart : null));
        this.loading.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.weekLabel.set('');
        this.loading.set(false);
      }
    });
  }

  playAll(): void {
    const tracks = this.chartTracks();
    if (tracks.length) this.player.play(tracks[0], tracks);
  }

  playEntry(entry: ChartEntry): void {
    if (!entry.track) return;
    this.player.play(entry.track, this.chartTracks());
  }

  playChartTrack(track: Track): void {
    this.player.play(track, this.chartTracks());
  }

  formatWeekStart(weekStart: string | null): string {
    if (!weekStart) return '';
    try {
      const d = new Date(weekStart);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    } catch {
      return '';
    }
  }

  formatNumber(n: number): string {
    try { return n.toLocaleString('fr-FR'); } catch { return String(n); }
  }

  countryFlag(c: string): string {
    const s = (c || '').toLowerCase();
    if (s.includes('burkina')) return '🇧🇫';
    if (s.includes('ivoire')) return '🇨🇮';
    if (s.includes('mali')) return '🇲🇱';
    if (s.includes('senegal')) return '🇸🇳';
    if (s.includes('guinee') || s.includes('guinea')) return '🇬🇳';
    if (s.includes('benin')) return '🇧🇯';
    if (s.includes('togo')) return '🇹🇬';
    if (s.includes('niger')) return '🇳🇪';
    if (s.includes('ghana')) return '🇬🇭';
    if (s.includes('nigeria')) return '🇳🇬';
    if (s.includes('gambie') || s.includes('gambia')) return '🇬🇲';
    if (s.includes('sierra')) return '🇸🇱';
    if (s.includes('liberia')) return '🇱🇷';
    if (s.includes('mauritanie') || s.includes('mauritania')) return '🇲🇷';
    if (s.includes('cap-vert') || s.includes('verde')) return '🇨🇻';
    return '🌍';
  }
}
