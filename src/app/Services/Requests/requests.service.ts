import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { map, Observable } from 'rxjs';
import { Request } from 'src/app/Models/Request';

@Injectable({
  providedIn: 'root'
})
export class RequestsService {
  requestsList: AngularFireList<any>


  constructor(private db:AngularFireDatabase) { 
    this.requestsList = db.list('requests')
  }

  createRequest(request: Request) {
    
    this.requestsList.push({
     employee : request.employee,
     start_date: request.start_date ,
    end_date: request.end_date ,
    type: request.type,
    comment:request.comment,
    status: "Pending"
  }).catch(error=>{
  console.error(error)

  })

  }
  getRequests() : Observable<any>{
    return this.db.list('requests').snapshotChanges();
    }

    getRequestById(id:any) : Observable<any>{
      return this.db.list('requests', ref => ref.orderByKey().equalTo(id)).snapshotChanges();
    }

    getRequestByUser(user:any) : Observable<any>{
      return this.db.list('requests', ref => ref.orderByChild("employee").equalTo(user)).snapshotChanges()
    }

}