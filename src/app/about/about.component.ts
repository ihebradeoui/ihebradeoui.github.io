import { Component, AfterViewInit } from '@angular/core';

declare var adsbygoogle: any[];

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    try {
      (adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }
}
