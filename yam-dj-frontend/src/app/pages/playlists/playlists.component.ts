import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon.component';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { Playlist } from '../../models/models';

/**
 * PAGE PLAYLISTS — mes playlists + creation + playlists publiques de la
 * communaute. Le backend existe deja (PublicContentController), cette page
 * l'expose enfin cote frontend.
 */
@Component({
  selector: 'yam-playlists',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">

      <section class="mb-8 rounded-3xl overflow-hidden relative bg-gradient-to-r from-yam-orange/20 via-yam-surface to-yam-surface border border-white/5 p-8">
        <h1 class="font-display font-extrabold text-3xl md:text-4xl mb-3"><yam-icon name="folder" [size]="28"/><span class="yam-gradient-text">Mes Playlists</span>
        </h1>
        <p class="text-white/60 max-w-xl mb-6">
          Organise tes sons preferes, partage tes selections avec la communaute
          et garde tes coups de coeur toujours a portee de main.
        </p>

        <div class="flex flex-wrap gap-3 items-center">
          <input [(ngModel)]="newName" (keyup.enter)="create()" placeholder="Nom de ta nouvelle playlist..."
                 class="yam-input !w-auto min-w-[240px]" maxlength="60">
          <label class="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
            <input type="checkbox" [(ngModel)]="newPublic" class="accent-yam-orange w-4 h-4">
            Publique
          </label>
          <button (click)="create()" [disabled]="creating() || !newName.trim()" class="yam-btn-primary !px-6">
            @if (creating()) { <span class="animate-pulse">Creation...</span> }
            @else { + Creer la playlist }
          </button>
        </div>
        @if (error()) { <p class="text-red-400 text-sm mt-3">{{ error() }}</p> }
      </section>

      @if (loading()) {
        <div class="text-center py-16 text-white/40 animate-pulse">Chargement de tes playlists...</div>
      } @else if (mine().length === 0) {
        <div class="yam-card p-10 text-center mb-10">
          <div class="text-5xl mb-3"></div>
          <p class="text-white/60">Aucune playlist pour l'instant. Cree la premiere ci-dessus,<br>
          puis ajoute des sons depuis n'importe quelle carte de piste (bouton).</p>
        </div>
      } @else {
        <section class="mb-12">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            @for (p of mine(); track p.id) {
              <a [routerLink]="['/playlist', p.id]" class="yam-card p-4 group cursor-pointer">
                <div class="aspect-square rounded-xl mb-3 bg-gradient-to-br from-yam-orange/30 to-yam-surface flex items-center justify-center overflow-hidden">
                  <span class="text-4xl opacity-60 group-hover:scale-110 transition"><yam-icon name="headphones" [size]="28"/></span>
                </div>
                <p class="font-semibold truncate group-hover:text-yam-orange transition">{{ p.name }}</p>
                <p class="text-white/50 text-sm">{{ p.trackIds?.length || 0 }} sons — {{ p.isPublic ? 'Publique' : 'Privee' }}</p>
              </a>
            }
          </div>
        </section>
      }

      <section>
        <h2 class="yam-title mb-4"><yam-icon name="globe" [size]="28"/><span class="text-white/40 text-lg">Playlists de la communaute</span></h2>
        @if (publicLoading()) {
          <div class="text-center py-8 text-white/40 animate-pulse">Chargement...</div>
        } @else if (community().length === 0) {
          <p class="text-white/40">Aucune playlist publique pour le moment. Sois le premier a partager la tienne !</p>
        } @else {
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            @for (p of community(); track p.id) {
              <a [routerLink]="['/playlist', p.id]" class="yam-card p-4 group cursor-pointer">
                <div class="aspect-square rounded-xl mb-3 bg-gradient-to-br from-yam-gold/20 to-yam-surface flex items-center justify-center">
                  <span class="text-4xl opacity-60 group-hover:scale-110 transition"><yam-icon name="music-note" [size]="28"/></span>
                </div>
                <p class="font-semibold truncate group-hover:text-yam-gold transition">{{ p.name }}</p>
                <p class="text-white/50 text-sm">{{ p.trackIds?.length || 0 }} sons</p>
              </a>
            }
          </div>
        }
      </section>
    </div>
  `
})
export class PlaylistsComponent implements OnInit {
  private content = inject(ContentService);
  auth = inject(AuthService);

  mine = signal<Playlist[]>([]);
  community = signal<Playlist[]>([]);
  loading = signal<boolean>(false);
  publicLoading = signal<boolean>(false);
  creating = signal<boolean>(false);
  newName = '';
  newPublic = true;
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadMine();
    this.loadCommunity();
  }

  loadMine(): void {
    this.loading.set(true);
    this.content.myPlaylists().subscribe({
      next: list => { this.mine.set(list || []); this.loading.set(false); },
      error: () => { this.loading.set(false); }
    });
  }

  loadCommunity(): void {
    this.publicLoading.set(true);
    this.content.publicPlaylists().subscribe({
      next: list => { this.community.set(list || []); this.publicLoading.set(false); },
      error: () => { this.publicLoading.set(false); }
    });
  }

  create(): void {
    if (this.creating() || !this.newName.trim()) return;
    this.creating.set(true);
    this.error.set(null);
    this.content.createPlaylist(this.newName.trim(), '', this.newPublic).subscribe({
      next: created => {
        this.creating.set(false);
        this.mine.update(list => [created, ...list]);
        this.newName = '';
      },
      error: () => {
        this.creating.set(false);
        this.error.set('Creation impossible. Reessaie.');
      }
    });
  }
}
