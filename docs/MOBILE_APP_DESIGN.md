# 📱 YAM DJ — Conception de l'application mobile

> Document de conception V1 — fondations de la future application mobile
> Statut : **réflexion / planification** (la PWA couvre déjà l'essentiel de l'écoute)

---

## 1. Décision stratégique : 3 options évaluées

| Option | Coût | Délai | Accès matériel* | Boutique | Verdict |
|---|---|---|---|---|---|
| **PWA seule** (actuelle) | 0 F | — | Partiel (pas de Bluetooth, fichiers limités) | Non (installation depuis le navigateur) | ✅ Suffisante pour l'écoute, tips, charts |
| **Capacitor** (web + natif) | Faible | 3-6 semaines | Bon (plugins natifs) | Oui (Play Store) | ✅ **RECOMMANDÉE — V2** |
| **Flutter / React Native** | Élevé | 4-6 mois | Excellent | Oui | ❌ Réécriture totale, duo d'équipes |

*Accès matériel : lecteur en arrière-plan fiable, détection réseau, stockage étendu, notifications push natives (Android <13 + iOS), partage de fichiers.

**Pourquoi Capacitor** : l'application Angular 17 existante (80% du code) est réutilisée
telle quelle. Capacitor l'enveloppe dans un shell natif et expose les API du téléphone
via des plugins. Une seule codebase web + mobile = vitesse de développement doublée.
C'est la voie choisie par de nombreuses plateformes (et déjà documentée comme upgrade
path dans ROADMAP.md Phase 2ter).

---

## 2. Architecture cible

```
┌────────────────────────────────────────────────┐
│              APP MOBILE YAM DJ                 │
│  (Capacitor 6 — Android d'abord, iOS ensuite)  │
├────────────────────────────────────────────────┤
│  UI : code Angular 17 EXISTANT (partagé web)   │
│   + écrans natifs spécifiques (lecteur écran   │
│     verrouillé, widget, mode voiture)          │
├────────────────────────────────────────────────┤
│  Plugins Capacitor :                           │
│   • Media / audio en arrière-plan fiable       │
│   • Downloads → stockage interne chiffré       │
│   • Notifications push (FCM)                   │
│   • Network status (Data-Lite auto)            │
│   • File picker (Ma musique)                   │
│   • Secure Storage (JWT, clés)                 │
├────────────────────────────────────────────────┤
│  API : backend Spring Boot inchangé            │
│   https://yam-dj.onrender.com                  │
└────────────────────────────────────────────────┘
```

Règle d'or : **l'API ne change pas**. Toute la logique métier reste côté serveur ;
l'app mobile n'est qu'un client premium du même backend.

---

## 3. Parcours utilisateurs (boucles cœur)

### 🎧 Auditeur (boucle n°1 — priorité maximale)
1. Ouvre l'app → feed « Pour Toi » chargé en < 2 s (cache local)
2. Écoute en streaming Data-Lite (48 kbps) ou hors ligne (téléchargements)
3. Tip 200 F en 2 clics (Orange Money via FedaPay natif)
4. Suit ses artistes → notifications push « nouveau son »

### 🎤 Artiste (boucle n°2)
1. Upload un son depuis le téléphone (compression côté client avant envoi)
2. Voit ses stats temps réel (écoutes, revenus FCFA)
3. Demande un retrait mobile money (min 5 000 F)

### 🎚️ DJ (boucle n°3)
1. Prépare ses sets hors ligne (playlist + téléchargements)
2. Studio DJ mobile simplifié (crossfader tactile, cues par tap)
3. Publie ses mixtapes → revenus 70/30

---

## 4. Écrans principaux (V2 mobile)

| Écran | Contenu | Particularité mobile |
|---|---|---|
| **Accueil** | Feed Pour Toi + charts du pays | Pull-to-refresh, squelette de chargement, mode 2G |
| **Lecteur plein écran** | Pochette, paroles (V3), tips 1 clic | Écran verrouillé natif, geste swipe pour piste suivante |
| **Recherche** | Titres, artistes, tags | Historique local, suggestions hors ligne |
| **Ma musique** | Téléchargements + fichiers locaux | Tri par artiste/album, lecture arrière-plan garantie |
| **Studio DJ** | 2 decks compacts | Waveform tactile (pinch = zoom), crossfader plein écran |
| **Wallet artiste** | Solde FCFA, historique, retrait | Biometrie pour retrait (fingerprint) |
| **Notifications** | Nouveaux sons, tips reçus | Push natif FCM |

---

## 5. Contraintes afro-centrées (non négociables)

- **Data-Lite par défaut** sur réseau 2G détecté (Network API + plugin natif)
- **Téléchargements compressés** (rendu 48 kbps déjà généré par FFmpeg côté serveur)
- **Taille d'app < 25 Mo** au premier lancement (pas de bundled assets lourds)
- **Mode hors ligne de premier ordre** : l'app doit être utile sans réseau (ma musique locale + téléchargements)
- **Paiement sans carte bancaire** : FedaPay mobile money uniquement
- **Android d'abord** : > 90% du marché ouest-africain ; iOS dans un second temps

---

## 6. Plan de déploiement en 4 phases

| Phase | Durée | Contenu | Livrable |
|---|---|---|---|
| **P0 — Préparation** | 1 semaine | Audit du code Angular (dépendances Capacitor), config projet, splash screens + icônes (logo vinyle-Y déjà créé) | Projet Capacitor qui lance l'app actuelle |
| **P1 — Lecture fiable** | 2 semaines | Plugin audio arrière-plan, téléchargements chiffrés, mode 2G auto, notifications FCM | Bêta interne (APK) |
| **P2 — Monétisation native** | 1-2 semaines | Tips 1 clic, Premium, wallet + biometrie | Play Store (closed beta) |
| **P3 — Studio mobile + polish** | 2-3 semaines | Studio compact, gestes, widget écran d'accueil, mode voiture | Play Store public |

**Budget estimé** : développeur seul → ~2 mois à temps plein ; compte Google Play
Developer : 25 $ (unique) ; iOS Developer : 99 $/an (differé en P3).

---

## 7. Ce qui reste à décider

1. **Nom de package** : `africa.yamdj.app` (suggéré)
2. **Équipe** : le propriétaire code seul ou recrutement d'un dev Android ?
3. **Priorité P2** : tips d'abord (rétention artistes) ou Premium d'abord (revenus plateforme) ?
4. **iOS** : différer ou planifier dès P1 ?
5. **Hors ligne studio** : autoriser le mix de fichiers locaux sans compte (mode démo) ?

---

*Document vivant — à compléter avec les maquettes Figma lorsque la décision Capacitor sera validée.*
