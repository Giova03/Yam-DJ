package com.yamdj.service;

import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.TrackRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

/**
 * SEO (Phase 2.7) : sitemap XML dynamique servant les pages publiques de
 * la plateforme (accueil, charts, guide, pages pistes et artistes).
 * Consomme par les crawleurs via la reecriture Vercel :
 * https://yam-dj-frontend.vercel.app/sitemap.xml ->
 * GET /api/seo/sitemap (backend Render).
 */
@Service
public class SeoService {

    /** Limite de protection (sitemap < 5 000 URLs, ~256 Ko). */
    private static final int MAX_DYNAMIC_URLS = 2000;

    @Value("${yamdj.app.frontend-url}")
    private String frontendUrl;

    private final TrackRepository trackRepository;
    private final ArtistProfileRepository artistProfileRepository;

    public SeoService(TrackRepository trackRepository,
                      ArtistProfileRepository artistProfileRepository) {
        this.trackRepository = trackRepository;
        this.artistProfileRepository = artistProfileRepository;
    }

    /** Genere le sitemap XML (UTF-8, protocole sitemap 0.9). */
    public String sitemap() {
        String base = stripSlash(frontendUrl);
        LocalDate today = LocalDate.now();
        StringBuilder xml = new StringBuilder(64 * 1024);
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        // Pages statiques publiques
        for (String[] page : new String[][]{
                {"/", "1.0", "daily"},
                {"/search", "0.9", "daily"},
                {"/charts", "0.9", "daily"},
                {"/artists", "0.9", "daily"},
                {"/radio", "0.8", "daily"},
                {"/genres", "0.8", "weekly"},
                {"/features", "0.8", "weekly"},
                {"/premium", "0.8", "monthly"},
                {"/local", "0.6", "monthly"},
                {"/login", "0.4", "monthly"},
                {"/register", "0.5", "monthly"}
        }) {
            addUrl(xml, base + page[0], today, page[1], page[2]);
        }

        // Pages publiques des pistes approuvees
        List<Track> tracks = trackRepository.findByStatus(TrackStatus.APPROVED,
                        org.springframework.data.domain.PageRequest.of(0, MAX_DYNAMIC_URLS))
                .getContent();
        for (Track t : tracks) {
            addUrl(xml, base + "/track/" + t.getId(), today, "0.7", "weekly");
        }

        // Pages publiques des artistes
        List<ArtistProfile> artists = artistProfileRepository.findAll();
        int count = 0;
        for (ArtistProfile a : artists) {
            if (count++ >= MAX_DYNAMIC_URLS) break;
            if (a.getUser() == null || a.getUser().getId() == null) continue;
            addUrl(xml, base + "/artist/" + a.getUser().getId(), today, "0.6", "weekly");
        }

        xml.append("</urlset>\n");
        return xml.toString();
    }

    private static void addUrl(StringBuilder xml, String loc, LocalDate lastmod,
                               String priority, String changefreq) {
        xml.append("  <url>\n");
        xml.append("    <loc>").append(escape(loc)).append("</loc>\n");
        xml.append("    <lastmod>").append(lastmod).append("</lastmod>\n");
        xml.append("    <changefreq>").append(changefreq).append("</changefreq>\n");
        xml.append("    <priority>").append(priority).append("</priority>\n");
        xml.append("  </url>\n");
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }

    private static String stripSlash(String url) {
        if (url == null) return "https://yam-dj-frontend.vercel.app";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
