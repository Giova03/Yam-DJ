# YAM DJ — Feuille de route V2

> Plateforme musicale de l'Afrique de l'Ouest francophone : streaming, studio DJ
> et monétisation mobile money. Ce document planifie la suite du projet après
> la V1 (en production : https://yam-dj-frontend.vercel.app).

---

## 0. Bilan de la phase 2 (2026-09-01) — TERMINÉE

Livré et vérifié en production :
- **Bug code de validation corrigé** : le login `readOnly` empêchait la persistance
  du code régénéré (email jamais conforme à la DB) ; le login conserve désormais le
  code existant, la saisie tolère espaces/casse, les inputs filtrent les chiffres
- **Supabase Storage durable ACTIVÉ** (clé service_role injectée) : HLS, pochettes
  et mixtapes persistants, plus de re-seed après redéploiement
- **FedaPay opérationnel de bout en bout** : transaction réelle créée, page de
  paiement, webhook actif (id 8351) avec double vérification anti-fraude
- **Gestion du catalogue** : DELETE /api/tracks/{id} (propriétaire ou admin, fichiers
  supprimés du bucket), GET /api/tracks/mine, DELETE /api/dj/mixtapes/{id},
  dashboard artiste avec statuts et suppression, Studio DJ avec lecture/suppression
- **Commentaires** (Phase 2.2) : entité + endpoints + UI (filtre mots, anti-spam 30 s)
- **Page profil** (Phase 2.5) : /profile avec onglets Aime (likes suivis par
  utilisateur via table track_like, toggle like), Historique, Playlists
- **Partage social** (Phase 2.3) : modale WhatsApp/Facebook/X/copy sur toutes les
  cartes + page publique /track/:id avec meta Open Graph
- **Routes SPA Vercel corrigées** : rewrite catch-all (l'ancien lookahead path-to-regexp
  renvoyait 404 sur /login, /register...) ; identifiants démo retirés de la page login

## 1. Etat des lieux (fin V1, 2026-09)

**Fonctionnel en production :**
- Authentification complète (inscription, code email Brevo, JWT, rôles USER/ARTIST/DJ/ADMIN)
- Upload de sons avec mastering FFmpeg (HLS 128k + Data-Lite 48k, détection BPM)
- Modération admin (PENDING → APPROVED/REJECTED) + email à l'artiste
- Streaming HLS adaptatif, pochettes, compteur d'écoutes, likes, historique
- Recommandations "Pour Toi", tendances, recherche avec filtres genre/pays
- Studio DJ : Auto-Mix harmonique (Camelot), mixtapes avec fondu enchaîné, WebSocket
- Playlists (création, ajout depuis les cartes, lecture file entière, publiques)
- YAM Tips via FedaPay (Orange Money, Moov, MTN, Wave) + webhook double-vérification
- Dashboard artiste (solde, stats, historique tips, notifications temps réel)

**Infrastructure :**
- Backend Spring Boot 3.2 (Render, plan gratuit) + Angular 17 (Vercel)
- PostgreSQL Supabase (eu-central-1) + Storage Supabase (bucket `media`)
- Emails Brevo (300/jour gratuits) — expéditeur vérifié requis
- CI/CD : push GitHub → déploiements automatiques Render + Vercel

**Dette technique connue :**
- Medias en mode local (éphémères) tant que `SUPABASE_SERVICE_KEY` n'est pas
  injectée sur Render — bascule automatique sans changement de code
- Render plan gratuit : mise en veille après 15 min (réveil ~50 s), 512 Mo RAM
  (mixtape limite pratique : 3 pistes), disque éphémère
- Comptes et contenus de démo à remplacer par de vrais artistes
- Aucun test automatisé dans le pipeline (les vérifications sont des scripts)

---

## 2. Vision V2

Devenir **la plateforme de référence des artistes et DJs d'Afrique de
l'Ouest francophone** : le lieu où un artiste de Ouaga ou Abidjan publie,
trouve son public et vit de sa musique via mobile money — sans intermédiaire.

3 piliers :
1. **Découverte** : recommandations locales pertinentes, charts par pays/ville
2. **Outils pros** : analytics artiste, distribution, droits
3. **Revenus** : pourboires, abonnements fan, redevances d'écoute partagées

---

## 3. Phases de développement

### Phase 1 — Fondations solides — ✅ ACCOMPLIE (sauf items notés)

| # | Sujet | Statut |
|---|-------|--------|
| 1.1 | Médias durables | ✅ FAIT — SUPABASE_SERVICE_KEY injectée, mode Supabase actif, seed durable |
| 1.2 | Vraie homepage | ⏳ À FAIRE — recruter 5-10 artistes réels |
| 1.3 | Tests automatisés | ⏳ À FAIRE — 55+ tests scripts prêts à intégrer dans GitHub Actions |
| 1.4 | Observabilité | ⏳ À FAIRE — UptimeRobot + Sentry |
| 1.5 | Limites & quotas | ⏳ À FAIRE — rate limiting /api/auth/** |
| 1.6 | Webhook FedaPay actif | ✅ FAIT — webhook 8351 actif, endpoint vérifié |
| 1.7 | Échelle Render | ⏳ À FAIRE — plan Starter 7 $/mois recommandé dès le premier vrai traffic |

### Phase 2 — Engagement & croissance — ✅ LIVRÉE (voir bilan §0)

Réalisée : 2.1 Follow (session précédente), 2.2 Commentaires, 2.3 Partage
social + page publique /track/:id, 2.5 Page profil (likes suivis par
utilisateur). Restent à livrer :

| # | Fonctionnalité | Détail technique |
|---|----------------|-------------------|
| 2.4 | **Notifications push** | PWA + Web Push (VAPID) : nouveau son d'un artiste suivi, tip reçu. Complète le WebSocket existant |
| 2.6 | **Charts hebdomadaires** | Table d'agrégation play_count par semaine (job @Scheduled), badge "Top 10 Burkina" sur les cartes |
| 2.7 | **SEO** | Sitemap, SSR partiel (Angular Universal) ou pré-rendu des pages publiques artistes/pistes |

### Phase 3 — Monétisation complète (6-8 semaines)

| # | Fonctionnalité | Détail technique |
|---|----------------|-------------------|
| 3.1 | **Abonnement Fan Premium** | 500 F/mois via FedaPay récurrent : pas de pub, Data-Lite illimité, badge supporteur, contenu exclusif |
| 3.2 | **Retraits artistes** | Solde → retrait vers Orange Money via API FedaPay Payouts ; seuil 5 000 F, validation manuelle en V2.0 puis automatique |
| 3.3 | **Redevances d'écoute** | Répartition mensuelle d'une cagnotte au prorata des écoutes (pourboires + abonnements), rapport transparent |
| 3.4 | **Boutique de mixtapes** | Mixtape payante (prix fixé par le DJ), paiement unitaire FedaPay, revenus partagés 70/30 |
| 3.5 | **PUB non intrusive** | Audio sponsorisé 15 s max entre pistes pour les non-abonnés (auto-pause Data-Lite) |

### Phase 4 — Studio DJ pro & mobile (8-12 semaines)

| # | Fonctionnalité | Détail technique |
|---|----------------|-------------------|
| 4.1 | **Éditeur de mix web** | Timeline drag & drop (Angular CDK), pré-écoute, points cue, export amélioré |
| 4.2 | **Bibliothèque DJ collaborative** | Crate sharing, tags BPM/tonalité éditables, détection clé automatique (chromaprint) |
| 4.3 | **App mobile** | Capacitor wrapping Angular + lecture en arrière-plan + téléchargement offline des achats |
| 4.4 | **Live streaming DJ** | WebRTC (LiveKit) : sessions live avec chat + pourboires en direct |
| 4.5 | **IA recommandation** | Embeddings morceaux (essentielles audio) + collaboratif ; fallback aléatoire pondéré actuel |

---

## 4. Architecture cible V2

```
Vercel (Angular 17 PWA)
        │ HTTPS / API
        ▼
Render (Spring Boot 3.2) ──► Supabase Postgres (eu-central-1)
        │                        ▲
        ├─► Supabase Storage (bucket media : HLS, pochettes, mixtapes)
        ├─► Brevo (emails transactionnels)
        ├─► FedaPay (paiements + webhooks + payouts)
        ├─► GitHub Actions (tests e2e sur push)
        └─► Sentry (erreurs) + UptimeRobot (dispo)

V2.1+ : Redis (rate limiting, cache tendances), worker séparé pour les
traitements FFmpeg lourds, CDN devant Storage (cache pochettes/segments).
```

Principes : monolithe modulaire d'abord (pas de microservices prématurés),
toute fonctionnalité derrière feature flag simple (variables d'env), les
traitements audio en tâches asynchrones avec file de progression WebSocket.

## 5. Sécurité & conformité (transversal)

- Validation stricte des uploads (type MIME réel via `file`, scan durée)
- Purge RGPD des comptes (suppression cascade + anonymisation historique)
- Vérification signature webhook FedaPay (secret partagé) quand la doc le permet
- Double auth par email sur retrait d'argent
- Mots de passe : bcrypt déjà en place, ajouter verrouillage après 5 échecs

## 6. Mesure de succès (KPIs V2)

| Indicateur | V1 (aujourd'hui) | Cible 3 mois | Cible 12 mois |
|------------|------------------|--------------|---------------|
| Artistes actifs | 3 (démo) | 50 | 500 |
| Pistes approuvées | 6 (démo) | 150 | 2000 |
| Ecoutes mensuelles | ~0 | 10 000 | 500 000 |
| Tips versés (FCFA) | 0 | 250 000 | 10 000 000 |
| Utilisateurs inscrits | ~10 | 500 | 20 000 |
| Temps de disponibilité | ~99 % (veille) | 99,9 % (Starter) | 99,95 % |

## 7. Prochaines actions immediates (cette semaine)

1. Injecter `SUPABASE_SERVICE_KEY` sur Render (1 copier-coller, dashboard
   Supabase → Settings → API → `service_role` secret) puis re-seeder
   `python3 scripts/seed_yamdj.py` — les medias deviennent durables
2. Configurer le webhook FedaPay dans le dashboard (URL ci-dessus, events
   transaction.approved / declined / canceled)
3. Tester un paiement réel de 100 F vers un compte artiste de démo
4. Recruter les 5 premiers vrais artistes (phase 1.2)
5. Ouvvrir le repo aux issues publiques + mettre en place GitHub Actions (1.3)
