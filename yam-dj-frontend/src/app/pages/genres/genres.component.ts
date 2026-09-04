import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../../components/icon/icon.component';
import { PlayerService } from '../../services/player.service';
import { RevealDirective } from '../../directives/reveal.directive';

/**
 * PAGE GENRES V2 (§09) — TERRITOIRES MUSICAUX, pas une collection de cartes.
 * Chaque genre est un endroit : nom en Syne, itineraire de villes (la route
 * du son), nombre de pistes reel (API publique /api/genres), radio infinie.
 */

interface GenreRow { genre: string; count: number; }

interface GenreMeta {
  desc: string;
  icon: string;
  from: string;
  to: string;
  route: string[];
}

const GENRE_META: Record<string, GenreMeta> = {
  'Afrobeats': { desc: 'Le son qui bouge — percussions chaudes et melodies qui restent en tete.', icon: 'flame', from: '#FF8A24', to: '#F4C95D', route: ['Lagos', 'Accra', 'Ouaga'] },
  'Coupe-Decale': { desc: 'Rythme festif, pas de danse et energie de soiree.', icon: 'discoball', from: '#F4A300', to: '#FF8A24', route: ['Abidjan'] },
  'Rap': { desc: 'Punchlines en francais, bambara, dioula et lingala.', icon: 'mic', from: '#7C5CFF', to: '#FF8A24', route: ['Dakar', 'Abidjan', 'Ouaga'] },
  'Zouglou': { desc: 'L\'humour et la critique sociale sur un rythme qui bouge.', icon: 'music-note', from: '#FF8A24', to: '#F4C95D', route: ['Abidjan', 'Yamoussoukro'] },
  'Ndombolo': { desc: 'La danse des hanches venue de Kinshasa — soukous et sebene endiables.', icon: 'disc', from: '#EF4444', to: '#F4A300', route: ['Kinshasa', 'Ouaga'] },
  'Reggae': { desc: 'Conscious et racines : messages droits sur des basses profondes.', icon: 'radio', from: '#10B981', to: '#F4C95D', route: ['Abidjan', 'Bobo-Dioulasso'] },
  'Dancehall': { desc: 'Riddims jamaicains sauces ouest-africaines — l\'energie des dancefloors.', icon: 'waves', from: '#FF8A24', to: '#F4A300', route: ['Kingston', 'Accra'] },
  'Traditionnel': { desc: 'Djembes, balafons et kora : les racines du village a la ville.', icon: 'globe', from: '#F4C95D', to: '#10B981', route: ['Sahel', 'Volta'] },
  'Gospel': { desc: 'Louange et gratitude — choeurs puissants du Burkina au Ghana.', icon: 'sparkles', from: '#F4C95D', to: '#FF8A24', route: ['Ouaga', 'Accra'] },
  'R&B': { desc: 'Slow et emotions : les voix soyeuses de la nouvelle generation.', icon: 'heart', from: '#EC4899', to: '#FF8A24', route: ['Lagos', 'Abidjan'] },
  'Pop': { desc: 'Les melodies qui traversent les frontieres, en francais et langues locales.', icon: 'music-4', from: '#FF8A24', to: '#EC4899', route: ['Dakar', 'Lagos'] },
  'Amapiano': { desc: 'Log drum et piano hypnotique : la vague d\'Afrique du Sud adoptee a Ouaga.', icon: 'sliders', from: '#7C5CFF', to: '#10B981', route: ['Johannesburg', 'Ouaga'] },
  'Mbalax': { desc: 'Le rythme national du Senegal — percussions sabar et griots modernes.', icon: 'activity', from: '#F4A300', to: '#10B981', route: ['Dakar'] },
  'Rumba': { desc: 'Guitares douces et heritage — de Kinshasa a Ouaga.', icon: 'disc', from: '#EF4444', to: '#F4C95D', route: ['Kinshasa', 'Bamako'] },
  'Zouk': { desc: 'Le groove des Antilles adopte par la cote ouest-africaine.', icon: 'waves', from: '#EC4899', to: '#FF8A24', route: ['Abidjan', 'Dakar'] },
  'Afro-Pop': { desc: 'Pop moderne aux couleurs africaines : refrains qui collent.', icon: 'music-note', from: '#FF8A24', to: '#EC4899', route: ['Accra', 'Lagos'] },
  'Afro-Rock': { desc: 'Guitares electriques rencontrent djembe — l\'energie du Sahel.', icon: 'disc', from: '#7C5CFF', to: '#FF8A24', route: ['Ouaga', 'Bamako'] },
};

