import { ActionManager, ArcRotateCamera, Camera, ExecuteCodeAction, Mesh, Quaternion, Scene, Tools, Vector3 } from "@babylonjs/core";
import { MovementService } from "src/app/Services/movement.service";
import { Coordinates } from "./coordinates";
import { UserName } from "./writer";
import { update } from "@angular/fire/database";

export class Movement {
    static manageKeyboadInput(thing: any, scene: Scene, ball: Mesh, camera: any, movementService: MovementService, lobby: string, user: string, username: UserName) {
        thing.inputMap = {};
        scene.actionManager = new ActionManager(scene)
        scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, (evt) => {
            thing.inputMap[evt.sourceEvent.key + "down"] = evt.sourceEvent.type == "keydown";
        }));

        scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, (evt) => {
            thing.inputMap[evt.sourceEvent.key + "up"] = evt.sourceEvent.type == "keyup";
        }));

        scene.onBeforeRenderObservable.add(() => {
            let time = 0;
            this.updateFromKeyboard(thing, ball, camera, movementService, lobby, user, username, time);
        });

    }
    static updateFromKeyboard(thing: any, ball: Mesh, camera: ArcRotateCamera, movementService: MovementService, lobby: string, user: string, username: UserName, time: number) {
        var oldPos = new Vector3(ball.position.x, ball.position.y, ball.position.z)
        var MovingImpulse = new Vector3(0, 0, 0)
        if (thing.inputMap["zdown"]) {
            MovingImpulse = ball.position.subtract(camera.position).normalize()
            MovingImpulse.y = 0
        } if (thing.inputMap["sdown"]) {
            thing.down = -0.1;
        } if (thing.inputMap["qdown"]) {
            thing.left = -0.1;
        } if (thing.inputMap["ddown"]) {
            let cameraToTheLeft = camera.position
            cameraToTheLeft._x -= ball.getBoundingInfo().boundingSphere.radius
            cameraToTheLeft._z -= ball.getBoundingInfo().boundingSphere.radius
            MovingImpulse = ball.position.subtract(cameraToTheLeft).normalize()
            thing.right = 0.1;

        }
        if (thing.inputMap["zup"]) {
            thing.up = 0;
        } if (thing.inputMap["sup"]) {
            thing.down = 0;
        }
        if (thing.inputMap["qup"]) {
            thing.left = 0;
        } if (thing.inputMap["dup"]) {
            thing.right = 0;
        }

        if (thing.inputMap[" down"]) {//if spacebar pressed
            ball.physicsImpostor.applyImpulse(new Vector3(0, 10, 0), new Vector3(ball.position.x, ball.position.y - 1, ball.position.z));
        }

        // !!!!!!manual jump thing
        if (thing.jump == 1 && ball.position.y < 2) {
            ball.physicsImpostor.applyImpulse(new Vector3(0, 5, 0), ball.getAbsolutePosition());
        }
        // else
        // {
        //     thing.jump=0
        // }        


        // if (ball.position.y>0.5 && thing.jump == 0) {//if ure high go down a bit
        //     ball.position.y-=0.05
        // }   

        //console.log(camera.cameraRotation)
        //)
        let HorizentalMovement = thing.left + thing.right
        let VerticalMovement = thing.up + thing.down


        // username.mesh.position.x+= thing.left+thing.right 
        // username.mesh.position.z+= thing.up+thing.down
        thing.inputMap = {}
        //const viewAngleY = 2 * Math.PI - camera.alpha;
        // top.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, viewAngleY, 0);
        //ball.rotationQuaternion = Quaternion.FromEulerAngles(0, thing.up*90, 0);

        //!!!!!!!!!! upload to cloud with optimization
        time += 1;
        if (!MovingImpulse.equals(new Vector3(0, 0, 0))) ball.physicsImpostor.applyImpulse(MovingImpulse, ball.getAbsolutePosition());
        if (oldPos.x !== ball.position.x || oldPos.y !== ball.position.y || oldPos.z !== ball.position.z) {
            // Use the optimized update method that includes throttling
            movementService.updateCoordinatesByUser(Coordinates.makeCoordinatesFromVector3(user, ball.position), lobby);
            
            // Log performance stats every 100 updates (optional - can be removed for production)
            if (time % 100 === 0) {
                const stats = movementService.getPerformanceStats();
                console.log('Firebase Optimization Stats:', stats);
            }
        }
    }
    static calculateAngle(camera: Camera, ball: Mesh) {
        let v0 = new Vector3(ball.getBoundingInfo().boundingSphere.radius, 0, 0);
        let v1 = ball.position.subtract(camera.position.add(v0));

        v1.normalize();


        console.log(v1)
        return v1;
    }
}