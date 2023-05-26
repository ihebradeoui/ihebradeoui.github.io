import { Vector3 } from "@babylonjs/core";

export class Coordinates {
    public user : string;
    public x:number;
    public y:number;
    public z:number;
   
   constructor(user : string,x : number , y : number ,z : number  )
   {
       this.user=user;
       this.x=x;
       this.y=y;
       this.z=z;
   }   
   static makeCoordinatesFromVector3(user : string ,position : Vector3 )
   {
        return new Coordinates(user,position._x,position.y,position.z)
   }   
}
