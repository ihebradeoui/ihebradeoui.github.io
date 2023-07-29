import { HttpClient } from "@angular/common/http";
import { CubeTexture, Engine, Mesh, FreeCamera, FollowCamera, HemisphericLight, MeshBuilder, PBRMaterial, Scene, StandardMaterial, Texture, Vector3, KeyboardEventTypes, AttachToBoxBehavior, ExecuteCodeAction, ActionManager, Camera, ArcRotateCamera, PhysicsImpostor, CannonJSPlugin, Quaternion, int, GroundMesh } from "@babylonjs/core";
import { Button } from "@babylonjs/gui";
import { Coordinates } from "src/app/objects/utilities/coordinates";
import { MovementService } from "src/app/Services/movement.service";
import { Movement } from "./movement";
import { UserName } from "./writer";
import MeshWriter from 'meshwriter'


export class pbrThing {
    scene: Scene;
    engine: Engine;
    inputMap = {}
    up = 0
    down = 0
    left = 0
    right = 0
    jump = 0.5
    Coordinates: Coordinates[] = []
    balls: Mesh[] = []
    user: string = ""
    username: UserName
    users: string[] = []
    usernames: UserName[] = []




    constructor(private http: HttpClient, private canvas: HTMLCanvasElement, private movementService: MovementService, private lobby?: string, user?: string) {
        if (user) {
            this.user = user
            console.log(user)
        }
        this.engine = new Engine(this.canvas, true);
        this.scene = this.CreateScene();
        this.engine.runRenderLoop(() => this.scene.render())
    }


