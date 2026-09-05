import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Track } from '../../models/models';
import { TrackService } from '../../services/track.service';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../icon/icon.component';

/** Domaine public du frontend — cible des liens de partage profonds. */
const SHARE_BASE_URL = 'https://yam-dj-frontend.vercel.app/track/';

/**
 * MODALE DE PARTAGE (V2 §13 P1) — piste complete OU EXTRAIT 30 s.
 * Reseaux priorises : WhatsApp, Instagram, TikTok, Facebook, X +
 * Web Share API (mobile) + copie de lien + envoi in-app a un ami.
 * Instagram/TikTok n'ont pas d'intent web de partage : le lien est copie
 * puis l'app s'ouvre — le colleur fait le reste (comportement standard).
 */
@Component({
  selector: 'yam-share-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    @if (visible() && track()) {
      <div class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" (click)="close.emit()">
        <div class="bg-yam-card rounded-3xl p-6 w-full max-w-md border border-white/10 max-h-[88vh] overflow-y-auto" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Partager">

          <div class="flex items-start justify-between mb-4">
            <div class="min-w-0">
              <p class="yam-kicker mb-1">{{ clip() ? 'Extrait 30 s' : 'Partage' }}</p>
              <h2 class="font-display font-bold text-xl leading-tight truncate">{{ track()?.title }}</h2>
              <p class="text-white/50 text-sm mt-0.5 truncate">— {{ track()?.artistName }}</p>
            </div>
            <button (click)="close.emit()" class="text-white/40 hover:text-white w-9 h-9 rounded-full flex items-center justify-center" aria-label="Fermer"><yam-icon name="x" [size]="20"/></button>
          </div>

          @if (clip()) {
            <div class="rounded-2xl border border-yam-orange/30 bg-yam-orange/5 p-4 mb-4 flex items-center gap-3">
              <span class="w-10 h-10 rounded-xl bg-yam-orange/15 text-yam-orange flex items-center justify-center shrink-0"><yam-icon name="scissors" [size]="18"/></span>
              <p class="text-sm text-white/70">
                Lien vers l'extrait <b class="yam-num text-yam-orange">{{ sec(clip()!.start) }} – {{ sec(clip()!.end) }}</b> :
                il démarre et s'arrête tout seul à l'ouverture.
              </p>
            </div>
          }

          <!-- Lien profond copiable -->
          <div class="bg-yam-surface rounded-2xl p-4 border border-white/10 mb-4">
            <div class="flex gap-2">
              <input #linkInput [value]="shareUrl()" readonly (click)="linkInput.select()"
                     class="yam-input !py-2.5 text-sm flex-1 truncate" aria-label="Lien de partage">
              <button (click)="copyLink()" class="yam-btn-primary !px-4 !py-2.5 text-sm shrink-0 inline-flex items-center gap-1.5">
                @if (copied()) { <yam-icon name="check" [size]="14"/> } @else { <yam-icon name="share" [size]="14"/> }
                {{ copied() ? 'Copie' : 'Copier' }}
              </button>
            </div>
            <p class="text-white/40 text-xs mt-2">
              @if (copied()) { Lien copié — colle-le où tu veux. }
              @else { Ce lien ouvre la page du son, même sans compte. }
            </p>
          </div>

          <!-- Web Share API (mobile) -->
          @if (canNativeShare()) {
            <button (click)="nativeShare()"
                    class="yam-btn-primary w-full !py-3 mb-4 inline-flex items-center justify-center gap-2">
              <yam-icon name="share" [size]="16"/> Partager depuis le téléphone
            </button>
          }

          <!-- Reseaux : priorite WhatsApp / Instagram / TikTok / Facebook / X -->
          <div class="grid grid-cols-5 gap-2 mb-4">
            <button (click)="shareWhatsApp()" class="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/8 hover:bg-[#25D366]/15 hover:border-[#25D366]/40 transition">
              <span class="w-9 h-9 rounded-full bg-[#25D366]/20 text-[#25D366] font-extrabold text-xs flex items-center justify-center">WA</span>
              <span class="text-[10px] font-semibold text-white/60">WhatsApp</span>
            </button>
            <button (click)="shareInstagram()" class="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/8 hover:bg-[#E1306C]/15 hover:border-[#E1306C]/40 transition">
              <span class="w-9 h-9 rounded-full bg-[#E1306C]/20 text-[#E1306C] font-extrabold text-xs flex items-center justify-center">IG</span>
              <span class="text-[10px] font-semibold text-white/60">Instagram</span>
            </button>
            <button (click)="shareTikTok()" class="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/10 transition">
              <span class="w-9 h-9 rounded-full bg-white/10 text-white font-extrabold text-xs flex items-center justify-center">TT</span>
              <span class="text-[10px] font-semibold text-white/60">TikTok</span>
            </button>
            <button (click)="shareFacebook()" class="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/8 hover:bg-[#1877F2]/15 hover:border-[#1877F2]/40 transition">
              <span class="w-9 h-9 rounded-full bg-[#1877F2]/20 text-[#4A9DFF] font-extrabold text-sm flex items-center justify-center">f</span>
              <span class="text-[10px] font-semibold text-white/60">Facebook</span>
            </button>
            <button (click)="shareX()" class="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/10 transition">
              <span class="w-9 h-9 rounded-full bg-white/10 text-white font-extrabold text-sm flex items-center justify-center">X</span>
              <span class="text-[10px] font-semibold text-white/60">X</span>
            </button>
          </div>
          @if (clip()) {
            <p class="text-white/35 text-xs mb-4 -mt-2">Instagram et TikTok : le lien est copié, colle-le dans ta story ou ta vidéo.</p>
          }

          <!-- Envoi IN-APP a un ami YAM DJ -->
          @if (auth.isLoggedIn()) {
            <div class="bg-yam-surface rounded-2xl p-4 border border-white/10">
              <p class="text-sm font-semibold mb-2 flex items-center gap-1.5"><yam-icon name="users" [size]="14" class="text-yam-orange"/> Envoyer a un ami YAM DJ</p>
              @if (sendState() === 'done') {
                <p class="text-yam-green text-sm">{{ sendMessage() }}</p>
              } @else {
                <div class="flex gap-2">
                  <input type="text" [(ngModel)]="friendPseudo" placeholder="Pseudo de ton ami"
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
        </div>
      </div>
    }
  `
})
export class ShareModalComponent {
  visible = input.required<boolean>();
  track = input<Track | null>(null);
  /** V2 P1 : extrait de 30 s {start, end} en secondes. */
  clip = input<{ start: number; end: number } | null>(null);
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
    if (!t) return '';
    const base = `${SHARE_BASE_URL}${t.slug || t.id}`;
    const c = this.clip();
    return c ? `${base}?clipStart=${c.start}&clipEnd=${c.end}` : base;
  });

  shareText = computed<string>(() => {
    const t = this.track();
    if (!t) return '';
    const c = this.clip();
    if (c) return `Ecoute l'extrait de 30 s de ${t.title} de ${t.artistName} sur YAM DJ ${this.shareUrl()}`;
    return `Ecoute ${t.title} de ${t.artistName} sur YAM DJ ${this.shareUrl()}`;
  });

  sec(s: number): string {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  }

  canNativeShare(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.share;
  }

  nativeShare(): void {
    const t = this.track();
    if (!t || !navigator.share) return;
    navigator.share({
      title: t.title,
      text: this.shareText(),
      url: this.shareUrl()
    }).catch(() => { /* annule par l'utilisateur */ });
    this.shared.emit('native');
  }

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

  /** Instagram : pas d'intent web -> copie + ouverture de l'app. */
  shareInstagram(): void {
    this.copyLink();
    this.openWindow('https://www.instagram.com/');
    this.shared.emit('instagram');
  }

  /** TikTok : pas d'intent web -> copie + ouverture de l'app. */
  shareTikTok(): void {
    this.copyLink();
    this.openWindow('https://www.tiktok.com/upload');
    this.shared.emit('tiktok');
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
