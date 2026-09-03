package com.yamdj.entity.enums;

/**
 * Cycle de vie complet d'une piste (pipeline asynchrone) :
 * PROCESSING (job FFmpeg en cours) -> APPROVED / PENDING (moderation) /
 * REJECTED (moderation) / FAILED (erreur de traitement, retry possible).
 */
public enum TrackStatus {
    PENDING, PROCESSING, APPROVED, REJECTED, FAILED
}