    CreateScene(): Scene {
        const scene = new Scene(this.engine);
        const gravity = -9.81;
        const framesPerSecond = 60;
        scene.enablePhysics(new Vector3(0, gravity, 0), new CannonJSPlugin());
        scene.getPhysicsEngine().setTimeStep(1);


        const hemoilight = new HemisphericLight("hemiLight", new Vector3(10, 100, 0), scene)
        hemoilight.intensity = 1;

        //const ground = MeshBuilder.CreateGround("ground",{width:1000,height:1000},this.scene)
        //ground.material=this.CreateGroundMaterial(100);



        var ground = MeshBuilder.CreateGroundFromHeightMap("ground", "/assets/ground/worldHeightMap.jpg", { height: 1000, width: 1000, minHeight: 0, maxHeight: 50, subdivisions: 500 }, scene);
        ground.material = this.CreateGroundMaterial(100);
        ground.onAfterRenderObservable.addOnce((data) => { ground.physicsImpostor = new PhysicsImpostor(ground, PhysicsImpostor.HeightmapImpostor, { mass: 0, restitution: 0.2, friction: 1 }, scene); }
        )


        //ball
        const ball = MeshBuilder.CreateSphere("ball", { diameter: 1, updatable: true }, this.scene)
        ball.position = new Vector3(0, 10, 0);



        ball.material = this.CreateGroundMaterial(1);
        ball.rotation = new Vector3(0, 0, 0)



        //skybox
        const envTex = CubeTexture.CreateFromPrefilteredData("/assets/pbr/environment.env", scene)
        scene.environmentTexture = envTex;
        scene.createDefaultSkybox(envTex, true)

        const camera = this.CreateCamera()
        camera.lockedTarget = ball
        //pointer
        scene.onPointerDown = (evt) => {
            if (evt.button === 0) {
                this.engine.enterPointerlock();
            }
            if (evt.button === 1) {
                this.engine.exitPointerlock();
            }
        }

        Movement.manageKeyboadInput(this, scene, ball, camera, this.movementService, this.lobby, this.user, this.username);

        // gravity and collision
        scene.physicsEnabled = true

        scene.collisionsEnabled = true;
        ball.checkCollisions = true;
        ground.checkCollisions = true;


        ball.physicsImpostor = new PhysicsImpostor(ball, PhysicsImpostor.SphereImpostor, { mass: 10, restitution: 0.9, friction: 1 }, scene);

        //ball.physicsImpostor.applyImpulse(new Vector3(1, 20, -1), new Vector3(1, 2, 0));




        this.movementService.getAllCoordinates(this.lobby).subscribe((res) => {
            this.listCoordinates(res, ball)

        });
        //this.username=this.makeWriter(scene,this.user,ball.position,this.user)
        return scene;
    }
    listCoordinates(entries: any[], ball: Mesh) {
        this.Coordinates = [];
        entries.forEach(element => {
            let y = element.payload.toJSON()
            y["$key"] = element.user
            if (y["user"] != this.user) { this.Coordinates.push(y as Coordinates); }
        })
        this.Coordinates.forEach(element => {
            if (!this.users.includes(element.user)) {
                var ballo = ball.clone("ball" + element.user)
                ballo.position = new Vector3(0, 1, 10);
                ballo.checkCollisions = true
                ballo.material = this.CreateGroundMaterial(1);
                ballo.position.x = element.x
                ballo.position.y = element.y
                ballo.position.z = element.z
                this.balls.push(ballo)
                this.users.push(element.user)
                // this.usernames.push(this.makeWriter(this.scene,element.user,new Vector3(element.x,element.y+2,element.z),element.user))
            }
            else {
                this.balls.forEach(ballj => {
                    if (ballj.name == "ball" + element.user) {
                        ballj.position.x = element.x
                        ballj.position.y = element.y
                        ballj.position.z = element.z
                    }

                })
                //         this.usernames.forEach((username)=>
                //             {
                //             if(username.username==element.user)
                //             {
                //                 username.mesh.position.x=element.x
                //                 username.mesh.position.y=element.y
                //                 username.mesh.position.z=element.z
                //             }}
                //             )
            }
        });

    }
    CreateGroundMaterial(uv: number): PBRMaterial {
        const groundMat = new PBRMaterial("groundMat", this.scene)

        groundMat.roughness = 1
        groundMat.albedoTexture = new Texture("/assets/pbr/asphalt/diffuse.jpg")
        const groundTextures: Texture[] = []
        groundTextures.push(new Texture("/assets/pbr/asphalt/diffuse.jpg", this.scene))
        groundTextures.push(new Texture("/assets/pbr/asphalt/normal.jpg", this.scene))
        groundTextures.push(new Texture("/assets/pbr/asphalt/arm.jpg", this.scene))
        groundMat.albedoTexture = new Texture("/assets/ground/earth.jpg", this.scene);





        // groundMat.albedoTexture=groundTextures[0];
        //groundMat.bumpTexture=groundTextures[1];

        groundMat.metallicTexture = groundTextures[2]

        groundMat.useAmbientOcclusionFromMetallicTextureRed = true
        groundMat.useRoughnessFromMetallicTextureGreen = true
        groundMat.useMetallnessFromMetallicTextureBlue = true



        groundMat.invertNormalMapX = true
        groundMat.invertNormalMapY = true
        groundTextures.forEach(element => {
            element.uScale = uv
            element.vScale = uv
        });

        return groundMat
    }
    CreateBallMaterial(): PBRMaterial {
        const ballMat = new PBRMaterial("ballMat", this.scene)

        return ballMat;
    }
    CreateCamera(): ArcRotateCamera {
        const camera = new ArcRotateCamera("camera", Math.PI / -2, 1, 3, new Vector3(0, 3, 0), this.scene)
        camera.speed = 0.25
        camera.attachControl(true)
        return camera;
    }
    makeWriter(scene: Scene, text: string, position: Vector3, user: string) {
        let Writer = MeshWriter(scene, { scale: 0.5, defaultFont: "Arial" });


        let hallOfFame = new Writer(
            "Welcome to Bank Of America",
            {
                anchor: "center",
                "letter-height": 10,
                "letter-thickness": 0.03,
                color: "#000000",
                colors: {
                    diffuse: "#000000",
                    specular: "#000000"
                },
                position: {
                    x: position.x,
                    y: position.y,
                    z: position.z
                }
            }
        );
        return new UserName(user, hallOfFame);
    }


}
