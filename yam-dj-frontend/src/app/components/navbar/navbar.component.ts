import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PlayerService } from '../../services/player.service';
import { NotificationsBellComponent } from '../notifications-bell/notifications-bell.component';

@Component({
  selector: 'yam-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NotificationsBellComponent],
  template: `
    <nav class="fixed top-0 left-0 right-0 z-40 bg-yam-dark/90 backdrop-blur-md border-b border-white/5">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <a routerLink="/" class="flex items-center gap-2 shrink-0">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-yam-orange to-yam-gold flex items-center justify-center text-lg font-black">Y</div>
          <span class="font-display font-extrabold text-xl yam-gradient-text hidden sm:block">YAM DJ</span>
        </a>

        <a routerLink="/search" class="flex-1 max-w-md hidden md:block">
          <div class="bg-yam-surface border border-white/10 rounded-full px-4 py-2 text-white/40 text-sm hover:border-yam-orange/50 transition">
            🔎 Rechercher titres, artistes, DJs...
          </div>
        </a>

        <div class="flex items-center gap-1.5 sm:gap-2">
          @if (player.dataLite()) {
            <span class="yam-badge text-yam-gold border border-yam-gold/30 hidden sm:inline" title="Mode economie de donnees actif">
              📱 Data-Lite
            </span>
          }
          @if (player.nightMode()) {
            <span class="yam-badge text-yam-orange border border-yam-orange/30 hidden sm:inline">🪩 Nightclub</span>
          }

          @if (auth.isLoggedIn()) {
            @if (isPremium()) {
              <span class="yam-badge text-yam-gold border border-yam-gold/40" title="Premium Fan actif">⭐</span>
            } @else {
              <a routerLink="/premium" class="yam-badge text-yam-gold border border-yam-gold/40 hover:bg-yam-gold/10 transition hidden sm:inline" title="Passer Premium">⭐ Premium</a>
            }

            <a routerLink="/charts" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">📊 Charts</a>
            <a routerLink="/local" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">Ma Musique</a>
            @if (auth.role() === 'ARTIST' || auth.role() === 'ADMIN') {
              <a routerLink="/upload" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium">Upload</a>
            }
            <a routerLink="/playlists" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">Playlists</a>
            @if (auth.role() === 'DJ' || auth.role() === 'ADMIN') {
              <a routerLink="/dj-studio" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium">Studio DJ</a>
            }
            @if (auth.role() === 'ARTIST' || auth.role() === 'DJ' || auth.role() === 'ADMIN') {
              <a routerLink="/dashboard" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">Dashboard</a>
            }
            @if (auth.role() === 'ADMIN') {
              <a routerLink="/admin" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium">Admin</a>
            }
            <yam-notifications-bell />
            <div class="flex items-center gap-2 pl-2 border-l border-white/10">
              <a routerLink="/profile" routerLinkActive="ring-2 ring-yam-orange/60" class="w-8 h-8 rounded-full bg-yam-orange/20 flex items-center justify-center text-yam-orange font-bold text-sm hover:bg-yam-orange/30 transition" title="Mon profil">
                {{ (auth.currentUser()?.pseudo || 'U').charAt(0).toUpperCase() }}
              </a>
              <button (click)="logout()" class="text-white/50 hover:text-white text-sm transition">Quitter</button>
            </div>
          } @else {
            <a routerLink="/charts" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">📊 Charts</a>
            <a routerLink="/local" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">Ma Musique</a>
            <a routerLink="/features" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">Guide</a>
            <a routerLink="/premium" routerLinkActive="text-yam-orange" class="yam-badge text-yam-gold border border-yam-gold/40 hover:bg-yam-gold/10 transition">⭐ Premium</a>
            <a routerLink="/login" class="yam-btn-secondary !py-1.5 !px-5 text-sm">Connexion</a>
            <a routerLink="/register" class="yam-btn-primary !py-1.5 !px-5 text-sm">S'inscrire</a>
          }
        </div>
      </div>
      <!-- Bandeau secondaire : navigation decouverte (mobile inclus) -->
      <div class="max-w-7xl mx-auto px-4 h-10 flex items-center gap-3 overflow-x-auto scrollbar-hide border-t border-white/5 sm:hidden">
        <a routerLink="/charts" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition">📊 Charts</a>
        <a routerLink="/local" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition">Ma Musique</a>
        <a routerLink="/features" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition">Guide</a>
      </div>
    </nav>
    <div class="h-[104px] sm:h-16"></div>
  `
})
export class NavbarComponent {
  auth = inject(AuthService);
  player = inject(PlayerService);
  private router = inject(Router);
  premium = signal<boolean>(false);

  constructor() {
    // Badge Premium (charge depuis /api/me, cache localStorage si indisponible)
    if (this.auth.isLoggedIn()) {
      this.auth.me().subscribe({
        next: (u: any) => this.premium.set(!!u?.premium),
        error: () => this.premium.set(false)
      });
    }
  }

  isPremium(): boolean {
    return this.premium();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
