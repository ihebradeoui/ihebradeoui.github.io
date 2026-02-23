import { Component, AfterViewInit, ViewEncapsulation } from '@angular/core';
import { PlanetScene } from './planet-scene';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Auth } from '@angular/fire/auth';

@Component({
  selector: 'app-planets',
  templateUrl: './planets.component.html',
  styleUrls: ['./planets.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class PlanetsComponent implements AfterViewInit {
  private planetScene: PlanetScene | null = null;

  constructor(private database: AngularFireDatabase, private auth: Auth) { }

  ngAfterViewInit(): void {
    const canvas = document.getElementById('planetsCanvas') as HTMLCanvasElement;
    if (canvas) {
      this.planetScene = new PlanetScene(canvas, this.database, this.auth);
    }
  }

  ngOnDestroy(): void {
    if (this.planetScene) {
      this.planetScene.dispose();
    }
  }
}
