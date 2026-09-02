import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { YoutubeService } from '../../services/youtube.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { Track, YoutubeVideo } from '../../models/models';
import { firstValueFrom } from 'rxjs';

/**
 * PAGE YOUTUBE — acces direct au catalogue mondial :
 *  1. Recherche YouTube en direct (via backend, sans cle API)
 *  2. "Ecouter" importe la video sur YAM DJ puis la joue dans le
 *     player integre — elle reste dans la file d'actualite
 *  3. Hymnes nationaux + musiques libres d'acces en exclusivite
 */
@Component({
  selector: 'yam-youtube-page',
  standalone: true,
  imports: [RouterLink, TrackCardComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 py-8">

      <!-- En-tete -->
      <div class="flex items-center gap-3 mb-2">
        <span class="w-11 h-11 rounded-2xl bg-red-600 flex items-center justify-center text-white text-xl font-black shrink-0">▶</span>
        <div>
          <h1 class="yam-title">YouTube sur YAM DJ</h1>
          <p class="text-white/50 text-sm mt-0.5">
            Cherche des musiques sur YouTube, ecoute-les dans la plateforme et importe tes coups de coeur — ils apparaissent dans la file d'actualite.
          </p>
        </div>
      </div>

      <!-- Recherche -->
      <form class="mt-6 flex gap-3" (submit)="doSearch($event)">
        <input type="search" [value]="query()" (input)="onQuery($event)"
               placeholder="Artiste, titre, hymne national..."
               class="yam-input flex-1" autocomplete="off">
        <button type="submit" class="yam-btn-primary shrink-0" [disabled]="loading()">
          @if (loading()) { <span class="animate-spin">◌</span> Recherche... }
          @else { 🔎 Rechercher }
        </button>
      </form>

      <!-- Suggestions rapides -->
      <div class="flex gap-2 flex-wrap mt-3">
        @for (chip of suggestions; track chip) {
          <button (click)="quickSearch(chip)" class="yam-badge cursor-pointer hover:border-yam-orange/50 transition">{{ chip }}</button>
        }
      </div>

      @if (error(); as err) {
        <div class="yam-card p-4 mt-6 flex items-center justify-between gap-3 flex-wrap">
          <p class="text-sm">{{ err }}</p>
          <a [href]="'https://www.youtube.com/results?search_query=' + encodedQuery()"
             target="_blank" rel="noopener" class="yam-btn-secondary !py-1.5 !px-4 text-sm shrink-0">
            Ouvrir la recherche sur YouTube ↗
          </a>
        </div>
      }

      <!-- Resultats -->
      @if (results().length) {
        <h2 class="yam-title !text-xl mt-10 mb-4">Resultats YouTube <span class="text-white/40 text-sm font-normal">{{ results().length }}</span></h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (v of results(); track v.videoId) {
            <div class="yam-card p-3 flex gap-3 group">
              <div class="relative w-36 shrink-0 aspect-video rounded-lg overflow-hidden bg-black">
                <img [src]="v.thumbnailUrl" [alt]="v.title" class="w-full h-full object-cover" loading="lazy">
                @if (v.durationText) {
                  <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-semibold">{{ v.durationText }}</span>
                }
                @if (v.alreadyImported) {
                  <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-yam-orange text-white text-[10px] font-bold">YAM</span>
                }
              </div>
              <div class="min-w-0 flex-1 flex flex-col">
                <p class="font-semibold text-sm line-clamp-2 group-hover:text-yam-orange transition">{{ v.title }}</p>
                <p class="text-white/50 text-xs mt-0.5 truncate">{{ v.channel }}</p>
                <div class="mt-auto flex items-center gap-2 pt-2">
                  <button (click)="listen(v)" class="yam-btn-primary !py-1.5 !px-4 text-xs shrink-0" [disabled]="importing() === v.videoId">
                    @if (importing() === v.videoId) { <span class="animate-spin">◌</span> }
                    @else if (v.alreadyImported) { ▶ Ecouter }
                    @else { ⬇ Importer & Ecouter }
                  </button>
                  <a [href]="v.watchUrl" target="_blank" rel="noopener"
                     class="text-white/40 hover:text-red-500 text-sm transition shrink-0" title="Ouvrir sur YouTube">↗</a>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Musiques libres d'acces -->
      <div class="mt-14">
        <div class="flex items-end justify-between gap-3 mb-4">
          <div>
            <h2 class="yam-title !text-xl">🆓 Musiques libres d'acces</h2>
            <p class="text-white/50 text-sm mt-0.5">Hymnes nationaux des pays et grands classiques africains — ecoute gratuite, toujours disponible.</p>
          </div>
        </div>
        @if (libre().length) {
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            @for (t of libre(); track t.id) {
              <yam-track-card [track]="t" (play)="player.play($event)" (tip)="player.addToQueue($event)" />
            }
          </div>
        } @else if (libreLoading()) {
          <div class="flex items-center gap-2 text-white/40 text-sm py-8"><span class="animate-spin text-lg">◌</span> Chargement du catalogue libre...</div>
        }
      </div>
    </div>

    <!-- Toast d'import -->
    @if (importMessage(); as msg) {
      <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-yam-gold text-yam-dark font-semibold px-5 py-2.5 rounded-full shadow-2xl text-sm max-w-[92vw] text-center">
        {{ msg }}
      </div>
    }
  `
})
export class YoutubeComponent {
  private youtube = inject(YoutubeService);
  private router = inject(Router);
  player = inject(PlayerService);
  auth = inject(AuthService);

  query = signal<string>('');
  results = signal<YoutubeVideo[]>([]);
  libre = signal<Track[]>([]);
  loading = signal<boolean>(false);
  libreLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  importing = signal<string | null>(null);
  importMessage = signal<string | null>(null);

  readonly suggestions = [
    'Afrobeats 2025', 'Coupes-decales', 'Hymne Burkina Faso', 'Zouglou Abidjan',
    'Mbalax Senegal', 'Reggae Mali', 'Rumba congolaise', 'Gospel Afrique'
  ];

  constructor() {
    this.loadLibre();
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  encodedQuery(): string {
    return encodeURIComponent(this.query().trim());
  }

  doSearch(event?: Event): void {
    event?.preventDefault();
    const q = this.query().trim();
    if (!q) return;
    // Lien YouTube colle directement ? -> import immédiat
    if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/\S+/.test(q)
        || /^[a-zA-Z0-9_-]{11}$/.test(q)) {
      this.importByLink(q);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.youtube.search(q).subscribe({
      next: (videos) => {
        this.results.set(videos);
        this.loading.set(false);
        if (!videos.length) {
          this.error.set('Aucun resultat YouTube recuperable. Ouvre la recherche sur YouTube puis colle le lien d\'une video ici.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('La recherche YouTube est momentanement indisponible (YouTube limite les requetes serveur). Ouvre la recherche sur YouTube, copie le lien de la video et colle-le dans la barre ci-dessus : l\'import marche toujours.');
      }
    });
  }

  /** Import direct d'un lien YouTube colle dans la barre de recherche. */
  private async importByLink(link: string): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.importMessage.set('Connecte-toi pour importer des musiques YouTube sur YAM DJ.');
      setTimeout(() => this.importMessage.set(null), 5000);
      this.router.navigate(['/login']);
      return;
    }
    this.importing.set('link');
    this.error.set(null);
    try {
      const track = await firstValueFrom(this.youtube.importVideo(link));
      this.player.play(track);
      this.importMessage.set('"' + track.title + '" importee — visible dans la file d\'actualite !');
      setTimeout(() => this.importMessage.set(null), 4000);
      this.loadLibre();
    } catch (e: any) {
      this.error.set('Lien YouTube invalide ou video non importable. Verifie l\'URL (watch?v=..., youtu.be/...).');
    } finally {
      this.importing.set(null);
    }
  }

  quickSearch(q: string): void {
    this.query.set(q);
    this.doSearch();
  }

  /** Import (ou reutilise) puis joue dans le player integre. */
  async listen(v: YoutubeVideo): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.importMessage.set('Connecte-toi pour importer des musiques YouTube sur YAM DJ.');
      setTimeout(() => this.importMessage.set(null), 5000);
      this.router.navigate(['/login']);
      return;
    }
    this.importing.set(v.videoId);
    try {
      const track = await firstValueFrom(this.youtube.importVideo(v.videoId));
      v.alreadyImported = true;
      this.results.set([...this.results()]);
      this.player.play(track);
      this.importMessage.set('"' + track.title + '" importee — visible dans la file d\'actualite !');
      setTimeout(() => this.importMessage.set(null), 4000);
      this.loadLibre();
    } catch (e: any) {
      const msg = e?.status === 401 || e?.status === 403
        ? 'Connexion requise pour importer.'
        : 'Import impossible pour cette video (indisponible ou non integree).';
      this.importMessage.set(msg);
      setTimeout(() => this.importMessage.set(null), 4000);
    } finally {
      this.importing.set(null);
    }
  }

  private loadLibre(): void {
    this.libreLoading.set(true);
    this.youtube.libre(24).subscribe({
      next: (tracks) => {
        this.libre.set(tracks);
        this.libreLoading.set(false);
      },
      error: () => this.libreLoading.set(false)
    });
  }
}
