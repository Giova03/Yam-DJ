import { Component, inject, signal, OnInit } from '@angular/core';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { ArtistStats, TipHistory, Track } from '../../models/models';

/**
 * DASHBOARD ARTISTE : solde Orange Money, stats, historique des tips,
 * et notifications temps reel (WebSocket) quand un fan soutien l'artiste.
 */
@Component({
  selector: 'yam-dashboard',
  standalone: true,
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6">
      <h1 class="yam-title mb-2">📊 Dashboard Artiste</h1>
      <p class="text-white/50 text-sm mb-8">Tes revenus YAM Tips et ta performance.</p>

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
              @for (track of tracks(); track track) {
                <div class="yam-card p-4 flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-yam-orange/30 to-yam-gold/30 flex items-center justify-center shrink-0">🎵</div>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate">{{ track.title }}</p>
                    <p class="text-white/40 text-xs">{{ track.playCount }} ecoutes · {{ track.likeCount }} likes</p>
                  </div>
                  <span class="yam-badge"
                        [class]="track.status === 'APPROVED' ? '!bg-yam-green/20 !text-yam-green'
                          : (track.status === 'PENDING' ? '!text-yam-gold' : '!text-red-400')">
                    {{ track.status === 'APPROVED' ? '✔ En ligne' : (track.status === 'PENDING' ? '⏳ En validation' : '✖ Rejetee') }}
                  </span>
                </div>
              }
            </div>
          } @else {
            <div class="yam-card p-10 text-center text-white/40">
              <div class="text-4xl mb-2">🎙️</div>
              Aucune piste publiee. Clique sur "Upload" dans le menu !
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

  stats = signal<ArtistStats | null>(null);
  tips = signal<TipHistory[]>([]);
  tracks = signal<Track[]>([]);
  lastNotification = signal<{ amountXof: number } | null>(null);

  ngOnInit(): void {
    this.contentService.artistStats().subscribe({
      next: s => this.stats.set(s),
      error: () => {}
    });
    this.contentService.artistTips().subscribe({
      next: t => this.tips.set(t),
      error: () => {}
    });
    this.contentService.myTracks().subscribe({
      next: res => this.tracks.set(res.tracks || []),
      error: () => {}
    });

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
