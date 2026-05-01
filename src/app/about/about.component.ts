import { AfterViewInit, Component, OnInit } from '@angular/core';
import { SeoService } from '../services/seo.service';

declare var adsbygoogle: any[];

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent implements OnInit, AfterViewInit {
  constructor(private seoService: SeoService) {}

  ngOnInit(): void {
    this.seoService.setPageMeta(
      'About CosmicWorlds – Interactive 3D Solar System Explorer',
      'Learn about CosmicWorlds, an open-source 3D space experience built with Babylon.js, Angular, and Firebase.',
      'https://cosmicworlds.live/about'
    );
  }

  ngAfterViewInit(): void {
    try {
      (adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }
}
