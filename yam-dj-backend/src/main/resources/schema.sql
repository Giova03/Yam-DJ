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
CREATE INDEX IF NOT EXISTS idx_tip_artist ON tip(to_artist_id);
CREATE INDEX IF NOT EXISTS idx_tip_status ON tip(status);

-- ======================= HISTORIQUE ECOUTES ======================
CREATE TABLE IF NOT EXISTS play_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    track_id        UUID NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    played_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_user ON play_history(user_id, played_at DESC);

-- ====================== DONNEES DE DEMO ==========================
INSERT INTO app_user (id, email, password, pseudo, role, email_verified, country)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@yamdj.africa', '$2a$10$fty6Xq2fkqDhGUeh.RJ.3uQWZHG6Tpgx4fvvyL/PDZdT8FQ9S34.W', 'YamAdmin', 'ADMIN', TRUE, 'Burkina Faso'),
  ('00000000-0000-0000-0000-000000000002', 'artist@yamdj.africa', '$2a$10$fty6Xq2fkqDhGUeh.RJ.3uQWZHG6Tpgx4fvvyL/PDZdT8FQ9S34.W', 'FasoArtist', 'ARTIST', TRUE, 'Burkina Faso'),
  ('00000000-0000-0000-0000-000000000003', 'dj@yamdj.africa',   '$2a$10$fty6Xq2fkqDhGUeh.RJ.3uQWZHG6Tpgx4fvvyL/PDZdT8FQ9S34.W', 'DJOuaga',   'DJ',     TRUE, 'Burkina Faso')
ON CONFLICT (email) DO NOTHING;

INSERT INTO artist_profile (user_id, stage_name, bio)
VALUES ('00000000-0000-0000-0000-000000000002', 'FasoArtist', 'Artiste demo — coupes-decale et afrobeats depuis Ouagadougou.')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO dj_profile (user_id, dj_name, bio)
VALUES ('00000000-0000-0000-0000-000000000003', 'DJOuaga', 'DJ resident demo — mix afro, coupe-decale, ndombolo.')
ON CONFLICT (user_id) DO NOTHING;
