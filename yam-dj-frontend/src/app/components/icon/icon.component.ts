import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * YAM ICON — jeu d'icones SVG inline pour toute la plateforme.
 *
 * Design : traits (stroke) modernes — epaisseur 1.8, linecap/linejoin arrondis,
 * viewBox 24x24, couleur heritee via currentColor. Zéro emoji, zéro fonte
 * externe : un langage visuel unique, chaleureux et professionnel.
 *
 * Usage : <yam-icon name="play" [size]="20" />
 * Le "G" Google est l'exception (multicolore, en rempli).
 */
@Component({
  selector: 'yam-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" [attr.width]="size" [attr.height]="size"
         viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name) {

        <!-- ===== TRANSPORT / LECTURE ===== -->
        @case ('play') { <path d="M6.5 4.5v15l13-7.5-13-7.5z"/> }
        @case ('pause') {
          <line x1="9" y1="5" x2="9" y2="19" stroke-width="2.4"/>
          <line x1="15" y1="5" x2="15" y2="19" stroke-width="2.4"/>
        }
        @case ('skip-next') {
          <path d="M5 5v14l9.5-7L5 5z"/>
          <line x1="18.5" y1="5" x2="18.5" y2="19" stroke-width="2.2"/>
        }
        @case ('skip-previous') {
          <path d="M19 5v14l-9.5-7L19 5z"/>
          <line x1="5.5" y1="5" x2="5.5" y2="19" stroke-width="2.2"/>
        }
        @case ('repeat') {
          <path d="m17 2 4 4-4 4"/>
          <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
          <path d="m7 22-4-4 4-4"/>
          <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
        }
        @case ('shuffle') {
          <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/>
          <path d="m18 2 4 4-4 4"/>
          <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/>
          <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/>
          <path d="m18 14 4 4-4 4"/>
        }
        @case ('volume') {
          <path d="M11 5 6 9H3v6h3l5 4V5z"/>
          <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
          <path d="M18.6 5.4a9 9 0 0 1 0 13.2"/>
        }

        <!-- ===== NAVIGATION ===== -->
        @case ('search') { <circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/> }
        @case ('home') {
          <path d="m3 10.5 9-7.5 9 7.5"/>
          <path d="M5 9.2V20a1 1 0 0 0 1 1h3.5v-6h5v6H18a1 1 0 0 0 1-1V9.2"/>
        }
        @case ('chevron-right') { <path d="m9 18 6-6-6-6"/> }
        @case ('chevron-up') { <path d="m18 15-6-6-6 6"/> }
        @case ('chevron-down') { <path d="m6 9 6 6 6-6"/> }
        @case ('arrow-right') { <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/> }
        @case ('external-link') {
          <path d="M15 3h6v6"/>
          <path d="M10 14 21 3"/>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        }
        @case ('menu') {
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="18" x2="20" y2="18"/>
        }
        @case ('x') { <path d="M18 6 6 18"/><path d="m6 6 12 12"/> }
        @case ('check') { <path d="M20 6 9 17l-5-5"/> }
        @case ('plus') { <path d="M5 12h14"/><path d="M12 5v14"/> }

        <!-- ===== MUSIQUE / PLATEFORME ===== -->
        @case ('headphones') {
          <path d="M4.2 14v-1.5a7.8 7.8 0 0 1 15.6 0V14"/>
          <rect x="2" y="13.8" width="4.8" height="7.2" rx="2.4"/>
          <rect x="17.2" y="13.8" width="4.8" height="7.2" rx="2.4"/>
        }
        @case ('disc') {
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="2.7"/>
          <path d="M6.5 12A5.5 5.5 0 0 1 12 6.5"/>
        }
        @case ('discoball') {
          <path d="M12 2v3.5"/>
          <circle cx="12" cy="12.5" r="7"/>
          <path d="M5 12.5h14"/>
          <path d="M12 5.5v14"/>
          <path d="M7.3 8.5c-1.1 1.1-1.8 2.5-1.8 4s.7 2.9 1.8 4"/>
          <path d="M16.7 8.5c1.1 1.1 1.8 2.5 1.8 4s-.7 2.9-1.8 4"/>
        }
        @case ('music-note') {
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        }
        @case ('music-4') {
          <path d="M9 19V6.7a1 1 0 0 1 .76-.97l9.5-2.36a1 1 0 0 1 1.24.97v10.2"/>
          <circle cx="6.5" cy="19" r="2.5"/>
          <circle cx="17.5" cy="14.5" r="2.5"/>
        }
        @case ('list-music') {
          <path d="M21 15V6"/>
          <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
          <path d="M12 12H3"/>
          <path d="M16 6H3"/>
          <path d="M12 18H3"/>
        }
        @case ('mic') {
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <path d="M12 19v3"/>
        }
        @case ('radio') {
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
          <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
          <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>
        }
        @case ('sliders') {
          <line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/>
          <line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/>
          <line x1="14" y1="2" x2="14" y2="6"/>
          <line x1="8" y1="10" x2="8" y2="14"/>
          <line x1="16" y1="18" x2="16" y2="22"/>
        }
        @case ('bar-chart') {
          <line x1="6" y1="20" x2="6" y2="14"/>
          <line x1="12" y1="20" x2="12" y2="8"/>
          <line x1="18" y1="20" x2="18" y2="4"/>
        }
        @case ('activity') { <path d="M22 12h-4l-3 9L9 3l-3 9H2"/> }
        @case ('flame') {
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        }
        @case ('sparkles') {
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.8 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.8a2 2 0 0 1 1.29-1.29L21 12l-5.8-1.9a2 2 0 0 1-1.29-1.29Z"/>
          <path d="M5 3v4"/><path d="M3 5h4"/>
          <path d="M19 17v4"/><path d="M17 19h4"/>
        }
        @case ('heart') {
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        }
        @case ('star') {
          <path d="m12 2.8 2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.7l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/>
        }
        @case ('trophy') {
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
          <path d="M4 22h16"/>
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
        }
        @case ('gift') {
          <rect x="3" y="8" width="18" height="4" rx="1"/>
          <path d="M12 8v13"/>
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>
        }

        <!-- ===== ACTIONS / OBJETS ===== -->
        @case ('upload') {
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <path d="m7 8 5-5 5 5"/>
          <path d="M12 3v12"/>
        }
        @case ('download') {
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <path d="m7 10 5 5 5-5"/>
          <path d="M12 15V3"/>
        }
        @case ('folder') {
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
        }
        @case ('share') {
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <path d="m8.6 13.5 6.8 4"/>
          <path d="m15.4 6.5-6.8 4"/>
        }
        @case ('message-circle') { <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/> }
        @case ('bell') {
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        }
        @case ('megaphone') {
          <path d="m3 11 18-5v12L3 14v-3z"/>
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
        }
        @case ('wallet') {
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
        }
        @case ('banknote') {
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <circle cx="12" cy="12" r="2.5"/>
          <path d="M6 12h.01"/><path d="M18 12h.01"/>
        }
        @case ('smartphone') { <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/> }
        @case ('newspaper') {
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Z"/>
          <path d="M18 14h-8"/>
          <path d="M15 18h-5"/>
          <path d="M10 6h8v4h-8Z"/>
        }
        @case ('book-open') {
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        }
        @case ('calendar') {
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        }
        @case ('map-pin') {
          <path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        }
        @case ('globe') {
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path d="M2 12h20"/>
        }
        @case ('mail') {
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        }
        @case ('history') {
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M12 7v5l4 2"/>
        }

        <!-- ===== COMPTE / SYSTEME ===== -->
        @case ('user') {
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        }
        @case ('users') {
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        }
        @case ('settings') {
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        }
        @case ('log-out') {
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <path d="m16 17 5-5-5-5"/>
          <path d="M21 12H9"/>
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2"/><path d="M12 20v2"/>
          <path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
          <path d="M2 12h2"/><path d="M20 12h2"/>
          <path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
        }
        @case ('moon') { <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/> }
        @case ('wifi-off') {
          <path d="M12 20h.01"/>
          <path d="M5 12.86a10.94 10.94 0 0 1 5.17-2.69"/>
          <path d="M19 12.86a10.94 10.94 0 0 1-2.01-1.52"/>
          <path d="M2 8.82a15 15 0 0 1 4.18-2.64"/>
          <path d="M22 8.82a15 15 0 0 0-11.29-3.76"/>
          <path d="m2 2 20 20"/>
        }
        @case ('cloud-rain') {
          <path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/>
          <path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>
        }
        @case ('waves') {
          <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
          <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
          <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
        }
        @case ('wind') {
          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
          <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
          <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
        }
        @case ('alert-circle') {
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        }
        @case ('loader') { <path d="M21 12a9 9 0 1 1-6.22-8.56"/> }

        <!-- ===== GOOGLE (multicolore, exception en rempli) ===== -->
        @case ('google') {
          <g transform="scale(0.5)" stroke="none">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </g>
        }
      }
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      vertical-align: middle;
      flex-shrink: 0;
    }
  `]
})
export class IconComponent {
  /** Nom de l'icone (voir le @switch ci-dessus). */
  @Input() name: string = '';
  /** Taille rendue en pixels (vectoriel : toujours net). */
  @Input() size: number = 20;
}
