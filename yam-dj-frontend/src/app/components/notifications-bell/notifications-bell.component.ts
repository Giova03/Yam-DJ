import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { NotificationsService } from '../../services/notifications.service';
import { AppNotification } from '../../models/models';

/**
 * CLOCHE DE NOTIFICATIONS (a inserer dans la navbar) :
 * badge de compteur non-lus, dropdown liste + activation Web Push,
 * rafraichie au chargement puis par polling du compteur (60 s).
 */
@Component({
  selector: 'yam-notifications-bell',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (auth.isLoggedIn()) {
      <div class="relative">
        <!-- Bouton cloche -->
        <button (click)="toggle($event)" title="Notifications"
                aria-label="Notifications"
                class="relative w-9 h-9 rounded-full hover:bg-white/10 transition flex items-center justify-center text-lg">
          <span [class]="open() ? 'text-yam-orange' : 'text-white/70'"><yam-icon name="bell" [size]="17"/></span>
          @if (unreadCount() > 0) {
            <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-yam-dark">
              {{ unreadCount() > 9 ? '9+' : unreadCount() }}
            </span>
          }
        </button>

        <!-- Dropdown -->
        @if (open()) {
          <div class="absolute right-0 mt-2 w-80 sm:w-96 yam-card p-0 overflow-hidden z-50 !rounded-2xl shadow-2xl shadow-black/50"
               (click)="$event.stopPropagation()">

            <!-- En-tete -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-yam-surface/60">
              <p class="font-bold">Notifications</p>
              @if (unreadCount() > 0) {
                <button (click)="markAllRead()" class="text-xs text-yam-orange hover:text-yam-gold transition font-medium">
                  Tout marquer lu
                </button>
              }
            </div>

            <!-- Activation push -->
            @if (!pushEnabled()) {
              <div class="px-4 py-3 border-b border-white/10 bg-yam-orange/5">
                <p class="text-xs text-white/60 mb-2">Reste au courant : nouveaux sons, tips, retraits</p>
                <button (click)="activatePush()" [disabled]="pushBusy()"
                        class="yam-btn-primary !py-1.5 !px-4 text-xs w-full">
                  @if (pushBusy()) { <span class="animate-pulse">Activation...</span> } @else { Activer les push }
                </button>
              </div>
            } @else {
              <div class="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                <p class="text-xs text-yam-green font-medium">✓ Push actives</p>
                <button (click)="testPush()" [disabled]="testBusy()"
                        class="text-xs text-white/40 hover:text-white transition underline underline-offset-2">
                  @if (testBusy()) { <span class="animate-pulse">Envoi...</span> } @else { Tester }
                </button>
              </div>
            }

            <!-- Message de resultat push (succes vert / erreur rouge) -->
            @if (pushMsg(); as m) {
              <p class="px-4 py-2 text-xs border-b border-white/10"
                 [class]="m.ok ? 'text-yam-green bg-yam-green/10' : 'text-red-400 bg-red-400/10'">{{ m.text }}</p>
            }

            <!-- Liste -->
            @if (notifService.notifications().length) {
              <div class="max-h-96 overflow-y-auto">
                @for (n of notifService.notifications(); track n.id) {
                  <button (click)="openNotification(n)"
                          class="w-full text-left px-4 py-3 border-b border-white/5 last:border-0 transition hover:bg-white/5 flex gap-3 items-start"
                          [class]="!n.read ? 'bg-yam-orange/10' : ''">
                    <span class="text-lg shrink-0 mt-0.5">{{ iconFor(n.type) }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="font-medium truncate text-sm">{{ n.title }}</span>
                        @if (!n.read) {
                          <span class="w-2 h-2 rounded-full bg-yam-orange shrink-0" title="Non lue"></span>
                        }
                      </span>
                      <span class="block text-sm text-white/60 leading-snug line-clamp-2">{{ n.body }}</span>
                      <span class="block text-xs text-white/30 mt-0.5">il y a {{ timeAgo(n.createdAt) }}</span>
                    </span>
                  </button>
                }
              </div>
            } @else {
              <p class="text-center text-white/40 text-sm py-10">Aucune notification pour l'instant</p>
            }
          </div>
        }
      </div>
    }
  `
})
export class NotificationsBellComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  notifService = inject(NotificationsService);
  private router = inject(Router);

  open = signal(false);
  pushBusy = signal(false);
  testBusy = signal(false);
  pushMsg = signal<{ text: string; ok: boolean } | null>(null);

  unreadCount = this.notifService.unreadCount;
  pushEnabled = this.notifService.pushEnabled;

  private pollingSub: Subscription | null = null;

  ngOnInit(): void {
    this.notifService.refresh();
    this.pollingSub = this.notifService.startPolling().subscribe({
      next: r => this.notifService.unreadCount.set(r?.count || 0),
      error: () => {}
    });
  }

  ngOnDestroy(): void {
    if (this.pollingSub) this.pollingSub.unsubscribe();
  }

  /** Ouverture/fermeture (le clic ne doit pas se propager au document). */
  toggle(event: Event): void {
    event.stopPropagation();
    this.open.update(v => !v);
    if (this.open()) {
      this.pushMsg.set(null);
      this.notifService.refresh();
    }
  }

  /** Fermeture au clic exterieur. */
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.open()) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.open.set(false);
  }

  /** "Tout marquer lu" : marque toutes les notifications comme lues puis rafraichit. */
  markAllRead(): void {
    this.notifService.markRead().subscribe({
      next: () => this.notifService.refresh(),
      error: () => {}
    });
  }

  /** Activation des push navigateur (permission + abonnement service worker). */
  async activatePush(): Promise<void> {
    if (this.pushBusy()) return;
    this.pushBusy.set(true);
    this.pushMsg.set(null);
    const message = await this.notifService.enablePush();
    this.pushBusy.set(false);
    const ok = message.startsWith('Notifications push activees')
      || message.startsWith('Notifications locales activees');
    this.pushMsg.set({ text: message, ok });
  }

  /** Notification de test : envoie puis rafraichit la liste apres 1 s. */
  testPush(): void {
    if (this.testBusy()) return;
    this.testBusy.set(true);
    this.notifService.sendTest().subscribe({
      next: () => {
        setTimeout(() => {
          this.testBusy.set(false);
          this.notifService.refresh();
        }, 1000);
      },
      error: () => {
        this.testBusy.set(false);
        this.pushMsg.set({ text: 'Envoi impossible. Reessaie.', ok: false });
      }
    });
  }

  /** Clic sur une entree : marquee lue + navigation si lien, puis fermeture. */
  openNotification(n: AppNotification): void {
    if (!n.read) {
      this.notifService.markRead([n.id]).subscribe({
        next: () => this.notifService.refresh(),
        error: () => {}
      });
    }
    if (n.linkUrl) {
      this.open.set(false);
      this.router.navigate([n.linkUrl]);
    }
  }

  /** Icone selon le type de notification. */
  iconFor(type: string): string {
    switch (type) {
      case 'TIP_RECEIVED': return '💰';
      case 'TRACK_APPROVED': return '✅';
      case 'NEW_TRACK': return '🎵';
      case 'COMMENT_NEW': return '💬';
      case 'WITHDRAWAL_APPROVED': return '💸';
      case 'WITHDRAWAL_REJECTED': return '❌';
      case 'PREMIUM_ACTIVATED': return '⭐';
      default: return '';
    }
  }

  /** Date relative : "3 min", "2 h", "5 j"... */
  timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    if (isNaN(ms) || ms < 0) return 'un instant';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'un instant';
    if (minutes < 60) return minutes + ' min';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' h';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + ' j';
    const months = Math.floor(days / 30);
    return months + ' mois';
  }
}
