import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrackService } from '../../services/track.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { ContentService } from '../../services/content.service';
import { DjService } from '../../services/dj.service';
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
            @if (auth.role() === 'DJ' || auth.role() === 'ADMIN') {
              <a routerLink="/dj-studio" class="yam-btn-secondary !px-8 !py-3 text-lg">🎚️ Ouvrir le Studio DJ</a>
            }
          </div>
        </div>
        <div class="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-yam-gold/10 to-transparent hidden md:block"></div>
      </section>

      <!-- Pour Toi -->
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
                </div>
                <button (click)="playMixtape(mix)" class="w-10 h-10 rounded-full bg-yam-orange text-white flex items-center justify-center hover:scale-105 transition shrink-0">▶</button>
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

  forYou = signal<Track[]>([]);
  trending = signal<Track[]>([]);
  recent = signal<Track[]>([]);
  followFeedTracks = signal<Track[]>([]);
  mixtapes = signal<Mixtape[]>([]);

  tipModalVisible = signal(false);
  tipArtist = signal<Track | null>(null);

  username(): string {
    return this.auth.currentUser()?.pseudo || 'a toi';
  }

  ngOnInit(): void {
    this.trackService.forYou(15).subscribe(t => this.forYou.set(t));
    this.trackService.trending(10).subscribe(t => this.trending.set(t));
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
      error: () => {}
    });
  }
}
