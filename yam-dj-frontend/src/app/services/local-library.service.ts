import { Injectable, signal } from '@angular/core';
import { LocalFileTrack } from '../models/models';

/**
 * BIBLIOTHEQUE LOCALE — acces aux musiques du telephone/ordinateur.
 *
 * 1. AUTORISATION : File System Access API (showDirectoryPicker) —
 *    l'utilisateur autorise UNE FOIS l'acces a son dossier Musiques,
 *    on scanne tous les fichiers audio et on AFFICHE tout, sans
 *    re-selectionner fichier par fichier.
 * 2. PERSISTANCE : les handles sont stockes dans IndexedDB — au retour
 *    sur la page, on redemande discretement la permission (le navigateur
 *    exige un geste pour re-activer l'acces, on affiche alors un bouton
 *    « Reautoriser mes musiques »).
 * 3. FALLBACK : navigateurs sans FS Access API (iOS Safari, Firefox
 *    Android) -> <input webkitdirectory> (scan dossier) ou selection
 *    multiple classique.
 *
 * 100 % cote client : aucun fichier n'est envoye sur internet.
 */
@Injectable({ providedIn: 'root' })
export class LocalLibraryService {

  /** Pistes decouvertes (metadonnees ID3 non encore parsees ici). */
  tracks = signal<LocalFileTrack[]>([]);
  /** Dossier autorise (nom affichable). */
  folderName = signal<string | null>(null);
  /** Permission a redemander au retour ? */
  needsPermission = signal<boolean>(false);
  /** FS Access API disponible ? */
  readonly fsApiAvailable = typeof (window as any).showDirectoryPicker === 'function';

  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'yam-local-lib';
  private readonly STORE = 'handles';

  constructor() {
    this.openDb().then(() => this.restoreHandles());
  }

  // =====================================================================
  // AUTORISATION + SCAN DU DOSSIER
  // =====================================================================

  /** Demande l'autorisation d'acces au dossier Musiques (bouton principal). */
  async requestAccess(): Promise<void> {
    if (!this.fsApiAvailable) return; // le composant utilisera le fallback
    try {
      const dir = await (window as any).showDirectoryPicker({ id: 'yam-music', mode: 'read' });
      this.folderName.set(dir.name);
      await this.saveHandle(dir);
      await this.scanDirectory(dir);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        this.folderName.set(null);
      }
    }
  }

  /** Reautorisation apres retour (l'acces aux handles expire a la session). */
  async reauthorize(): Promise<boolean> {
    const handles = await this.loadHandles();
    for (const h of handles) {
      try {
        const perm = await h.handle.queryPermission({ mode: 'read' });
        if (perm === 'granted') continue;
        const asked = await h.handle.requestPermission({ mode: 'read' });
        if (asked !== 'granted') return false;
      } catch {
        continue;
      }
    }
    this.needsPermission.set(false);
    await this.rescan();
    return true;
  }

  /** Rescanne les dossiers persistes (permission deja donnee). */
  async rescan(): Promise<void> {
    const handles = await this.loadHandles();
    if (!handles.length) return;
    this.folderName.set(handles[0]?.handle.name || 'Musiques');
    const collected: LocalFileTrack[] = [];
    for (const h of handles) {
      try {
        await this.collectAudioFiles(h.handle, collected);
      } catch {
        this.needsPermission.set(true);
      }
    }
    this.tracks.set(collected);
  }

  /** Scan recursif limite du dossier (profondeur 3, 500 fichiers max). */
  private async scanDirectory(dir: any): Promise<void> {
    const collected: LocalFileTrack[] = [];
    await this.collectAudioFiles(dir, collected, 0);
    this.tracks.set(collected);
  }

  private async collectAudioFiles(dir: any, out: LocalFileTrack[], depth = 0): Promise<void> {
    if (depth > 3 || out.length > 500) return;
    try {
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'file' && this.isAudioFile(name)) {
          const file: File = await entry.getFile();
          out.push(this.makeTrack(file, entry));
        } else if (entry.kind === 'directory' && !name.startsWith('.')) {
          await this.collectAudioFiles(entry, out, depth + 1);
        }
      }
    } catch { /* dossier non lisible : on saute */ }
  }

  /** Fallback : fichiers choisis via <input> (multi ou webkitdirectory). */
  addFiles(files: FileList | File[]): LocalFileTrack[] {
    const list: LocalFileTrack[] = [];
    for (const f of Array.from(files)) {
      if (this.isAudioFile(f.name) || (f.type && f.type.startsWith('audio/'))) {
        list.push(this.makeTrack(f));
      }
    }
    this.tracks.set([...this.tracks(), ...list]);
    return list;
  }

  private makeTrack(file: File, handle?: any): LocalFileTrack {
    const base = file.name.replace(/\.[^.]+$/, '');
    const dash = base.split(' - ');
    return {
      id: 'l' + Math.random().toString(36).slice(2, 10),
      title: dash.length > 1 ? dash.slice(1).join(' - ') : base,
      artist: dash.length > 1 ? dash[0] : 'Artiste inconnu',
      album: '',
      duration: 0,
      fileName: file.name,
      file,
      handle,
      objectUrl: URL.createObjectURL(file)
    };
  }

  private isAudioFile(name: string): boolean {
    return /\.(mp3|m4a|aac|ogg|opus|wav|flac|webm|wma|3gp|amr)$/i.test(name);
  }

  removeTrack(id: string): void {
    this.tracks.set(this.tracks().filter(t => t.id !== id));
  }

  clearAll(): void {
    this.tracks().forEach(t => {
      if (t.objectUrl) { try { URL.revokeObjectURL(t.objectUrl); } catch { } }
    });
    this.tracks.set([]);
  }

  // =====================================================================
  // INDEXEDDB (persistance des handles)
  // =====================================================================

  private openDb(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(this.DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.STORE)) {
            db.createObjectStore(this.STORE);
          }
        };
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private saveHandle(dirHandle: any): Promise<void> {
    return new Promise(resolve => {
      if (!this.db) return resolve();
      try {
        const tx = this.db.transaction(this.STORE, 'readwrite');
        tx.objectStore(this.STORE).put(dirHandle, 'root');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private loadHandles(): Promise<Array<{ handle: any }>> {
    return new Promise(resolve => {
      if (!this.db) return resolve([]);
      try {
        const tx = this.db.transaction(this.STORE, 'readonly');
        const req = tx.objectStore(this.STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).map((handle: any) => ({ handle })));
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private restoreHandles(): void {
    this.loadHandles().then(handles => {
      if (!handles.length) return;
      (async () => {
        // Permission encore valide cette session ?
        let granted = false;
        try {
          granted = (await handles[0].handle.queryPermission({ mode: 'read' })) === 'granted';
        } catch { }
        this.folderName.set(handles[0].handle.name || 'Musiques');
        if (granted) {
          await this.rescan();
        } else {
          this.needsPermission.set(true);
        }
      })();
    });
  }
}
