# 🎧 YAM DJ — Plateforme de Streaming Musical Africaine

<p align="center">
  <img src="docs/yam-dj-logo-banner.png" alt="YAM DJ — La musique africaine qui vibre" width="720">
</p>

> **"La musique africaine qui vibre"** — Streaming + Studio DJ Web + Monétisation artistes
> Cible : Afrique francophone (lancement Burkina Faso 🇧🇫)

YAM DJ est une plateforme complète qui combine le meilleur de Spotify, SoundCloud et Mixcloud,
optimisée pour les réalités africaines : connexions 2G/3G, paiement mobile money, et scène
musicale locale ultra-dynamique.

**🟢 Sites en production :**
- **Frontend** : https://yam-dj-frontend.vercel.app (déploiement auto depuis GitHub)
- **Backend API** : https://yam-dj.onrender.com

---

## 🚀 Différenciateurs produit

| Fonctionnalité | Description | Technologie |
|---|---|---|
| 🎚️ **Studio DJ PRO** | 2 decks temps réel : waveform réelle, EQ 3 bandes, filtre, echo/reverb/flanger avec intensité réglable, presets CLUB/SPACE/SWEEP, sync BPM, boucles exactes, hot cues | Web Audio API |
| 📂 **Ma musique locale** | Le DJ charge SES fichiers (mp3, m4a, wav, flac) dans les decks — **BPM détecté automatiquement** dans le navigateur, sans upload | File API + détection d'onsets |
| 🤖 **Auto-Mix IA** | Ordonne les pistes d'un mix selon la compatibilité harmonique (Camelot Wheel) et le BPM | Java (moteur glouton) |
| 🔐 **Connexion Google** | Inscription/connexion en 1 clic via Google OAuth (compte ARTIST ou DJ automatiquement créé) | OAuth 2.0 côté serveur |
| 📱 **Mode Data-Lite** | Streaming 48 kbps mono = **3x moins de data** pour les connexions lentes | FFmpeg + HLS.js + Network API |
| 🪩 **Mode Nightclub** | Bass boost + reverb club en temps réel pendant l'écoute | Web Audio API |
| 💰 **YAM Tips** | Soutien aux artistes en 1 clic via **Orange Money / Moov / MTN / Wave** | FedaPay API |
| 🗂 **Playlists** | Playlists personnelles et publiques, ajout en 1 clic depuis les cartes | Angular 17 + API REST |
| 🎛️ **Mixtapes** | Rendu crossfade réel côté serveur + **enregistrement du mix live en studio** (publication ou téléchargement) | FFmpeg xfade + MediaRecorder |
| 📊 **Dashboard Artiste** | Solde FCFA, stats, historique tips, notifications temps réel | WebSocket STOMP |
| ✅ **Moderation** | Auto-approbation (visible immédiatement) ou file de validation stricte | Spring Security roles |
| 📂 **Ma Musique locale** | Lecture des musiques du téléphone/ordinateur (tags ID3, pochette, écran verrouillé) — 100% hors ligne | File API + MediaSession |
| 📈 **Charts hebdomadaires** | Top des écoutes de la semaine, global et par pays, rafraîchi toutes les heures | Job @Scheduled + PostgreSQL |
| 🔔 **Notifications push** | Centre in-app + Web Push VAPID (nouveaux sons des artistes suivis, tips reçus, retraits) | PWA + RFC 8030/8292 |
| ⭐ **Premium Fan** | Abonnement 500 F / 30 jours via mobile money, badge supporteur | FedaPay + webhook |
| 💸 **Retraits artistes** | Solde -> mobile money, validation admin, min 5 000 F | FedaPay + Brevo |
| 🔍 **SEO** | Sitemap dynamique, robots.txt, Open Graph (bannière 1200x630), slugs publics, PWA installable | Render + Vercel rewrites |

---

## 📁 Structure du projet

```
yam-dj-backend/          → Spring Boot 3.2 (Java 17)
yam-dj-frontend/         → Angular 17 (Standalone Components) + TailwindCSS
docs/                    → Logo, identité visuelle, conception mobile
```

### Stack technique

