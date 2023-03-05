import { Component, OnInit } from '@angular/core';
import { BasicScene } from '../objects/utilities/basic-scene';

@Component({
  selector: 'app-main-scene',
  templateUrl: './main-scene.component.html',
  styleUrls: ['./main-scene.component.scss']
})
export class MainSceneComponent implements OnInit{

  ngOnInit(): void {
    const canvas= document.querySelector("canvas")!
    const scene = new BasicScene(canvas);
  }
  

}
