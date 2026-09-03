import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse } from '../models/models';

/**
 * Service d'authentification : JWT stocke en localStorage,
 * etat reactif via signals, login/register/verification email.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = environment.apiUrl;

  private readonly TOKEN_KEY = 'yam_token';
  private readonly USER_KEY = 'yam_user';

  private userSubject = new BehaviorSubject<any>(this.restoreUser());
  user$ = this.userSubject.asObservable();

  isLoggedInSignal = signal<boolean>(this.hasToken());
  currentUser = signal<any>(this.restoreUser());
  userRole = computed<string>(() => this.currentUser()?.role || 'USER');

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/login`, { email, password })
      .pipe(tap((res: AuthResponse) => this.handleAuth(res)));
  }

  register(data: {
    email: string; password: string; pseudo: string;
    role: string; phone?: string; country?: string; stageName?: string;
  }) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/register`, data);
  }

  verifyEmail(email: string, code: string) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/verify-email`, { email, code })
      .pipe(tap((res: AuthResponse) => this.handleAuth(res)));
  }

  resendVerification(email: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/resend-verification`, { email });
  }

  /** MOT DE PASSE OUBLIE : envoi du lien de reinitialisation par email. */
  forgotPassword(email: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/forgot-password`, { email });
  }

  /** NOUVEAU MOT DE PASSE : application du token recu par email. */
  resetPassword(token: string, newPassword: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/reset-password`, {
      token, newPassword
    });
  }

  // ============ CONNEXION GOOGLE (OAuth 2.0) ============

  /** Etat de la connexion Google cote serveur (bouton affiche ou non). */
  googleStatus(): Observable<{ enabled: boolean; redirectUri: string }> {
    return this.http.get<{ enabled: boolean; redirectUri: string }>(
      `${this.apiUrl}/api/auth/oauth/google/status`);
  }

  /**
   * Demarre la connexion Google : recupere l'URL de consentement depuis le
   * serveur puis redirige le navigateur. role = role souhaite pour un
   * NOUVEAU compte (USER | ARTIST | DJ).
   * Retourne une erreur si le serveur ne connait pas encore la route
   * (backend pas encore deploye) ou si Google n'est pas configure.
   */
  googleLogin(role: string = 'USER'): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(
      `${this.apiUrl}/api/auth/oauth/google/url?role=${encodeURIComponent(role)}`);
  }

  /**
   * Retour du backend apres Google : le JWT arrive dans le fragment d'URL
   * (#token=...&email=...) — jamais dans les logs serveur. Stocke la
   * session comme un login classique.
   */
  applyOAuthFragment(fragment: string): { ok: boolean; error?: string } {
    const params = new URLSearchParams(fragment);
    const error = params.get('error');
    if (error) return { ok: false, error };
    const token = params.get('token');
    if (!token) return { ok: false, error: 'Connexion Google sans jeton' };
    this.handleAuth({
      token,
      email: params.get('email') || '',
      pseudo: params.get('pseudo') || '',
      role: params.get('role') || 'USER',
      emailVerified: params.get('emailVerified') === 'true'
    } as AuthResponse);
    return { ok: true };
  }

  me() {
    return this.http.get<any>(`${this.apiUrl}/api/me`);
  }

  logout(): void {
    // LOGOUT REEL (securite P0) : le JWT est revoque cote serveur (liste
    // noire) avant d'etre supprime localement — un token vole cesse de
    // fonctionner des le logout.
    const token = this.token();
    if (token) {
      this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/logout`, {})
        .subscribe({ error: () => {} }); // fire-and-forget : jamais bloquant
    }
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.userSubject.next(null);
    this.currentUser.set(null);
    this.isLoggedInSignal.set(false);
    this.router.navigate(['/login']);
  }

  token(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return this.hasToken();
  }

  role(): string {
    return this.currentUser()?.role || 'USER';
  }

  userId(): string | null {
    return this.currentUser()?.id || null;
  }

  private handleAuth(res: AuthResponse): void {
    if (res.token) {
      localStorage.setItem(this.TOKEN_KEY, res.token);
      const user = { email: res.email, pseudo: res.pseudo, role: res.role, emailVerified: res.emailVerified };
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      this.userSubject.next(user);
      this.currentUser.set(user);
      this.isLoggedInSignal.set(true);
    }
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  private restoreUser(): any {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
