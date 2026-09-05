import { Track } from '../../models/models';

/**
 * ============================================================================
 *  YAM DJ — MOTEUR STUDIO PRO (Web Audio API, 100% reel)
 * ============================================================================
 *
 *  Ce moteur remplace l'ancienne approche <audio> + HLS :
 *  1. La piste est ENTIEREMENT chargee en memoire (AudioBuffer) :
 *     - telechargement du rendu HLS (segments .ts de ~100 Ko, parfait 3G) ;
 *     - extraction de l'audio AAC (parseur MPEG-TS -> PES -> ADTS) ;
 *     - decodage natif navigateur -> AudioBuffer (teste et valide) ;
 *     - ou fichier direct (mp3/m4a) si l'URL est progressive.
 *  2. Tout devient PRECIS :
 *     - waveform reelle (pics calcules depuis le signal) ;
 *     - boucles et hot cues exactes a l'echantillon (source.loop) ;
 *     - pitch playbackRate temps reel, position calculee au temps audio ;
 *     - EQ 3 bandes + filtre bipolaire + echo + reverb par deck ;
 *     - crossfader equal-power, limiteur master, VU-metres.
 *  3. Enregistrement du mix de sortie (MediaRecorder) pour publication.
 */

export type LoadPhase = 'idle' | 'url' | 'playlist' | 'segments' | 'decode' | 'peaks' | 'ready' | 'error';

export interface ProgressCb { (pct: number, phase: LoadPhase, detail: string): void }

/** Extraction AAC-ADTS depuis des paquets MPEG-TS (188 octets). */
export function extractAacFromTs(ts: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let audioPid = -1;

  for (let i = 0; i + 188 <= ts.length; i += 188) {
    if (ts[i] !== 0x47) continue;                     // sync byte
    const pid = ((ts[i + 1] & 0x1f) << 8) | ts[i + 2];
    const pusi = (ts[i + 1] & 0x40) !== 0;            // payload unit start
    const afc = (ts[i + 3] >> 4) & 0x03;              // adaptation field control
    if (afc === 0) continue;                          // reserved
    let off = i + 4;
    if (afc === 2) continue;                          // adaptation only
    if (afc === 3) off += 1 + ts[off];                // skip adaptation field
    const end = i + 188;

    if (pid === audioPid) {
      if (pusi && off + 9 <= end && ts[off] === 0 && ts[off + 1] === 0 && ts[off + 2] === 1) {
        // Nouveau PES : sauter son en-tete (9 + headerDataLength)
        off = off + 9 + ts[off + 8];
      }
      if (off < end) chunks.push(ts.subarray(off, end));
    } else if (pusi && off + 9 <= end
        && ts[off] === 0 && ts[off + 1] === 0 && ts[off + 2] === 1) {
      const sid = ts[off + 3];
      if (sid >= 0xC0 && sid <= 0xDF) {               // flux audio
        audioPid = pid;
        const payloadStart = off + 9 + ts[off + 8];
        if (payloadStart < end) chunks.push(ts.subarray(payloadStart, end));
      }
    }
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  const aac = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { aac.set(c, p); p += c.length; }
  return aac;
}

/** Pics de waveform normalises (une valeur 0..1 par colonne). */
export function computePeaks(buffer: AudioBuffer, columns: number): Float32Array {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const peaks = new Float32Array(columns);
  const step = Math.max(1, Math.floor(ch0.length / columns));
  const stride = Math.max(1, Math.floor(step / 128)); // sous-echantillonnage rapide
  for (let c = 0; c < columns; c++) {
    const start = c * step;
    const end = Math.min(start + step, ch0.length);
    let max = 0;
    for (let i = start; i < end; i += stride) {
      const v = Math.abs(ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i]);
      if (v > max) max = v;
    }
    peaks[c] = max;
  }
  let globalMax = 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > globalMax) globalMax = peaks[i];
  if (globalMax > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= globalMax;
  return peaks;
}

/**
 * Detection BPM cote navigateur (fichiers locaux) :
 * 1. downmix mono + filtre passe-bas mobile (accentue le kick) ;
 * 2. energie par fenetre ~11,6 ms ;
 * 3. onsets = pics d'energie au-dessus d'un seuil adaptatif ;
 * 4. histogramme des intervalles inter-onsets -> candidat dominant,
 *    replie dans la plage 75-180 BPM.
 */
