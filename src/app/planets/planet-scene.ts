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
  ParticleSystem,
  Color4,
  ProceduralTexture,
  NoiseProceduralTexture,
  Animation,
  SphereParticleEmitter,
  AbstractMesh
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
  actualRadius?: number; // Store actual radius for particle emitters
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
  private meteorParticleSystems: ParticleSystem[] = [];
  private meteorInterval: number | null = null;
  private meteorTimeouts: number[] = [];

  constructor(private canvas: HTMLCanvasElement, private database: AngularFireDatabase) {
    this.engine = new Engine(this.canvas, true, { 
      preserveDrawingBuffer: true, 
      stencil: true,
      antialias: true // Enable hardware anti-aliasing
    });
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
    
    // Deep black space background color for professional look
    scene.clearColor = new Color4(0, 0, 0, 1);

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

    // Create enhanced glow layer for premium luminous effects
    this.glowLayer = new GlowLayer("glow", scene, {
      mainTextureFixedSize: 512,
      blurKernelSize: 64
    });
    this.glowLayer.intensity = 0.8;

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

    // Create meteor effects
    this.createMeteorSystem();

    // Setup unified animation loop
    this.setupAnimationLoop();

    return scene;
  }

  private setupAnimationLoop(): void {
    // Single animation callback for all scene animations
    this.scene.registerBeforeRender(() => {
      // Rotate sun slowly for cozy feel
      if (this.sun) {
        this.sun.rotation.y += 0.0002; // Reduced from 0.001 for calmer atmosphere
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
          
          // Planet self-rotation - slower for cozy vibe
          planet.rotation.y += 0.002; // Reduced from 0.01 for gentler rotation
        }
      });
    });
  }

  private createSun(): void {
    // Create the sun sphere with ultra high detail for premium quality
    this.sun = MeshBuilder.CreateSphere(
      "sun",
      { diameter: 8, segments: 128 }, // Increased from 64 to 128
      this.scene
    );
    this.sun.position = Vector3.Zero();

    // Create glowing sun material with texture
    const sunMaterial = new PBRMaterial("sunMaterial", this.scene);
    sunMaterial.emissiveColor = new Color3(1.0, 0.8, 0.3);
    sunMaterial.albedoColor = new Color3(1.0, 0.9, 0.4);
    
    // Create procedural texture for sun surface
    const sunTexture = new DynamicTexture("sunTexture", 512, this.scene, false);
    const ctx = sunTexture.getContext();
    
    // Draw sun surface with spots and variation
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.5, '#FFA500');
    gradient.addColorStop(1, '#FF8C00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    // Add some random darker spots for detail
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const size = Math.random() * 30 + 10;
      ctx.fillStyle = `rgba(200, 100, 0, ${Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    sunTexture.update();
    sunMaterial.emissiveTexture = sunTexture;
    
    this.sun.material = sunMaterial;

    // Add sun to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.sun);
    }
    
    // Create corona particle effect around sun
    this.createSunCorona();
    
    // Note: Sun rotation is handled in the unified animation loop
  }

  private createSunCorona(): void {
    const coronaSystem = new ParticleSystem("sunCorona", 500, this.scene);
    coronaSystem.emitter = Vector3.Zero();
    
    // Sphere emitter
    const sphereEmitter = new SphereParticleEmitter(5);
    coronaSystem.particleEmitterType = sphereEmitter;
    
    // Create particle texture
    const coronaTexture = new DynamicTexture("coronaTexture", 64, this.scene, false);
    const ctx = coronaTexture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 200, 100, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 150, 50, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    coronaTexture.update();
    
    coronaSystem.particleTexture = coronaTexture;
    coronaSystem.minSize = 0.5;
    coronaSystem.maxSize = 2;
    coronaSystem.minLifeTime = 2;
    coronaSystem.maxLifeTime = 4;
    coronaSystem.emitRate = 100;
    coronaSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
    coronaSystem.minEmitPower = 0.5;
    coronaSystem.maxEmitPower = 1;
    coronaSystem.updateSpeed = 0.02;
    
    coronaSystem.color1 = new Color4(1, 0.9, 0.5, 1);
    coronaSystem.color2 = new Color4(1, 0.7, 0.3, 1);
    coronaSystem.colorDead = new Color4(1, 0.5, 0, 0);
    
    coronaSystem.start();
  }

  private createSpaceSkybox(scene: Scene): void {
    // Create a much larger skybox for deep space feel
    const skybox = MeshBuilder.CreateBox("skybox", { size: 2000 }, scene);
    const skyboxMaterial = new StandardMaterial("skyboxMaterial", scene);
    
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.disableLighting = true;
    
    // Create a pure black space background with realistic stars
    const skyTexture = new DynamicTexture("skyTexture", 2048, scene, false);
    const ctx = skyTexture.getContext();
    
    // Pure black background for deep space
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 2048, 2048);
    
    // Add realistic star distribution with varying brightness and sizes
    // Large bright stars
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 2048;
      const brightness = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
      const size = Math.random() * 2.5 + 1.5;
      
      // Star glow
      const starGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
      starGradient.addColorStop(0, `rgba(255, 255, 255, ${brightness})`);
      starGradient.addColorStop(0.5, `rgba(255, 255, 255, ${brightness * 0.3})`);
      starGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = starGradient;
      ctx.beginPath();
      ctx.arc(x, y, size * 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Star core
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Medium stars
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 2048;
      const brightness = Math.random() * 0.4 + 0.4;
      const size = Math.random() * 1.5 + 0.8;
      
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Small distant stars
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 2048;
      const brightness = Math.random() * 0.3 + 0.2;
      const size = Math.random() * 0.8 + 0.3;
      
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add some subtle color variation to a few stars (blue, yellow tint)
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 2048;
      const size = Math.random() * 2 + 1;
      const colorChoice = Math.random();
      
      if (colorChoice < 0.5) {
        // Blue tint
        ctx.fillStyle = `rgba(200, 220, 255, 0.8)`;
      } else {
        // Yellow/warm tint
        ctx.fillStyle = `rgba(255, 245, 220, 0.8)`;
      }
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    skyTexture.update();
    skyboxMaterial.emissiveTexture = skyTexture;
    skyboxMaterial.emissiveColor = new Color3(1, 1, 1);
    
    // Try to use the environment texture if available for reflections
    try {
      const envTex = CubeTexture.CreateFromPrefilteredData("/assets/pbr/environment.env", scene);
      scene.environmentTexture = envTex;
      scene.environmentIntensity = 0.3; // Subtle environmental lighting
    } catch (e) {
      // Use our custom texture
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

  private createMeteorSystem(): void {
    // Create meteors that randomly appear and fly across the scene - slower for cozy vibe
    this.meteorInterval = window.setInterval(() => {
      this.spawnMeteor();
    }, 8000); // Increased from 3000ms to 8000ms for less frequent, more peaceful meteor activity
  }

  private spawnMeteor(): void {
    // Random starting position on the edge of the scene
    const angle = Math.random() * Math.PI * 2;
    const distance = 150;
    const startPos = new Vector3(
      Math.cos(angle) * distance,
      (Math.random() - 0.5) * 50,
      Math.sin(angle) * distance
    );

    // Target position (opposite side)
    const endPos = new Vector3(
      -startPos.x + (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 50,
      -startPos.z + (Math.random() - 0.5) * 30
    );

    // Create meteor mesh
    const meteor = MeshBuilder.CreateSphere("meteor", { diameter: 0.5, segments: 16 }, this.scene);
    meteor.position = startPos.clone();

    // Meteor material
    const meteorMat = new StandardMaterial("meteorMat", this.scene);
    meteorMat.emissiveColor = new Color3(0.8, 0.6, 0.3);
    meteorMat.diffuseColor = new Color3(0.5, 0.3, 0.2);
    meteor.material = meteorMat;

    // Create trail particle system for meteor
    const trail = new ParticleSystem("meteorTrail", 200, this.scene);
    trail.emitter = meteor;
    trail.minEmitBox = new Vector3(0, 0, 0);
    trail.maxEmitBox = new Vector3(0, 0, 0);

    // Trail texture
    const trailTexture = new DynamicTexture("trailTexture", 32, this.scene, false);
    const ctx = trailTexture.getContext();
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 200, 100, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 100, 50, 0.5)');
    gradient.addColorStop(1, 'rgba(200, 50, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    trailTexture.update();

    trail.particleTexture = trailTexture;
    trail.minSize = 0.3;
    trail.maxSize = 1.2;
    trail.minLifeTime = 0.5;
    trail.maxLifeTime = 1.5;
    trail.emitRate = 100;
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    trail.gravity = new Vector3(0, 0, 0);
    trail.direction1 = new Vector3(-1, 0, 0);
    trail.direction2 = new Vector3(-1, 0, 0);
    trail.minEmitPower = 0.2;
    trail.maxEmitPower = 0.5;
    trail.updateSpeed = 0.02;

    trail.color1 = new Color4(1, 0.8, 0.4, 1);
    trail.color2 = new Color4(1, 0.5, 0.2, 1);
    trail.colorDead = new Color4(0.5, 0.2, 0, 0);

    trail.start();
    this.meteorParticleSystems.push(trail);

    // Animate meteor movement
    const distance_total = Vector3.Distance(startPos, endPos);
    const speed = 2; // Units per second
    const duration = (distance_total / speed) * 1000; // Convert to milliseconds

    // Create animation
    const animKeys = [];
    animKeys.push({ frame: 0, value: startPos });
    animKeys.push({ frame: 60, value: endPos });

    const anim = new Animation(
      "meteorAnim",
      "position",
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    anim.setKeys(animKeys);
    meteor.animations.push(anim);

    // Run animation
    this.scene.beginAnimation(meteor, 0, 60, false, 1, () => {
      // Cleanup after animation
      trail.stop();
      const timeoutId = window.setTimeout(() => {
        meteor.dispose();
        trail.dispose();
        const index = this.meteorParticleSystems.indexOf(trail);
        if (index > -1) {
          this.meteorParticleSystems.splice(index, 1);
        }
      }, 2000);
      this.meteorTimeouts.push(timeoutId);
    });
  }

  private createInitialPlanets(): void {
    // Create planets with orbital parameters (slower speeds for cozy vibe)
    const initialPlanets = [
      { orbitRadius: 15, color: "#8B7355", size: 1.8, speed: 0.002, name: "Mercury" },
      { orbitRadius: 22, color: "#FFA54F", size: 2.3, speed: 0.0016, name: "Venus" },
      { orbitRadius: 30, color: "#4169E1", size: 2.5, speed: 0.0013, name: "Earth" },
      { orbitRadius: 38, color: "#CD5C5C", size: 2.0, speed: 0.0010, name: "Mars" },
      { orbitRadius: 55, color: "#DAA520", size: 4.5, speed: 0.0007, name: "Jupiter" },
      { orbitRadius: 70, color: "#F4A460", size: 4.0, speed: 0.0005, name: "Saturn" },
      { orbitRadius: 85, color: "#4682B4", size: 3.2, speed: 0.0004, name: "Uranus" },
      { orbitRadius: 100, color: "#1E90FF", size: 3.0, speed: 0.0003, name: "Neptune" },
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
    // Create planet sphere with ULTRA HIGH detail for Unreal Engine 5 style appearance
    const planet = MeshBuilder.CreateSphere(
      id,
      { diameter: data.size, segments: 256 }, // Increased to 256 for ultra high poly look
      this.scene
    );
    planet.position = new Vector3(data.position.x, data.position.y, data.position.z);
    
    // Ensure planet is pickable
    planet.isPickable = true;

    // Enhanced PBR Material for ultra-realistic Unreal Engine 5 style appearance
    const material = new PBRMaterial(`mat_${id}`, this.scene);
    
    // Create procedural texture for planet surface
    const planetTexture = this.createPlanetTexture(data.name, data.color);
    material.albedoTexture = planetTexture;
    
    // Base color
    material.albedoColor = Color3.FromHexString(data.color);
    
    // Enhanced metallic and roughness for photorealistic surface
    material.metallic = 0.02;
    material.roughness = 0.85;
    
    // Add bump map for surface detail
    const bumpTexture = this.createBumpTexture();
    material.bumpTexture = bumpTexture;
    material.bumpTexture.level = 1.5; // More pronounced surface detail
    
    // Subtle emissive for visibility
    material.emissiveColor = Color3.FromHexString(data.color).scale(0.015);
    
    // Enhanced specular highlights from sun for glossy appearance
    material.specularIntensity = 0.6;
    
    // Enable advanced lighting effects
    material.directIntensity = 1.2;
    material.environmentIntensity = 0.4;
    material.microSurface = 0.85;
    
    // Enable subsurface scattering for certain planet types
    if (data.name === "Earth" || data.name === "Mars") {
      material.subSurface.isTranslucencyEnabled = true;
      material.subSurface.translucencyIntensity = 0.2;
    }
    
    planet.material = material;

    // Store actual radius for later use
    data.actualRadius = data.size / 2;

    // Add planet-specific visual effects
    this.addPlanetSpecificEffects(planet, data.name, data.actualRadius);

    // Store orbital parameters in the data map (will be used by unified animation loop)
    data.orbitRadius = data.orbitRadius || 0;
    data.orbitSpeed = data.orbitSpeed || 0;
    data.orbitAngle = data.orbitAngle || 0;

    // Create orbital path visualization (subtle ring) - horizontal plane to match planet movement
    if (data.orbitRadius > 0) {
      const orbitPath = MeshBuilder.CreateTorus(
        `orbit_${id}`,
        { 
          diameter: data.orbitRadius * 2, 
          thickness: 0.05, 
          tessellation: 128 // Increased from 64 for smoother appearance
        },
        this.scene
      );
      orbitPath.position = Vector3.Zero();
      // No rotation - torus is already horizontal by default, matching XZ plane movement
      
      const orbitMaterial = new StandardMaterial(`orbitMat_${id}`, this.scene);
      orbitMaterial.emissiveColor = new Color3(0.08, 0.08, 0.12);
      orbitMaterial.alpha = 0.15; // Slightly more subtle
      orbitMaterial.wireframe = false;
      orbitPath.material = orbitMaterial;
      orbitPath.isPickable = false; // Don't interfere with planet picking
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

  private createPlanetTexture(planetName: string, baseColor: string): DynamicTexture {
    const texture = new DynamicTexture(`planetTex_${planetName}`, 1024, this.scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    
    // Base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Add surface variation based on planet type
    switch(planetName) {
      case "Mercury":
        // Rocky surface with craters
        this.addCraters(ctx, 50, baseColor);
        break;
      case "Venus":
        // Thick clouds
        this.addClouds(ctx, '#FFA54F', 30);
        break;
      case "Earth":
        // Continents and oceans
        this.addContinents(ctx);
        break;
      case "Mars":
        // Red desert with darker regions
        this.addMarsFeatures(ctx);
        break;
      case "Jupiter":
        // Gas bands
        this.addGasBands(ctx, '#DAA520', '#B8860B');
        break;
      case "Saturn":
        // Similar gas bands but lighter
        this.addGasBands(ctx, '#F4A460', '#DEB887');
        break;
      case "Uranus":
        // Icy blue with subtle bands
        this.addGasBands(ctx, '#4682B4', '#5F9EA0');
        break;
      case "Neptune":
        // Deep blue with storm spots
        this.addStormSpots(ctx);
        break;
    }
    
    texture.update();
    return texture;
  }

  private createBumpTexture(): DynamicTexture {
    const texture = new DynamicTexture("bumpTex", 512, this.scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    
    // Create noise pattern for bumps
    for (let x = 0; x < 512; x += 4) {
      for (let y = 0; y < 512; y += 4) {
        const brightness = Math.random() * 100 + 100;
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    
    texture.update();
    return texture;
  }

  private addCraters(ctx: CanvasRenderingContext2D, count: number, baseColor: string): void {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 30 + 10;
      
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, '#3a3a3a');
      gradient.addColorStop(0.7, '#5a5a5a');
      gradient.addColorStop(1, baseColor);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private addClouds(ctx: CanvasRenderingContext2D, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 100 + 50;
      
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 200, 0.15)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private addContinents(ctx: CanvasRenderingContext2D): void {
    // Ocean base
    ctx.fillStyle = '#1E90FF';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Add continents
    ctx.fillStyle = '#228B22';
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const width = Math.random() * 200 + 100;
      const height = Math.random() * 150 + 80;
      
      ctx.beginPath();
      ctx.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add clouds
    this.addClouds(ctx, '#FFFFFF', 40);
  }

  private addMarsFeatures(ctx: CanvasRenderingContext2D): void {
    // Add darker regions
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 100 + 50;
      
      ctx.fillStyle = `rgba(139, 69, 19, ${Math.random() * 0.3 + 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private addGasBands(ctx: CanvasRenderingContext2D, color1: string, color2: string): void {
    const bandCount = 15;
    const bandHeight = 1024 / bandCount;
    
    for (let i = 0; i < bandCount; i++) {
      const color = i % 2 === 0 ? color1 : color2;
      ctx.fillStyle = color;
      ctx.fillRect(0, i * bandHeight, 1024, bandHeight);
      
      // Add some turbulence
      for (let j = 0; j < 5; j++) {
        const x = Math.random() * 1024;
        const y = i * bandHeight + Math.random() * bandHeight;
        const size = Math.random() * 50 + 20;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private addStormSpots(ctx: CanvasRenderingContext2D): void {
    // Add storm features
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 60 + 40;
      
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, '#00008B');
      gradient.addColorStop(0.5, '#1E90FF');
      gradient.addColorStop(1, 'rgba(30, 144, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private addPlanetSpecificEffects(planet: Mesh, planetName: string, radius: number): void {
    switch(planetName) {
      case "Mercury":
        // Hot surface shimmer - no atmosphere
        break;
      case "Venus":
        // Thick atmosphere glow
        this.addAtmosphereGlow(planet, new Color3(1, 0.8, 0.4), 1.3, radius);
        this.addCloudParticles(planet, new Color3(0.9, 0.8, 0.5), radius);
        break;
      case "Earth":
        // Blue atmosphere
        this.addAtmosphereGlow(planet, new Color3(0.3, 0.5, 1), 1.2, radius);
        this.addCloudParticles(planet, new Color3(1, 1, 1), radius);
        break;
      case "Mars":
        // Thin reddish atmosphere with dust
        this.addAtmosphereGlow(planet, new Color3(0.8, 0.4, 0.3), 1.15, radius);
        this.addDustParticles(planet, radius);
        break;
      case "Jupiter":
        // Gas giant with storm particles
        this.addAtmosphereGlow(planet, new Color3(0.9, 0.7, 0.4), 1.25, radius);
        this.addStormParticles(planet, radius);
        break;
      case "Saturn":
        // Rings!
        this.addRings(planet, radius);
        this.addAtmosphereGlow(planet, new Color3(0.95, 0.8, 0.6), 1.2, radius);
        break;
      case "Uranus":
        // Icy blue glow
        this.addAtmosphereGlow(planet, new Color3(0.4, 0.7, 0.9), 1.18, radius);
        break;
      case "Neptune":
        // Deep blue with active atmosphere
        this.addAtmosphereGlow(planet, new Color3(0.2, 0.5, 1), 1.2, radius);
        this.addStormParticles(planet, radius);
        break;
    }
  }

  private addAtmosphereGlow(planet: Mesh, color: Color3, scale: number, radius: number): void {
    const atmosphere = MeshBuilder.CreateSphere(
      `atmo_${planet.name}`,
      { diameter: radius * 2 * scale, segments: 32 },
      this.scene
    );
    atmosphere.parent = planet;
    atmosphere.position = Vector3.Zero();
    atmosphere.isPickable = false; // Don't block planet picking
    
    const atmoMat = new StandardMaterial(`atmoMat_${planet.name}`, this.scene);
    atmoMat.diffuseColor = new Color3(0, 0, 0);
    atmoMat.emissiveColor = color.scale(0.3);
    atmoMat.alpha = 0.2;
    atmoMat.backFaceCulling = false;
    atmosphere.material = atmoMat;
    
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(atmosphere);
    }
  }

  private addCloudParticles(planet: Mesh, color: Color3, radius: number): void {
    const clouds = new ParticleSystem(`clouds_${planet.name}`, 100, this.scene);
    clouds.emitter = planet;
    
    const sphereEmitter = new SphereParticleEmitter(radius * 0.55);
    clouds.particleEmitterType = sphereEmitter;
    
    // Cloud texture
    const cloudTexture = new DynamicTexture("cloudTex", 32, this.scene, false);
    const ctx = cloudTexture.getContext();
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    cloudTexture.update();
    
    clouds.particleTexture = cloudTexture;
    clouds.minSize = 0.3;
    clouds.maxSize = 0.8;
    clouds.minLifeTime = 5;
    clouds.maxLifeTime = 10;
    clouds.emitRate = 10;
    clouds.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    clouds.minEmitPower = 0;
    clouds.maxEmitPower = 0;
    clouds.updateSpeed = 0.005;
    
    clouds.color1 = new Color4(color.r, color.g, color.b, 0.5);
    clouds.color2 = new Color4(color.r, color.g, color.b, 0.3);
    clouds.colorDead = new Color4(color.r, color.g, color.b, 0);
    
    clouds.start();
  }

  private addDustParticles(planet: Mesh, radius: number): void {
    const dust = new ParticleSystem(`dust_${planet.name}`, 80, this.scene);
    dust.emitter = planet;
    
    const sphereEmitter = new SphereParticleEmitter(radius * 0.55);
    dust.particleEmitterType = sphereEmitter;
    
    // Dust texture
    const dustTexture = new DynamicTexture("dustTex", 16, this.scene, false);
    const ctx = dustTexture.getContext();
    ctx.fillStyle = 'rgba(200, 100, 50, 0.8)';
    ctx.fillRect(0, 0, 16, 16);
    dustTexture.update();
    
    dust.particleTexture = dustTexture;
    dust.minSize = 0.1;
    dust.maxSize = 0.3;
    dust.minLifeTime = 3;
    dust.maxLifeTime = 6;
    dust.emitRate = 15;
    dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    dust.minEmitPower = 0.1;
    dust.maxEmitPower = 0.2;
    dust.updateSpeed = 0.01;
    
    dust.color1 = new Color4(0.8, 0.4, 0.2, 0.6);
    dust.color2 = new Color4(0.7, 0.3, 0.1, 0.4);
    dust.colorDead = new Color4(0.5, 0.2, 0, 0);
    
    dust.start();
  }

  private addStormParticles(planet: Mesh, radius: number): void {
    const storm = new ParticleSystem(`storm_${planet.name}`, 50, this.scene);
    storm.emitter = planet;
    
    const sphereEmitter = new SphereParticleEmitter(radius * 0.52);
    storm.particleEmitterType = sphereEmitter;
    
    // Storm texture
    const stormTexture = new DynamicTexture("stormTex", 32, this.scene, false);
    const ctx = stormTexture.getContext();
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(200, 200, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(150, 150, 200, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    stormTexture.update();
    
    storm.particleTexture = stormTexture;
    storm.minSize = 0.4;
    storm.maxSize = 1.0;
    storm.minLifeTime = 4;
    storm.maxLifeTime = 8;
    storm.emitRate = 8;
    storm.blendMode = ParticleSystem.BLENDMODE_ADD;
    storm.minEmitPower = 0;
    storm.maxEmitPower = 0.1;
    storm.updateSpeed = 0.01;
    
    storm.color1 = new Color4(1, 1, 1, 0.6);
    storm.color2 = new Color4(0.8, 0.8, 1, 0.4);
    storm.colorDead = new Color4(0.5, 0.5, 0.7, 0);
    
    storm.start();
  }

  private addRings(planet: Mesh, radius: number): void {
    // Create Saturn's rings
    const ring = MeshBuilder.CreateTorus(
      `ring_${planet.name}`,
      {
        diameter: radius * 2 * 3,
        thickness: 0.3,
        tessellation: 128
      },
      this.scene
    );
    ring.parent = planet;
    ring.position = Vector3.Zero();
    ring.rotation.x = Math.PI / 2 + 0.2; // Slightly tilted
    ring.isPickable = false; // Don't block planet picking
    
    const ringMat = new StandardMaterial(`ringMat_${planet.name}`, this.scene);
    
    // Create ring texture
    const ringTexture = new DynamicTexture("ringTex", 256, this.scene, false);
    const ctx = ringTexture.getContext();
    
    // Create banded rings
    for (let i = 0; i < 256; i++) {
      const brightness = Math.sin(i * 0.1) * 50 + 150;
      const alpha = Math.random() * 0.3 + 0.5;
      ctx.fillStyle = `rgba(${brightness}, ${brightness - 20}, ${brightness - 40}, ${alpha})`;
      ctx.fillRect(i, 0, 1, 256);
    }
    ringTexture.update();
    
    ringMat.diffuseTexture = ringTexture;
    ringMat.emissiveColor = new Color3(0.3, 0.25, 0.2);
    ringMat.alpha = 0.7;
    ringMat.backFaceCulling = false;
    ring.material = ringMat;
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
    plane.isPickable = false; // Don't block planet picking

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
    // Clear meteor spawning interval
    if (this.meteorInterval !== null) {
      clearInterval(this.meteorInterval);
      this.meteorInterval = null;
    }
    
    // Clear all pending meteor timeouts
    this.meteorTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.meteorTimeouts = [];
    
    // Stop and dispose meteor particle systems
    this.meteorParticleSystems.forEach(system => {
      system.stop();
      system.dispose();
    });
    this.meteorParticleSystems = [];
    
    // Unsubscribe from all Firebase subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    // Dispose Babylon.js resources
    this.scene.dispose();
    this.engine.dispose();
  }
}
