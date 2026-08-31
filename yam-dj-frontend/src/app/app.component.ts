import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';

@Component({
  selector: 'yam-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, AudioPlayerComponent],
  template: `
    <div class="min-h-screen bg-yam-dark">
      <yam-navbar />
      <main class="pb-40">
        <router-outlet />
      </main>
      <yam-audio-player />
    </div>
  `
})
export class AppComponent {}