export function detectBpm(buffer: AudioBuffer): number | null {
  const rate = buffer.sampleRate;
  const n = buffer.length;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  // 1. Fenetres d'energie
  const win = 512;
  const hop = 512;
  const nWin = Math.floor(n / hop);
  if (nWin < 200) return null; // trop court
  const energy = new Float32Array(nWin);
  let smooth = 0;
  const K = 0.25; // passe-bas simple pour isoler le grave
  for (let w = 0; w < nWin; w++) {
    let sum = 0;
    const start = w * hop;
    const end = start + win;
    for (let i = start; i < end; i += 4) { // sous-echantillonnage x4
      const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      const lp = smooth + K * (v - smooth);
      smooth = lp;
      sum += lp * lp;
    }
    energy[w] = sum;
  }

  // 2. Onsets : energie nettement au-dessus de la moyenne locale
  const onsets: number[] = [];
  const winPerSec = rate / hop;
  const neigh = Math.round(winPerSec * 0.35);
  for (let w = 1; w < nWin - 1; w++) {
    const e = energy[w];
    if (e <= 0) continue;
    let mean = 0, cnt = 0;
    for (let k = Math.max(0, w - neigh); k < Math.min(nWin, w + neigh); k++) { mean += energy[k]; cnt++; }
    mean /= Math.max(1, cnt);
    if (e > mean * 1.35 && e >= energy[w - 1] && e > energy[w + 1]) {
      onsets.push(w);
    }
  }
  if (onsets.length < 8) return null;

  // 3. Intervalles entre onsets proches (<= 2 s)
  const hist = new Map<number, number>();
  const bump = (bpm: number) => {
    let b = bpm;
    while (b < 84) b *= 2;
    while (b > 168) b /= 2;
    if (b < 84 || b > 168) return;
    for (const d of [-1, 0, 1]) { // tolerance +-1 BPM
      const key = Math.round(b) + d;
      hist.set(key, (hist.get(key) || 0) + (d === 0 ? 2 : 1));
    }
  };
  for (let i = 0; i < onsets.length; i++) {
    for (let j = i + 1; j < onsets.length && j <= i + 4; j++) {
      const dt = (onsets[j] - onsets[i]) / winPerSec;
      if (dt < 0.25 || dt > 2.0) continue;
      bump(60 / dt);
    }
  }

  // 4. Meilleur candidat ( avec lissage des voisins )
  const score = (bpm: number) =>
    (hist.get(bpm) || 0) + (hist.get(bpm - 1) || 0) * 0.3 + (hist.get(bpm + 1) || 0) * 0.3;
  let best = 0, bestBpm: number | null = null;
  for (const [bpm] of hist) {
    const s = score(bpm);
    if (s > best) { best = s; bestBpm = bpm; }
  }
  // Correction d'octave de tempo : si le gagnant est lent mais que son double
  // est presque aussi fort, on prefere le double (plage reelle des genres ouest-africains).
  if (bestBpm != null && bestBpm < 100) {
    const dbl = bestBpm * 2;
    if (dbl <= 168 && score(dbl) >= best * 0.4) bestBpm = dbl;
  }
  return bestBpm;
}

/** Fetch avec progression octets (peu utilise : segments via compteur). */
async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('Telechargement impossible (' + res.status + ')');
  return res.arrayBuffer();
}

/**
 * ============================================================================
 *  CHARGEMENT STANDALONE D'UNE PISTE (rendu deterministe / cache)
 * ============================================================================
 *  Meme pipeline que DjDeck.load (HLS -> AAC -> decode, ou direct) mais SANS
 *  toucher a un deck : sert au moteur de rendu hors ligne (mix-renderer).
 */
export async function loadTrackAudio(
  ctx: BaseAudioContext,
  url: string,
  onProgress?: ProgressCb
): Promise<AudioBuffer> {
  let aacOrBuffer: ArrayBuffer | Uint8Array;
  if (url.includes('.m3u8')) {
    aacOrBuffer = await fetchHlsToAacStandalone(url, onProgress || (() => { }));
  } else {
    onProgress?.(0.3, 'segments', 'Telechargement...');
    aacOrBuffer = await fetchBuffer(url);
  }
  onProgress?.(0.75, 'decode', 'Decodage audio...');
  return (aacOrBuffer instanceof Uint8Array)
    ? ctx.decodeAudioData(aacOrBuffer.slice().buffer)
    : ctx.decodeAudioData(aacOrBuffer);
}

