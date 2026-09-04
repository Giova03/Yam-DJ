import { Component, OnDestroy, inject, signal, effect } from '@angular/core';
import { IconComponent } from '../../components/icon/icon.component';
import { FormsModule } from '@angular/forms';
import { PlayerService } from '../../services/player.service';
import { LocalLibraryService } from '../../services/local-library.service';
import { LocalFileTrack } from '../../models/models';

/**
 * MA MUSIQUE — les musiques du telephone/ordinateur, lues par YAM DJ.
 *
 * V2 :
 *  - AUTORISATION simple : un bouton « Autoriser mes musiques » ouvre le
 *    dossier Musiques (File System Access API) -> tout le dossier est
 *    scanne et affiche. Fallback webkitdirectory / selection multiple.
 *  - Lecture ARRIERE-PLAN : la lecture passe par le player GLOBAL
 *    (PlayerService) — on peut naviguer, verrouiller l'ecran, la musique
 *    continue (MediaSession : commandes sur l'ecran verrouille).
 *  - Metadonnees ID3 : titre/artiste/pochette lus localement.
 *  - Aucun envoi de fichier sur internet.
 */

interface ParsedTrack extends LocalFileTrack {
  parsed?: boolean;
}

/** Nettoie une valeur texte ID3. */
function cleanId3Text(raw: string): string {
  const text = raw.replace(/^\uFEFF/, '').split('\u0000')[0].replace(/\0+$/g, '').trim();
  if (!text) return '';
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) return '';
  return text;
}

/** Decode le contenu d'une frame texte ID3 selon son octet d'encodage. */
function decodeId3Text(data: Uint8Array): string {
  if (data.length < 2) return '';
  const enc = data[0];
  const body = data.subarray(1);
  let raw = '';
  try {
    if (enc === 1) {
      if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) {
        raw = new TextDecoder('utf-16le').decode(body.subarray(2));
      } else if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) {
        raw = new TextDecoder('utf-16be').decode(body.subarray(2));
      } else {
        raw = new TextDecoder('utf-16le').decode(body);
      }
    } else if (enc === 2) {
      raw = new TextDecoder('utf-16be').decode(body);
    } else if (enc === 3) {
      raw = new TextDecoder('utf-8').decode(body);
    } else {
      raw = new TextDecoder('windows-1252').decode(body);
    }
  } catch {
    return '';
  }
  return cleanId3Text(raw);
}

/** Identifie une image par ses octets magiques. */
function imageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return null;
}

/** Extrait les donnees image d'une frame APIC/PIC. */
function parseApic(data: Uint8Array, version: number): { bytes: Uint8Array; mime: string } | null {
  if (data.length < 6) return null;
  const enc = data[0];
  let pos = 1;
  if (version <= 2) {
    pos = 4;
  } else {
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++;
  }
  pos++;
  if (enc === 1 || enc === 2) {
    while (pos + 1 < data.length && !(data[pos] === 0 && data[pos + 1] === 0)) pos += 2;
    pos += 2;
  } else {
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++;
  }
  if (pos <= 0 || pos >= data.length) return null;
  const bytes = data.subarray(pos);
  if (bytes.length > 3 * 1024 * 1024) return null;
  const mime = imageMime(bytes);
  return mime ? { bytes, mime } : null;
}

