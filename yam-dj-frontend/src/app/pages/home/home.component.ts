import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../../services/seo.service';
import { TrackService } from '../../services/track.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { ContentService } from '../../services/content.service';
import { DjService } from '../../services/dj.service';
import { YoutubeService } from '../../services/youtube.service';
import { AnalyticsService } from '../../services/analytics.service';
import { ChartsService } from '../../services/charts.service';
import { TrackCardComponent } from '../../components/track-card/track-card.component';
import { FeaturedTrackComponent } from '../../components/track-variants/featured-track.component';
import { TrackRowComponent } from '../../components/track-variants/track-row.component';
import { ChartTrackComponent } from '../../components/track-variants/chart-track.component';
import { TipModalComponent } from '../../components/tip-modal/tip-modal.component';
import { IconComponent } from '../../components/icon/icon.component';
import { RevealDirective } from '../../directives/reveal.directive';
import { environment } from '../../../environments/environment';
import { Track, Mixtape, ChartEntry, ArtistPublic } from '../../models/models';

interface GenreRow { genre: string; count: number; }

/** Artiste + etat de suivi local (home). */
type ArtistCard = ArtistPublic & { _following?: 'on' | 'pending' };

/**
 * HOME V2 — AFROPULSE NIGHT (§05 : narration, pas de succession de grilles).
 * 1 HERO (couverture de media) · 2 À L'ÉCOUTE · 3 DÉCOUVRE TON PROCHAIN SON
 * 4 YAM CHARTS (filtres pays) · 5 ÉCONOMIE DATA · 6 À DÉCOUVRIR (artistes)
 * 7 YAM RADIO · 8 YAM DJ STUDIO · 9 LA SCÈNE (éditorial + mixtapes).
 */