/** Telecharge un rendu HLS et extrait l'AAC (version autonome). */
async function fetchHlsToAacStandalone(playlistUrl: string, onProgress: ProgressCb): Promise<Uint8Array> {
  onProgress(0.05, 'playlist', 'Lecture du rendu...');
  let plText = await (await fetch(playlistUrl, { mode: 'cors' })).text();
  if (!plText.includes('#EXTINF')) {
    const first = plText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0];
    if (!first) throw new Error('Playlist HLS vide');
    const variant = new URL(first, playlistUrl).toString();
    plText = await (await fetch(variant, { mode: 'cors' })).text();
    if (!plText.includes('#EXTINF')) throw new Error('Playlist HLS illisible');
  }
  const segNames = plText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!segNames.length) throw new Error('Aucun segment HLS');
  const segUrls = segNames.map(n2 => new URL(n2, playlistUrl).toString());
  onProgress(0.1, 'segments', segUrls.length + ' morceaux...');
  const buffers: Uint8Array[] = new Array(segUrls.length);
  let done = 0, next = 0;
  const CONC = Math.min(4, segUrls.length);
  const worker = async () => {
    while (next < segUrls.length) {
      const i = next++;
      const res = await fetch(segUrls[i], { mode: 'cors' });
      if (!res.ok) throw new Error('Segment ' + (i + 1) + ' illisible');
      buffers[i] = new Uint8Array(await res.arrayBuffer());
      done++;
      onProgress(0.1 + 0.6 * (done / segUrls.length), 'segments', done + '/' + segUrls.length + ' morceaux');
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  let total = 0;
  for (const b of buffers) total += b.length;
  const ts = new Uint8Array(total);
  let p = 0;
  for (const b of buffers) { ts.set(b, p); p += b.length; }
  onProgress(0.72, 'decode', 'Extraction audio...');
  return extractAacFromTs(ts);
}

/** ============================================================================
 *  DECK — une platine complete
 *  source -> eqLow -> eqMid -> eqHigh -> filter(LPF+HPF) -> fxMix -> channelGain
 *  -> [dry -> crossGain] + [echo] + [reverb] -> analyser -> sortie moteur
 *  (channelGain intgre le volume fader ; crossGain applique le crossfader)
 *  ==========================================================================*/
export class DjDeck {

  // ---- etat piste ----
  track: Track | null = null;
  buffer: AudioBuffer | null = null;
  peaks: Float32Array = new Float32Array(0);
  loading = false;
  phase: LoadPhase = 'idle';
  pct = 0;
  detail = '';
  loadError: string | null = null;

  // ---- lecture ----
  playing = false;
  private source: AudioBufferSourceNode | null = null;
  private startOffset = 0;      // temps piste au demarrage de la source
  private startCtxTime = 0;     // temps AudioContext au demarrage
  private rate = 1;
  private stopIntent = false;
  onEnded: (() => void) | null = null;

  // ---- commandes DJ ----
  pitchPct = 0;                 // -8..+8 %
  volume = 1;                   // fader de voie (0..1)
  cues: (number | null)[] = [null, null, null, null];
  mainCue: number | null = null;
  loop: { start: number; end: number; bars: number } | null = null;
  vu = 0;

  // ---- noeuds audio ----
  readonly input: GainNode;               // entree du deck (la source s'y branche)
  private readonly eqLow: BiquadFilterNode;
  private readonly eqMid: BiquadFilterNode;
  private readonly eqHigh: BiquadFilterNode;
  private readonly lpf: BiquadFilterNode;
  private readonly hpf: BiquadFilterNode;
  private readonly channelGain: GainNode; // volume fader
  private readonly crossGain: GainNode;   // facteur crossfader (applique par l'engine)
  private readonly fxDry: GainNode;
  private readonly echo: DelayNode;
  private readonly echoWet: GainNode;
  private readonly echoFeedback: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbWet: GainNode;
  private readonly flanger: DelayNode;
  private readonly flangerWet: GainNode;
  private readonly flangerLfo: OscillatorNode;
  private readonly flangerLfoGain: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly vuData: Uint8Array;

  constructor(readonly id: 'A' | 'B', private ctx: AudioContext, out: AudioNode) {
    this.input = ctx.createGain();
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1200;
    this.eqMid.Q.value = 1.0;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 4000;

    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 22050;
    this.lpf.Q.value = 0.5;
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 10;
    this.hpf.Q.value = 0.5;

    this.channelGain = ctx.createGain();
    this.crossGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.vuData = new Uint8Array(this.analyser.fftSize);

    // Effets (parallele, wet reglable — dry reste toujours actif)
    this.fxDry = ctx.createGain();
    this.echo = ctx.createDelay(2.0);
    this.echo.delayTime.value = 0.35;
    this.echoWet = ctx.createGain();
    this.echoWet.gain.value = 0;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = 0.35;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = DjDeck.makeReverbIR(ctx, 1.8);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0;

    // Flanger : delai court module par un LFO (0.005-0.010 s, 0.15 Hz)
    this.flanger = ctx.createDelay(0.05);
    this.flanger.delayTime.value = 0.0065;
    this.flangerWet = ctx.createGain();
    this.flangerWet.gain.value = 0;
    this.flangerLfo = ctx.createOscillator();
    this.flangerLfo.type = 'sine';
    this.flangerLfo.frequency.value = 0.15;
    this.flangerLfoGain = ctx.createGain();
    this.flangerLfoGain.gain.value = 0.0022;
    this.flangerLfo.connect(this.flangerLfoGain);
    this.flangerLfoGain.connect(this.flanger.delayTime);
    this.flangerLfo.start();

    // Câblage
    this.input.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.lpf);
    this.lpf.connect(this.hpf);
    this.hpf.connect(this.fxDry);
    this.fxDry.connect(this.channelGain);
    // echo : hpf -> echo -> echoWet -> channelGain (+ feedback)
    this.hpf.connect(this.echo);
    this.echo.connect(this.echoWet);
    this.echoWet.connect(this.channelGain);
    this.echo.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echo);
    // reverb : hpf -> reverb -> reverbWet -> channelGain
    this.hpf.connect(this.reverb);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.channelGain);
    // flanger : hpf -> flanger -> flangerWet -> channelGain
    this.hpf.connect(this.flanger);
    this.flanger.connect(this.flangerWet);
    this.flangerWet.connect(this.channelGain);

    this.channelGain.connect(this.crossGain);
    this.crossGain.connect(this.analyser);
    this.analyser.connect(out);
  }

  /** IR de reverb generee (decroissance exponentielle). */
  private static makeReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(seconds * rate);
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return ir;
  }

  // ============ POSITION / TEMPS ============

  get duration(): number { return this.buffer?.duration ?? this.track?.durationSec ?? 0; }

  /** Position courante (temps piste), en tenant compte du pitch et de la boucle. */
  get position(): number {
    if (!this.buffer) return 0;
    if (!this.playing) return this.startOffset;
    let pos = this.startOffset + (this.ctx.currentTime - this.startCtxTime) * this.rate;
    if (this.loop) {
      const len = this.loop.end - this.loop.start;
      if (len > 0 && pos > this.loop.end) {
        pos = this.loop.start + ((pos - this.loop.start) % len);
      }
    }
    return Math.min(pos, this.buffer.duration);
  }

  get effectiveBpm(): number | null {
    if (!this.track?.bpm) return null;
    return this.track.bpm * this.rate;
  }

  // ============ CHARGEMENT ============

  async load(url: string, track: Track, onProgress: ProgressCb): Promise<void> {
    this.resetDeckState();
    this.track = track;
    this.loading = true;
    try {
      onProgress(0.02, 'playlist', 'Connexion...');
      let aacOrBuffer: ArrayBuffer | Uint8Array;
      if (url.includes('.m3u8')) {
        aacOrBuffer = await this.fetchHlsToAac(url, onProgress);
      } else {
        onProgress(0.3, 'segments', 'Telechargement...');
        aacOrBuffer = await fetchBuffer(url);
      }
      onProgress(0.75, 'decode', 'Decodage audio...');
      const buf = (aacOrBuffer instanceof Uint8Array)
        ? await this.ctx.decodeAudioData(aacOrBuffer.slice().buffer)
        : await this.ctx.decodeAudioData(aacOrBuffer);
      onProgress(0.92, 'peaks', 'Analyse de la waveform...');
      this.peaks = computePeaks(buf, 1400);
      this.buffer = buf;
      if (!track.durationSec || Math.abs(track.durationSec - buf.duration) > 2) {
        track.durationSec = Math.round(buf.duration);
      }
      this.loading = false;
      this.phase = 'ready';
      onProgress(1, 'ready', 'Pret !');
    } catch (e: any) {
      this.loading = false;
      this.phase = 'error';
      this.loadError = 'Decodage impossible sur ce navigateur : '
        + (e?.message ? String(e.message) : 'format non supporte')
        + ' — essaie Chrome ou Edge.';
      onProgress(0, 'error', this.loadError);
      this.track = null;
      this.buffer = null;
      throw e;
    }
  }

  /** Telecharge le rendu HLS et extrait l'AAC (rendu lite = ~100 Ko/segment). */
  private async fetchHlsToAac(playlistUrl: string, onProgress: ProgressCb): Promise<Uint8Array> {
    onProgress(0.05, 'playlist', 'Lecture du rendu...');
    let plText = await (await fetch(playlistUrl, { mode: 'cors' })).text();
    if (!plText.includes('#EXTINF')) {
      // Playlist MAITRE : prendre la premiere variante
      const first = plText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0];
      if (!first) throw new Error('Playlist HLS vide');
      const variant = new URL(first, playlistUrl).toString();
      plText = await (await fetch(variant, { mode: 'cors' })).text();
      if (!plText.includes('#EXTINF')) throw new Error('Playlist HLS illisible');
    }
    const segNames = plText.split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    if (!segNames.length) throw new Error('Aucun segment HLS');
    const segUrls = segNames.map(n => new URL(n, playlistUrl).toString());

    onProgress(0.1, 'segments', segUrls.length + ' morceaux...');
    const buffers: Uint8Array[] = new Array(segUrls.length);
    let done = 0;
    let next = 0;
    const CONC = Math.min(4, segUrls.length);
    const worker = async () => {
      while (next < segUrls.length) {
        const i = next++;
        const res = await fetch(segUrls[i], { mode: 'cors' });
        if (!res.ok) throw new Error('Segment ' + (i + 1) + ' illisible');
        buffers[i] = new Uint8Array(await res.arrayBuffer());
        done++;
        onProgress(0.1 + 0.6 * (done / segUrls.length), 'segments', done + '/' + segUrls.length + ' morceaux');
      }
    };
    await Promise.all(Array.from({ length: CONC }, worker));

    let total = 0;
    for (const b of buffers) total += b.length;
    const ts = new Uint8Array(total);
    let p = 0;
    for (const b of buffers) { ts.set(b, p); p += b.length; }
    onProgress(0.72, 'decode', 'Extraction audio...');
    return extractAacFromTs(ts);
  }

  /**
   * Charge un FICHIER LOCAL (mp3/m4a/wav/flac/ogg du telephone ou PC) :
   * decode direct dans l'AudioContext, detection BPM auto, waveform reelle.
   * Retourne le BPM detecte (ou null).
   */
  async loadLocalFile(file: File, track: Track, onProgress: ProgressCb): Promise<number | null> {
    this.resetDeckState();
    this.track = track;
    this.loading = true;
    try {
      onProgress(0.2, 'segments', 'Lecture du fichier...');
      const data = await file.arrayBuffer();
      onProgress(0.55, 'decode', 'Decodage audio...');
      const buf = await this.ctx.decodeAudioData(data);
      onProgress(0.8, 'peaks', 'Detection BPM...');
      const bpm = detectBpm(buf);
      if (bpm) {
        this.track = { ...track, bpm, durationSec: Math.round(buf.duration) };
      } else {
        this.track = { ...track, durationSec: Math.round(buf.duration) };
      }
      onProgress(0.9, 'peaks', 'Analyse de la waveform...');
      this.peaks = computePeaks(buf, 1400);
      this.buffer = buf;
      this.loading = false;
      this.phase = 'ready';
      onProgress(1, 'ready', 'Pret !');
      return bpm;
    } catch (e: any) {
      this.loading = false;
      this.phase = 'error';
      this.loadError = 'Fichier illisible : ' + (e?.message ? String(e.message) : 'format non supporte');
      this.track = null;
      this.buffer = null;
      throw e;
    }
  }

  private resetDeckState(): void {
    this.stopSource(true);
    this.playing = false;
    this.startOffset = 0;
    this.buffer = null;
    this.peaks = new Float32Array(0);
    this.cues = [null, null, null, null];
    this.mainCue = null;
    this.loop = null;
    this.setPitch(0);
    this.loadError = null;
    this.phase = 'idle';
    this.pct = 0;
    this.detail = '';
    this.vu = 0;
  }

  // ============ TRANSPORT ============

  play(from?: number): void {
    if (!this.buffer) return;
    this.ctx.resume().catch(() => {});
    const offset = Math.max(0, Math.min(
      from !== undefined ? from : this.startOffset,
      this.buffer.duration - 0.02));
    this.stopSource(true);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    if (this.loop) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    src.connect(this.input);
    src.onended = () => {
      if (this.stopIntent) return;
      this.playing = false;
      this.startOffset = this.buffer ? this.buffer.duration : 0;
      this.loop = null;
      this.onEnded?.();
    };
    src.start(0, offset);
    this.source = src;
    this.startOffset = offset;
    this.startCtxTime = this.ctx.currentTime;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    const pos = this.position;
    this.stopSource(true);
    this.startOffset = pos;
    this.playing = false;
  }

  toggle(): void { this.playing ? this.pause() : this.play(); }

  seek(pos: number): void {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(pos, this.buffer.duration));
    if (this.playing) this.play(clamped);
    else this.startOffset = clamped;
  }

  /** Comportement CUE (facon platine) :
   *  - en lecture : retour au cue et PAUSE ;
   *  - en pause : va au cue et DEMARRE (pre-ecoute) ;
   *  - sans cue enregistre : pose le cue a la position courante. */
  cue(): void {
    if (!this.buffer) return;
    if (this.playing) {
      const cuePos = this.mainCue ?? 0;
      this.pause();
      this.seek(cuePos);
    } else if (this.mainCue != null) {
      this.play(this.mainCue);
    } else {
      this.mainCue = Math.max(0, this.position - 0.05);
      this.seek(this.mainCue);
    }
  }

  setCuePad(index: number): void {
    if (!this.buffer) return;
    const existing = this.cues[index];
    if (existing == null) {
      this.cues[index] = Math.max(0, this.position - 0.02);
    } else {
      this.play(existing);
    }
  }

  clearCuePad(index: number): void { this.cues[index] = null; }

  // ============ BOUCLES (precises a l'echantillon) ============

  setLoopBars(bars: number, bpm: number | null): void {
    if (!this.buffer) return;
    if (this.loop && this.loop.bars === bars) { this.clearLoop(); return; }
    const beatLen = bpm && bpm > 0 ? 60 / bpm : 0.5;
    const len = bars * 4 * beatLen;
    const start = this.position;
    const end = Math.min(start + len, this.buffer.duration);
    this.loop = { start, end: Math.max(start + 0.05, end), bars };
    this.applyLoopToSource();
  }

  clearLoop(): void {
    this.loop = null;
    this.applyLoopToSource();
  }

  private applyLoopToSource(): void {
    if (!this.source) return;
    if (this.loop) {
      this.source.loop = true;
      this.source.loopStart = this.loop.start;
      this.source.loopEnd = this.loop.end;
    } else {
      this.source.loop = false;
    }
  }

  // ============ PITCH / SYNC ============

  setPitch(pct: number): void {
    const clamped = Math.max(-8, Math.min(8, pct));
    // Rebase le calcul de position avant de changer la vitesse
    if (this.playing) {
      const pos = this.position;
      this.startOffset = pos;
      this.startCtxTime = this.ctx.currentTime;
    }
    this.pitchPct = clamped;
    this.rate = 1 + clamped / 100;
    if (this.source) this.source.playbackRate.value = this.rate;
  }

  /** Nudge temporaire (pitch-bend) : decale la vitesse pendant l'appui. */
  private baseRate(): number { return 1 + this.pitchPct / 100; }
  nudgeStart(direction: 1 | -1): void {
    if (!this.playing || !this.source) return;
    const pos = this.position;
    this.startOffset = pos;
    this.startCtxTime = this.ctx.currentTime;
    this.rate = this.baseRate() + direction * 0.06;
    this.source.playbackRate.value = this.rate;
  }
  nudgeEnd(): void {
    if (!this.playing || !this.source) return;
    const pos = this.position;
    this.startOffset = pos;
    this.startCtxTime = this.ctx.currentTime;
    this.rate = this.baseRate();
    this.source.playbackRate.value = this.rate;
  }

  // ============ MIX ============

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.channelGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
  }

  /** Facteur crossfader applique par l'engine (seul orchestrateur autorise). */
  applyCrossFactor(factor: number): void {
    this.crossGain.gain.setTargetAtTime(factor, this.ctx.currentTime, 0.01);
  }

  setEq(band: 'low' | 'mid' | 'high', db: number): void {
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.02);
  }

  /** Filtre bipolaire : 0.5 = neutre ; <0.5 passe-bas ; >0.5 passe-haut. */
  setFilter(pos: number): void {
    const p = Math.max(0, Math.min(1, pos));
    const t = this.ctx.currentTime;
    if (p <= 0.5) {
      // LPF descend de 22050 Hz a 200 Hz ; HPF neutre
      const ratio = 1 - p * 2;            // 0..1
      this.lpf.frequency.setTargetAtTime(22050 * Math.pow(200 / 22050, ratio), t, 0.03);
      this.hpf.frequency.setTargetAtTime(10, t, 0.03);
    } else {
      // HPF monte de 20 Hz a 4000 Hz ; LPF neutre
      const ratio = (p - 0.5) * 2;         // 0..1
      this.hpf.frequency.setTargetAtTime(20 * Math.pow(4000 / 20, ratio), t, 0.03);
      this.lpf.frequency.setTargetAtTime(22050, t, 0.03);
    }
  }

  setEcho(on: boolean, wet = 0.5, beatSyncSec?: number): void {
    const t = this.ctx.currentTime;
    if (beatSyncSec && beatSyncSec > 0.05) {
      this.echo.delayTime.setTargetAtTime(Math.min(1.9, beatSyncSec), t, 0.05);
    }
    this.echoWet.gain.setTargetAtTime(on ? wet : 0, t, 0.05);
  }

  setEchoFeedback(f: number): void {
    this.echoFeedback.gain.setTargetAtTime(Math.max(0, Math.min(0.85, f)), this.ctx.currentTime, 0.05);
  }

  setReverb(on: boolean, wet = 0.4): void {
    this.reverbWet.gain.setTargetAtTime(on ? wet : 0, this.ctx.currentTime, 0.05);
  }

  /** Flanger : sweep de peigne lent (effet "avion") — depth 0..1. */
  setFlanger(on: boolean, wet = 0.5): void {
    this.flangerWet.gain.setTargetAtTime(on ? wet : 0, this.ctx.currentTime, 0.08);
  }

  // ============ PERFORMANCE DJ (couche V2 — gestes temps réel) ============

  /** Boucle EXPLICITE (région en secondes piste) — utilisée par le moteur de
   *  performance pour les loop rolls 4→2→1→½ temps calés sur la grille.
   *  Appliquée à la source vivante : le bouclage est précis à l'échantillon. */
  setLoopRegion(startSec: number, endSec: number, bars = 0): void {
    if (!this.buffer) return;
    const start = Math.max(0, Math.min(startSec, this.buffer.duration - 0.05));
    const end = Math.max(start + 0.04, Math.min(endSec, this.buffer.duration));
    this.loop = { start, end, bars };
    this.applyLoopToSource();
  }

  /** Vitesse BRUTE (hors clamp pitch ±8 %) avec rebasage de position —
   *  nécessaire pour brake / spinback / pitch ramp du moteur de performance. */
  applyRawRate(rate: number): void {
    const r = Math.max(0.02, Math.min(3, rate));
    if (this.playing) {
      const pos = this.position;
      this.startOffset = pos;
      this.startCtxTime = this.ctx.currentTime;
    }
    this.rate = r;
    if (this.source) this.source.playbackRate.value = r;
  }

  get rawRate(): number { return this.rate; }

  /** VINYL BRAKE : la platine ralentit jusqu'à l'arrêt (frein vinyle).
   *  Retourne la durée réelle (ms). La source est ensuite stoppée. */
  brake(durMs = 420): number {
    if (!this.playing || !this.source) return 0;
    const from = this.rate;
    const t0 = this.ctx.currentTime;
    // rate → presque zéro (exponentiel : la rotation s'effondre)
    this.source.playbackRate.setValueAtTime(from, t0);
    this.source.playbackRate.exponentialRampToValueAtTime(0.02, t0 + durMs / 1000);
    // le filtre se ferme en même temps (impression mécanique)
    this.setFilter(Math.max(0, 0.5 - 0.5 * (durMs / 600)));
    setTimeout(() => {
      this.pause();
      this.applyRawRate(this.baseRate());
      this.setFilter(0.5);
    }, durMs + 60);
    return durMs;
  }

  /** SPINBACK : le morceau repart EN ARRIÈRE (extrait inversé, accéléré) —
   *  le geste de coupe spectaculaire. Durée ~200-350 ms. */
  spinback(durMs = 280): number {
    if (!this.buffer || !this.source) return 0;
    const pos = this.position;
    const rate = this.rate;
    const backLen = Math.min((durMs / 1000) * 2.2 * rate, pos);
    if (backLen < 0.12) { this.brake(durMs); return durMs; }
    // buffer inversé de la fin du morceau
    const rate2 = Math.max(1, rate);
    const rev = this.ctx.createBuffer(
      this.buffer.numberOfChannels,
      Math.floor(backLen * this.buffer.sampleRate),
      this.buffer.sampleRate);
    const startS = Math.floor((pos - backLen) * this.buffer.sampleRate);
    const lenS = rev.length;
    for (let ch = 0; ch < this.buffer.numberOfChannels; ch++) {
      const src = this.buffer.getChannelData(ch);
      const dst = rev.getChannelData(ch);
      for (let i = 0; i < lenS; i++) dst[i] = src[startS + lenS - 1 - i] || 0;
    }
    this.stopSource(true);
    this.playing = false;
    const src = this.ctx.createBufferSource();
    src.buffer = rev;
    src.playbackRate.setValueAtTime(0.55 * rate2, this.ctx.currentTime);
    src.playbackRate.linearRampToValueAtTime(2.1 * rate2, this.ctx.currentTime + durMs / 1000);
    src.connect(this.input);
    src.start(0);
    src.onended = () => { try { src.disconnect(); } catch { } };
    // le playhead « virtuel » reste au point de coupe pour le suivi UI
    this.startOffset = pos;
    return durMs;
  }

  /** GATE / STUTTER : coupure rythmique du volume de voie (grille 1/16),
   *  n beats — automation d'enveloppe carrée sur le fader. */
  gateStutter(beats: number, duty = 0.5): void {
    if (!this.buffer) return;
    const bpm = (this.track?.bpm || 105) * this.rate;
    const step = (60 / bpm) / 4;           // 1/16 de temps
    const vol = this.volume > 0.05 ? this.volume : 0.8;
    const t0 = this.ctx.currentTime + 0.01;
    const n = Math.max(1, Math.round(beats * 4));
    const g = this.channelGain.gain;
    try { g.cancelScheduledValues(0); } catch { }
    g.setValueAtTime(vol, t0);
    for (let i = 1; i <= n; i++) {
      const t = t0 + i * step;
      const up = (i % 2 === 0) ? vol : vol * (1 - duty);
      g.setValueAtTime(up, t);
    }
    g.setValueAtTime(vol, t0 + (n + 1) * step);
  }

  /** Accès direct au fader de voie (performance automation). */
  setVolumeRamp(to: number, durSec = 0.2): void {
    const v = Math.max(0, Math.min(1, to));
    this.volume = v;
    this.channelGain.gain.setTargetAtTime(v, this.ctx.currentTime, Math.max(0.01, durSec / 3));
  }

  /** Filtre : pose une valeur en RAMPE linéaire (automation continue). */
  setFilterRamp(toPos: number, durSec = 0.4): void {
    const p = Math.max(0, Math.min(1, toPos));
    const t = this.ctx.currentTime;
    const cur = this.filterPos;
    const steps = Math.max(2, Math.ceil(durSec / 0.05));
    for (let i = 1; i <= steps; i++) {
      const v = cur + (p - cur) * (i / steps);
      // interpolation exponentielle des fréquences comme setFilter
      this.setFilterAt(v, t + (durSec * i / steps));
    }
    this.filterPos = p;
  }

  private filterPos = 0.5;

  private setFilterAt(p: number, t: number): void {
    if (p <= 0.5) {
      const ratio = 1 - p * 2;
      this.lpf.frequency.setValueAtTime(22050 * Math.pow(200 / 22050, ratio), t);
      this.hpf.frequency.setValueAtTime(10, t);
    } else {
      const ratio = (p - 0.5) * 2;
      this.hpf.frequency.setValueAtTime(20 * Math.pow(4000 / 20, ratio), t);
      this.lpf.frequency.setValueAtTime(22050, t);
    }
  }

  updateVu(): void {
    if (!this.playing) { this.vu *= 0.85; return; }
    this.analyser.getByteTimeDomainData(this.vuData);
    let sum = 0;
    for (let i = 0; i < this.vuData.length; i++) {
      const v = (this.vuData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.vuData.length);
    this.vu = Math.max(this.vu * 0.6, Math.min(1, rms * 2.2));
  }

  // ============ interne ============

  private stopSource(manual: boolean): void {
    if (this.source) {
      this.stopIntent = manual;
      try { this.source.onended = null; } catch { }
      try { this.source.stop(); } catch { }
      try { this.source.disconnect(); } catch { }
      this.source = null;
    }
  }

  destroy(): void {
    this.stopSource(true);
    try { this.input.disconnect(); this.channelGain.disconnect(); this.crossGain.disconnect(); } catch { }
  }
}

