import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MovementService } from '../Services/movement.service';
import { HttpClient, HttpHeaders} from '@angular/common/http';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  username:string = ''
  lobby:string=''
  constructor(private http : HttpClient ,private router : Router){}
  ngOnInit(): void {
   
  } 

  play()
  {
   this.router.navigate(["/"+this.lobby],{ queryParams:{user : this.username}, queryParamsHandling:'merge'})
  }

}
