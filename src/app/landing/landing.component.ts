import { Component, AfterViewInit } from '@angular/core';

declare var adsbygoogle: any[];

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    try {
      // Initialise top banner ad unit
      (adsbygoogle = (window as any).adsbygoogle || []).push({});
      // Initialise mid-page ad unit
      (adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }
}
