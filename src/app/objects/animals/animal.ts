import { Mesh, MeshBuilder, Scene, SceneLoader, Vector3 } from "@babylonjs/core";
import { AnimalData } from "./animalData";

export class Animal {
    data: AnimalData;
    mesh: Mesh;

    constructor() {
        this.data = new AnimalData();
    }

    public draw(scene: Scene) {
        SceneLoader.ImportMesh("", "/assets/models/", "garden.gltf", scene)
        //this.mesh.position = new Vector3(this.data.coordinates.x, this.data.coordinates.y, this.data.coordinates.z);
    }
    public move(direction: string) {
        if (direction = 'up') {
            //move upwards
        }
    }
}
