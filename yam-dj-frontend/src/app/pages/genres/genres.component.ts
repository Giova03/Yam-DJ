import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../../components/icon/icon.component';
import { PlayerService } from '../../services/player.service';

/**
 * PAGE GENRES — decouverte des sons d'Afrique de l'Ouest.
 * Cartes par genre avec nombre REEL de pistes (API publique /api/genres),
 * description courte, lien vers la recherche filtree et bouton Radio
 * (YAM Radio infinie par genre, service existant). Public + SEO.
 */

interface GenreRow { genre: string; count: number; }

interface GenreMeta {
  desc: string;
  icon: string;
  from: string;
  to: string;
}

const GENRE_META: Record<string, GenreMeta> = {
  'Afrobeats': { desc: 'Le son qui bouge de Lagos a Ouaga — percussions chaudes et melodies qui restent en tete.', icon: 'flame', from: '#FF6B35', to: '#FFD166' },
  'Coupe-Decale': { desc: 'Abidjan vibes : rythme festif, pas de danse et energie de soiree.', icon: 'discoball', from: '#F4A300', to: '#FF6B35' },
  'Rap': { desc: 'Le rap ouest-africain : punchlines en francais, bambara, dioula et lingala.', icon: 'mic', from: '#8B5CF6', to: '#FF6B35' },
  'Zouglou': { desc: 'L\'humour et la critique sociale d\'Abidjan sur un rythme qui bouge.', icon: 'music-note', from: '#FF6B35', to: '#FFD166' },
  'Ndombolo': { desc: 'La danse des hanches venue de Kinshasa — soukous et sebene endiables.', icon: 'disc', from: '#EF4444', to: '#F4A300' },
  'Reggae': { desc: 'Conscious et racines : messages droits sur des basses profondes.', icon: 'radio', from: '#10B981', to: '#FFD166' },
  'Dancehall': { desc: 'Riddims jamaicains sauces ouest-africaines — l\'energie des dancefloors.', icon: 'waves', from: '#FF6B35', to: '#F4A300' },
  'Traditionnel': { desc: 'Djembes, balafons et kora : les racines du village a la ville.', icon: 'globe', from: '#FFD166', to: '#10B981' },
  'Gospel': { desc: 'Louange et gratitude — choeurs puissants du Burkina au Ghana.', icon: 'sparkles', from: '#FFD166', to: '#FF6B35' },
  'R&B': { desc: 'Slow et emotions : les voix soyeuses de la nouvelle generation.', icon: 'heart', from: '#EC4899', to: '#FF6B35' },
  'Pop': { desc: 'Les melodies qui traversent les frontieres, chantees en francais et langues locales.', icon: 'music-4', from: '#FF6B35', to: '#EC4899' },
  'Amapiano': { desc: 'Piano log drum : la vague venue d\'Afrique du Sud adoptee a Ouaga.', icon: 'sliders', from: '#8B5CF6', to: '#10B981' },
  'Mbalax': { desc: 'Le rythme national du Senegal — percussions sabar et griots modernes.', icon: 'activity', from: '#F4A300', to: '#10B981' },
  'Rumba': { desc: 'La rumba congolaise et ses guitares douces — l\'heritage de Kinshasa a Ouaga.', icon: 'disc', from: '#EF4444', to: '#FFD166' },
  'Zouk': { desc: 'Le groove des Antilles adopte par la cote ouest-africaine — sensualite et cadence.', icon: 'waves', from: '#EC4899', to: '#FF6B35' },
  'Afro-Pop': { desc: 'Pop moderne aux couleurs africaines : refrains qui collent et productions soignees.', icon: 'music-note', from: '#FF6B35', to: '#EC4899' },
  'Afro-Rock': { desc: 'Guitares electriques rencontre djembe — l\'energie rock sauce Sahel.', icon: 'disc', from: '#8B5CF6', to: '#FF6B35' },
};

