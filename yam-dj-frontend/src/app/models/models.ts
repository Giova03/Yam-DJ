/** Models TypeScript alignes sur les DTOs du backend Spring Boot. */

export interface User {
  id: string;
  email: string;
  pseudo: string;
  role: 'USER' | 'ARTIST' | 'DJ' | 'ADMIN';
  country: string;
  avatarUrl?: string;
  emailVerified: boolean;
  /** Premium Fan actif jusqu'a (ISO) — null/expire = compte standard. */
  premiumUntil?: string;
  premium?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  artistPseudo: string;
  audioUrlHq?: string;
  audioUrlLq?: string;
  coverUrl?: string;
  durationSec: number;
  bpm?: number;
  musicalKey?: string;
  camelot?: string;
  genre?: string;
  country?: string;
  playCount: number;
  likeCount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  dataLiteReady: boolean;
  createdAt: string;
}

export interface TrackPage {
  content: Track[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Mixtape {
  id: string;
  djId: string;
  djName: string;
  title: string;
  coverUrl?: string;
  audioUrl?: string;
  durationSec: number;
  trackIds: string;
  crossfadeSec: number;
  playCount: number;
  /** Prix FCFA (0 = gratuite) — boutique Phase 3.4. */
  priceXof?: number;
  /** Deja achetee par l'utilisateur courant (null si gratuite). */
  purchased?: boolean | null;
  createdAt: string;
}

export interface ArtistPublic {
  userId: string;
  stageName: string;
  bio?: string;
  photoUrl?: string;
  country?: string;
  totalPlays: number;
  tracksCount: number;
}

export interface SearchResults {
  tracks: Track[];
  artists: ArtistPublic[];
  djs: DjPublic[];
}

export interface DjPublic {
  userId: string;
  djName: string;
  bio?: string;
  photoUrl?: string;
  mixtapeCount: number;
}

export interface AuthResponse {
  token?: string;
  email: string;
  pseudo: string;
  role: string;
  emailVerified: boolean;
  message: string;
}

export interface TipResponse {
  tipId: string;
  paymentToken: string;
  paymentUrl?: string;
  amountXof: number;
  status: string;
}

export interface ArtistStats {
  artistId: string;
  stageName: string;
  balanceXof: number;
  totalPlays: number;
  totalTipsXof: number;
  tipsCount: number;
  tracksCount: number;
  fansCount: number;
}

export interface TipHistory {
  id: string;
  amountXof: number;
  message?: string;
  status: string;
  fanPseudo: string;
  createdAt: string;
}

export interface AutoMixSuggestion {
  orderedTrackIds: string[];
  averageBpm: number;
  transitionsCount: number;
  analysis: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  isPublic: boolean;
  trackIds: string[];
  createdAt: string;
}

export interface Comment {
  id: string;
  trackId: string;
  userId: string;
  pseudo: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;
}

/** Entree du chart hebdomadaire (agregation des ecoutes de la semaine). */
export interface ChartEntry {
  rank: number;
  trackId: string;
  plays: number;
  weekStart: string;
  country?: string;
  track?: Track;
}

/** Notification in-app (centre de notifications + push Web). */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
  read: boolean;
  createdAt: string;
}

/** Reponse d'initiation d'abonnement Premium (paiement FedaPay). */
export interface PremiumResponse {
  orderId: string;
  paymentToken: string;
  paymentUrl?: string;
  amountXof: number;
  status: string;
}

/** Demande de retrait artiste (mobile money, validation admin). */
export interface WithdrawalRequest {
  id: string;
  amountXof: number;
  operator: string;
  phone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNote?: string;
  pseudo?: string;
  createdAt: string;
  processedAt?: string;
}

/** Ligne mensuelle de redevances creditee a un artiste (Phase 3.3). */
export interface RoyaltyLine {
  periodMonth: string;
  plays: number;
  amountXof: number;
  balanceAfterXof: number;
}

export interface ArtistRoyalties {
  totalXof: number;
  totalPlays: number;
  monthsCount: number;
  lines: RoyaltyLine[];
}

/** Pool mensuel des redevances (vue admin). */
export interface RoyaltyPool {
  id: string;
  periodMonth: string;
  poolAmountXof: number;
  premiumShareXof: number;
  mixtapeShareXof: number;
  totalPlays: number;
  artistCount: number;
  status: string;
  distributedAt?: string;
}

/** Reponse d'initiation d'achat de mixtape (boutique 3.4). */
export interface MixtapePurchaseResponse {
  purchaseId: string;
  mixtapeId: string;
  mixtapeTitle: string;
  paymentToken: string;
  paymentUrl?: string;
  amountXof: number;
  djShareXof: number;
  status: string;
}

/** Configuration de la pub non intrusive (Phase 3.5). */
export interface AdConfig {
  enabled: boolean;
  intervalTracks: number;
  maxDurationSec: number;
  text: string;
  audioUrl: string;
}

/** Piste telechargee pour l'ecoute hors ligne (cache du navigateur). */
export interface DownloadedTrack {
  id: string;
  title: string;
  artistName: string;
  coverUrl?: string;
  audioUrlLq?: string;
  audioUrlHq?: string;
  durationSec: number;
  downloadedAt: string;
  sizeBytes?: number;
}