/** ============================================================================
 *  ENGINE — contexte audio, crossfader, master, enregistreur
 *  ==========================================================================*/
export class DjEngine {
  readonly ctx: AudioContext;
  readonly deckA: DjDeck;
  readonly deckB: DjDeck;
  private readonly masterGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly masterAnalyser: AnalyserNode;
  private readonly masterVuData: Uint8Array;
  private readonly streamDest: MediaStreamAudioDestinationNode;
  /** Bus FX public : les one-shots du moteur de performance (riser, impact,
   *  sirene...) s'y branchent — ils passent dans le master et l'enregistrement. */
  readonly fxBus: GainNode;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  recording = false;
  recStartedAt = 0;
  masterVu = 0;
  crossfade = 0.5;
  masterVolume = 0.9;

  onDeckEnded: ((deck: DjDeck) => void) | null = null;

  constructor() {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC() as AudioContext;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.75;
    this.masterVuData = new Uint8Array(this.masterAnalyser.fftSize);
    this.streamDest = this.ctx.createMediaStreamDestination();
    this.fxBus = this.ctx.createGain();
    this.fxBus.gain.value = 0.9;
    this.fxBus.connect(this.masterGain);

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.masterAnalyser.connect(this.streamDest);

    this.deckA = new DjDeck('A', this.ctx, this.masterGain);
    this.deckB = new DjDeck('B', this.ctx, this.masterGain);
    this.deckA.onEnded = () => this.onDeckEnded?.(this.deckA);
    this.deckB.onEnded = () => this.onDeckEnded?.(this.deckB);
    this.setCrossfade(0.5);
  }

