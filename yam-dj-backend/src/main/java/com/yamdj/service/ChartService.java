package com.yamdj.service;

import com.yamdj.dto.ChartDtos.ChartEntryResponse;
import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.entity.Track;
import com.yamdj.entity.WeeklyChart;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import com.yamdj.repository.WeeklyChartRepository;
import com.yamdj.repository.PlayHistoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Charts hebdomadaires (Phase 2.6) : agregation des ecoutes de la semaine
 * (lundi 00:00) materialisee dans weekly_chart, rafraichie toutes les heures
 * et au demarrage. Le rang stocke est le rang global ; le filtre par pays
 * recalcule le rang pays a la lecture.
 */
@Service
public class ChartService {

    private static final Logger log = LoggerFactory.getLogger(ChartService.class);

    /** Taille du chart materialise (top global). */
    private static final int CHART_SIZE = 50;

    private final WeeklyChartRepository chartRepository;
    private final PlayHistoryRepository playHistoryRepository;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;

    public ChartService(WeeklyChartRepository chartRepository,
                        PlayHistoryRepository playHistoryRepository,
                        TrackRepository trackRepository,
                        UserRepository userRepository,
                        ArtistProfileRepository artistProfileRepository) {
        this.chartRepository = chartRepository;
        this.playHistoryRepository = playHistoryRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
    }

    /**
     * Recalcul au demarrage (chart immediatement disponible).
     * NOTE : appele par ChartStartupRefresher (composant externe) et non en
     * auto-invocation — un appel this.refreshWeeklyChart() contournerait le
     * proxy @Transactional et le deleteByWeekStart (@Modifying) echouerait
     * (TransactionRequiredException).
     */
    @Scheduled(fixedDelay = 3600_000, initialDelay = 300_000)
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "chartsCache", allEntries = true)
    public void refreshWeeklyChart() {
        LocalDate weekStart = currentWeekStart();
        LocalDateTime since = weekStart.atStartOfDay();

        List<Object[]> rows = playHistoryRepository.aggregatePlaysSince(since);
        if (rows.isEmpty()) {
            log.debug("Chart {} : aucune ecoute comptabilisee cette semaine", weekStart);
            return;
        }

        chartRepository.deleteByWeekStart(weekStart);

        List<WeeklyChart> entries = new ArrayList<>();
        int rank = 1;
        for (Object[] row : rows) {
            if (rank > CHART_SIZE) break;
            UUID trackId = (UUID) row[0];
            String country = row[1] == null ? null : row[1].toString();
            long plays = ((Number) row[2]).longValue();
            entries.add(WeeklyChart.builder()
                    .weekStart(weekStart)
                    .trackId(trackId)
                    .country(country)
                    .rank(rank++)
                    .plays(plays)
                    .build());
        }
        chartRepository.saveAll(entries);
        log.info("Chart {} recalcule : {} entrees", weekStart, entries.size());
    }

    /** Chart courant (optionnellement filtre par pays). */
    @Transactional(readOnly = true)
    @org.springframework.cache.annotation.Cacheable(
            value = "chartsCache",
            key = "T(java.util.Objects).hashCode(#country) + ':' + #limit",
            condition = "#limit <= 100")
    public List<ChartEntryResponse> currentChart(String country, int limit) {
        LocalDate latest = chartRepository.findLatestWeek();
        if (latest == null) return List.of();

        List<WeeklyChart> rows = chartRepository.findTop100ByWeekStartOrderByRankAsc(latest);
        if (country != null && !country.isBlank() && !"all".equalsIgnoreCase(country)) {
            String wanted = country.trim();
            rows = rows.stream().filter(r -> wanted.equalsIgnoreCase(r.getCountry())).toList();
        }

        // Pistes encore existantes (une piste supprimee quitte le chart)
        List<UUID> ids = rows.stream().map(WeeklyChart::getTrackId).toList();
        Map<UUID, Track> tracks = ids.isEmpty() ? Map.of()
                : trackRepository.findAllById(ids).stream()
                        .collect(Collectors.toMap(Track::getId, t -> t));
        Map<UUID, String[]> artistNames = resolveArtistNames(tracks.values());

        // Mouvement vs semaine precedente : rang precedent - rang courant.
        // Positif = monte, negatif = descend, null = nouvelle entree.
        Map<UUID, Integer> previousRanks = previousWeekRanks(latest.minusWeeks(1), country);

        List<ChartEntryResponse> result = new ArrayList<>();
        int countryRank = 1;
        for (WeeklyChart row : rows) {
            Track t = tracks.get(row.getTrackId());
            if (t == null) continue;
            String[] names = artistNames.getOrDefault(t.getArtistId(), new String[]{"—", "—"});
            Integer prev = previousRanks.get(row.getTrackId());
            Integer movement = (prev == null) ? null : (prev - countryRank);
            result.add(new ChartEntryResponse(
                    countryRank++,
                    row.getTrackId(),
                    row.getPlays(),
                    row.getWeekStart(),
                    row.getCountry(),
                    movement,
                    TrackDtos_from(t, names)));
            if (result.size() >= Math.max(1, Math.min(limit, 100))) break;
        }
        return result;
    }

    /** Rangs de la semaine precedente, optionnellement filtres par pays. */
    private Map<UUID, Integer> previousWeekRanks(LocalDate week, String country) {
        Map<UUID, Integer> ranks = new HashMap<>();
        if (week == null) return ranks;
        boolean byCountry = country != null && !country.isBlank() && !"all".equalsIgnoreCase(country);
        String wanted = byCountry ? country.trim() : null;
        int filteredRank = 1;
        for (WeeklyChart row : chartRepository.findTop100ByWeekStartOrderByRankAsc(week)) {
            if (wanted != null) {
                if (!wanted.equalsIgnoreCase(row.getCountry())) continue;
                ranks.put(row.getTrackId(), filteredRank++);
            } else {
                ranks.put(row.getTrackId(), row.getRank());
            }
        }
        return ranks;
    }

    /** Pays representes dans le chart courant. */
    @Transactional(readOnly = true)
    public List<String> chartCountries() {
        LocalDate latest = chartRepository.findLatestWeek();
        if (latest == null) return List.of();
        return chartRepository.findTop100ByWeekStartOrderByRankAsc(latest).stream()
                .map(WeeklyChart::getCountry)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
    }

    /** Lundi 00:00 de la semaine en cours. */
    public static LocalDate currentWeekStart() {
        return LocalDate.now().with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** Nom affiche : stage name si profil artiste, sinon pseudo (pattern TrackService). */
    private Map<UUID, String[]> resolveArtistNames(Collection<Track> tracks) {
        Map<UUID, String[]> names = new HashMap<>();
        Set<UUID> artistIds = tracks.stream().map(Track::getArtistId).collect(Collectors.toSet());
        for (UUID artistId : artistIds) {
            userRepository.findById(artistId).ifPresent(u -> {
                String stageName = artistProfileRepository.findByUserId(u.getId())
                        .map(p -> p.getStageName()).orElse(u.getPseudo());
                names.put(artistId, new String[]{stageName, u.getPseudo()});
            });
        }
        return names;
    }

    /** Indirection pour garder ce service independant de TrackDtos (lisibilite). */
    private static TrackResponse TrackDtos_from(Track t, String[] names) {
        return com.yamdj.dto.TrackDtos.from(t, names[0], names[1]);
    }
}
