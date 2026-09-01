import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, timer } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Resilience anti "cold start" (plan gratuit Render) :
 * le serveur s'endort apres ~15 min sans trafic ; la premiere requete
 * peut alors mettre 50-90 s ou echouer (0 / 502 / 503 / 504). On retente
 * automatiquement UNE fois apres un delai, sauf pour les erreurs metier
 * (4xx = le serveur a repondu, pas la peine d'insister).
 */
const RETRYABLE_STATUS = [0, 502, 503, 504];
const RETRY_DELAY_MS = 5000;
const MSG_REVEIL = 'Le serveur etait en veille, il se reveille : reessaie dans quelques secondes.';

/** Injecte le token JWT + retente les requetes victimes du reveil serveur. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  // Upload multipart : pas de retry auto (un second envoi doublerait la charge
  // et le navigateur gere le transfert), mais message explicite au'utilisateur.
  const isUpload = req.body instanceof FormData;

  return next(request).pipe(
    catchError((err: any) => {
      const status = err?.status ?? 0;
      if (isUpload) {
        if (status === 0) {
          return throwError(() => avecMessage(err, 'Le serveur se reveille (jusqu\'a 1 min) : le temps de recharger, puis relance l\'upload.'));
        }
        return throwError(() => err);
      }
      if (!RETRYABLE_STATUS.includes(status)) {
        return throwError(() => err);
      }
      // Une seule retentative, 5 s plus tard.
      return timer(RETRY_DELAY_MS).pipe(
        switchMap(() => next(request)),
        catchError((err2: any) => {
          const status2 = err2?.status ?? 0;
          return throwError(() => (RETRYABLE_STATUS.includes(status2) ? avecMessage(err2, MSG_REVEIL) : err2));
        })
      );
    })
  );
};

/** Place un message lisible la ou les composants le cherchent (err.error.message). */
function avecMessage(err: any, message: string): any {
  try {
    const errorBody = (err && typeof err.error === 'object' && err.error !== null)
      ? { ...err.error } : {};
    if (!errorBody.message) {
      errorBody.message = message;
    }
    return { ...err, error: errorBody };
  } catch {
    return err;
  }
}
