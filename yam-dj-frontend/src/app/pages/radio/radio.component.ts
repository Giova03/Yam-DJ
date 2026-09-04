import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../../components/icon/icon.component';
import { PlayerService } from '../../services/player.service';
import { RevealDirective } from '../../directives/reveal.directive';

interface GenreRow { genre: string; count: number; }

interface RadioTile {
  label: string;
  icon: string;
  hint: string;
  genre?: string;
  country?: string;
  big?: boolean;
  color?: string;
}

/**
 * PAGE YAM RADIO (§06-6 / §11) — un univers, "Choisis ton ambiance."
 * Entrees visuelles par VILLES, GENRES (reels du catalogue) et MOODS.
 * Chaque tuile lance la radio infinie (service existant).
 */
@Component({
  selector: 'yam-radio-page',
  standalone: true,
  imports: [RouterLink, IconComponent, RevealDirective],
  template: `
    <div class="max-w-editorial mx-auto px-4 pt-6 pb-12">

      <header class="mb-8">
        <p class="yam-kicker mb-2">Ambiances</p>
        <h1 class="yam-display text-3xl sm:text-5xl mb-3">YAM RADIO</h1>
        <p class="text-white/50 max-w-xl text-lg">Choisis ton ambiance — YAM DJ enchaine les sons sans fin, sans coupure.</p>
      </header>

      <!-- Radio en cours -->
      @if (player.radioMode(); as radio) {
        <div class="yam-card p-4 mb-8 border-yam-orange/40 bg-yam-orange/5 flex items-center justify-between gap-3">
          <p class="text-sm text-yam-orange font-semibold flex items-center gap-2 min-w-0">
            <yam-icon name="radio" [size]="15" class="shrink-0"/>
            <span class="truncate">En cours : radio {{ radio.genre || radio.country || 'Decouverte' }} — {{ player.queue().length }} pistes en file</span>
          </p>
          <button (click)="player.stopRadio()" class="text-xs text-white/50 hover:text-white underline shrink-0">Stop</button>
        </div>
      }

      <!-- ===== VILLES ===== -->
      <section class="mb-10" yamReveal>
        <p class="yam-kicker mb-4">Par ville</p>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          @for (r of cities(); track r.label) {
            <button (click)="startRadio(r)"
                    class="relative yam-card !rounded-2xl p-6 text-left overflow-hidden group h-full min-h-[128px] flex flex-col justify-between">
              <div class="absolute inset-0 opacity-[0.10] pointer-events-none"
                   [style.background]="'linear-gradient(135deg,' + (r.color || '#FF8A24') + ', transparent)'"></div>
              <div class="flex items-center justify-between relative">
                <yam-icon name="map-pin" [size]="18" class="text-white/35"/>
                <span class="w-9 h-9 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                  <yam-icon name="play" [size]="15" class="fill-current"/>
                </span>
              </div>
              <div class="relative">
                <p class="font-display font-bold text-2xl group-hover:text-yam-orange transition">{{ r.label }}</p>
                <p class="text-white/40 text-xs mt-1">{{ r.hint }}</p>
              </div>
            </button>
          }
        </div>
      </section>

      <!-- ===== GENRES ===== -->
      <section class="mb-10" yamReveal>
        <p class="yam-kicker mb-4">Par genre</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          @for (r of genreTiles(); track r.label) {
            <button (click)="startRadio(r)"
                    class="yam-card !rounded-2xl p-4 text-left group flex items-center gap-3 hover:border-yam-orange/40 transition">
              <span class="w-10 h-10 rounded-xl bg-yam-orange/12 text-yam-orange flex items-center justify-center shrink-0">
                <yam-icon name="music-4" [size]="17"/>
              </span>
              <span class="min-w-0 flex-1">
                <span class="font-semibold text-sm block truncate group-hover:text-yam-orange transition">{{ r.label }}</span>
                <span class="text-white/35 text-xs yam-num">{{ r.hint }}</span>
              </span>
              <yam-icon name="play" [size]="13" class="fill-current text-white/20 group-hover:text-yam-orange transition shrink-0"/>
            </button>
          }
        </div>
      </section>

      <!-- ===== MOODS ===== -->
      <section class="mb-10" yamReveal>
        <p class="yam-kicker mb-4">Par ambiance</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          @for (r of moods(); track r.label) {
            <button (click)="startRadio(r)"
                    class="relative yam-card !rounded-2xl p-5 text-left overflow-hidden group h-full min-h-[96px] flex flex-col justify-between">
              <div class="absolute inset-0 opacity-[0.09] pointer-events-none"
                   [style.background]="'linear-gradient(135deg,' + (r.color || '#FF8A24') + ', transparent)'"></div>
              <yam-icon [name]="r.icon" [size]="19" class="text-yam-orange relative"/>
              <div class="relative">
                <p class="font-display font-bold text-lg group-hover:text-yam-orange transition">{{ r.label }}</p>
                <p class="text-white/40 text-xs mt-0.5">{{ r.hint }}</p>
              </div>
            </button>
          }
        </div>
      </section>

      <!-- Data-Lite : ecouter longtemps, consommer peu -->
      <section class="rounded-2xl border border-yam-gold/25 bg-yam-gold/5 px-5 py-4 flex items-center gap-4 flex-wrap" yamReveal>
        <span class="w-11 h-11 rounded-2xl bg-yam-gold/15 text-yam-gold flex items-center justify-center shrink-0"><yam-icon name="smartphone" [size]="22"/></span>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-sm">Radio + Data-Lite = ta journée de musique</p>
          <p class="text-white/50 text-sm">48 kbps : environ 21 Mo par heure — pensé pour les forfaits modestes.</p>
        </div>
        <button (click)="player.toggleDataLite()" class="shrink-0 text-sm font-semibold px-4 py-2 rounded-full border transition"
                [class]="player.dataLite() ? 'bg-yam-gold text-yam-ink border-yam-gold' : 'text-yam-gold border-yam-gold/40 hover:bg-yam-gold/10'">
          {{ player.dataLite() ? 'Actif · 48 kbps' : 'Activer' }}
        </button>
      </section>
    </div>
  `
})
export class RadioComponent {
  private http = inject(HttpClient);
  private seo = inject(SeoService);
  player = inject(PlayerService);

