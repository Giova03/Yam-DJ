# 🎧 YAM DJ V1 — Plateforme de Streaming Musical Africaine

> **"La musique africaine qui vibre"** — Streaming + Studio DJ Web + Monétisation artistes
> Cible : Afrique francophone (lancement Burkina Faso 🇧🇫)

YAM DJ est une plateforme complète qui combine le meilleur de Spotify, SoundCloud et Mixcloud,
optimisée pour les réalités africaines : connexions 2G/3G, paiement mobile money, et scène
musicale locale ultra-dynamique.

---

## 🚀 Differenciateurs produit

| Fonctionnalite | Description | Technologie |
|---|---|---|
| 🤖 **Auto-Mix IA** | Ordonne les pistes d'un mix selon la compatibilite harmonique (Camelot Wheel) et le BPM | Java (moteur glouton) |
| 📱 **Mode Data-Lite** | Streaming 48 kbps mono = **3x moins de data** pour les connexions lentes | FFmpeg + HLS.js + Network API |
| 🪩 **Mode Nightclub** | Bass boost + reverb club en temps reel pendant l'ecoute | Web Audio API |
| 🎚️ **Studio DJ Web** | 2 platines : pitch BPM, crossfader, effets (filtre/delay/reverb), sync tempo | Web Audio API |
| 💰 **YAM Tips** | Soutien aux artistes en 1 clic via **Orange Money / Moov / MTN / Wave** | FedaPay API |
| 🗂 **Playlists** | Playlists personnelles et publiques, ajout en 1 clic depuis les cartes | Angular 17 + API REST |
| 🎛️ **Mixtapes** | Rendu crossfade reel des mixtapes cote serveur | FFmpeg xfade |
| 📊 **Dashboard Artiste** | Solde FCFA, stats, historique tips, notifications temps reel | WebSocket STOMP |
| ✅ **Moderation** | Validation des pistes avant publication (anti-fraude) | Spring Security roles |
| 📂 **Ma Musique locale** | Lecture des musiques du telephone/ordinateur (tags ID3, pochette, ecran verrouille) — 100% hors ligne | File API + MediaSession |
| 📈 **Charts hebdomadaires** | Top des ecoutes de la semaine, global et par pays, rafraichi toutes les heures | Job @Scheduled + PostgreSQL |
| 🔔 **Notifications push** | Centre in-app + Web Push VAPID (nouveaux sons des artistes suivis, tips recus, retraits) | PWA + RFC 8030/8292 |
| ⭐ **Premium Fan** | Abonnement 500 F / 30 jours via mobile money, badge supporteur | FedaPay + webhook |
| 💸 **Retraits artistes** | Solde -> mobile money, validation admin, min 5 000 F | FedaPay + Brevo |
| 🔍 **SEO** | Sitemap dynamique, robots.txt, Open Graph, JSON-LD, PWA installable | Render + Vercel rewrites |

---

## 📁 Structure du projet

```
yam-dj-backend/          → Spring Boot 3.2 (Java 17)
yam-dj-frontend/         → Angular 17 (Standalone Components) + TailwindCSS
```

### Stack technique

- **Backend** : Spring Boot 3.2.5, Spring Security (JWT), Spring Data JPA, WebSocket STOMP
- **Frontend** : Angular 17, TailwindCSS 3.4, HLS.js, Web Audio API
- **Base de donnees** : PostgreSQL (Supabase — gratuit)
- **Stockage** : Supabase Storage (bucket `media`, public, 50 Mo/fichier) — mode local de secours si la cle service_role n'est pas configuree
- **Streaming** : HLS (m3u8) genere par FFmpeg — 2 qualites (128k / 48k)
- **Paiement** : FedaPay (Orange Money, Moov Money, MTN, Wave)
- **Emails** : Brevo (300/jour gratuits — expediteur verifie requis)
- **Hebergement** : Render.com (backend, gratuit) + Vercel (frontend, gratuit)

---

## 🖥️ Lancement local — GUIDE PAS A PAS

### Prerequis

