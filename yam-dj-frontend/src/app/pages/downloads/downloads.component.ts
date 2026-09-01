import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfflineService } from '../../services/offline.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { DownloadedTrack } from '../../models/models';

/**
 * MES TELECHARGEMENTS (/downloads) — coeur de la solution mobile sans
 * connexion : catalogue des pistes en cache, lecture hors ligne, quota
 * de stockage, purge, et guide d'installation de la PWA (ecran d'accueil).
 */
@Component({
  selector: 'yam-downloads-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-5xl mx-auto px-4 py-8">

      <!-- Bandeau d'etat reseau -->
      <div class="yam-card p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <span class="text-2xl">{{ offline.online() ? '📡' : '📴' }}</span>
          <div>
            <p class="font-bold">{{ offline.online() ? 'En ligne' : 'Hors ligne' }}</p>
            <p class="text-white/50 text-sm">
              {{ offline.online()
                ? 'Tes telechargements restent disponibles meme sans reseau.'
                : 'Aucune connexion — tes pistes telechargees fonctionnent !' }}
            </p>
          </div>
        </div>
        <div class="text-right">
          <p class="font-bold text-yam-gold">{{ offline.count() }} piste{{ offline.count() > 1 ? 's' : '' }}</p>
          <p class="text-white/50 text-xs">en cache hors ligne</p>
        </div>
      </div>

      @if (offline.online() === false) {
        <div class="yam-card p-4 mb-6 border-yam-green/30 bg-yam-green/10">
          <p class="text-sm">
            🎧 <b>Mode hors ligne actif.</b> Appuie sur ▶ pour ecouter tes
            telechargements — aucune donnee mobile consommee.
          </p>
        </div>
      }

      <!-- Liste -->
      @if (offline.downloads().length === 0) {
        <div class="yam-card p-10 text-center">
          <p class="text-5xl mb-4">📥</p>
          <h2 class="yam-title text-xl mb-2">Aucune piste telechargee</h2>
          <p class="text-white/50 text-sm max-w-md mx-auto mb-6">
            Appuie sur l'icone 📥 d'une piste pour la telecharger en Data-Lite
            (48 kbps) et l'ecouter partout, meme sans connexion — dans le
            bus, en zone blanche, en voyage.
          </p>
          <a routerLink="/" class="yam-btn-primary inline-block">Decouvrir les pistes</a>
        </div>
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
          @for (d of offline.downloads(); track d.id) {
            <div class="yam-card p-4 group">
              <div class="relative mb-3 aspect-square rounded-xl bg-gradient-to-br from-yam-card to-yam-surface overflow-hidden flex items-center justify-center"
                   (click)="playDownloaded(d)">
                @if (d.coverUrl) {
                  <img [src]="d.coverUrl" [alt]="d.title" class="w-full h-full object-cover">
                } @else {
                  <span class="text-4xl opacity-40">🎵</span>
                }
                <span class="absolute top-2 left-2 text-xs bg-yam-green/90 text-white px-2 py-0.5 rounded-full font-bold">✅ Hors ligne</span>
                <button class="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-yam-orange text-white flex items-center justify-center text-lg shadow-lg"
                        (click)="playDownloaded(d)" title="Ecouter (marche hors ligne)">▶</button>
              </div>
              <p class="font-semibold truncate">{{ d.title }}</p>
              <p class="text-white/50 text-sm truncate">{{ d.artistName }}</p>
              <div class="flex items-center justify-between mt-2 text-xs">
                <span class="text-white/40">{{ player.formatTime(d.durationSec) }}</span>
                <button (click)="remove(d)" class="text-white/40 hover:text-red-400 transition"
                        title="Supprimer le telechargement">🗑</button>
              </div>
            </div>
          }
        </div>

        <!-- Stockage + purge -->
        <div class="yam-card p-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="min-w-0">
              <p class="font-bold mb-1">Stockage du telephone</p>
              <div class="w-56 h-2 bg-white/10 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-yam-orange to-yam-gold"
                     [style.width.%]="storagePercent()"></div>
              </div>
              <p class="text-white/50 text-xs mt-1">
                {{ offline.formatBytes(storage().usage) }} utilises par l'app
                @if (storage().quota) { / {{ offline.formatBytes(storage().quota) }} disponibles }
              </p>
            </div>
            <button (click)="purgeAll()" class="yam-btn-danger text-sm">
              Tout supprimer
            </button>
          </div>
        </div>
      }

      <!-- Aide installation PWA -->
      <div class="yam-card p-6 mt-8">
        <h3 class="yam-title text-lg mb-3">📱 Installer YAM DJ sur ton telephone</h3>
        <p class="text-white/50 text-sm mb-4">
          Installe l'application sur ton ecran d'accueil : elle s'ouvre
          instantanement, hors ligne, comme une vraie app — sans passer par
          le Play Store.
        </p>
        <div class="grid sm:grid-cols-2 gap-4 text-sm">
          <div class="bg-yam-surface rounded-xl p-4">
            <p class="font-bold text-yam-gold mb-2">🤖 Android (Chrome)</p>
            <ol class="text-white/60 space-y-1 list-decimal list-inside">
              <li>Ouvre le menu ⋮ de Chrome</li>
              <li>« Installer l'application »</li>
              <li>Confirme — icone ajoutee</li>
            </ol>
          </div>
          <div class="bg-yam-surface rounded-xl p-4">
            <p class="font-bold text-yam-gold mb-2">🍎 iPhone (Safari)</p>
            <ol class="text-white/60 space-y-1 list-decimal list-inside">
              <li>Appuie sur le bouton Partager</li>
              <li>« Sur l'ecran d'accueil »</li>
              <li>Appuie sur « Ajouter »</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DownloadsComponent implements OnInit {
  offline = inject(OfflineService);
  player = inject(PlayerService);
  auth = inject(AuthService);
  storage = signal<{ usage: number; quota: number }>({ usage: 0, quota: 0 });

  storagePercent = computed(() => {
    const { usage, quota } = this.storage();
    if (!quota) return 4;
    return Math.max(2, Math.min(100, Math.round(usage / quota * 100)));
  });

  ngOnInit(): void {
    this.offline.storageUsage().then(s => this.storage.set(s));
  }

  /** Lecture hors ligne : bypass API, URL cachee servie par le SW. */
  playDownloaded(d: DownloadedTrack): void {
    this.player.play({
      id: d.id,
      title: d.title,
      artistId: '',
      artistName: d.artistName,
      artistPseudo: d.artistName,
      coverUrl: d.coverUrl,
      audioUrlLq: d.audioUrlLq,
      audioUrlHq: d.audioUrlHq,
      durationSec: d.durationSec,
      playCount: 0,
      likeCount: 0,
      status: 'APPROVED',
      dataLiteReady: true,
      createdAt: d.downloadedAt
    });
  }

  async remove(d: DownloadedTrack): Promise<void> {
    await this.offline.removeDownload(d.id);
    const s = await this.offline.storageUsage();
    this.storage.set(s);
  }

  async purgeAll(): Promise<void> {
    await this.offline.purgeAll();
    const s = await this.offline.storageUsage();
    this.storage.set(s);
  }
}
