import { Component, inject, input, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommentsService } from '../../services/comments.service';
import { AuthService } from '../../services/auth.service';
import { Comment } from '../../models/models';

/**
 * PANNEAU COMMENTAIRES d'une piste (Phase 2.2).
 * Prend [trackId] en Input : champ de saisie (si connecte), envoi,
 * liste (avatar, pseudo, date relative, contenu), suppression
 * (auteur ou admin), compteur total. S'insere dans une modale
 * ouverte depuis les cartes de pistes (pattern add-to-playlist).
 */
@Component({
  selector: 'yam-comments',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="flex flex-col">

      <!-- Compteur -->
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-white/50">💬 {{ ' ' }}<b class="text-white">{{ total() }}</b>
          {{ total() > 1 ? 'commentaires' : 'commentaire' }}</span>
        @if (comments().length && total() > comments().length) {
          <span class="text-xs text-white/30">(100 plus recents affiches)</span>
        }
      </div>

      <!-- Saisie (connecte) -->
      @if (auth.isLoggedIn()) {
        <div class="flex gap-2 mb-4">
          <input [(ngModel)]="draft" (keyup.enter)="send()" placeholder="Dis ce que tu penses de ce son..."
                 class="yam-input" maxlength="500" [disabled]="sending()">
          <button (click)="send()" [disabled]="sending() || !draft.trim()"
                  class="yam-btn-primary shrink-0 !px-5" title="Envoyer le commentaire">
            @if (sending()) { <span class="inline-block animate-spin">◌</span> } @else { ➤ }
          </button>
        </div>
      } @else {
        <p class="text-white/40 text-sm bg-yam-surface rounded-xl p-3 mb-4">
          🔐 <a routerLink="/login" class="text-yam-orange underline">Connecte-toi</a> pour commenter ce son.
        </p>
      }

      @if (error()) {
        <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3 mb-3">{{ error() }}</p>
      }

      <!-- Chargement -->
      @if (loading()) {
        <div class="space-y-2">
          @for (s of [1, 2, 3]; track s) {
            <div class="yam-card !rounded-xl p-3 flex gap-3 items-center animate-pulse">
              <div class="w-9 h-9 rounded-full bg-white/10 shrink-0"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 bg-white/10 rounded w-1/3"></div>
                <div class="h-3 bg-white/10 rounded w-2/3"></div>
              </div>
            </div>
          }
        </div>
      } @else if (!comments().length) {
        <p class="text-white/40 text-sm text-center py-6">
          Aucun commentaire pour le moment. Sois le premier ! 🎤
        </p>
      } @else {
        <!-- Liste (plus recents d'abord) -->
        <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
          @for (c of comments(); track c.id) {
            <div class="yam-card !rounded-xl p-3 flex gap-3 items-start">
              <div class="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center
                          bg-gradient-to-br from-yam-orange to-yam-gold text-white font-bold text-sm"
                   [title]="c.pseudo">
                @if (c.avatarUrl) {
                  <img [src]="c.avatarUrl" [alt]="c.pseudo" class="w-full h-full object-cover">
                } @else {
                  {{ initial(c.pseudo) }}
                }
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-sm truncate">{{ c.pseudo }}</span>
                  <span class="text-white/40 text-xs shrink-0">{{ timeAgo(c.createdAt) }}</span>
                  @if (canDelete(c)) {
                    <button (click)="remove(c)"
                            class="ml-auto text-white/30 hover:text-red-400 transition shrink-0"
                            title="Supprimer ce commentaire">🗑</button>
                  }
                </div>
                <p class="text-white/70 text-sm break-words mt-0.5">{{ c.content }}</p>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class CommentsComponent {
  trackId = input.required<string>();
  auth = inject(AuthService);
  private commentsService = inject(CommentsService);

  comments = signal<Comment[]>([]);
  total = signal(0);
  loading = signal(false);
  sending = signal(false);
  error = signal<string | null>(null);
  draft = '';
  myId = signal<string | null>(null);

  constructor() {
    // Recharge la liste a chaque changement de piste ciblee
    // (deferre : load() ecrit des signaux -> interdit dans un effect, NG0600)
    effect(() => {
      const id = this.trackId();
      if (id) window.setTimeout(() => this.load(), 0);
    });
    // Id de l'utilisateur connecte (bouton Supprimer de ses commentaires)
    this.commentsService.currentUserId().subscribe(id => this.myId.set(id));
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.commentsService.getComments(this.trackId()).subscribe({
      next: list => {
        this.comments.set(list || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger les commentaires. Reessaie.');
      }
    });
    this.commentsService.countComments(this.trackId()).subscribe({
      next: count => this.total.set(count || 0),
      error: () => this.total.set(this.comments().length)
    });
  }

  send(): void {
    const content = this.draft.trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.commentsService.addComment(this.trackId(), content).subscribe({
      next: c => {
        this.sending.set(false);
        this.draft = '';
        this.comments.update(list => [c, ...list]);
        this.total.update(n => n + 1);
      },
      error: err => {
        this.sending.set(false);
        this.error.set(this.errorMessage(err));
      }
    });
  }

  remove(c: Comment): void {
    this.error.set(null);
    this.commentsService.deleteComment(c.id).subscribe({
      next: () => {
        this.comments.update(list => list.filter(x => x.id !== c.id));
        this.total.update(n => Math.max(0, n - 1));
      },
      error: err => this.error.set(this.errorMessage(err))
    });
  }

  /** Suppression visible : auteur du commentaire ou administrateur. */
  canDelete(c: Comment): boolean {
    return (this.myId() != null && this.myId() === c.userId) || this.auth.role() === 'ADMIN';
  }

  initial(pseudo: string): string {
    return (pseudo || '?').charAt(0).toUpperCase();
  }

  /** Date relative sans accents : "il y a 5 min", "il y a 2 h", "il y a 3 j"... */
  timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const seconds = Math.floor((Date.now() - then) / 1000);
    if (seconds < 45) return 'il y a un instant';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return 'il y a ' + minutes + ' min';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return 'il y a ' + hours + ' h';
    const days = Math.floor(hours / 24);
    if (days < 30) return 'il y a ' + days + ' j';
    const months = Math.floor(days / 30);
    if (months < 12) return 'il y a ' + months + ' mois';
    return 'il y a ' + Math.floor(months / 12) + ' an(s)';
  }

  private errorMessage(err: any): string {
    const raw = err?.error?.message;
    if (raw) return raw;
    if (err?.status === 429) return 'Trop rapide ! Attends 30 secondes entre deux commentaires.';
    if (err?.status === 401) return 'Connecte-toi pour commenter.';
    if (err?.status === 403) return 'Action interdite.';
    return 'Action impossible. Reessaie.';
  }
}
