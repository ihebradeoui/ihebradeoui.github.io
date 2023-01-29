import { Injectable } from '@angular/core';
import firebase from 'firebase/compat/app';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  fireApp2 = firebase.initializeApp(environment.firebase,'tempApp')

  constructor() {
    
   }

  CreateNewUser(email:string , password:string){
      return new Promise(
        (resolve,reject)=>
        {
           this.fireApp2.auth().createUserWithEmailAndPassword(email,password,).then(
            ()=>{
              resolve(true);
            },
            (error)=>
            {
              reject(error);
            }
            
          )
        }
      )
  }


  SignInUser(email:string,password:string) {
    return new Promise(
      (resolve,reject) => {
         this.fireApp2.auth().signInWithEmailAndPassword(email,password).then(
          () => {
            resolve(true)
            console.log("resolve")
          },
          (error) => {
            reject(error)
            console.log("reject")
          }
        )
      }
    )
  }

  SignOutUser(){ 
    this.fireApp2.auth().signOut()
   }
  
   IsConnected()
   {
     return new Promise(
       (resolve,reject)=>
       {
        this.fireApp2.auth().onAuthStateChanged((user)=>{
           if(user){resolve(true)}
           else
           reject("offline")
         })
       }
     )
   }
   Auth()
   {
     return  this.fireApp2.auth();
   }
   CurrentUserEmail() 
   {
     return  this.fireApp2.auth().currentUser?.email ;
   }
   CurrentUserUid() 
   {
     return  this.fireApp2.auth().currentUser?.uid ;
   }
   ResetPassword(email:string)
   {
     return new Promise(
       (resolve,reject)=>
       {
        this.fireApp2.auth().sendPasswordResetEmail(email).then(
           ()=>
           {resolve(true);}
           ,
           (error)=>
           {
             reject(error)
           }
         )
       }
     )
   }
}