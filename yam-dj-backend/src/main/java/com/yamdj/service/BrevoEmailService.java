package com.yamdj.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * Integration Brevo (ex-Sendinblue) : emails transactionnels gratuits
 * (300 emails/jour). Envoi des codes de verification et notifications de tips.
 */
@Service
public class BrevoEmailService {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${yamdj.brevo.api-key}")
    private String apiKey;

    @Value("${yamdj.brevo.sender}")
    private String sender;

    @Value("${yamdj.brevo.sender-name}")
    private String senderName;

    @Value("${yamdj.brevo.base-url}")
    private String baseUrl;

    private static final String[] SUBJECTS_TIP = {
            "Tu as recu un YAM Tip !", "Un fan te soutient sur YAM DJ", "Nouveau tip Orange Money recu"
    };

    /** Genere un code de verification a 6 chiffres. */
    public String generateVerificationCode() {
        Random random = new Random();
        return String.format("%06d", random.nextInt(1000000));
    }

    @Async
    public void sendVerificationEmail(String to, String code) {
        String html = """
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:40px;border-radius:16px">
                  <h1 style="color:#FF6B35;font-size:28px;margin:0 0 16px">🎧 YAM DJ</h1>
                  <h2 style="font-size:20px;font-weight:normal">Confirme ton adresse email</h2>
                  <p style="color:#bbb;line-height:1.6">Bienvenue sur YAM DJ — la musique africaine qui vibre !
                  Entre ce code pour activer ton compte :</p>
                  <div style="background:#1a1a1a;border:2px dashed #FF6B35;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
                    <span style="font-size:36px;letter-spacing:10px;font-weight:bold;color:#FF6B35">%s</span>
                  </div>
                  <p style="color:#777;font-size:12px">Ce code expire apres votre activation. Si tu n'es pas a l'origine de cette inscription, ignore ce message.</p>
                  <p style="color:#FF6B35;font-weight:bold">L'equipe YAM DJ 🇧🇫</p>
                </div>
                """.formatted(code);
        sendEmail(to, "Ton code de verification YAM DJ", html);
    }

    @Async
    public void sendTipReceivedEmail(String to, String artistName, int amountXof, String fanPseudo, String message) {
        String subject = SUBJECTS_TIP[new Random().nextInt(SUBJECTS_TIP.length)];
        String msg = (message == null || message.isBlank()) ? "" : "<p style=\"font-style:italic;color:#FFD166\">\"" + message + "\"</p>";
        String fan = (fanPseudo == null || fanPseudo.isBlank()) ? "Un anonyme" : fanPseudo;
        String html = """
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:40px;border-radius:16px">
                  <h1 style="color:#FF6B35;font-size:28px;margin:0 0 16px">💰 YAM Tip recu !</h1>
                  <p>Salut <b>%s</b>,</p>
                  <p>%s vient de te soutenir avec un tip de <b style="color:#FFD166">%d FCFA</b> via Orange Money !</p>
                  %s
                  <p style="color:#bbb">Le montant a ete credite sur ton solde YAM DJ. Continue a faire vibrer l'Afrique ! 🎶</p>
                  <p style="color:#FF6B35;font-weight:bold">L'equipe YAM DJ</p>
                </div>
                """.formatted(artistName, fan, amountXof, msg);
        sendEmail(to, subject, html);
    }

    @Async
    public void sendTrackApprovedEmail(String to, String title) {
        String html = """
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:40px;border-radius:16px">
                  <h1 style="color:#22C55E;font-size:28px;margin:0 0 16px">✅ Track validee !</h1>
                  <p>Ta piste <b>"%s"</b> est desormais en ligne sur YAM DJ et visible par toute la communaute.</p>
                  <p style="color:#bbb">Partage ton lien artiste et commence a recevoir des tips Orange Money !</p>
                </div>
                """.formatted(title);
        sendEmail(to, "Ta track est en ligne sur YAM DJ", html);
    }

    /** Envoi via l'API REST Brevo /v3/smtp/send. */
    void sendEmail(String to, String subject, String htmlContent) {
        if (apiKey == null || apiKey.isBlank() || apiKey.startsWith("xkeysib-votre")) {
            System.out.println("[BREVO-MOCK] Email non envoye (cle absente) -> " + to + " : " + subject);
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("api-key", apiKey);

            Map<String, Object> body = new HashMap<>();
            Map<String, String> senderMap = new HashMap<>();
            senderMap.put("email", sender);
            senderMap.put("name", senderName);
            body.put("sender", senderMap);
            Map<String, String> toMap = new HashMap<>();
            toMap.put("email", to);
            body.put("to", java.util.List.of(toMap));
            body.put("subject", subject);
            body.put("htmlContent", htmlContent);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + "/smtp/email", request, String.class);

            System.out.println("[BREVO] Email envoye a " + to + " (status " + response.getStatusCode() + ")");
        } catch (Exception e) {
            System.err.println("[BREVO] Echec envoi email a " + to + " : " + e.getMessage());
        }
    }
}