@Component({
  selector: 'yam-home',
  standalone: true,
  imports: [
    RouterLink, IconComponent, RevealDirective,
    TrackCardComponent, FeaturedTrackComponent, TrackRowComponent, ChartTrackComponent, TipModalComponent
  ],
  template: `
    <div class="max-w-editorial mx-auto px-4 pt-6">

      <!-- ============ 1 · HERO — couverture de media musical ============ -->
      <section class="relative rounded-[2rem] overflow-hidden border border-white/8 bg-yam-surface yam-grain"
               aria-labelledby="hero-title">
        <div class="yam-glow w-[46rem] h-[46rem] -top-64 -right-40 opacity-70"></div>
        <div class="yam-glow w-[24rem] h-[24rem] -bottom-24 -left-16 opacity-30" style="background: radial-gradient(closest-side, rgba(124,92,255,.20), transparent 72%);"></div>

        <div class="relative grid md:grid-cols-[1.05fr_.95fr] gap-8 md:gap-6 p-7 sm:p-10 md:p-12 items-center">
          <div>
            <p class="yam-kicker mb-4">Le media musical de l'Afrique de l'Ouest</p>
            <h1 id="hero-title" class="yam-display text-4xl sm:text-5xl lg:text-6xl mb-5">
              LES SONS QUI FONT<br>
              <span class="yam-gradient-text">BOUGER L'AFRIQUE.</span>
            </h1>
            <p class="text-white/60 text-base sm:text-lg max-w-lg mb-6 leading-relaxed">
              Charts, radios, mixtapes, studio DJ — tout l'univers musical de Ouaga a Lagos,
              dans une seule nuit bien joueuse.
            </p>

            @if (heroTrend(); as t) {
              <a [routerLink]="['/track', t.slug || t.id]" class="inline-flex items-center gap-2.5 mb-7 group">
                <span class="flex items-end gap-0.5 h-4" aria-hidden="true">
                  <span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>
                </span>
                <span class="text-sm text-white/60 group-hover:text-yam-orange transition">
                  Tendance de la semaine — <b class="text-white">{{ t.title }}</b> · {{ t.artistName }}
                </span>
              </a>
            }

            <div class="flex flex-wrap gap-3">
              <button (click)="playFeed()" class="yam-btn-primary !px-8 !py-3.5 text-base inline-flex items-center gap-2.5">
                <yam-icon name="play" [size]="19" class="fill-current"/> Écouter
              </button>
              <a routerLink="/charts" class="yam-btn-secondary !px-8 !py-3.5 text-base inline-flex items-center gap-2.5">
                <yam-icon name="bar-chart" [size]="18"/> Explorer les charts
              </a>
            </div>

            <div class="flex gap-7 mt-9 yam-num text-sm">
              <div><p class="text-yam-orange text-xl font-bold">{{ genres().length || 11 }}</p><p class="text-white/40 text-xs mt-0.5">genres</p></div>
              <div class="border-l border-white/10 pl-7"><p class="text-yam-orange text-xl font-bold">{{ countries().length || 6 }}</p><p class="text-white/40 text-xs mt-0.5">pays</p></div>
              <div class="border-l border-white/10 pl-7"><p class="text-yam-orange text-xl font-bold">{{ latest().length || '—' }}</p><p class="text-white/40 text-xs mt-0.5">nouveautés</p></div>
            </div>
          </div>

          <!-- Pile de pochettes : le premier ecran est memorisable -->
          <div class="relative hidden md:block" aria-hidden="true">
            <div class="relative w-full max-w-[400px] mx-auto aspect-square">
              @if (heroCovers()[1]; as c2) {
                <div class="absolute top-6 -left-6 w-56 aspect-square rounded-3xl overflow-hidden rotate-[-8deg] border border-white/10 opacity-60 shadow-2xl">
                  @if (c2.coverUrl) { <img [src]="c2.coverUrl" alt="" class="w-full h-full object-cover"> }
                </div>
              }
              @if (heroCovers()[2]; as c3) {
                <div class="absolute bottom-4 -right-7 w-44 aspect-square rounded-3xl overflow-hidden rotate-[7deg] border border-white/10 opacity-50 shadow-2xl">
                  @if (c3.coverUrl) { <img [src]="c3.coverUrl" alt="" class="w-full h-full object-cover"> }
                </div>
              }
              <button (click)="playHero()" class="relative z-10 w-[78%] mx-auto block rounded-[1.75rem] overflow-hidden border border-white/15 shadow-2xl group aspect-square bg-gradient-to-br from-yam-orange/30 to-yam-gold/20">
                @if (heroCovers()[0]?.coverUrl; as cover) {
                  <img [src]="cover" alt="" class="w-full h-full object-cover group-hover:scale-[1.03] transition duration-700">
                } @else {
                  <span class="w-full h-full flex items-center justify-center text-yam-orange"><yam-icon name="disc" [size]="64"/></span>
                }
                <span class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></span>
                <span class="absolute top-4 left-4 yam-badge !bg-yam-orange/95 !text-yam-ink font-bold">TENDANCE #1</span>
                <span class="absolute inset-0 flex items-center justify-center">
                  <span class="w-16 h-16 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center shadow-2xl
                               opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300">
                    <yam-icon name="play" [size]="26" class="fill-current translate-x-[2px]"/>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 2 · À L'ÉCOUTE — la musique apparait vite ============ -->
      <section class="mt-10" aria-label="En ecoute">
        <div class="flex items-end justify-between mb-4">
          <div>
            <p class="yam-kicker mb-1.5">Maintenant</p>
            <h2 class="yam-display text-2xl md:text-3xl">À l'écoute</h2>
          </div>
        </div>

        @if (player.currentTrack(); as current) {
          <div class="yam-card !rounded-3xl p-4 sm:p-5 flex items-center gap-4 flex-wrap sm:flex-nowrap border-yam-orange/25">
            <button (click)="player.toggle()" class="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/40 to-yam-gold/30 group" aria-label="Play / pause">
              @if (current.coverUrl) {
                <img [src]="current.coverUrl" [alt]="current.title" class="w-full h-full object-cover">
              } @else {
                <span class="w-full h-full flex items-center justify-center text-yam-orange"><yam-icon name="music-note" [size]="26"/></span>
              }
              <span class="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                @if (player.loading()) { <yam-icon name="loader" [size]="22" class="animate-spin"/> }
                @else if (player.isPlaying()) { <yam-icon name="pause" [size]="22"/> }
                @else { <yam-icon name="play" [size]="22" class="fill-current"/> }
              </span>
            </button>

            <div class="min-w-0 flex-1">
              <p class="font-semibold truncate">{{ current.title }}</p>
              <p class="text-white/50 text-sm truncate">{{ current.sourceArtist || current.artistName }}</p>
              <div class="yam-progress-thin mt-2.5 max-w-md" role="progressbar" [attr.aria-valuenow]="player.position()">
                <span [style.width.%]="progressPct()"></span>
              </div>
            </div>

            <div class="yam-viz mx-1 hidden sm:flex" [class.paused]="!player.isPlaying()" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span><span></span>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="yam-num text-xs text-white/40 hidden sm:inline">{{ player.formatTime(player.position()) }} / {{ player.formatTime(player.duration() || current.durationSec) }}</span>
              <button (click)="player.next()" class="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition" aria-label="Piste suivante">
                <yam-icon name="skip-next" [size]="17"/>
              </button>
              <button (click)="player.fullOpen.set(true)" class="yam-btn-secondary !px-4 !py-2 text-sm inline-flex items-center gap-1.5">
                <yam-icon name="chevron-up" [size]="14"/> Plein écran
              </button>
            </div>
          </div>
        } @else {
          @if (trending()[0]; as t) {
          <div class="yam-card !rounded-3xl p-4 sm:p-5 flex items-center gap-4 flex-wrap">
            <button (click)="onPlay(t)" class="w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-yam-orange/40 to-yam-gold/30 flex items-center justify-center" aria-label="Lire le son du moment">
              @if (t.coverUrl) { <img [src]="t.coverUrl" [alt]="t.title" class="w-full h-full object-cover"> }
              @else { <yam-icon name="music-note" [size]="24" class="text-yam-orange"/> }
            </button>
            <div class="min-w-0 flex-1">
              <p class="yam-kicker mb-1">Le son du moment</p>
              <p class="font-semibold truncate">{{ t.title }} <span class="text-white/40 font-normal">· {{ t.sourceArtist || t.artistName }}</span></p>
            </div>
            <button (click)="onPlay(t)" class="yam-btn-primary !px-6 !py-2.5 inline-flex items-center gap-2">
              <yam-icon name="play" [size]="17" class="fill-current"/> C'est parti
            </button>
          </div>
          }
        }
      </section>

      <!-- ============ 3 · DÉCOUVRE TON PROCHAIN SON — asymétrique ============ -->
      <section class="mt-14" id="decouverte" yamReveal>
        <div class="flex items-end justify-between mb-5">
          <div>
            <p class="yam-kicker mb-1.5">Découverte</p>
            <h2 class="yam-display text-2xl md:text-3xl">Découvre ton prochain son</h2>
          </div>
          <a routerLink="/search" class="text-sm text-white/50 hover:text-yam-orange transition hidden sm:inline-flex items-center gap-1.5 font-semibold">
            Tout explorer <yam-icon name="arrow-right" [size]="14"/>
          </a>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          @if (forYou()[0]; as featured) {
            <yam-featured-track [track]="featured" (play)="onPlay($event)" (tip)="openTip($event)"/>
          } @else {
            <div class="yam-card aspect-[4/5] max-h-[520px] animate-pulse"></div>
          }
          <div class="yam-card !rounded-3xl p-4 sm:p-5">
            @for (t of discoveryRows(); track t.id) {
              <yam-track-row [track]="t" (play)="onPlay($event)" (tip)="openTip($event)"/>
            } @empty {
              @for (i of [1,2,3,4,5]; track i) {
                <div class="flex items-center gap-3 p-2 -mx-2">
                  <div class="w-12 h-12 rounded-xl bg-white/5 animate-pulse"></div>
                  <div class="flex-1 space-y-2"><div class="h-3.5 bg-white/5 rounded animate-pulse"></div><div class="h-3 w-2/3 bg-white/5 rounded animate-pulse"></div></div>
                </div>
              }
            }
            <a routerLink="/search" class="mt-3 pt-3 border-t border-white/8 flex items-center justify-center gap-1.5 text-sm text-white/50 hover:text-yam-orange transition font-semibold sm:hidden">
              Tout explorer <yam-icon name="arrow-right" [size]="14"/>
            </a>
          </div>
        </div>
      </section>

      <!-- ============ 4 · YAM CHARTS — pilier visuel ============ -->
      <section class="mt-14" id="charts" yamReveal>
        <div class="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <p class="yam-kicker mb-1.5">Classement hebdomadaire</p>
            <h2 class="yam-display text-2xl md:text-3xl">YAM CHARTS</h2>
          </div>
          <a routerLink="/charts" class="text-sm text-white/50 hover:text-yam-orange transition inline-flex items-center gap-1.5 font-semibold">
            Tout le classement <yam-icon name="arrow-right" [size]="14"/>
          </a>
        </div>

        <!-- Filtres pays -->
        <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-5" role="tablist" aria-label="Filtrer le chart par pays">
          <button (click)="setChartCountry(null)" role="tab" [attr.aria-selected]="chartCountry() === null"
                  class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition"
                  [class]="chartCountry() === null ? 'bg-yam-orange text-yam-ink border-yam-orange' : 'text-white/60 border-white/15 hover:text-white hover:border-white/30'">
            Afrique
          </button>
          @for (c of countries(); track c) {
            <button (click)="setChartCountry(c)" role="tab" [attr.aria-selected]="chartCountry() === c"
                    class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition"
                    [class]="chartCountry() === c ? 'bg-yam-orange text-yam-ink border-yam-orange' : 'text-white/60 border-white/15 hover:text-white hover:border-white/30'">
              {{ c }}
            </button>
          }
        </div>

        @if (chartEntries()[0]; as top) {
          <!-- LE #1 : traite differemment -->
          <div class="yam-card !rounded-3xl !border-yam-orange/25 p-5 sm:p-7 mb-3 grid grid-cols-1 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)] gap-6 items-center cursor-pointer group"
               (click)="playChart(top)">
            <div class="relative w-full aspect-square rounded-2xl overflow-hidden max-w-[190px] shadow-xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/20">
              @if (top.track?.coverUrl) {
                <img [src]="top.track?.coverUrl" [alt]="top.track?.title" class="w-full h-full object-cover group-hover:scale-[1.04] transition duration-700">
              } @else {
                <span class="w-full h-full flex items-center justify-center text-yam-orange"><yam-icon name="trophy" [size]="52"/></span>
              }
              <span class="absolute bottom-3 right-3 w-14 h-14 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center shadow-2xl">
                <yam-icon name="play" [size]="22" class="fill-current translate-x-[1px]"/>
              </span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-3 flex-wrap mb-2">
                <span class="yam-display text-6xl text-yam-orange leading-none">{{ top.rank }}</span>
                <div class="flex flex-col gap-1">
                  <span class="yam-kicker !text-[10px]">Numéro 1 de la semaine</span>
                  @if (top.movement != null && top.movement > 0) {
                    <span class="text-yam-green text-sm font-bold yam-num flex items-center gap-1"><yam-icon name="trending-up" [size]="14"/>{{ top.movement }}</span>
                  } @else if (top.movement != null && top.movement < 0) {
                    <span class="text-red-400/90 text-sm font-bold yam-num flex items-center gap-1"><yam-icon name="trending-down" [size]="14"/>{{ -top.movement }}</span>
                  } @else if (top.movement == null) {
                    <span class="yam-kicker !text-[10px] !text-yam-gold">ENTRÉE</span>
                  } @else {
                    <span class="text-white/40 text-sm">— stable</span>
                  }
                </div>
              </div>
              <h3 class="font-display font-bold text-2xl leading-tight truncate group-hover:text-yam-orange transition">{{ top.track?.title }}</h3>
              <p class="text-white/55 mt-1">{{ top.track?.sourceArtist || top.track?.artistName }}@if (top.track?.genre) { · {{ top.track?.genre }} }</p>
              <p class="yam-num text-yam-orange text-lg mt-3">{{ formatPlays(top.plays) }} <span class="text-white/40 text-xs">écoutes cette semaine</span></p>
            </div>
          </div>
        }

        <!-- Positions suivantes : compactes -->
        <div class="yam-card !rounded-3xl p-3 sm:p-5">
          @for (e of chartRest(); track e.trackId) {
            <yam-chart-track [entry]="e" (play)="playChartTrack($event)"/>
          } @empty {
            @if (!chartEntries().length) {
              @for (i of [1,2,3,4,5,6]; track i) {
                <div class="flex items-center gap-4 p-2.5">
                  <div class="w-12 h-8 bg-white/5 rounded animate-pulse"></div>
                  <div class="w-14 h-14 rounded-xl bg-white/5 animate-pulse"></div>
                  <div class="flex-1 space-y-2"><div class="h-3.5 bg-white/5 rounded animate-pulse w-2/3"></div><div class="h-3 w-1/3 bg-white/5 rounded animate-pulse"></div></div>
                </div>
              }
            }
          }
        </div>
      </section>

      <!-- ============ 5 · ÉCONOMIE DATA — proposition de valeur visible ============ -->
      <section class="mt-8" yamReveal aria-label="Economie de data">
        <div class="rounded-2xl border border-yam-gold/25 bg-yam-gold/5 px-5 py-4 flex items-center gap-4 flex-wrap">
          <span class="w-11 h-11 rounded-2xl bg-yam-gold/15 text-yam-gold flex items-center justify-center shrink-0"><yam-icon name="smartphone" [size]="22"/></span>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-sm">ÉCONOMIE DATA</p>
            <p class="text-white/50 text-sm">48 kbps, lecture optimisée, téléchargements et hors ligne — pensé pour les forfaits modestes.</p>
          </div>
          <button (click)="player.toggleDataLite()" class="shrink-0 text-sm font-semibold px-4 py-2 rounded-full border transition"
                  [class]="player.dataLite() ? 'bg-yam-gold text-yam-ink border-yam-gold' : 'text-yam-gold border-yam-gold/40 hover:bg-yam-gold/10'">
            {{ player.dataLite() ? 'Actif · 48 kbps' : 'Activer' }}
          </button>
        </div>
      </section>

      <!-- ============ 6 · À DÉCOUVRIR — les artistes ============ -->
      <section class="mt-14" yamReveal>
        <div class="flex items-end justify-between mb-5">
          <div>
            <p class="yam-kicker mb-1.5">La scène</p>
            <h2 class="yam-display text-2xl md:text-3xl">À découvrir</h2>
          </div>
          <a routerLink="/artists" class="text-sm text-white/50 hover:text-yam-orange transition inline-flex items-center gap-1.5 font-semibold">
            Tous les artistes <yam-icon name="arrow-right" [size]="14"/>
          </a>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          @for (a of artists(); track a.userId) {
            <article class="yam-card overflow-hidden group">
              <a [routerLink]="['/artist', a.userId]" class="block relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-yam-violet/25 to-yam-orange/20">
                @if (a.photoUrl) {
                  <img [src]="a.photoUrl" [alt]="a.stageName" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-700">
                } @else {
                  <span class="w-full h-full flex items-center justify-center">
                    <span class="yam-display text-5xl text-yam-orange/80">{{ a.stageName.charAt(0).toUpperCase() }}</span>
                  </span>
                }
                <span class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent"></span>
                @if (a.country) {
                  <span class="absolute bottom-3 left-3 text-[11px] font-semibold text-white/90 flex items-center gap-1"><yam-icon name="map-pin" [size]="11"/>{{ a.country }}</span>
                }
              </a>
              <div class="p-3.5">
                <a [routerLink]="['/artist', a.userId]" class="font-semibold truncate block group-hover:text-yam-orange transition">{{ a.stageName }}</a>
                <div class="flex items-center justify-between mt-2">
                  <span class="yam-num text-xs text-white/40">{{ formatPlays(a.totalPlays) }} écoutes</span>
                  <button (click)="toggleFollow(a)" [disabled]="a._following === 'pending'"
                          class="text-xs font-semibold px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1"
                          [class]="a._following === 'on' ? 'text-yam-orange border-yam-orange/50 bg-yam-orange/10' : 'text-white/60 border-white/15 hover:text-yam-orange hover:border-yam-orange/40'">
                    <yam-icon [name]="a._following === 'on' ? 'check' : 'heart'" [size]="12"/>
                    {{ a._following === 'on' ? 'Suivi' : 'Suivre' }}
                  </button>
                </div>
              </div>
            </article>
          } @empty {
            @for (i of [1,2,3,4]; track i) {
              <div class="yam-card overflow-hidden"><div class="aspect-[4/5] bg-white/5 animate-pulse"></div><div class="p-3.5 space-y-2"><div class="h-4 bg-white/5 rounded animate-pulse w-2/3"></div></div></div>
            }
          }
        </div>
      </section>

      <!-- ============ 7 · YAM RADIO — un univers ============ -->
      <section class="mt-14" id="radio" yamReveal>
        <div class="flex items-end justify-between mb-2">
          <div>
            <p class="yam-kicker mb-1.5">Ambiances</p>
            <h2 class="yam-display text-2xl md:text-3xl">YAM RADIO</h2>
          </div>
        </div>
        <p class="text-white/50 mb-5">Choisis ton ambiance — YAM DJ enchaine les sons sans fin, sans coupure.</p>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          @for (r of radioTiles(); track r.label) {
            <button (click)="startRadio(r)" class="relative yam-card !rounded-2xl p-5 text-left overflow-hidden group h-full min-h-[110px] flex flex-col justify-between"
                    [class]="r.big ? '!border-yam-orange/40' : ''">
              <div class="absolute inset-0 opacity-[0.08] pointer-events-none"
                   [style.background]="'linear-gradient(135deg,' + (r.color || '#FF8A24') + ', transparent)'"></div>
              <div class="flex items-center justify-between relative">
                <span class="text-white/35"><yam-icon [name]="r.icon" [size]="20"/></span>
                <span class="w-9 h-9 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                  <yam-icon name="play" [size]="15" class="fill-current"/>
                </span>
              </div>
              <div class="relative">
                <p class="font-display font-bold {{ r.big ? 'text-xl' : 'text-base' }} group-hover:text-yam-orange transition">{{ r.label }}</p>
                <p class="text-white/40 text-xs mt-0.5">{{ r.hint }}</p>
              </div>
            </button>
          }
        </div>

        @if (player.radioMode(); as radio) {
          <div class="yam-card p-3 mt-4 border-yam-orange/40 bg-yam-orange/5 flex items-center justify-between gap-3">
            <p class="text-sm text-yam-orange font-semibold flex items-center gap-1.5 min-w-0">
              <yam-icon name="radio" [size]="14" class="shrink-0"/>
              <span class="truncate">Radio en cours : {{ radio.genre || radio.country || 'Decouverte' }}</span>
            </p>
            <button (click)="player.stopRadio()" class="text-xs text-white/50 hover:text-white underline shrink-0">Stop</button>
          </div>
        }
      </section>

      <!-- ============ 8 · YAM DJ STUDIO — univers technique ============ -->
      <section class="mt-14" yamReveal>
        <div class="relative rounded-[2rem] overflow-hidden border border-yam-violet/25 bg-[#0B0B13] p-7 sm:p-10">
          <div class="yam-glow w-[26rem] h-[26rem] -bottom-32 -right-16 opacity-40" style="background: radial-gradient(closest-side, rgba(124,92,255,.22), transparent 72%);"></div>

          <!-- waveform decorative -->
          <div class="flex items-end gap-[3px] h-12 mb-6 opacity-70" aria-hidden="true">
            @for (h of waveform(); track $index) {
              <span class="w-[4px] rounded-sm bg-yam-violet/60" [style.height.%]="h" style="min-height:8%"></span>
            }
          </div>

          <p class="yam-kicker !text-yam-violet mb-2">Pour les DJs</p>
          <h2 class="yam-display text-3xl md:text-4xl mb-4">YAM DJ STUDIO</h2>
          <p class="text-white/55 max-w-xl mb-6 leading-relaxed">
            Deux decks, détection BPM automatique, effets echo/reverb/flanger, equalizer,
            synchronisation et enregistrement de mix — le vrai studio des DJs, dans le navigateur.
          </p>

          <div class="flex flex-wrap gap-2 mb-7">
            @for (chip of ['BPM', 'EQ', 'CUE', 'MIX', 'FX', 'RECORD']; track chip) {
              <span class="yam-badge !text-yam-violet border !border-yam-violet/30 yam-num">{{ chip }}</span>
            }
          </div>

          <div class="flex flex-wrap gap-3">
            <a routerLink="/dj-studio" class="yam-btn-primary !px-7 !py-3 inline-flex items-center gap-2"
               style="background-color: #7C5CFF; color: #fff;">
              <yam-icon name="sliders" [size]="17"/> Ouvrir le Studio
            </a>
            @if (auth.role() === 'ARTIST' || auth.role() === 'ADMIN') {
              <a routerLink="/upload" (click)="artistCta()" class="yam-btn-secondary !px-7 !py-3 inline-flex items-center gap-2">
                <yam-icon name="mic" [size]="16"/> Publier ma musique
              </a>
            } @else {
              <a routerLink="/register" [queryParams]="{ role: 'ARTIST' }" (click)="artistCta()" class="yam-btn-secondary !px-7 !py-3 inline-flex items-center gap-2">
                <yam-icon name="mic" [size]="16"/> Devenir artiste
              </a>
            }
          </div>
        </div>
      </section>

      <!-- ============ 9 · LA SCÈNE — contenu éditorial ============ -->
      <section class="mt-14 mb-6" id="scene" yamReveal>
        <div class="flex items-end justify-between mb-5">
          <div>
            <p class="yam-kicker mb-1.5">Éditorial</p>
            <h2 class="yam-display text-2xl md:text-3xl">LA SCÈNE</h2>
          </div>
          <a routerLink="/youtube" class="yam-badge text-red-400 border border-red-500/40 hover:bg-red-500/10 transition shrink-0 hidden sm:inline-flex">
            <yam-icon name="play" [size]="11" class="fill-current"/> Importer depuis YouTube
          </a>
        </div>

        @if (latest().length) {
          <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 items-start">
            @if (latest()[0]; as main) {
              <article class="yam-card !rounded-3xl overflow-hidden group cursor-pointer" (click)="onPlayLatest(main)">
                <div class="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-yam-card to-yam-surface">
                  @if (main.coverUrl) {
                    <img [src]="main.coverUrl" [alt]="main.title" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-[1.03] transition duration-700">
                  } @else {
                    <span class="w-full h-full flex items-center justify-center text-white/15"><yam-icon name="newspaper" [size]="56"/></span>
                  }
                  <span class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></span>
                  <span class="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                    <span class="yam-kicker block mb-2">Nouveauté</span>
                    <h3 class="font-display font-bold text-xl sm:text-2xl leading-tight text-white group-hover:text-yam-orange transition">{{ main.title }}</h3>
                    <span class="text-white/60 text-sm mt-1.5 flex items-center gap-2 flex-wrap">
                      {{ main.sourceArtist || main.artistName }}
                      @if (main.createdAt) { <span class="text-white/35">· {{ formatDate(main.createdAt) }}</span> }
                      <span class="w-9 h-9 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center ml-1">
                        <yam-icon name="play" [size]="15" class="fill-current translate-x-[1px]"/>
                      </span>
                    </span>
                  </span>
                </div>
              </article>
            }
            <div class="yam-card !rounded-3xl p-4 sm:p-5">
              <p class="yam-kicker mb-3">Dernières sorties</p>
              @for (t of latest().slice(1, 6); track t.id) {
                <yam-track-row [track]="t" (play)="onPlayLatest($event)" (tip)="openTip($event)"/>
              }
            </div>
          </div>
        }

        <!-- Mixtapes de la communauté -->
        @if (mixtapes().length) {
          <div class="mt-10">
            <div class="flex items-end justify-between mb-4">
              <h3 class="yam-display text-xl">MIXTAPES DES DJs</h3>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              @for (mix of mixtapes(); track mix.id) {
                <div class="yam-card p-4 flex items-center gap-4">
                  <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-yam-orange/30 to-yam-gold/30 flex items-center justify-center text-yam-orange shrink-0">
                    <yam-icon name="disc" [size]="26"/>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold truncate text-sm">{{ mix.title }}</p>
                    <p class="text-white/50 text-xs truncate">par {{ mix.djName }} · {{ mix.playCount }} écoutes</p>
                    @if (mix.priceXof && mix.priceXof > 0) {
                      <p class="text-xs mt-0.5">
                        @if (mix.purchased) {
                          <span class="text-yam-green font-semibold">Achetée — tienne à vie</span>
                        } @else {
                          <span class="text-yam-gold font-semibold">{{ formatPrice(mix.priceXof) }} — 70 % au DJ</span>
                        }
                      </p>
                    }
                  </div>
                  @if (mix.priceXof && mix.priceXof > 0 && !mix.purchased) {
                    <button (click)="buyMixtape(mix)" [disabled]="buyingId() === mix.id"
                            class="yam-btn-primary !px-4 !py-2 text-sm shrink-0" title="Débloquer cette mixtape (paiement mobile money)">
                      {{ buyingId() === mix.id ? '...' : 'Acheter' }}
                    </button>
                  } @else {
                    <button (click)="playMixtape(mix)" class="w-10 h-10 rounded-full bg-yam-orange text-yam-ink flex items-center justify-center hover:scale-105 active:scale-95 transition shrink-0" aria-label="Lire la mixtape">
                      <yam-icon name="play" [size]="17" class="fill-current translate-x-[1px]"/>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }
      </section>
    </div>

    <yam-tip-modal [visible]="tipModalVisible()" [artistId]="tipArtist()?.artistId || ''"
                   [artistName]="tipArtist()?.artistName || ''" (close)="tipModalVisible.set(false)" />
  `
})
export class HomeComponent implements OnInit {
  auth = inject(AuthService);
  player = inject(PlayerService);
  private http = inject(HttpClient);
  private trackService = inject(TrackService);
  private charts = inject(ChartsService);
  private content = inject(ContentService);
  private seo = inject(SeoService);
  private djService = inject(DjService);
  private youtube = inject(YoutubeService);
  private analytics = inject(AnalyticsService);
  private title = inject(Title);
  private meta = inject(Meta);
  private router = inject(Router);

