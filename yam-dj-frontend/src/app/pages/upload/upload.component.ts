import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TrackService } from '../../services/track.service';

const GENRES = ['Afrobeats', 'Coupe-Decale', 'Rap', 'Zouglou', 'Ndombolo', 'Reggae', 'Dancehall', 'Traditionnel', 'Gospel', 'R&B', 'Pop'];
const COUNTRIES = ['Burkina Faso', "Cote d'Ivoire", 'Mali', 'Senegal', 'Guinee', 'Benin', 'Togo', 'Niger', 'Cameroun', 'RDC'];
const KEYS = ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B', '6A', '6B',
  '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B'];

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mp4', 'audio/aac', 'audio/ogg'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AUDIO_MB = 100;
const MAX_COVER_MB = 5;

@Component({
  selector: 'yam-upload',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-3xl mx-auto px-4 pt-6 pb-16">
      <h1 class="yam-title mb-2">🎵 Publier une piste</h1>
      <p class="text-white/50 text-sm mb-6">
        Ton son sera disponible apres validation par la moderation (protection des droits d'auteur).
      </p>

      @if (!canUpload()) {
        <div class="yam-card p-8 text-center">
          <div class="text-5xl mb-4">🎤</div>
          <h2 class="text-xl font-bold mb-2">Espace reserve aux artistes</h2>
          <p class="text-white/50 text-sm mb-6">
            Seuls les comptes artistes peuvent publier des pistes sur YAM DJ.
            Passe en compte artiste pour partager ta musique et toucher ton public.
          </p>
          <a routerLink="/dashboard" class="yam-btn-primary inline-block">Mon tableau de bord</a>
        </div>
      } @else if (done()) {
        <div class="yam-card p-10 text-center">
          <div class="text-6xl mb-4">🚀</div>
          <h2 class="text-2xl font-bold mb-2">Piste envoyee !</h2>
          <p class="text-white/50 text-sm mb-1">
            <b class="text-white">{{ uploadedTitle() }}</b> est en attente de validation.
          </p>
          <p class="text-white/40 text-xs mb-8">
            Tu peux suivre son statut (en attente / approuvee / rejetee) depuis ton tableau de bord.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <button (click)="reset()" class="yam-btn-primary">Publier une autre piste</button>
            <a routerLink="/dashboard" class="yam-btn-secondary">Voir mon tableau de bord</a>
          </div>
        </div>
      } @else {
        <div class="yam-card p-6 sm:p-8">
          <div class="grid sm:grid-cols-2 gap-4 mb-4">
            <div class="sm:col-span-2">
              <label class="text-sm text-white/60 mb-1 block">Titre de la piste *</label>
              <input type="text" [(ngModel)]="title" placeholder="Ex : Ouaga Flow" class="yam-input" maxlength="120">
            </div>
            <div>
              <label class="text-sm text-white/60 mb-1 block">Genre</label>
              <select [(ngModel)]="genre" class="yam-input">
                @for (g of genres; track g) { <option [value]="g">{{ g }}</option> }
              </select>
            </div>
            <div>
              <label class="text-sm text-white/60 mb-1 block">Pays</label>
              <select [(ngModel)]="country" class="yam-input">
                @for (c of countries; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </div>
            <div>
              <label class="text-sm text-white/60 mb-1 block">Tonalite (Camelot)</label>
              <select [(ngModel)]="musicalKey" class="yam-input">
                <option value="">-- Inconnue --</option>
                @for (k of keys; track k) { <option [value]="k">{{ k }}</option> }
              </select>
            </div>
            <div>
              <label class="text-sm text-white/60 mb-1 block">BPM</label>
              <input type="number" [(ngModel)]="bpm" placeholder="Ex : 105" class="yam-input" min="30" max="250">
            </div>
          </div>

          <!-- Fichier audio -->
          <div class="mb-4">
            <label class="text-sm text-white/60 mb-1 block">Fichier audio * (MP3, WAV, FLAC — max 100 Mo)</label>
            <label for="audio-file"
                   class="block border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all hover:border-yam-orange/60 hover:bg-yam-orange/5"
                   [class]="audioFile() ? 'border-yam-orange/60 bg-yam-orange/10' : 'border-white/15'">
              @if (audioFile()) {
                <div class="text-3xl mb-2">🎧</div>
                <p class="font-semibold truncate">{{ audioFile()!.name }}</p>
                <p class="text-white/40 text-xs mt-1">{{ audioSizeLabel() }} — clique pour changer</p>
              } @else {
                <div class="text-3xl mb-2">⬆️</div>
                <p class="text-white/60 text-sm">Depose ton fichier audio ou clique ici</p>
                <p class="text-white/30 text-xs mt-1">MP3, WAV, FLAC, AAC — 100 Mo max</p>
              }
              <input id="audio-file" type="file" class="hidden"
                     accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg"
                     (change)="onAudioSelected($event)">
            </label>
          </div>

          <!-- Pochette -->
          <div class="mb-6">
            <label class="text-sm text-white/60 mb-1 block">Pochette (optionnel — JPG, PNG, WebP — max 5 Mo)</label>
            <div class="flex items-center gap-4">
              @if (coverUrl()) {
                <img [src]="coverUrl()" alt="Pochette" class="w-16 h-16 rounded-xl object-cover border border-white/15">
              } @else {
                <div class="w-16 h-16 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center text-2xl">🖼️</div>
              }
              <label class="yam-badge cursor-pointer hover:bg-white/20">
                {{ coverFile() ? 'Changer la pochette' : 'Choisir une pochette' }}
                <input type="file" class="hidden" accept="image/jpeg,image/png,image/webp"
                       (change)="onCoverSelected($event)">
              </label>
              @if (coverFile()) {
                <button (click)="removeCover()" class="text-white/40 hover:text-red-400 text-sm transition">Retirer</button>
              }
            </div>
          </div>

          @if (error()) {
            <p class="text-red-400 text-sm bg-red-400/10 rounded-xl p-3 mb-4">{{ error() }}</p>
          }

          <button (click)="submit()" [disabled]="loading() || !audioFile() || !title.trim()"
                  class="yam-btn-primary w-full !py-3.5 text-lg">
            @if (loading()) {
              <span class="animate-pulse">Publication en cours... ne quitte pas la page</span>
            } @else {
              🚀 Publier ma piste
            }
          </button>
          <p class="text-white/30 text-xs text-center mt-3">
            En publiant, tu confirmes detenir les droits sur ce son. Revenus generes via pourboires Orange Money.
          </p>
        </div>
      }
    </div>
  `,
  styles: [`
    input[type="number"] { -moz-appearance: textfield; }
  `]
})
export class UploadComponent {
  private auth = inject(AuthService);
  private trackService = inject(TrackService);

  genres = GENRES;
  countries = COUNTRIES;
  keys = KEYS;

  title = '';
  genre = 'Afrobeats';
  country = 'Burkina Faso';
  musicalKey = '';
  bpm: number | null = null;

  audioFile = signal<File | null>(null);
  coverFile = signal<File | null>(null);
  coverUrl = signal<string | null>(null);

  loading = signal(false);
  error = signal<string | null>(null);
  done = signal(false);
  uploadedTitle = signal('');

  canUpload(): boolean {
    const role = this.auth.role();
    return role === 'ARTIST' || role === 'ADMIN';
  }

  audioSizeLabel(): string {
    const file = this.audioFile();
    if (!file) return '';
    const mb = file.size / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${Math.round(file.size / 1024)} Ko`;
  }

  onAudioSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set(null);
    if (!file) return;
    const typeOk = AUDIO_TYPES.includes(file.type) || /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(file.name);
    if (!typeOk) {
      this.error.set('Format audio non supporte. Utilise MP3, WAV, FLAC, M4A, AAC ou OGG.');
      input.value = '';
      return;
    }
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
      this.error.set(`Fichier trop lourd (${this.fmtSize(file.size)}). Maximum ${MAX_AUDIO_MB} Mo.`);
      input.value = '';
      return;
    }
    this.audioFile.set(file);
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      this.error.set('Pochette : formats acceptes JPG, PNG ou WebP.');
      input.value = '';
      return;
    }
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      this.error.set(`Pochette trop lourde (${this.fmtSize(file.size)}). Maximum ${MAX_COVER_MB} Mo.`);
      input.value = '';
      return;
    }
    if (this.coverUrl()) URL.revokeObjectURL(this.coverUrl()!);
    this.coverFile.set(file);
    this.coverUrl.set(URL.createObjectURL(file));
  }

  removeCover(): void {
    if (this.coverUrl()) URL.revokeObjectURL(this.coverUrl()!);
    this.coverFile.set(null);
    this.coverUrl.set(null);
  }

  submit(): void {
    this.error.set(null);
    if (!this.title.trim()) {
      this.error.set('Le titre est obligatoire.');
      return;
    }
    if (!this.audioFile()) {
      this.error.set('Le fichier audio est obligatoire.');
      return;
    }
    if (this.bpm !== null && (this.bpm < 30 || this.bpm > 250)) {
      this.error.set('Le BPM doit etre compris entre 30 et 250.');
      return;
    }

    const form = new FormData();
    form.append('title', this.title.trim());
    form.append('genre', this.genre);
    form.append('country', this.country);
    if (this.musicalKey) form.append('musicalKey', this.musicalKey);
    if (this.bpm !== null) form.append('bpm', String(this.bpm));
    form.append('audio', this.audioFile()!);
    if (this.coverFile()) form.append('cover', this.coverFile()!);

    this.loading.set(true);
    this.trackService.upload(form).subscribe({
      next: () => {
        this.loading.set(false);
        this.uploadedTitle.set(this.title.trim());
        this.done.set(true);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Erreur lors de la publication. Reessaie.');
      }
    });
  }

  reset(): void {
    this.title = '';
    this.genre = 'Afrobeats';
    this.country = 'Burkina Faso';
    this.musicalKey = '';
    this.bpm = null;
    this.removeCover();
    this.audioFile.set(null);
    this.done.set(false);
    this.error.set(null);
  }

  private fmtSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`;
  }
}
