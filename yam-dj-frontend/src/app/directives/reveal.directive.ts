import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Apparition progressive (consigne Design Motion V2) : rare et qualitative.
 * Ajoute .yam-reveal (opacity 0 + translate 16px) puis .yam-revealed quand
 * l'element entre dans le viewport (IntersectionObserver, deconnecte apres
 * revelation). Respecte prefers-reduced-motion (revelation immediate).
 *
 * Usage : <section yamReveal>...</section>
 */
@Directive({
  selector: '[yamReveal]',
  standalone: true
})
export class RevealDirective implements OnInit, OnDestroy {

  private el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const node = this.el.nativeElement as HTMLElement;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced || typeof IntersectionObserver === 'undefined') return; // etat final direct

    node.classList.add('yam-reveal');
    this.observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          node.classList.add('yam-revealed');
          this.observer?.disconnect();
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    this.observer.observe(node);

    // Filet de securite : si l'observer ne declenche pas (contexte atypique,
    // capture d'ecran, lecteur d'ecran sans rendu...), tout est revele a 5 s.
    window.setTimeout(() => node.classList.add('yam-revealed'), 5000);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
