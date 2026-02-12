import { 
  Engine, 
  Scene, 
  ArcRotateCamera, 
  HemisphericLight, 
  Vector3, 
  MeshBuilder, 
  StandardMaterial,
  Color3,
  Mesh,
  ActionManager,
  ExecuteCodeAction,
  CubeTexture,
  DynamicTexture
} from "@babylonjs/core";
import { AngularFireDatabase } from '@angular/fire/compat/database';

export interface PlanetData {
  id?: string;
  name: string;
  description: string;
  position: { x: number; y: number; z: number };
  color: string;
  size: number;
}

export class PlanetScene {
  private scene: Scene;
  private engine: Engine;
  private camera: ArcRotateCamera;
  private planets: Map<string, Mesh> = new Map();
  private selectedPlanet: Mesh | null = null;

  constructor(private canvas: HTMLCanvasElement, private database: AngularFireDatabase) {
    this.engine = new Engine(this.canvas, true);
    this.scene = this.createScene();
    
    // Run the render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    // Load planets from Firebase
    this.loadPlanets();
    
    // Setup modal interaction
    this.setupModalInteraction();
  }

  private createScene(): Scene {
    const scene = new Scene(this.engine);
    this.scene = scene; // Assign early so methods can use it
    scene.clearColor = new Color3(0.05, 0.05, 0.15).toColor4();

    // Camera
    this.camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 3,
      50,
      Vector3.Zero(),
      scene
    );
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerRadiusLimit = 10;
    this.camera.upperRadiusLimit = 200;

    // Light
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    // Skybox
    const envTex = CubeTexture.CreateFromPrefilteredData("/assets/pbr/environment.env", scene);
    scene.environmentTexture = envTex;
    scene.createDefaultSkybox(envTex, true, 1000);

    // Create some initial planets if none exist
    this.createInitialPlanets();

    return scene;
  }

  private createInitialPlanets(): void {
    // Create a few placeholder planets that will be replaced by Firebase data
    const initialPlanets = [
      { position: new Vector3(0, 0, 0), color: "#ff6b6b", size: 3 },
      { position: new Vector3(15, 5, 10), color: "#4ecdc4", size: 2.5 },
      { position: new Vector3(-12, -3, 15), color: "#ffe66d", size: 2 },
      { position: new Vector3(10, 8, -15), color: "#a8dadc", size: 2.8 },
      { position: new Vector3(-15, 2, -8), color: "#f4a261", size: 2.2 },
    ];

    initialPlanets.forEach((data, index) => {
      const planetId = `planet_${index}`;
      this.createPlanet(planetId, {
        id: planetId,
        name: `Planet ${index + 1}`,
        description: 'Click to edit',
        position: { x: data.position.x, y: data.position.y, z: data.position.z },
        color: data.color,
        size: data.size
      });
    });
  }

  private createPlanet(id: string, data: PlanetData): Mesh {
    // Create planet sphere
    const planet = MeshBuilder.CreateSphere(
      id,
      { diameter: data.size },
      this.scene
    );
    planet.position = new Vector3(data.position.x, data.position.y, data.position.z);

    // Material
    const material = new StandardMaterial(`mat_${id}`, this.scene);
    material.diffuseColor = Color3.FromHexString(data.color);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    material.emissiveColor = Color3.FromHexString(data.color).scale(0.2);
    planet.material = material;

    // Add floating animation
    let time = Math.random() * Math.PI * 2;
    this.scene.registerBeforeRender(() => {
      time += 0.01;
      planet.position.y = data.position.y + Math.sin(time) * 0.5;
      planet.rotation.y += 0.005;
    });

    // Create name label
    this.createNameLabel(planet, data.name);

    // Make it clickable
    planet.actionManager = new ActionManager(this.scene);
    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.onPlanetClick(planet, id);
      })
    );

    // Store reference
    this.planets.set(id, planet);

    return planet;
  }

  private createNameLabel(planet: Mesh, name: string): void {
    // Create a plane for the text
    const plane = MeshBuilder.CreatePlane(
      `label_${planet.name}`,
      { width: 5, height: 1 },
      this.scene
    );
    plane.parent = planet;
    plane.position = new Vector3(0, -2, 0);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    // Create dynamic texture for text
    const texture = new DynamicTexture(
      `texture_${planet.name}`,
      { width: 512, height: 128 },
      this.scene,
      true
    );
    texture.hasAlpha = true;

    // Draw text
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 64);
    texture.update();

    // Apply texture to plane
    const material = new StandardMaterial(`labelMat_${planet.name}`, this.scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = new Color3(1, 1, 1);
    material.backFaceCulling = false;
    plane.material = material;
  }

  private onPlanetClick(planet: Mesh, planetId: string): void {
    this.selectedPlanet = planet;
    const modal = document.getElementById('planetModal');
    const nameInput = document.getElementById('planetName') as HTMLInputElement;
    const descInput = document.getElementById('planetDescription') as HTMLTextAreaElement;

    if (modal && nameInput && descInput) {
      // Load current planet data
      this.database.object(`planets/${planetId}`).valueChanges().subscribe((data: any) => {
        if (data) {
          nameInput.value = data.name || '';
          descInput.value = data.description || '';
        }
      });

      modal.style.display = 'block';
      (modal as any).dataset.planetId = planetId;
    }
  }

  private setupModalInteraction(): void {
    const modal = document.getElementById('planetModal');
    const closeBtn = document.querySelector('.close');
    const form = document.getElementById('planetForm');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
      });
    }

    window.addEventListener('click', (event) => {
      if (event.target === modal) {
        if (modal) modal.style.display = 'none';
      }
    });

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.savePlanet();
      });
    }
  }

  private savePlanet(): void {
    const modal = document.getElementById('planetModal');
    const planetId = (modal as any)?.dataset?.planetId;
    const nameInput = document.getElementById('planetName') as HTMLInputElement;
    const descInput = document.getElementById('planetDescription') as HTMLTextAreaElement;

    if (planetId && nameInput && descInput) {
      const planet = this.planets.get(planetId);
      if (planet) {
        const planetData: PlanetData = {
          id: planetId,
          name: nameInput.value,
          description: descInput.value,
          position: {
            x: planet.position.x,
            y: planet.position.y,
            z: planet.position.z
          },
          color: (planet.material as StandardMaterial).diffuseColor.toHexString(),
          size: planet.scaling.x * 2 // diameter
        };

        // Save to Firebase
        this.database.object(`planets/${planetId}`).set(planetData);

        // Update the label
        this.updatePlanetLabel(planet, nameInput.value);

        // Close modal
        if (modal) modal.style.display = 'none';
      }
    }
  }

  private updatePlanetLabel(planet: Mesh, name: string): void {
    // Find and remove old label
    const oldLabel = this.scene.getMeshByName(`label_${planet.name}`);
    if (oldLabel) {
      oldLabel.dispose();
    }

    // Create new label
    this.createNameLabel(planet, name);
  }

  private loadPlanets(): void {
    // Listen to Firebase for all planets
    this.database.list('planets').snapshotChanges().subscribe((planets: any[]) => {
      planets.forEach((planet) => {
        const planetId = planet.key;
        const data = planet.payload.val() as PlanetData;

        if (data && planetId) {
          // Check if planet already exists
          if (this.planets.has(planetId)) {
            // Update existing planet
            const existingPlanet = this.planets.get(planetId);
            if (existingPlanet) {
              this.updatePlanetLabel(existingPlanet, data.name);
            }
          } else {
            // Create new planet
            this.createPlanet(planetId, data);
          }
        }
      });
    });
  }

  public dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
