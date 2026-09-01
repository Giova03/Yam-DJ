import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TrackService } from '../../services/track.service';
import { ContentService } from '../../services/content.service';
import { PlayerService } from '../../services/player.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { ShareModalComponent } from '../../components/share-modal/share-modal.component';
import { Playlist, Track } from '../../models/models';

/**
 * PAGE PROFIL (protegee par authGuard) — en-tete utilisateur, stats,
 * onglets : Recommandations (fallback : pas d'endpoint "mes likes" cote
 * backend, voir rapport), Historique d'ecoute, Playlists.
 */
@Component({
  selector: 'yam-profile',
  standalone: true,
  imports: [RouterLink, TrackCardComponent, TipModalComponent, ShareModalComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">

      <!-- En-tete profil -->
      <section class="mb-8 rounded-3xl overflow-hidden bg-gradient-to-b from-yam-orange/25 to-yam-surface border border-white/5 p-8 md:p-10">
        <div class="flex flex-col md:flex-row items-start md:items-end gap-6">

          <!-- Avatar rond -->
          <div class="w-28 h-28 rounded-full bg-gradient-to-br from-yam-orange to-yam-gold flex items-center justify-center text-4xl font-black text-white shrink-0 shadow-lg shadow-yam-orange/20 overflow-hidden">
            @if (avatarUrl()) {
              <img [src]="avatarUrl()" [alt]="pseudo()" class="w-full h-full object-cover">
            } @else {
              {{ initial() }}
            }
          </div>

          <div class="flex-1 min-w-0">
            <span class="yam-badge mb-2">{{ roleBadge() }}</span>
            <h1 class="font-display font-extrabold text-3xl md:text-4xl mb-2 truncate">{{ pseudo() }}</h1>
            <p class="text-white/50 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
              @if (country()) { <span>🌍 {{ country() }}</span> }
              <span class="truncate">📧 {{ email() }}</span>
            </p>
          </div>

          <div class="flex flex-col gap-3 shrink-0">
            @if (role() === 'ARTIST' || role() === 'ADMIN') {
              <a routerLink="/dashboard" class="yam-btn-secondary !px-6 text-sm">📊 Voir mon dashboard</a>
            }
            @if (role() === 'DJ' || role() === 'ADMIN') {
              <a routerLink="/dj-studio" class="yam-btn-secondary !px-6 text-sm">🎚️ Studio DJ</a>
            }
            <button (click)="logout()" class="yam-btn-primary !px-6 text-sm">🚪 Deconnexion</button>
          </div>
        </div>
      </section>

      <!-- Stats -->
      <section class="grid grid-cols-3 gap-4 mb-8">
        <div class="yam-card p-5 text-center">
          <p class="text-3xl mb-1">❤️</p>
          <p class="font-display font-bold text-2xl">{{ recommendations().length }}</p>
          <p class="text-white/50 text-sm">Coups de coeur</p>
        </div>
        <div class="yam-card p-5 text-center">
          <p class="text-3xl mb-1">🎧</p>
          <p class="font-display font-bold text-2xl">{{ history().length }}</p>
          <p class="text-white/50 text-sm">Ecoutes recemment</p>
        </div>
        <div class="yam-card p-5 text-center">
          <p class="text-3xl mb-1">🗂️</p>
          <p class="font-display font-bold text-2xl">{{ playlists().length }}</p>
          <p class="text-white/50 text-sm">Playlists</p>
        </div>
      </section>

      <!-- Onglets -->
      <div class="flex gap-2 mb-6 border-b border-white/10 pb-px">
        <button (click)="tab.set('aime')"
                [class]="tab() === 'aime' ? 'px-5 py-2.5 rounded-t-xl bg-yam-card text-yam-orange font-semibold text-sm border-x border-t border-white/10' : 'px-5 py-2.5 text-white/50 hover:text-white text-sm transition'">
          ❤️ Aime
        </button>
        <button (click)="tab.set('history')"
                [class]="tab() === 'history' ? 'px-5 py-2.5 rounded-t-xl bg-yam-card text-yam-orange font-semibold text-sm border-x border-t border-white/10' : 'px-5 py-2.5 text-white/50 hover:text-white text-sm transition'">
          ⏱️ Historique
        </button>
        <button (click)="tab.set('playlists')"
                [class]="tab() === 'playlists' ? 'px-5 py-2.5 rounded-t-xl bg-yam-card text-yam-orange font-semibold text-sm border-x border-t border-white/10' : 'px-5 py-2.5 text-white/50 hover:text-white text-sm transition'">
          🗂️ Playlists
        </button>
      </div>

      <!-- Contenu des onglets -->
      @if (tab() === 'aime') {

        <!-- Pistes aimees (likes de l'utilisateur) -->
        <section>
          <h2 class="yam-title mb-1">❤️ Tes coups de coeur</h2>
          <p class="text-white/40 text-sm mb-6">
            Les pistes que tu as aimees — comme les pour en decouvrir d'autres.
          </p>
          @if (loadingRecos()) {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              @for (s of [1,2,3,4,5]; track s) { <div class="yam-card aspect-square animate-pulse"></div> }
            </div>
          } @else if (recommendations().length === 0) {
            <div class="yam-card p-10 text-center">
              <div class="text-5xl mb-3">❤️</div>
              <p class="text-white/50">Aucune piste aimee pour l'instant. Appuie sur le coeur d'une piste pour la retrouver ici.</p>
            </div>
          } @else {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              @for (track of recommendations(); track track) {
                <yam-track-card [track]="track" (play)="onPlay($event, recommendations())" (tip)="openTip($event)" />
              }
            </div>
          }
        </section>

      } @else if (tab() === 'history') {

        <section>
          <h2 class="yam-title mb-6">⏱️ Historique d'ecoute</h2>
          @if (loadingHistory()) {
            <div class="space-y-3">
              @for (s of [1,2,3,4,5]; track s) { <div class="yam-card h-16 animate-pulse"></div> }
            </div>
          } @else if (history().length === 0) {
            <div class="yam-card p-10 text-center">
              <div class="text-5xl mb-3">🔇</div>
              <p class="text-white/50">Aucune ecoute pour le moment. Lance ta premiere piste depuis <a routerLink="/" class="text-yam-orange hover:underline">l'accueil</a> !</p>
            </div>
          } @else {
            <div class="space-y-3">
              @for (track of history(); track track) {
                <div class="yam-card p-3 flex items-center gap-4 group">
                  <!-- Pochette compacte -->
                  <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/30 flex items-center justify-center shrink-0 overflow-hidden">
                    @if (track.coverUrl) {
                      <img [src]="track.coverUrl" [alt]="track.title" class="w-full h-full object-cover">
                    } @else { <span class="text-xl opacity-50">🎵</span> }
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold truncate group-hover:text-yam-orange transition">{{ track.title }}</p>
                    <p class="text-white/50 text-sm truncate">{{ track.artistName }}</p>
                  </div>
                  <span class="text-white/30 text-xs hidden sm:block truncate max-w-[120px]">{{ track.genre || '' }}</span>
                  <button (click)="shareTrack.set(track)" class="text-white/40 hover:text-white transition shrink-0 text-sm" title="Partager la piste">🔗</button>
                  <button (click)="onPlay(track, history())"
                          class="w-10 h-10 rounded-full bg-yam-orange text-white flex items-center justify-center hover:scale-105 transition shrink-0"
                          title="Ecouter">▶</button>
                </div>
              }
            </div>
          }
        </section>

      } @else {

        <section>
          <div class="flex items-center justify-between mb-6">
            <h2 class="yam-title">🗂️ Mes playlists</h2>
            <a routerLink="/playlists" class="yam-btn-secondary !py-2 text-sm">Gerer mes playlists</a>
          </div>
          @if (loadingPlaylists()) {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              @for (s of [1,2,3,4]; track s) { <div class="yam-card aspect-[4/3] animate-pulse"></div> }
            </div>
          } @else if (playlists().length === 0) {
            <div class="yam-card p-10 text-center">
              <div class="text-5xl mb-3">🎶</div>
              <p class="text-white/50 mb-4">Aucune playlist pour l'instant.</p>
              <a routerLink="/playlists" class="yam-btn-primary inline-block">Creer ma premiere playlist</a>
            </div>
          } @else {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              @for (p of playlists(); track p.id) {
                <a [routerLink]="['/playlist', p.id]" class="yam-card p-4 group">
                  <div class="aspect-square rounded-xl mb-3 bg-gradient-to-br from-yam-orange/30 to-yam-surface flex items-center justify-center overflow-hidden">
                    @if (p.coverUrl) {
                      <img [src]="p.coverUrl" [alt]="p.name" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                    } @else { <span class="text-4xl opacity-60 group-hover:scale-110 transition">🎧</span> }
                  </div>
                  <p class="font-semibold truncate group-hover:text-yam-orange transition">{{ p.name }}</p>
                  <p class="text-white/50 text-sm">{{ p.trackIds?.length || 0 }} sons — {{ p.isPublic ? 'Publique' : 'Privee' }}</p>
                </a>
              }
            </div>
          }
        </section>
      }
    </div>

    <!-- Modales de partage (historique) et de tip (cartes) -->
    <yam-share-modal [visible]="!!shareTrack()" [track]="shareTrack()" (close)="shareTrack.set(null)" />
    <yam-tip-modal [visible]="tipModalVisible()" [artistId]="tipArtist()?.artistId || ''"
                   [artistName]="tipArtist()?.artistName || ''" (close)="tipModalVisible.set(false)" />
  `
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  private trackService = inject(TrackService);
  private content = inject(ContentService);
  player = inject(PlayerService);

  // En-tete
  pseudo = signal<string>('...');
  email = signal<string>('');
  country = signal<string>('');
  avatarUrl = signal<string>('');
  role = signal<string>(this.auth.role());

  // Onglets
  tab = signal<'aime' | 'history' | 'playlists'>('aime');
  recommendations = signal<Track[]>([]);
  history = signal<Track[]>([]);
  playlists = signal<Playlist[]>([]);
  loadingRecos = signal<boolean>(true);
  loadingHistory = signal<boolean>(true);
  loadingPlaylists = signal<boolean>(true);

  shareTrack = signal<Track | null>(null);

  tipModalVisible = signal<boolean>(false);
  tipArtist = signal<Track | null>(null);

  initial = computed<string>(() => (this.pseudo() || 'U').charAt(0).toUpperCase());

  /** Badge du role avec emoji. */
  roleBadge = computed<string>(() => {
    switch (this.role()) {
      case 'ARTIST': return '🎤 Artiste';
      case 'DJ': return '🎚️ DJ';
      case 'ADMIN': return '🛡️ Admin';
      default: return '🎧 Auditeur';
    }
  });

  ngOnInit(): void {
    // Rafraichit le profil depuis GET /api/me (fallback : cache local auth)
    this.auth.me().subscribe({
      next: (me: any) => {
        this.pseudo.set(me.pseudo || this.auth.currentUser()?.pseudo || '...');
        this.email.set(me.email || '');
        this.country.set(me.country || '');
        this.avatarUrl.set(me.avatarUrl || '');
        if (me.role) this.role.set(me.role);
      },
      error: () => {
        const local = this.auth.currentUser();
        this.pseudo.set(local?.pseudo || '...');
        this.email.set(local?.email || '');
      }
    });

    // Onglet "Aime" : pistes aimees par l'utilisateur (endpoint /api/me/likes)
    this.trackService.myLikes(50).subscribe({
      next: list => { this.recommendations.set(list || []); this.loadingRecos.set(false); },
      error: () => this.loadingRecos.set(false)
    });

    // Historique d'ecoute
    this.trackService.history(50).subscribe({
      next: list => { this.history.set(list || []); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false)
    });

    // Playlists
    this.content.myPlaylists().subscribe({
      next: list => { this.playlists.set(list || []); this.loadingPlaylists.set(false); },
      error: () => this.loadingPlaylists.set(false)
    });
  }

  onPlay(track: Track, queue: Track[]): void {
    this.player.play(track, queue);
  }

  openTip(track: Track): void {
    this.tipArtist.set(track);
    this.tipModalVisible.set(true);
  }

  logout(): void {
    this.auth.logout();
  }
}
