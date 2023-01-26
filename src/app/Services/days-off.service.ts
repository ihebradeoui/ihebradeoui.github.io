import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { Observable } from 'rxjs';
import { DaysOff } from '../Models/days-off';

@Injectable({
  providedIn: 'root'
})
export class DaysOffService {

  DaysOffList: AngularFireList<any>

  constructor(private db: AngularFireDatabase) {
    this.DaysOffList = db.list('daysOff')
   }

  getDaysOff() : Observable<any>{
    return this.db.list('daysOff').snapshotChanges();
    }
  addUser(user : string , days : number)
  {
    this.DaysOffList.push(new DaysOff(user,days))
  }

}
