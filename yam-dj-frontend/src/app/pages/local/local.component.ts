import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { PlayerService } from '../../services/player.service';

/**
 * MA MUSIQUE — lecture des fichiers audio LOCAUX du telephone / ordinateur.
 * 100% cote client : aucun HTTP, aucun envoi de fichier sur internet.
 *
 * - Import par selecteur de fichiers ou drag & drop
 * - Parseur ID3v2 (titre / artiste / album / annee / pochette APIC)
 * - Lecteur local dedie (distinct du PlayerService global, reserve au streaming)
 * - MediaSession API : commandes de l'ecran verrouille du telephone
 */

/** Piste audio locale (fichier du telephone / ordinateur). */
interface LocalTrack {
  id: string;
  file: File;
  url: string;       // URL.createObjectURL(file)
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  duration: number;  // secondes (0 tant que la metadonnee n'est pas chargee)
  year?: string;     // annee lue dans TDRC / TYER (affichage seul)
}

/** Nettoie une valeur texte ID3 (retire les \0 finaux, rejette les valeurs aberrantes). */
function cleanId3Text(raw: string): string {
  const text = raw.replace(/^\uFEFF/, '').split('\u0000')[0].replace(/\0+$/g, '').trim();
  if (!text) return '';
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) return ''; // frame mal lue : on ignore
  return text;
}

/** Decode le contenu d'une frame texte ID3 selon son octet d'encodage (0..3). */
function decodeId3Text(data: Uint8Array): string {
  if (data.length < 2) return '';
  const enc = data[0];
  const body = data.subarray(1);
  let raw = '';
  try {
    if (enc === 1) {
      // UTF-16 avec BOM
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
      // 0 = ISO-8859-1 (approxime par windows-1252, super-ensemble)
      raw = new TextDecoder('windows-1252').decode(body);
    }
  } catch {
    return ''; // encodage non supporte par le navigateur
  }
  return cleanId3Text(raw);
}

/** Identifie une image par ses octets magiques (JPEG, PNG, GIF, WebP, BMP). */
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

/** Extrait les donnees image d'une frame APIC (v2.3/v2.4) ou PIC (v2.2). */
function parseApic(data: Uint8Array, version: number): { bytes: Uint8Array; mime: string } | null {
  if (data.length < 6) return null;
  const enc = data[0];
  let pos = 1;
  if (version <= 2) {
    // ID3v2.2 : format image sur 3 caracteres ("JPG", "PNG") — pas de mime complet
    pos = 4;
  } else {
    // mime type jusqu'au \0
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++; // \0 de fin de mime
  }
  pos++; // type d'image (1 octet)
  // description : terminee par \0, ou \0\0 si encodage UTF-16 (1 ou 2)
  if (enc === 1 || enc === 2) {
    while (pos + 1 < data.length && !(data[pos] === 0 && data[pos + 1] === 0)) pos += 2;
    pos += 2;
  } else {
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++;
  }
  if (pos <= 0 || pos >= data.length) return null;
  const bytes = data.subarray(pos);
  if (bytes.length > 3 * 1024 * 1024) return null; // pochette trop lourde : ignoree
  const mime = imageMime(bytes);
  return mime ? { bytes, mime } : null;
}

/**
 * Parseur ID3v2 minimal (lecture seule) : titre, artiste, album, annee, pochette.
 * - v2.2 : frames 3 caracteres, taille 3 octets
 * - v2.3 : frames 4 caracteres, taille 4 octets non synchsafe
 * - v2.4 : frames 4 caracteres, taille 4 octets SYNCHSAFE
 * Si le tag est absent, corrompu ou unsynchronise -> objet vide et l'appelant
 * retombe sur le nom de fichier ("Artiste - Titre" si le nom contient " - ").
 */
