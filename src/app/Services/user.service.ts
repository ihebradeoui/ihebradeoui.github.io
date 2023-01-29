import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { Observable } from 'rxjs';
import { User } from '../Models/User';


@Injectable({
  providedIn: 'root'
})
export class UserService {
  userList: AngularFireList<any>


  constructor(private db:AngularFireDatabase) { 
    this.userList = db.list('users')
  }

  createUser(user: User) {
    
    this.userList.push({
      email: user.email,
    firstname: user.firstname ,
    lastname: user.lastname ,
    phone: user.phone
  }).catch(error=>{
  console.error(error)

  })

  }
  getUsers() : Observable<any>{
    return this.db.list('users').snapshotChanges();
    }

    getUserById(id:any) : Observable<any>{
      return this.db.list('users', ref => ref.orderByKey().equalTo(id)).snapshotChanges();
    }

    getUserByEmail(email:any) : Observable<any>{
      return this.db.list('users', ref => ref.orderByChild("email").equalTo(email)).snapshotChanges();
    }

}