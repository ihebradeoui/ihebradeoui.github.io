import { Component, OnInit } from '@angular/core';
import { SeoService } from '../services/seo.service';

interface PlanetInfo {
  name: string;
  emoji: string;
  subtitle: string;
  distanceFromSun: string;
  dayLength: string;
  yearLength: string;
  funFact: string;
}

@Component({
  selector: 'app-learn',
  templateUrl: './learn.component.html',
  styleUrls: ['./learn.component.scss']
})
export class LearnComponent implements OnInit {
  planets: PlanetInfo[] = [
    {
      name: 'Mercury',
      emoji: '☿️',
      subtitle: 'The smallest and fastest planet',
      distanceFromSun: '57.9 million km',
      dayLength: '58.6 Earth days',
      yearLength: '88 Earth days',
      funFact: 'A single day on Mercury lasts longer than its year.'
    },
    {
      name: 'Venus',
      emoji: '♀️',
      subtitle: 'Earth’s hot twin',
      distanceFromSun: '108.2 million km',
      dayLength: '243 Earth days',
      yearLength: '225 Earth days',
      funFact: 'Venus rotates backwards compared to most planets.'
    },
    {
      name: 'Earth',
      emoji: '🌍',
      subtitle: 'Our home planet',
      distanceFromSun: '149.6 million km',
      dayLength: '24 hours',
      yearLength: '365 days',
      funFact: 'Earth is the only known planet with liquid water on its surface.'
    },
    {
      name: 'Mars',
      emoji: '🔴',
      subtitle: 'The red planet',
      distanceFromSun: '227.9 million km',
      dayLength: '24.6 hours',
      yearLength: '687 days',
      funFact: 'Mars has the largest volcano in the solar system: Olympus Mons.'
    },
    {
      name: 'Jupiter',
      emoji: '🟠',
      subtitle: 'The giant planet',
      distanceFromSun: '778.5 million km',
      dayLength: '9.9 hours',
      yearLength: '11.9 Earth years',
      funFact: 'Jupiter is so massive that over 1,300 Earths could fit inside it.'
    },
    {
      name: 'Saturn',
      emoji: '🪐',
      subtitle: 'Famous for its rings',
      distanceFromSun: '1.43 billion km',
      dayLength: '10.7 hours',
      yearLength: '29.5 Earth years',
      funFact: 'Saturn’s rings are mostly made of ice and rock particles.'
    },
    {
      name: 'Uranus',
      emoji: '🔵',
      subtitle: 'The tilted ice giant',
      distanceFromSun: '2.87 billion km',
      dayLength: '17.2 hours',
      yearLength: '84 Earth years',
      funFact: 'Uranus spins on its side with an axial tilt of about 98°.'
    },
    {
      name: 'Neptune',
      emoji: '💙',
      subtitle: 'The windy blue world',
      distanceFromSun: '4.5 billion km',
      dayLength: '16.1 hours',
      yearLength: '165 Earth years',
      funFact: 'Neptune has the fastest winds in the solar system.'
    }
  ];
  selectedPlanet: PlanetInfo = this.planets[2];

  constructor(private seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.setPageMeta(
      'Learn Planets – CosmicWorlds',
      'Discover the planets of our solar system. Click each planet to learn key facts and comparisons.',
      'https://cosmicworlds.live/learn'
    );
  }

  selectPlanet(planet: PlanetInfo): void {
    this.selectedPlanet = planet;
  }

}
