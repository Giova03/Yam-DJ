package com.yamdj.service;

import com.yamdj.dto.RoyaltyDtos;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.RoyaltyDistribution;
import com.yamdj.entity.RoyaltyPool;
import com.yamdj.entity.enums.TipStatus;
import com.yamdj.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Redevances d'ecoute (Phase 3.3) : repartition mensuelle d'une cagnotte
 * au prorata des ecoutes entre les artistes.
 *
 * Cagnotte = part plateforme des revenus du mois precedent :
 *   - 100 % des abonnements Premium Fan confirmes sur la periode
 *   - 30 % des achats de mixtapes confirmes sur la periode
 * (les YAM Tips vont deja en totalite aux artistes).
 *
 * Repartition : chaque ecoute comptee (play_history, pistes APPROVED)
 * rapporte montant_cagnotte / total_ecoutes. Creditee au solde de
 * l'artiste (retirable via la file de retraits) + email + notification.
 *
 * Job : 1er de chaque mois a 00h30 (UTC), declenchable manuellement
 * par un ADMIN (POST /api/admin/royalties/run).
 */
@Service
public class RoyaltyService {

    private static final Logger log = LoggerFactory.getLogger(RoyaltyService.class);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final RoyaltyPoolRepository poolRepository;
    private final RoyaltyDistributionRepository distributionRepository;
    private final PremiumOrderRepository premiumOrderRepository;
    private final MixtapePurchaseRepository mixtapePurchaseRepository;
    private final PlayHistoryRepository playHistoryRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final BrevoEmailService emailService;
    private final NotificationService notificationService;

    public RoyaltyService(RoyaltyPoolRepository poolRepository,
                          RoyaltyDistributionRepository distributionRepository,
                          PremiumOrderRepository premiumOrderRepository,
                          MixtapePurchaseRepository mixtapePurchaseRepository,
                          PlayHistoryRepository playHistoryRepository,
                          ArtistProfileRepository artistProfileRepository,
                          BrevoEmailService emailService,
                          NotificationService notificationService) {
        this.poolRepository = poolRepository;
        this.distributionRepository = distributionRepository;
        this.premiumOrderRepository = premiumOrderRepository;
        this.mixtapePurchaseRepository = mixtapePurchaseRepository;
        this.playHistoryRepository = playHistoryRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.emailService = emailService;
        this.notificationService = notificationService;
    }

    /**
     * Job mensuel : repartit les revenus du mois precedent.
     *cron : 1er du mois 00h30.
     */
    @Scheduled(cron = "0 30 0 1 * *", zone = "UTC")
    public void monthlyDistribution() {
        YearMonth previous = YearMonth.now().minusMonths(1);
        try {
            runDistribution(previous);
        } catch (Exception e) {
            log.error("Distribution des redevances {} echouee : {}", previous, e.getMessage());
        }
    }

