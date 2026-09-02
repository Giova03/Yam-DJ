package com.yamdj.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yamdj.dto.TrackDtos;
import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Integration YouTube : recherche (scraping ytInitialData, sans cle API) et
 * import d'une video dans le catalogue YAM DJ (metadonnees oEmbed).
 * Les pistes importees sont lues via le player YouTube integre — aucune
 * extraction audio (conformite CGU YouTube) — et apparaissent dans la file
 * d'actualite comme toutes les autres pistes.
 */
@Service
public class YouTubeService {

    private static final Logger log = LoggerFactory.getLogger(YouTubeService.class);
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    /** Compte systeme YAM Music : proprietaire des pistes importees. */
    public static final String SYSTEM_ARTIST_EMAIL = "system@yamdj.africa";
    public static final UUID SYSTEM_ARTIST_ID = UUID.fromString("00000000-0000-0000-0000-000000000005");

    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;

    @Value("${yamdj.youtube.api-key:}")
    private String apiKey;

    public YouTubeService(TrackRepository trackRepository,
                          UserRepository userRepository,
                          ArtistProfileRepository artistProfileRepository) {
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** Resultat de recherche YouTube. */
    public record YoutubeVideo(
            String videoId,
            String title,
            String channel,
            String durationText,
            Integer durationSec,
            String thumbnailUrl,
            String watchUrl,
            boolean alreadyImported
    ) {}

    /**
     * Recherche YouTube. Priorite a l'API officielle (YOUTUBE_API_KEY),
     * sinon scraping de la page de resultats (ytInitialData).
     */
    public List<YoutubeVideo> search(String query, int limit) {
        int max = Math.min(Math.max(limit, 1), 24);
        if (apiKey != null && !apiKey.isBlank()) {
            try {
                List<YoutubeVideo> videos = searchViaApi(query, max);
                if (!videos.isEmpty()) return videos;
            } catch (Exception e) {
                log.warn("Recherche API YouTube echouee, bascule scraping : {}", e.getMessage());
            }
        }
        return searchViaScraping(query, max);
    }

    /** YouTube Data API v3 (si YOUTUBE_API_KEY configuree sur Render). */
    private List<YoutubeVideo> searchViaApi(String query, int limit) throws Exception {
        String url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video"
                + "&maxResults=" + limit
                + "&videoEmbeddable=true&q=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&key=" + apiKey;
        JsonNode root = getJson(url);
        List<String> ids = new ArrayList<>();
        Map<String, JsonNode> snippets = new LinkedHashMap<>();
        root.path("items").forEach(item -> {
            String id = item.path("id").path("videoId").asText(null);
            if (id != null) { ids.add(id); snippets.put(id, item.path("snippet")); }
        });
        Map<String, Integer> durations = fetchDurationsApi(ids);
        List<YoutubeVideo> out = new ArrayList<>();
        snippets.forEach((id, sn) -> out.add(toVideo(
                id, sn.path("title").asText(""), sn.path("channelTitle").asText(""),
                durations.getOrDefault(id, null))));
        return out;
    }

    private Map<String, Integer> fetchDurationsApi(List<String> ids) throws Exception {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (ids.isEmpty()) return out;
        String url = "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id="
                + String.join(",", ids) + "&key=" + apiKey;
        JsonNode root = getJson(url);
        root.path("items").forEach(item -> out.put(
                item.path("id").asText(),
                parseIsoDuration(item.path("contentDetails").path("duration").asText(""))));
        return out;
    }

    /** Scraping de youtube.com/results : parse ytInitialData en JSON. */
    private List<YoutubeVideo> searchViaScraping(String query, int limit) {
        List<YoutubeVideo> out = new ArrayList<>();
        try {
            String url = "https://www.youtube.com/results?search_query="
                    + URLEncoder.encode(query, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", UA)
                    .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
                    .timeout(Duration.ofSeconds(15))
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            Matcher m = Pattern.compile("var ytInitialData = (\\{.*?\\});</script>",
                    Pattern.DOTALL).matcher(resp.body());
            if (!m.find()) {
                log.warn("ytInitialData introuvable — YouTube a peut-etre bloque la requete");
                return out;
            }
            JsonNode sections = mapper.readTree(m.group(1))
                    .path("contents").path("twoColumnSearchResultsRenderer")
                    .path("primaryContents").path("sectionListRenderer").path("contents");
            List<String> seen = new ArrayList<>();
            for (JsonNode section : sections) {
                for (JsonNode item : section.path("itemSectionRenderer").path("contents")) {
                    JsonNode vr = item.path("videoRenderer");
                    if (vr.isMissingNode() || out.size() >= limit) continue;
                    String id = vr.path("videoId").asText(null);
                    if (id == null || seen.contains(id)) continue;
                    seen.add(id);
                    String title = vr.path("title").path("runs").path(0).path("text").asText("");
                    String channel = vr.path("ownerText").path("runs").path(0).path("text").asText("");
                    String length = vr.path("lengthText").path("simpleText").asText("");
                    out.add(toVideo(id, title, channel, parseClockDuration(length)));
                }
            }
        } catch (Exception e) {
            log.warn("Recherche YouTube (scraping) echouee : {}", e.getMessage());
        }
        return out;
    }

    /**
     * Import d'une video YouTube dans le catalogue YAM DJ.
     * Idempotent : une video ne peut etre importee qu'une fois (index unique).
     * La piste creee est APPROVED -> visible immediatement dans le feed.
     */
    public TrackDtos.TrackResponse importVideo(String videoIdOrUrl) {
        String videoId = extractVideoId(videoIdOrUrl);
        if (videoId == null) {
            throw new IllegalArgumentException("Identifiant ou URL YouTube invalide : " + videoIdOrUrl);
        }
        var existing = trackRepository.findByYoutubeId(videoId);
        if (existing.isPresent()) {
            Track t = existing.get();
            return TrackDtos.from(t, artistName(t.getArtistId()), pseudo(t.getArtistId()));
        }

        // Metadonnees via oEmbed (aucune cle requise)
        String title = null, channel = null;
        String thumb = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
        try {
            String oembed = "https://www.youtube.com/oembed?url="
                    + URLEncoder.encode("https://www.youtube.com/watch?v=" + videoId, StandardCharsets.UTF_8)
                    + "&format=json";
            JsonNode meta = getJson(oembed);
            title = meta.path("title").asText(null);
            channel = meta.path("author_name").asText(null);
            String t = meta.path("thumbnail_url").asText(null);
            if (t != null) thumb = t;
        } catch (Exception e) {
            log.warn("oEmbed YouTube indisponible ({}) : import continue sans metadonnees", e.getMessage());
        }
        if (title == null || title.isBlank()) title = "YouTube " + videoId;
        if (channel == null || channel.isBlank()) channel = "YouTube";

        Track track = Track.builder()
                .title(title.length() > 200 ? title.substring(0, 200) : title)
                .artistId(SYSTEM_ARTIST_ID)
                .coverUrl(thumb)
                .durationSec(0)
                .genre("YouTube")
                .country(null)
                .language("FR")
                .status(TrackStatus.APPROVED)
                .dataLiteReady(false)
                .youtubeId(videoId)
                .source("YOUTUBE")
                .sourceArtist(channel.length() > 150 ? channel.substring(0, 150) : channel)
                .sourceUrl("https://www.youtube.com/watch?v=" + videoId)
                .build();
        track = trackRepository.save(track);
        log.info("Video YouTube importee : {} ({})", title, videoId);
        return TrackDtos.from(track, "YAM Music", "YamMusic");
    }

    /** Musiques libres d'acces (hymnes + imports) : lecture gratuite. */
    public List<TrackDtos.TrackResponse> libre(int limit) {
        List<Track> tracks = trackRepository.findLibre(PageRequest.of(0, Math.min(Math.max(limit, 1), 50)));
        return tracks.stream().map(t -> {
            String name = t.getSourceArtist() != null ? t.getSourceArtist() : artistName(t.getArtistId());
            return TrackDtos.from(t, name, pseudo(t.getArtistId()));
        }).toList();
    }

    // ========================= utilitaires =========================

    private YoutubeVideo toVideo(String id, String title, String channel, Integer durationSec) {
        boolean imported = trackRepository.findByYoutubeId(id).isPresent();
        return new YoutubeVideo(id, title, channel,
                durationSec != null ? formatClock(durationSec) : "",
                durationSec,
                "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
                "https://www.youtube.com/watch?v=" + id,
                imported);
    }

    /** Extrait le videoId des formats usuels : watch?v=, youtu.be/, shorts/, musique. */
    static String extractVideoId(String input) {
        if (input == null || input.isBlank()) return null;
        String s = input.trim();
        if (s.matches("[a-zA-Z0-9_-]{11}")) return s;
        Matcher m = Pattern.compile("(?:v=|/shorts/|/embed/|youtu\\.be/|/v/)([a-zA-Z0-9_-]{11})").matcher(s);
        return m.find() ? m.group(1) : null;
    }

    private JsonNode getJson(String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .header("User-Agent", UA)
                .timeout(Duration.ofSeconds(12))
                .GET().build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        return mapper.readTree(resp.body());
    }

    /** "3:45" ou "1:02:03" -> secondes. */
    static Integer parseClockDuration(String text) {
        if (text == null || text.isBlank() || !text.contains(":")) return null;
        try {
            int sec = 0;
            for (String part : text.trim().split(":")) sec = sec * 60 + Integer.parseInt(part.trim());
            return sec;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** "PT4M13S" (ISO 8601) -> secondes. */
    static Integer parseIsoDuration(String iso) {
        if (iso == null || !iso.startsWith("PT")) return null;
        Matcher m = Pattern.compile("PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?").matcher(iso);
        if (!m.find()) return null;
        int h = m.group(1) != null ? Integer.parseInt(m.group(1)) : 0;
        int min = m.group(2) != null ? Integer.parseInt(m.group(2)) : 0;
        int s = m.group(3) != null ? Integer.parseInt(m.group(3)) : 0;
        return h * 3600 + min * 60 + s;
    }

    private static String formatClock(int sec) {
        return sec >= 3600
                ? String.format("%d:%02d:%02d", sec / 3600, (sec % 3600) / 60, sec % 60)
                : String.format("%d:%02d", sec / 60, sec % 60);
    }

    private String artistName(UUID artistId) {
        return userRepository.findById(artistId)
                .flatMap(u -> artistProfileRepository.findByUserId(u.getId()))
                .map(p -> p.getStageName())
                .orElseGet(() -> userRepository.findById(artistId)
                        .map(u -> u.getPseudo()).orElse("YAM Music"));
    }

    private String pseudo(UUID artistId) {
        return userRepository.findById(artistId).map(u -> u.getPseudo()).orElse("YamMusic");
    }
}
