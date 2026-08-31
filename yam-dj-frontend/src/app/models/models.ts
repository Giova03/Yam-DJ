/** Models TypeScript alignes sur les DTOs du backend Spring Boot. */

export interface User {
  id: string;
  email: string;
  pseudo: string;
  role: 'USER' | 'ARTIST' | 'DJ' | 'ADMIN';
  country: string;
  avatarUrl?: string;
  emailVerified: boolean;
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
