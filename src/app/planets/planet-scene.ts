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
  AbstractMesh,
  PointerEventTypes,
  PBRSubSurfaceConfiguration
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
  orbitInclination?: number; // Inclination angle for varied orbital planes
  shape?: 'sphere' | 'cube' | 'torus' | 'octahedron' | 'dodecahedron' | 'icosahedron' | 'cylinder'; // Planet shape
}

export interface GalaxyData {
  id: string;
  name: string;
  description: string;
  sunColor: string;
  sunSize: number;
  planets: Array<{
    name: string;
    description: string;
    color: string;
    size: number;
    orbitRadius: number;
    speed: number;
    inclination: number;
    shape?: 'sphere' | 'cube' | 'torus' | 'octahedron' | 'dodecahedron' | 'icosahedron' | 'cylinder';
  }>;
}

export enum CameraPreset {
  SPAWN_POINT = 'spawn',
  OVERVIEW = 'overview',
  FOLLOW_SUN = 'sun',
  FOLLOW_PLANET = 'planet'
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
  private currentPreset: CameraPreset = CameraPreset.SPAWN_POINT;
  private followingPlanet: Mesh | null = null;
  private cameraPresetUI: HTMLDivElement | null = null;
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
  private cameraControlsAttached: boolean = false; // Track camera control state
  private galaxies: GalaxyData[] = [];
  private currentGalaxyIndex: number = 0;
  private orbitPaths: Map<string, Mesh> = new Map(); // Track orbit paths for cleanup
  
  // Audio management
  private backgroundMusic: HTMLAudioElement | null = null;
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private isMusicEnabled: boolean = true;
  private isSoundEnabled: boolean = true;
  private audioContext: AudioContext | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicGainNode: GainNode | null = null;

