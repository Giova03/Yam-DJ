import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { ChartsService } from '../../services/charts.service';
import { PlayerService } from '../../services/player.service';
import { ChartEntry, Track } from '../../models/models';

/**
 * CHARTS HEBDOMADAIRES — top des pistes les plus ecoutees de la semaine.
 * Onglets par pays (ou Afrique de l'Ouest = tous pays confondus),
 * podium Top 3 avec medailles + classement detaille 4..20.
 * ensureTop10Loaded() alimente le signal partage pour les badges "Top 10"
 * sur les cartes de pistes (integration CTO).
 */
@Component({
  selector: 'yam-charts-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-12">

      <!-- En-tete -->
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 class="yam-title mb-1">📊 Charts de la semaine</h1>
          @if (weekLabel()) {
            <p class="text-white/50 text-sm">Semaine du {{ weekLabel() }}</p>
          }
        </div>
        @if (chartTracks().length) {
          <button (click)="playAll()" class="yam-btn-primary">▶ Tout ecouter</button>
        }
      </div>

      <!-- Onglets pays -->
      <div class="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Filtrer le chart par pays">
        <button (click)="load('all')" [class]="tabClass('all')" role="tab"
                [attr.aria-selected]="selectedCountry() === 'all'">🌍 Afrique de l'Ouest</button>
        @for (c of countries(); track c) {
          <button (click)="load(c)" [class]="tabClass(c)" role="tab"
                  [attr.aria-selected]="selectedCountry() === c">{{ countryFlag(c) }} {{ c }}</button>
        }
      </div>

      @if (loading()) {
        <!-- Skeletons -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" aria-hidden="true">
          @for (s of [1, 2, 3]; track s) {
            <div class="yam-card p-6 animate-pulse">
              <div class="w-24 h-24 rounded-xl bg-white/10 mx-auto mb-4"></div>
              <div class="h-4 bg-white/10 rounded w-3/4 mx-auto mb-2"></div>
              <div class="h-3 bg-white/10 rounded w-1/2 mx-auto"></div>
            </div>
          }
        </div>
        <div class="space-y-2">
          @for (s of [4, 5, 6, 7, 8]; track s) {
            <div class="yam-card p-3 animate-pulse flex items-center gap-3">
              <div class="w-8 h-4 bg-white/10 rounded"></div>
              <div class="w-12 h-12 rounded-full bg-white/10 shrink-0"></div>
              <div class="h-4 bg-white/10 rounded w-1/2 flex-1"></div>
            </div>
          }
        </div>
      } @else {
        @if (entries().length) {

          <!-- Podium Top 3 -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            @for (e of podium(); track e.rank) {
              <div [class]="podiumCardClass(e.rank)">
                <div class="text-3xl mb-2" aria-hidden="true">{{ medal(e.rank) }}</div>
                @if (e.track?.coverUrl) {
                  <img [src]="e.track?.coverUrl" [alt]="'Pochette de ' + (e.track?.title || '')" [class]="coverClass(e.rank)">
                } @else {
                  <div [class]="coverFallbackClass(e.rank)" aria-hidden="true">🎵</div>
                }
                <a [routerLink]="['/track', e.trackId]" class="block font-bold truncate hover:text-yam-orange hover:underline mb-1">
                  {{ e.track?.title || 'Titre indisponible' }}
                </a>
                <p class="text-white/50 text-sm truncate mb-2">{{ e.track?.artistName || 'Artiste inconnu' }}</p>
                <p class="text-xs text-yam-gold">🔥 {{ formatNumber(e.plays) }} ecoutes cette semaine</p>
              </div>
            }
          </div>

          <!-- Classement 4..20 -->
          @if (rest().length) {
            <h2 class="text-lg font-bold mb-3 text-white/70">Classement complet</h2>
            <div class="space-y-2">
              @for (e of rest(); track e.rank) {
                <div class="yam-card p-3 flex items-center gap-3">
                  <span class="w-8 text-center font-extrabold text-yam-orange shrink-0">{{ e.rank }}</span>
                  @if (e.track?.coverUrl) {
                    <img [src]="e.track?.coverUrl" [alt]="'Pochette de ' + (e.track?.title || '')"
                         class="w-12 h-12 rounded-full object-cover shrink-0">
                  } @else {
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center shrink-0" aria-hidden="true">🎵</div>
                  }
                  <div class="min-w-0 flex-1">
                    <a [routerLink]="['/track', e.trackId]" class="font-medium truncate block hover:text-yam-orange">
                      {{ e.track?.title || 'Titre indisponible' }}
                    </a>
                    <p class="text-white/40 text-xs truncate">{{ e.track?.artistName || 'Artiste inconnu' }}</p>
                  </div>
                  <span class="text-xs text-white/40 hidden sm:block shrink-0">{{ formatNumber(e.plays) }} ecoutes</span>
                  @if (e.track) {
                    <button (click)="playEntry(e)"
                            class="w-9 h-9 rounded-full bg-white/10 hover:bg-yam-orange flex items-center justify-center shrink-0 transition"
                            [attr.aria-label]="'Ecouter ' + (e.track?.title || '')">▶</button>
                  }
                </div>
              }
            </div>
          }
        } @else {
          <!-- Etat vide -->
          <div class="yam-card p-10 text-center max-w-lg mx-auto">
            <div class="text-5xl mb-4" aria-hidden="true">📈</div>
            <h2 class="text-xl font-bold mb-2">Pas encore d'ecoutes comptabilisees cette semaine</h2>
            <p class="text-white/50 text-sm mb-6">
              Reviens plus tard ou lance la lecture : chaque ecoute compte pour le prochain classement.
            </p>
            <a routerLink="/" class="yam-btn-secondary">🎧 Explorer la musique</a>
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
  selectedCountry = signal('all'); // 'all' = Afrique de l'Ouest
  loading = signal(true);
  weekLabel = signal('');

  podium = computed<ChartEntry[]>(() => this.entries().slice(0, 3));
  rest = computed<ChartEntry[]>(() => this.entries().slice(3, 20));
  chartTracks = computed<Track[]>(() =>
    this.entries().filter(e => !!e.track).map(e => e.track as Track)
  );

  ngOnInit(): void {
    this.seo.page(
      'Charts hebdomadaires — le top des sons d\'Afrique de l\'Ouest | YAM DJ',
      'Le classement des pistes les plus écoutées de la semaine sur YAM DJ : Afrobeats, Coupé-Décalé, Rap et plus, pays par pays.',
      'https://yam-dj-frontend.vercel.app/charts');
    // Charge le top 10 global (signal partage) pour les badges "Top 10" sur les cartes de pistes
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

  /** "Tout ecouter" : file d'attente = chart complet. */
  playAll(): void {
    const tracks = this.chartTracks();
    if (tracks.length) this.player.play(tracks[0], tracks);
  }

  playEntry(entry: ChartEntry): void {
    if (!entry.track) return;
    this.player.play(entry.track, this.chartTracks());
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

  medal(rank: number): string {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
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

  tabClass(c: string): string {
    const active = this.selectedCountry() === c;
    const base = 'yam-badge cursor-pointer px-4 py-1.5 text-sm transition ';
    return base + (active ? 'bg-yam-orange text-white' : 'text-white/60 hover:bg-white/20');
  }

  podiumCardClass(rank: number): string {
    const base = 'yam-card p-5 text-center ';
    return base + (rank === 1 ? 'border-yam-gold/40 bg-yam-gold/5 sm:p-7 sm:scale-105' : '');
  }

  coverClass(rank: number): string {
    const base = 'mx-auto rounded-xl object-cover border border-white/10 mb-3 ';
    return base + (rank === 1 ? 'w-28 h-28 sm:w-36 sm:h-36' : 'w-24 h-24 sm:w-28 sm:h-28');
  }

  coverFallbackClass(rank: number): string {
    const base = 'mx-auto rounded-xl bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center text-3xl mb-3 border border-white/5 ';
    return base + (rank === 1 ? 'w-28 h-28 sm:w-36 sm:h-36' : 'w-24 h-24 sm:w-28 sm:h-28');
  }
}