@Component({
  selector: 'yam-genres-page',
  standalone: true,
  imports: [RouterLink, IconComponent, RevealDirective],
  template: `
    <div class="max-w-editorial mx-auto px-4 pt-6 pb-12">

      <!-- En-tete editorial -->
      <header class="mb-8">
        <p class="yam-kicker mb-2">Cartographie sonore</p>
        <h1 class="yam-display text-3xl sm:text-5xl mb-3 break-words">TERRITOIRES<br>MUSICAUX</h1>
        <p class="text-white/50 max-w-2xl leading-relaxed">
          De l'Afrobeats au traditionnel, chaque genre est une route a parcourir —
          villes, sonorites et pistes a ecouter maintenant.
        </p>
      </header>

      <!-- Grille des territoires -->
      <div class="grid sm:grid-cols-2 gap-4">
        @for (g of rows(); track g.genre) {
          <article class="yam-card !rounded-3xl p-6 flex flex-col relative overflow-hidden group" yamReveal>
            <div class="absolute inset-0 opacity-[0.08] pointer-events-none"
                 [style.background]="'linear-gradient(135deg, ' + meta(g.genre).from + ', ' + meta(g.genre).to + ')'"></div>

            <div class="flex items-start justify-between gap-3 mb-4 relative">
              <div>
                <h2 class="font-display font-bold text-2xl leading-none group-hover:text-yam-orange transition">{{ g.genre }}</h2>
                <!-- La route du son -->
                <p class="text-white/40 text-xs yam-num mt-2 flex items-center gap-1.5 flex-wrap">
                  @for (city of meta(g.genre).route; track city; let last = $last) {
                    <span class="uppercase tracking-wide">{{ city }}</span>
                    @if (!last) { <yam-icon name="arrow-right" [size]="10" class="text-yam-orange/60"/> }
                  }
                </p>
              </div>
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg"
                   [style.background]="'linear-gradient(135deg, ' + meta(g.genre).from + ', ' + meta(g.genre).to + ')'">
                <yam-icon [name]="meta(g.genre).icon" [size]="22"/>
              </div>
            </div>

            <p class="text-white/55 text-sm leading-relaxed mb-5 flex-1 relative">{{ meta(g.genre).desc }}</p>

            <div class="flex items-center gap-2 relative flex-wrap">
              <button (click)="playRadio(g.genre)"
                      class="yam-btn-primary !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
                <yam-icon name="play" [size]="15" class="fill-current"/>
                Radio {{ g.genre }}
              </button>
              <a [routerLink]="['/search']" [queryParams]="{ genre: g.genre }"
                 class="yam-btn-secondary !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
                <yam-icon name="search" [size]="15"/>
                {{ g.count }} piste{{ g.count > 1 ? 's' : '' }}
              </a>
            </div>
          </article>
        }
      </div>

      @if (loaded() && rows().length === 0) {
        <div class="yam-card p-10 text-center" yamReveal>
          <div class="text-white/20 mb-3 flex justify-center"><yam-icon name="music-4" [size]="40"/></div>
          <p class="text-white/50">Aucun genre disponible pour l'instant — les premiers morceaux arrivent.</p>
        </div>
      }

      <!-- Bandeau radio generale -->
      <div class="mt-10 rounded-3xl border border-yam-orange/25 bg-yam-orange/8 p-6 md:p-8 flex items-center justify-between gap-4 flex-wrap" yamReveal>
        <div>
          <p class="yam-kicker mb-1.5">Envie de surprise ?</p>
          <p class="yam-display text-xl md:text-2xl">TOUT YAM DJ, SANS FIN.</p>
          <p class="text-white/50 text-sm mt-1">La radio enchaine tout le catalogue, sans coupure — parfaite avec le Data-Lite.</p>
        </div>
        <button (click)="playRadio()"
                class="yam-btn-primary !px-7 !py-3 text-sm inline-flex items-center gap-2">
          <yam-icon name="radio" [size]="17"/>
          Lancer YAM Radio
        </button>
      </div>
    </div>
  `
})
export class GenresComponent {
  private http = inject(HttpClient);
  private player = inject(PlayerService);
  private seo = inject(SeoService);

  rows = signal<GenreRow[]>([]);
  loaded = signal(false);

  constructor() {
    this.seo.page(
      'Territoires musicaux d\'Afrique de l\'Ouest — Afrobeats, Coupé-Décalé, Amapiano, Rap | YAM DJ',
      'Explore les genres du catalogue YAM DJ comme des territoires : Afrobeats (Lagos-Accra-Ouaga), Coupé-Décalé (Abidjan), Amapiano, Rap ouest-africain — avec une radio infinie par genre.',
      'https://yam-dj-frontend.vercel.app/genres');
    this.http.get<GenreRow[]>(`${environment.apiUrl}/api/genres`).subscribe({
      next: list => {
        this.rows.set(list || []);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true)
    });
  }

  meta(genre: string): GenreMeta {
    return GENRE_META[genre] || {
      desc: 'Le son ' + genre + ' sur YAM DJ — decouvre les pistes du catalogue.',
      icon: 'music-note', from: '#FF8A24', to: '#F4C95D', route: ['Afrique de l\'Ouest']
    };
  }

  /** Demarre YAM Radio (file infinie par genre). */
  playRadio(genre?: string): void {
    this.player.startRadio(genre);
  }
}
