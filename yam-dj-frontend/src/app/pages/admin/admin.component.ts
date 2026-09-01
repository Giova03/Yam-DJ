import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';
import { WithdrawalService } from '../../services/withdrawal.service';
import { Track, WithdrawalRequest } from '../../models/models';

/** Moderation admin : validation des pistes + demandes de retrait artistes. */
@Component({
  selector: 'yam-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="max-w-5xl mx-auto px-4 pt-6">
      <h1 class="yam-title mb-2">🛡️ Moderation YAM DJ</h1>
      <p class="text-white/50 text-sm mb-8">{{ pending() }} piste(s) en attente de validation.</p>

      <!-- Toast de confirmation -->
      @if (toast(); as t) {
        <div class="yam-card p-3 mb-6 flex items-center gap-2"
             [class]="t.kind === 'ok' ? 'border-yam-green/40 bg-yam-green/10' : 'border-red-400/40 bg-red-400/10'">
          <span>{{ t.kind === 'ok' ? '✔' : '✖' }}</span>
          <p class="text-sm font-medium" [class]="t.kind === 'ok' ? 'text-yam-green' : 'text-red-400'">{{ t.msg }}</p>
        </div>
      }

      @if (tracks().length) {
        <div class="space-y-3">
          @for (track of tracks(); track track) {
            <div class="yam-card p-5 flex items-center gap-4">
              <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xl shrink-0">🎵</div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold truncate">{{ track.title }}</p>
                <p class="text-white/40 text-sm">{{ track.genre }} · {{ track.country }} ·
                  {{ track.durationSec ? Math.floor(track.durationSec / 60) + ':' + (track.durationSec % 60).toString().padStart(2, '0') : '—' }}
                </p>
              </div>
              <div class="flex gap-2 shrink-0">
                <button (click)="approve(track)" class="yam-btn-primary !px-4 !py-2 text-sm bg-yam-green hover:bg-green-600">✔ Valider</button>
                <button (click)="reject(track)" class="yam-btn-secondary !px-4 !py-2 text-sm !bg-red-500/20 hover:!bg-red-500/30">✖ Rejeter</button>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="yam-card p-16 text-center">
          <div class="text-5xl mb-3">✨</div>
          <p class="text-white/50">File de moderation vide. Tout est propre !</p>
        </div>
      }

      <!-- 💸 Demandes de retrait -->
      <section class="mt-12">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h2 class="text-xl font-bold">💸 Demandes de retrait</h2>
          <button (click)="loadWithdrawals()" title="Rafraichir la file"
                  class="text-sm text-yam-orange hover:text-yam-gold transition font-medium">⟳ Rafraichir</button>
        </div>
        <p class="text-white/50 text-sm mb-4">{{ pendingWithdrawals() }} demande(s) en attente.</p>

        <!-- Filtres statut -->
        <div class="flex gap-2 mb-4 flex-wrap">
          <button (click)="setWithdrawFilter('ALL')" class="yam-badge cursor-pointer transition"
                  [class]="filterActive('ALL') ? '!bg-white/20 !text-white' : '!bg-white/5 !text-white/50 hover:!bg-white/10'">Tous</button>
          <button (click)="setWithdrawFilter('PENDING')" class="yam-badge cursor-pointer transition"
                  [class]="filterActive('PENDING') ? '!bg-yam-orange/30 !text-yam-orange' : '!bg-white/5 !text-white/50 hover:!bg-white/10'">⏳ En attente</button>
          <button (click)="setWithdrawFilter('APPROVED')" class="yam-badge cursor-pointer transition"
                  [class]="filterActive('APPROVED') ? '!bg-yam-green/30 !text-yam-green' : '!bg-white/5 !text-white/50 hover:!bg-white/10'">✔ Payes</button>
          <button (click)="setWithdrawFilter('REJECTED')" class="yam-badge cursor-pointer transition"
                  [class]="filterActive('REJECTED') ? '!bg-red-400/30 !text-red-400' : '!bg-white/5 !text-white/50 hover:!bg-white/10'">✖ Refuses</button>
        </div>

        @if (filteredWithdrawals().length) {
          <div class="space-y-3">
            @for (w of filteredWithdrawals(); track w.id) {
              <div class="yam-card p-5">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p class="font-semibold">{{ w.pseudo || 'Artiste' }}</p>
                  <p class="text-yam-gold font-bold">{{ formatXof(w.amountXof) }} F</p>
                  <p class="text-white/40 text-sm">{{ w.operator }} · {{ w.phone }}</p>
                  <span class="text-xs text-white/30">{{ formatDate(w.createdAt) }}</span>
                  <span class="yam-badge ml-auto" [class]="withdrawBadgeClass(w.status)">{{ withdrawLabel(w.status) }}</span>
                </div>

                @if (w.status === 'PENDING') {
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <button (click)="askApprove(w)" [disabled]="processingId() === w.id"
                            class="text-sm font-semibold px-4 py-2 rounded-full transition"
                            [class]="confirmWithdrawId() === w.id
                              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                              : 'bg-yam-green/20 text-yam-green hover:bg-yam-green/30'">
                      @if (processingId() === w.id) {
                        <span class="animate-pulse">⏳</span>
                      } @else if (confirmWithdrawId() === w.id) {
                        Confirmer ?
                      } @else {
                        ✅ Valider
                      }
                    </button>
                    @if (rejectingId() !== w.id) {
                      <button (click)="startReject(w)" [disabled]="processingId() === w.id"
                              class="text-sm font-semibold px-4 py-2 rounded-full bg-red-400/10 text-red-400 hover:bg-red-400/20 transition">❌ Rejeter</button>
                    }
                  </div>

                  @if (rejectingId() === w.id) {
                    <div class="mt-3 bg-yam-surface rounded-2xl p-4 border border-white/10 space-y-2">
                      <input [(ngModel)]="rejectNote" placeholder="Note admin (motif du refus)" class="yam-input" maxlength="200">
                      <div class="flex gap-2">
                        <button (click)="confirmReject(w)" [disabled]="processingId() === w.id"
                                class="yam-btn-primary !py-2 text-sm !bg-red-500 hover:!bg-red-600">
                          @if (processingId() === w.id) { <span class="animate-pulse">Envoi...</span> } @else { Confirmer le refus }
                        </button>
                        <button (click)="cancelReject()" class="yam-btn-secondary !py-2 text-sm">Annuler</button>
                      </div>
                    </div>
                  }
                }

                @if (w.status === 'REJECTED' && w.adminNote) {
                  <p class="text-red-400/80 text-sm mt-2">Motif : {{ w.adminNote }}</p>
                }
              </div>
            }
          </div>
        } @else {
          <div class="yam-card p-8 text-center text-white/40">
            Aucune demande dans ce filtre.
          </div>
        }
      </section>
    </div>
  `
})
export class AdminComponent implements OnInit {
  private contentService = inject(ContentService);
  private withdrawalService = inject(WithdrawalService);

  tracks = signal<Track[]>([]);
  pending = signal<number>(0);

  // ===== Demandes de retrait =====
  withdrawals = signal<WithdrawalRequest[]>([]);
  withdrawFilter = signal<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  filteredWithdrawals = computed(() => {
    const f = this.withdrawFilter();
    return f === 'ALL' ? this.withdrawals() : this.withdrawals().filter(w => w.status === f);
  });
  pendingWithdrawals = computed(() => this.withdrawals().filter(w => w.status === 'PENDING').length);
  confirmWithdrawId = signal<string | null>(null);
  rejectingId = signal<string | null>(null);
  rejectNote = '';
  processingId = signal<string | null>(null);

  toast = signal<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  private toastTimer: any = null;
  private confirmTimer: any = null;

  ngOnInit(): void {
    this.load();
    this.loadWithdrawals();
  }

  load(): void {
    this.contentService.pendingTracks().subscribe({
      next: res => {
        this.tracks.set(res.tracks || []);
        this.pending.set(res.tracks?.length || 0);
      },
      error: () => {}
    });
  }

  approve(track: Track): void {
    this.contentService.approveTrack(track.id).subscribe(() => this.load());
  }

  reject(track: Track): void {
    this.contentService.rejectTrack(track.id).subscribe(() => this.load());
  }

  /** Charge la file complete des demandes de retrait. */
  loadWithdrawals(): void {
    this.withdrawalService.all().subscribe({
      next: list => this.withdrawals.set(list || []),
      error: () => this.withdrawals.set([])
    });
  }

  setWithdrawFilter(f: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'): void {
    this.withdrawFilter.set(f);
  }

  filterActive(f: string): boolean {
    return this.withdrawFilter() === f;
  }

  /**
   * Validation d'un retrait a double confirmation :
   * 1er clic -> arme le bouton ("Confirmer ?" en rouge), 2e clic -> execute.
   * Armement auto-annule apres 4 s.
   */
  askApprove(w: WithdrawalRequest): void {
    if (this.processingId()) return;
    if (this.confirmWithdrawId() === w.id) {
      this.confirmWithdrawId.set(null);
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      this.approveWithdrawal(w);
    } else {
      this.confirmWithdrawId.set(w.id);
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => this.confirmWithdrawId.set(null), 4000);
    }
  }

  private approveWithdrawal(w: WithdrawalRequest): void {
    this.processingId.set(w.id);
    this.withdrawalService.approve(w.id).subscribe({
      next: () => {
        this.processingId.set(null);
        this.showToast('Retrait valide, solde debite', 'ok');
        this.loadWithdrawals();
      },
      error: err => {
        this.processingId.set(null);
        this.showToast(err?.error?.message || 'Validation impossible. Reessaie.', 'err');
      }
    });
  }

  /** Refus : affiche la zone de note puis confirmation. */
  startReject(w: WithdrawalRequest): void {
    this.confirmWithdrawId.set(null);
    this.rejectingId.set(w.id);
    this.rejectNote = '';
  }

  cancelReject(): void {
    this.rejectingId.set(null);
    this.rejectNote = '';
  }

  confirmReject(w: WithdrawalRequest): void {
    if (this.processingId()) return;
    this.processingId.set(w.id);
    this.withdrawalService.reject(w.id, this.rejectNote.trim() || undefined).subscribe({
      next: () => {
        this.processingId.set(null);
        this.rejectingId.set(null);
        this.rejectNote = '';
        this.showToast('Demande refusee', 'ok');
        this.loadWithdrawals();
      },
      error: err => {
        this.processingId.set(null);
        this.showToast(err?.error?.message || 'Refus impossible. Reessaie.', 'err');
      }
    });
  }

  private showToast(msg: string, kind: 'ok' | 'err'): void {
    this.toast.set({ msg, kind });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
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

  formatXof(n: number): string {
    return (n || 0).toLocaleString('fr-FR');
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  Math = Math;
}
