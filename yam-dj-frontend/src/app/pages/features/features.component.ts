import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { IconComponent } from '../../components/icon/icon.component';

/**
 * GUIDE UTILISATEUR — page statique qui presente TOUTES les fonctionnalites
 * de la plateforme YAM DJ en 3 sections : Ecouter, Creer, Soutenir & monnayer.
 * Aucun HTTP, aucun appel de service : contenu fige.
 */

interface FeatureCard {
  icon: string;
  title: string;
  desc: string;
  link?: string;
  linkLabel?: string;
  note?: string;
}

interface FeatureSection {
  icon: string;
  label: string;
  cards: FeatureCard[];
}

@Component({
  selector: 'yam-features-page',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 pt-6 pb-12">

      <!-- En-tete -->
      <h1 class="yam-title mb-2 flex items-center gap-3"><yam-icon name="sparkles" [size]="28" class="text-yam-orange"/> Tout ce que YAM DJ sait faire</h1>
      <p class="text-white/50 text-sm max-w-2xl mb-10">
        Le guide complet de la plateforme : ecouter la musique africaine, creer et mixer,
        soutenir tes artistes preferes et monnayer ton talent. De Ouaga a Abidjan.
      </p>

      @for (section of sections(); track section.label) {
        <section class="mb-12">
          <h2 class="text-xl md:text-2xl font-bold mb-5 flex items-center gap-2.5">
            <span class="w-10 h-10 rounded-xl bg-yam-orange/10 border border-yam-orange/20 flex items-center justify-center text-yam-orange shrink-0">
              <yam-icon [name]="section.icon" [size]="20"/>
            </span>
            {{ section.label }}
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (card of section.cards; track card.title) {
              <article class="yam-card p-5 flex flex-col">
                <div class="w-11 h-11 rounded-xl bg-yam-orange/10 border border-yam-orange/20 flex items-center justify-center text-yam-orange mb-3" aria-hidden="true">
                  <yam-icon [name]="card.icon" [size]="22"/>
                </div>
                <h3 class="font-bold mb-2">{{ card.title }}</h3>
                <p class="text-white/50 text-sm leading-relaxed mb-4 flex-1">{{ card.desc }}</p>
                @if (card.link) {
                  <a [routerLink]="card.link" class="yam-btn-secondary self-start text-sm !px-4 !py-2">
                    {{ card.linkLabel || 'Decouvrir' }}
                  </a>
                }
                @if (card.note) {
                  <p class="text-white/30 text-xs mt-3">{{ card.note }}</p>
                }
              </article>
            }
          </div>
        </section>
      }

      <!-- Bandeau -->
      <div class="rounded-3xl bg-gradient-to-r from-yam-orange via-yam-gold to-yam-orange p-8 text-center shadow-xl">
        <p class="font-display font-extrabold text-2xl md:text-3xl text-yam-dark">
          YAM DJ - la musique africaine qui vibre
        </p>
      </div>
    </div>
  `
})
export class FeaturesComponent {
  private seo = inject(SeoService);

  constructor() {
    this.seo.page(
      'Guide — tout ce que YAM DJ sait faire | Streaming, Studio DJ, Tips',
      'Le guide complet de YAM DJ : écouter les sons d\'Afrique de l\'Ouest, mixer dans le Studio DJ Pro, soutenir les artistes en mobile money et monétiser ton talent.',
      'https://yam-dj-frontend.vercel.app/features');
  }
  sections = signal<FeatureSection[]>([
    {
      icon: 'headphones',
      label: 'Ecouter',
      cards: [
        {
          icon: 'music-note',
          title: 'Streaming adapte',
          desc: 'Lecture HLS 128 kbps avec file d\'attente et enchainement automatique des pistes. Qualite optimale sur bonne connexion, partout ou tu es.',
          link: '/',
          linkLabel: 'Ecouter'
        },
        {
          icon: 'smartphone',
          title: 'Mode Data-Lite',
          desc: 'Bascule automatique a 48 kbps quand la connexion est lente (2G/3G) : jusqu\'a 3 fois moins de data consommee pour ton forfait.',
          link: '/',
          linkLabel: 'Activer depuis le lecteur'
        },
        {
          icon: 'discoball',
          title: 'Mode Nightclub',
          desc: 'Bass boost et reverb de club via Web Audio : ton telephone se transforme en sono de soiree, sans materiel supplementaire.',
          link: '/',
          linkLabel: 'Activer depuis le lecteur'
        },
        {
          icon: 'folder',
          title: 'Ma Musique locale',
          desc: 'Importe et lis les musiques stockees sur ton telephone ou ton ordinateur. Titres, artistes et pochettes lus depuis les tags ID3.',
          link: '/local',
          linkLabel: 'Ouvrir Ma Musique'
        },
        {
          icon: 'download',
          title: 'Ecoute hors ligne (sans connexion)',
          desc: 'Telecharge tes pistes preferees en Data-Lite : elles restent jouables sans reseau, dans le bus ou en zone blanche. Installe l\'app sur ton ecran d\'accueil (PWA) — Premium : telechargements illimites.',
          link: '/downloads',
          linkLabel: 'Mes telechargements'
        },
        {
          icon: 'bar-chart',
          title: 'Charts hebdomadaires',
          desc: 'Le top des pistes les plus ecoutees de la semaine, tous pays d\'Afrique de l\'Ouest confondus ou pays par pays.',
          link: '/charts',
          linkLabel: 'Voir les charts'
        },
        {
          icon: 'music-4',
          title: 'Genres & radios',
          desc: 'Afrobeats, Coupé-Décalé, Rap, Zouglou, Gospel... explore le catalogue genre par genre et lance une radio infinie par style.',
          link: '/genres',
          linkLabel: 'Explorer les genres'
        },
        {
          icon: 'google',
          title: 'Connexion en 1 clic avec Google',
          desc: 'Inscris-toi et connecte-toi avec ton compte Google — ton profil Artiste ou DJ est prêt en quelques secondes.',
          link: '/register',
          linkLabel: 'Créer mon compte'
        },
        {
          icon: 'history',
          title: 'Historique & recommandations',
          desc: 'Ton historique d\'ecoutes alimente des recommandations personnalisees et des sections "Pour Toi" qui evoluent avec toi.',
          link: '/profile',
          linkLabel: 'Mon profil',
          note: 'Connexion requise'
        }
      ]
    },
    {
      icon: 'sliders',
      label: 'Creer',
      cards: [
        {
          icon: 'sliders',
          title: 'Studio DJ',
          desc: 'Deux platines virtuelles avec effets, boucles et synchronisation BPM pour preparer tes mixes comme en cabine.',
          link: '/dj-studio',
          linkLabel: 'Ouvrir le Studio DJ',
          note: 'Connexion requise'
        },
        {
          icon: 'sparkles',
          title: 'Auto-Mix IA',
          desc: 'Generation automatique de transitions harmoniques grace aux cles Camelot et au BPM de tes pistes : des enchainements propres, sans calcul.',
          link: '/dj-studio',
          linkLabel: 'Dans le Studio DJ',
          note: 'Connexion requise'
        },
        {
          icon: 'disc',
          title: 'Mixtapes',
          desc: 'Assemble des pistes avec fondu enchaine (crossfade FFmpeg) et publie ta mixtape a toute la communaute YAM DJ.',
          link: '/',
          linkLabel: 'Ecouter les mixtapes'
        },
        {
          icon: 'upload',
          title: 'Publier ma musique',
          desc: 'Depose tes morceaux (audio + pochette) avec BPM, tonalite et pays : la qualite audio est optimisee automatiquement et ta piste est en ligne en quelques secondes.',
          link: '/upload',
          linkLabel: 'Uploader un morceau',
          note: 'Compte artiste'
        },
        {
          icon: 'activity',
          title: 'Dashboard artiste',
          desc: 'Solde YAM Tips, ecoutes, fans, historique des pourboires et gestion de tes pistes en un seul coup d\'oeil.',
          link: '/dashboard',
          linkLabel: 'Voir mon dashboard',
          note: 'Compte artiste'
        }
      ]
    },
    {
      icon: 'wallet',
      label: 'Soutenir & monnayer',
      cards: [
        {
          icon: 'wallet',
          title: 'YAM Tips mobile money',
          desc: 'Soutiens tes artistes preferes en 1 clic via Orange Money, Wave, Moov Money ou carte bancaire, des 100 FCFA.'
        },
        {
          icon: 'star',
          title: 'Premium Fan',
          desc: 'Abonnement premium : qualite maximale, ecoute hors ligne et badge fan dore pour afficher ton soutien.',
          link: '/premium',
          linkLabel: 'Devenir Premium Fan'
        },
        {
          icon: 'banknote',
          title: 'Retraits artistes',
          desc: 'Les artistes retirent leurs gains YAM Tips directement sur leur compte mobile money, en toute securite.',
          link: '/dashboard',
          linkLabel: 'Voir mon solde',
          note: 'Compte artiste'
        },
        {
          icon: 'calendar',
          title: 'Redevances d\'ecoute',
          desc: 'Chaque mois, la cagnotte de la plateforme (abonnements Premium + part boutique de mixtapes) est repartie entre les artistes au prorata de leurs ecoutes. Transparence totale dans ton dashboard.',
          link: '/dashboard',
          linkLabel: 'Mes redevances',
          note: 'Compte artiste'
        },
        {
          icon: 'disc',
          title: 'Boutique de mixtapes',
          desc: 'Les DJs fixent le prix de leurs mixtapes : les fans debloquent a vie par mobile money et 70 % de chaque vente va direct au createur.',
          link: '/dj-studio',
          linkLabel: 'Creer une mixtape payante',
          note: 'Compte DJ'
        },
        {
          icon: 'heart',
          title: 'Follow & commentaires',
          desc: 'Suis tes artistes, commente leurs pistes et retrouve leurs nouveautes dans ton fil d\'abonnements.',
          link: '/profile',
          linkLabel: 'Mon profil'
        },
        {
          icon: 'share',
          title: 'Partage social',
          desc: 'Partage une piste sur WhatsApp, Facebook ou X en un clic, avec un lien profond vers la page du morceau.'
        },
        {
          icon: 'bell',
          title: 'Notifications push',
          desc: 'Alertes en temps reel : nouveau tip recu, nouvelle piste d\'un artiste suivi, mixtape fraichement publiee.'
        }
      ]
    }
  ]);
}