    /**
     * Calcule et distribue la cagnotte d'un mois donne. Idempotent :
     * un mois deja distribue renvoie son pool existant.
     */
    @Transactional
    public RoyaltyPool runDistribution(YearMonth period) {
        String month = period.format(MONTH);
        if (poolRepository.existsByPeriodMonth(month)) {
            log.info("Redevances {} deja distribuees, ignored", month);
            return poolRepository.findByPeriodMonth(month).orElseThrow();
        }

        LocalDateTime from = period.atDay(1).atStartOfDay();
        LocalDateTime to = period.plusMonths(1).atDay(1).atStartOfDay();

        // 1. Revenus plateforme de la periode
        long premiumShare = premiumOrderRepository
                .findByStatusAndCompletedAtBetween(TipStatus.COMPLETED, from, to)
                .stream().mapToLong(o -> o.getAmountXof()).sum();

        long mixtapeShare = mixtapePurchaseRepository
                .findByStatusAndCompletedAtBetween(TipStatus.COMPLETED, from, to)
                .stream().mapToLong(p -> p.getPlatformShareXof()).sum();

        long pool = premiumShare + mixtapeShare;

        // 2. Ecoutes comptees par artiste (pistes approuvees)
        List<Object[]> rows = playHistoryRepository.countPlaysByArtistBetween(from, to);
        long totalPlays = rows.stream().mapToLong(r -> ((Number) r[1]).longValue()).sum();

        RoyaltyPool rp = RoyaltyPool.builder()
                .periodMonth(month)
                .poolAmountXof(pool)
                .premiumShareXof(premiumShare)
                .mixtapeShareXof(mixtapeShare)
                .totalPlays(totalPlays)
                .artistCount(pool > 0 ? rows.size() : 0)
                .distributedAt(LocalDateTime.now())
                .build();
        poolRepository.save(rp);

        if (pool <= 0 || totalPlays <= 0 || rows.isEmpty()) {
            log.info("Redevances {} : cagnotte {} F pour {} ecoutes — rien a repartir",
                    month, pool, totalPlays);
            return rp;
        }

        // 3. Repartition au prorata + credit des soldes
        int credited = 0;
        for (Object[] row : rows) {
            UUID artistId = (UUID) row[0];
            long plays = ((Number) row[1]).longValue();
            long amount = Math.round((double) pool * plays / totalPlays);
            if (amount < 1) {
                continue;
            }

            ArtistProfile profile = artistProfileRepository.findById(artistId).orElse(null);
            if (profile == null) {
                continue;
            }
            profile.setBalanceXof(profile.getBalanceXof() + amount);
            artistProfileRepository.save(profile);

            distributionRepository.save(RoyaltyDistribution.builder()
                    .poolId(rp.getId())
                    .periodMonth(month)
                    .artistId(artistId)
                    .plays(plays)
                    .amountXof(amount)
                    .balanceAfterXof(profile.getBalanceXof())
                    .build());
            credited++;

            try {
                emailService.sendRoyaltyCreditedEmail(profile.getUser().getEmail(),
                        profile.getUser().getPseudo(), month, amount, plays,
                        profile.getBalanceXof());
                notificationService.notifyUser(profile.getUser().getId(), "ROYALTY_CREDITED",
                        "Redevances " + month,
                        amount + " F credites pour " + plays + " ecoutes (" + month
                                + "). Solde : " + profile.getBalanceXof() + " F.",
                        "/profile");
            } catch (Exception notifFail) {
                log.warn("Notification redevance {} non envoyee : {}", artistId, notifFail.getMessage());
            }
        }
        rp.setArtistCount(credited);
        poolRepository.save(rp);
        log.info("Redevances {} : {} F repartis entre {} artistes ({} ecoutes)",
                month, pool, credited, totalPlays);
        return rp;
    }

    /** Releve de redevances de l'artiste connecte (dashboard). */
    @Transactional(readOnly = true)
    public RoyaltyDtos.ArtistRoyalties artistStatement(UUID artistId) {
        List<RoyaltyDistribution> lines =
                distributionRepository.findByArtistIdOrderByPeriodMonthDesc(artistId);
        long total = lines.stream().mapToLong(RoyaltyDistribution::getAmountXof).sum();
        long plays = lines.stream().mapToLong(RoyaltyDistribution::getPlays).sum();
        List<RoyaltyDtos.RoyaltyLine> items = lines.stream()
                .limit(24)
                .map(l -> new RoyaltyDtos.RoyaltyLine(l.getPeriodMonth(), l.getPlays(),
                        l.getAmountXof(), l.getBalanceAfterXof()))
                .toList();
        return new RoyaltyDtos.ArtistRoyalties(total, plays, items.size(), items);
    }

    /** Vue admin : pools mensuels. */
    @Transactional(readOnly = true)
    public List<RoyaltyDtos.PoolSummary> allPools() {
        List<RoyaltyDtos.PoolSummary> result = new ArrayList<>();
        poolRepository.findAll().stream()
                .sorted((a, b) -> b.getPeriodMonth().compareTo(a.getPeriodMonth()))
                .limit(36)
                .forEach(p -> result.add(new RoyaltyDtos.PoolSummary(
                        p.getId(), p.getPeriodMonth(), p.getPoolAmountXof(),
                        p.getPremiumShareXof(), p.getMixtapeShareXof(),
                        p.getTotalPlays(), p.getArtistCount(),
                        p.getStatus(), p.getDistributedAt())));
        return result;
    }

    /** Periode par defaut proposee a l'admin : mois precedent. */
    public YearMonth defaultPeriod() {
        return YearMonth.from(LocalDate.now().minusMonths(1));
    }
}
