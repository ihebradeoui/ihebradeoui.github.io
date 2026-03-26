import { Component, OnInit } from '@angular/core';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-terms',
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.scss']
})
export class TermsComponent implements OnInit {

  constructor(private seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.setPageMeta(
      'Terms of Use – CosmicWorlds',
      'Read the terms of use for CosmicWorlds, including account rules, rentals, and acceptable conduct.',
      'https://cosmicworlds.live/terms'
    );
  }

}
