import { Injectable } from "@angular/core";
import firebase from "firebase/compat/app";
import { environment } from "src/environments/environment";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  fireApp2 = firebase.initializeApp(environment.firebase, "tempApp");

  constructor() {}

  CreateNewUser(email: string, password: string) {
    return new Promise((resolve, reject) => {
      this.fireApp2
        .auth()
        .createUserWithEmailAndPassword(email, password)
        .then(
          () => {
            resolve(true);
          },
          (error) => {
            reject(error);
          }
        );
    });
  }

  SignInUser(email: string, password: string) {
    return new Promise((resolve, reject) => {
      firebase
        .auth()
        .signInWithEmailAndPassword(email, password)
        .then(
          () => {
            resolve(true);
            console.log("resolve");
          },
          (error) => {
            console.log(email, password);
            reject(error);
            console.log("reject");
          }
        );
    });
  }

  SignOutUser() {
    firebase.auth().signOut();
  }

  IsConnected() {
    return new Promise((resolve, reject) => {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          resolve(true);
        } else reject("offline");
      });
    });
  }
  Auth() {
    return firebase.auth();
  }
  CurrentUserEmail() {
    return firebase.auth().currentUser?.email;
  }
  CurrentUserUid() {
    return firebase.auth().currentUser?.uid;
  }
  ResetPassword(email: string) {
    return new Promise((resolve, reject) => {
      firebase
        .auth()
        .sendPasswordResetEmail(email)
        .then(
          () => {
            resolve(true);
          },
          (error) => {
            reject(error);
          }
        );
    });
  }
}
