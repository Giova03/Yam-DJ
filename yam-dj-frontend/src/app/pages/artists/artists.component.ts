import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';
import { IconComponent } from '../../components/icon/icon.component';
import { RevealDirective } from '../../directives/reveal.directive';
import { ArtistPublic } from '../../models/models';

/**
 * PAGE /ARTISTS V2 (§05-5) — "À DÉCOUVRIR" : les portraits dominent,
 * les metadonnees restent discretes (pays + ecoutes + suivre).
 */
@Component({
  selector: 'yam-artists-page',
  standalone: true,
  imports: [RouterLink, IconComponent, RevealDirective],
  template: `
    <div class="max-w-editorial mx-auto px-4 pt-6 pb-12">

      <header class="mb-8">
        <p class="yam-kicker mb-2">La scène</p>
        <h1 class="yam-display text-3xl sm:text-5xl mb-3 break-words">À DÉCOUVRIR</h1>
        <p class="text-white/50 max-w-xl">Les artistes qui font le son de l'Ouest, du Burkina au Nigeria.</p>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        @for (a of artists(); track a.userId) {
          <article class="yam-card overflow-hidden group" yamReveal>
            <a [routerLink]="['/artist', a.userId]" class="block relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-yam-violet/25 to-yam-orange/20">
              @if (a.photoUrl) {
                <img [src]="a.photoUrl" [alt]="a.stageName" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-700">
              } @else {
                <span class="w-full h-full flex items-center justify-center">
                  <span class="yam-display text-6xl text-yam-orange/80">{{ a.stageName.charAt(0).toUpperCase() }}</span>
                </span>
              }
              <span class="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent pointer-events-none"></span>
              @if (a.country) {
                <span class="absolute bottom-3 left-3 text-[11px] font-semibold text-white/90 flex items-center gap-1">
                  <yam-icon name="map-pin" [size]="11"/> {{ a.country }}
                </span>
              }
              <span class="absolute top-3 right-3 yam-badge !bg-black/50 !text-white/90 !px-2 !py-0.5 yam-num !text-[10px]">
                {{ formatPlays(a.totalPlays) }}
              </span>
            </a>
            <div class="p-4">
              <a [routerLink]="['/artist', a.userId]" class="font-bold truncate block group-hover:text-yam-orange transition">{{ a.stageName }}</a>
              <p class="text-white/40 text-xs yam-num mt-0.5">{{ a.tracksCount }} piste{{ a.tracksCount > 1 ? 's' : '' }} · {{ formatPlays(a.totalPlays) }} écoutes</p>
              <button (click)="toggleFollow(a)" [disabled]="following(a) === 'pending'"
                      class="mt-3 w-full text-xs font-semibold px-3 py-2 rounded-full border transition inline-flex items-center justify-center gap-1.5"
                      [class]="following(a) === 'on'
                        ? 'text-yam-orange border-yam-orange/50 bg-yam-orange/10'
                        : 'text-white/60 border-white/15 hover:text-yam-orange hover:border-yam-orange/40'">
                <yam-icon [name]="following(a) === 'on' ? 'check' : 'heart'" [size]="12"/>
                {{ following(a) === 'on' ? 'Suivi' : 'Suivre' }}
              </button>
            </div>
          </article>
        } @empty {
          @if (loaded()) {
            <div class="col-span-full yam-card p-12 text-center">
              <div class="text-white/20 mb-3 flex justify-center"><yam-icon name="users" [size]="40"/></div>
              <p class="text-white/50">Aucun artiste disponible pour l'instant.</p>
            </div>
          } @else {
            @for (i of [1,2,3,4,5,6,7,8]; track i) {
              <div class="yam-card overflow-hidden"><div class="aspect-[4/5] bg-white/5 animate-pulse"></div><div class="p-4 space-y-2"><div class="h-4 bg-white/5 rounded animate-pulse w-2/3"></div><div class="h-3 bg-white/5 rounded animate-pulse w-1/2"></div></div></div>
            }
          }
        }
      </div>
    </div>
  `
})
export class ArtistsComponent {
  private content = inject(ContentService);
  private seo = inject(SeoService);
  auth = inject(AuthService);

  artists = signal<ArtistPublic[]>([]);
  loaded = signal(false);
  private followState = new Map<string, 'on' | 'pending'>();

  constructor() {
    this.seo.page(
      'Artistes d\'Afrique de l\'Ouest — la scène YAM DJ | YAM DJ',
      'Découvre les artistes de YAM DJ : portraits, pays, écoutes. Suis tes favoris et soutiens-les en mobile money.',
      'https://yam-dj-frontend.vercel.app/artists');
    this.content.topArtists(24).subscribe({
      next: list => { this.artists.set(list || []); this.loaded.set(true); },
      error: () => this.loaded.set(true)
    });
  }

  following(a: ArtistPublic): 'on' | 'pending' | null {
    return this.followState.get(a.userId) || null;
  }

  toggleFollow(a: ArtistPublic): void {
    if (!this.auth.isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    const current = this.followState.get(a.userId);
    if (current === 'pending') return;
    if (current === 'on') {
      this.content.unfollow(a.userId).subscribe(() => {
        this.followState.delete(a.userId);
      });
    } else {
      this.followState.set(a.userId, 'pending');
      this.content.follow(a.userId).subscribe({
        next: () => this.followState.set(a.userId, 'on'),
        error: () => this.followState.delete(a.userId)
      });
    }
  }

  formatPlays(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }
}
