import { Injectable, signal, computed } from '@angular/core';
import { Track, DownloadedTrack } from '../models/models';

/**
 * SOLUTION MOBILE SANS CONNEXION (hors ligne) :
 * gestionnaire de telechargements Data-Lite (48 kbps).
 *
 * Principe : le service demande au Service Worker (sw.js) de mettre en
 * Cache API le playlist HLS Data-Lite + tous ses segments + la pochette.
 * La lecture hors ligne est ensuite TRANSPARENTE — le lecteur demande
 * les memes URLs, le SW sert le cache (aucune donnee mobile consommee).
 *
 * Regles :
 *  - Premium Fan : telechargements illimites
 *  - Compte gratuit : 3 telechargements (decouverte hors ligne)
 *  - Catalogue local (localStorage) + stockage reel (Cache API du SW)
 *  - Quota navigateur suivi via navigator.storage.estimate()
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {

  /** Catalogue des telechargements (reactif). */
  readonly downloads = signal<DownloadedTrack[]>([]);
  /** Etat reseau (reactif). */
  readonly online = signal<boolean>(navigator.onLine);
  /** Telechargement en cours : trackId -> progression 0..1. */
  readonly progress = signal<Record<string, number>>({});

  readonly count = computed(() => this.downloads().length);

  private readonly CATALOG_KEY = 'yamdj-downloads';
  private readonly FREE_LIMIT = 3;

  /** Reponses asynchrones du Service Worker par trackId. */
  private pending = new Map<string, { resolve: (ok: boolean) => void }>();

  constructor() {
    this.loadCatalog();
    this.watchNetwork();
    this.listenSw();
  }

  // ================= RESEAU =================

  private watchNetwork(): void {
    addEventListener('online', () => this.online.set(true));
    addEventListener('offline', () => this.online.set(false));
  }

  private listenSw(): void {
    navigator.serviceWorker?.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'CACHE_TRACK_DONE') {
        const p = this.progress();
        delete p[msg.trackId];
        this.progress.set({ ...p });
        const waiter = this.pending.get(msg.trackId);
        if (waiter) {
          waiter.resolve(!!msg.ok);
          this.pending.delete(msg.trackId);
        }
      }
    });
  }

  private swReady(): Promise<ServiceWorker | null> {
    return (navigator.serviceWorker?.ready
      .then(reg => reg.active || null)
      .catch(() => null)) ?? Promise.resolve(null);
  }

  // ================= CATALOGUE =================

  private loadCatalog(): void {
    try {
      const raw = localStorage.getItem(this.CATALOG_KEY);
      let list: DownloadedTrack[] = raw ? JSON.parse(raw) : [];
      // PURGE DES DONNÉES DÉMO (Ouaga Flow, Abidjan Nuit, etc.) : les pistes
      // de démonstration n'existent plus côté serveur — on retire aussi les
      // entrées résiduelles du navigateur pour ne plus jamais les afficher.
      const DEMO_TITLES = ['ouaga flow', 'abidjan nuit', 'bambara sound',
        'dakar sunset', 'kori don', 'sahel vibration'];
      const cleaned = list.filter(d =>
        !DEMO_TITLES.includes((d.title || '').toLowerCase().trim())
        && !(d.audioUrlLq || '').includes('yam-dj-demo-media')
        && !(d.audioUrlHq || '').includes('yam-dj-demo-media'));
      if (cleaned.length !== list.length) {
        list = cleaned;
        localStorage.setItem(this.CATALOG_KEY, JSON.stringify(list));
        // les fichiers audio démo ne servent plus : purge du cache SW
        try {
          navigator.serviceWorker?.controller?.postMessage({ type: 'PURGE_AUDIO' });
        } catch { /* non bloquant */ }
      }
      this.downloads.set(list);
    } catch {
      this.downloads.set([]);
    }
  }

  private saveCatalog(): void {
    localStorage.setItem(this.CATALOG_KEY, JSON.stringify(this.downloads()));
  }

  isDownloaded(trackId: string): boolean {
    return this.downloads().some(d => d.id === trackId);
  }

  isDownloading(trackId: string): boolean {
    return trackId in this.progress();
  }

  /** Le lecteur peut-il jouer cette piste sans reseau ? */
  canPlayOffline(track: Track): boolean {
    if (this.online()) return true; // en ligne : tout est jouable
    return this.isDownloaded(track.id) && !!track.audioUrlLq;
  }

  /** Nombre restant pour un compte gratuit (null = illimite, premium). */
  remainingForFree(premium: boolean): number | null {
    if (premium) return null;
    return Math.max(0, this.FREE_LIMIT - this.count());
  }

  // ================= TELECHARGEMENT =================

  /**
   * Telecharge une piste en Data-Lite (m3u8 + segments + pochette).
   * Retourne true si l'operation aboutit.
   */
  async downloadTrack(track: Track, premium: boolean): Promise<{ ok: boolean; error?: string }> {
    if (this.isDownloaded(track.id)) {
      return { ok: true, error: 'deja telecharge' };
    }
    if (this.isDownloading(track.id)) {
      return { ok: false, error: 'telechargement en cours' };
    }
    if (!premium && this.count() >= this.FREE_LIMIT) {
      return { ok: false, error: `Limite gratuite de ${this.FREE_LIMIT} telechargements atteinte — passe Premium pour l'illimite` };
    }
    const playlistUrl = track.audioUrlLq || track.audioUrlHq;
    if (!playlistUrl) {
      return { ok: false, error: 'Audio Data-Lite indisponible pour cette piste' };
    }

    const urls = await this.collectUrls(playlistUrl, track.coverUrl);
    if (urls.length < 2) {
      return { ok: false, error: 'Playlist illisible (piste pas encore prete ?)' };
    }

    // Progression simulee par segments mis en cache (estimation legerement
    // en avance sur la realite, suffisant pour la barre UI)
    this.progress.set({ ...this.progress(), [track.id]: 0.05 });
    this.fakeProgress(track.id, urls.length);

    const sw = await this.swReady();
    if (!sw) {
      return { ok: false, error: 'Service Worker indisponible (navigateur incompatible ?)' };
    }

    const done = new Promise<boolean>(resolve => this.pending.set(track.id, { resolve }));
    sw.postMessage({ type: 'CACHE_TRACK', trackId: track.id, urls });

    const ok = await Promise.race([
      done,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 120000)) // timeout 2 min
    ]);
    this.pending.delete(track.id);

    if (ok) {
      this.downloads.update(list => [{
        id: track.id,
        title: track.title,
        artistName: track.artistName,
        coverUrl: track.coverUrl,
        audioUrlLq: track.audioUrlLq,
        audioUrlHq: track.audioUrlHq,
        durationSec: track.durationSec || 0,
        downloadedAt: new Date().toISOString()
      }, ...list]);
      this.saveCatalog();
    }
    return ok ? { ok: true } : { ok: false, error: 'Telechargement interrompu — reessaie en ligne' };
  }

  /** Resout le playlist HLS en liste d'URLs absolues (m3u8 + segments). */
  private async collectUrls(playlistUrl: string, coverUrl?: string): Promise<string[]> {
    const urls: string[] = [playlistUrl];
    if (coverUrl) urls.push(coverUrl);

    try {
      const res = await fetch(playlistUrl, { mode: 'cors' });
      if (!res.ok) return urls;
      const text = await res.text();

      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        // Segment relatif → absolu par rapport au playlist
        try {
          urls.push(new URL(t, playlistUrl).href);
        } catch {
          // ligne non URL : ignoree
        }
      }
    } catch {
      // playlist inaccessible : on ne peut rien telecharger
      return [];
    }
    return urls;
  }

  /** Progression progressive (les messages SW sont binaires). */
  private fakeProgress(trackId: string, segmentCount: number): void {
    const step = Math.max(250, Math.min(1200, 60000 / Math.max(1, segmentCount)));
    const timer = setInterval(() => {
      const p = this.progress();
      const current = p[trackId];
      if (current === undefined) {
        clearInterval(timer);
        return;
      }
      const next = Math.min(0.95, current + 0.04);
      this.progress.set({ ...p, [trackId]: next });
    }, step);
  }

  // ================= SUPPRESSION =================

  async removeDownload(trackId: string): Promise<void> {
    const entry = this.downloads().find(d => d.id === trackId);
    if (!entry) return;

    // URLs a retirer du cache : playlist + segments reconstruits depuis la
    // playlist + pochette (on ne peut lister un cache que par requete, on
    // demande donc au SW une purge par reconstrution des URLs connues)
    const urls: string[] = [];
    if (entry.audioUrlLq) {
      const collected = await this.collectUrls(entry.audioUrlLq, entry.coverUrl).catch(() => []);
      urls.push(...collected);
    }

    const sw = await this.swReady();
    if (sw && urls.length) {
      sw.postMessage({ type: 'UNCACHE_TRACK', trackId, urls });
    }

    this.downloads.update(list => list.filter(d => d.id !== trackId));
    this.saveCatalog();
  }

  /** Supprime TOUT le cache audio (bouton d'urgence). */
  async purgeAll(): Promise<void> {
    const sw = await this.swReady();
    if (sw) sw.postMessage({ type: 'PURGE_AUDIO' });
    this.downloads.set([]);
    this.saveCatalog();
  }

  // ================= STOCKAGE =================

  async storageUsage(): Promise<{ usage: number; quota: number }> {
    try {
      const est = await navigator.storage?.estimate?.();
      return { usage: est?.usage ?? 0, quota: est?.quota ?? 0 };
    } catch {
      return { usage: 0, quota: 0 };
    }
  }

  formatBytes(bytes: number): string {
    if (!bytes) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