  constructor(private canvas: HTMLCanvasElement, private database: AngularFireDatabase) {
    this.engine = new Engine(this.canvas, true, { 
      preserveDrawingBuffer: true, 
      stencil: true,
      antialias: true // Enable hardware anti-aliasing
    });
    
    // Initialize galaxies before creating the scene
    this.initializeGalaxies();
    
    // Initialize audio
    this.initializeAudio();
    
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
    
    // Setup keyboard controls and camera presets
    this.setupKeyboardControls();
    this.setupCameraPresetUI();
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
    // Initially attach controls and track the state
    this.camera.attachControl(this.canvas, false);
    this.cameraControlsAttached = true; // Track initial state
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
    
    // Create nebula effect
    this.createNebula();

    // Load initial galaxy (Solar System)
    this.switchGalaxy(0);

    // Create meteor effects
    this.createMeteorSystem();

    // Setup unified animation loop
    this.setupAnimationLoop();
    
    // Setup pointer observable for debugging and enhanced picking
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        console.log('Pointer down on canvas');
        const pickResult = scene.pick(scene.pointerX, scene.pointerY);
        if (pickResult?.hit && pickResult.pickedMesh) {
          console.log('Picked mesh:', pickResult.pickedMesh.name);
        } else {
          console.log('No mesh picked');
        }
      }
    });

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
          
          // Calculate new position with inclination
          const inclination = data.orbitInclination || 0;
          planet.position.x = Math.cos(data.orbitAngle) * data.orbitRadius;
          planet.position.z = Math.sin(data.orbitAngle) * data.orbitRadius;
          planet.position.y = Math.sin(data.orbitAngle) * data.orbitRadius * Math.sin(inclination);
          
          // Planet self-rotation - slower for cozy vibe
          planet.rotation.y += 0.002; // Reduced from 0.01 for gentler rotation
        }
      });
      
      // Handle camera following for FOLLOW_PLANET preset
      if (this.currentPreset === CameraPreset.FOLLOW_PLANET && this.followingPlanet) {
        this.camera.setTarget(this.followingPlanet.position);
      }
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
    
    // Use solid black for the skybox - stars will be rendered via particle system
    // This is the most reliable approach that works consistently
    skyboxMaterial.emissiveColor = new Color3(0, 0, 0); // Pure black
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    
    // Try to use the environment texture if available for reflections on planets
    try {
      const envTex = CubeTexture.CreateFromPrefilteredData("/assets/pbr/environment.env", scene);
      scene.environmentTexture = envTex;
      scene.environmentIntensity = 0.3; // Subtle environmental lighting
    } catch (e) {
      // Environment texture not available, that's ok
    }
    
    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;
    skybox.isPickable = false; // Critical: Don't block planet picking!
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

  private createPlanet(id: string, data: PlanetData): Mesh {
    // Create planet mesh based on shape type (default to sphere for backward compatibility)
    const shape = data.shape || 'sphere';
    let planet: Mesh;
    
    switch(shape) {
      case 'cube':
        planet = MeshBuilder.CreateBox(
          id,
          { size: data.size },
          this.scene
        );
        break;
      case 'torus':
        planet = MeshBuilder.CreateTorus(
          id,
          { diameter: data.size, thickness: data.size * 0.3, tessellation: 64 },
          this.scene
        );
        break;
      case 'octahedron':
        planet = MeshBuilder.CreatePolyhedron(
          id,
          { type: 1, size: data.size * 0.6 },
          this.scene
        );
        break;
      case 'dodecahedron':
        planet = MeshBuilder.CreatePolyhedron(
          id,
          { type: 2, size: data.size * 0.6 },
          this.scene
        );
        break;
      case 'icosahedron':
        planet = MeshBuilder.CreatePolyhedron(
          id,
          { type: 0, size: data.size * 0.6 },
          this.scene
        );
        break;
      case 'cylinder':
        planet = MeshBuilder.CreateCylinder(
          id,
          { diameter: data.size, height: data.size * 1.2, tessellation: 32 },
          this.scene
        );
        break;
      case 'sphere':
      default:
        // Create planet sphere with ULTRA HIGH detail for Unreal Engine 5 style appearance
        planet = MeshBuilder.CreateSphere(
          id,
          { diameter: data.size, segments: 256 }, // Increased to 256 for ultra high poly look
          this.scene
        );
        break;
    }
    
    planet.position = new Vector3(data.position.x, data.position.y, data.position.z);
    
    // Ensure planet is pickable
    planet.isPickable = true;

    // Enhanced PBR Material for ultra-realistic Unreal Engine 5 style appearance
    const material = new PBRMaterial(`mat_${id}`, this.scene);
    
    // Create procedural texture for planet surface
    const planetTexture = this.createPlanetTexture(data.name, data.color);
    material.albedoTexture = planetTexture;
    
    // Base color - enhanced vibrance
    material.albedoColor = Color3.FromHexString(data.color);
    
    // Enhanced metallic and roughness for photorealistic surface
    material.metallic = 0.02;
    material.roughness = 0.85;
    
    // Add bump map for surface detail
    const bumpTexture = this.createBumpTexture();
    material.bumpTexture = bumpTexture;
    material.bumpTexture.level = 1.5; // More pronounced surface detail
    
    // Enhanced emissive for stronger glow effect
    material.emissiveColor = Color3.FromHexString(data.color).scale(0.08);
    
    // Enhanced specular highlights from sun for glossy appearance
    material.specularIntensity = 0.6;
    
    // Enable advanced lighting effects
    material.directIntensity = 1.2;
    material.environmentIntensity = 0.4;
    material.microSurface = 0.85;
    
    // Ensure planet is fully opaque - no transparency
    material.alpha = 1.0;
    material.alphaMode = Engine.ALPHA_DISABLE;
    material.transparencyMode = null;
    
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
    
    // Add orbital particle trail for all planets with orbits
    if (data.orbitRadius && data.orbitRadius > 0) {
      this.addOrbitalTrail(planet, data.color, id);
    }

    // Store orbital parameters in the data map (will be used by unified animation loop)
    data.orbitRadius = data.orbitRadius || 0;
    data.orbitSpeed = data.orbitSpeed || 0;
    data.orbitAngle = data.orbitAngle || 0;
    data.orbitInclination = data.orbitInclination || 0;

    // Create orbital path visualization with inclination
    if (data.orbitRadius > 0) {
      this.createInclinedOrbitPath(id, data.orbitRadius, data.orbitInclination || 0);
    }

    // Note: Orbital motion and rotation handled in unified animation loop

    // Create name label
    this.createNameLabel(planet, data.name);

    // Make it clickable with enhanced picking
    planet.actionManager = new ActionManager(this.scene);
    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        console.log(`Planet clicked: ${data.name} (${id})`);
        this.onPlanetClick(planet, id);
      })
    );
    
    // Also add a hover effect to show the planet is interactive
    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        this.playSound('hover');
        planet.scaling = new Vector3(1.05, 1.05, 1.05);
      })
    );
    
    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
        planet.scaling = new Vector3(1, 1, 1);
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
    // Add enhanced glow for non-sphere shapes
    const planetData = Array.from(this.planetDataMap.values()).find(p => p.name === planetName);
    if (planetData?.shape && planetData.shape !== 'sphere') {
      // Geometric shapes get extra glow
      if (this.glowLayer) {
        this.glowLayer.customEmissiveColorSelector = (mesh) => {
          if (mesh === planet) {
            return Color3.FromHexString(planetData.color).scale(0.5);
          }
          return Color3.Black();
        };
      }
    }
    
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
      default:
        // For new galaxies' planets, add subtle atmosphere based on their properties
        if (planetName.includes('Cubix') || planetName.includes('Octara') || planetName.includes('Dodeca') || 
            planetName.includes('Icosa') || planetName.includes('Cylios')) {
          // Geometric/tech worlds get energy field effect
          this.addEnergyField(planet, radius);
        } else if (planetData) {
          // Add subtle glow based on planet color
          const planetColor = Color3.FromHexString(planetData.color);
          this.addAtmosphereGlow(planet, planetColor, 1.15, radius);
        }
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
    // Enhanced emissive for stronger glow
    atmoMat.emissiveColor = color.scale(0.6);
    atmoMat.alpha = 0.3;
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

  private addEnergyField(planet: Mesh, radius: number): void {
    // Create energy field effect for geometric/tech planets
    const field = MeshBuilder.CreateSphere(
      `field_${planet.name}`,
      { diameter: radius * 2 * 1.4, segments: 16 },
      this.scene
    );
    field.parent = planet;
    field.position = Vector3.Zero();
    field.isPickable = false;
    
    const fieldMat = new StandardMaterial(`fieldMat_${planet.name}`, this.scene);
    fieldMat.diffuseColor = new Color3(0, 0, 0);
    fieldMat.emissiveColor = new Color3(0, 0.8, 1);
    fieldMat.alpha = 0.15;
    fieldMat.wireframe = true;
    fieldMat.backFaceCulling = false;
    field.material = fieldMat;
    
    // Add pulsing animation
    this.scene.registerBeforeRender(() => {
      field.scaling.x = 1 + Math.sin(Date.now() * 0.001) * 0.1;
      field.scaling.y = 1 + Math.sin(Date.now() * 0.001) * 0.1;
      field.scaling.z = 1 + Math.sin(Date.now() * 0.001) * 0.1;
      field.rotation.y += 0.01;
    });
    
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(field);
    }
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
    this.playSound('click');
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

      this.playSound('modal-open');
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
        this.playSound('modal-close');
        if (modal) modal.style.display = 'none';
      });
    }

    window.addEventListener('click', (event) => {
      if (event.target === modal) {
        this.playSound('modal-close');
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

  private initializeGalaxies(): void {
    // Our Solar System
    this.galaxies.push({
      id: 'solar_system',
      name: 'Solar System',
      description: 'Our home galaxy with familiar planets',
      sunColor: '#FFA500',
      sunSize: 8,
      planets: [
        { name: "Mercury", description: "Closest to the sun", color: "#E8B4A0", size: 1.8, orbitRadius: 15, speed: 0.002, inclination: 0.12 },
        { name: "Venus", description: "The morning star", color: "#FFB84D", size: 2.3, orbitRadius: 22, speed: 0.0016, inclination: 0.06 },
        { name: "Earth", description: "Our home", color: "#4A9EFF", size: 2.5, orbitRadius: 30, speed: 0.0013, inclination: 0 },
        { name: "Mars", description: "The red planet", color: "#FF6B4D", size: 2.0, orbitRadius: 38, speed: 0.0010, inclination: 0.03 },
        { name: "Jupiter", description: "Gas giant", color: "#FFD700", size: 4.5, orbitRadius: 55, speed: 0.0007, inclination: 0.02 },
        { name: "Saturn", description: "Ringed beauty", color: "#FFE4B5", size: 4.0, orbitRadius: 70, speed: 0.0005, inclination: 0.04 },
        { name: "Uranus", description: "Ice giant", color: "#87CEEB", size: 3.2, orbitRadius: 85, speed: 0.0004, inclination: 0.013 },
        { name: "Neptune", description: "Deep blue", color: "#4169FF", size: 3.0, orbitRadius: 100, speed: 0.0003, inclination: 0.03 }
      ]
    });

    // Zephyria - A mystical galaxy
    this.galaxies.push({
      id: 'zephyria',
      name: 'Zephyria',
      description: 'A mystical galaxy with crystalline worlds',
      sunColor: '#00FFFF',
      sunSize: 10,
      planets: [
        { name: "Crystalia", description: "A world of pure crystal", color: "#E0BBE4", size: 2.0, orbitRadius: 20, speed: 0.0025, inclination: 0.15 },
        { name: "Luminos", description: "Glowing with ethereal light", color: "#FFD700", size: 2.8, orbitRadius: 28, speed: 0.002, inclination: 0.08 },
        { name: "Nebulae", description: "Wrapped in colorful mists", color: "#FF69B4", size: 3.5, orbitRadius: 40, speed: 0.0015, inclination: 0.05 },
        { name: "Prisma", description: "Refracts starlight beautifully", color: "#7FFFD4", size: 2.2, orbitRadius: 52, speed: 0.0012, inclination: 0.1 },
        { name: "Celestia", description: "Home to ancient star beings", color: "#DDA0DD", size: 4.0, orbitRadius: 68, speed: 0.0008, inclination: 0.07 },
        { name: "Auroris", description: "Dancing aurora skies", color: "#00FF7F", size: 3.0, orbitRadius: 85, speed: 0.0006, inclination: 0.12 }
      ]
    });

    // Infernia - A fiery galaxy
    this.galaxies.push({
      id: 'infernia',
      name: 'Infernia',
      description: 'A galaxy of volcanic and fiery worlds',
      sunColor: '#FF4500',
      sunSize: 12,
      planets: [
        { name: "Pyros", description: "Eternal volcanic eruptions", color: "#FF0000", size: 2.5, orbitRadius: 18, speed: 0.003, inclination: 0.2 },
        { name: "Emberon", description: "Covered in burning embers", color: "#FF6347", size: 2.0, orbitRadius: 26, speed: 0.0022, inclination: 0.1 },
        { name: "Magmara", description: "Rivers of flowing magma", color: "#FF4500", size: 3.2, orbitRadius: 35, speed: 0.0018, inclination: 0.06 },
        { name: "Scorchia", description: "Scorched by twin suns", color: "#FFD700", size: 2.8, orbitRadius: 48, speed: 0.0014, inclination: 0.09 },
        { name: "Furnaxis", description: "A giant forge world", color: "#FF8C00", size: 5.0, orbitRadius: 65, speed: 0.0009, inclination: 0.04 },
        { name: "Cinderis", description: "Ash-covered wasteland", color: "#DC143C", size: 2.5, orbitRadius: 80, speed: 0.0007, inclination: 0.11 },
        { name: "Blazeon", description: "Eternal solar flares", color: "#FF1493", size: 3.5, orbitRadius: 95, speed: 0.0005, inclination: 0.08 }
      ]
    });

    // Mechanis - A technological galaxy with geometric worlds
    this.galaxies.push({
      id: 'mechanis',
      name: 'Mechanis',
      description: 'A galaxy of geometric and technological worlds',
      sunColor: '#00FF00',
      sunSize: 9,
      planets: [
        { name: "Cubix", description: "A perfect cubic world", color: "#4169E1", size: 2.2, orbitRadius: 20, speed: 0.0024, inclination: 0.1, shape: 'cube' },
        { name: "Torusphere", description: "Ringed artificial world", color: "#32CD32", size: 2.5, orbitRadius: 30, speed: 0.0019, inclination: 0.05, shape: 'torus' },
        { name: "Octara", description: "Eight-sided crystal formation", color: "#FF6347", size: 2.0, orbitRadius: 42, speed: 0.0015, inclination: 0.12, shape: 'octahedron' },
        { name: "Dodeca", description: "Twelve-faced geometric marvel", color: "#FFD700", size: 2.8, orbitRadius: 56, speed: 0.0011, inclination: 0.08, shape: 'dodecahedron' },
        { name: "Icosa", description: "Twenty-sided engineering wonder", color: "#00CED1", size: 3.2, orbitRadius: 72, speed: 0.0008, inclination: 0.06, shape: 'icosahedron' },
        { name: "Cylios", description: "Rotating cylindrical habitat", color: "#9370DB", size: 2.6, orbitRadius: 88, speed: 0.0006, inclination: 0.14, shape: 'cylinder' }
      ]
    });

    // Aquaterra - An ocean-themed galaxy
    this.galaxies.push({
      id: 'aquaterra',
      name: 'Aquaterra',
      description: 'A galaxy of water worlds and aquatic paradises',
      sunColor: '#1E90FF',
      sunSize: 8.5,
      planets: [
        { name: "Neptara", description: "Endless ocean planet", color: "#1E90FF", size: 2.4, orbitRadius: 22, speed: 0.0023, inclination: 0.09, shape: 'sphere' },
        { name: "Coralys", description: "Living reef world", color: "#FF7F50", size: 2.1, orbitRadius: 32, speed: 0.0018, inclination: 0.11, shape: 'icosahedron' },
        { name: "Tidalis", description: "World of eternal tides", color: "#4682B4", size: 2.9, orbitRadius: 44, speed: 0.0014, inclination: 0.07, shape: 'sphere' },
        { name: "Marinius", description: "Deep trench planet", color: "#000080", size: 3.5, orbitRadius: 58, speed: 0.001, inclination: 0.05, shape: 'octahedron' },
        { name: "Vaporis", description: "Steam and mist covered", color: "#B0E0E6", size: 2.3, orbitRadius: 74, speed: 0.0007, inclination: 0.13, shape: 'sphere' },
        { name: "Abyssus", description: "Mysterious underwater caverns", color: "#191970", size: 4.0, orbitRadius: 92, speed: 0.0005, inclination: 0.1, shape: 'dodecahedron' }
      ]
    });

    // Verdantia - A lush, bio-diverse galaxy
    this.galaxies.push({
      id: 'verdantia',
      name: 'Verdantia',
      description: 'A galaxy teeming with exotic life and lush forests',
      sunColor: '#ADFF2F',
      sunSize: 7.5,
      planets: [
        { name: "Floralis", description: "Covered in giant flowers", color: "#FF1493", size: 2.3, orbitRadius: 19, speed: 0.0026, inclination: 0.1, shape: 'sphere' },
        { name: "Arboria", description: "World of massive trees", color: "#228B22", size: 2.7, orbitRadius: 28, speed: 0.002, inclination: 0.08, shape: 'cylinder' },
        { name: "Fungara", description: "Bioluminescent mushroom forests", color: "#9370DB", size: 2.0, orbitRadius: 39, speed: 0.0016, inclination: 0.12, shape: 'torus' },
        { name: "Vineworld", description: "Interconnected vine networks", color: "#32CD32", size: 3.3, orbitRadius: 52, speed: 0.0012, inclination: 0.06, shape: 'icosahedron' },
        { name: "Junglios", description: "Dense rainforest planet", color: "#006400", size: 3.8, orbitRadius: 67, speed: 0.0009, inclination: 0.09, shape: 'sphere' },
        { name: "Pollenis", description: "Eternal spring with blooming meadows", color: "#FFB6C1", size: 2.5, orbitRadius: 84, speed: 0.0006, inclination: 0.11, shape: 'octahedron' },
        { name: "Bioforge", description: "Living organism planet", color: "#7FFF00", size: 4.2, orbitRadius: 98, speed: 0.0004, inclination: 0.07, shape: 'dodecahedron' }
      ]
    });
  }

  private switchGalaxy(index: number): void {
    if (index < 0 || index >= this.galaxies.length) return;
    
    this.playSound('galaxy-switch');
    this.currentGalaxyIndex = index;
    
    // Clear existing planets and orbit paths
    this.clearGalaxy();
    
    // Update sun
    this.updateSun(this.galaxies[index]);
    
    // Create planets from current galaxy
    this.createGalaxyPlanets(this.galaxies[index]);
    
    // Update UI
    this.updateGalaxyUI();
    
    // Reset camera to spawn point
    this.setCameraPreset(CameraPreset.SPAWN_POINT);
  }

  private clearGalaxy(): void {
    // Dispose all planets
    this.planets.forEach(planet => {
      planet.dispose();
    });
    this.planets.clear();
    this.planetDataMap.clear();
    
    // Dispose all orbit paths
    this.orbitPaths.forEach(path => {
      path.dispose();
    });
    this.orbitPaths.clear();
    
    // Clear following planet reference
    this.followingPlanet = null;
  }

  private updateSun(galaxy: GalaxyData): void {
    if (!this.sun) return;
    
    const material = this.sun.material as PBRMaterial;
    if (material) {
      const sunColor = Color3.FromHexString(galaxy.sunColor);
      material.emissiveColor = sunColor;
      material.albedoColor = sunColor.scale(0.8);
    }
    
    // Update sun size
    this.sun.scaling = new Vector3(
      galaxy.sunSize / 8,
      galaxy.sunSize / 8,
      galaxy.sunSize / 8
    );
  }

  private createGalaxyPlanets(galaxy: GalaxyData): void {
    galaxy.planets.forEach((planetConfig, index) => {
      const planetId = `planet_${index}`;
      const startAngle = (Math.PI * 2 * index) / galaxy.planets.length;
      
      this.createPlanet(planetId, {
        id: planetId,
        name: planetConfig.name,
        description: planetConfig.description,
        position: { 
          x: Math.cos(startAngle) * planetConfig.orbitRadius, 
          y: Math.sin(startAngle) * planetConfig.orbitRadius * Math.sin(planetConfig.inclination), 
          z: Math.sin(startAngle) * planetConfig.orbitRadius 
        },
        color: planetConfig.color,
        size: planetConfig.size,
        orbitRadius: planetConfig.orbitRadius,
        orbitSpeed: planetConfig.speed,
        orbitAngle: startAngle,
        orbitInclination: planetConfig.inclination,
        shape: planetConfig.shape || 'sphere'
      });
    });
  }

  private updateGalaxyUI(): void {
    const galaxyElement = document.getElementById('currentGalaxy');
    if (galaxyElement) {
      const galaxy = this.galaxies[this.currentGalaxyIndex];
      galaxyElement.textContent = galaxy.name;
    }
  }

  private createInclinedOrbitPath(id: string, orbitRadius: number, inclination: number): void {
    // Create a torus for the orbit path
    const orbitPath = MeshBuilder.CreateTorus(
      `orbit_${id}`,
      { 
        diameter: orbitRadius * 2, 
        thickness: 0.05, 
        tessellation: 128
      },
      this.scene
    );
    orbitPath.position = Vector3.Zero();
    
    // Rotate the orbit path to match the inclined orbital plane
    // The torus starts in XZ plane, we need to tilt it around the X-axis
    // to create the inclined orbit that matches planet Y movement
    orbitPath.rotation.x = inclination;
    
    // Note: The planet moves in an ellipse where:
    // x = cos(angle) * radius
    // z = sin(angle) * radius  
    // y = sin(angle) * radius * sin(inclination)
    // The torus visualization approximates this 3D path
    
    const orbitMaterial = new StandardMaterial(`orbitMat_${id}`, this.scene);
    orbitMaterial.emissiveColor = new Color3(0.08, 0.08, 0.12);
    orbitMaterial.alpha = 0.15;
    orbitMaterial.wireframe = false;
    orbitPath.material = orbitMaterial;
    orbitPath.isPickable = false;
    
    // Store orbit path for later cleanup
    this.orbitPaths.set(id, orbitPath);
  }

  private setupKeyboardControls(): void {
    // Store handler reference for cleanup
    this.keyboardHandler = (event: KeyboardEvent) => {
      switch(event.key) {
        case '1':
          this.setCameraPreset(CameraPreset.SPAWN_POINT);
          break;
        case '2':
          this.setCameraPreset(CameraPreset.OVERVIEW);
          break;
        case '3':
          this.setCameraPreset(CameraPreset.FOLLOW_SUN);
          break;
        case '4': // Follow Mercury (planet_0)
        case '5': // Follow Venus (planet_1)
        case '6': // Follow Earth (planet_2)
        case '7': // Follow Mars (planet_3)
        case '8': // Follow Jupiter (planet_4)
        case '9': // Follow Saturn (planet_5)
          // Follow specific planet: Keys 4-9 map to first 6 planets (Mercury through Saturn)
          // Note: Uranus (planet_6) and Neptune (planet_7) are not mapped due to keyboard limitations
          const planetIndex = parseInt(event.key) - 4;
          const planetId = `planet_${planetIndex}`;
          const planet = this.planets.get(planetId);
          if (planet) {
            this.followPlanet(planet, planetId);
          }
          break;
        case 'ArrowUp':
          // Zoom in
          this.camera.radius = Math.max(this.camera.lowerRadiusLimit, this.camera.radius - 5);
          break;
        case 'ArrowDown':
          // Zoom out
          this.camera.radius = Math.min(this.camera.upperRadiusLimit, this.camera.radius + 5);
          break;
        case 'ArrowLeft':
          // Rotate left
          this.camera.alpha -= 0.1;
          break;
        case 'ArrowRight':
          // Rotate right
          this.camera.alpha += 0.1;
          break;
        case 'm':
        case 'M':
          // Toggle manual camera control
          this.toggleManualControl();
          break;
        case 'g':
        case 'G':
          // Switch to next galaxy
          const nextIndex = (this.currentGalaxyIndex + 1) % this.galaxies.length;
          this.switchGalaxy(nextIndex);
          break;
      }
    };
    
    window.addEventListener('keydown', this.keyboardHandler);
  }

  private setupCameraPresetUI(): void {
    // Create UI overlay
    const uiDiv = document.createElement('div');
    uiDiv.style.position = 'absolute';
    uiDiv.style.top = '20px';
    uiDiv.style.left = '20px';
    uiDiv.style.color = 'white';
    uiDiv.style.fontFamily = 'Arial, sans-serif';
    uiDiv.style.fontSize = '14px';
    uiDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    uiDiv.style.padding = '15px';
    uiDiv.style.borderRadius = '8px';
    uiDiv.style.zIndex = '1000';
    // Apply backdrop filter with browser compatibility check
    if ('backdropFilter' in uiDiv.style || 'webkitBackdropFilter' in uiDiv.style) {
      (uiDiv.style as any).backdropFilter = 'blur(10px)';
      (uiDiv.style as any).webkitBackdropFilter = 'blur(10px)';
    }
    uiDiv.innerHTML = `
      <div style="margin-bottom: 10px; font-weight: bold; font-size: 16px;">Camera Controls</div>
      <div style="margin-bottom: 5px;"><strong>1:</strong> Spawn Point</div>
      <div style="margin-bottom: 5px;"><strong>2:</strong> Overview</div>
      <div style="margin-bottom: 5px;"><strong>3:</strong> Follow Sun</div>
      <div style="margin-bottom: 5px;"><strong>4-9:</strong> Follow Planet</div>
      <div style="margin-bottom: 5px;"><strong>Arrow Keys:</strong> Manual Control</div>
      <div style="margin-bottom: 5px;"><strong>M:</strong> Toggle Mouse Control</div>
      <div style="margin-bottom: 5px;"><strong>G:</strong> Switch Galaxy</div>
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3);">
        <strong>Current:</strong> <span id="currentPreset">Spawn Point</span>
      </div>
      <div style="margin-top: 5px;">
        <strong>Galaxy:</strong> <span id="currentGalaxy">Solar System</span>
      </div>
    `;
    
    document.body.appendChild(uiDiv);
    this.cameraPresetUI = uiDiv;
  }

  private setCameraPreset(preset: CameraPreset): void {
    this.currentPreset = preset;
    this.followingPlanet = null;
    
    // Animate camera to preset position
    const targetPosition = this.getPresetCameraPosition(preset);
    const targetTarget = this.getPresetCameraTarget(preset);
    
    this.animateCamera(targetPosition, targetTarget);
    this.updatePresetUI(this.getPresetName(preset));
  }

  private followPlanet(planet: Mesh, planetId?: string): void {
    this.currentPreset = CameraPreset.FOLLOW_PLANET;
    this.followingPlanet = planet;
    
    // Get planet name efficiently using provided ID or lookup
    let planetName = 'Unknown';
    if (planetId && this.planetDataMap.has(planetId)) {
      planetName = this.planetDataMap.get(planetId)!.name;
    } else {
      // Fallback: find planet ID by mesh (less efficient)
      const planetEntry = Array.from(this.planetDataMap.entries())
        .find(([id, _]) => this.planets.get(id) === planet);
      planetName = planetEntry ? planetEntry[1].name : 'Unknown';
    }
    
    const offset = new Vector3(10, 10, 10);
    const targetPosition = planet.position.add(offset);
    
    this.animateCamera(targetPosition, planet.position);
    this.updatePresetUI(`Follow ${planetName}`);
  }

  private getPresetCameraPosition(preset: CameraPreset): Vector3 {
    switch(preset) {
      case CameraPreset.SPAWN_POINT:
        return new Vector3(80, 40, 80);
      case CameraPreset.OVERVIEW:
        return new Vector3(0, 150, 0);
      case CameraPreset.FOLLOW_SUN:
        return new Vector3(20, 10, 20);
      default:
        return new Vector3(80, 40, 80);
    }
  }

  private getPresetCameraTarget(preset: CameraPreset): Vector3 {
    switch(preset) {
      case CameraPreset.SPAWN_POINT:
      case CameraPreset.OVERVIEW:
      case CameraPreset.FOLLOW_SUN:
        return Vector3.Zero();
      default:
        return Vector3.Zero();
    }
  }

  private animateCamera(targetPosition: Vector3, targetTarget: Vector3): void {
    // Calculate spherical coordinates from targetPosition relative to targetTarget
    const direction = targetPosition.subtract(targetTarget);
    const radius = direction.length();
    const alpha = Math.atan2(direction.x, direction.z);
    const beta = Math.acos(direction.y / radius);
    
    // Smoothly animate to target
    const frameCount = 60;
    const startAlpha = this.camera.alpha;
    const startBeta = this.camera.beta;
    const startRadius = this.camera.radius;
    const startTarget = this.camera.target.clone();
    
    let frame = 0;
    const animationObserver = this.scene.onBeforeRenderObservable.add(() => {
      frame++;
      const t = frame / frameCount;
      const eased = this.easeInOutCubic(t);
      
      this.camera.alpha = startAlpha + (alpha - startAlpha) * eased;
      this.camera.beta = startBeta + (beta - startBeta) * eased;
      this.camera.radius = startRadius + (radius - startRadius) * eased;
      this.camera.target = Vector3.Lerp(startTarget, targetTarget, eased);
      
      if (frame >= frameCount) {
        this.scene.onBeforeRenderObservable.remove(animationObserver);
      }
    });
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private getPresetName(preset: CameraPreset): string {
    switch(preset) {
      case CameraPreset.SPAWN_POINT:
        return 'Spawn Point';
      case CameraPreset.OVERVIEW:
        return 'Overview';
      case CameraPreset.FOLLOW_SUN:
        return 'Follow Sun';
      case CameraPreset.FOLLOW_PLANET:
        return 'Follow Planet';
      default:
        return 'Unknown';
    }
  }

  private updatePresetUI(presetName: string): void {
    const presetElement = document.getElementById('currentPreset');
    if (presetElement) {
      presetElement.textContent = presetName;
    }
  }

  private toggleManualControl(): void {
    // Use tracked state for reliable toggle
    if (this.cameraControlsAttached) {
      this.camera.detachControl();
      this.cameraControlsAttached = false;
      this.updatePresetUI('Manual (Keyboard)');
    } else {
      this.camera.attachControl(this.canvas, false);
      this.cameraControlsAttached = true;
      this.updatePresetUI('Manual (Mouse)');
    }
  }


  private initializeAudio(): void {
    // Initialize background space music
    // Using a generated tone/ambient sound as placeholder since we can't embed actual files
    // In production, you would load actual audio files
    try {
      // Create audio context for synthesized space ambience
      this.createSynthesizedSpaceMusic();
      
      // Initialize sound effects
      this.createSoundEffects();
      
      // Start playing background music
      if (this.backgroundMusic) {
        this.backgroundMusic.volume = 0.3;
        this.backgroundMusic.loop = true;
        // Auto-play will be attempted but may be blocked by browser policy
        this.backgroundMusic.play().catch(err => {
          console.log('Background music autoplay blocked - user interaction needed');
        });
      }
    } catch (err) {
      console.warn('Audio initialization failed:', err);
    }
  }

  private createSynthesizedSpaceMusic(): void {
    // Create a simple ambient drone using Web Audio API
    // This creates an ethereal space-like ambience
    try {
      // Reuse existing audio context or create new one
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // Create oscillators for ambient drone
      const osc1 = this.audioContext.createOscillator();
      const osc2 = this.audioContext.createOscillator();
      const osc3 = this.audioContext.createOscillator();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc3.type = 'sine';
      
      osc1.frequency.value = 110; // A2
      osc2.frequency.value = 165; // E3
      osc3.frequency.value = 220; // A3
      
      this.musicGainNode = this.audioContext.createGain();
      this.musicGainNode.gain.value = 0.05; // Very quiet ambient
      
      osc1.connect(this.musicGainNode);
      osc2.connect(this.musicGainNode);
      osc3.connect(this.musicGainNode);
      this.musicGainNode.connect(this.audioContext.destination);
      
      osc1.start();
      osc2.start();
      osc3.start();
      
      // Store references for cleanup
      this.musicOscillators = [osc1, osc2, osc3];
      
      console.log('Synthesized space ambience started');
    } catch (err) {
      console.warn('Could not create synthesized music:', err);
    }
  }

  private createSoundEffects(): void {
    // Create placeholder sound effects
    // In production, these would be actual audio files
    const soundNames = ['click', 'hover', 'galaxy-switch', 'camera-change', 'modal-open', 'modal-close'];
    
    soundNames.forEach(name => {
      const audio = new Audio();
      // Placeholder - in production you'd set: audio.src = `assets/audio/${name}.mp3`;
      audio.volume = 0.5;
      this.sounds.set(name, audio);
    });
  }

  private playSound(soundName: string): void {
    if (!this.isSoundEnabled) return;
    
    const sound = this.sounds.get(soundName);
    if (sound) {
      // Reset and play existing audio element instead of cloning
      sound.currentTime = 0;
      sound.play().catch(err => {
        // Silently fail if sound can't play
        console.debug(`Could not play sound ${soundName}:`, err);
      });
    }
  }

  private addOrbitalTrail(planet: Mesh, color: string, planetId: string): void {
    // Create a subtle particle trail that follows the planet
    const trail = new ParticleSystem(`trail_${planetId}`, 200, this.scene);
    trail.emitter = planet;
    
    // Point emitter at planet position
    trail.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
    trail.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
    
    // Parse hex color
    const hexColor = Color3.FromHexString(color);
    trail.color1 = new Color4(hexColor.r, hexColor.g, hexColor.b, 0.8);
    trail.color2 = new Color4(hexColor.r, hexColor.g, hexColor.b, 0.4);
    trail.colorDead = new Color4(hexColor.r, hexColor.g, hexColor.b, 0);
    
    // Small particles
    trail.minSize = 0.08;
    trail.maxSize = 0.15;
    
    // Slow-moving particles that fade quickly
    trail.minLifeTime = 0.5;
    trail.maxLifeTime = 1.5;
    
    // Emit rate
    trail.emitRate = 30;
    
    // Minimal velocity so particles stay close to orbit path
    trail.minEmitPower = 0.05;
    trail.maxEmitPower = 0.1;
    
    // Add subtle glow
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    
    trail.start();
  }

  private createNebula(): void {
    // Add a nebula effect in the background
    const nebula = new ParticleSystem('nebula', 800, this.scene);
    
    // Large emission box to cover space
    nebula.minEmitBox = new Vector3(-200, -100, -200);
    nebula.maxEmitBox = new Vector3(200, 100, 200);
    
    // Multiple colors for nebula effect
    nebula.color1 = new Color4(0.4, 0.2, 0.6, 0.15);
    nebula.color2 = new Color4(0.6, 0.3, 0.8, 0.2);
    nebula.colorDead = new Color4(0.3, 0.1, 0.5, 0);
    
    // Large, slow-moving particles
    nebula.minSize = 8;
    nebula.maxSize = 20;
    
    nebula.minLifeTime = 15;
    nebula.maxLifeTime = 30;
    
    nebula.emitRate = 10;
    
    // Very slow drift
    nebula.minEmitPower = 0.1;
    nebula.maxEmitPower = 0.2;
    
    // Subtle rotation
    nebula.minAngularSpeed = -0.05;
    nebula.maxAngularSpeed = 0.05;
    
    // Additive blending for ethereal effect
    nebula.blendMode = ParticleSystem.BLENDMODE_ADD;
    
    nebula.start();
  }

  private toggleMusic(): void {
    this.isMusicEnabled = !this.isMusicEnabled;
    if (this.musicGainNode) {
      // Fade music in/out instead of abruptly stopping
      if (this.isMusicEnabled) {
        this.musicGainNode.gain.value = 0.05;
      } else {
        this.musicGainNode.gain.value = 0;
      }
    }
  }

  private toggleSounds(): void {
    this.isSoundEnabled = !this.isSoundEnabled;
  }

  public dispose(): void {
    // Stop and cleanup audio
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic = null;
    }
    
    // Stop oscillators
    this.musicOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (err) {
        // Oscillator might already be stopped
      }
    });
    this.musicOscillators = [];
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close().catch(console.warn);
      this.audioContext = null;
    }
    
    if (this.musicGainNode) {
      this.musicGainNode.disconnect();
      this.musicGainNode = null;
    }
    
    this.sounds.clear();
    
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
    
    // Remove keyboard event listener
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    
    // Remove camera preset UI
    if (this.cameraPresetUI && this.cameraPresetUI.parentNode) {
      this.cameraPresetUI.parentNode.removeChild(this.cameraPresetUI);
      this.cameraPresetUI = null;
    }
    
    // Unsubscribe from all Firebase subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    // Dispose Babylon.js resources
    this.scene.dispose();
    this.engine.dispose();
  }
}
