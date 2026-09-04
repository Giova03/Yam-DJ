import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../icon/icon.component';

interface TabLink { path: string; label: string; icon: string; }

/**
 * NAVIGATION BASSE MOBILE (V2 §12) : Accueil · Explorer · Charts · Radio · Profil.
 * Le player reste TOUJOURS au-dessus (accessible immediatement).
 * "Explorer" ouvre un panneau groupe (musique/genres/radio/YouTube/ma musique/
 * createur) plutot qu'une 6e destination — peu d'actions simultanees.
 */
@Component({
  selector: 'yam-tabbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    @if (sheet()) {
      <button class="fixed inset-0 z-[44] bg-black/60 backdrop-blur-sm md:hidden" (click)="sheet.set(false)"
              aria-label="Fermer le menu"></button>
      <div class="fixed left-0 right-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[46] md:hidden
                  bg-yam-surface border-t border-white/10 rounded-t-3xl p-4 pb-6 max-h-[62vh] overflow-y-auto
                  shadow-2xl animate-fade-up" role="menu">
        <div class="flex items-center justify-between mb-3">
          <p class="yam-kicker">Explorer YAM DJ</p>
          <button (click)="sheet.set(false)" class="text-white/40 hover:text-white" aria-label="Fermer"><yam-icon name="x" [size]="18"/></button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          @for (l of links(); track l.path) {
            <a [routerLink]="l.path" (click)="sheet.set(false)" role="menuitem"
               class="flex items-center gap-2.5 px-3 py-3 rounded-2xl bg-white/5 border border-white/8 text-sm font-semibold text-white/85 active:scale-95 transition">
              <yam-icon [name]="l.icon" [size]="17" class="shrink-0" [class]="l.createur ? 'text-yam-violet' : 'text-yam-orange'"/>
              {{ l.label }}
            </a>
          }
        </div>
      </div>
    }

    <nav class="fixed bottom-0 left-0 right-0 z-[45] md:hidden bg-yam-surface/97 backdrop-blur-xl border-t border-white/10"
         style="padding-bottom: env(safe-area-inset-bottom)" aria-label="Navigation principale mobile">
      <div class="grid grid-cols-5 h-16">
        <a routerLink="/" routerLinkActive="!text-yam-orange" [routerLinkActiveOptions]="{ exact: true }"
           class="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition" aria-label="Accueil">
          <yam-icon name="home" [size]="20"/><span class="text-[10px] font-semibold">Accueil</span>
        </a>
        <button (click)="sheet.set(!sheet())" [class.!text-yam-orange]="sheet()"
                class="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition" aria-label="Explorer" aria-haspopup="menu">
          <yam-icon name="sparkles" [size]="20"/><span class="text-[10px] font-semibold">Explorer</span>
        </button>
        <a routerLink="/charts" routerLinkActive="!text-yam-orange"
           class="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition" aria-label="Charts">
          <yam-icon name="bar-chart" [size]="20"/><span class="text-[10px] font-semibold">Charts</span>
        </a>
        <a routerLink="/radio" routerLinkActive="!text-yam-orange"
           class="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition" aria-label="Radio">
          <yam-icon name="radio" [size]="20"/><span class="text-[10px] font-semibold">Radio</span>
        </a>
        @if (auth.isLoggedIn()) {
          <a routerLink="/profile" routerLinkActive="!text-yam-orange"
             class="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition" aria-label="Mon profil">
            <span class="w-5 h-5 rounded-full bg-yam-orange/25 border border-yam-orange/50 flex items-center justify-center text-[10px] font-bold text-yam-orange">{{ initial() }}</span>
            <span class="text-[10px] font-semibold">Profil</span>
          </a>
        } @else {
          <a routerLink="/login" routerLinkActive="!text-yam-orange"
             class="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition" aria-label="Connexion">
            <yam-icon name="user" [size]="20"/><span class="text-[10px] font-semibold">Profil</span>
          </a>
        }
      </div>
    </nav>
  `
})
export class TabbarComponent {
  auth = inject(AuthService);
  sheet = signal(false);

  links(): (TabLink & { createur?: boolean })[] {
    const base: (TabLink & { createur?: boolean })[] = [
      { path: '/artists', label: 'Artistes', icon: 'users' },
      { path: '/genres', label: 'Genres', icon: 'music-4' },
      { path: '/youtube', label: 'YouTube', icon: 'play' },
      { path: '/search', label: 'Recherche', icon: 'search' },
      { path: '/features', label: 'Guide', icon: 'book-open' }
    ];
    if (this.auth.isLoggedIn()) {
      base.push(
        { path: '/stats', label: 'Mes stats', icon: 'activity' },
        { path: '/playlists', label: 'Playlists', icon: 'list-music' },
        { path: '/downloads', label: 'Telechargements', icon: 'download' },
        { path: '/local', label: 'Musique locale', icon: 'folder' }
      );
      const role = this.auth.role();
      if (role === 'ARTIST' || role === 'ADMIN') base.push({ path: '/upload', label: 'Publier', icon: 'mic', createur: true });
      if (role === 'DJ' || role === 'ADMIN') base.push({ path: '/dj-studio', label: 'Studio DJ', icon: 'sliders', createur: true });
      if (role === 'ARTIST' || role === 'DJ' || role === 'ADMIN') base.push({ path: '/dashboard', label: 'Dashboard', icon: 'bar-chart', createur: true });
    } else {
      base.push({ path: '/register', label: 'Creer un compte', icon: 'plus', createur: true });
    }
    return base;
  }

  initial(): string {
    return (this.auth.currentUser()?.pseudo || 'U').charAt(0).toUpperCase();
  }
}
