import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PlayerService } from '../../services/player.service';
import { OfflineService } from '../../services/offline.service';
import { ThemeService } from '../../services/theme.service';
import { NotificationsBellComponent } from '../notifications-bell/notifications-bell.component';
import { IconComponent } from '../icon/icon.component';

interface MenuLink { path: string; label: string; icon: string; badge?: string; authOnly?: boolean; role?: string[]; }

/**
 * NAVBAR V2 (AFROPULSE NIGHT) — simplifiee visuellement.
 * Navigation principale : Accueil · Explorer · Charts · Artistes · Studio · Recherche.
 * Les autres fonctions sont GROUPEES :
 *  - menu "Explorer" : musique, genres, radio, YouTube, playlists, guide ;
 *  - menu profil : "Ma musique" (favoris/playlists/telechargements/local/stats)
 *    et "Createur" (publier, dashboard, studio) selon le role.
 */
@Component({
  selector: 'yam-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NotificationsBellComponent, IconComponent],
  template: `
    <nav class="fixed top-0 left-0 right-0 z-40 bg-yam-dark/88 backdrop-blur-xl border-b border-white/6">
      <div class="max-w-editorial mx-auto px-4 h-16 flex items-center justify-between gap-3">

        <!-- Logo : reconnu sans le nom, mais le mot est signe Syne -->
        <a routerLink="/" class="flex items-center gap-2.5 shrink-0 group" aria-label="YAM DJ — accueil">
          <img src="assets/favicon.svg" alt="" class="w-9 h-9 rounded-xl shadow-lg group-hover:rotate-6 transition-transform duration-300">
          <span class="font-display font-extrabold text-xl yam-gradient-text hidden sm:block tracking-tight">YAM DJ</span>
        </a>

        <!-- ===== NAVIGATION PRINCIPALE (desktop) ===== -->
        <div class="hidden md:flex items-center gap-1 text-[13.5px] font-semibold">
          <a routerLink="/" routerLinkActive="text-yam-orange" [routerLinkActiveOptions]="{ exact: true }"
             class="px-3 py-2 rounded-full text-white/70 hover:text-white hover:bg-white/5 transition">Accueil</a>

          <!-- Explorer : menu groupe -->
          <div class="relative" (keydown.escape)="menu.set(null)">
            <button (click)="toggleMenu('explorer')" [attr.aria-expanded]="menu() === 'explorer'"
                    aria-haspopup="menu"
                    class="px-3 py-2 rounded-full text-white/70 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5">
              Explorer
              <yam-icon name="chevron-down" [size]="13" class="transition-transform duration-200" [class.rotate-180]="menu() === 'explorer'"/>
            </button>
            @if (menu() === 'explorer') {
              <div role="menu" class="absolute top-full left-0 mt-2 w-60 yam-card !rounded-2xl p-2 shadow-2xl z-50">
                @for (l of explorerLinks(); track l.path) {
                  <a [routerLink]="l.path" role="menuitem" (click)="menu.set(null)"
                     class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/8 transition">
                    <yam-icon [name]="l.icon" [size]="16" class="text-yam-orange shrink-0"/>
                    <span class="flex-1">{{ l.label }}</span>
                    @if (l.badge) { <span class="text-[10px] font-bold text-red-400">{{ l.badge }}</span> }
                  </a>
                }
              </div>
            }
          </div>

          <a routerLink="/charts" routerLinkActive="text-yam-orange"
             class="px-3 py-2 rounded-full text-white/70 hover:text-white hover:bg-white/5 transition">Charts</a>
          <a routerLink="/artists" routerLinkActive="text-yam-orange"
             class="px-3 py-2 rounded-full text-white/70 hover:text-white hover:bg-white/5 transition">Artistes</a>
          <a routerLink="/dj-studio" routerLinkActive="text-yam-orange"
             class="px-3 py-2 rounded-full text-white/70 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5">
            <yam-icon name="disc" [size]="14" class="text-yam-violet"/> Studio
          </a>

          <!-- Recherche -->
          <a routerLink="/search" routerLinkActive="text-yam-orange" aria-label="Rechercher"
             class="ml-1 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 transition">
            <yam-icon name="search" [size]="16"/>
          </a>
        </div>

        <!-- ===== COTE DROIT ===== -->
        <div class="flex items-center gap-1.5 sm:gap-2">

          <!-- Etats de lecture (discrets, jamais en double) -->
          @if (!offline.online()) {
            <span class="yam-badge text-yam-green border border-yam-green/40 !px-2" title="Mode hors ligne — tes telechargements fonctionnent">
              <yam-icon name="wifi-off" [size]="13"/>
            </span>
          }
          @if (player.dataLite()) {
            <span class="yam-badge text-yam-gold border border-yam-gold/30 !px-2 hidden sm:inline" title="Mode economie de donnees actif (48 kbps)">
              <yam-icon name="smartphone" [size]="13"/> Data-Lite
            </span>
          }
          @if (player.nightMode()) {
            <span class="yam-badge text-yam-orange border border-yam-orange/30 !px-2 hidden lg:inline" title="Mode Nightclub actif">
              <yam-icon name="discoball" [size]="13"/>
            </span>
          }

          <!-- Recherche (mobile) -->
          <a routerLink="/search" aria-label="Rechercher" class="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition">
            <yam-icon name="search" [size]="17"/>
          </a>

          <!-- Premium -->
          @if (isPremium()) {
            <a routerLink="/premium" aria-label="Compte Premium actif"
               class="yam-badge text-yam-gold border border-yam-gold/40 !px-2" title="Premium Fan actif"><yam-icon name="star" [size]="13"/></a>
          } @else {
            <a routerLink="/premium" class="yam-badge text-yam-gold border border-yam-gold/40 hover:bg-yam-gold/10 transition hidden sm:inline" title="Passer Premium">
              <yam-icon name="star" [size]="13"/> Premium
            </a>
          }

          <!-- Toggle theme -->
          <button (click)="theme.toggle()" class="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/8 transition"
                  [attr.aria-label]="theme.isLight() ? 'Passer en mode sombre' : 'Passer en mode clair'"
                  [title]="theme.isLight() ? 'Mode sombre' : 'Mode clair'">
            <yam-icon [name]="theme.isLight() ? 'moon' : 'sun'" [size]="16"/>
          </button>

          @if (auth.isLoggedIn()) {
            <yam-notifications-bell />

            <!-- Profil : menus groupes Ma musique / Createur -->
            <div class="relative" (keydown.escape)="menu.set(null)">
              <button (click)="toggleMenu('user')" [attr.aria-expanded]="menu() === 'user'"
                      aria-haspopup="menu" aria-label="Mon compte"
                      class="w-9 h-9 rounded-full bg-yam-orange/20 border border-yam-orange/40 flex items-center justify-center text-yam-orange font-bold text-sm hover:bg-yam-orange/30 transition">
                {{ initial() }}
              </button>
              @if (menu() === 'user') {
                <div role="menu" class="absolute top-full right-0 mt-2 w-64 yam-card !rounded-2xl p-2 shadow-2xl z-50 max-h-[76vh] overflow-y-auto">
                  <div class="px-3 pt-2 pb-1.5">
                    <p class="text-sm font-bold truncate">{{ auth.currentUser()?.pseudo }}</p>
                    <p class="text-[11px] text-white/40">{{ roleLabel() }}</p>
                  </div>

                  <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[.18em] text-white/35 yam-num">Ma musique</p>
                  @for (l of myMusicLinks(); track l.path) {
                    <a [routerLink]="l.path" role="menuitem" (click)="menu.set(null)"
                       class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/8 transition">
                      <yam-icon [name]="l.icon" [size]="15" class="text-white/45 shrink-0"/>
                      <span class="flex-1">{{ l.label }}</span>
                      @if (l.path === '/downloads' && offline.count() > 0) {
                        <span class="text-[10px] yam-num text-yam-orange">{{ offline.count() }}</span>
                      }
                    </a>
                  }

                  @if (creatorLinks().length) {
                    <p class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[.18em] text-yam-violet/80 yam-num">Createur</p>
                    @for (l of creatorLinks(); track l.path) {
                      <a [routerLink]="l.path" role="menuitem" (click)="menu.set(null)"
                         class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/8 transition">
                        <yam-icon [name]="l.icon" [size]="15" class="text-yam-violet shrink-0"/>
                        <span class="flex-1">{{ l.label }}</span>
                      </a>
                    }
                  }

                  <div class="border-t border-white/8 mt-2 pt-2">
                    <a routerLink="/profile" role="menuitem" (click)="menu.set(null)"
                       class="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/8 transition">
                      <yam-icon name="user" [size]="15" class="text-white/45"/> Mon profil
                    </a>
                    <button (click)="logout()" role="menuitem"
                            class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400/90 hover:text-red-400 hover:bg-red-500/10 transition">
                      <yam-icon name="log-out" [size]="15"/> Se deconnecter
                    </button>
                  </div>
                </div>
              }
            </div>
          } @else {
            <a routerLink="/login" class="yam-btn-secondary !py-1.5 !px-5 text-sm hidden sm:inline">Connexion</a>
            <a routerLink="/register" class="yam-btn-primary !py-1.5 !px-5 text-sm">S'inscrire</a>
          }
        </div>
      </div>
    </nav>
    <div class="h-16"></div>
  `
})
export class NavbarComponent {
  auth = inject(AuthService);
  player = inject(PlayerService);
  offline = inject(OfflineService);
  theme = inject(ThemeService);
  private router = inject(Router);
  premium = signal<boolean>(false);
  menu = signal<'explorer' | 'user' | null>(null);

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.auth.me().subscribe({
        next: (u: any) => this.premium.set(!!u?.premium),
        error: () => this.premium.set(false)
      });
    }
  }

  /** Ferme le menu ouvert au clic exterieur. */
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (this.menu() && !t.closest('nav') ) this.menu.set(null);
  }

  toggleMenu(which: 'explorer' | 'user'): void {
    this.menu.set(this.menu() === which ? null : which);
  }

  isPremium(): boolean { return this.premium(); }

  initial(): string {
    return (this.auth.currentUser()?.pseudo || 'U').charAt(0).toUpperCase();
  }

  roleLabel(): string {
    switch (this.auth.role()) {
      case 'ADMIN': return 'Administration';
      case 'ARTIST': return 'Artiste';
      case 'DJ': return 'DJ';
      default: return 'Auditeur';
    }
  }

  explorerLinks(): MenuLink[] {
    return [
      { path: '/', label: 'Musique', icon: 'headphones' },
      { path: '/charts', label: 'Charts de la semaine', icon: 'bar-chart' },
      { path: '/genres', label: 'Genres', icon: 'music-4' },
      { path: '/radio', label: 'YAM Radio', icon: 'radio' },
      { path: '/youtube', label: 'YouTube', icon: 'play', badge: 'import' },
      { path: '/playlists', label: 'Playlists', icon: 'list-music' },
      { path: '/features', label: 'Guide', icon: 'book-open' }
    ];
  }

  myMusicLinks(): MenuLink[] {
    return [
      { path: '/stats', label: 'Mes stats', icon: 'activity' },
      { path: '/playlists', label: 'Playlists', icon: 'list-music' },
      { path: '/downloads', label: 'Telechargements', icon: 'download' },
      { path: '/local', label: 'Musique locale', icon: 'folder' }
    ];
  }

  creatorLinks(): MenuLink[] {
    const role = this.auth.role();
    const links: MenuLink[] = [];
    if (role === 'ARTIST' || role === 'ADMIN') {
      links.push({ path: '/upload', label: 'Publier un son', icon: 'mic' });
    }
    if (role === 'DJ' || role === 'ADMIN') {
      links.push({ path: '/dj-studio', label: 'Studio DJ', icon: 'sliders' });
    }
    if (role === 'ARTIST' || role === 'DJ' || role === 'ADMIN') {
      links.push({ path: '/dashboard', label: 'Tableau de bord', icon: 'bar-chart' });
    }
    if (role === 'ADMIN') {
      links.push({ path: '/admin', label: 'Administration', icon: 'settings' });
    }
    return links;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