  forYou = signal<Track[]>([]);
  trending = signal<Track[]>([]);
  latest = signal<Track[]>([]);
  recent = signal<Track[]>([]);
  mixtapes = signal<Mixtape[]>([]);
  artists = signal<ArtistCard[]>([]);
  genres = signal<GenreRow[]>([]);
  countries = signal<string[]>([]);
  chartCountry = signal<string | null>(null);
  chartEntries = signal<ChartEntry[]>([]);
  tipModalVisible = signal(false);
  tipArtist = signal<Track | null>(null);
  buyingId = signal<string | null>(null);

  /** Entrees radio (villes + genres reels du catalogue). */
  radioTiles = signal<Array<{ label: string; icon: string; hint: string; genre?: string; country?: string; big?: boolean; color?: string }>>([
    { label: 'OUAGA', icon: 'map-pin', hint: 'Les sons du Faso', country: 'Burkina Faso', big: true, color: '#FF8A24' },
    { label: 'ABIDJAN', icon: 'map-pin', hint: 'Le groove ivoirien', country: 'Cote d\'Ivoire', big: true, color: '#F4C95D' },
    { label: 'DAKAR', icon: 'map-pin', hint: 'Le rythme du Senegal', country: 'Senegal', color: '#7C5CFF' },
    { label: 'LAGOS', icon: 'map-pin', hint: 'La capitale du son', country: 'Nigeria', color: '#FF8A24' }
  ]);

