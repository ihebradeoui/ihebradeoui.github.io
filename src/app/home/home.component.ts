import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { FormControl } from '@angular/forms';
import { AuthService } from '../auth.service';
import { DaysOff } from '../Models/days-off';
import { DaysOffService } from '../Services/days-off.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  AvailableDays=0
  data:any
  DaysOff: DaysOff []=[];
  firstName : string;
  lastName : string;
  counter : number =1;
  startDate : Date;
  endDate : Date ;

  constructor(private db: AngularFireDatabase, private auth:AuthService,private daysOffService : DaysOffService) { }

  ngOnInit(): void {
    let name : string = this.auth.CurrentUserEmail().split("@")[0]
    this.firstName=name.split(' ')[0]
    this.lastName=name.slice(name.indexOf(' ')+1)
    this.daysOffService.getDaysOff().subscribe((data)=>{this.listDaysOff(data)})
    
}


listDaysOff(entries: any[]){
  this.DaysOff = [];
  entries.forEach(element => {
   let y = element.payload.toJSON()
   y["$key"] = element.key
   console.log(this.auth.CurrentUserUid())
   if(y["userUid"] == this.auth.CurrentUserUid())
   {this.DaysOff.push(y as DaysOff);}
   
})
}


CountUp()
{
  this.counter+=(0.5)
}


CountDown()
{
  this.counter-=0.5
}

btnClicked()
{
  if(this.endDate!=undefined)
  {
    if(this.endDate.toDateString()!="")
    {
      if(this.endDate )
      {
        console.log()
      }
    }

  }

}


SynchronizeDates()
{
  console.log("TODO")
}

}