import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'youtube', loadComponent: () => import('./pages/youtube/youtube.component').then(m => m.YoutubeComponent) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'oauth/callback', loadComponent: () => import('./pages/oauth-callback/oauth-callback.component').then(m => m.OauthCallbackComponent) },
  { path: 'forgot-password', canActivate: [guestGuard], loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./pages/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
  { path: 'stats', canActivate: [authGuard], loadComponent: () => import('./pages/stats/stats.component').then(m => m.StatsComponent) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'search', loadComponent: () => import('./pages/search/search.component').then(m => m.SearchComponent) },
  { path: 'artist/:id', loadComponent: () => import('./pages/artist/artist.component').then(m => m.ArtistComponent) },
  { path: 'upload', canActivate: [authGuard], loadComponent: () => import('./pages/upload/upload.component').then(m => m.UploadComponent) },
  { path: 'playlists', canActivate: [authGuard], loadComponent: () => import('./pages/playlists/playlists.component').then(m => m.PlaylistsComponent) },
  { path: 'playlist/:id', canActivate: [authGuard], loadComponent: () => import('./pages/playlist/playlist.component').then(m => m.PlaylistComponent) },
  { path: 'dj-studio', canActivate: [authGuard], loadComponent: () => import('./pages/dj-studio/dj-studio.component').then(m => m.DjStudioComponent) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent) },
  { path: 'track/:id', loadComponent: () => import('./pages/track/track.component').then(m => m.TrackComponent) },
  { path: 'admin', canActivate: [authGuard], loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent) },
  { path: 'tip/success', loadComponent: () => import('./pages/tip-success/tip-success.component').then(m => m.TipSuccessComponent) },
  { path: 'local', loadComponent: () => import('./pages/local/local.component').then(m => m.LocalComponent) },
  { path: 'downloads', loadComponent: () => import('./pages/downloads/downloads.component').then(m => m.DownloadsComponent) },
  { path: 'charts', loadComponent: () => import('./pages/charts/charts.component').then(m => m.ChartsComponent) },
  { path: 'features', loadComponent: () => import('./pages/features/features.component').then(m => m.FeaturesComponent) },
  { path: 'premium', loadComponent: () => import('./pages/premium/premium.component').then(m => m.PremiumComponent) },
  { path: 'premium/success', loadComponent: () => import('./pages/premium-success/premium-success.component').then(m => m.PremiumSuccessComponent) },
  { path: '**', redirectTo: '' }
];