  /** Waveform decorative (studio). */
  readonly waveform = signal<number[]>([22, 44, 30, 68, 52, 88, 40, 74, 96, 58, 34, 80, 46, 62, 90, 38, 54, 76, 28, 66, 48, 84, 32, 70, 42, 58, 92, 36, 50, 78, 26, 64, 44, 86, 30, 72, 56, 40, 82, 34, 60, 24, 68, 48, 94, 38, 66, 52, 30]);

  /** Funnel artiste : clic sur le CTA 'Publier ma musique'. */
  artistCta(): void {
    this.analytics.track('artist_cta_click');
  }

  ngOnInit(): void {
    this.title.setTitle('YAM DJ — Les sons qui font bouger l\'Afrique | Streaming, charts et studio DJ');
    this.meta.updateTag({ name: 'description',
      content: 'Ecoute les sons d\'Afrique de l\'Ouest, suis les charts hebdomadaires, mixe dans le studio DJ et soutiens les artistes via mobile money.' });
    this.seo.webSite();

    this.analytics.track('landing_view', undefined, true);

    this.trackService.forYou(15).subscribe(t => this.forYou.set(t));
    this.trackService.trending(10).subscribe(t => this.trending.set(t));
    this.trackService.latest(10).subscribe(t => this.latest.set(t));
    this.djService.publicMixtapes(6).subscribe(m => this.mixtapes.set(m));
    this.content.topArtists(8).subscribe(a => this.artists.set(a));
    this.http.get<GenreRow[]>(`${environment.apiUrl}/api/genres`).subscribe(g => {
      this.genres.set(g || []);
      const genreTiles = (g || []).slice(0, 8).map(row => ({
        label: row.genre,
        icon: 'music-4',
        hint: row.count + ' piste' + (row.count > 1 ? 's' : ''),
        genre: row.genre
      }));
      this.radioTiles.update(list => [...list, ...genreTiles]);
    });
    this.charts.getChartCountries().subscribe(c => this.countries.set((c || []).slice(0, 6)));
    this.loadChart(null);

    if (this.auth.isLoggedIn()) {
      this.trackService.history(10).subscribe({
        next: list => this.recent.set((list || []).filter(t => t.status === 'APPROVED')),
        error: () => this.recent.set([])
      });
    }
  }