  cities = signal<RadioTile[]>([
    { label: 'OUAGA', icon: 'map-pin', hint: 'Les sons du Faso', country: 'Burkina Faso', color: '#FF8A24' },
    { label: 'ABIDJAN', icon: 'map-pin', hint: 'Le groove ivoirien', country: 'Cote d\'Ivoire', color: '#F4C95D' },
    { label: 'DAKAR', icon: 'map-pin', hint: 'Le rythme du Senegal', country: 'Senegal', color: '#7C5CFF' },
    { label: 'LAGOS', icon: 'map-pin', hint: 'La capitale du son', country: 'Nigeria', color: '#FF8A24' }
  ]);

  genreTiles = signal<RadioTile[]>([]);

  moods = signal<RadioTile[]>([
    { label: 'CHILL', icon: 'waves', hint: 'Douceur et detente', genre: 'R&B' },
    { label: 'FÊTE', icon: 'discoball', hint: 'Energie de soiree', genre: 'Coupe-Decale' },
    { label: 'FLOW', icon: 'mic', hint: 'Rimes ouest-africaines', genre: 'Rap' },
    { label: 'DANSE', icon: 'flame', hint: 'Le son qui bouge', genre: 'Afrobeats' },
    { label: 'RACINES', icon: 'globe', hint: 'Traditions et kora', genre: 'Traditionnel' }
  ]);

  constructor() {
    this.seo.page(
      'YAM Radio — la radio infinie de l\'Afrique de l\'Ouest, par ville, genre et ambiance | YAM DJ',
      'Choisis ton ambiance : radio Ouaga, Abidjan, Dakar, Lagos, Afrobeats, Amapiano, Rap... YAM DJ enchaine les sons sans fin — avec le mode Data-Lite 48 kbps.',
      'https://yam-dj-frontend.vercel.app/radio');
    this.http.get<GenreRow[]>(`${environment.apiUrl}/api/genres`).subscribe(g => {
      const tiles = (g || []).map(row => ({
        label: row.genre,
        icon: 'music-4',
        hint: row.count + ' piste' + (row.count > 1 ? 's' : ''),
        genre: row.genre
      }));
      this.genreTiles.set(tiles);
    });
  }

  startRadio(r: RadioTile): void {
    this.player.startRadio(r.genre, r.country);
  }
}