- **Backend** : Spring Boot 3.2.5, Spring Security (JWT), Spring Data JPA, WebSocket STOMP
- **Frontend** : Angular 17, TailwindCSS 3.4, HLS.js, Web Audio API
- **Base de données** : PostgreSQL (**Supabase** — gratuit, région eu-central-1)
- **Stockage** : **Supabase Storage** (bucket `media`, public, 50 Mo/fichier) — mode local de secours si la clé service_role n'est pas configurée
- **Paiement** : **FedaPay** (Orange Money, Moov Money, MTN, Wave) — *CinetPay n'est plus utilisé*
- **Emails** : Brevo (300/jour gratuits — expéditeur vérifié requis)
- **Authentification sociale** : Google OAuth 2.0 (backend)
- **Hébergement** : Render.com (backend Docker + FFmpeg) + Vercel (frontend, déploiement auto sur push)

---

## 🖥️ Lancement local — GUIDE PAS À PAS

### Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Java JDK | 17+ | `java -version` |
| Maven | 3.8+ | `mvn -version` |
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| FFmpeg | 6+ | `ffmpeg -version` |
| PostgreSQL | 15+ (ou Supabase) | `psql --version` |

**Installation FFmpeg** (indispensable pour le traitement audio) :
- **Ubuntu/Debian** : `sudo apt install ffmpeg`
- **Windows** : `winget install ffmpeg` puis redémarrer le terminal
- **macOS** : `brew install ffmpeg`

---

### 1️⃣ Backend Spring Boot

```bash
cd yam-dj-backend

# a) Créer le fichier d'environnement puis renseigner vos clés
cp .env.example .env
# → Ouvrir .env et remplir : Supabase, JWT, FedaPay, Brevo (voir sections configuration)

# b) Builder
mvn clean package -DskipTests

# c) Lancer (le schema.sql s'exécute automatiquement au démarrage)
mvn spring-boot:run
```

✅ Backend démarre sur **http://localhost:8080** — vérification :
```bash
curl http://localhost:8080/actuator/health
# {"status":"UP"}
```

> **Note Supabase (vérifiée en conditions réelles)** : `db.xxx.supabase.co` est **IPv6 only**.
> Sur un réseau/hébergeur IPv4 (Render, Docker...), utiliser le **pooler** :
> `DB_HOST=aws-0-eu-central-1.pooler.supabase.com` et
> `DB_USER=postgres.<project-ref>` (ex : `postgres.abcdefghijkl123456`),
> disponibles dans Project Settings > Database > Connection string (mode *Session*, port 5432).

### 2️⃣ Frontend Angular

```bash
cd yam-dj-frontend

# a) Installer les dépendances
npm install

# b) Lancer le serveur de dev (proxy /api -> localhost:8080)
npm start
```

✅ Frontend démarre sur **http://localhost:4200**

### 3️⃣ Comptes de démonstration