| Outil | Version | Verification |
|---|---|---|
| Java JDK | 17+ | `java -version` |
| Maven | 3.8+ | `mvn -version` |
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| FFmpeg | 6+ | `ffmpeg -version` |
| PostgreSQL | 15+ (ou Supabase) | `psql --version` |

**Installation FFmpeg** (indispensable pour le traitement audio) :
- **Ubuntu/Debian** : `sudo apt install ffmpeg`
- **Windows** : `winget install ffmpeg` puis redemarrer le terminal
- **macOS** : `brew install ffmpeg`

---

### 1️⃣ Backend Spring Boot

```bash
cd yam-dj-backend

# a) Creer le fichier d'environnement puis renseigner vos cles
cp .env.example .env
# → Ouvrir .env et remplir : Supabase, JWT, FedaPay, Brevo (voir sections configuration)
# /\ .env est gitignore : les vraies cles ne sont jamais poussees sur GitHub

# b) Builder
mvn clean package -DskipTests

# c) Lancer (le schema.sql s'execute automatiquement au demarrage)
mvn spring-boot:run
```

✅ Backend demarre sur **http://localhost:8080** — verification :
```bash
curl http://localhost:8080/actuator/health
# {"status":"UP"}
```

> **Note Supabase (verifiee en conditions reelles)** : `db.xxx.supabase.co` est **IPv6 only**.
> Sur un reseau/hebergeur IPv4 (Render, Docker...), utiliser le **pooler** :
> `DB_HOST=aws-0-eu-central-1.pooler.supabase.com` et
> `DB_USER=postgres.<project-ref>` (ex : `postgres.abcdefghijkl123456`),
> disponibles dans Project Settings > Database > Connection string (mode *Session*, port 5432).

### 2️⃣ Frontend Angular

```bash
cd yam-dj-frontend

# a) Installer les dependances
npm install

# b) Lancer le serveur de dev (proxy /api -> localhost:8080)
npm start
```

✅ Frontend demarre sur **http://localhost:4200**

### 3️⃣ Comptes de demonstration

Le `schema.sql` + `scripts/seed_yamdj.py` creent les comptes de demo
(mots de passe ADMIN reinitialises par le seed) :

| Compte | Email | Mot de passe | Role |
|---|---|---|---|
| Admin | `admin@yamdj.africa` | `AdminYamDj2024!` | ADMIN (moderation, retraits) |
| Artiste | `artist@yamdj.africa` | `Password123` | ARTIST (upload + tips) |
| DJ | `dj@yamdj.africa` | `DjDemo1234!` | DJ (studio + mixtapes) |
| Artistes seeds | `faso.king@demo.yamdj.africa` etc. | `Demo1234!` | ARTIST |

> ⚠️ En production, changer immediatement ces mots de passe en base.

### 4️⃣ Test rapide du flux complet

1. Ouvrir **http://localhost:4200** → creer un compte **Artiste** (code email simule dans
   les logs backend si Brevo n'est pas configure : `[BREVO-MOCK]`)
2. Menu **Upload** → envoyer un MP3 → FFmpeg genere HLS 128k + 48k + BPM
3. Se connecter en **Admin** → menu **Admin** → valider la piste
4. Retour accueil → la piste apparaît dans "Pour Toi" → **▶ Ecouter**
5. Activer **🪩 Nightclub** et **📱 Data-Lite** dans la barre de lecture
6. Creer un compte **DJ** → **Studio DJ** → charger 2 pistes → **🤖 Auto-Mix IA**
7. Sur un profil artiste → bouton **💰 Soutenir** → paiement FedaPay (100 F minimum)
8. Connecte → page **🗂 Playlists** → creer une playlist, ajouter des sons depuis les cartes

---

## 🌍 Deploiement production (gratuit)

### Backend → Render.com

