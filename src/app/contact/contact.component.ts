import { Component, OnInit } from '@angular/core';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent implements OnInit {

  constructor(private seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.setPageMeta(
      'Contact – CosmicWorlds',
      'Contact CosmicWorlds for support, privacy requests, and feature feedback.',
      'https://cosmicworlds.live/contact'
    );
  }

}
