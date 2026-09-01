package com.yamdj.dto;

import com.yamdj.dto.TrackDtos.TrackResponse;

import java.time.LocalDate;
import java.util.UUID;

/** DTOs des charts hebdomadaires. */
public final class ChartDtos {

    private ChartDtos() {}

    public record ChartEntryResponse(
            int rank,
            UUID trackId,
            long plays,
            LocalDate weekStart,
            String country,
            TrackResponse track
    ) {}
}
