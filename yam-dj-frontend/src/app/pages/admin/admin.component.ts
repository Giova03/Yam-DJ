import { Component, inject, signal, OnInit } from '@angular/core';
import { ContentService } from '../../services/content.service';
import { Track } from '../../models/models';

/** Moderation admin : validation des pistes avant publication. */
@Component({
  selector: 'yam-admin',
  standalone: true,
  template: `
    <div class="max-w-5xl mx-auto px-4 pt-6">
      <h1 class="yam-title mb-2">🛡️ Moderation YAM DJ</h1>
      <p class="text-white/50 text-sm mb-8">{{ pending() }} piste(s) en attente de validation.</p>

      @if (tracks().length) {
        <div class="space-y-3">
          @for (track of tracks(); track track) {
            <div class="yam-card p-5 flex items-center gap-4">
              <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xl shrink-0">🎵</div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold truncate">{{ track.title }}</p>
                <p class="text-white/40 text-sm">{{ track.genre }} · {{ track.country }} ·
                  {{ track.durationSec ? Math.floor(track.durationSec / 60) + ':' + (track.durationSec % 60).toString().padStart(2, '0') : '—' }}
                </p>
              </div>
              <div class="flex gap-2 shrink-0">
                <button (click)="approve(track)" class="yam-btn-primary !px-4 !py-2 text-sm bg-yam-green hover:bg-green-600">✔ Valider</button>
                <button (click)="reject(track)" class="yam-btn-secondary !px-4 !py-2 text-sm !bg-red-500/20 hover:!bg-red-500/30">✖ Rejeter</button>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="yam-card p-16 text-center">
          <div class="text-5xl mb-3">✨</div>
          <p class="text-white/50">File de moderation vide. Tout est propre !</p>
        </div>
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  private contentService = inject(ContentService);

  tracks = signal<Track[]>([]);
  pending = signal<number>(0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.contentService.pendingTracks().subscribe({
      next: res => {
        this.tracks.set(res.tracks || []);
        this.pending.set(res.tracks?.length || 0);
      },
      error: () => {}
    });
  }

  approve(track: Track): void {
    this.contentService.approveTrack(track.id).subscribe(() => this.load());
  }

  reject(track: Track): void {
    this.contentService.rejectTrack(track.id).subscribe(() => this.load());
  }

  Math = Math;
}