  // ===== HERO =====

  heroCovers(): Track[] {
    return this.trending().length ? this.trending() : this.forYou();
  }

  heroTrend(): Track | null {
    const c = this.heroCovers();
    return c.length ? c[0] : null;
  }

  playHero(): void {
    const c = this.heroCovers();
    if (c.length) this.player.play(c[0], c);
  }

  playFeed(): void {
    const feed = this.forYou();
    if (feed.length) this.player.play(feed[0], feed);
  }

  // ===== DECOUVERTE =====

  discoveryRows(): Track[] {
    return this.forYou().slice(1, 6);
  }

  // ===== CHARTS =====

  loadChart(country: string | null): void {
    this.charts.getCharts(country || undefined, 10).subscribe(e => this.chartEntries.set(e || []));
  }

  setChartCountry(c: string | null): void {
    this.chartCountry.set(c);
    this.loadChart(c);
  }

  chartRest(): ChartEntry[] {
    return this.chartEntries().slice(1);
  }

  playChart(entry: ChartEntry): void {
    if (entry.track) this.player.play(entry.track, this.chartEntries().filter(e => e.track).map(e => e.track!));
  }

  playChartTrack(track: Track): void {
    this.player.play(track, this.chartEntries().filter(e => e.track).map(e => e.track!));
  }

