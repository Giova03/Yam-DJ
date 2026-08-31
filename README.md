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
| 💰 **YAM Tips** | Soutien aux artistes en 1 clic via **Orange Money / Moov Money** | CinetPay API |
| 🎛️ **Mixtapes** | Rendu crossfade reel des mixtapes cote serveur | FFmpeg xfade |
| 📊 **Dashboard Artiste** | Solde FCFA, stats, historique tips, notifications temps reel | WebSocket STOMP |
| ✅ **Moderation** | Validation des pistes avant publication (anti-fraude) | Spring Security roles |

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
- **Stockage** : Cloudflare R2 (S3-compatible — gratuit jusqu'a 10 Go)
- **Streaming** : HLS (m3u8) genere par FFmpeg — 2 qualites (128k / 48k)
- **Paiement** : CinetPay (Orange Money, Moov Money, MTN)
- **Emails** : Brevo (300/jour gratuits)
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
# → Ouvrir .env et remplir : Supabase, JWT, R2, CinetPay (Site ID numerique), Brevo
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

Le `schema.sql` cree automatiquement 3 comptes (a activer via le code email, ou
directement actives — voir colonne `email_verified = TRUE`) :

| Compte | Email | Mot de passe | Role |
|---|---|---|---|
| Admin | `admin@yamdj.africa` | `Password123` | ADMIN (moderation) |
| Artiste | `artist@yamdj.africa` | `Password123` | ARTIST (upload + tips) |
| DJ | `dj@yamdj.africa` | `Password123` | DJ (studio + mixtapes) |

> Ces comptes ont un hash BCrypt de demonstration. En production, changer
> immediatement ces mots de passe en base.

### 4️⃣ Test rapide du flux complet

1. Ouvrir **http://localhost:4200** → creer un compte **Artiste** (code email simule dans
   les logs backend si Brevo n'est pas configure : `[BREVO-MOCK]`)
2. Menu **Upload** → envoyer un MP3 → FFmpeg genere HLS 128k + 48k + BPM
3. Se connecter en **Admin** → menu **Admin** → valider la piste
4. Retour accueil → la piste apparaît dans "Pour Toi" → **▶ Ecouter**
5. Activer **🪩 Nightclub** et **📱 Data-Lite** dans la barre de lecture
6. Creer un compte **DJ** → **Studio DJ** → charger 2 pistes → **🤖 Auto-Mix IA**
7. Sur un profil artiste → bouton **💰 Soutenir** → paiement test CinetPay

---

## 🌍 Deploiement production (gratuit)

### Backend → Render.com

1. Pousser le code sur GitHub : `git remote add origin https://github.com/Giova03/Yam-DJ.git && git push -u origin main`
2. Sur [render.com](https://render.com) → **New + → Web Service** → connecter le repo
   (le `render.yaml` est deja pret : runtime Docker avec FFmpeg integre)
3. Renseigner les variables d'environnement (meme noms que le `.env`)
4. URL : `https://yam-dj-backend.onrender.com`

### Frontend → Vercel

> ✅ Le projet est **pret a deployer tel quel** : `vercel.json` configure (SPA rewrites,
> headers de securite, cache immutable), `fileReplacements` Angular branche
> (`environment.prod.ts` → `https://yam-dj-backend.onrender.com`). Aucune manipulation
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
5. ⚠️ Si l'URL du backend Render differe de `yam-dj-backend.onrender.com` :
   editer `src/environments/environment.prod.ts`, pousser sur GitHub → Vercel
   redeploie automatiquement (integration Git)

**CORS** : le backend accepte par defaut `https://yam-dj.vercel.app` et
`https://yam-dj-frontend.vercel.app`. Pour un domaine personnalise ou une preview,
ajouter l'origine dans la variable d'environnement `CORS_ORIGINS` du backend (Render),
sans recompilation.

**Important** : le frontend appele le backend Render — deployer d'abord le backend
(section ci-dessus), sinon les appels API echoueront (pages visibles mais donnees vides).

### Configuration Cloudflare R2

1. Dashboard Cloudflare → **R2** → creer le bucket `yam-dj-media`
2. **Settings → Public access** → activer le domaine public `pub-xxx.r2.dev`
   (tant que l'acces public est desactive, l'URL repond 401)
3. **Manage API Tokens** → creer un token R2 (Object Read & Write) → copier
   l'**Access Key ID** et le **Secret Access Key** (le token `cfat_...` lui-meme n'est pas utilise par l'API S3)
4. Renseigner dans `.env` : `R2_ACCOUNT_ID` (visible sur l'accueil du dashboard),
   `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_PUBLIC_URL`
5. **CORS du bucket** : ajouter une regle CORS autorisant `http://localhost:4200` et
   l'URL Vercel (necessaire pour le Studio DJ qui charge les fichiers audio via Web Audio API)

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
| GET | `/api/artists/{id}` | Public | Profil artiste public |
| POST | `/api/payment/tip` | Public (option) | Initier un tip CinetPay |
| POST | `/api/webhook/cinetpay` | Public | Notification paiement |
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
- Webhook CinetPay protege par **double verification** `/payment/check` (anti-fraude)
- Uploads limites a 100 Mo, moderation humaine avant publication
- CORS verrouille sur les domaines declares

---

## 📈 Roadmap V2

- Application mobile React Native (mode hors-ligne)
- Retraits Orange Money automatiques pour les artistes (seuil 10 000 FCFA)
- Lyrics synchronises + mode karaoké
- Classements hebdomadaires par pays
- Recommandations collaboratives (matrix factorization)
- Podcasts et radio live

---

**Fait avec ❤️ a Ouagadougou — YAM DJ, la musique africaine qui vibre.**
