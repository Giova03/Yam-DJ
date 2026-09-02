import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Track } from '../../models/models';
import { TrackService } from '../../services/track.service';
import { AuthService } from '../../services/auth.service';

/** Domaine public du frontend — cible des liens de partage profonds. */
const SHARE_BASE_URL = 'https://yam-dj-frontend.vercel.app/track/';

/**
 * MODALE DE PARTAGE SOCIAL d'une piste : lien profond copiable +
 * partage WhatsApp / Facebook / X. Utilisee depuis les cartes de pistes
 * (home, profil, artiste...) et la page publique /track/:id.
 */
@Component({
  selector: 'yam-share-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (visible() && track()) {
      <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" (click)="close.emit()">
        <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10" (click)="$event.stopPropagation()">

          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="yam-title">🔗 Partager la piste</h2>
              <p class="text-white/50 text-sm mt-1 truncate">
                <b class="text-white">{{ track()?.title }}</b> — {{ track()?.artistName }}
              </p>
            </div>
            <button (click)="close.emit()" class="text-white/40 hover:text-white text-2xl leading-none">×</button>
          </div>

          <!-- Lien profond copiable -->
          <div class="bg-yam-surface rounded-2xl p-4 border border-white/10 mb-4">
            <div class="flex gap-2">
              <input #linkInput [value]="shareUrl()" readonly (click)="linkInput.select()"
                     class="yam-input !py-2.5 text-sm flex-1 truncate" aria-label="Lien de la piste">
              <button (click)="copyLink()" class="yam-btn-primary !px-4 !py-2.5 text-sm shrink-0">
                @if (copied()) { ✓ } @else { 📋 Copier }
              </button>
            </div>
            @if (copied()) {
              <p class="text-yam-gold text-xs mt-2">✅ Lien copie ! Colle-le ou tu veux.</p>
            } @else {
              <p class="text-white/40 text-xs mt-2">Ce lien ouvre la page publique de la piste, meme sans compte.</p>
            }
          </div>

          <!-- Reseaux sociaux -->
          <div class="grid grid-cols-4 gap-2 mb-4">
            <button (click)="shareWhatsApp()"
                    class="yam-btn-secondary !px-2 !py-3 text-sm flex flex-col items-center gap-1 hover:!bg-[#25D366]/20">
              <span class="text-xl">💬</span> WhatsApp
            </button>
            <button (click)="shareTelegram()"
                    class="yam-btn-secondary !px-2 !py-3 text-sm flex flex-col items-center gap-1 hover:!bg-[#229ED9]/20">
              <span class="text-xl">✈️</span> Telegram
            </button>
            <button (click)="shareFacebook()"
                    class="yam-btn-secondary !px-2 !py-3 text-sm flex flex-col items-center gap-1 hover:!bg-[#1877F2]/20">
              <span class="text-xl">📘</span> Facebook
            </button>
            <button (click)="shareX()"
                    class="yam-btn-secondary !px-2 !py-3 text-sm flex flex-col items-center gap-1 hover:!bg-white/20">
              <span class="text-xl">✖️</span> X
            </button>
          </div>

          <!-- Envoi IN-APP a un ami YAM DJ -->
          @if (auth.isLoggedIn()) {
            <div class="bg-yam-surface rounded-2xl p-4 border border-white/10 mb-4">
              <p class="text-sm font-semibold mb-2">🎵 Envoyer a un ami YAM DJ</p>
              @if (sendState() === 'done') {
                <p class="text-yam-green text-sm">{{ sendMessage() }}</p>
              } @else {
                <div class="flex gap-2">
                  <input type="text" [(ngModel)]="friendPseudo" placeholder="Pseudo de ton ami (ex : faso-king)"
                         class="yam-input !py-2.5 text-sm flex-1">
                  <button (click)="sendToFriend()" [disabled]="sendState() === 'sending' || !friendPseudo.trim()"
                          class="yam-btn-primary !px-4 !py-2.5 text-sm shrink-0">
                    {{ sendState() === 'sending' ? '...' : 'Envoyer' }}
                  </button>
                </div>
                <input type="text" [(ngModel)]="friendMessage" placeholder="Petit mot (optionnel)..."
                       class="yam-input !py-2 text-sm mt-2">
                @if (sendState() === 'error') {
                  <p class="text-red-400 text-xs mt-2">{{ sendMessage() }}</p>
                } @else {
                  <p class="text-white/40 text-xs mt-2">Ton ami recevra une notification dans son application.</p>
                }
              }
            </div>
          }

          <p class="text-white/30 text-xs text-center">{{ shareText() }}</p>
        </div>
      </div>
    }
  `
})
export class ShareModalComponent {
  visible = input.required<boolean>();
  track = input<Track | null>(null);
  close = output<void>();
  shared = output<string>();

  private trackService = inject(TrackService);
  auth = inject(AuthService);

  friendPseudo = '';
  friendMessage = '';
  sendState = signal<'idle' | 'sending' | 'done' | 'error'>('idle');
  sendMessage = signal('');

  copied = signal<boolean>(false);
  private copiedTimer: any = null;

  shareUrl = computed<string>(() => {
    const t = this.track();
    return t ? `${SHARE_BASE_URL}${t.id}` : '';
  });

  /** Texte de partage : "Ecoute {titre} de {artiste} sur YAM DJ 🎧 {url}" */
  shareText = computed<string>(() => {
    const t = this.track();
    if (!t) return '';
    return `Ecoute ${t.title} de ${t.artistName} sur YAM DJ 🎧 ${this.shareUrl()}`;
  });

  copyLink(): void {
    const url = this.shareUrl();
    if (!url) return;
    const done = () => {
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {
        if (this.legacyCopy(url)) done();
      });
    } else if (this.legacyCopy(url)) {
      done();
    }
  }

  shareWhatsApp(): void {
    this.openWindow(`https://wa.me/?text=${encodeURIComponent(this.shareText())}`);
    this.shared.emit('whatsapp');
  }

  shareFacebook(): void {
    this.openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shareUrl())}`);
    this.shared.emit('facebook');
  }

  shareX(): void {
    this.openWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(this.shareText())}`);
    this.shared.emit('x');
  }

  shareTelegram(): void {
    this.openWindow(`https://t.me/share/url?url=${encodeURIComponent(this.shareUrl())}&text=${encodeURIComponent(this.shareText())}`);
    this.shared.emit('telegram');
  }

  /** Envoi in-app : le destinataire recoit une notification. */
  sendToFriend(): void {
    const t = this.track();
    const pseudo = this.friendPseudo.trim();
    if (!t || !pseudo) return;
    this.sendState.set('sending');
    this.trackService.shareTrack(t.id, pseudo, this.friendMessage.trim() || undefined).subscribe({
      next: res => {
        this.sendState.set('done');
        this.sendMessage.set(res?.message || `Son envoye a ${pseudo} !`);
        this.shared.emit('in-app');
      },
      error: err => {
        this.sendState.set('error');
        this.sendMessage.set(err?.error?.message || 'Envoi impossible — verifie le pseudo.');
      }
    });
  }

  private openWindow(url: string): void {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  /** Fallback pour navigateurs sans Clipboard API (contextes non securises). */
  private legacyCopy(text: string): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
