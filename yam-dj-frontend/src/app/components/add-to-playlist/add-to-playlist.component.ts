import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { Playlist, Track } from '../../models/models';

/**
 * MODALE "Ajouter a une playlist" — ouverte depuis les cartes de pistes.
 * Liste les playlists de l'utilisateur, creation rapide incluse.
 */
@Component({
  selector: 'yam-add-to-playlist',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (visible()) {
      <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" (click)="close.emit()">
        <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10 max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">

          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="yam-title">🗂 Ajouter a une playlist</h2>
              <p class="text-white/50 text-sm mt-1 truncate"><b class="text-white">{{ track()?.title }}</b> — {{ track()?.artistName }}</p>
            </div>
            <button (click)="close.emit()" class="text-white/40 hover:text-white text-2xl leading-none">×</button>
          </div>

          @if (!auth.isLoggedIn()) {
            <div class="text-center py-8 space-y-4">
              <div class="text-5xl">🔐</div>
              <p class="text-white/60">Connecte-toi pour creer des playlists et y ajouter des sons.</p>
              <a routerLink="/login" (click)="close.emit()" class="yam-btn-primary inline-block">Se connecter</a>
            </div>
          } @else {
            @if (done()) {
              <div class="text-center py-8 space-y-3">
                <div class="text-5xl animate-bounce-eq">✅</div>
                <p class="text-white/70">Ajoute a <b class="text-yam-gold">{{ doneName() }}</b> !</p>
                <div class="flex gap-2 justify-center">
                  <button (click)="done.set(false)" class="yam-btn-secondary !py-2 text-sm">Ajouter a une autre</button>
                  <button (click)="close.emit()" class="yam-btn-primary !py-2 text-sm">Fermer</button>
                </div>
              </div>
            } @else {
              @if (loading()) {
                <div class="text-center py-8 text-white/40 animate-pulse">Chargement des playlists...</div>
              } @else if (playlists().length === 0 && !creating()) {
                <div class="text-center py-6 text-white/50 text-sm">
                  Tu n'as pas encore de playlist. Cree ta premiere ci-dessous ! 🎶
                </div>
              } @else {
                <div class="space-y-2 mb-4">
                  @for (p of playlists(); track p.id) {
                    <button (click)="addTo(p)" [disabled]="busy()"
                            class="w-full flex items-center justify-between bg-yam-surface hover:bg-white/10 rounded-xl px-4 py-3 transition text-left">
                      <span class="truncate">
                        <span class="font-medium">{{ p.name }}</span>
                        <span class="text-white/40 text-sm ml-2">{{ p.trackIds?.length || 0 }} sons</span>
                      </span>
                      <span class="text-yam-orange text-sm shrink-0 ml-2">{{ isIn(p) ? '✓ Deja la' : '+ Ajouter' }}</span>
                    </button>
                  }
                </div>
              }

              @if (creating()) {
                <div class="space-y-3 bg-yam-surface rounded-2xl p-4 border border-yam-orange/30">
                  <input [(ngModel)]="newName" placeholder="Nom de la playlist" class="yam-input" maxlength="60">
                  <div class="flex gap-2">
                    <button (click)="createAndAdd()" [disabled]="busy() || !newName.trim()"
                            class="yam-btn-primary flex-1 !py-2.5 text-sm">
                      Creer et ajouter le son
                    </button>
                    <button (click)="creating.set(false)" class="yam-btn-secondary !py-2.5 text-sm">Annuler</button>
                  </div>
                </div>
              } @else {
                <button (click)="creating.set(true)" class="yam-btn-secondary w-full !py-2.5 text-sm">
                  + Nouvelle playlist
                </button>
              }

              @if (error()) {
                <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3 mt-3">{{ error() }}</p>
              }
            }
          }
        </div>
      </div>
    }
  `
})
export class AddToPlaylistComponent implements OnInit {
  visible = input.required<boolean>();
  track = input.required<Track>();
  close = output<void>();
  added = output<string>();

  private content = inject(ContentService);
  auth = inject(AuthService);

  playlists = signal<Playlist[]>([]);
  loading = signal<boolean>(false);
  busy = signal<boolean>(false);
  creating = signal<boolean>(false);
  done = signal<boolean>(false);
  doneName = signal<string>('');
  newName = '';
  error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.content.myPlaylists().subscribe({
      next: list => {
        this.playlists.set(list || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger tes playlists. Reessaie.');
      }
    });
  }

  isIn(p: Playlist): boolean {
    return !!(p.trackIds || []).includes(this.track()?.id);
  }

  addTo(p: Playlist): void {
    if (this.busy()) return;
    if (this.isIn(p)) {
      this.done.set(true);
      this.doneName.set(p.name);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.content.addTrack(p.id, this.track()!.id).subscribe({
      next: updated => {
        this.busy.set(false);
        this.done.set(true);
        this.doneName.set(p.name);
        this.added.emit(p.id);
        this.playlists.update(list => list.map(x => x.id === p.id ? updated : x));
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Ajout impossible. Reessaie.');
      }
    });
  }

  createAndAdd(): void {
    if (this.busy() || !this.newName.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    this.content.createPlaylist(this.newName.trim(), '', true).subscribe({
      next: created => {
        this.playlists.update(list => [created, ...list]);
        this.creating.set(false);
        this.newName = '';
        this.addTo(created);
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Creation impossible. Reessaie.');
      }
    });
  }
}
