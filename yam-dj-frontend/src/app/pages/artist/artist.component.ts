import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { PlayerService } from '../../services/player.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { ArtistPublic, Track } from '../../models/models';

@Component({
  selector: 'yam-artist',
  standalone: true,
  imports: [TrackCardComponent, TipModalComponent, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">

      @if (artist(); as a) {
        <!-- Banniere profil -->
        <section class="mb-8 rounded-3xl overflow-hidden bg-gradient-to-b from-yam-orange/25 to-yam-surface border border-white/5 p-8 md:p-10">
          <div class="flex flex-col md:flex-row items-start md:items-end gap-6">
            <div class="w-32 h-32 rounded-full bg-gradient-to-br from-yam-orange/50 to-yam-gold/50 flex items-center justify-center text-5xl shrink-0">
              @if (a.photoUrl) { <img [src]="a.photoUrl" [alt]="a.stageName" class="w-full h-full rounded-full object-cover"> }
              @else { 🎤 }
            </div>
            <div class="flex-1">
              <span class="yam-badge mb-2">🎤 Artiste · {{ a.country }}</span>
              <h1 class="font-display font-extrabold text-3xl md:text-4xl mb-3">{{ a.stageName }}</h1>
              <p class="text-white/60 max-w-2xl">{{ a.bio || 'Artiste sur YAM DJ.' }}</p>
              <div class="flex items-center gap-6 mt-4 text-sm text-white/50">
                <span><b class="text-white text-lg">{{ a.tracksCount }}</b> pistes</span>
                <span><b class="text-white text-lg">{{ formatNumber(a.totalPlays) }}</b> ecoutes</span>
                <span><b class="text-white text-lg">{{ followers() }}</b> fans</span>
              </div>
            </div>
            <div class="flex flex-col gap-3 shrink-0">
              @if (auth.isLoggedIn()) {
                <button (click)="toggleFollow()" [class]="following() ? 'yam-btn-secondary !px-8 !py-3.5 text-lg' : 'yam-btn-primary !px-8 !py-3.5 text-lg'">
                  @if (following()) { ✓ Abonne } @else { ❤️ Suivre }
                </button>
              }
              <button (click)="tipModalVisible.set(true)"
                      class="yam-btn-primary !px-8 !py-3.5 text-lg shrink-0">
                💰 Soutenir avec un YAM Tip
              </button>
            </div>
          </div>
        </section>

        <!-- Discographie -->
        <section>
          <h2 class="yam-title mb-4">📀 Discographie</h2>
          @if (tracks().length) {
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              @for (track of tracks(); track track) {
                <yam-track-card [track]="track" (play)="onPlay($event)" (tip)="tipModalVisible.set(true)" />
              }
            </div>
          } @else {
            <div class="yam-card p-12 text-center text-white/40">
              <div class="text-5xl mb-3">🎧</div>
              <p>Aucune piste publiee pour le moment. Reviens bientot !</p>
            </div>
          }
        </section>
      } @else {
        <div class="yam-card p-12 text-center">
          <div class="text-5xl mb-3 animate-pulse">🎤</div>
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
  auth = inject(AuthService);

  artist = signal<ArtistPublic | null>(null);
  tracks = signal<Track[]>([]);
  tipModalVisible = signal(false);
  following = signal<boolean>(false);
  followers = signal<number>(0);
  busy = signal<boolean>(false);

  artistId = '';

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.artistId = params.get('id') || '';
      if (this.artistId) this.load();
    });
  }

  load(): void {
    this.contentService.artistProfile(this.artistId).subscribe(a => this.artist.set(a));
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
