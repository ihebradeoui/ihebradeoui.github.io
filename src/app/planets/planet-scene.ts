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
  DynamicTexture,
  PointLight,
  PBRMaterial,
  Texture,
  GlowLayer,
  ParticleSystem
} from "@babylonjs/core";
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Subscription } from 'rxjs';

export interface PlanetData {
  id?: string;
  name: string;
  description: string;
  position: { x: number; y: number; z: number };
  color: string;
  size: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitAngle?: number;
}

export class PlanetScene {
  private scene: Scene;
  private engine: Engine;
  private camera: ArcRotateCamera;
  private planets: Map<string, Mesh> = new Map();
  private planetDataMap: Map<string, PlanetData> = new Map();
  private selectedPlanet: Mesh | null = null;
  private subscriptions: Subscription[] = [];
  private sun: Mesh | null = null;
  private glowLayer: GlowLayer | null = null;
  private animationCallbacks: (() => void)[] = [];

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
    
    // Deep space background color
    scene.clearColor = new Color3(0.01, 0.01, 0.02).toColor4();

    // Camera - positioned to view the orbital system
    this.camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 3,
      80,
      Vector3.Zero(),
      scene
    );
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerRadiusLimit = 20;
    this.camera.upperRadiusLimit = 300;
    this.camera.wheelPrecision = 20;
    this.camera.panningSensibility = 0;

    // Create glow layer for luminous effects
    this.glowLayer = new GlowLayer("glow", scene);
    this.glowLayer.intensity = 0.7;

    // Create sun at center
    this.createSun();

    // Main light source from the sun
    const sunLight = new PointLight("sunLight", Vector3.Zero(), scene);
    sunLight.intensity = 2.0;
    sunLight.range = 500;
    sunLight.diffuse = new Color3(1.0, 0.95, 0.8);
    sunLight.specular = new Color3(1.0, 0.95, 0.8);

    // Subtle ambient light for visibility
    const ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.15;
    ambientLight.diffuse = new Color3(0.2, 0.2, 0.3);

    // Enhanced space skybox
    this.createSpaceSkybox(scene);

    // Create star field particles
    this.createStarField();

    // Create initial planets with orbital paths
    this.createInitialPlanets();

    // Setup unified animation loop
    this.setupAnimationLoop();

    return scene;
  }

  private setupAnimationLoop(): void {
    // Single animation callback for all scene animations
    this.scene.registerBeforeRender(() => {
      // Rotate sun
      if (this.sun) {
        this.sun.rotation.y += 0.001;
      }

      // Update all planet orbits and rotations
      this.planetDataMap.forEach((data, id) => {
        const planet = this.planets.get(id);
        if (planet && data.orbitRadius && data.orbitSpeed && data.orbitAngle !== undefined) {
          // Update orbit angle
          data.orbitAngle += data.orbitSpeed;
          
          // Calculate new position
          planet.position.x = Math.cos(data.orbitAngle) * data.orbitRadius;
          planet.position.z = Math.sin(data.orbitAngle) * data.orbitRadius;
          planet.position.y = 0;
          
          // Planet self-rotation
          planet.rotation.y += 0.01;
        }
      });
    });
  }

  private createSun(): void {
    // Create the sun sphere
    this.sun = MeshBuilder.CreateSphere(
      "sun",
      { diameter: 8, segments: 32 },
      this.scene
    );
    this.sun.position = Vector3.Zero();

    // Create glowing sun material
    const sunMaterial = new StandardMaterial("sunMaterial", this.scene);
    sunMaterial.emissiveColor = new Color3(1.0, 0.8, 0.3);
    sunMaterial.diffuseColor = new Color3(1.0, 0.9, 0.4);
    sunMaterial.specularColor = new Color3(0, 0, 0);
    this.sun.material = sunMaterial;

    // Add sun to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.sun);
    }
    
    // Note: Sun rotation is handled in the unified animation loop
  }

  private createSpaceSkybox(scene: Scene): void {
    // Create a much larger skybox for deep space feel
    const skybox = MeshBuilder.CreateBox("skybox", { size: 2000 }, scene);
    const skyboxMaterial = new StandardMaterial("skyboxMaterial", scene);
    
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.disableLighting = true;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    
    // Use the existing environment texture if available, otherwise create a dark space
    try {
      const envTex = CubeTexture.CreateFromPrefilteredData("/assets/pbr/environment.env", scene);
      skyboxMaterial.reflectionTexture = envTex;
      skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
      scene.environmentTexture = envTex;
    } catch (e) {
      // Fallback to dark starry appearance
      skyboxMaterial.emissiveColor = new Color3(0.02, 0.02, 0.05);
    }
    
    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;
  }

  private createStarField(): void {
    // Create particle system for distant stars
    // Note: Using 2000 immortal particles (lifetime = Number.MAX_VALUE) for static starfield
    // This is intentional for performance - stars don't need to respawn
    // Consider reducing particle count if targeting low-end devices
    const particleSystem = new ParticleSystem("stars", 2000, this.scene);
    
    // Create a simple emitter point
    particleSystem.emitter = Vector3.Zero();
    particleSystem.minEmitBox = new Vector3(-500, -500, -500);
    particleSystem.maxEmitBox = new Vector3(500, 500, 500);

    // Create a simple white dot texture programmatically
    const starTexture = new DynamicTexture("starTexture", { width: 32, height: 32 }, this.scene, false);
    const context = starTexture.getContext();
    const centerX = 16;
    const centerY = 16;
    const radius = 12;
    
    // Draw a radial gradient for the star
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    starTexture.update();
    
    particleSystem.particleTexture = starTexture;
    particleSystem.minSize = 0.3;
    particleSystem.maxSize = 1.5;
    
    // Color of stars - white to slight blue tint
    particleSystem.color1 = new Color3(1, 1, 1).toColor4();
    particleSystem.color2 = new Color3(0.8, 0.8, 1.0).toColor4();
    particleSystem.colorDead = new Color3(0.5, 0.5, 0.6).toColor4();

    // Lifetime
    particleSystem.minLifeTime = Number.MAX_VALUE;
    particleSystem.maxLifeTime = Number.MAX_VALUE;

    // Emission rate
    particleSystem.emitRate = 2000;
    particleSystem.updateSpeed = 0.001;

    particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;

    // Start the particle system
    particleSystem.start();
  }

  private createInitialPlanets(): void {
    // Create planets with orbital parameters (distance from sun, orbital speed)
    const initialPlanets = [
      { orbitRadius: 15, color: "#8B7355", size: 1.8, speed: 0.015, name: "Mercury" },
      { orbitRadius: 22, color: "#FFA54F", size: 2.3, speed: 0.012, name: "Venus" },
      { orbitRadius: 30, color: "#4169E1", size: 2.5, speed: 0.010, name: "Earth" },
      { orbitRadius: 38, color: "#CD5C5C", size: 2.0, speed: 0.008, name: "Mars" },
      { orbitRadius: 55, color: "#DAA520", size: 4.5, speed: 0.005, name: "Jupiter" },
      { orbitRadius: 70, color: "#F4A460", size: 4.0, speed: 0.004, name: "Saturn" },
      { orbitRadius: 85, color: "#4682B4", size: 3.2, speed: 0.003, name: "Uranus" },
      { orbitRadius: 100, color: "#1E90FF", size: 3.0, speed: 0.002, name: "Neptune" },
    ];

    initialPlanets.forEach((data, index) => {
      const planetId = `planet_${index}`;
      const startAngle = (Math.PI * 2 * index) / initialPlanets.length;
      
      this.createPlanet(planetId, {
        id: planetId,
        name: data.name,
        description: 'Click to edit',
        position: { 
          x: Math.cos(startAngle) * data.orbitRadius, 
          y: 0, 
          z: Math.sin(startAngle) * data.orbitRadius 
        },
        color: data.color,
        size: data.size,
        orbitRadius: data.orbitRadius,
        orbitSpeed: data.speed,
        orbitAngle: startAngle
      });
    });
  }

  private createPlanet(id: string, data: PlanetData): Mesh {
    // Create planet sphere with higher detail
    const planet = MeshBuilder.CreateSphere(
      id,
      { diameter: data.size, segments: 32 },
      this.scene
    );
    planet.position = new Vector3(data.position.x, data.position.y, data.position.z);

    // Enhanced PBR Material for realistic planet appearance
    const material = new PBRMaterial(`mat_${id}`, this.scene);
    
    // Base color
    material.albedoColor = Color3.FromHexString(data.color);
    
    // Metallic and roughness for realistic surface
    material.metallic = 0.1;
    material.roughness = 0.8;
    
    // Subtle emissive for visibility
    material.emissiveColor = Color3.FromHexString(data.color).scale(0.05);
    
    // Specular highlights from sun
    material.specularIntensity = 0.3;
    
    // Enable lighting from point light
    material.directIntensity = 1.0;
    
    planet.material = material;

    // Store orbital parameters in the data map (will be used by unified animation loop)
    data.orbitRadius = data.orbitRadius || 0;
    data.orbitSpeed = data.orbitSpeed || 0;
    data.orbitAngle = data.orbitAngle || 0;

    // Create orbital path visualization (subtle ring)
    if (data.orbitRadius > 0) {
      const orbitPath = MeshBuilder.CreateTorus(
        `orbit_${id}`,
        { 
          diameter: data.orbitRadius * 2, 
          thickness: 0.05, 
          tessellation: 64 
        },
        this.scene
      );
      orbitPath.position = Vector3.Zero();
      orbitPath.rotation.x = Math.PI / 2;
      
      const orbitMaterial = new StandardMaterial(`orbitMat_${id}`, this.scene);
      orbitMaterial.emissiveColor = new Color3(0.1, 0.1, 0.15);
      orbitMaterial.alpha = 0.2;
      orbitMaterial.wireframe = false;
      orbitPath.material = orbitMaterial;
    }

    // Note: Orbital motion and rotation handled in unified animation loop

    // Create name label
    this.createNameLabel(planet, data.name);

    // Make it clickable
    planet.actionManager = new ActionManager(this.scene);
    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.onPlanetClick(planet, id);
      })
    );

    // Store references
    this.planets.set(id, planet);
    this.planetDataMap.set(id, data);

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
      // Load current planet data (use stored data or fetch once)
      const storedData = this.planetDataMap.get(planetId);
      if (storedData) {
        nameInput.value = storedData.name || '';
        descInput.value = storedData.description || '';
      } else {
        // Fetch once if not in cache
        const sub = this.database.object(`planets/${planetId}`).valueChanges().subscribe((data: any) => {
          if (data) {
            nameInput.value = data.name || '';
            descInput.value = data.description || '';
          }
          sub.unsubscribe();
        });
      }

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
      const storedData = this.planetDataMap.get(planetId);
      if (planet && storedData) {
        const material = planet.material;
        let color: string;
        
        // Use instanceof for robust type checking
        if (material instanceof PBRMaterial) {
          color = material.albedoColor.toHexString();
        } else if (material instanceof StandardMaterial) {
          color = material.diffuseColor.toHexString();
        } else {
          color = storedData.color; // Fallback to stored color
        }
        
        const planetData: PlanetData = {
          id: planetId,
          name: nameInput.value,
          description: descInput.value,
          position: {
            x: planet.position.x,
            y: planet.position.y,
            z: planet.position.z
          },
          color: color,
          size: storedData.size,
          orbitRadius: storedData.orbitRadius,
          orbitSpeed: storedData.orbitSpeed,
          orbitAngle: storedData.orbitAngle
        };

        // Save to Firebase
        this.database.object(`planets/${planetId}`).set(planetData);
        
        // Update local cache
        this.planetDataMap.set(planetId, planetData);

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
    const sub = this.database.list('planets').snapshotChanges().subscribe((planets: any[]) => {
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
              this.planetDataMap.set(planetId, data);
            }
          } else {
            // Create new planet
            this.createPlanet(planetId, data);
          }
        }
      });
    });
    this.subscriptions.push(sub);
  }

  public dispose(): void {
    // Unsubscribe from all Firebase subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    // Dispose Babylon.js resources
    this.scene.dispose();
    this.engine.dispose();
  }
}
