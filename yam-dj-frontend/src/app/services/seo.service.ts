import { inject, Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

/**
 * SEO pragmatique : titres, meta description, Open Graph et
 * JSON-LD (MusicRecording, WebSite) injectes dans le <head>.
 * Angular est rendu cote client : les crawlers modernes
 * (Google, Bing) executent le JS — combine au sitemap XML
 * dynamique (/sitemap.xml -> backend) et au pre-calcul des
 * balises statiques dans index.html, la decouverte est couverte.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {

  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  /** Titre + description + Open Graph d'une page. */
  page(title: string, description: string, url?: string, imageUrl?: string): void {
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    if (url) this.meta.updateTag({ property: 'og:url', content: url });
    if (imageUrl) this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({ property: 'og:site_name', content: 'YAM DJ' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
  }

  /** JSON-LD : remplace le bloc precedent de meme type. */
  jsonLd(type: string, data: Record<string, unknown>): void {
    const dom = this.doc as Document;
    const old = dom.querySelector(`script[data-yam-seo="${type}"]`);
    if (old) old.remove();
    const script = dom.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-yam-seo', type);
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...data });
    dom.head.appendChild(script);
  }

  /** Donnees structurees d'une piste (page /track). */
  musicRecording(t: { title: string; artistName?: string; durationSec?: number; coverUrl?: string; playCount?: number; slug?: string; id: string }): void {
    this.jsonLd('MusicRecording', {
      name: t.title,
      byArtist: t.artistName ? { '@type': 'MusicGroup', name: t.artistName } : undefined,
      duration: t.durationSec ? `PT${Math.round(t.durationSec)}S` : undefined,
      image: t.coverUrl || undefined,
      interactionStatistic: t.playCount != null ? {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/ListenAction',
        userInteractionCount: t.playCount
      } : undefined,
      url: `https://yam-dj-frontend.vercel.app/track/${t.slug || t.id}`
    });
  }

  /** Donnees structurees du site (page d'accueil). */
  webSite(): void {
    this.jsonLd('WebSite', {
      name: 'YAM DJ',
      url: 'https://yam-dj-frontend.vercel.app/',
      description: 'La musique africaine qui vibre : streaming, charts et studio DJ pour l\'Afrique de l\'Ouest.',
      potentialAction: {
        '@type': 'SearchAction',
        target: 'https://yam-dj-frontend.vercel.app/search?q={search_term_string}',
        'query-input': 'required name=search_term_string'
      }
    });
  }

  /** Donnees structurees d'une liste de lecture (chart, playlist). */
  itemList(name: string, items: string[]): void {
    this.jsonLd('ItemList', {
      name,
      itemListElement: items.slice(0, 20).map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n }))
    });
  }
}
