

import { Mesh, Scene, Vector3 } from '@babylonjs/core'
import MeshWriter from 'meshwriter'


export class UserName
{
    public username
    public mesh
    constructor(username: string , mesh : Mesh)
    {
        this.mesh=mesh
        this.username=username
    }
    public static makeWriter(scene  : Scene,text : string,position : Vector3,user : string)
    {
      let Writer = MeshWriter(scene, {scale:0.5,defaultFont:"Arial"});
        

      let hallOfFame  = new Writer( 
                      "Welcome to Bank Of America",
                      {
                          "anchor": "center",
                          "letter-height": 10,
                          "letter-thickness": 0.03,
                          color: "#000000",
                          colors: {
                              diffuse: "#000000",
                              specular: "#000000"
                          }
                      ,
                  
  position: {
    x: position.x,
    y: position.y,
    z: position.z
  }}
);
return new UserName(user,hallOfFame);
}

}