async function parseId3(file: File): Promise<Partial<LocalTrack>> {
  const result: Partial<LocalTrack> = {};
  try {
    // Header 10 octets : magic "ID3" ?
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head.length < 10) return result;
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return result; // pas de tag ID3
    const version = head[3]; // version majeure (2, 3 ou 4)
    const flags = head[5];
    const tagSize = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14)
      | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f); // taille synchsafe
    if (tagSize <= 0) return result;
    if ((flags & 0x80) !== 0) return result; // unsynchronisation : abandon propre (fallback nom de fichier)

    // Lecture bornee du tag : slice(0, 10 + tagSize), cap a 1 Mo
    const total = Math.min(10 + tagSize, 1024 * 1024);
    const buf = new Uint8Array(await file.slice(0, total).arrayBuffer());

    const v22 = version <= 2;
    const idLen = v22 ? 3 : 4;         // taille de l'identifiant de frame
    const headerLen = v22 ? 6 : 10;    // header de frame (id + taille [+ 2 octets flags en v2.3/2.4])

    let offset = 10;
    // Extended header (flag 0x40) : on le saute
    if (!v22 && (flags & 0x40) !== 0 && offset + 4 <= buf.length) {
      const extSize = version === 3
        ? buf[10] * 0x1000000 + buf[11] * 0x10000 + buf[12] * 0x100 + buf[13]
        : 4 + (((buf[10] & 0x7f) << 21) | ((buf[11] & 0x7f) << 14) | ((buf[12] & 0x7f) << 7) | (buf[13] & 0x7f));
      offset += extSize;
    }

    // Boucle sur les frames
    while (offset + headerLen <= buf.length) {
      const idBytes = buf.subarray(offset, offset + idLen);
      if (idBytes[0] === 0) break; // padding : fin du tag
      let id = String.fromCharCode(idBytes[0], idBytes[1], idBytes[2]);
      if (!v22) id += String.fromCharCode(idBytes[3]);
      if (!/^[A-Z0-9]+$/.test(id)) break; // frame invalide : fin du parse

      // Taille de la frame
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

      // Frames texte : TIT2/TT2 (titre), TPE1/TP1 (artiste), TALB/TAL (album), TDRC/TYER/TYE (annee)
      if (id === 'TIT2' || id === 'TT2') {
        const v = decodeId3Text(data);
        if (v) result.title = v;
      } else if (id === 'TPE1' || id === 'TP1') {
        const v = decodeId3Text(data);
        if (v) result.artist = v;
      } else if (id === 'TALB' || id === 'TAL') {
        const v = decodeId3Text(data);
        if (v) result.album = v;
      } else if (id === 'TDRC' || id === 'TYER' || id === 'TYE') {
        const v = decodeId3Text(data);
        const yearMatch = v.match(/\d{4}/);
        if (yearMatch) result.year = yearMatch[0];
      } else if ((id === 'APIC' || id === 'PIC') && !result.coverUrl) {
        const pic = parseApic(data, version);
        if (pic) result.coverUrl = URL.createObjectURL(new Blob([pic.bytes], { type: pic.mime }));
      }

      offset = dataStart + size;
    }
  } catch {
    // tag illisible : on rend ce qui a ete trouve (souvent rien) -> fallback nom de fichier
  }
  return result;
}