/** Parseur ID3v2 minimal (titre, artiste, album, pochette). */
async function parseId3(file: File): Promise<Partial<LocalFileTrack>> {
  const result: Partial<LocalFileTrack> = {};
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head.length < 10) return result;
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return result;
    const version = head[3];
    const flags = head[5];
    const tagSize = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14)
      | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    if (tagSize <= 0) return result;
    if ((flags & 0x80) !== 0) return result;

    const total = Math.min(10 + tagSize, 1024 * 1024);
    const buf = new Uint8Array(await file.slice(0, total).arrayBuffer());

    const v22 = version <= 2;
    const idLen = v22 ? 3 : 4;
    const headerLen = v22 ? 6 : 10;

    let offset = 10;
    if (!v22 && (flags & 0x40) !== 0 && offset + 4 <= buf.length) {
      const extSize = version === 3
        ? buf[10] * 0x1000000 + buf[11] * 0x10000 + buf[12] * 0x100 + buf[13]
        : 4 + (((buf[10] & 0x7f) << 21) | ((buf[11] & 0x7f) << 14) | ((buf[12] & 0x7f) << 7) | (buf[13] & 0x7f));
      offset += extSize;
    }

    while (offset + headerLen <= buf.length) {
      const idBytes = buf.subarray(offset, offset + idLen);
      if (idBytes[0] === 0) break;
      let id = String.fromCharCode(idBytes[0], idBytes[1], idBytes[2]);
      if (!v22) id += String.fromCharCode(idBytes[3]);
      if (!/^[A-Z0-9]+$/.test(id)) break;

      let size = 0;
      if (v22) {
        size = buf[offset + 3] * 65536 + buf[offset + 4] * 256 + buf[offset + 5];
      } else if (version === 3) {
        size = buf[offset + 4] * 0x1000000 + buf[offset + 5] * 0x10000 + buf[offset + 6] * 0x100 + buf[offset + 7];
      } else {
        size = ((buf[offset + 4] & 0x7f) << 21) | ((buf[offset + 5] & 0x7f) << 14)
          | ((buf[offset + 6] & 0x7f) << 7) | (buf[offset + 7] & 0x7f);
      }
      const dataStart = offset + headerLen;
      if (size <= 0 || dataStart + size > buf.length) break;
      const data = buf.subarray(dataStart, dataStart + size);

      if (id === 'TIT2' || id === 'TT2') {
        const v = decodeId3Text(data);
        if (v) result.title = v;
      } else if (id === 'TPE1' || id === 'TP1') {
        const v = decodeId3Text(data);
        if (v) result.artist = v;
      } else if (id === 'TALB' || id === 'TAL') {
        const v = decodeId3Text(data);
        if (v) result.album = v;
      } else if ((id === 'APIC' || id === 'PIC') && !result.coverUrl) {
        const pic = parseApic(data, version);
        if (pic) result.coverUrl = URL.createObjectURL(new Blob([pic.bytes], { type: pic.mime }));
      }
      offset = dataStart + size;
    }
  } catch { /* fallback nom de fichier */ }
  return result;
}

