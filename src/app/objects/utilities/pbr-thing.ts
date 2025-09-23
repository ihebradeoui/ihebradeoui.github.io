import { HttpClient } from "@angular/common/http";
import { CubeTexture, Engine, Mesh, FreeCamera, FollowCamera, HemisphericLight, MeshBuilder, PBRMaterial, Scene, StandardMaterial, Texture, Vector3, KeyboardEventTypes, AttachToBoxBehavior, ExecuteCodeAction, ActionManager, Camera, ArcRotateCamera, PhysicsImpostor, CannonJSPlugin, Quaternion, int, GroundMesh } from "@babylonjs/core";
import { Button } from "@babylonjs/gui";
import { Coordinates } from "src/app/objects/utilities/coordinates";
import { MovementService } from "src/app/Services/movement.service";
import { Movement } from "./movement";
import { UserName } from "./writer";
import MeshWriter from 'meshwriter'
import { Animal } from "../animals/animal";
import { throttleTime, distinctUntilChanged } from 'rxjs/operators';


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
        
        // Start cleanup interval for memory management
        this.movementService.startCleanupInterval();
        
        this.engine.runRenderLoop(() => this.scene.render())
        
        // Clean up when window/tab is closed
        window.addEventListener('beforeunload', () => {
            if (this.lobby) {
                this.movementService.leaveLobby(this.lobby);
            }
        });
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



        const ball = MeshBuilder.CreateSphere("ball", { diameter: 1, updatable: true }, this.scene)
        ball.position = new Vector3(0, 10, 0);
        ball.material = this.CreateGroundMaterial(1);
        ball.rotation = new Vector3(0, 0, 0)

        //rabbit
        const rabbit = new Animal();
        rabbit.draw(scene);

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




        // Optimized Firebase subscription with throttling
        this.movementService.getAllCoordinates(this.lobby)
            .pipe(
                throttleTime(50), // Limit processing to 20 times per second
                distinctUntilChanged() // Only process when data actually changes
            )
            .subscribe((res) => {
                this.listCoordinates(res, ball);
            });
        //this.username=this.makeWriter(scene,this.user,ball.position,this.user)
        return scene;
    }
    listCoordinates(entries: any[], ball: Mesh) {
        if (!entries || entries.length === 0) {
            return; // Exit early if no data
        }
        
        this.Coordinates = [];
        entries.forEach(element => {
            let y = element.payload.toJSON()
            y["$key"] = element.user
            if (y["user"] != this.user) { 
                this.Coordinates.push(y as Coordinates); 
            }
        });
        
        // Batch process coordinate updates to reduce DOM manipulations
        this.updatePlayerPositions(ball);
    }

    private updatePlayerPositions(ball: Mesh) {
        this.Coordinates.forEach(element => {
            if (!this.users.includes(element.user)) {
                // Create new player
                var ballo = ball.clone("ball" + element.user)
                ballo.position = new Vector3(element.x, element.y, element.z);
                ballo.checkCollisions = true
                ballo.material = this.CreateGroundMaterial(1);
                this.balls.push(ballo)
                this.users.push(element.user)
            } else {
                // Update existing player position
                const ballIndex = this.balls.findIndex(ballj => ballj.name === "ball" + element.user);
                if (ballIndex !== -1) {
                    const targetBall = this.balls[ballIndex];
                    // Only update if position changed significantly (reduce unnecessary updates)
                    const threshold = 0.1;
                    if (Math.abs(targetBall.position.x - element.x) > threshold ||
                        Math.abs(targetBall.position.y - element.y) > threshold ||
                        Math.abs(targetBall.position.z - element.z) > threshold) {
                        targetBall.position.x = element.x;
                        targetBall.position.y = element.y;
                        targetBall.position.z = element.z;
                    }
                }
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
