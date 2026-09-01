import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Bloque l'acces aux routes privees si non connecte. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

/** Redirige vers l'accueil les utilisateurs deja connectes (login/register). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    router.navigate(['/']);
    return false;
  }
  return true;
};

/** Verifie un role precis (ARTIST, DJ, ADMIN). */
export const roleGuard = (roles: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.isLoggedIn() && roles.includes(auth.role())) return true;
    router.navigate(['/']);
    return false;
  };
};