@Component({
  selector: 'yam-local-page',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-12">

      <h1 class="yam-title mb-2"> Ma Musique</h1>
      <p class="text-white/50 text-sm mb-6">
        Tes musiques restent sur ton appareil — rien n'est envoye sur internet. Lecture en arriere-plan incluse.
      </p>

      @if (message(); as m) {
        <div class="yam-card p-3 mb-6 border-yam-orange/40 bg-yam-orange/10 flex items-center justify-between gap-3" role="alert">
          <p class="text-sm font-medium text-yam-orange"> {{ m }}</p>
          <button (click)="message.set('')" class="text-white/40 hover:text-white transition" aria-label="Fermer"></button>
        </div>
      }

      <!-- Permission a redemander (handle persiste) -->
      @if (lib.needsPermission()) {
        <div class="yam-card p-5 mb-6 text-center border-yam-gold/40 bg-yam-gold/5">
          <p class="font-semibold mb-2"> Reautorise l'acces a ton dossier « {{ lib.folderName() }} »</p>
          <p class="text-white/50 text-sm mb-4">Ton navigateur demande une confirmation a chaque session (protection de ta musique).</p>
          <button (click)="reauthorize()" class="yam-btn-primary">Reautoriser mes musiques</button>
        </div>
      }

      <!-- Etat vide initial : AUTORISATION en 1 clic -->
      @if (lib.tracks().length === 0) {
        <section class="yam-card p-10 text-center max-w-2xl mx-auto mb-8">
          <div class="text-6xl mb-4" aria-hidden="true"><yam-icon name="folder" [size]="28"/></div>
          <h2 class="text-2xl font-extrabold mb-3">Ta musique de telephone, dans YAM DJ</h2>
          <p class="text-white/50 mb-8 max-w-md mx-auto">
            Autorise l'acces a ton dossier Musiques une seule fois — YAM DJ affiche tous tes titres,
            avec pochettes. Tes fichiers ne quittent jamais ton appareil.
          </p>
          @if (lib.fsApiAvailable) {
            <button (click)="authorize()" class="yam-btn-primary text-lg !px-8 !py-3"> Autoriser mes musiques</button>
            <p class="text-white/30 text-xs mt-4">ou glisse-depose des fichiers plus bas</p>
          } @else {
            <div class="flex flex-col sm:flex-row gap-3 justify-center">
              <button (click)="dirInput.click()" class="yam-btn-primary text-lg !px-8 !py-3"> Choisir un dossier</button>
              <button (click)="fileInput.click()" class="yam-btn-secondary">Choisir des fichiers</button>
            </div>
          }
        </section>
      }

      <!-- Zone drag & drop + boutons -->
      <section (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)"
               [class]="dropZoneClass()" aria-label="Zone d'import de fichiers audio">
        <div class="text-4xl mb-3" aria-hidden="true"><yam-icon name="download" [size]="28"/></div>
        <p class="font-semibold mb-1">Glisse-depose tes musiques ici</p>
        <p class="text-white/40 text-sm mb-5 max-w-md mx-auto">Elles restent sur ton appareil, sans internet.</p>
        <div class="flex gap-3 justify-center flex-wrap">
          @if (lib.fsApiAvailable) {
            <button (click)="authorize()" class="yam-btn-secondary"> Autre dossier</button>
          }
          <button (click)="dirInput.click()" class="yam-btn-secondary hidden sm:block"> Dossier (compat.)</button>
          <button (click)="fileInput.click()" class="yam-btn-secondary"> Fichiers</button>
        </div>
        <input #dirInput type="file" webkitdirectory directory multiple class="hidden"
               (change)="onDirSelected($event)" aria-hidden="true" tabindex="-1">
        <input #fileInput type="file" accept="audio/*" multiple class="hidden"
               (change)="onFilesSelected($event)" aria-hidden="true" tabindex="-1">
      </section>

      @if (importing()) {
        <div class="flex items-center gap-2 text-white/50 text-sm mt-5" role="status">
          <span class="w-4 h-4 border-2 border-yam-orange border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
          Lecture des titres, artistes et pochettes... {{ parsedCount() }}/{{ lib.tracks().length }}
        </div>
      }

      <!-- Liste des pistes -->
      @if (lib.tracks().length) {
        <section class="mt-8">
          <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 class="text-xl font-bold">
              Mes pistes
              <span class="text-white/30 text-sm font-normal">
                {{ lib.tracks().length }} fichiers
                @if (lib.folderName()) { · {{ lib.folderName() }} }
              </span>
            </h2>
            <div class="flex gap-2 items-center">
              <button (click)="playAll()" class="yam-btn-primary !py-2 text-sm"> Tout ecouter</button>
              <button (click)="clearAll()" class="text-sm text-white/40 hover:text-red-400 transition"> Vider</button>
            </div>
          </div>

          <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilter()"
                 placeholder="Chercher dans mes musiques..." class="yam-input !py-2 mb-4">

          <div class="space-y-2">
            @for (t of filtered(); track t.id; let i = $index) {
              <div class="yam-card p-3 flex items-center gap-3 cursor-pointer hover:border-yam-orange/40"
                   (click)="playTrack(t)">
                @if (t.coverUrl) {
                  <img [src]="t.coverUrl" [alt]="t.title" class="w-14 h-14 rounded-lg object-cover shrink-0">
                } @else {
                  <div class="w-14 h-14 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center text-2xl shrink-0" aria-hidden="true"><yam-icon name="music-note" [size]="28"/></div>
                }
                <div class="min-w-0 flex-1">
                  <p class="font-semibold truncate" [class.text-yam-orange]="currentId() === ('local:' + t.id)">{{ t.title }}</p>
                  <p class="text-white/50 text-sm truncate">{{ t.artist }}</p>
                </div>
                @if (currentId() === ('local:' + t.id) && player.isPlaying()) {
                  <div class="flex items-end gap-[2px] h-4 w-[18px] shrink-0" aria-hidden="true">
                    <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
                  </div>
                }
                <button (click)="removeTrack(t); $event.stopPropagation()"
                        class="w-8 h-8 rounded-full text-white/30 hover:text-red-400 hover:bg-white/10 flex items-center justify-center shrink-0 transition"
                        [attr.aria-label]="'Retirer ' + t.title" title="Retirer de la liste"></button>
              </div>
            }
          </div>
        </section>
      }

      <p class="text-white/30 text-xs text-center mt-10">
        Hors ligne. La lecture continue en arriere-plan, meme ecran verrouille — geree par le lecteur global YAM DJ.
      </p>
    </div>
  `
})
export class LocalComponent implements OnDestroy {
  lib = inject(LocalLibraryService);
  player = inject(PlayerService);

  message = signal('');
  importing = signal(false);
  parsedCount = signal(0);
  dragOver = signal(false);
  search = '';
  filtered = signal<LocalFileTrack[]>([]);

  currentId(): string | null {
    return this.player.currentTrack()?.id || null;
  }

  constructor() {
    // Filtre initial
    this.applyFilter();
    // Parse ID3 en arriere-plan des que la bibliotheque change
    // (differe : applyFilter/parseMissing ecrivent des signaux -> NG0600 sinon)
    effect(() => {
      const list = this.lib.tracks();
      window.setTimeout(() => {
        this.applyFilter();
        this.parseMissing(list);
      }, 0);
    });
  }

  ngOnDestroy(): void { }

  /** Autorisation File System Access API. */
  async authorize(): Promise<void> {
    await this.lib.requestAccess();
    if (this.lib.tracks().length === 0 && this.lib.folderName()) {
      this.message.set('Aucun fichier audio trouve dans ce dossier.');
    }
  }

  async reauthorize(): Promise<void> {
    const ok = await this.lib.reauthorize();
    if (!ok) {
      this.message.set('Acces refuse — clique a nouveau pour reessayer.');
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files) return;
    this.lib.addFiles(input.files);
    input.value = '';
  }

  onDirSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files) return;
    this.lib.addFiles(input.files);
    if (input.webkitdirectory) {
      // nom du dossier (fallback)
      const path = (input as any).files[0]?.webkitRelativePath || '';
      const folder = path.split('/')[0];
      if (folder) this.lib.folderName.set(folder);
    }
    input.value = '';
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.dragOver.set(true); }
  onDragLeave(event: DragEvent): void { this.dragOver.set(false); }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (event.dataTransfer?.files?.length) {
      this.lib.addFiles(event.dataTransfer.files);
    }
  }

  dropZoneClass(): string {
    return this.dragOver()
      ? 'yam-card p-8 text-center mb-8 border-yam-orange/60 bg-yam-orange/10 border-dashed'
      : 'yam-card p-8 text-center mb-8 border-dashed';
  }

  applyFilter(): void {
    const q = this.search.trim().toLowerCase();
    if (!q) { this.filtered.set(this.lib.tracks()); return; }
    this.filtered.set(this.lib.tracks().filter(t =>
      t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)));
  }

  /** Parse les ID3 manquants (titre/artiste/pochette reels). */
  private parseMissing(list: LocalFileTrack[]): void {
    const missing = list.filter(t => (t as ParsedTrack).parsed !== true && t.file);
    if (!missing.length) return;
    this.importing.set(true);
    let done = 0;
    missing.slice(0, 60).forEach(async t => {
      const meta = await parseId3(t.file!);
      (t as ParsedTrack).parsed = true;
      if (meta.title) t.title = meta.title;
      if (meta.artist) t.artist = meta.artist;
      if (meta.album) t.album = meta.album;
      if (meta.coverUrl) t.coverUrl = meta.coverUrl;
      done++;
      this.parsedCount.set(done);
      if (done >= Math.min(missing.length, 60)) {
        this.importing.set(false);
        this.applyFilter();
      }
    });
  }

  playTrack(t: LocalFileTrack): void {
    this.player.playLocal(t, this.filtered().length > 1 ? this.filtered() : []);
  }

  playAll(): void {
    const list = this.filtered();
    if (list.length) this.player.playLocal(list[0], list);
  }

  removeTrack(t: LocalFileTrack): void {
    this.lib.removeTrack(t.id);
    this.applyFilter();
  }

  clearAll(): void {
    this.lib.clearAll();
    this.filtered.set([]);
  }
}
