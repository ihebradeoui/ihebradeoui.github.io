import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { ExecException } from 'child_process';
import { Observable } from 'rxjs';
import { Coordinates } from '../objects/utilities/coordinates';


@Injectable({
  providedIn: 'root'
})
export class MovementService {
  reset() {
this.db.list('coordinates').remove()  }


  CoordinatesLists: AngularFireList<any>

  constructor(public db: AngularFireDatabase) {
    this.CoordinatesLists = db.list('coordinates')
   }

  getAllCoordinates(lobby : string ) : Observable<any>
  {
    return this.db.list('coordinates/'+lobby).snapshotChanges();
  }

    getAllLobbies() : Observable<any>
  {
    return this.db.list('coordinates').snapshotChanges();
  }

  addCoordinates(x : number ,y : number ,z : number)
  {
    this.CoordinatesLists.push(new Coordinates("thing",x+10,y,z+10))
  }

  getCoordinatesByUser(user:any,lobby : string) : Observable<any>{
    return this.db.list('coordinates/'+lobby, ref => ref.orderByChild("user").equalTo(user).limitToFirst(1)).snapshotChanges()
  }

  async updateCoordinatesByUser(coordinates : Coordinates, lobby : string) {
    try{
    const updated = await this.db.list('/coordinates/'+lobby).update(coordinates.user, {
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z
    }); 
  }catch(e : any)
  {
    this.initLobby(coordinates,lobby)
  }
  }
  async initLobby(coordinates : Coordinates, lobby : string) {
    const updated = await this.db.list('coordinates/' + lobby).push(coordinates); 
  }

  async pushToLobby(lobby : string,coordinates: Coordinates) {
    this.db.list("coordinates/"+lobby).push(coordinates)
  }

  async updateCoordinatesInLobby(lobby : string,coordinates : Coordinates) {
    const thing ='/coordinates/'+lobby
    const added = await this.db.list(thing).update(coordinates.user, {
      user:coordinates.user,
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z
    }); 
  }

}
