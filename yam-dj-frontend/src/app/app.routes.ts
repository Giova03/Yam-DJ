import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'search', loadComponent: () => import('./pages/search/search.component').then(m => m.SearchComponent) },
  { path: 'artist/:id', loadComponent: () => import('./pages/artist/artist.component').then(m => m.ArtistComponent) },
  { path: 'upload', canActivate: [authGuard], loadComponent: () => import('./pages/upload/upload.component').then(m => m.UploadComponent) },
  { path: 'dj-studio', canActivate: [authGuard], loadComponent: () => import('./pages/dj-studio/dj-studio.component').then(m => m.DjStudioComponent) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'admin', canActivate: [authGuard], loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent) },
  { path: 'tip/success', loadComponent: () => import('./pages/tip-success/tip-success.component').then(m => m.TipSuccessComponent) },
  { path: '**', redirectTo: '' }
];