1. Pousser le code sur GitHub : `git remote add origin https://github.com/Giova03/Yam-DJ.git && git push -u origin main`
2. Sur [render.com](https://render.com) → **New + → Web Service** → connecter le repo
   (le `render.yaml` est deja pret : runtime Docker avec FFmpeg integre)
3. Renseigner les variables d'environnement (meme noms que le `.env`)
4. URL : `https://yam-dj.onrender.com`

### Frontend → Vercel

> ✅ Le projet est **pret a deployer tel quel** : `vercel.json` configure (SPA rewrites,
> headers de securite, cache immutable), `fileReplacements` Angular branche
> (`environment.prod.ts` → `https://yam-dj.onrender.com`). Aucune manipulation
> de fichiers n'est necessaire avant le build.

1. [vercel.com](https://vercel.com) → **Add New → Project** → **Import** le repo `Giova03/Yam-DJ`
2. Framework preset : **Angular** (auto-detecte) — verifier :
   - Root Directory : `yam-dj-frontend`
   - Build Command : `npm run build`
   - Output Directory : `dist/yam-dj-frontend/browser`
   - Install Command : `npm install`
   (toutes ces valeurs sont aussi lues depuis `vercel.json`, deja present)
3. Cliquer **Deploy** — build ~1 min 30
4. URL finale : `https://yam-dj-frontend.vercel.app` (ou `https://yam-dj.vercel.app` selon le nom)
5. ⚠️ Si l'URL du backend Render differe de `yam-dj.onrender.com` :
   editer `src/environments/environment.prod.ts`, pousser sur GitHub → Vercel
   redeploie automatiquement (integration Git)

**CORS** : le backend accepte par defaut `https://yam-dj.vercel.app` et
`https://yam-dj-frontend.vercel.app`. Pour un domaine personnalise ou une preview,
ajouter l'origine dans la variable d'environnement `CORS_ORIGINS` du backend (Render),
sans recompilation.

**Important** : le frontend appele le backend Render — deployer d'abord le backend
(section ci-dessus), sinon les appels API echoueront (pages visibles mais donnees vides).

### Configuration Supabase Storage (medias durables)

1. Dashboard Supabase (projet `olzosqslfczqmadlixvr`) → **Settings → API**
2. Copier la cle **`service_role`** (secret)
3. Renseigner `SUPABASE_SERVICE_KEY` dans les variables d'environnement du backend (Render)
4. Le bucket `media` (public, limite 50 Mo/fichier) existe deja — bascule
   automatique au prochain demarrage : `Stockage medias : MODE SUPABASE`

Sans cette cle, la plateforme reste 100% fonctionnelle en **mode local**
(uploads servis via `/media/**`), mais les fichiers sont perdus a chaque
redemarrage Render. Re-seed possible : `python3 scripts/seed_yamdj.py`.

Variables completes : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`SUPABASE_STORAGE_BUCKET` (defaut `media`).

### Configuration FedaPay (paiements)

Variables : `FEDAPAY_PUBLIC_KEY`, `FEDAPAY_SECRET_KEY`, `FEDAPAY_BASE_URL`
(defaut `https://api.fedapay.com`). Webhook a declarer dans le dashboard
FedaPay : `https://yam-dj.onrender.com/api/webhook/fedapay` avec les
evenements `transaction.approved`, `transaction.declined`,
`transaction.canceled`. Chaque confirmation est **double-verifiee** via
`GET /v1/transactions/{id}` avant creditation (anti-fraude).

### Configuration Notifications Push (Web Push)

Variables : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (P-256, base64url,
generees par `python3 scripts/generate_vapid_keys.py`), `VAPID_SUBJECT`
(defaut `mailto:contact@yamdj.africa`). Sans ces cles le centre de
notifications in-app reste actif, seul le push navigateur est ignore.
Le service worker `sw.js` est servi a la racine (portee `/`), la cle
publique via `GET /api/notifications/vapid-key`.

### Configuration Premium Fan

Variables : `PREMIUM_PRICE_XOF` (defaut 500), `PREMIUM_PERIOD_DAYS`
(defaut 30). Le webhook FedaPay route automatiquement tips et ordres
Premium selon la transaction.

---

## 🔌 API REST — endpoints principaux

| Methode | Endpoint | Role requis | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Inscription (USER/ARTIST/DJ) |
| POST | `/api/auth/login` | Public | Connexion → JWT |
| POST | `/api/auth/verify-email` | Public | Activation code 6 chiffres |
| GET | `/api/tracks/feed?limit=` | Public | Feed "Pour Toi" |
| GET | `/api/tracks/trending` | Public | Top ecoutes |
| GET | `/api/tracks?q=&genre=&country=` | Public | Recherche filtree |
| GET | `/api/tracks/{id}/stream?quality=hq\|lite` | Public | URL de streaming |
| POST | `/api/tracks/{id}/play` | Public | Comptabilise 1 ecoute |
| POST | `/api/tracks/upload` | ARTIST | Upload + traitement FFmpeg |
| GET | `/api/dj/studio-library` | DJ | Bibliotheque du studio |
| POST | `/api/dj/auto-mix` | DJ | Ordonnancement IA (Camelot+BPM) |
| POST | `/api/dj/create-mixtape` | DJ | Rendu crossfade FFmpeg |
| GET | `/api/charts?country=&limit=` | Public | Chart hebdomadaire des ecoutes |
| GET | `/api/charts/countries` | Public | Pays du chart courant |
| GET | `/api/seo/sitemap` | Public | Sitemap XML (via /sitemap.xml) |
| GET | `/api/notifications/vapid-key` | Public | Cle publique Web Push |
| GET/POST | `/api/notifications/**` | Auth | Centre de notifications + push |
| POST | `/api/payment/premium` | Auth | Abonnement Premium Fan (500 F) |
| POST | `/api/payment/premium/verify` | Auth | Verification post-paiement |
| POST | `/api/artist/withdrawals` | ARTIST | Demande de retrait (min 5 000 F) |
| GET | `/api/artist/withdrawals/mine` | ARTIST | Historique des retraits |
| GET/POST | `/api/admin/withdrawals/**` | ADMIN | Validation des retraits |
| GET | `/api/artists/{id}` | Public | Profil artiste public |
| POST | `/api/payment/tip` | Public (option) | Initier un tip FedaPay |
| POST | `/api/payment/tip/verify` | Public (option) | Verifier un paiement |
| POST | `/api/webhook/fedapay` | Public | Notification paiement (double verif) |
| GET/POST | `/api/playlists/**` | Auth / public | Playlists (creer, gerer, publiques) |
| GET | `/api/artist/me/stats` | ARTIST | Dashboard : solde, stats |
| GET | `/api/admin/validate-tracks` | ADMIN | File de moderation |
| POST | `/api/admin/validate-tracks/{id}/approve` | ADMIN | Valider une piste |

> WebSocket : `ws://localhost:8080/ws` — topic `/topic/notifications/{userId}` (tips temps reel)

---

## 🧠 Moteur Auto-Mix IA — detail

Le service `HarmonicMixService` (backend) applique les regles des DJ professionnels :

1. **Compatibilite BPM** : ecart max 8% entre 2 pistes consecutives (sinon beat clash)
2. **Roue de Camelot** : les codes harmoniques compatibles sont
   - meme code (ex : 8A → 8A) : mix parfait
   - ±1 sur la meme lettre (8A → 9A / 7A) : energie progressive
   - meme chiffre lettre opposee (8A → 8B) : passage relatif mineur/majeur
3. **Algorithme glouton** : part de la piste au BPM le plus bas (ouverture douce) et
   choisit iterativement la piste suivante au meilleur score combine
4. **Bonus energie** : leger bonus aux pistes dont le BPM monte (progression de set)

Le resultat : un enchainement musical fluide, comme un DJ resident de Ouagadougou. 🎧

---

## 🔒 Securite

- **JWT HS256** sans etat (expiration 24 h configurable)
- Mots de passe **BCrypt** (10 rounds)
- Roles hierarchiques : `USER < ARTIST / DJ < ADMIN`
- Webhook FedaPay protege par **double verification** `GET /v1/transactions/{id}` (anti-fraude)
- Uploads limites a 100 Mo, moderation humaine avant publication
- CORS verrouille sur les domaines declares

---

## 📈 Roadmap V2

Le plan complet (phases, architecture cible, KPIs) vit dans **[ROADMAP.md](./ROADMAP.md)** —
synthese : fondations solides → engagement (follows, commentaires, PWA) →
monetisation complete (abonnements, retraits, redevances) → studio DJ pro et
application mobile.

---

**Fait avec ❤️ a Ouagadougou — YAM DJ, la musique africaine qui vibre.**
