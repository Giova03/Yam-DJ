import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { PlayerService } from '../../services/player.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { ArtistPublic, Track } from '../../models/models';

const GENRES = ['all', 'Afrobeats', 'Coupe-Decale', 'Rap', 'Zouglou', 'Ndombolo', 'Reggae', 'Dancehall', 'Traditionnel', 'Gospel', 'R&B', 'Pop'];
const COUNTRIES = ['all', 'Burkina Faso', "Cote d'Ivoire", 'Mali', 'Senegal', 'Guinee', 'Benin', 'Togo', 'Niger', 'Cameroun', 'RDC'];

@Component({
  selector: 'yam-search',
  standalone: true,
  imports: [FormsModule, TrackCardComponent, TipModalComponent, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">
      <h1 class="yam-title mb-6">🔎 Explorer la musique</h1>

      <!-- Barre de recherche -->
      <div class="relative mb-6">
        <input type="text" [ngModel]="query()" (ngModelChange)="onQueryChange($event)"
               placeholder="Titre, artiste, DJ..."
               class="yam-input !py-4 text-lg pl-12">
        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-white/30">🎵</span>
      </div>

      <!-- Filtres -->
      <div class="flex flex-wrap gap-2 mb-4">
        @for (g of genres; track g) {
          <button (click)="genre.set(g); applyFilters()"
                  class="yam-badge cursor-pointer hover:bg-white/20"
                  [class]="genre() === g ? '!bg-yam-orange !text-white' : ''">
            {{ g === 'all' ? 'Tous genres' : g }}
          </button>
        }
      </div>
      <div class="flex flex-wrap gap-2 mb-8">
        @for (c of countries; track c) {
          <button (click)="country.set(c); applyFilters()"
                  class="yam-badge cursor-pointer hover:bg-white/20 !bg-white/5"
                  [class]="country() === c ? '!bg-yam-gold/20 !text-yam-gold border border-yam-gold/40' : ''">
            🌍 {{ c === 'all' ? 'Tous pays' : c }}
          </button>
        }
      </div>

      <!-- Resultats pistes -->
      @if (tracks().length) {
        <h2 class="text-xl font-bold mb-4"> Pistes <span class="text-white/40 text-sm">({{ tracks().length }})</span></h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
          @for (track of tracks(); track track) {
            <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="openTip($event)" />
          }
        </div>
      }

      <!-- Resultats artistes -->
      @if (artists().length) {
        <h2 class="text-xl font-bold mb-4">🎤 Artistes</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          @for (artist of artists(); track artist.userId) {
            <a [routerLink]="['/artist', artist.userId]" class="yam-card p-5 flex items-center gap-4">
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-yam-orange/30 to-yam-gold/30 flex items-center justify-center text-xl shrink-0">🎤</div>
              <div class="min-w-0">
                <p class="font-semibold truncate">{{ artist.stageName }}</p>
                <p class="text-white/50 text-sm">{{ artist.tracksCount }} pistes · {{ artist.totalPlays }} ecoutes</p>
              </div>
            </a>
          }
        </div>
      }

      <!-- Resultats DJs -->
      @if (djs().length) {
        <h2 class="text-xl font-bold mb-4">🎚️ DJs</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          @for (dj of djs(); track dj.userId) {
            <div class="yam-card p-5 flex items-center gap-4">
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-yam-gold/30 to-yam-orange/30 flex items-center justify-center text-xl shrink-0">🎧</div>
              <div class="min-w-0">
                <p class="font-semibold truncate">{{ dj.djName }}</p>
                <p class="text-white/50 text-sm">{{ dj.mixtapeCount }} mixtapes</p>
              </div>
            </div>
          }
        </div>
      }

      @if (!tracks().length && !artists().length && !djs().length && !searching()) {
        <div class="text-center py-20 text-white/30">
          <div class="text-6xl mb-4">🎼</div>
          <p class="text-lg">Aucun resultat. Reessaie avec un autre mot-cle.</p>
        </div>
      }
    </div>

    <yam-tip-modal [visible]="tipModalVisible()" [artistId]="tipArtist()?.artistId || ''"
                   [artistName]="tipArtist()?.artistName || ''" (close)="tipModalVisible.set(false)" />
  `
})
export class SearchComponent {
  private contentService = inject(ContentService);
  private player = inject(PlayerService);

  genres = GENRES;
  countries = COUNTRIES;

  query = signal<string>('');
  genre = signal<string>('all');
  country = signal<string>('all');

  tracks = signal<Track[]>([]);
  artists = signal<ArtistPublic[]>([]);
  djs = signal<any[]>([]);
  searching = signal<boolean>(false);

  tipModalVisible = signal(false);
  tipArtist = signal<Track | null>(null);

  private searchTimer: any = null;

  onQueryChange(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 400);
  }

  applyFilters(): void {
    this.searching.set(true);
    const q = this.query().trim();
    this.contentService.globalSearch(q).subscribe({
      next: res => {
        this.searching.set(false);
        let tracks = res.tracks || [];
        if (this.genre() !== 'all') tracks = tracks.filter(t => t.genre === this.genre());
        if (this.country() !== 'all') tracks = tracks.filter(t => t.country === this.country());
        this.tracks.set(tracks);
        this.artists.set(res.artists || []);
        this.djs.set(res.djs || []);
      },
      error: () => this.searching.set(false)
    });
  }

  onPlay(track: Track): void {
    this.player.play(track, this.tracks());
  }

  openTip(track: Track): void {
    this.tipArtist.set(track);
    this.tipModalVisible.set(true);
  }
}
