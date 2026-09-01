import { Component, computed, input, output, signal } from '@angular/core';
import { Track } from '../../models/models';

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
          <div class="grid grid-cols-3 gap-2 mb-4">
            <button (click)="shareWhatsApp()"
                    class="yam-btn-secondary !px-2 !py-3 text-sm flex flex-col items-center gap-1 hover:!bg-[#25D366]/20">
              <span class="text-xl">💬</span> WhatsApp
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
