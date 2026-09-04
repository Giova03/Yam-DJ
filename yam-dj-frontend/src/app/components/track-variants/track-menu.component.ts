import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { OfflineService } from '../../services/offline.service';
import { AddToPlaylistComponent } from '../add-to-playlist/add-to-playlist.component';
import { ShareModalComponent } from '../share-modal/share-modal.component';
import { CommentsComponent } from '../comments/comments.component';
import { IconComponent } from '../icon/icon.component';
import { Track } from '../../models/models';

/**
 * MENU ••• — TOUTES les actions secondaires d'une piste, regroupees
 * (consigne V2 §07 : "reduire le bruit" — visible : pochette, play, titre,
 * artiste, info importante ; secondaire : le menu).
 * Utilise par TrackCard, TrackRow, FeaturedTrack.
 */
@Component({
  selector: 'yam-track-menu',
  standalone: true,
  imports: [AddToPlaylistComponent, ShareModalComponent, CommentsComponent, IconComponent],
  template: `
    <button (click)="toggle($event)" [attr.aria-expanded]="open()" aria-haspopup="menu"
            class="w-8 h-8 rounded-full flex items-center justify-center text-white/45 hover:text-white hover:bg-white/10 transition"
            [title]="label()" [attr.aria-label]="'Actions pour ' + track().title">
      @if (downloadState() === 'loading') {
        <yam-icon name="loader" [size]="15" class="animate-spin"/>
      } @else if (downloadState() === 'done') {
        <yam-icon name="check" [size]="15" class="text-yam-green"/>
      } @else {
        <yam-icon name="more" [size]="16"/>
      }
    </button>

    @if (open()) {
      <div role="menu" class="absolute z-50 right-0 top-full mt-1 w-56 yam-card !rounded-2xl p-1.5 shadow-2xl text-left">
        <button role="menuitem" (click)="player.addToQueue(track()); close()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
          <yam-icon name="plus" [size]="15" class="text-yam-orange"/> Ajouter a la file
        </button>
        <button role="menuitem" (click)="player.playNext(track()); close()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
          <yam-icon name="skip-next" [size]="15" class="text-yam-orange"/> Lire ensuite
        </button>
        <button role="menuitem" (click)="playlistOpen.set(true); close()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
          <yam-icon name="folder" [size]="15" class="text-yam-orange"/> Ajouter a une playlist
        </button>
        <button role="menuitem" (click)="shareOpen.set(true); close()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
          <yam-icon name="share" [size]="15" class="text-yam-orange"/> Partager
        </button>
        <button role="menuitem" (click)="commentsOpen.set(true); close()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
          <yam-icon name="message-circle" [size]="15" class="text-yam-orange"/> Commentaires
        </button>
        <button role="menuitem" (click)="tip.emit(track()); close()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-yam-gold/90 hover:text-yam-gold hover:bg-yam-gold/8 transition">
          <yam-icon name="gift" [size]="15"/> Soutenir l'artiste
        </button>
        @if (!track().youtubeId) {
          <button role="menuitem" (click)="toggleDownload(); close()"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
            <yam-icon [name]="downloadState() === 'done' ? 'check' : 'download'" [size]="15"
                      [class.text-yam-green]="downloadState() === 'done'" class="text-yam-orange"/>
            {{ downloadState() === 'done' ? 'Retirer le telechargement' : 'Telecharger (hors ligne)' }}
          </button>
        } @else {
          <a role="menuitem" [href]="track().sourceUrl || ('https://www.youtube.com/watch?v=' + track().youtubeId)"
             target="_blank" rel="noopener" (click)="close()"
             class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/85 hover:text-white hover:bg-white/8 transition">
            <yam-icon name="external-link" [size]="15" class="text-yam-orange"/> Ouvrir sur YouTube
          </a>
        }
      </div>
    }

    @if (downloadError(); as err) {
      <p class="text-yam-gold text-xs mt-1 absolute left-0 top-full">{{ err }}</p>
    }

    <yam-add-to-playlist [visible]="playlistOpen()" [track]="track()" (close)="playlistOpen.set(false)" />
    <yam-share-modal [visible]="shareOpen()" [track]="track()" (close)="shareOpen.set(false)" />
    @if (commentsOpen()) {
      <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
           (click)="commentsOpen.set(false)">
        <div class="bg-yam-card rounded-3xl p-6 w-full max-w-lg border border-white/10 max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <div class="min-w-0">
              <h2 class="yam-title flex items-center gap-2.5"><yam-icon name="message-circle" [size]="22" class="text-yam-orange"/> Commentaires</h2>
              <p class="text-white/50 text-sm mt-1 truncate">
                <b class="text-white">{{ track().title }}</b> — {{ track().artistName }}
              </p>
            </div>
            <button (click)="commentsOpen.set(false)" class="text-white/40 hover:text-white leading-none" aria-label="Fermer"><yam-icon name="x" [size]="22"/></button>
          </div>
          <yam-comments [trackId]="track().id" />
        </div>
      </div>
    }
  `,
  styles: [`:host { position: relative; display: inline-flex; }`]
})
export class TrackMenuComponent {
  track = input.required<Track>();
  tip = output<Track>();
  player = inject(PlayerService);
  auth = inject(AuthService);
  offline = inject(OfflineService);

  open = signal(false);
  playlistOpen = signal(false);
  shareOpen = signal(false);
  commentsOpen = signal(false);
  downloadError = signal<string | null>(null);

  label(): string { return 'Actions — ' + this.track().title; }

  toggle(e: Event): void {
    e.stopPropagation();
    this.open.set(!this.open());
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open() && !(e.target as HTMLElement).closest('yam-track-menu')) this.close();
  }

  downloadState(): 'none' | 'loading' | 'done' {
    if (this.offline.isDownloaded(this.track().id)) return 'done';
    if (this.offline.isDownloading(this.track().id)) return 'loading';
    return 'none';
  }

  async toggleDownload(): Promise<void> {
    const t = this.track();
    if (this.downloadState() === 'done') {
      await this.offline.removeDownload(t.id);
      return;
    }
    if (this.downloadState() === 'loading') return;
    if (!navigator.onLine) {
      this.downloadError.set('Connecte-toi a Internet pour telecharger — ensuite la piste restera disponible hors ligne.');
      setTimeout(() => this.downloadError.set(null), 4000);
      return;
    }
    const premium = !!this.auth.currentUser()?.premium;
    const res = await this.offline.downloadTrack(t, premium);
    if (!res.ok && res.error && res.error !== 'deja telecharge') {
      this.downloadError.set(res.error);
      setTimeout(() => this.downloadError.set(null), 4000);
    }
  }
}