@Component({
  selector: 'yam-genres-page',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-12">

      <!-- En-tete -->
      <div class="flex items-center gap-3 mb-2">
        <div class="w-12 h-12 rounded-2xl bg-yam-orange/15 flex items-center justify-center text-yam-orange">
          <yam-icon name="music-4" [size]="26" />
        </div>
        <div>
          <h1 class="yam-title !mb-0">Les genres d'Afrique de l'Ouest</h1>
          <p class="text-white/40 text-xs mt-0.5">Le catalogue YAM DJ, son par son</p>
        </div>
      </div>
      <p class="text-white/50 text-sm max-w-2xl mb-8">
        De l'Afrobeats au traditionnel, explore les sons qui font vibrer la region.
        Chaque genre ouvre sa radio infinie et ses pistes a ecouter maintenant.
      </p>

      <!-- Grille des genres -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        @for (g of rows(); track g.genre) {
          <article class="yam-card p-5 flex flex-col relative overflow-hidden group">
            <div class="absolute inset-0 opacity-[0.07] pointer-events-none"
                 [style.background]="'linear-gradient(135deg, ' + meta(g.genre).from + ', ' + meta(g.genre).to + ')'"></div>
            <div class="flex items-center gap-3 mb-3 relative">
              <div class="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                   [style.background]="'linear-gradient(135deg, ' + meta(g.genre).from + ', ' + meta(g.genre).to + ')'">
                <yam-icon [name]="meta(g.genre).icon" [size]="22" />
              </div>
              <div class="min-w-0">
                <h2 class="font-bold text-lg leading-tight truncate">{{ g.genre }}</h2>
                <p class="text-white/40 text-xs">{{ g.count }} piste{{ g.count > 1 ? 's' : '' }}</p>
              </div>
            </div>
            <p class="text-white/50 text-sm leading-relaxed mb-4 flex-1 relative">{{ meta(g.genre).desc }}</p>
            <div class="flex items-center gap-2 relative">
              <button (click)="playRadio(g.genre)"
                      class="yam-btn-primary text-sm !px-4 !py-2 flex items-center gap-2">
                <yam-icon name="play" [size]="16" />
                Radio
              </button>
              <a [routerLink]="['/search']" [queryParams]="{ genre: g.genre }"
                 class="yam-btn-secondary text-sm !px-4 !py-2 flex items-center gap-2">
                <yam-icon name="search" [size]="16" />
                Explorer
              </a>
            </div>
          </article>
        }
      </div>

      @if (loaded() && rows().length === 0) {
        <div class="yam-card p-10 text-center">
          <div class="text-white/20 mb-3 flex justify-center"><yam-icon name="music-4" [size]="40" /></div>
          <p class="text-white/50">Aucun genre disponible pour l'instant — les premiers morceaux arrivent.</p>
        </div>
      }

      <!-- Bandeau radio generale -->
      <div class="mt-10 rounded-3xl bg-gradient-to-r from-yam-orange via-yam-gold to-yam-orange p-6 md:p-8 flex items-center justify-between gap-4 flex-wrap">
        <div class="text-yam-dark">
          <p class="font-display font-extrabold text-xl md:text-2xl">Envie de surprise ?</p>
          <p class="text-yam-dark/70 text-sm mt-1">YAM Radio enchaine tout le catalogue, sans fin et sans coupure.</p>
        </div>
        <button (click)="playRadio()"
                class="yam-btn-primary !bg-yam-dark !text-white hover:!bg-black text-sm flex items-center gap-2">
          <yam-icon name="radio" [size]="18" />
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
      'Genres musicaux d\'Afrique de l\'Ouest — Afrobeats, Coupé-Décalé, Rap, Zouglou | YAM DJ',
      'Explore tous les genres du catalogue YAM DJ : Afrobeats, Coupé-Décalé, Rap, Zouglou, Ndombolo, Gospel, Traditionnel — avec une radio infinie par genre.',
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
      icon: 'music-note', from: '#FF6B35', to: '#FFD166'
    };
  }

  /** Demarre YAM Radio (service existant : file infinie par genre). */
  playRadio(genre?: string): void {
    this.player.startRadio(genre);
  }
}
