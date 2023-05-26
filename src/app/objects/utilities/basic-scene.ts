import { ArcRotateCamera, Color3, CubeTexture, Engine, FreeCamera, HemisphericLight, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Texture, Vector3 } from "@babylonjs/core";

export class BasicScene {
    scene: Scene;
    engine: Engine;


    constructor(private canvas: HTMLCanvasElement)
    {
        this.engine=new Engine(this.canvas,true);
        this.scene=this.CreateScene();
        this.engine.runRenderLoop(()=>this.scene.render())
    }

    CreateScene():Scene
    {
        var scene = new Scene(this.engine);

        // Light
        var spot = new PointLight("spot", new Vector3(0, 30, 10), scene);
        spot.diffuse = new Color3(1, 1, 1);
        spot.specular = new Color3(0, 0, 0);
    
        // Camera
        var camera = new ArcRotateCamera("Camera", 0, 0.8, 100, Vector3.Zero(), scene);
        camera.lowerBetaLimit = 0.1;
        camera.upperBetaLimit = (Math.PI / 2) * 0.9;
        camera.lowerRadiusLimit = 30;
        camera.upperRadiusLimit = 150;
        camera.attachControl(this.canvas, true);
    
        // Ground
        var groundMaterial = new StandardMaterial("ground", scene);
        groundMaterial.diffuseTexture = new Texture("/assets/ground/earth.jpg", scene);
    
        var ground = MeshBuilder.CreateGroundFromHeightMap("ground", "/assets/ground/worldHeightMap.jpg", {height:4000,width:4000,minHeight:0,maxHeight:70,subdivisions:100} ,scene);
        ground.material = groundMaterial;
    
        //Sphere to see the light's position
        let sun = MeshBuilder.CreateSphere("sun", {diameter:20}, scene);
        sun.material = new StandardMaterial("sun", scene);
    
        // Skybox
      
    
        //Sun animation
        scene.registerBeforeRender(function () {
            sun.position = spot.position;
            spot.position.x -= 0.5;
            if (spot.position.x < -90)
                spot.position.x = 100;
        });
    
        return scene;
    }
    
    CreateGroundMaterial(): StandardMaterial {
        const uv=4;
        const groundMat = new StandardMaterial("groundMat",this.scene)
       
        const groundTextures : Texture []=[]
        groundTextures.push( new Texture("/assets/ground/diffuse.jpg",this.scene))
        groundTextures.push( new Texture("/assets/ground/normal.jpg",this.scene))
        groundTextures.push( new Texture("/assets/ground/ao.jpg",this.scene))
        groundTextures.push( new Texture("/assets/ground/rough.jpg",this.scene))
        

      
    
        groundMat.diffuseTexture=groundTextures[0];
        groundMat.bumpTexture=groundTextures[1];
        groundMat.ambientTexture=groundTextures[2];
        groundMat.specularTexture=groundTextures[3];

        

        return groundMat
    }
    CreateBallMaterial() : StandardMaterial
    {
        const ballMat = new StandardMaterial("ballMat",this.scene)
        const ballTextures : Texture []=[]
        ballTextures.push( new Texture("/assets/img/diffuse.jpg",this.scene))
        ballTextures.push( new Texture("/assets/img/normal.jpg",this.scene))
        ballTextures.push( new Texture("/assets/img/ao.jpg",this.scene))
        ballTextures.push( new Texture("/assets/img/rough.jpg",this.scene))
        
        ballMat.diffuseTexture=ballTextures[0]
        ballMat.bumpTexture=ballTextures[1]
        ballMat.ambientTexture=ballTextures[2]
        ballMat.specularTexture=ballTextures[4]
        ballMat.specularPower=10;

        return ballMat;
    }
}
