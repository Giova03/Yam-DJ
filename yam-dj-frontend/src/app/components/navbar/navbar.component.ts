import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PlayerService } from '../../services/player.service';
import { OfflineService } from '../../services/offline.service';
import { ThemeService } from '../../services/theme.service';
import { NotificationsBellComponent } from '../notifications-bell/notifications-bell.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'yam-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NotificationsBellComponent, IconComponent],
  template: `
    <nav class="fixed top-0 left-0 right-0 z-40 bg-yam-dark/90 backdrop-blur-md border-b border-white/5">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <a routerLink="/" class="flex items-center gap-2 shrink-0">
          <img src="assets/favicon.svg" alt="YAM DJ" class="w-9 h-9 rounded-xl" aria-hidden="true">
          <span class="font-display font-extrabold text-xl yam-gradient-text hidden sm:block">YAM DJ</span>
        </a>

        <a routerLink="/search" class="flex-1 max-w-md hidden md:block">
          <div class="bg-yam-surface border border-white/10 rounded-full px-4 py-2 text-white/40 text-sm hover:border-yam-orange/50 transition flex items-center gap-2">
            <yam-icon name="search" [size]="15" class="text-white/50"/>
            <span>Rechercher titres, artistes, DJs...</span>
          </div>
        </a>

        <div class="flex items-center gap-1.5 sm:gap-2">
          @if (!offline.online()) {
            <span class="yam-badge text-yam-green border border-yam-green/40" title="Mode hors ligne — tes telechargements fonctionnent">
              <yam-icon name="wifi-off" [size]="13"/> Hors ligne
            </span>
          }
          @if (player.dataLite()) {
            <span class="yam-badge text-yam-gold border border-yam-gold/30 hidden sm:inline" title="Mode economie de donnees actif">
              <yam-icon name="smartphone" [size]="13"/> Data-Lite
            </span>
          }
          @if (player.nightMode()) {
            <span class="yam-badge text-yam-orange border border-yam-orange/30 hidden sm:inline">
              <yam-icon name="discoball" [size]="13"/> Nightclub
            </span>
          }

          <!-- Acces direct YouTube : recherche + import + musiques libres -->
          <a routerLink="/youtube" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium flex items-center gap-1" title="Rechercher sur YouTube et importer sur YAM DJ">
            <yam-icon name="play" [size]="13" class="fill-current text-red-600"/><span class="hidden sm:inline">YouTube</span>
          </a>

          <!-- Toggle theme clair / sombre -->
          <button (click)="theme.toggle()" class="yam-badge cursor-pointer hover:bg-white/20 w-8 h-8 !px-0 justify-center"
                  [title]="theme.isLight() ? 'Passer en mode sombre' : 'Passer en mode clair'">
            <yam-icon [name]="theme.isLight() ? 'moon' : 'sun'" [size]="15"/>
          </button>

          @if (auth.isLoggedIn()) {
            @if (isPremium()) {
              <span class="yam-badge text-yam-gold border border-yam-gold/40" title="Premium Fan actif"><yam-icon name="star" [size]="13"/></span>
            } @else {
              <a routerLink="/premium" class="yam-badge text-yam-gold border border-yam-gold/40 hover:bg-yam-gold/10 transition hidden sm:inline" title="Passer Premium"><yam-icon name="star" [size]="13"/> Premium</a>
            }

            <a routerLink="/charts" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5"><yam-icon name="bar-chart" [size]="14"/> Charts</a>
            <a routerLink="/genres" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5"><yam-icon name="music-4" [size]="14"/> Genres</a>
            <a routerLink="/stats" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden lg:inline flex items-center gap-1.5" title="Ton annee en sons"><yam-icon name="headphones" [size]="14"/> Mes stats</a>
            <a routerLink="/downloads" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5" title="Mes telechargements hors ligne">
              <yam-icon name="download" [size]="14"/><span>{{ offline.count() > 0 ? offline.count() : '' }}</span>
            </a>
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
            <a routerLink="/charts" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5"><yam-icon name="bar-chart" [size]="14"/> Charts</a>
            <a routerLink="/genres" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5"><yam-icon name="music-4" [size]="14"/> Genres</a>
            <a routerLink="/downloads" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5" title="Mes telechargements hors ligne">
              <yam-icon name="download" [size]="14"/><span>{{ offline.count() > 0 ? offline.count() : '' }}</span>
            </a>
            <a routerLink="/local" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline">Ma Musique</a>
            <a routerLink="/features" routerLinkActive="text-yam-orange" class="hover:text-yam-orange transition text-sm font-medium hidden sm:inline flex items-center gap-1.5"><yam-icon name="book-open" [size]="14"/> Guide</a>
            <a routerLink="/premium" routerLinkActive="text-yam-orange" class="yam-badge text-yam-gold border border-yam-gold/40 hover:bg-yam-gold/10 transition"><yam-icon name="star" [size]="13"/> Premium</a>
            <a routerLink="/login" class="yam-btn-secondary !py-1.5 !px-5 text-sm">Connexion</a>
            <a routerLink="/register" class="yam-btn-primary !py-1.5 !px-5 text-sm">S'inscrire</a>
          }
        </div>
      </div>
      <!-- Bandeau secondaire : navigation decouverte (mobile inclus) -->
      <div class="max-w-7xl mx-auto px-4 h-10 flex items-center gap-3 overflow-x-auto scrollbar-hide border-t border-white/5 sm:hidden">
        <a routerLink="/youtube" routerLinkActive="text-yam-orange" class="text-red-600 hover:text-red-500 text-sm whitespace-nowrap font-semibold transition flex items-center gap-1"><yam-icon name="play" [size]="11" class="fill-current"/> YouTube</a>
        <a routerLink="/charts" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition flex items-center gap-1"><yam-icon name="bar-chart" [size]="13"/> Charts</a>
        <a routerLink="/genres" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition flex items-center gap-1"><yam-icon name="music-4" [size]="13"/> Genres</a>
        <a routerLink="/stats" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition flex items-center gap-1"><yam-icon name="headphones" [size]="13"/> Stats</a>
        <a routerLink="/downloads" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition flex items-center gap-1"><yam-icon name="download" [size]="13"/> Telechargements</a>
        <a routerLink="/local" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition flex items-center gap-1"><yam-icon name="folder" [size]="13"/> Ma Musique</a>
        <a routerLink="/features" routerLinkActive="text-yam-orange" class="text-white/60 hover:text-white text-sm whitespace-nowrap transition flex items-center gap-1"><yam-icon name="book-open" [size]="13"/> Guide</a>
      </div>
    </nav>
    <div class="h-[104px] sm:h-16"></div>
  `
})
export class NavbarComponent {
  auth = inject(AuthService);
  player = inject(PlayerService);
  offline = inject(OfflineService);
  theme = inject(ThemeService);
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
