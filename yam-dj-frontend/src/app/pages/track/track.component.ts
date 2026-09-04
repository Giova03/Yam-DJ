import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../../services/seo.service';
import { ContentService } from '../../services/content.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { ShareModalComponent } from '../../components/share-modal/share-modal.component';
import { CommentsComponent } from '../../components/comments/comments.component';
import { IconComponent } from '../../components/icon/icon.component';
import { Track } from '../../models/models';

/**
 * PAGE PUBLIQUE /track/:id — cible des liens de partage social.
 * V2 P1 : support des EXTRAITS PARTAGEABLES — ?clipStart=95&clipEnd=125
 * ouvre la page, demarre la lecture au bon moment et s'arrete a la fin
 * de l'extrait (30 s) ; "Ecouter tout le son" libere la lecture.
 */
@Component({
  selector: 'yam-track',
  standalone: true,
  imports: [RouterLink, ShareModalComponent, CommentsComponent, IconComponent],
  template: `
    <div class="max-w-5xl mx-auto px-4 pt-6">

      @if (loading()) {
        <div class="yam-card p-12 text-center">
          <div class="flex justify-center mb-3 text-yam-orange/70"><yam-icon name="loader" [size]="34" class="animate-spin"/></div>
          <p class="text-white/50">Chargement de la piste...</p>
        </div>
      } @else if (notFound()) {
        <div class="yam-card p-12 text-center">
          <div class="text-white/20 mb-3 flex justify-center"><yam-icon name="alert-circle" [size]="40"/></div>
          <h1 class="yam-title mb-2">Piste introuvable</h1>
          <p class="text-white/50 mb-6">Ce lien n'existe pas (ou plus). La piste a peut-etre ete retiree.</p>
          <a routerLink="/" class="yam-btn-primary inline-flex items-center gap-2">
            <yam-icon name="arrow-right" [size]="15"/> Retour a l'accueil
          </a>
        </div>
      } @else {
        @if (track(); as t) {

        <!-- Bandeau extrait partage -->
        @if (clipEnd(); as end) {
          <div class="yam-card !rounded-2xl !border-yam-orange/40 bg-yam-orange/5 px-5 py-4 mb-4 flex items-center gap-4 flex-wrap">
            <span class="w-11 h-11 rounded-2xl bg-yam-orange/15 text-yam-orange flex items-center justify-center shrink-0"><yam-icon name="scissors" [size]="20"/></span>
            <div class="min-w-0 flex-1">
              <p class="font-bold text-sm">Extrait partage</p>
              <p class="text-white/50 text-sm yam-num">{{ sec(clipStart() || 0) }} – {{ sec(end) }} · {{ Math.round(end - (clipStart() || 0)) }} s extraites</p>
            </div>
            <button (click)="clearClip()" class="yam-btn-secondary !px-4 !py-2 text-sm">Ecouter tout le son</button>
          </div>
        }

        <section class="rounded-[2rem] overflow-hidden bg-gradient-to-b from-yam-orange/20 to-yam-surface border border-white/8 p-7 md:p-10 relative yam-grain">
          <div class="yam-glow w-[30rem] h-[30rem] -top-32 -right-16 opacity-40"></div>
          <div class="relative flex flex-col md:flex-row gap-8">

            <!-- Grande pochette -->
            <div class="w-full md:w-72 h-72 shrink-0 rounded-[1.75rem] bg-gradient-to-br from-yam-orange/30 to-yam-gold/20 overflow-hidden flex items-center justify-center shadow-2xl">
              @if (t.coverUrl) {
                <img [src]="t.coverUrl" [alt]="t.title" class="w-full h-full object-cover">
              } @else {
                <span class="text-yam-orange/60"><yam-icon name="music-note" [size]="72"/></span>
              }
            </div>

            <div class="flex-1 min-w-0 flex flex-col relative">
              <div class="flex flex-wrap gap-2 mb-3">
                @if (t.genre) { <span class="yam-badge"><yam-icon name="music-4" [size]="11"/> {{ t.genre }}</span> }
                @if (t.country) { <span class="yam-badge"><yam-icon name="map-pin" [size]="11"/> {{ t.country }}</span> }
                <span class="yam-badge yam-num"><yam-icon name="play" [size]="11" class="fill-current"/> {{ formatNumber(t.playCount) }} écoutes</span>
                <span class="yam-badge yam-num"><yam-icon name="heart" [size]="11"/> {{ formatNumber(t.likeCount) }}</span>
              </div>

              <p class="yam-kicker mb-2">Écoute</p>
              <h1 class="font-display font-extrabold text-3xl md:text-5xl leading-tight mb-2 break-words">{{ t.title }}</h1>

              <p class="text-white/60 mb-1 text-lg">
                @if (t.artistId) {
                  de <a [routerLink]="['/artist', t.artistId]" class="text-yam-gold hover:underline font-semibold">{{ t.artistName || t.artistPseudo }}</a>
                } @else {
                  de <span class="font-semibold">{{ t.artistName || t.artistPseudo }}</span>
                }
              </p>
              <p class="text-white/40 text-sm mb-6 yam-num">{{ player.formatTime(t.durationSec) }} @if (t.bpm) { · {{ t.bpm }} BPM } @if (t.musicalKey) { · tonalite {{ t.musicalKey }} } @if (t.camelot) { · Camelot {{ t.camelot }} }</p>

              <div class="flex flex-wrap gap-3 mt-auto">
                <button (click)="playTrack()" class="yam-btn-primary !px-8 !py-3.5 text-lg inline-flex items-center gap-2.5">
                  <yam-icon name="play" [size]="19" class="fill-current"/> Ecouter
                </button>
                <button (click)="shareOpen.set(true)" class="yam-btn-secondary !px-8 !py-3.5 text-lg inline-flex items-center gap-2.5">
                  <yam-icon name="share" [size]="18"/> Partager
                </button>
              </div>

              @if (!auth.isLoggedIn()) {
                <p class="text-white/40 text-sm mt-5">
                  Decouvre plus de sons africains — <a routerLink="/register" class="text-yam-orange hover:underline">cree ton compte gratuit</a>
                </p>
              }
            </div>
          </div>
        </section>
        }

        <!-- Commentaires de la piste -->
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
  private seo = inject(SeoService);
  private metaService = inject(Meta);
  player = inject(PlayerService);
  auth = inject(AuthService);

  track = signal<Track | null>(null);
  loading = signal<boolean>(true);
  notFound = signal<boolean>(false);
  shareOpen = signal<boolean>(false);

  /** Extrait partage : bornes en secondes (null = lecture normale). */
  clipStart = signal<number | null>(null);
  clipEnd = signal<number | null>(null);
  readonly Math = Math;

  constructor() {
    // Fin d'extrait : pause automatique quand la position atteint clipEnd.
    // (deferre hors change detection pour eviter NG0600 sur ecriture signal)
    effect(() => {
      const end = this.clipEnd();
      const t = this.track();
      if (end == null || !t) return;
      if (this.player.currentTrack()?.id === t.id && this.player.isPlaying() && this.player.position() >= end) {
        window.setTimeout(() => {
          if (this.player.isPlaying()) this.player.toggle();
        }, 0);
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(q => {
      const start = Number(q.get('clipStart'));
      const end = Number(q.get('clipEnd'));
      if (!isNaN(start) && !isNaN(end) && end > start && end - start <= 60) {
        this.clipStart.set(Math.max(0, start));
        this.clipEnd.set(end);
      } else {
        this.clipStart.set(null);
        this.clipEnd.set(null);
      }
    });
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
          this.maybeStartClip(t);
        },
        error: () => this.fail()
      });
    });
  }

  /** Extrait partage : demarrage automatique positionne sur clipStart. */
  private maybeStartClip(t: Track): void {
    const start = this.clipStart();
    const end = this.clipEnd();
    if (start == null || end == null) return;
    this.player.play(t, [t]);
    const seekWhenReady = () => {
      if (this.player.duration() || this.player.position() > 0 || this.player.isPlaying()) {
        this.player.seek(start);
      } else {
        setTimeout(seekWhenReady, 300);
      }
    };
    setTimeout(seekWhenReady, 400);
  }

  /** Quitter le mode extrait : lecture normale. */
  clearClip(): void {
    this.clipStart.set(null);
    this.clipEnd.set(null);
    this.playTrack();
  }

  playTrack(): void {
    const t = this.track();
    if (t) this.player.play(t, [t]);
  }

  sec(s: number): string {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  }

  /** Meta tags dynamiques (partage social / SEO basique). */
  private setMetaTags(t: Track): void {
    this.titleService.setTitle(`${t.title} — YAM DJ`);
    const desc = `Ecoute ${t.title} de ${t.artistName || t.artistPseudo} sur YAM DJ${t.genre ? ' — ' + t.genre : ''}${t.country ? ' (' + t.country + ')' : ''}.`;
    this.metaService.updateTag({ name: 'description', content: desc });
    this.seo.musicRecording({
      title: t.title,
      artistName: t.artistName || t.artistPseudo,
      durationSec: t.durationSec,
      coverUrl: t.coverUrl,
      playCount: t.playCount,
      slug: t.slug,
      id: t.id
    });
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
