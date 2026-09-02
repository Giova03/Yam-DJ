-- =====================================================================
-- YAM DJ V1 — Schema PostgreSQL (Supabase)
-- Execute automatiquement au demarrage (spring.sql.init.mode=always)
-- Toutes les requetes sont idempotentes (IF NOT EXISTS)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================= USERS =============================
CREATE TABLE IF NOT EXISTS app_user (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    pseudo          VARCHAR(100) NOT NULL,
    phone           VARCHAR(30),
    role            VARCHAR(20)  NOT NULL DEFAULT 'USER',
    email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    verification_code VARCHAR(10),
    country         VARCHAR(60)  DEFAULT 'Burkina Faso',
    avatar_url      VARCHAR(500),
    enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT now()
);

-- ======================= PROFILS ARTISTES ========================
CREATE TABLE IF NOT EXISTS artist_profile (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    stage_name      VARCHAR(150) NOT NULL,
    bio             TEXT,
    photo_url       VARCHAR(500),
    balance_xof     BIGINT NOT NULL DEFAULT 0,
    total_plays     BIGINT NOT NULL DEFAULT 0,
    total_tips_xof  BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ========================= PROFILS DJ ============================
CREATE TABLE IF NOT EXISTS dj_profile (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    dj_name         VARCHAR(150) NOT NULL,
    bio             TEXT,
    photo_url       VARCHAR(500),
    balance_xof     BIGINT NOT NULL DEFAULT 0,
    mixtape_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================== TRACKS ==============================
CREATE TABLE IF NOT EXISTS track (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    artist_id       UUID NOT NULL REFERENCES app_user(id),
    audio_url_hq    VARCHAR(500),
    audio_url_lq    VARCHAR(500),
    cover_url       VARCHAR(500),
    duration_sec    INTEGER NOT NULL DEFAULT 0,
    bpm             INTEGER,
    musical_key     VARCHAR(6),
    camelot         VARCHAR(4),
    genre           VARCHAR(50),
    country         VARCHAR(60),
    language        VARCHAR(30) DEFAULT 'FR',
    play_count      BIGINT NOT NULL DEFAULT 0,
    like_count      BIGINT NOT NULL DEFAULT 0,
    download_count  BIGINT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    data_lite_ready BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_track_status     ON track(status);
CREATE INDEX IF NOT EXISTS idx_track_genre      ON track(genre);
CREATE INDEX IF NOT EXISTS idx_track_country    ON track(country);
CREATE INDEX IF NOT EXISTS idx_track_artist     ON track(artist_id);
CREATE INDEX IF NOT EXISTS idx_track_play_count ON track(play_count DESC);

-- ========================== MIXTAPES =============================
CREATE TABLE IF NOT EXISTS mixtape (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dj_id           UUID NOT NULL REFERENCES app_user(id),
    title           VARCHAR(200) NOT NULL,
    cover_url       VARCHAR(500),
    audio_url       VARCHAR(500),
    duration_sec    INTEGER NOT NULL DEFAULT 0,
    track_ids       TEXT,
    crossfade_sec   INTEGER NOT NULL DEFAULT 8,
    play_count      BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ========================== PLAYLISTS ============================
CREATE TABLE IF NOT EXISTS playlist (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    cover_url       VARCHAR(500),
    is_public       BOOLEAN NOT NULL DEFAULT TRUE,
    track_ids       TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ============================ TIPS ===============================
CREATE TABLE IF NOT EXISTS tip (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id    UUID REFERENCES app_user(id),
    to_artist_id    UUID NOT NULL REFERENCES app_user(id),
    amount_xof      INTEGER NOT NULL,
    message         VARCHAR(300),
    payment_token   VARCHAR(100) UNIQUE,
    cinetpay_id     VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    completed_at    TIMESTAMP
);
-- Migration FedaPay : identifiant de transaction du prestataire
ALTER TABLE tip ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_tip_provider_txn ON tip(provider_txn_id);
CREATE INDEX IF NOT EXISTS idx_tip_artist ON tip(to_artist_id);
CREATE INDEX IF NOT EXISTS idx_tip_status ON tip(status);

-- ======================= HISTORIQUE ECOUTES ======================
CREATE TABLE IF NOT EXISTS play_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES app_user(id) ON DELETE CASCADE,
    track_id        UUID NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    played_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_user ON play_history(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_track_time ON play_history(track_id, played_at DESC);
-- Bases existantes : user_id devient nullable (ecoutes anonymes comptees
-- dans les charts hebdomadaires)
ALTER TABLE play_history ALTER COLUMN user_id DROP NOT NULL;


-- ======================== ABONNEMENTS =============================
CREATE TABLE IF NOT EXISTS user_follow (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    artist_id       UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_follow_follower_artist UNIQUE (follower_id, artist_id)
);
CREATE INDEX IF NOT EXISTS idx_follow_artist ON user_follow(artist_id);
CREATE INDEX IF NOT EXISTS idx_follow_follower ON user_follow(follower_id);

-- ======================== COMMENTAIRES ===========================
-- Phase 2.2 : commentaires des pistes. CASCADE sur track (suppression
-- automatique des commentaires quand la piste disparait).
CREATE TABLE IF NOT EXISTS comment (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id    UUID NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES app_user(id),
    content     VARCHAR(500) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comment_track ON comment(track_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_user  ON comment(user_id);

-- ====================== LIKES PAR UTILISATEUR ===================
CREATE TABLE IF NOT EXISTS track_like (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    track_id    UUID NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_track_like_user_track UNIQUE (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_track_like_user ON track_like(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_like_track ON track_like(track_id);

-- ============== NOUVELLES COLONNES (Phases 2.4/2.6/3.1/3.2) ============
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP;

-- ============ INTEGRATION YOUTUBE + MUSIQUES LIBRES ================
ALTER TABLE track ADD COLUMN IF NOT EXISTS youtube_id VARCHAR(20);
ALTER TABLE track ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'UPLOAD';
ALTER TABLE track ADD COLUMN IF NOT EXISTS source_artist VARCHAR(150);
ALTER TABLE track ADD COLUMN IF NOT EXISTS source_url VARCHAR(500);
-- Une video YouTube ne peut etre importee qu'une seule fois
CREATE UNIQUE INDEX IF NOT EXISTS uq_track_youtube ON track(youtube_id);
CREATE INDEX IF NOT EXISTS idx_track_source ON track(source);

-- ====================== CHARTS HEBDOMADAIRES (2.6) ==================
CREATE TABLE IF NOT EXISTS weekly_chart (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start  DATE NOT NULL,
    track_id    UUID NOT NULL,
    country     VARCHAR(100),
    rank        INTEGER NOT NULL,
    plays       BIGINT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_weekly_chart_week_track UNIQUE (week_start, track_id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_chart_week ON weekly_chart(week_start, rank);
CREATE INDEX IF NOT EXISTS idx_weekly_chart_country ON weekly_chart(country);

-- =================== NOTIFICATIONS IN-APP (2.4) ====================
CREATE TABLE IF NOT EXISTS notification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    type        VARCHAR(40) NOT NULL,
    title       VARCHAR(150) NOT NULL,
    body        VARCHAR(500) NOT NULL,
    link_url    VARCHAR(300),
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, created_at DESC);

-- ==================== ABONNEMENTS WEB PUSH (2.4) ===================
CREATE TABLE IF NOT EXISTS push_subscription (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    endpoint    VARCHAR(600) NOT NULL UNIQUE,
    p256dh      VARCHAR(200),
    auth        VARCHAR(150),
    user_agent  VARCHAR(300),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscription_user ON push_subscription(user_id);

-- ==================== ORDRES PREMIUM FAN (3.1) =====================
CREATE TABLE IF NOT EXISTS premium_order (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app_user(id),
    amount_xof      INTEGER NOT NULL,
    period_days     INTEGER NOT NULL DEFAULT 30,
    payment_token   VARCHAR(30) NOT NULL UNIQUE,
    provider_txn_id VARCHAR(40),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    completed_at    TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_premium_order_user ON premium_order(user_id);

-- ================== DEMANDES DE RETRAIT ARTISTES (3.2) ==============
CREATE TABLE IF NOT EXISTS withdrawal_request (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id),
    amount_xof  INTEGER NOT NULL,
    operator    VARCHAR(20) NOT NULL,
    phone       VARCHAR(30) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    admin_note  VARCHAR(500),
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    processed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_user ON withdrawal_request(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_request(status);

-- ================ REDEVANCES D'ECOUTE (Phase 3.3) ==================
CREATE TABLE IF NOT EXISTS royalty_pool (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month     VARCHAR(7) NOT NULL UNIQUE,
    pool_amount_xof  BIGINT NOT NULL DEFAULT 0,
    premium_share_xof BIGINT NOT NULL DEFAULT 0,
    mixtape_share_xof BIGINT NOT NULL DEFAULT 0,
    total_plays      BIGINT NOT NULL DEFAULT 0,
    artist_count     INTEGER NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'DISTRIBUTED',
    distributed_at   TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS royalty_distribution (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id           UUID NOT NULL REFERENCES royalty_pool(id) ON DELETE CASCADE,
    period_month      VARCHAR(7) NOT NULL,
    artist_id         UUID NOT NULL REFERENCES app_user(id),
    plays             BIGINT NOT NULL DEFAULT 0,
    amount_xof        BIGINT NOT NULL DEFAULT 0,
    balance_after_xof BIGINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_royalty_dist_artist ON royalty_distribution(artist_id, period_month DESC);

-- ================ BOUTIQUE DE MIXTAPES (Phase 3.4) =================
-- Prix des mixtapes (0/null = gratuite) + achats 70/30
ALTER TABLE mixtape ADD COLUMN IF NOT EXISTS price_xof INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS mixtape_purchase (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mixtape_id        UUID NOT NULL REFERENCES mixtape(id) ON DELETE CASCADE,
    buyer_id          UUID NOT NULL REFERENCES app_user(id),
    dj_id             UUID NOT NULL REFERENCES app_user(id),
    amount_xof        INTEGER NOT NULL,
    dj_share_xof      INTEGER NOT NULL DEFAULT 0,
    platform_share_xof INTEGER NOT NULL DEFAULT 0,
    payment_token     VARCHAR(30) NOT NULL UNIQUE,
    provider_txn_id   VARCHAR(40),
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    completed_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mixtape_purchase_buyer ON mixtape_purchase(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_mixtape_purchase_mixtape ON mixtape_purchase(mixtape_id, buyer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mixtape_purchase_token ON mixtape_purchase(payment_token);

-- ====================== DONNEES DE DEMO ==========================
INSERT INTO app_user (id, email, password, pseudo, role, email_verified, country)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'giobamos03@gmail.com', '$2a$10$eTHWUK80g09Q4u5eZxQ/a.i43QVLTz1r9EiLnrTCNY0Yu/kC.xncm', 'GioBamos', 'ADMIN', TRUE, 'Burkina Faso'),
  ('00000000-0000-0000-0000-000000000002', 'artist@yamdj.africa', '$2a$10$fty6Xq2fkqDhGUeh.RJ.3uQWZHG6Tpgx4fvvyL/PDZdT8FQ9S34.W', 'FasoArtist', 'ARTIST', TRUE, 'Burkina Faso'),
  ('00000000-0000-0000-0000-000000000003', 'dj@yamdj.africa',   '$2a$10$fty6Xq2fkqDhGUeh.RJ.3uQWZHG6Tpgx4fvvyL/PDZdT8FQ9S34.W', 'DJOuaga',   'DJ',     TRUE, 'Burkina Faso'),
  ('00000000-0000-0000-0000-000000000005', 'system@yamdj.africa', '$2a$10$eTHWUK80g09Q4u5eZxQ/a.i43QVLTz1r9EiLnrTCNY0Yu/kC.xncm', 'YAM Music', 'ARTIST', TRUE, 'Afrique de l''Ouest')
ON CONFLICT (email) DO NOTHING;

INSERT INTO artist_profile (user_id, stage_name, bio)
VALUES ('00000000-0000-0000-0000-000000000002', 'FasoArtist', 'Artiste demo — coupes-decale et afrobeats depuis Ouagadougou.')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO artist_profile (user_id, stage_name, bio)
VALUES ('00000000-0000-0000-0000-000000000005', 'YAM Music', 'Catalogue officiel YAM DJ : hymnes nationaux et musiques libres d''acces.')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO dj_profile (user_id, dj_name, bio)
VALUES ('00000000-0000-0000-0000-000000000003', 'DJOuaga', 'DJ resident demo — mix afro, coupe-decale, ndombolo.')
ON CONFLICT (user_id) DO NOTHING;

-- Le compte admin personnel remplace l'ancien admin demo : l'email ayant
-- change, on neutralise l'ancienne ligne si elle reapparait (reprise de DB).
UPDATE app_user SET role = 'ADMIN', email_verified = TRUE
WHERE email = 'giobamos03@gmail.com';

-- ============ HYMNES NATIONAUX + MUSIQUES LIBRES D'ACCES ============
-- Catalogue "YAM Music" : lecture gratuite via le player YouTube integre.
-- Idempotent : un videoId ne peut exister qu'une fois (index unique).
INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('National Anthem of Burkina Faso - Une Seule Nuit', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/TZwoXTuoQ_M/hqdefault.jpg', 144, 'Hymne', 'Burkina Faso', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Burkina Faso', 'TZwoXTuoQ_M', 'https://www.youtube.com/watch?v=TZwoXTuoQ_M', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('l''hymne national de Côte d''Ivoire -  l''Abidjanaise', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/aXEbPyjGB-I/hqdefault.jpg', 99, 'Hymne', 'Cote d''Ivoire', 'FR', 'APPROVED', 'LIBRE', 'Hymne National de la Cote d''Ivoire', 'aXEbPyjGB-I', 'https://www.youtube.com/watch?v=aXEbPyjGB-I', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('National Anthem of Senegal - Pincez tous vos koras, frappez les balafons', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/iTRkbcylTDY/hqdefault.jpg', 96, 'Hymne', 'Senegal', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Senegal', 'iTRkbcylTDY', 'https://www.youtube.com/watch?v=iTRkbcylTDY', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Hymne National du Mali', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/dp_LDtwmyiY/hqdefault.jpg', 342, 'Hymne', 'Mali', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Mali', 'dp_LDtwmyiY', 'https://www.youtube.com/watch?v=dp_LDtwmyiY', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('National Anthem of Benin: "L''Aube nouvelle"', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/MKwNVlvIF0U/hqdefault.jpg', 211, 'Hymne', 'Benin', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Benin', 'MKwNVlvIF0U', 'https://www.youtube.com/watch?v=MKwNVlvIF0U', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('National Anthem of Togo - Terre de nos aïeux', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/_Azd8dpZTbU/hqdefault.jpg', 100, 'Hymne', 'Togo', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Togo', '_Azd8dpZTbU', 'https://www.youtube.com/watch?v=_Azd8dpZTbU', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Hymne national du Niger', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/4KLCVp52Yc4/hqdefault.jpg', 111, 'Hymne', 'Niger', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Niger', '4KLCVp52Yc4', 'https://www.youtube.com/watch?v=4KLCVp52Yc4', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Hymne National de la Guinée - "Liberté" | Version Officielle', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/DNDxrOliKFc/hqdefault.jpg', 86, 'Hymne', 'Guinee', 'FR', 'APPROVED', 'LIBRE', 'Hymne National de la Guinee', 'DNDxrOliKFc', 'https://www.youtube.com/watch?v=DNDxrOliKFc', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('National Anthem of Ghana - God Bless Our Homeland Ghana', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/T1d1GSZ9m5w/hqdefault.jpg', 89, 'Hymne', 'Ghana', 'FR', 'APPROVED', 'LIBRE', 'Ghana National Anthem', 'T1d1GSZ9m5w', 'https://www.youtube.com/watch?v=T1d1GSZ9m5w', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Nigerian National Anthem - "Arise, Oh Compatriots" (EN)', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/avPeagYhbgo/hqdefault.jpg', 80, 'Hymne', 'Nigeria', 'FR', 'APPROVED', 'LIBRE', 'Nigeria National Anthem', 'avPeagYhbgo', 'https://www.youtube.com/watch?v=avPeagYhbgo', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Cameroon National Anthem “Ô Cameroun berceau de nos ancêtres” (Lyrics) (USE 1080p) (French Version)', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/oC9OimNHiFI/hqdefault.jpg', 69, 'Hymne', 'Cameroun', 'FR', 'APPROVED', 'LIBRE', 'Hymne National du Cameroun', 'oC9OimNHiFI', 'https://www.youtube.com/watch?v=oC9OimNHiFI', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('LA MARSEILLAISE - HYMNE DE LA FRANCE - PAROLES', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/kLKEZBI3_gU/hqdefault.jpg', 67, 'Hymne', 'France', 'FR', 'APPROVED', 'LIBRE', 'Hymne National de la France', 'kLKEZBI3_gU', 'https://www.youtube.com/watch?v=kLKEZBI3_gU', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Magic System - 1Er Gaou', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/CKUZ-ZIUiwg/hqdefault.jpg', 206, 'Coupes-Decale', 'Cote d''Ivoire', 'FR', 'APPROVED', 'LIBRE', 'Magic System', 'CKUZ-ZIUiwg', 'https://www.youtube.com/watch?v=CKUZ-ZIUiwg', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Tiken Jah Fakoly - Plus jamais ça (Official video)', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/mYxhJn6Q994/hqdefault.jpg', 252, 'Reggae', 'Cote d''Ivoire', 'FR', 'APPROVED', 'LIBRE', 'Tiken Jah Fakoly', 'mYxhJn6Q994', 'https://www.youtube.com/watch?v=mYxhJn6Q994', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Youssou N''Dour - 7 Seconds ft. Neneh Cherry', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/wqCpjFMvz-k/hqdefault.jpg', 272, 'Mbalax', 'Senegal', 'FR', 'APPROVED', 'LIBRE', 'Youssou N''Dour & Neneh Cherry', 'wqCpjFMvz-k', 'https://www.youtube.com/watch?v=wqCpjFMvz-k', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Salif Keita    Africa', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/fj9MS13jhrI/hqdefault.jpg', 251, 'Afro-Pop', 'Mali', 'FR', 'APPROVED', 'LIBRE', 'Salif Keita', 'fj9MS13jhrI', 'https://www.youtube.com/watch?v=fj9MS13jhrI', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Fally Ipupa - Eloko Oyo (Clip officiel)', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/T4KNVT2w0mU/hqdefault.jpg', 309, 'Rumba', 'Congo', 'FR', 'APPROVED', 'LIBRE', 'Fally Ipupa', 'T4KNVT2w0mU', 'https://www.youtube.com/watch?v=T4KNVT2w0mU', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Burna Boy - Last Last [Official Music Video]', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/421w1j87fEM/hqdefault.jpg', 174, 'Afrobeats', 'Nigeria', 'FR', 'APPROVED', 'LIBRE', 'Burna Boy', '421w1j87fEM', 'https://www.youtube.com/watch?v=421w1j87fEM', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Wizkid - Essence (Official Video) ft. Tems', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/jipQpjUA_o8/hqdefault.jpg', 246, 'Afrobeats', 'Nigeria', 'FR', 'APPROVED', 'LIBRE', 'Wizkid', 'jipQpjUA_o8', 'https://www.youtube.com/watch?v=jipQpjUA_o8', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Davido - Fall (Official Video)', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/3Iyuym-Gci0/hqdefault.jpg', 258, 'Afrobeats', 'Nigeria', 'FR', 'APPROVED', 'LIBRE', 'Davido', '3Iyuym-Gci0', 'https://www.youtube.com/watch?v=3Iyuym-Gci0', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('"Water No Get Enemy" from FELA! Original Broadway Cast Recording.', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/Rp6KWhy2FAk/hqdefault.jpg', 170, 'Afrobeat', 'Nigeria', 'FR', 'APPROVED', 'LIBRE', 'Fela Kuti', 'Rp6KWhy2FAk', 'https://www.youtube.com/watch?v=Rp6KWhy2FAk', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Angelique Kidjo - "Agolo"', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/dlgESq5FAx4/hqdefault.jpg', 248, 'Afro-Pop', 'Benin', 'FR', 'APPROVED', 'LIBRE', 'Angelique Kidjo', 'dlgESq5FAx4', 'https://www.youtube.com/watch?v=dlgESq5FAx4', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Francky Vincent-Fruit de la passion', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/7GZMc_9A5rY/hqdefault.jpg', 240, 'Zouk', 'Guadeloupe', 'FR', 'APPROVED', 'LIBRE', 'Francky Vincent', '7GZMc_9A5rY', 'https://www.youtube.com/watch?v=7GZMc_9A5rY', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;

INSERT INTO track (title, artist_id, cover_url, duration_sec, genre, country, language, status, source, source_artist, youtube_id, source_url, play_count, like_count, download_count, data_lite_ready)
VALUES ('Sunshine Day - OSIBISA', '00000000-0000-0000-0000-000000000005', 'https://i.ytimg.com/vi/MeH3OdgGHso/hqdefault.jpg', 299, 'Afro-Rock', 'Ghana', 'FR', 'APPROVED', 'LIBRE', 'Osibisa', 'MeH3OdgGHso', 'https://www.youtube.com/watch?v=MeH3OdgGHso', 0, 0, 0, FALSE)
ON CONFLICT (youtube_id) DO NOTHING;
