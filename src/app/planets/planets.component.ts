import { Component, AfterViewInit } from '@angular/core';
import { PlanetScene } from './planet-scene';
import { AngularFireDatabase } from '@angular/fire/compat/database';

@Component({
  selector: 'app-planets',
  templateUrl: './planets.component.html',
  styleUrls: ['./planets.component.scss']
})
export class PlanetsComponent implements AfterViewInit {
  private planetScene: PlanetScene | null = null;

  constructor(private database: AngularFireDatabase) { }

  ngAfterViewInit(): void {
    const canvas = document.getElementById('planetsCanvas') as HTMLCanvasElement;
    if (canvas) {
      this.planetScene = new PlanetScene(canvas, this.database);
    }
  }

  ngOnDestroy(): void {
    if (this.planetScene) {
      this.planetScene.dispose();
    }
  }
}
