import { Component, OnInit } from '@angular/core';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss']
})
export class PrivacyPolicyComponent implements OnInit {
  constructor(private seoService: SeoService) {}

  ngOnInit(): void {
    this.seoService.setPageMeta(
      'Privacy Policy – CosmicWorlds',
      'Read the CosmicWorlds privacy policy to understand how account, gameplay, and advertising data is handled.',
      'https://cosmicworlds.live/privacy-policy'
    );
  }
}
