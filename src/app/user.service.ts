import { Injectable } from "@angular/core";
import {
  AngularFireDatabase,
  AngularFireList,
} from "@angular/fire/compat/database";
import { Observable, map } from "rxjs";
import { User } from "./user";

@Injectable({
  providedIn: "root",
})
export class UserService {
  userList: AngularFireList<any>;

  constructor(private db: AngularFireDatabase) {
    this.userList = db.list("users");
  }

  createUser(user: User) {
    this.userList
      .push({
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
      })
      .catch((error) => {
        console.error(error);
      });
  }
  getUsers(): Observable<any> {
    return this.db.list("users").snapshotChanges();
  }

  getUserById(id: any): Observable<any> {
    return this.db
      .list("users", (ref) => ref.orderByKey().equalTo(id))
      .snapshotChanges();
  }

  getUserByEmail(email: any): Observable<any> {
    console.log(email);
    return this.db
      .list("users", (ref) => ref.orderByChild("email").equalTo(email))
      .snapshotChanges()
      .pipe(
        map((changes) =>
          changes.map((c) => ({
            data: c.payload.val() as User,
          }))
        )
      );
  }
}
