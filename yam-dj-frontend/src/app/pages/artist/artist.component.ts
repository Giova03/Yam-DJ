import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { PlayerService } from '../../services/player.service';
import { SeoService } from '../../services/seo.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { TrackRowComponent } from '../../components/track-variants/track-row.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { IconComponent } from '../../components/icon/icon.component';
import { RevealDirective } from '../../directives/reveal.directive';
import { ArtistPublic, Track } from '../../models/models';

/**
 * PAGE ARTISTE V2 (§10) — EDITORIALE, pas une fiche CRUD.
 * Hero portrait grand + nom Syne + pays + stats + follow, puis top titres
 * (lignes) et discographie (cartes) + genres de l'artiste.
 */
@Component({
  selector: 'yam-artist',
  standalone: true,
  imports: [TrackCardComponent, TrackRowComponent, TipModalComponent, RouterLink, IconComponent, RevealDirective],
  template: `
    <div class="max-w-editorial mx-auto px-4 pt-6">

      @if (artist(); as a) {
        <!-- ===== HERO EDITORIAL ===== -->
        <section class="relative rounded-[2rem] overflow-hidden border border-white/8 bg-yam-surface yam-grain">
          @if (a.photoUrl) {
            <div class="absolute inset-0 opacity-20 blur-3xl scale-110" [style.backgroundImage]="'url(' + a.photoUrl + ')'" aria-hidden="true"></div>
          }
          <div class="yam-glow w-[32rem] h-[32rem] -top-40 -right-24 opacity-50"></div>

          <div class="relative p-7 sm:p-10 flex flex-col md:flex-row items-start md:items-end gap-7 min-w-0">
            <div class="w-36 h-36 sm:w-44 sm:h-44 rounded-[1.75rem] overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/50 to-yam-gold/40 flex items-center justify-center shadow-2xl border border-white/15">
              @if (a.photoUrl) {
                <img [src]="a.photoUrl" [alt]="a.stageName" class="w-full h-full object-cover">
              } @else {
                <span class="yam-display text-6xl text-yam-ink/80">{{ a.stageName.charAt(0).toUpperCase() }}</span>
              }
            </div>

            <div class="flex-1 min-w-0">
              <p class="yam-kicker mb-2">Artiste @if (a.country) { · {{ a.country }} }</p>
              <h1 class="yam-display text-4xl sm:text-6xl mb-3 break-words">{{ a.stageName }}</h1>
              @if (a.bio) { <p class="text-white/55 max-w-2xl leading-relaxed">{{ a.bio }}</p> }

              <div class="flex flex-wrap gap-x-7 gap-y-2 mt-5 yam-num text-sm">
                <span><b class="text-yam-orange text-xl">{{ a.tracksCount }}</b> <span class="text-white/40">pistes</span></span>
                <span><b class="text-yam-orange text-xl">{{ formatNumber(a.totalPlays) }}</b> <span class="text-white/40">écoutes</span></span>
                <span><b class="text-yam-orange text-xl">{{ followers() }}</b> <span class="text-white/40">fans</span></span>
              </div>
            </div>

            <div class="flex flex-col gap-2.5 shrink-0 w-full md:w-auto">
              @if (auth.isLoggedIn()) {
                <button (click)="toggleFollow()" [disabled]="busy()"
                        [class]="following() ? 'yam-btn-secondary !px-7 !py-3 inline-flex items-center gap-2' : 'yam-btn-primary !px-7 !py-3 inline-flex items-center gap-2'">
                  @if (following()) { <yam-icon name="check" [size]="16"/> Abonné } @else { <yam-icon name="heart" [size]="16"/> Suivre }
                </button>
              }
              <button (click)="tipModalVisible.set(true)"
                      class="yam-btn-secondary !px-7 !py-3 inline-flex items-center gap-2 !text-yam-gold !border-yam-gold/40 hover:!bg-yam-gold/10">
                <yam-icon name="gift" [size]="16"/> Soutenir (YAM Tip)
              </button>
            </div>
          </div>
        </section>

        <!-- ===== TOP TITRES ===== -->
        @if (topTracks().length) {
          <section class="mt-10" yamReveal>
            <div class="flex items-end justify-between mb-4">
              <div>
                <p class="yam-kicker mb-1.5">Les plus écoutés</p>
                <h2 class="yam-display text-2xl">TOP TITRES</h2>
              </div>
              <button (click)="playTop()" class="yam-btn-primary !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
                <yam-icon name="play" [size]="15" class="fill-current"/> Écouter
              </button>
            </div>
            <div class="yam-card !rounded-3xl p-4 sm:p-5">
              @for (track of topTracks(); track track; let i = $index) {
                <yam-track-row [track]="track" [index]="i" (play)="onPlay($event)" (tip)="tipModalVisible.set(true)"/>
              }
            </div>
          </section>
        }

        <!-- ===== GENRES DE L'ARTISTE ===== -->
        @if (genres().length) {
          <section class="mt-8 flex flex-wrap gap-2 items-center" yamReveal aria-label="Genres">
            <span class="text-white/40 text-xs yam-num uppercase tracking-widest mr-1">Ses territoires</span>
            @for (g of genres(); track g) {
              <a [routerLink]="['/search']" [queryParams]="{ genre: g }" class="yam-badge hover:!text-yam-orange hover:!border-yam-orange/40 transition cursor-pointer">
                <yam-icon name="music-4" [size]="11"/> {{ g }}
              </a>
            }
          </section>
        }

        <!-- ===== DISCOGRAPHIE ===== -->
        <section class="mt-10 mb-6" yamReveal>
          <div class="flex items-end justify-between mb-4">
            <div>
              <p class="yam-kicker mb-1.5">Catalogue</p>
              <h2 class="yam-display text-2xl">DISCOGRAPHIE</h2>
            </div>
          </div>
          @if (tracks().length) {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              @for (track of tracks(); track track) {
                <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="tipModalVisible.set(true)" />
              }
            </div>
          } @else {
            <div class="yam-card p-12 text-center">
              <div class="text-white/20 mb-3 flex justify-center"><yam-icon name="headphones" [size]="40"/></div>
              <p class="text-white/50">Aucune piste publiee pour le moment. Reviens bientot !</p>
            </div>
          }
        </section>
      } @else {
        <div class="yam-card p-12 text-center">
          <div class="flex justify-center mb-3 text-yam-orange/70"><yam-icon name="loader" [size]="36" class="animate-spin"/></div>
          <p class="text-white/50">Chargement du profil artiste...</p>
        </div>
      }
    </div>

    @if (artist(); as a) {
      <yam-tip-modal [visible]="tipModalVisible()" [artistId]="a.userId"
                     [artistName]="a.stageName" (close)="tipModalVisible.set(false)"
                     (tipped)="onTipped($event)" />
    }
  `
})
export class ArtistComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private contentService = inject(ContentService);
  private player = inject(PlayerService);
  private seo = inject(SeoService);
  auth = inject(AuthService);

  artist = signal<ArtistPublic | null>(null);
  tracks = signal<Track[]>([]);
  tipModalVisible = signal(false);
  following = signal<boolean>(false);
  followers = signal<number>(0);
  busy = signal<boolean>(false);

  artistId = '';

  topTracks = computed<Track[]>(() =>
    [...this.tracks()].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 5)
  );

  genres = computed<string[]>(() =>
    Array.from(new Set(this.tracks().map(t => t.genre).filter((g): g is string => !!g))).slice(0, 6)
  );

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.artistId = params.get('id') || '';
      if (this.artistId) this.load();
    });
  }

  load(): void {
    this.contentService.artistProfile(this.artistId).subscribe(a => {
      this.artist.set(a);
      this.seo.page(
        `${a.stageName} — artiste${a.country ? ' (' + a.country + ')' : ''} | YAM DJ`,
        `${a.bio || 'Ecoute les pistes de ' + a.stageName + ' sur YAM DJ : ' + a.tracksCount + ' titres, ' + a.totalPlays + ' ecoutes.'}`,
        `https://yam-dj-frontend.vercel.app/artist/${this.artistId}`);
      this.seo.jsonLd('MusicGroup', {
        'name': a.stageName,
        'description': a.bio || undefined,
        'image': a.photoUrl || undefined,
        'genre': this.genres().join(', ') || undefined,
        'url': `https://yam-dj-frontend.vercel.app/artist/${this.artistId}`
      });
    });
    this.contentService.artistTracks(this.artistId).subscribe(t => this.tracks.set(t));
    this.contentService.followStatus(this.artistId).subscribe({
      next: s => { this.following.set(s.following); this.followers.set(s.followers); },
      error: () => {}
    });
  }

  toggleFollow(): void {
    if (this.busy()) return;
    this.busy.set(true);
    const call = this.following()
      ? this.contentService.unfollow(this.artistId)
      : this.contentService.follow(this.artistId);
    call.subscribe({
      next: res => {
        this.busy.set(false);
        this.following.set(res.following);
        this.followers.set(res.followers);
      },
      error: () => this.busy.set(false)
    });
  }

  playTop(): void {
    const top = this.topTracks();
    if (top.length) this.player.play(top[0], this.tracks());
  }

  onPlay(track: Track): void {
    this.player.play(track, this.tracks());
  }

  onTipped(amount: number): void {
    this.tipModalVisible.set(false);
  }

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
}