  // ===== ARTISTES =====

  toggleFollow(a: ArtistCard): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    const list = this.artists();
    const idx = list.findIndex(x => x.userId === a.userId);
    if (idx < 0) return;
    const current = list[idx];
    if (current._following === 'on') {
      this.content.unfollow(a.userId).subscribe({
        next: () => this.artists.update(l => l.map(x => x.userId === a.userId ? { ...x, _following: undefined } : x))
      });
    } else {
      this.artists.update(l => l.map(x => x.userId === a.userId ? { ...x, _following: 'pending' } : x));
      this.content.follow(a.userId).subscribe({
        next: () => this.artists.update(l => l.map(x => x.userId === a.userId ? { ...x, _following: 'on' } : x)),
        error: () => this.artists.update(l => l.map(x => x.userId === a.userId ? { ...x, _following: undefined } : x))
      });
    }
  }

  // ===== LECTURE =====

  startRadio(r: { genre?: string; country?: string }): void {
    this.player.startRadio(r.genre, r.country);
  }

  onPlay(track: Track): void {
    this.player.play(track, this.forYou());
  }

  onPlayLatest(track: Track): void {
    this.player.play(track, this.latest());
  }

  openTip(track: Track): void {
    this.tipArtist.set(track);
    this.tipModalVisible.set(true);
  }

  progressPct(): number {
    const dur = this.player.duration() || this.player.currentTrack()?.durationSec || 0;
    if (!dur) return 0;
    return Math.min(100, (this.player.position() / dur) * 100);
  }

  // ===== MIXTAPES =====

  playMixtape(mix: Mixtape): void {
    this.djService.mixtapeStreamUrl(mix.id).subscribe({
      next: res => {
        this.djService.registerMixtapePlay(mix.id).subscribe(() => {});
        const audio = new Audio(res.url);
        audio.play().catch(() => {});
      },
      error: (err) => {
        if (err?.status === 402) {
          this.buyMixtape(mix);
        }
      }
    });
  }

  buyMixtape(mix: Mixtape): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.buyingId.set(mix.id);
    this.djService.purchaseMixtape(mix.id).subscribe({
      next: res => {
        this.buyingId.set(null);
        if (res.paymentUrl) {
          window.open(res.paymentUrl, '_blank', 'noopener');
        }
      },
      error: err => {
        this.buyingId.set(null);
        alert(err?.error?.message || 'Achat impossible pour le moment.');
      }
    });
  }

  // ===== FORMATAGE =====

  formatPlays(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }

  formatPrice(xof: number): string {
    return new Intl.NumberFormat('fr-FR').format(xof) + ' F';
  }

  formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso));
    } catch {
      return '';
    }
  }
}

