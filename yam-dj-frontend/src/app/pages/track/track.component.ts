import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { ContentService } from '../../services/content.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { ShareModalComponent } from '../../components/share-modal/share-modal.component';
import { CommentsComponent } from '../../components/comments/comments.component';
import { Track } from '../../models/models';

/**
 * PAGE PUBLIQUE /track/:id — cible des liens de partage social.
 * Accessible sans compte (route sans guard). Charge la piste via
 * GET /api/tracks/{id} (public), meta tags dynamiques (Title/Meta),
 * lecture via PlayerService + modale de partage.
 */
@Component({
  selector: 'yam-track',
  standalone: true,
  imports: [RouterLink, ShareModalComponent, CommentsComponent],
  template: `
    <div class="max-w-5xl mx-auto px-4 pt-6">

      @if (loading()) {
        <div class="yam-card p-12 text-center">
          <div class="text-5xl mb-3 animate-pulse">🎵</div>
          <p class="text-white/50">Chargement de la piste...</p>
        </div>
      } @else if (notFound()) {
        <!-- Piste introuvable -->
        <div class="yam-card p-12 text-center">
          <div class="text-5xl mb-3">🕳️</div>
          <h1 class="yam-title mb-2">Piste introuvable</h1>
          <p class="text-white/50 mb-6">Ce lien n'existe pas (ou plus). La piste a peut-etre ete retiree.</p>
          <a routerLink="/" class="yam-btn-primary inline-block">← Retour a l'accueil</a>
        </div>
      } @else {
        @if (track(); as t) {

        <section class="rounded-3xl overflow-hidden bg-gradient-to-b from-yam-orange/25 to-yam-surface border border-white/5 p-8 md:p-10">
          <div class="flex flex-col md:flex-row gap-8">

            <!-- Grande pochette -->
            <div class="w-full md:w-72 h-72 shrink-0 rounded-2xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/20 overflow-hidden flex items-center justify-center shadow-xl shadow-black/40">
              @if (t.coverUrl) {
                <img [src]="t.coverUrl" [alt]="t.title" class="w-full h-full object-cover">
              } @else {
                <span class="text-7xl opacity-40">🎵</span>
              }
            </div>

            <div class="flex-1 min-w-0 flex flex-col">
              <div class="flex flex-wrap gap-2 mb-3">
                @if (t.genre) { <span class="yam-badge">🎶 {{ t.genre }}</span> }
                @if (t.country) { <span class="yam-badge">🌍 {{ t.country }}</span> }
                <span class="yam-badge">▶ {{ formatNumber(t.playCount) }} ecoutes</span>
                <span class="yam-badge">❤️ {{ formatNumber(t.likeCount) }}</span>
              </div>

              <h1 class="font-display font-extrabold text-3xl md:text-4xl mb-2 break-words">{{ t.title }}</h1>

              <p class="text-white/60 mb-1">
                @if (t.artistId) {
                  de <a [routerLink]="['/artist', t.artistId]" class="text-yam-gold hover:underline font-semibold">{{ t.artistName || t.artistPseudo }}</a>
                } @else {
                  de <span class="font-semibold">{{ t.artistName || t.artistPseudo }}</span>
                }
              </p>
              <p class="text-white/40 text-sm mb-6">{{ player.formatTime(t.durationSec) }} @if (t.bpm) { · {{ t.bpm }} BPM } @if (t.musicalKey) { · tonalite {{ t.musicalKey }} } @if (t.camelot) { · Camelot {{ t.camelot }} }</p>

              <div class="flex flex-wrap gap-3 mt-auto">
                <button (click)="playTrack()" class="yam-btn-primary !px-8 !py-3 text-lg">▶ Ecouter</button>
                <button (click)="shareOpen.set(true)" class="yam-btn-secondary !px-8 !py-3 text-lg">🔗 Partager</button>
              </div>

              @if (!auth.isLoggedIn()) {
                <p class="text-white/40 text-sm mt-5">
                  Decouvre plus de sons africains — <a routerLink="/register" class="text-yam-orange hover:underline">cree ton compte gratuit</a> 🎧
                </p>
              }
            </div>
          </div>
        </section>
        }

        <!-- Commentaires de la piste (Phase 2.2), sous la zone de lecture -->
        @if (track(); as t) {
          <section class="mt-6 mb-10">
            <div class="yam-card p-5 md:p-6">
              <yam-comments [trackId]="t.id" />
            </div>
          </section>
        }
      }
    </div>

    <yam-share-modal [visible]="shareOpen()" [track]="track()" (close)="shareOpen.set(false)" />
  `
})
export class TrackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private content = inject(ContentService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  player = inject(PlayerService);
  auth = inject(AuthService);

  track = signal<Track | null>(null);
  loading = signal<boolean>(true);
  notFound = signal<boolean>(false);
  shareOpen = signal<boolean>(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (!id) { this.fail(); return; }
      this.loading.set(true);
      this.notFound.set(false);
      this.content.trackById(id).subscribe({
        next: t => {
          this.track.set(t);
          this.loading.set(false);
          this.setMetaTags(t);
        },
        error: () => this.fail()
      });
    });
  }

  playTrack(): void {
    const t = this.track();
    if (t) this.player.play(t, [t]);
  }

  /** Meta tags dynamiques (partage social / SEO basique). */
  private setMetaTags(t: Track): void {
    this.titleService.setTitle(`${t.title} — YAM DJ`);
    const desc = `Ecoute ${t.title} de ${t.artistName || t.artistPseudo} sur YAM DJ${t.genre ? ' — ' + t.genre : ''}${t.country ? ' (' + t.country + ')' : ''}.`;
    this.metaService.updateTag({ name: 'description', content: desc });
    // Open Graph pour les apercus WhatsApp / Facebook / X
    this.metaService.updateTag({ property: 'og:title', content: `${t.title} — YAM DJ` });
    this.metaService.updateTag({ property: 'og:description', content: desc });
    this.metaService.updateTag({ property: 'og:type', content: 'music.song' });
    if (t.coverUrl) {
      this.metaService.updateTag({ property: 'og:image', content: t.coverUrl });
    }
  }

  private fail(): void {
    this.loading.set(false);
    this.notFound.set(true);
    this.track.set(null);
    this.titleService.setTitle('Piste introuvable — YAM DJ');
  }

  formatNumber(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }
}
