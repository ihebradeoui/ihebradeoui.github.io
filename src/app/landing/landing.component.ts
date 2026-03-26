import { AfterViewInit, Component, OnInit } from '@angular/core';
import { SeoService } from '../services/seo.service';

declare var adsbygoogle: any[];

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit, AfterViewInit {
  constructor(private seoService: SeoService) {}

  ngOnInit(): void {
    this.seoService.setPageMeta(
      'CosmicWorlds – Explore, Claim & Customise Your Own Planets',
      'Free interactive 3D solar system. Claim planets, build streaks, and compete on the leaderboard in your browser.',
      'https://cosmicworlds.live/'
    );
  }

  ngAfterViewInit(): void {
    try {
      // Initialise top banner ad unit
      (adsbygoogle = (window as any).adsbygoogle || []).push({});
      // Initialise mid-page ad unit
      (adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }
}
