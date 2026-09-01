import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, interval, switchMap, startWith } from 'rxjs';
import { environment } from '../../environments/environment';
import { AppNotification } from '../models/models';

/**
 * Notifications : centre in-app (cloche navbar) + abonnement Web Push
 * (service worker /sw.js, cle VAPID servie par le backend).
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly pushEnabled = signal<boolean>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );

  /** Cle publique VAPID (pour pushManager.subscribe). */
  vapidKey(): Observable<{ publicKey: string }> {
    return this.http.get<{ publicKey: string }>(`${this.apiUrl}/api/notifications/vapid-key`);
  }

  /** Liste des notifications de l'utilisateur connecte. */
  list(limit = 30): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${this.apiUrl}/api/notifications/list?limit=${limit}`);
  }

  unreadCount$(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/api/notifications/unread-count`);
  }

  /** Marque des notifications comme lues (ids precis ou toutes). */
  markRead(ids?: string[]): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${this.apiUrl}/api/notifications/mark-read`,
      ids && ids.length ? { ids } : { all: true });
  }

  /** Enregistre un abonnement push cote backend. */
  subscribe(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiUrl}/api/notifications/subscribe`, sub);
  }

  /** Supprime un abonnement push (changement de navigateur...). */
  unsubscribe(endpoint: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiUrl}/api/notifications/unsubscribe`, { endpoint });
  }

  /** Notification de test (cree une notif in-app + tente un push). */
  sendTest(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiUrl}/api/notifications/test`, {});
  }

  /** Rafraichit la cloche au chargement puis toutes les 60 s (si connecte). */
  refresh(): void {
    this.list().subscribe({
      next: (list) => this.notifications.set(list || []),
      error: () => this.notifications.set([])
    });
    this.unreadCount$().subscribe({
      next: (r) => this.unreadCount.set(r?.count || 0),
      error: () => this.unreadCount.set(0)
    });
  }

  /** Polling du compteur non-lus ( appele par le composant cloche ). */
  startPolling(): Observable<{ count: number }> {
    return interval(60000).pipe(
      startWith(0),
      switchMap(() => this.unreadCount$())
    );
  }

  /**
   * Demande la permission navigateur puis abonne le service worker
   * aux push (cle VAPID backend). Retourne un message d'etat.
   */
  async enablePush(): Promise<string> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return 'Notifications push non supportees par ce navigateur.';
    }
    if (typeof Notification === 'undefined') {
      return 'Notifications non supportees par ce navigateur.';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return 'Permission refusee : autorise les notifications dans les reglages du navigateur.';
    }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const keyRes = await new Promise<{ publicKey: string }>((resolve, reject) => {
        this.vapidKey().subscribe({ next: resolve, error: reject });
      });
      if (!keyRes?.publicKey) {
        this.pushEnabled.set(true);
        return 'Notifications locales activees (push serveur non configure).';
      }
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlB64ToUint8Array(keyRes.publicKey)
      });
      const json = sub.toJSON();
      await new Promise<{ ok: boolean }>((resolve, reject) => {
        this.subscribe({
          endpoint: json.endpoint || '',
          keys: (json.keys as { p256dh: string; auth: string }) || { p256dh: '', auth: '' }
        }).subscribe({ next: resolve, error: reject });
      });
      this.pushEnabled.set(true);
      return 'Notifications push activees ! Tu seras prevenu des nouveautes.';
    } catch (e: any) {
      return 'Echec activation push : ' + (e?.message || e);
    }
  }

  /** Convertit une cle VAPID base64url en Uint8Array pour pushManager. */
  private urlB64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }
}