Comptes réels en production (https://yam-dj-frontend.vercel.app).

> 🔒 **Sécurité** : plus AUCUN mot de passe dans ce dépôt public —
> les identifiants sont communiqués en privé à l'équipe uniquement.
> Utilise « Mot de passe oublié » sur la page de connexion, ou demande-les
> à l'administrateur.

| Compte | Email | Rôle |
|---|---|---|
| DJ | `dj@yamdj.africa` | DJ (studio + mixtapes) |
| Artiste | `artist@yamdj.africa` | ARTIST (upload + tips) |

> 🧹 Les comptes/pistes/mixtapes de démo (`@demo.yamdj.africa`,
> « Ouaga Flow », « Abidjan Nuit », etc.) ont été supprimés de la
> production — le Studio DJ mixe les fichiers locaux du DJ et les
> titres uploadés par les artistes.

> ℹ️ Les uploads des artistes sont auto-approuvés (visibles immédiatement
> après le traitement asynchrone FFmpeg : statut PROCESSING → APPROVED).
> Pour rétablir la file de modération stricte : variable d'environnement
> `YAMDJ_MODERATION_AUTO_APPROVE=false` sur Render.

### 4️⃣ Test rapide du flux complet

1. Ouvrir **http://localhost:4200** → « **Continuer avec Google** » ou créer un compte **Artiste** (code email simulé dans les logs backend si Brevo n'est pas configuré : `[BREVO-MOCK]`)
2. Menu **Upload** → envoyer un MP3 → FFmpeg génère HLS 128k + 48k + BPM (asynchrone, visible en ~10 s)
3. Créer un compte **DJ** → **Studio DJ PRO** → bouton **📂** d'un deck → charger TES fichiers → le BPM est détecté automatiquement
4. Activer les effets : **ECHO / REVERB / FLANGER** (molette = intensité) ou presets **🪩 CLUB / 🌌 SPACE / ✈ SWEEP**
5. Mixer avec le crossfader → **● ENREGISTRER LE MIX** → publier en mixtape (ou télécharger)
6. Sur un profil artiste → bouton **💰 Soutenir** → paiement FedaPay (100 F minimum)
7. Connecté → page **🗂 Playlists** → créer une playlist, ajouter des sons depuis les cartes

---

## 🌍 Déploiement production (gratuit)

### Frontend → Vercel (déploiement automatique)

> ✅ Le projet est **prêt à déployer tel quel** : `vercel.json` configuré (SPA rewrites,
> headers de sécurité, cache immutable), `fileReplacements` Angular branché
> (`environment.prod.ts` → `https://yam-dj.onrender.com`).

1. [vercel.com](https://vercel.com) → **Add New → Project** → **Import** le repo `Giova03/Yam-DJ`
2. Framework preset : **Angular** (auto-détecté) — vérifier :
   - Root Directory : `yam-dj-frontend`
   - Build Command : `npm run build`
   - Output Directory : `dist/yam-dj-frontend/browser`
3. Cliquer **Deploy** — build ~1 min 30
4. **Chaque `git push` sur `main` re-déploie automatiquement** ✅

**CORS** : le backend accepte par défaut `https://yam-dj.vercel.app` et
`https://yam-dj-frontend.vercel.app`. Pour un domaine personnalisé ou une preview,
ajouter l'origine dans la variable d'environnement `CORS_ORIGINS` du backend (Render),
sans recompilation.

**Important** : le frontend appelle le backend Render — déployer d'abord le backend
(section ci-dessous), sinon les appels API échoueront (pages visibles mais données vides).

### Backend → Render.com

1. Pousser le code sur GitHub : `git push origin main`
2. Sur [render.com](https://render.com) → **New + → Web Service** → connecter le repo
   (le `render.yaml` est déjà prêt : runtime Docker avec FFmpeg intégré)
3. Renseigner les variables d'environnement (mêmes noms que le `.env`)
4. URL : `https://yam-dj.onrender.com`

> 🔁 **Anti mise en veille (IMPORTANT)** : le plan gratuit Render endort le
> service après ~15 min sans trafic (cold start de 50-90 s au réveil).
> Triple garde active : **pg_cron Supabase** (ping /actuator/health toutes les 5 min,
> couche principale) + workflow GitHub `.github/workflows/keepalive.yml` (secours) +
> heartbeat frontend (renforcement). Le serveur reste éveillé 24h/24.
> Si tu passes en plan payant, désactive-les (`cron.unschedule('yamdj-keepalive')`).

### Configuration Supabase (base + stockage)

1. Dashboard Supabase → **Settings → API**
2. Copier la clé **`service_role`** (secret) et l'URL du projet
3. Renseigner dans les variables d'environnement du backend (Render) :
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET` (défaut `media`)
4. Base de données : `DB_HOST` (pooler), `DB_USER`, `DB_PASSWORD`, `DB_NAME=postgres`
   — voir la note « pooler » dans la section lancement local

Sans la clé service_role, la plateforme reste 100% fonctionnelle en **mode local**
(uploads servis via `/media/**`), mais les fichiers sont perdus à chaque
redémarrage Render. Re-seed possible : `python3 scripts/seed_yamdj.py`.

### Configuration FedaPay (paiements)

Variables : `FEDAPAY_PUBLIC_KEY`, `FEDAPAY_SECRET_KEY`, `FEDAPAY_BASE_URL`
(défaut `https://api.fedapay.com`). Webhook à déclarer dans le dashboard
FedaPay : `https://yam-dj.onrender.com/api/webhook/fedapay` avec les
événements `transaction.approved`, `transaction.declined`,
`transaction.canceled`. Chaque confirmation est **double-vérifiée** via
`GET /v1/transactions/{id}` avant créditation (anti-fraude).

### Configuration Google OAuth (connexion en 1 clic)

> ✅ **ACTIF EN PRODUCTION** (vérifié le 2026-09-04) : `GET /api/auth/oauth/google/status`
> → `{"enabled":true, "redirectUri":"https://yam-dj.onrender.com/api/auth/oauth/google/callback"}`
> — Google affiche l'écran de consentement « YAM DJ » et le bouton redirige bien
> vers accounts.google.com. Identifiants stockés uniquement dans les variables
> Render (jamais dans ce dépôt).

1. [console.cloud.google.com](https://console.cloud.google.com) → créer un projet (ou choisir l'existant)
2. **APIs & Services → OAuth consent screen** → type *External*, renseigner le nom YAM DJ, ajouter ton email
3. **Credentials → Create Credentials → OAuth client ID** → type *Web application*
4. **Authorized redirect URI** : `https://yam-dj.onrender.com/api/auth/oauth/google/callback`
   (+ en local : `http://localhost:8080/api/auth/oauth/google/callback`)
5. Copier le **Client ID** et le **Client Secret** → variables Render :
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - (`GOOGLE_REDIRECT_URI` est déduit automatiquement de l'URL du service)
6. Vérifier : `GET https://yam-dj.onrender.com/api/auth/oauth/google/status` → `{"enabled":true}`

> Le flux est 100% côté serveur : anti-CSRF (state 256 bits), provisioning
> automatique du compte (ARTIST ou DJ selon le contexte), JWT transmis au
> frontend via le **fragment d'URL** (jamais dans les logs serveur).
> Rate limit : 10 initiations/h + 20 callbacks/h par IP.

### Configuration Notifications Push (Web Push)

Variables : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (P-256, base64url,
générées par `python3 scripts/generate_vapid_keys.py`), `VAPID_SUBJECT`
(défaut `mailto:contact@yamdj.africa`). Sans ces clés le centre de
notifications in-app reste actif, seul le push navigateur est ignoré.
Le service worker `sw.js` est servi à la racine (portée `/`), la clé
publique via `GET /api/notifications/vapid-key`.

### Configuration Premium Fan

Variables : `PREMIUM_PRICE_XOF` (défaut 500), `PREMIUM_PERIOD_DAYS`
(défaut 30). Le webhook FedaPay route automatiquement tips et ordres
Premium selon la transaction.

---

## 🔌 API REST — endpoints principaux

| Méthode | Endpoint | Rôle requis | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Inscription (USER/ARTIST/DJ) |
| POST | `/api/auth/login` | Public | Connexion → JWT |
| GET | `/api/auth/oauth/google/status` | Public | Google OAuth activé ? |
| GET | `/api/auth/oauth/google/url?role=` | Public | URL de consentement Google |
| GET | `/api/auth/oauth/google/callback` | Public | Retour Google → JWT (fragment) |
| POST | `/api/auth/logout` | Auth | Révocation du JWT (blacklist) |
| POST | `/api/auth/verify-email` | Public | Activation code 6 chiffres |
| GET | `/api/tracks/feed?limit=` | Public | Feed « Pour Toi » |
| GET | `/api/tracks/trending` | Public | Top écoutes |
| GET | `/api/tracks?q=&genre=&country=` | Public | Recherche filtrée |
| GET | `/api/tracks/{id}/stream?quality=hq\|lite` | Public | URL de streaming |
| POST | `/api/tracks/upload` | ARTIST | Upload + pipeline FFmpeg asynchrone |
| POST | `/api/tracks/{id}/retry` | ARTIST | Relance du traitement (sans re-upload) |
| GET | `/api/dj/studio-library` | DJ | Bibliothèque du studio |
| POST | `/api/dj/auto-mix` | DJ | Ordonnancement IA (Camelot+BPM) |
| POST | `/api/dj/create-mixtape` | DJ | Rendu crossfade FFmpeg |
| POST | `/api/dj/mixtapes/upload` | DJ | Publication d'un mix enregistré |
| GET | `/api/charts?country=&limit=` | Public | Chart hebdomadaire des écoutes |
| GET | `/api/seo/sitemap` | Public | Sitemap XML (via /sitemap.xml) |
| POST | `/api/analytics/event` | Public (anonyme OK) | Événement analytics |
| GET | `/api/notifications/vapid-key` | Public | Clé publique Web Push |
| GET/POST | `/api/notifications/**` | Auth | Centre de notifications + push |
| POST | `/api/payment/premium` | Auth | Abonnement Premium Fan (500 F) |
| POST | `/api/payment/premium/verify` | Auth | Vérification post-paiement |
| POST | `/api/artist/withdrawals` | ARTIST | Demande de retrait (min 5 000 F) |
| GET | `/api/artist/withdrawals/mine` | ARTIST | Historique des retraits |
| GET/POST | `/api/admin/withdrawals/**` | ADMIN | Validation des retraits |
| GET | `/api/artists/{id}` | Public | Profil artiste public |
| POST | `/api/payment/tip` | Public (option) | Initier un tip FedaPay |
| POST | `/api/payment/tip/verify` | Public (option) | Vérifier un paiement |
| POST | `/api/webhook/fedapay` | Public | Notification paiement (double vérif) |
| GET/POST | `/api/playlists/**` | Auth / public | Playlists (créer, gérer, publiques) |
| GET | `/api/artist/me/stats` | ARTIST | Dashboard : solde, stats |
| GET | `/api/admin/validate-tracks` | ADMIN | File de modération |
| POST | `/api/admin/validate-tracks/{id}/approve` | ADMIN | Valider une piste |

> WebSocket : `ws://localhost:8080/ws` — topic `/topic/notifications/{userId}` (tips temps réel)

---

## 🧠 Moteur Studio PRO — architecture

Le studio fonctionne **entièrement dans le navigateur** (Web Audio API) :

- **Sources** : pistes du catalogue (rendu HLS téléchargé + extraction AAC) **ou
  fichiers locaux** du DJ (mp3/m4a/wav/flac) — tout est décodé en `AudioBuffer` mémoire
- **Chaîne par deck** : `EQ 3 bandes → filtre bipolaire LPF/HPF → [dry + echo + reverb + flanger] → volume → crossfader`
- **Boucles et hot cues** exacts à l'échantillon (`source.loop`)
- **Pitch ±8 %** temps réel (le ton suit le tempo, comme une vraie platine)
- **SYNC B→A** avec half/double automatique, **compatibilité harmonique Camelot** affichée
- **Enregistrement** du master (limiteur inclus) via `MediaRecorder` → publication en mixtape
- **Détection BPM locale** : énergie basse fréquence par fenêtres → onsets → histogramme
  des intervalles → correction d'octave (testée 90-160 BPM)

## 🧠 Auto-Mix IA — détail

Le service `HarmonicMixService` (backend) applique les règles des DJ professionnels :

1. **Compatibilité BPM** : écart max 8% entre 2 pistes consécutives (sinon beat clash)
2. **Roue de Camelot** : les codes harmoniques compatibles sont
   - même code (ex : 8A → 8A) : mix parfait
   - ±1 sur la même lettre (8A → 9A / 7A) : énergie progressive
   - même chiffre lettre opposée (8A → 8B) : passage relatif mineur/majeur
3. **Algorithme glouton** : part de la piste au BPM le plus bas (ouverture douce) et
   choisit itérativement la piste suivante au meilleur score combiné
4. **Bonus énergie** : léger bonus aux pistes dont le BPM monte (progression de set)

---

## 🔒 Sécurité

- **JWT HS256** sans état (expiration 24 h configurable) + **logout réel** (blacklist de tokens)
- **Rate limiting** par IP : login 10/15 min, register 5/h, forgot-password 3/h...
- Mots de passe **BCrypt** (10 rounds)
- Google OAuth : **state anti-CSRF 256 bits** (TTL 10 min)
- Reset-password : token 256 bits, **seul le SHA-256 est stocké**
- Roles hiérarchiques : `USER < ARTIST / DJ < ADMIN`
- Webhook FedaPay protégé par **double vérification** `GET /v1/transactions/{id}` (anti-fraude)
- Uploads limités à 100 Mo, modération disponible
- CORS verrouillé sur les domaines déclarés

---

## 📱 Application mobile — vision

La **PWA installable** couvre déjà l'écoute hors ligne (téléchargements Data-Lite,
lecture 100% offline). Le plan complet de l'application mobile
(Capacitor + code natif partagé, offline-first, paiements mobile money natifs,
studio DJ mobile) vit dans **[docs/MOBILE_APP_DESIGN.md](./docs/MOBILE_APP_DESIGN.md)**.

## 📈 Roadmap V2

Le plan complet (phases, architecture cible, KPIs) vit dans **[ROADMAP.md](./ROADMAP.md)** —
synthèse : fondations solides → engagement (follows, commentaires, PWA) →
monétisation complète (abonnements, retraits, redevances) → studio DJ pro et
application mobile.

---

**Fait avec ❤️ à Ouagadougou — YAM DJ, la musique africaine qui vibre.**
