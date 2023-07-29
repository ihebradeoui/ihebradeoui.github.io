import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { pbrThing } from '../objects/utilities/pbr-thing';
import { MovementService } from '../Services/movement.service';
import { BasicScene } from '../objects/utilities/basic-scene';

@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss']
})
export class NotFoundComponent implements OnInit {

  constructor(private http: HttpClient, private movementService: MovementService, private router: Router, private rout: ActivatedRoute) { }
  ngOnInit(): void {
    var user = "default"
    this.rout.queryParams
      .subscribe(params => {
        user = params["user"];
      })
    const canvas = document.querySelector("canvas")!
    const lobby = this.router.url.substring(1, this.router.url.indexOf('?'))
    console.log(lobby)
    this.start(user, lobby, canvas)
  }
  start(user: any, lobby: string, canvas: any): void {
    const scene = new pbrThing(this.http, canvas, this.movementService, lobby, user);
    //const scene = new BasicScene(canvas)
  }

}
