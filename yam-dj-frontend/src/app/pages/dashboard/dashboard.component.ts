import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';
import { TrackService } from '../../services/track.service';
import { PlayerService } from '../../services/player.service';
import { WithdrawalService } from '../../services/withdrawal.service';
import { ArtistStats, TipHistory, Track, WithdrawalRequest } from '../../models/models';

/**
 * DASHBOARD ARTISTE : solde Orange Money, stats, historique des tips,
 * gestion de ses pistes (statut de moderation, lecture, suppression),
 * notifications temps reel (WebSocket) quand un fan soutien l'artiste
 * et demandes de retrait des gains vers mobile money.
 */
@Component({
  selector: 'yam-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule],
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

      <!-- 💸 Retraits (artiste / admin) -->
      @if (isArtistOrAdmin()) {
        <section class="mt-10">
          <h2 class="text-xl font-bold mb-4">💸 Retraits</h2>

          <!-- Ligne solde -->
          <div class="yam-card p-5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p class="text-white/50 text-sm">
                Solde disponible : <b class="text-yam-gold text-lg">{{ formatXof(balance()) }} F</b>
              </p>
              @if (balance() < minWithdrawXof) {
                <p class="text-xs text-white/30 mt-1">Minimum 5 000 F pour retirer tes gains.</p>
              }
            </div>
            <button (click)="openWithdrawModal()" [disabled]="balance() < minWithdrawXof"
                    [title]="balance() < minWithdrawXof ? 'Minimum 5 000 F' : 'Retirer mes gains'"
                    class="yam-btn-primary shrink-0">
              💸 Retirer mes gains
            </button>
          </div>

          <!-- Historique des demandes -->
          <h3 class="font-semibold mb-3 text-white/70">Mes demandes</h3>
          @if (withdrawals().length) {
            <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
              @for (w of withdrawals(); track w.id) {
                <div class="yam-card p-4">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p class="font-medium">{{ formatXof(w.amountXof) }} F</p>
                    <p class="text-white/40 text-sm">{{ w.operator }} · {{ w.phone }}</p>
                    <span class="yam-badge" [class]="withdrawBadgeClass(w.status)">{{ withdrawLabel(w.status) }}</span>
                    <span class="text-xs text-white/30 ml-auto">{{ formatDateFull(w.createdAt) }}</span>
                  </div>
                  @if (w.status === 'REJECTED' && w.adminNote) {
                    <p class="text-red-400/80 text-sm mt-2">Motif du refus : {{ w.adminNote }}</p>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="yam-card p-6 text-center text-white/40 text-sm">
              Aucune demande de retrait pour l'instant.
            </div>
          }
        </section>
      }

      <!-- Modale : demande de retrait -->
      @if (showWithdrawModal()) {
        <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" (click)="closeWithdrawModal()">
          <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10 max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h2 class="yam-title">💸 Retirer mes gains</h2>
                <p class="text-white/50 text-sm mt-1">Solde disponible : <b class="text-yam-gold">{{ formatXof(balance()) }} F</b></p>
              </div>
              <button (click)="closeWithdrawModal()" class="text-white/40 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div class="space-y-4">
              <div>
                <label for="w-amount" class="text-sm text-white/60 mb-1 block">Montant (F)</label>
                <input id="w-amount" type="number" class="yam-input" [(ngModel)]="wAmount"
                       [min]="minWithdrawXof" [max]="balance()" placeholder="Ex : 10000">
                <p class="text-xs text-white/30 mt-1">Entre {{ formatXof(minWithdrawXof) }} F et {{ formatXof(balance()) }} F.</p>
              </div>

              <div>
                <label for="w-operator" class="text-sm text-white/60 mb-1 block">Operateur mobile money</label>
                <select id="w-operator" class="yam-input" [(ngModel)]="wOperator">
                  <option class="bg-yam-surface" value="Orange Money">Orange Money</option>
                  <option class="bg-yam-surface" value="Moov Money">Moov Money</option>
                  <option class="bg-yam-surface" value="MTN MoMo">MTN MoMo</option>
                  <option class="bg-yam-surface" value="Wave">Wave</option>
                </select>
              </div>

              <div>
                <label for="w-phone" class="text-sm text-white/60 mb-1 block">Telephone du compte</label>
                <input id="w-phone" type="tel" class="yam-input" [(ngModel)]="wPhone" placeholder="70 00 00 00" maxlength="20">
              </div>

              @if (withdrawError()) {
                <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3">{{ withdrawError() }}</p>
              }

              <div class="flex gap-2">
                <button (click)="submitWithdrawal()" [disabled]="withdrawBusy() || !canSubmitWithdrawal()"
                        class="yam-btn-primary flex-1 !py-2.5 text-sm">
                  @if (withdrawBusy()) { <span class="animate-pulse">Envoi...</span> } @else { Envoyer la demande }
                </button>
                <button (click)="closeWithdrawModal()" class="yam-btn-secondary !py-2.5 text-sm">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private contentService = inject(ContentService);
  auth = inject(AuthService);
  private trackService = inject(TrackService);
  private player = inject(PlayerService);
  private withdrawalService = inject(WithdrawalService);

  stats = signal<ArtistStats | null>(null);
  tips = signal<TipHistory[]>([]);
  tracks = signal<Track[]>([]);
  lastNotification = signal<{ amountXof: number } | null>(null);

  // Gestion de la suppression des pistes (confirmation double clic)
  confirmDeleteId = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  loadError = signal(false);

  // ===== Section Retraits (mobile money) =====
  readonly minWithdrawXof = 5000;
  readonly balance = computed(() => this.stats()?.balanceXof || 0);
  withdrawals = signal<WithdrawalRequest[]>([]);
  showWithdrawModal = signal(false);
  withdrawBusy = signal(false);
  withdrawError = signal<string | null>(null);
  wAmount: number | null = null;
  wOperator = 'Orange Money';
  wPhone = '';

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

    // Historique des demandes de retrait (silencieux si erreur 403 / pas artiste)
    if (this.isArtistOrAdmin()) {
      this.loadWithdrawals();
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

  /** L'utilisateur connecte peut-il gerer des pistes / retraits ? */
  isArtistOrAdmin(): boolean {
    const role = this.auth.role();
    return role === 'ARTIST' || role === 'ADMIN';
  }

  /** Charge l'historique des demandes de retrait (silencieux en cas d'erreur). */
  loadWithdrawals(): void {
    this.withdrawalService.mine().subscribe({
      next: list => this.withdrawals.set(list || []),
      error: () => this.withdrawals.set([])
    });
  }

  /** Ouvre la modale de demande de retrait (montant pre-rempli au solde). */
  openWithdrawModal(): void {
    if (this.balance() < this.minWithdrawXof) return;
    this.wAmount = this.balance();
    this.wOperator = 'Orange Money';
    this.wPhone = '';
    this.withdrawError.set(null);
    this.showWithdrawModal.set(true);
  }

  closeWithdrawModal(): void {
    if (this.withdrawBusy()) return;
    this.showWithdrawModal.set(false);
    this.withdrawError.set(null);
  }

  /** Montant valide (min 5 000 F, max solde) + telephone renseigne. */
  canSubmitWithdrawal(): boolean {
    const amount = Number(this.wAmount);
    return !!this.wPhone.trim() && !!amount
      && amount >= this.minWithdrawXof && amount <= this.balance();
  }

  /** Envoie la demande de retrait puis recharge l'historique. */
  submitWithdrawal(): void {
    if (this.withdrawBusy() || !this.canSubmitWithdrawal()) return;
    this.withdrawBusy.set(true);
    this.withdrawError.set(null);
    this.withdrawalService.create(Number(this.wAmount), this.wOperator, this.wPhone.trim()).subscribe({
      next: () => {
        this.withdrawBusy.set(false);
        this.showWithdrawModal.set(false);
        this.showToast('Demande envoyee ! Validation sous 48 h.', 'ok');
        this.loadWithdrawals();
      },
      error: err => {
        this.withdrawBusy.set(false);
        this.withdrawError.set(err?.error?.message || 'Demande impossible. Verifie le montant et le numero.');
      }
    });
  }

  withdrawLabel(status: string): string {
    if (status === 'PENDING') return '⏳ En attente';
    if (status === 'APPROVED') return '✔ Paye';
    return '✖ Refuse';
  }

  withdrawBadgeClass(status: string): string {
    if (status === 'PENDING') return '!bg-yam-orange/20 !text-yam-orange';
    if (status === 'APPROVED') return '!bg-yam-green/20 !text-yam-green';
    return '!bg-red-400/20 !text-red-400';
  }

  formatDateFull(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
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