  setCrossfade(x: number): void {
    this.crossfade = Math.max(0, Math.min(1, x));
    const a = Math.cos(this.crossfade * Math.PI / 2);
    const b = Math.sin(this.crossfade * Math.PI / 2);
    this.deckA.applyCrossFactor(a);
    this.deckB.applyCrossFactor(b);
  }

  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
  }

  updateVu(): void {
    this.deckA.updateVu();
    this.deckB.updateVu();
    if (!this.deckA.playing && !this.deckB.playing) { this.masterVu *= 0.85; return; }
    this.masterAnalyser.getByteTimeDomainData(this.masterVuData);
    let sum = 0;
    for (let i = 0; i < this.masterVuData.length; i++) {
      const v = (this.masterVuData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.masterVuData.length);
    this.masterVu = Math.max(this.masterVu * 0.6, Math.min(1, rms * 2.2));
  }

  // ============ ENREGISTREMENT DU MIX ============

  get canRecord(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!this.streamDest;
  }

  startRecording(): boolean {
    if (!this.canRecord || this.recording) return false;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
    this.recChunks = [];
    this.recorder = new MediaRecorder(this.streamDest.stream, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.recChunks.push(e.data);
    };
    this.recorder.start(1000);
    this.recording = true;
    this.recStartedAt = this.ctx.currentTime;
    return true;
  }

  stopRecording(): Promise<Blob | null> {
    return new Promise(resolve => {
      const rec = this.recorder;
      if (!rec || rec.state === 'inactive') { this.recording = false; resolve(null); return; }
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(this.recChunks, { type });
        this.recording = false;
        this.recorder = null;
        resolve(blob.size > 0 ? blob : null);
      };
      try { rec.stop(); } catch { this.recording = false; resolve(null); }
    });
  }

  get recordDurationSec(): number {
    return this.recording ? Math.max(0, this.ctx.currentTime - this.recStartedAt) : 0;
  }

  destroy(): void {
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch { }
    this.deckA.destroy();
    this.deckB.destroy();
    this.ctx.close().catch(() => { });
  }
}

