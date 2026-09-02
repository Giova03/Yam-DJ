import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { TrackService } from '../../services/track.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { ContentService } from '../../services/content.service';
import { DjService } from '../../services/dj.service';
import { YoutubeService } from '../../services/youtube.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { Track, Mixtape } from '../../models/models';

@Component({
  selector: 'yam-home',
  standalone: true,
  imports: [TrackCardComponent, TipModalComponent, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">

      <!-- Hero -->
      <section class="mb-8 rounded-3xl overflow-hidden relative bg-gradient-to-r from-yam-orange/20 via-yam-surface to-yam-surface border border-white/5 p-8 md:p-10">
        <div class="relative z-10">
          <h1 class="font-display font-extrabold text-3xl md:text-4xl mb-3">
            Bonjour {{ username() }} 👋 <span class="yam-gradient-text">YAM DJ</span> te mixe l'Afrique
          </h1>
          <p class="text-white/60 max-w-xl mb-6">
            Des coups de coeur selectionnes pour toi, des mixtapes de DJs de Ouaga a Abidjan,
            et la possibilite de soutenir tes artistes en 1 clic avec Orange Money.
          </p>
          <div class="flex flex-wrap gap-3">
            <button (click)="playFeed()" class="yam-btn-primary !px-8 !py-3 text-lg">▶ Ecouter Pour Toi</button>
            <a routerLink="/youtube" class="yam-btn-secondary !px-8 !py-3 text-lg !bg-red-600/90 hover:!bg-red-600">▶ Musiques YouTube</a>
            <a routerLink="/charts" class="yam-btn-secondary !px-8 !py-3 text-lg">📊 Charts de la semaine</a>
            @if (auth.role() === 'DJ' || auth.role() === 'ADMIN') {
              <a routerLink="/dj-studio" class="yam-btn-secondary !px-8 !py-3 text-lg">🎚️ Ouvrir le Studio DJ</a>
            }
          </div>
        </div>
        <div class="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-yam-gold/10 to-transparent hidden md:block"></div>
      </section>

      <!-- Pour Toi -->
      <!-- ============ YAM RADIO : suite infinie par genre / pays ============ -->
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="yam-title">📡 YAM Radio {{ ' ' }}<span class="text-white/40 text-lg">— la suite continue toute seule</span></h2>
        </div>
        <p class="text-white/40 text-sm -mt-2 mb-4">Choisis une ambiance, YAM DJ enchaine les sons sans fin — parfait avec le mode Data-Lite.</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          @for (r of radios(); track r.label) {
            <button (click)="startRadio(r)" (contextmenu)="$event.preventDefault()"
                    class="yam-card p-4 text-left hover:border-yam-orange/50 transition group">
              <div class="text-3xl mb-2">{{ r.emoji }}</div>
              <p class="font-bold text-sm group-hover:text-yam-orange transition">{{ r.label }}</p>
              <p class="text-white/40 text-xs">{{ r.hint }}</p>
            </button>
          }
        </div>
        @if (player.radioMode(); as radio) {
          <div class="yam-card p-3 mt-4 border-yam-orange/40 bg-yam-orange/5 flex items-center justify-between">
            <p class="text-sm text-yam-orange font-semibold">📡 Radio en cours : {{ radio.genre || radio.country || 'Decouverte' }} — consulte la file d'attente 📋</p>
            <button (click)="player.stopRadio()" class="text-xs text-white/50 hover:text-white underline shrink-0">Stop</button>
          </div>
        }
      </section>

      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="yam-title">✨ Pour Toi</h2>
          @if (player.dataLite()) {
            <span class="yam-badge text-yam-gold border border-yam-gold/40">Mode Data-Lite actif (48 kbps)</span>
          }
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          @for (track of forYou(); track track) {
            <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="openTip($event)" />
          } @empty {
            @for (s of [1,2,3,4,5]; track s) {
              <div class="yam-card aspect-square animate-pulse"></div>
            }
          }
        </div>
      </section>

      <!-- FILE D'ACTUALITE : nouveautes uploads + imports YouTube -->
      @if (latest().length) {
        <section class="mb-10">
          <div class="flex items-center justify-between mb-4">
            <h2 class="yam-title">📰 File d'actualite {{ ' ' }}<span class="text-white/40 text-lg">— nouveautes & imports YouTube</span></h2>
            <a routerLink="/youtube" class="yam-badge text-red-500 border border-red-500/40 hover:bg-red-500/10 transition shrink-0">▶ Importer depuis YouTube</a>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            @for (track of latest(); track track) {
              <yam-track-card [track]="track" (play)="onPlayLatest($event)" (tip)="openTip($event)" />
            }
          </div>
        </section>
      }

      <!-- Musiques libres d'acces : hymnes + classiques -->
      @if (libre().length) {
        <section class="mb-10">
          <div class="flex items-center justify-between mb-4">
            <h2 class="yam-title">🆓 Hymnes & musiques libres {{ ' ' }}<span class="text-white/40 text-lg">— ecoute gratuite</span></h2>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            @for (track of libre(); track track) {
              <yam-track-card [track]="track" (play)="onPlayLibre($event)" (tip)="openTip($event)" />
            }
          </div>
        </section>
      }

      <!-- Abonnements (artistes suivis) -->
      @if (followFeedTracks().length) {
        <section class="mb-10">
          <h2 class="yam-title mb-4">❤️ Abonnements {{ ' ' }}<span class="text-white/40 text-lg">— les nouveautes de tes artistes</span></h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            @for (track of followFeedTracks(); track track) {
              <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="openTip($event)" />
            }
          </div>
        </section>
      }

      <!-- Recemment ecoute -->
      @if (recent().length) {
        <section class="mb-10">
          <h2 class="yam-title mb-4">⏮️ Recemment ecoute</h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            @for (track of recent(); track track) {
              <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="openTip($event)" />
            }
          </div>
        </section>
      }

      <!-- Tendances Burkina -->
      <section class="mb-10">
        <h2 class="yam-title mb-4">🔥 Tendances {{ ' ' }}<span class="text-white/40 text-lg">— les plus ecoutees</span></h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          @for (track of trending(); track track) {
            <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="openTip($event)" />
          }
        </div>
      </section>

      <!-- Mixtapes DJ -->
      @if (mixtapes().length) {
        <section class="mb-10">
          <h2 class="yam-title mb-4">🎛️ Mixtapes de la communaute DJ</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (mix of mixtapes(); track mix.id) {
              <div class="yam-card p-5 flex items-center gap-4">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/30 flex items-center justify-center text-2xl shrink-0">🎛️</div>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold truncate">{{ mix.title }}</p>
                  <p class="text-white/50 text-sm truncate">par {{ mix.djName }} · {{ mix.playCount }} ecoutes</p>
                  @if (mix.priceXof && mix.priceXof > 0) {
                    <p class="text-xs mt-0.5">
                      @if (mix.purchased) {
                        <span class="text-yam-green font-semibold">✅ Achetee — tienne a vie</span>
                      } @else {
                        <span class="text-yam-gold font-semibold">💰 {{ formatPrice(mix.priceXof) }} — 70 % au DJ</span>
                      }
                    </p>
                  }
                </div>
                @if (mix.priceXof && mix.priceXof > 0 && !mix.purchased) {
                  <button (click)="buyMixtape(mix)" [disabled]="buyingId() === mix.id"
                          class="yam-btn-primary !px-4 !py-2 text-sm shrink-0" title="Debloquer cette mixtape (paiement mobile money)">
                    {{ buyingId() === mix.id ? '...' : 'Acheter' }}
                  </button>
                } @else {
                  <button (click)="playMixtape(mix)" class="w-10 h-10 rounded-full bg-yam-orange text-white flex items-center justify-center hover:scale-105 transition shrink-0">▶</button>
                }
              </div>
            }
          </div>
        </section>
      }
    </div>

    <yam-tip-modal [visible]="tipModalVisible()" [artistId]="tipArtist()?.artistId || ''"
                   [artistName]="tipArtist()?.artistName || ''" (close)="tipModalVisible.set(false)" />
  `
})
export class HomeComponent implements OnInit {
  auth = inject(AuthService);
  player = inject(PlayerService);
  private trackService = inject(TrackService);
  private djService = inject(DjService);
  private content = inject(ContentService);
  private youtube = inject(YoutubeService);
  private title = inject(Title);
  private meta = inject(Meta);

  forYou = signal<Track[]>([]);
  trending = signal<Track[]>([]);
  latest = signal<Track[]>([]);
  libre = signal<Track[]>([]);
  recent = signal<Track[]>([]);
  followFeedTracks = signal<Track[]>([]);
  mixtapes = signal<Mixtape[]>([]);

  /** Radios disponibles (suite infinie par genre / pays). */
  radios = signal<Array<{ label: string; emoji: string; hint: string; genre?: string; country?: string }>>([
    { label: 'Tout YAM', emoji: '🎛️', hint: 'Decouverte sans fin' },
    { label: 'Afrobeats', emoji: '🔥', hint: 'Le son qui bouge', genre: 'Afrobeats' },
    { label: 'Coupé-Décalé', emoji: '💃', hint: 'Abidjan vibes', genre: 'Coupe-Decale' },
    { label: 'Rap', emoji: '🎤', hint: 'Flow ouest-africain', genre: 'Rap' },
    { label: 'Burkina', emoji: '🇧🇫', hint: 'Les sons du Faso', country: 'Burkina Faso' },
    { label: 'Côte d\'Ivoire', emoji: '🇨🇮', hint: 'Le groove ivoirien', country: 'Cote d\'Ivoire' }
  ]);

  /** Lance une radio infinie (bouton d'accueil). */
  startRadio(r: { genre?: string; country?: string }): void {
    this.player.startRadio(r.genre, r.country);
  }

  tipModalVisible = signal(false);
  tipArtist = signal<Track | null>(null);
  /** Mixtape en cours d'achat (boutique 3.4). */
  buyingId = signal<string | null>(null);
  private router = inject(Router);

  username(): string {
    return this.auth.currentUser()?.pseudo || 'a toi';
  }

  ngOnInit(): void {
    // SEO : title + description (les meta OG statiques sont dans index.html)
    this.title.setTitle('YAM DJ — La musique africaine qui vibre | Streaming, charts et studio DJ');
    this.meta.updateTag({ name: 'description',
      content: 'Ecoute les sons d\'Afrique de l\'Ouest, suis les charts hebdomadaires, mixe dans le studio DJ et soutiens les artistes via mobile money.' });

    this.trackService.forYou(15).subscribe(t => this.forYou.set(t));
    this.trackService.trending(10).subscribe(t => this.trending.set(t));
    this.trackService.latest(10).subscribe(t => this.latest.set(t));
    this.youtube.libre(12).subscribe(t => this.libre.set(t));
    this.djService.publicMixtapes(6).subscribe(m => this.mixtapes.set(m));
    if (this.auth.isLoggedIn()) {
      this.trackService.history(10).subscribe({
        next: list => this.recent.set((list || []).filter(t => t.status === 'APPROVED')),
        error: () => this.recent.set([])
      });
      this.content.followFeed(15).subscribe({
        next: list => this.followFeedTracks.set(list || []),
        error: () => this.followFeedTracks.set([])
      });
    }
  }

  playFeed(): void {
    const feed = this.forYou();
    if (feed.length) this.player.play(feed[0], feed);
  }

  onPlay(track: Track): void {
    this.player.play(track, this.forYou());
  }

  onPlayLatest(track: Track): void {
    this.player.play(track, this.latest());
  }

  onPlayLibre(track: Track): void {
    this.player.play(track, this.libre());
  }

  openTip(track: Track): void {
    this.tipArtist.set(track);
    this.tipModalVisible.set(true);
  }

  playMixtape(mix: Mixtape): void {
    this.djService.mixtapeStreamUrl(mix.id).subscribe({
      next: res => {
        this.djService.registerMixtapePlay(mix.id).subscribe(() => {});
        const audio = new Audio(res.url);
        audio.play().catch(() => {});
      },
      error: (err) => {
        // Mixtape payante non achetee (402) → proposer l'achat
        if (err?.status === 402) {
          this.buyMixtape(mix);
        }
      }
    });
  }

  /** Boutique (3.4) : initiation de l'achat → page FedaPay mobile money. */
  buyMixtape(mix: Mixtape): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.buyingId.set(mix.id);
    this.djService.purchaseMixtape(mix.id).subscribe({
      next: res => {
        this.buyingId.set(null);
        if (res.paymentUrl) {
          window.open(res.paymentUrl, '_blank', 'noopener');
        }
      },
      error: err => {
        this.buyingId.set(null);
        alert(err?.error?.message || 'Achat impossible pour le moment.');
      }
    });
  }

  formatPrice(xof: number): string {
    return new Intl.NumberFormat('fr-FR').format(xof) + ' F';
  }
}
