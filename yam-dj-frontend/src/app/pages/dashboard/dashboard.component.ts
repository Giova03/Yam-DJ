import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { TrackService } from '../../services/track.service';
import { PlayerService } from '../../services/player.service';
import { ArtistStats, TipHistory, Track } from '../../models/models';

/**
 * DASHBOARD ARTISTE : solde Orange Money, stats, historique des tips,
 * gestion de ses pistes (statut de moderation, lecture, suppression)
 * et notifications temps reel (WebSocket) quand un fan soutien l'artiste.
 */
@Component({
  selector: 'yam-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">
      <h1 class="yam-title mb-2">📊 Dashboard Artiste</h1>
      <p class="text-white/50 text-sm mb-8">Tes revenus YAM Tips et ta performance.</p>

      <!-- Toast de confirmation -->
      @if (toast(); as t) {
        <div class="yam-card p-3 mb-6 flex items-center gap-2"
             [class]="t.kind === 'ok' ? 'border-yam-green/40 bg-yam-green/10' : 'border-red-400/40 bg-red-400/10'">
          <span>{{ t.kind === 'ok' ? '✔' : '✖' }}</span>
          <p class="text-sm font-medium" [class]="t.kind === 'ok' ? 'text-yam-green' : 'text-red-400'">{{ t.msg }}</p>
        </div>
      }

      <!-- Stats cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div class="yam-card p-5">
          <p class="text-white/50 text-sm mb-1">💰 Solde YAM Tips</p>
          <p class="text-3xl font-extrabold text-yam-gold">{{ formatXof(stats()?.balanceXof || 0) }}</p>
          <p class="text-xs text-white/30 mt-1">FCFA disponibles pour retrait</p>
        </div>
        <div class="yam-card p-5">
          <p class="text-white/50 text-sm mb-1">🎧 Total ecoutes</p>
          <p class="text-3xl font-extrabold">{{ formatNumber(stats()?.totalPlays || 0) }}</p>
        </div>
        <div class="yam-card p-5">
          <p class="text-white/50 text-sm mb-1">🎵 Pistes en ligne</p>
          <p class="text-3xl font-extrabold">{{ stats()?.tracksCount || 0 }}</p>
        </div>
        <div class="yam-card p-5">
          <p class="text-white/50 text-sm mb-1">❤️ Tips recus</p>
          <p class="text-3xl font-extrabold">{{ stats()?.tipsCount || 0 }}</p>
          <p class="text-xs text-white/30 mt-1">{{ formatXof(stats()?.totalTipsXof || 0) }} FCFA cumules</p>
        </div>
      </div>

      @if (lastNotification()) {
        <div class="yam-card p-4 mb-6 border-yam-gold/50 bg-yam-gold/10 flex items-center gap-3">
          <span class="text-2xl">🔔</span>
          <p class="text-yam-gold font-medium">Nouveau tip recu : {{ formatXof(lastNotification()!.amountXof) }} FCFA !</p>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

        <!-- Mes pistes -->
        <section>
          <h2 class="text-xl font-bold mb-4">🎵 Mes pistes</h2>
          @if (tracks().length) {
            <div class="space-y-2">
              @for (track of tracks(); track track.id) {
                <div class="yam-card p-4 flex items-center gap-3">
                  <!-- Pochette (fallback degrade) -->
                  @if (track.coverUrl) {
                    <img [src]="track.coverUrl" [alt]="track.title"
                         class="w-14 h-14 rounded-lg object-cover shrink-0">
                  } @else {
                    <div class="w-14 h-14 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center text-xl shrink-0">🎵</div>
                  }

                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate">{{ track.title }}</p>
                    <p class="text-white/40 text-xs truncate">
                      @if (track.genre) { {{ track.genre }} }
                      @if (track.country) { · {{ track.country }} }
                      @if (track.bpm) { · {{ track.bpm }} BPM }
                      @if (track.camelot || track.musicalKey) { · 🎹 {{ track.camelot || track.musicalKey }} }
                    </p>
                    <p class="text-white/40 text-xs">🎧 {{ formatNumber(track.playCount) }} ecoutes · ❤️ {{ formatNumber(track.likeCount) }}</p>
                  </div>

                  <!-- Badge de statut de moderation -->
                  <span class="yam-badge shrink-0" [class]="statusBadgeClass(track.status)">
                    {{ statusLabel(track.status) }}
                  </span>

                  <!-- Lecture (pistes en ligne uniquement) -->
                  @if (track.status === 'APPROVED') {
                    <button (click)="playTrack(track)" title="Ecouter"
                            class="w-9 h-9 rounded-full bg-yam-orange/20 text-yam-orange flex items-center justify-center hover:bg-yam-orange hover:text-white transition shrink-0">▶</button>
                  }

                  <!-- Suppression : 1er clic = armement, 2e clic = confirmation -->
                  <button (click)="askDelete(track)" [disabled]="deletingId() === track.id" title="Supprimer la piste"
                          class="shrink-0 text-xs font-semibold px-3 py-2 rounded-full transition"
                          [class]="confirmDeleteId() === track.id
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'text-white/40 hover:text-red-400 hover:bg-red-400/10'">
                    @if (deletingId() === track.id) {
                      <span class="animate-pulse">⏳</span>
                    } @else if (confirmDeleteId() === track.id) {
                      Confirmer ?
                    } @else {
                      Supprimer
                    }
                  </button>
                </div>
              }
            </div>
            <p class="text-white/30 text-xs mt-3">Astuces : "Supprimer" demande un double clic pour eviter les suppressions accidentelles.</p>
          } @else if (loadError()) {
            <div class="yam-card p-6 text-center text-white/40 text-sm">
              ⚠️ Impossible de charger tes pistes pour le moment. Reviens plus tard.
            </div>
          } @else {
            <div class="yam-card p-10 text-center text-white/40">
              <div class="text-4xl mb-2">🎙️</div>
              <p class="mb-4">Aucune piste pour l'instant</p>
              <a routerLink="/upload" class="yam-btn-primary inline-block">Publier ma premiere piste</a>
            </div>
          }
        </section>

        <!-- Historique tips -->
        <section>
          <h2 class="text-xl font-bold mb-4">💰 Historique des YAM Tips</h2>
          @if (tips().length) {
            <div class="space-y-2">
              @for (tip of tips(); track tip.id) {
                <div class="yam-card p-4 flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-yam-gold/20 flex items-center justify-center text-yam-gold shrink-0">💰</div>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium">{{ formatXof(tip.amountXof) }} FCFA
                      <span class="text-white/40 font-normal text-sm">de {{ tip.fanPseudo }}</span>
                    </p>
                    @if (tip.message) { <p class="text-white/40 text-sm italic truncate">"{{ tip.message }}"</p> }
                  </div>
                  <span class="text-xs text-white/30 shrink-0">{{ formatDate(tip.createdAt) }}</span>
                </div>
              }
            </div>
          } @else {
            <div class="yam-card p-10 text-center text-white/40">
              <div class="text-4xl mb-2">💸</div>
              Aucun tip pour l'instant. Partage ton profil artiste !
            </div>
          }
        </section>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private contentService = inject(ContentService);
  private auth = inject(AuthService);
  private trackService = inject(TrackService);
  private player = inject(PlayerService);

  stats = signal<ArtistStats | null>(null);
  tips = signal<TipHistory[]>([]);
  tracks = signal<Track[]>([]);
  lastNotification = signal<{ amountXof: number } | null>(null);

  // Gestion de la suppression des pistes (confirmation double clic)
  confirmDeleteId = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  loadError = signal(false);

  toast = signal<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  private toastTimer: any = null;
  private confirmTimer: any = null;

  ngOnInit(): void {
    this.contentService.artistStats().subscribe({
      next: s => this.stats.set(s),
      error: () => {}
    });
    this.contentService.artistTips().subscribe({
      next: t => this.tips.set(t),
      error: () => {}
    });

    // Mes pistes : tous statuts confondus (PENDING / APPROVED / REJECTED)
    if (this.auth.role() === 'ARTIST' || this.auth.role() === 'ADMIN') {
      this.loadMyTracks();
    }

    // Polling des notifications (complement WebSocket)
    setInterval(() => {
      this.contentService.artistTips(1).subscribe({
        next: tips => {
          const latest = tips[0];
          if (latest && !this.tips().find(t => t.id === latest.id)) {
            this.tips.set([latest, ...this.tips()]);
            this.lastNotification.set({ amountXof: latest.amountXof });
            if (this.stats()) {
              const s = { ...this.stats()! };
              s.balanceXof += latest.amountXof;
              s.tipsCount += 1;
              this.stats.set(s);
            }
          }
        },
        error: () => {}
      });
    }, 30000);
  }

  /** Charge les pistes de l'artiste connecte (endpoint /api/tracks/mine). */
  loadMyTracks(): void {
    this.loadError.set(false);
    this.trackService.getMyTracks().subscribe({
      next: list => this.tracks.set(list || []),
      error: () => this.loadError.set(true)
    });
  }

  /** Lecture d'une piste via le player global (file = pistes en ligne). */
  playTrack(track: Track): void {
    this.player.play(track, this.tracks().filter(t => t.status === 'APPROVED'));
  }

  /**
   * Suppression a double confirmation :
   * 1er clic -> arme le bouton ("Confirmer ?" en rouge), 2e clic -> execute.
   * Retour au 1er clic sur une autre piste, armement auto-annule apres 4 s.
   */
  askDelete(track: Track): void {
    if (this.deletingId()) return;
    if (this.confirmDeleteId() === track.id) {
      this.confirmDeleteId.set(null);
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      this.deleteTrack(track);
    } else {
      this.confirmDeleteId.set(track.id);
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => this.confirmDeleteId.set(null), 4000);
    }
  }

  private deleteTrack(track: Track): void {
    this.deletingId.set(track.id);
    this.trackService.deleteTrack(track.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.tracks.set(this.tracks().filter(t => t.id !== track.id));
        this.showToast('Piste supprimee', 'ok');
      },
      error: err => {
        this.deletingId.set(null);
        this.showToast(err?.error?.message || 'Echec de la suppression', 'err');
      }
    });
  }

  private showToast(msg: string, kind: 'ok' | 'err'): void {
    this.toast.set({ msg, kind });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }

  statusLabel(status: string): string {
    if (status === 'APPROVED') return '✔ En ligne';
    if (status === 'PENDING') return '⏳ En moderation';
    return '✖ Refuse';
  }

  statusBadgeClass(status: string): string {
    if (status === 'APPROVED') return '!bg-yam-green/20 !text-yam-green';
    if (status === 'PENDING') return '!bg-yam-orange/20 !text-yam-orange';
    return '!bg-red-400/20 !text-red-400';
  }

  formatXof(amount: number): string {
    return amount.toLocaleString('fr-FR');
  }

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
}