@Component({
  selector: 'yam-local-page',
  standalone: true,
  imports: [],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-10">

      <!-- En-tete -->
      <h1 class="yam-title mb-2">📂 Ma Musique</h1>
      <p class="text-white/50 text-sm mb-8">
        Les musiques de ton telephone, lues directement par YAM DJ. Sans internet, sans envoi de fichiers.
      </p>

      <!-- Message (erreur / info) -->
      @if (message(); as m) {
        <div class="yam-card p-3 mb-6 border-yam-orange/40 bg-yam-orange/10 flex items-center justify-between gap-3" role="alert">
          <p class="text-sm font-medium text-yam-orange">⚠️ {{ m }}</p>
          <button (click)="message.set('')" class="text-white/40 hover:text-white transition" aria-label="Fermer le message">✕</button>
        </div>
      }

      <!-- Etat vide initial -->
      @if (localTracks().length === 0) {
        <section class="yam-card p-10 text-center max-w-2xl mx-auto mb-8">
          <div class="text-6xl mb-4" aria-hidden="true">📂</div>
          <h2 class="text-2xl font-extrabold mb-3">Ta musique de telephone, dans YAM DJ</h2>
          <p class="text-white/50 mb-8">
            Selectionne les musiques de ton telephone - elles restent sur ton appareil,
            rien n'est envoye sur internet.
          </p>
          <button (click)="fileInput.click()" class="yam-btn-primary text-lg !px-8 !py-3">🎵 Choisir mes musiques</button>
        </section>
      }

      <!-- Zone d'import drag & drop -->
      <section (dragover)="onDragOver($event)"
               (dragleave)="onDragLeave($event)"
               (drop)="onDrop($event)"
               [class]="dropZoneClass()"
               aria-label="Zone d'import de fichiers audio">
        <div class="text-4xl mb-3" aria-hidden="true">📥</div>
        <p class="font-semibold mb-1">Glisse-depose tes musiques ici</p>
        <p class="text-white/40 text-sm mb-5 max-w-md mx-auto">
          Selectionne les musiques de ton telephone - elles restent sur ton appareil,
          rien n'est envoye sur internet.
        </p>
        <button (click)="fileInput.click()" class="yam-btn-secondary">📱 Choisir des fichiers</button>
        <input #fileInput type="file" accept="audio/*" multiple class="hidden"
               (change)="onFilesSelected($event)" aria-hidden="true" tabindex="-1">
      </section>

      <!-- Chargement des metadonnees (ID3) -->
      @if (importing()) {
        <div class="flex items-center gap-2 text-white/50 text-sm mt-5" role="status">
          <span class="w-4 h-4 border-2 border-yam-orange border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
          Lecture des titres, artistes et pochettes...
        </div>
      }

      <!-- Liste des pistes locales -->
      @if (localTracks().length) {
        <section class="mt-10">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">
              🎧 Mes pistes <span class="text-white/30 text-sm font-normal">{{ localTracks().length }} fichiers</span>
            </h2>
            <button (click)="clearAll()" class="text-sm text-white/40 hover:text-red-400 transition"
                    aria-label="Effacer toute la liste">🗑 Tout effacer</button>
          </div>
          <div class="space-y-2">
            @for (t of localTracks(); track t.id; let i = $index) {
              <div [class]="rowClass(i)" (click)="onRowClick(i)">
                <!-- Pochette -->
                @if (t.coverUrl) {
                  <img [src]="t.coverUrl" [alt]="'Pochette de ' + t.title" class="w-14 h-14 rounded-lg object-cover shrink-0">
                } @else {
                  <div class="w-14 h-14 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center text-2xl shrink-0" aria-hidden="true">🎵</div>
                }
                <div class="min-w-0 flex-1">
                  <p [class]="i === currentIndex() ? 'font-semibold truncate text-yam-orange' : 'font-semibold truncate'">{{ t.title }}</p>
                  <p class="text-white/50 text-sm truncate">{{ t.artist }}</p>
                  @if (t.album || t.year) {
                    <p class="text-white/30 text-xs truncate">{{ albumLabel(t) }}</p>
                  }
                </div>
                @if (i === currentIndex() && playing()) {
                  <div class="flex items-end gap-[2px] h-4 w-[18px] shrink-0" aria-hidden="true">
                    <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
                  </div>
                } @else {
                  <span class="text-xs text-white/40 tabular-nums shrink-0">{{ formatTime(t.duration) }}</span>
                }
                <button (click)="removeTrack(i); $event.stopPropagation()"
                        class="w-8 h-8 rounded-full text-white/30 hover:text-red-400 hover:bg-white/10 flex items-center justify-center shrink-0 transition"
                        [attr.aria-label]="'Retirer ' + t.title" title="Retirer de la liste">✕</button>
              </div>
            }
          </div>
        </section>
      }

      <!-- Note info -->
      <p class="text-white/30 text-xs text-center mt-10">🔒 Fonctionne hors ligne. Les fichiers ne quittent jamais ton appareil.</p>

      <!-- Lecteur audio local (cache, distinct du player global de streaming) -->
      <audio #audioEl class="hidden" [src]="audioSrc()"
             (play)="onPlayEvent()" (pause)="onPauseEvent()"
             (timeupdate)="onTimeUpdate()" (loadedmetadata)="onLoadedMetadata()"
             (ended)="onEnded()" (error)="onAudioError()"></audio>

      <!-- Barre de lecture locale (sticky bas de page) -->
      @if (currentLocal(); as cur) {
        <div class="sticky bottom-4 z-40 mt-8 rounded-2xl border border-white/10 bg-yam-surface/95 backdrop-blur-md p-3 shadow-2xl shadow-black/50">
          <div class="flex items-center gap-3">
            @if (cur.coverUrl) {
              <img [src]="cur.coverUrl" [alt]="'Pochette de ' + cur.title" class="w-12 h-12 rounded-lg object-cover shrink-0">
            } @else {
              <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-yam-orange/40 to-yam-gold/40 flex items-center justify-center shrink-0" aria-hidden="true">🎵</div>
            }
            <div class="min-w-0 flex-1">
              <p class="font-semibold truncate">{{ cur.title }}</p>
              <p class="text-white/50 text-xs truncate">{{ cur.artist }}</p>
            </div>
            <button (click)="prev()" class="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-lg shrink-0"
                    aria-label="Piste precedente" title="Piste precedente">⏮️</button>
            <button (click)="togglePlay()" class="w-12 h-12 rounded-full bg-yam-orange text-white flex items-center justify-center text-xl hover:scale-105 active:scale-95 transition shrink-0"
                    aria-label="Lecture ou pause">
              @if (playing()) { ⏸ } @else { ▶ }
            </button>
            <button (click)="next()" class="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-lg shrink-0"
                    aria-label="Piste suivante" title="Piste suivante">⏭️</button>
            <button (click)="toggleShuffle()" [class]="iconBtnClass(shuffle())"
                    aria-label="Lecture aleatoire" title="Lecture aleatoire">🔀</button>
            <button (click)="toggleRepeat()" [class]="iconBtnClass(repeat() === 'all')"
                    aria-label="Repetition de la liste" title="Repetition de la liste">🔁</button>
            <input type="range" min="0" max="100" [value]="volume() * 100" (input)="onVolume($event)"
                   class="w-24 accent-yam-orange hidden md:block shrink-0" aria-label="Volume">
          </div>
          <div class="flex items-center gap-3 mt-2">
            <span class="text-xs text-white/50 tabular-nums w-10 text-right">{{ formatTime(positionSec()) }}</span>
            <input type="range" min="0" max="1000" [value]="progressPermille()" (input)="onSeek($event)"
                   class="flex-1 accent-yam-orange" aria-label="Position de lecture">
            <span class="text-xs text-white/50 tabular-nums w-10">{{ formatTime(durationSec() || cur.duration) }}</span>
          </div>
        </div>
      }
    </div>
  `
})
export class LocalComponent implements OnDestroy {
  /** PlayerService utilise uniquement pour couper le streaming global quand on lit un fichier local. */
  private player = inject(PlayerService);

  localTracks = signal<LocalTrack[]>([]);
  currentIndex = signal(-1);              // -1 = rien en lecture
  playing = signal(false);
  positionSec = signal(0);
  durationSec = signal(0);
  volume = signal(0.9);
  shuffle = signal(false);
  repeat = signal<'off' | 'all'>('off');
  message = signal('');
  importing = signal(false);
  dragOver = signal(false);

  currentLocal = computed<LocalTrack | null>(() => {
    const i = this.currentIndex();
    const list = this.localTracks();
    return i >= 0 && i < list.length ? list[i] : null;
  });

  progressPermille = computed(() => {
    const d = this.durationSec();
    if (!isFinite(d) || d <= 0) return 0;
    return Math.min(1000, Math.max(0, Math.round((this.positionSec() / d) * 1000)));
  });

  audioSrc = computed<string>(() => this.currentLocal()?.url || '');

  @ViewChild('audioEl') audioEl?: ElementRef<HTMLAudioElement>;

  private pendingMeta = 0;

  // ---------- Import des fichiers ----------

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input || !input.files) return;
    this.addFiles(input.files);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as Node | null;
    const related = event.relatedTarget as Node | null;
    if (!related || (zone && !zone.contains(related))) this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
      this.addFiles(event.dataTransfer.files);
    }
  }

  private isAudioFile(f: File): boolean {
    if (f.type && f.type.startsWith('audio/')) return true;
    return /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|wma|aiff?|mp4)$/i.test(f.name);
  }

  /** Fallback metadata : nom de fichier sans extension ("Artiste - Titre" si " - " present). */
  private fallbackFromName(name: string): { title: string; artist: string } {
    const base = name.replace(/\.[^./]+$/, '').trim();
    const dash = base.indexOf(' - ');
    if (dash > 0) {
      return { artist: base.slice(0, dash).trim(), title: base.slice(dash + 3).trim() || base };
    }
    return { title: base || name, artist: 'Artiste inconnu' };
  }

  addFiles(files: FileList | File[]): void {
    const list = Array.from(files);
    const audioFiles = list.filter(f => this.isAudioFile(f));
    if (!audioFiles.length) {
      this.message.set('Aucun fichier audio detecte. Essaie MP3, M4A, AAC, OGG, WAV ou FLAC.');
      return;
    }
    this.message.set('');
    const added: LocalTrack[] = audioFiles.map(f => {
      const fb = this.fallbackFromName(f.name);
      return {
        id: 'loc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
        file: f,
        url: URL.createObjectURL(f),
        title: fb.title,
        artist: fb.artist,
        album: '',
        duration: 0
      };
    });
    this.localTracks.update(existing => [...existing, ...added]);
    for (const t of added) {
      this.probeDuration(t.id, t.url);
      void this.enrichTrack(t);
    }
  }

  /** Duree via un element Audio temporaire (charge les metadonnees sans jouer). */
  private probeDuration(id: string, url: string): void {
    const probe = new Audio();
    probe.preload = 'metadata';
    const cleanup = (): void => { probe.onloadedmetadata = null; probe.onerror = null; probe.removeAttribute('src'); };
    probe.onloadedmetadata = () => {
      if (isFinite(probe.duration) && probe.duration > 0) {
        this.localTracks.update(list => list.map(t => (t.id === id && t.duration <= 0 ? { ...t, duration: probe.duration } : t)));
      }
      cleanup();
    };
    probe.onerror = () => cleanup();
    probe.src = url;
  }

  /** Complete une piste avec les infos ID3v2 (titre, artiste, album, annee, pochette). */
  private async enrichTrack(track: LocalTrack): Promise<void> {
    this.pendingMeta++;
    this.importing.set(true);
    try {
      const parsed = await parseId3(track.file);
      this.localTracks.update(list => {
        if (!list.some(x => x.id === track.id)) {
          // piste retiree pendant le parse : on libere la pochette eventuelle
          if (parsed.coverUrl) URL.revokeObjectURL(parsed.coverUrl);
          return list;
        }
        return list.map(x => {
          if (x.id !== track.id) return x;
          const next: LocalTrack = { ...x };
          if (parsed.title) next.title = parsed.title;
          if (parsed.artist) next.artist = parsed.artist;
          if (parsed.album) next.album = parsed.album;
          if (parsed.year) next.year = parsed.year;
          if (parsed.coverUrl) next.coverUrl = parsed.coverUrl;
          return next;
        });
      });
      // Rafraichir l'ecran verrouille si la piste en cours vient d'etre enrichie
      const cur = this.currentLocal();
      if (cur && cur.id === track.id) this.setupMediaSession(cur);
    } catch {
      // parse impossible : on garde le fallback nom de fichier
    } finally {
      this.pendingMeta--;
      this.importing.set(this.pendingMeta > 0);
    }
  }

  // ---------- Gestion de la liste ----------

  removeTrack(i: number): void {
    const list = this.localTracks();
    const t = list[i];
    if (!t) return;
    URL.revokeObjectURL(t.url);
    if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    const cur = this.currentIndex();
    this.localTracks.set(list.filter((_, idx) => idx !== i));
    if (cur === i) {
      const el = this.audioEl?.nativeElement;
      if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
      this.currentIndex.set(-1);
      this.playing.set(false);
      this.positionSec.set(0);
      this.durationSec.set(0);
      this.message.set('Piste retiree de la liste');
    } else if (cur > i) {
      this.currentIndex.set(cur - 1);
    }
  }

  clearAll(): void {
    for (const t of this.localTracks()) {
      URL.revokeObjectURL(t.url);
      if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    }
    const el = this.audioEl?.nativeElement;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    this.localTracks.set([]);
    this.currentIndex.set(-1);
    this.playing.set(false);
    this.positionSec.set(0);
    this.durationSec.set(0);
    this.message.set('');
  }

  ngOnDestroy(): void {
    const el = this.audioEl?.nativeElement;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    for (const t of this.localTracks()) {
      URL.revokeObjectURL(t.url);
      if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    }
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.metadata = null; } catch { /* non supporte */ }
    }
  }

  // ---------- Lecteur local ----------

  onRowClick(i: number): void {
    if (i === this.currentIndex()) {
      this.togglePlay();
    } else {
      this.playAt(i);
    }
  }

  playAt(i: number): void {
    const list = this.localTracks();
    if (i < 0 || i >= list.length) return;
    this.message.set('');
    this.positionSec.set(0);
    this.durationSec.set(list[i].duration || 0);
    this.currentIndex.set(i);
    // Couper le lecteur global (streaming HLS) pour ne pas avoir deux sons
    if (this.player.isPlaying()) this.player.toggle();
    // Attendre que le binding [src] soit applique par la detection de changements
    setTimeout(() => {
      const el = this.audioEl?.nativeElement;
      const cur = this.currentLocal();
      if (!el || !cur) return;
      if (el.src !== cur.url) {
        el.src = cur.url;
        el.load();
      }
      el.play().catch(() => this.message.set('Format non lisible par ce navigateur'));
      this.setupMediaSession(cur);
    });
  }

  togglePlay(): void {
    const el = this.audioEl?.nativeElement;
    const i = this.currentIndex();
    if (!el || i < 0) {
      if (this.localTracks().length) this.playAt(0);
      return;
    }
    if (this.playing()) {
      el.pause();
    } else {
      // si la lecture etait terminee, play() rembobine automatiquement au debut
      el.play().catch(() => this.message.set('Format non lisible par ce navigateur'));
    }
  }

  next(): void {
    const list = this.localTracks();
    if (!list.length) return;
    const cur = this.currentIndex();
    if (cur < 0) { this.playAt(0); return; }
    if (this.shuffle()) {
      if (list.length === 1) {
        if (this.repeat() === 'all') this.playAt(0);
        return;
      }
      let target = cur;
      while (target === cur) target = Math.floor(Math.random() * list.length);
      this.playAt(target);
      return;
    }
    const isLast = cur === list.length - 1;
    if (isLast && this.repeat() === 'off') { this.stopPlayback(); return; }
    this.playAt((cur + 1) % list.length);
  }

  prev(): void {
    const list = this.localTracks();
    if (!list.length) return;
    const cur = this.currentIndex();
    if (cur < 0) { this.playAt(0); return; }
    if (this.shuffle()) {
      if (list.length === 1) { this.playAt(0); return; }
      let target = cur;
      while (target === cur) target = Math.floor(Math.random() * list.length);
      this.playAt(target);
      return;
    }
    this.playAt((cur - 1 + list.length) % list.length);
  }

  private stopPlayback(): void {
    const el = this.audioEl?.nativeElement;
    if (el) {
      el.pause();
      try { el.currentTime = 0; } catch { /* rien a rembobiner */ }
    }
    this.playing.set(false);
    this.positionSec.set(0);
  }

  toggleShuffle(): void { this.shuffle.set(!this.shuffle()); }

  toggleRepeat(): void { this.repeat.set(this.repeat() === 'all' ? 'off' : 'all'); }

  // ---------- Evenements de l'element audio ----------

  onPlayEvent(): void {
    this.playing.set(true);
    this.setMediaSessionState('playing');
  }

  onPauseEvent(): void {
    this.playing.set(false);
    this.setMediaSessionState('paused');
  }

  onTimeUpdate(): void {
    const el = this.audioEl?.nativeElement;
    if (el) this.positionSec.set(el.currentTime);
  }

  onLoadedMetadata(): void {
    const el = this.audioEl?.nativeElement;
    if (el && isFinite(el.duration) && el.duration > 0) this.durationSec.set(el.duration);
  }

  onEnded(): void {
    this.next(); // la logique shuffle / repeat / stop est portee par next()
  }

  onAudioError(): void {
    if (this.currentIndex() < 0) return; // source vide (nettoyage) : rien a signaler
    this.playing.set(false);
    this.message.set('Format non lisible par ce navigateur');
  }

  onSeek(event: Event): void {
    const el = this.audioEl?.nativeElement;
    const input = event.target as HTMLInputElement | null;
    if (!el || !input) return;
    const ratio = Number(input.value) / 1000;
    const d = this.durationSec();
    if (isFinite(d) && d > 0) {
      try { el.currentTime = ratio * d; } catch { /* seek non disponible */ }
    }
  }

  onVolume(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const el = this.audioEl?.nativeElement;
    if (!input) return;
    const v = Math.max(0, Math.min(1, Number(input.value) / 100));
    this.volume.set(v);
    if (el) el.volume = v;
  }

  // ---------- MediaSession (ecran verrouille du telephone) ----------

  private setupMediaSession(track: LocalTrack): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Ma Musique locale',
        artwork: track.coverUrl ? [{ src: track.coverUrl }] : []
      });
    } catch { /* metadata non supporte */ }
    const ms = navigator.mediaSession;
    const bind = (action: MediaSessionAction, fn: () => void): void => {
      try { ms.setActionHandler(action, () => fn()); } catch { /* action non supportee */ }
    };
    bind('play', () => this.togglePlay());
    bind('pause', () => this.togglePlay());
    bind('previoustrack', () => this.prev());
    bind('nexttrack', () => this.next());
  }

  private setMediaSessionState(state: 'playing' | 'paused'): void {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = state; } catch { /* non supporte */ }
  }

  // ---------- Helpers d'affichage ----------

  formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  albumLabel(t: LocalTrack): string {
    return [t.album, t.year].filter(v => !!v).join(' · ');
  }

  dropZoneClass(): string {
    const base = 'rounded-2xl border-2 border-dashed p-8 text-center transition-all ';
    return base + (this.dragOver()
      ? 'border-yam-orange bg-yam-orange/10 scale-[1.01]'
      : 'border-white/20 hover:border-white/40 bg-white/[0.02]');
  }

  rowClass(i: number): string {
    const base = 'yam-card p-3 flex items-center gap-3 cursor-pointer select-none ';
    return base + (i === this.currentIndex() ? 'border-yam-orange/50 bg-yam-orange/5' : '');
  }

  iconBtnClass(active: boolean): string {
    return active
      ? 'w-9 h-9 rounded-full bg-yam-orange/20 text-yam-orange flex items-center justify-center shrink-0'
      : 'w-9 h-9 rounded-full text-white/40 hover:bg-white/10 flex items-center justify-center shrink-0 transition';
  }
}
