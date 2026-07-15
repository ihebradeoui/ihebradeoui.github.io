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
  PBRSubSurfaceConfiguration,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  ShaderMaterial,
  VolumetricLightScatteringPostProcess,
  ColorCurves,
  Matrix,
  Quaternion,
} from '@babylonjs/core';
import { registerSpaceShaders } from './space-shaders';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

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
  shape?:
    | 'sphere'
    | 'cube'
    | 'torus'
    | 'octahedron'
    | 'dodecahedron'
    | 'icosahedron'
    | 'cylinder'; // Planet shape
  claimedAt?: number; // Timestamp when a name was first set on this planet
  lastUpdated?: number; // Timestamp when the name was last updated
  claimedBy?: string; // Display name shown in the leaderboard (same as planet name)
  customizations?: string[]; // Active cosmetic customization IDs
  userId?: string;
  userEmail?: string;
  rentedUntil?: number; // Timestamp until rental expires
  rentedBy?: string;   // userId who rented this planet
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
    shape?:
      | 'sphere'
      | 'cube'
      | 'torus'
      | 'octahedron'
      | 'dodecahedron'
      | 'icosahedron'
      | 'cylinder';
  }>;
}

export enum CameraPreset {
  SPAWN_POINT = 'spawn',
  OVERVIEW = 'overview',
  FOLLOW_SUN = 'sun',
  FOLLOW_PLANET = 'planet',
}

export class PlanetScene {
  // Credits system configuration
  private readonly CREDITS_RENT_COST = 50;    // Credits to rent a planet for 1 week
  private readonly CREDITS_SAVE_COST = 10;    // Credits to save changes to a rented planet
  private readonly CREDITS_PER_AD = 10;       // Credits earned per ad watched
  private readonly RENT_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week in ms

  private userCredits: number = 0;

  private scene: Scene;
  private engine: Engine;
  private camera: ArcRotateCamera;
  private planets: Map<string, Mesh> = new Map();
  private planetDataMap: Map<string, PlanetData> = new Map();
  private selectedPlanet: Mesh | null = null;
  private subscriptions: Subscription[] = [];
  private sun: Mesh | null = null;
  private glowLayer: GlowLayer | null = null;
  private sunLight: PointLight | null = null;
  private sunMaterial: ShaderMaterial | null = null;
  private skyMaterial: ShaderMaterial | null = null;
  private sunHalo: Mesh | null = null;
  private sunHaloTexture: DynamicTexture | null = null;
  private godRays: VolumetricLightScatteringPostProcess | null = null;
  private planetShaderMats: ShaderMaterial[] = [];
  private asteroidBelt: Mesh | null = null;
  private bestScalingLevel: number = 1;
  private adaptiveQualityInterval: number | null = null;
  private cinematicPipeline: DefaultRenderingPipeline | null = null;
  private enableDepthOfField: boolean = false;
  private animationCallbacks: (() => void)[] = [];
  private meteorParticleSystems: ParticleSystem[] = [];
  private meteorInterval: number | null = null;
  private meteorTimeouts: number[] = [];
  private currentPreset: CameraPreset = CameraPreset.SPAWN_POINT;
  private followingPlanet: Mesh | null = null;
  private cameraPresetUI: HTMLDivElement | null = null;
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
  private modalObservers: MutationObserver[] = [];
  private cameraControlsAttached: boolean = false; // Track camera control state
  private galaxies: GalaxyData[] = [];
  private currentGalaxyIndex: number = 0;
  private orbitPaths: Map<string, Mesh> = new Map(); // Track orbit paths for cleanup
  private distantGalaxies: Map<number, Mesh> = new Map(); // Distant galaxy representations
  private isCameraTransitioning: boolean = false; // Track camera transition state
  private starFieldParticleSystem: ParticleSystem | null = null; // Reference to star field for dynamic updates
  private starDensity: number = 38; // Fixed particle density (38%)
  private starFallSpeed: number = 4; // Fixed fall speed (4%)
  
  // Audio management
  private backgroundMusic: HTMLAudioElement | null = null;
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private isMusicEnabled: boolean = true;
  private isSoundEnabled: boolean = true;
  private audioContext: AudioContext | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicGainNode: GainNode | null = null;
  private currentMelodyMode: number = 0;
  private melodyModes: Array<Array<{ freq: number; duration: number }>> = [];
  private melodyTimeout: number | null = null;
  private leaderboardUpdateInterval: number | null = null; // Track leaderboard update interval
  private planetCustomizationParticles: Map<string, ParticleSystem[]> = new Map();
  private planetCustomizationCallbacks: Map<string, Array<() => void>> = new Map();
  private moonMeshes: Map<string, { mesh: Mesh; angle: number; orbitRadius: number }> = new Map();
  private currentUser: User | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private planetTooltip: HTMLDivElement | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private database: AngularFireDatabase,
    private auth: Auth,
  ) {
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: false, // Skip back-buffer copies for higher FPS
      stencil: true,
      antialias: true, // Enable hardware anti-aliasing
      powerPreference: 'high-performance',
    });

    // Render sharper than CSS resolution on high-DPI displays (capped so 4K
    // panels don't pay full native cost). Adaptive quality below adjusts this
    // at runtime if the GPU can't keep up.
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.bestScalingLevel = 1 / Math.min(dpr, 1.25);
    this.engine.setHardwareScalingLevel(this.bestScalingLevel);
    this.startAdaptiveQuality();

    // Initialize galaxies before creating the scene
    this.initializeGalaxies();

    // Initialize audio
    this.initializeAudio();

    this.scene = this.createScene();

    // Debug handle for diagnostics (harmless in production)
    (window as any).__planetScene = this;

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

    // Setup leaderboard
    this.setupLeaderboard();

    // Setup keyboard controls and camera presets
    this.setupKeyboardControls();
    this.setupCameraPresetUI();

    // Setup planet hover tooltip
    this.createPlanetTooltip();

    // Setup auth modal
    this.setupAuthModal();
    // Listen to auth state
    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      this.updateAuthStatusUI();
      this.loadUserCredits();
    });
  }

  private createScene(): Scene {
    const scene = new Scene(this.engine);
    this.scene = scene; // Assign early so methods can use it

    // Register custom GLSL (sky dome, plasma sun, atmosphere scattering).
    registerSpaceShaders();

    // Physically-based rendering + filmic tonemapping.
    scene.environmentIntensity = 1.0;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;

    // Deep black space background color for professional look
    scene.clearColor = new Color4(0, 0, 0, 1);

    // Camera - positioned to view the orbital system
    this.camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 3,
      80,
      Vector3.Zero(),
      scene,
    );
    // Initially attach controls and track the state
    this.camera.attachControl(this.canvas, false);
    this.cameraControlsAttached = true; // Track initial state
    this.camera.lowerRadiusLimit = 20;
    this.camera.upperRadiusLimit = 300;
    this.camera.wheelPrecision = 20;
    this.camera.panningSensibility = 0;
    // Slightly wide "anamorphic" field of view + smooth, weighty camera inertia
    this.camera.fov = 0.92;
    this.camera.inertia = 0.92;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 5000; // must reach past the sky dome (radius 1500)

    // Glow layer — lightweight, small kernel so it doesn't bleed across the screen
    this.glowLayer = new GlowLayer('glow', scene, {
      mainTextureFixedSize: 512,
      blurKernelSize: 64,
    });
    this.glowLayer.intensity = 0.6;

    // HDR environment / image-based lighting (IBL)
    this.setupEnvironmentIBL(scene);

    // Create sun at center
    this.createSun();

    // Main light source: point light at the sun's core, so every planet gets
    // a physically correct day/night terminator (crescents, like the movies).
    this.setupSunLight(scene);

    // Secondary fill light — very dim, cold, simulates deep-space starlight
    const ambientLight = new HemisphericLight(
      'ambientLight',
      new Vector3(0, 1, 0),
      scene,
    );
    ambientLight.intensity = 0.12;
    ambientLight.diffuse = new Color3(0.15, 0.18, 0.3);
    ambientLight.groundColor = new Color3(0.03, 0.03, 0.08);

    // Procedural deep-space dome: stars, milky way and nebulae in ONE GPU
    // draw call (replaces ~3500 CPU-simulated particles).
    this.createCinematicSky(scene);

    // Sparse foreground dust motes for parallax depth
    this.createSpaceDust();

    // Setup cinematic post-processing pipeline
    this.setupPostProcessing();

    // Load initial galaxy (Solar System) without animation
    this.switchGalaxy(0, false);

    // Create meteor effects
    this.createMeteorSystem();

    // Setup unified animation loop
    this.setupAnimationLoop();

    // Opening title-sequence dolly into the system
    this.playIntroShot();

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

  /**
   * Enables HDR image-based lighting (IBL) for PBR materials.
   *
   * Expected asset: `assets/pbr/environment.env` (prefiltered environment).
   * This file can be generated from an HDRI using Babylon's environment tools.
   */
  private setupEnvironmentIBL(scene: Scene): void {
    // Use a prefiltered `.env` file if available (best for PBR performance/quality).
    try {
      const envTex = CubeTexture.CreateFromPrefilteredData(
        '/assets/pbr/environment.env',
        scene,
      );
      scene.environmentTexture = envTex;
      scene.environmentIntensity = 0.75;
    } catch (_e) {
      // env texture not present
    }
  }

  private setupSunLight(scene: Scene): void {
    // Light radiates from the sun at the center of the system. Planets facing
    // it are lit, the far side falls into night — dramatic crescents for free,
    // with no shadow-map render pass to pay for.
    const sunLight = new PointLight('sunPointLight', Vector3.Zero(), scene);
    sunLight.intensity = 1.7;
    sunLight.range = 2000;
    sunLight.diffuse = new Color3(1.0, 0.95, 0.82);
    sunLight.specular = new Color3(1.0, 0.9, 0.75);

    this.sunLight = sunLight;
  }

  /**
   * Adaptive resolution: if the GPU can't hold ~50+ FPS, gently lower the
   * internal render resolution; when there is headroom, climb back toward
   * the sharpest level. Keeps motion smooth on weak hardware, crisp on strong.
   */
  private startAdaptiveQuality(): void {
    const worstScalingLevel = 1.5;
    let lowStreak = 0;
    let checks = 0;
    this.adaptiveQualityInterval = window.setInterval(() => {
      // Ignore the first checks — startup compilation makes FPS lie.
      if (checks++ < 4) return;
      const fps = this.engine.getFps();
      const current = this.engine.getHardwareScalingLevel();
      if (fps < 38) {
        // Require two consecutive slow reads before degrading resolution.
        lowStreak++;
        if (lowStreak >= 2 && current < worstScalingLevel) {
          this.engine.setHardwareScalingLevel(Math.min(worstScalingLevel, current * 1.15));
          lowStreak = 0;
        }
      } else {
        lowStreak = 0;
        if (fps > 52 && current > this.bestScalingLevel + 0.01) {
          this.engine.setHardwareScalingLevel(Math.max(this.bestScalingLevel, current / 1.08));
        }
      }
    }, 2000);
  }

  private setupAnimationLoop(): void {
    // Time tracking for smooth motion effects
    let time = 0;
    // Solar flare scheduling (time is ~0.6 units/second)
    let nextFlareAt = 12 + Math.random() * 14;
    let flareClock = -1;

    // Single animation callback for all scene animations
    this.scene.registerBeforeRender(() => {
      // Frame-rate independent motion: ratio is 1.0 at 60 FPS, so the scene
      // moves at identical speed on 30 Hz and 144 Hz displays.
      const ratio = this.scene.getAnimationRatio();
      time += 0.01 * ratio;

      // Feed time into the animated GPU shaders (sun plasma, sky twinkle,
      // gas-giant storms, magma flows)
      if (this.sunMaterial) this.sunMaterial.setFloat('time', time);
      if (this.skyMaterial) this.skyMaterial.setFloat('time', time);
      for (const mat of this.planetShaderMats) mat.setFloat('time', time);

      // Occasional solar flare — the star breathes, its light swells
      if (flareClock < 0 && time > nextFlareAt) {
        flareClock = 0;
        nextFlareAt = time + 18 + Math.random() * 22;
      }
      if (flareClock >= 0) {
        flareClock += 0.01 * ratio;
        const env = Math.sin(Math.min(flareClock / 1.6, 1) * Math.PI);
        this.sunMaterial?.setFloat('flare', env);
        if (this.sunLight) this.sunLight.intensity = 1.7 + env * 0.55;
        if (flareClock >= 1.6) {
          flareClock = -1;
          this.sunMaterial?.setFloat('flare', 0);
          if (this.sunLight) this.sunLight.intensity = 1.7;
        }
      }

      // The asteroid belt slowly wheels around the star
      if (this.asteroidBelt) {
        this.asteroidBelt.rotation.y += 0.0005 * ratio;
      }

      // Slow spin for the distant spiral galaxies
      this.distantGalaxies.forEach((mesh) => {
        const tex = mesh.metadata?.spriteTexture as Texture | undefined;
        if (tex) tex.wAng += 0.0012 * ratio;
      });

      // Rotate sun slowly
      if (this.sun) {
        this.sun.rotation.y += 0.00025 * ratio;
      }

      // Update all planet orbits and rotations
      this.planetDataMap.forEach((data, id) => {
        const planet = this.planets.get(id);
        if (
          planet &&
          data.orbitRadius &&
          data.orbitSpeed &&
          data.orbitAngle !== undefined
        ) {
          // Update orbit angle
          data.orbitAngle += data.orbitSpeed * ratio;

          // Calculate new position to match the tilted orbit path
          // The orbit path (torus) is rotated around X-axis by inclination
          const inclination = data.orbitInclination || 0;

          // Base circular motion in XZ plane
          const x = Math.cos(data.orbitAngle) * data.orbitRadius;
          const z = Math.sin(data.orbitAngle) * data.orbitRadius;

          // Apply inclination rotation to match the tilted torus
          // When torus is rotated by inclination around X-axis:
          // Rotation formula: y' = -z*sin(θ), z' = z*cos(θ)
          planet.position.x = x;
          planet.position.z = z * Math.cos(inclination);
          planet.position.y = -z * Math.sin(inclination);

          // Planet self-rotation - slower for cozy vibe
          planet.rotation.y += 0.002 * ratio;
        }
      });

      // Update moon companion orbits
      this.moonMeshes.forEach((moonData) => {
        moonData.angle += 0.015 * ratio;
        moonData.mesh.position.x = Math.cos(moonData.angle) * moonData.orbitRadius;
        moonData.mesh.position.z = Math.sin(moonData.angle) * moonData.orbitRadius;
        moonData.mesh.position.y = Math.sin(moonData.angle * 0.5) * moonData.orbitRadius * 0.2;
      });

      // Keep DOF focus aligned with selection (cheap single distance calc).
      if (this.selectedPlanet && this.cinematicPipeline?.depthOfFieldEnabled) {
        this.updateCinematicFocusTarget();
      }
      
      // Add cinematic camera drift — slow, majestic parallax motion
      // Only apply when not transitioning and not in manual control mode
      if (!this.isCameraTransitioning && this.currentPreset !== CameraPreset.FOLLOW_PLANET) {
        // Multi-frequency sinusoidal movement for organic, alive feel
        const driftAmplitude = 0.22;
        const driftX = Math.sin(time * 0.28) * driftAmplitude + Math.sin(time * 0.07) * driftAmplitude * 0.4;
        const driftY = Math.cos(time * 0.18) * driftAmplitude * 0.45 + Math.cos(time * 0.11) * driftAmplitude * 0.2;
        
        // Apply drift to camera alpha and beta (orbital angles)
        this.camera.alpha += driftX * 0.00012 * ratio;
        this.camera.beta  += driftY * 0.00012 * ratio;

        // Subtle zoom breathing — like a camera operator gently pulling focus
        const breathe = Math.sin(time * 0.13) * 0.08 + Math.sin(time * 0.05) * 0.04;
        this.camera.radius += breathe * 0.012 * ratio;
      }
      
      // Handle camera following for FOLLOW_PLANET preset
      if (
        this.currentPreset === CameraPreset.FOLLOW_PLANET &&
        this.followingPlanet
      ) {
        this.camera.setTarget(this.followingPlanet.position);
      }
    });
  }

  private createSun(): void {
    // Sun sphere — surface is a live GPU plasma shader (granulation, limb
    // darkening, HDR rim) instead of a canvas texture redrawn on the CPU.
    this.sun = MeshBuilder.CreateSphere(
      'sun',
      { diameter: 8, segments: 64 },
      this.scene,
    );
    this.sun.position = Vector3.Zero();

    const sunMaterial = new ShaderMaterial('sunMaterial', this.scene, 'cinematicSun', {
      attributes: ['position', 'normal'],
      uniforms: [
        'world', 'worldViewProjection', 'cameraPosition',
        'time', 'coreColor', 'edgeColor', 'flare',
      ],
    });
    sunMaterial.setFloat('time', 0);
    sunMaterial.setFloat('flare', 0);
    sunMaterial.setColor3('coreColor', new Color3(1.0, 0.82, 0.35));
    sunMaterial.setColor3('edgeColor', new Color3(0.9, 0.32, 0.05));
    sunMaterial.backFaceCulling = true;
    this.sun.material = sunMaterial;
    this.sunMaterial = sunMaterial;

    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.sun);
      // Custom shader has no emissive channel — glow from its real output.
      this.glowLayer.referenceMeshToUseItsOwnMaterial(this.sun);
    }

    this.createSunHaloAndGodRays();
    this.createSunCorona();
  }

  /**
   * Billboard halo sprite (lens-flare core + anamorphic streak) that doubles
   * as the source mesh for the volumetric god-rays post process — the iconic
   * "staring into the sun" shot from every space movie.
   */
  private createSunHaloAndGodRays(): void {
    const haloTex = new DynamicTexture('sunHaloTex', 512, this.scene, false);
    haloTex.hasAlpha = true;
    this.sunHaloTexture = haloTex;
    this.drawSunHalo(new Color3(1.0, 0.72, 0.25));

    const halo = MeshBuilder.CreatePlane('sunHalo', { size: 15 }, this.scene);
    halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
    halo.position = Vector3.Zero();
    halo.isPickable = false;
    const haloMat = new StandardMaterial('sunHaloMat', this.scene);
    haloMat.diffuseTexture = haloTex; // sampled by the god-rays pass
    haloMat.emissiveTexture = haloTex;
    haloMat.diffuseColor = Color3.Black();
    haloMat.specularColor = Color3.Black();
    haloMat.disableLighting = true;
    haloMat.alphaMode = Engine.ALPHA_ADD;
    haloMat.alpha = 0.98;
    halo.material = haloMat;
    this.sunHalo = halo;

    try {
      // NOTE: postProcessRatio must stay 1.0 — the VLS shader composites the
      // whole scene through itself, so lowering it pixelates the entire frame.
      // The occlusion pre-pass (passRatio) is safe to run at low resolution.
      const godRays = new VolumetricLightScatteringPostProcess(
        'godRays',
        { postProcessRatio: 1.0, passRatio: 0.4 },
        this.camera,
        halo,
        70,
        Texture.BILINEAR_SAMPLINGMODE,
        this.engine,
        false,
      );
      godRays.exposure = 0.22;
      godRays.decay = 0.96;
      godRays.weight = 0.32;
      godRays.density = 0.9;
      this.godRays = godRays;
    } catch (_e) {
      // God rays unavailable (no float textures / WebGL limitations)
    }
  }

  /** Paints the halo sprite: warm radial core, cool anamorphic streak, spikes. */
  private drawSunHalo(tint: Color3): void {
    if (!this.sunHaloTexture) return;
    const ctx = this.sunHaloTexture.getContext() as CanvasRenderingContext2D;
    const S = 512;
    const c = S / 2;
    const r = Math.round(255 * Math.min(1, tint.r * 1.05));
    const g = Math.round(255 * Math.min(1, tint.g * 1.05));
    const b = Math.round(255 * Math.min(1, tint.b * 1.05));

    ctx.clearRect(0, 0, S, S);

    // Warm radial core glow — tight falloff so it reads as glare, not fog
    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.92);
    core.addColorStop(0,    'rgba(255,255,245,0.9)');
    core.addColorStop(0.1,  `rgba(${r},${g},${b},0.55)`);
    core.addColorStop(0.3,  `rgba(${r},${Math.round(g * 0.7)},${Math.round(b * 0.5)},0.12)`);
    core.addColorStop(0.6,  `rgba(${r},${Math.round(g * 0.55)},${Math.round(b * 0.35)},0.03)`);
    core.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, S, S);

    // Anamorphic horizontal streak — cool blue, sci-fi signature
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(1, 0.045);
    const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.98);
    streak.addColorStop(0,   'rgba(235,245,255,0.65)');
    streak.addColorStop(0.3, 'rgba(150,195,255,0.3)');
    streak.addColorStop(1,   'rgba(90,140,255,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(-c, -c, S, S * 24);
    ctx.restore();

    // Soft vertical spike
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(0.035, 0.55);
    const spike = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.9);
    spike.addColorStop(0,   'rgba(255,250,235,0.75)');
    spike.addColorStop(0.4, `rgba(${r},${g},${b},0.3)`);
    spike.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = spike;
    ctx.fillRect(-S, -c, S * 30, S);
    ctx.restore();

    this.sunHaloTexture.update();
  }

  private createSunCorona(): void {
    // Inner corona — tight, hot white particles
    const innerCorona = new ParticleSystem('sunCoronaInner', 260, this.scene);
    innerCorona.emitter = Vector3.Zero();
    innerCorona.particleEmitterType = new SphereParticleEmitter(4.2);
    const innerTex = new DynamicTexture('innerCoronaTex', 64, this.scene, false);
    const ic = innerTex.getContext() as CanvasRenderingContext2D;
    const ig = ic.createRadialGradient(32, 32, 0, 32, 32, 32);
    ig.addColorStop(0,   'rgba(255,255,220,1)');
    ig.addColorStop(0.25,'rgba(255,230,120,0.85)');
    ig.addColorStop(0.6, 'rgba(255,160,40,0.4)');
    ig.addColorStop(1,   'rgba(255,80,0,0)');
    ic.fillStyle = ig; ic.fillRect(0, 0, 64, 64);
    innerTex.update();
    innerCorona.particleTexture = innerTex;
    innerCorona.minSize = 0.4; innerCorona.maxSize = 1.6;
    innerCorona.minLifeTime = 1.5; innerCorona.maxLifeTime = 3;
    innerCorona.emitRate = 60;
    innerCorona.blendMode = ParticleSystem.BLENDMODE_ADD;
    innerCorona.minEmitPower = 0.2; innerCorona.maxEmitPower = 0.9;
    innerCorona.updateSpeed = 0.02;
    innerCorona.color1 = new Color4(1, 0.98, 0.75, 1.0);
    innerCorona.color2 = new Color4(1, 0.82, 0.38, 0.75);
    innerCorona.colorDead = new Color4(1, 0.5, 0.1, 0);
    innerCorona.start();

    // Outer corona — wide, wispy plasma streamers
    const outerCorona = new ParticleSystem('sunCoronaOuter', 140, this.scene);
    outerCorona.emitter = Vector3.Zero();
    outerCorona.particleEmitterType = new SphereParticleEmitter(4.8);
    const outerTex = new DynamicTexture('outerCoronaTex', 128, this.scene, false);
    const oc = outerTex.getContext() as CanvasRenderingContext2D;
    const og = oc.createRadialGradient(64, 64, 0, 64, 64, 64);
    og.addColorStop(0,    'rgba(255,220,100,0.9)');
    og.addColorStop(0.35, 'rgba(255,140,30,0.5)');
    og.addColorStop(0.7,  'rgba(255,60,0,0.2)');
    og.addColorStop(1,    'rgba(0,0,0,0)');
    oc.fillStyle = og; oc.fillRect(0, 0, 128, 128);
    outerTex.update();
    outerCorona.particleTexture = outerTex;
    outerCorona.minSize = 1.2; outerCorona.maxSize = 3.2;
    outerCorona.minLifeTime = 2.5; outerCorona.maxLifeTime = 5;
    outerCorona.emitRate = 22;
    outerCorona.blendMode = ParticleSystem.BLENDMODE_ADD;
    // Low emit power keeps the streamers hugging the star instead of
    // drifting across the frame as detached red blobs.
    outerCorona.minEmitPower = 0.3; outerCorona.maxEmitPower = 1.2;
    outerCorona.updateSpeed = 0.015;
    outerCorona.color1 = new Color4(1, 0.75, 0.3, 0.5);
    outerCorona.color2 = new Color4(1, 0.45, 0.05, 0.3);
    outerCorona.colorDead = new Color4(0.8, 0.2, 0, 0);
    outerCorona.start();
  }

  private setupPostProcessing(): void {
    try {
      const pipeline = new DefaultRenderingPipeline(
        'cinematicPipeline',
        true, // HDR on: enables filmic highlights for bloom + PBR
        this.scene,
        [this.camera],
      );

      // FXAA anti-aliasing — crisp edges (2x MSAA + FXAA: cheaper than 4x)
      pipeline.fxaaEnabled = true;
      pipeline.samples = 2;

      // Bloom — soft halation around the sun, atmospheres and stars.
      // The sun shader outputs HDR values (>1), so highlights bleed like film.
      pipeline.bloomEnabled = true;
      pipeline.bloomThreshold = 0.72;
      pipeline.bloomWeight    = 0.3;
      pipeline.bloomKernel    = 64;
      pipeline.bloomScale     = 0.5;

      // Image processing — "space cinematic" grade
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.vignetteEnabled   = true;
      pipeline.imageProcessing.vignetteWeight    = 2.6;
      pipeline.imageProcessing.vignetteColor     = new Color4(0, 0, 0.02, 1);
      pipeline.imageProcessing.vignetteBlendMode = 1;
      pipeline.imageProcessing.contrast  = 1.16;
      pipeline.imageProcessing.exposure  = 1.12;

      // Teal-shadow / warm-highlight color grade — the classic sci-fi look
      const curves = new ColorCurves();
      curves.globalSaturation   = 18;
      curves.shadowsHue         = 210; // push shadows toward cold blue
      curves.shadowsDensity     = 22;
      curves.shadowsSaturation  = 12;
      curves.highlightsHue      = 38;  // warm golden highlights
      curves.highlightsDensity  = 14;
      pipeline.imageProcessing.colorCurvesEnabled = true;
      pipeline.imageProcessing.colorCurves = curves;

      // Fine animated film grain — texture, not noise (kept subtle)
      pipeline.grainEnabled = true;
      pipeline.grain.intensity = 7;
      pipeline.grain.animated = true;

      // Whisper of chromatic aberration at the frame edges (anamorphic lens
      // fringing) + sharpen so the center of frame stays crisp.
      pipeline.chromaticAberrationEnabled = true;
      pipeline.chromaticAberration.aberrationAmount = 12;
      pipeline.chromaticAberration.radialIntensity = 0.85;
      pipeline.sharpenEnabled = true;
      pipeline.sharpen.edgeAmount = 0.3;
      pipeline.sharpen.colorAmount = 1.0;

      // Depth of field can read as "blurry" on wide scenes.
      // Keep it OFF by default; it will be enabled when you want a cinematic focus pull.
      pipeline.depthOfFieldEnabled = this.enableDepthOfField;
      if (pipeline.depthOfFieldEnabled) {
        pipeline.depthOfFieldBlurLevel = 0;
        pipeline.depthOfField.fStop = 2.8;
        pipeline.depthOfField.focalLength = 60;
        pipeline.depthOfField.focusDistance = 2500;
      }

      this.cinematicPipeline = pipeline;
    } catch (_e) {
      // Post-processing unavailable in this environment
    }
  }

  /**
   * Procedural deep-space dome rendered entirely on the GPU in one draw call:
   * three parallax layers of twinkling stars, a clumpy milky-way band with
   * dark dust lanes and a warm galactic core, plus layered colored nebulae.
   * Replaces the old particle star field + particle nebulae (thousands of
   * CPU-simulated quads) — massively cheaper AND far more cinematic.
   */
  private createCinematicSky(scene: Scene): void {
    const sky = MeshBuilder.CreateSphere(
      'skyDome',
      { diameter: 3000, segments: 24, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    const skyMat = new ShaderMaterial('skyMaterial', scene, 'cinematicSky', {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'time'],
    });
    skyMat.setFloat('time', 0);
    skyMat.backFaceCulling = false;
    sky.material = skyMat;
    sky.isPickable = false;
    sky.applyFog = false;
    sky.alwaysSelectAsActiveMesh = true; // skip pointless frustum tests
    sky.freezeWorldMatrix();
    this.skyMaterial = skyMat;

    // The dome must not occlude the god rays (it sits behind everything).
    if (this.godRays) {
      this.godRays.excludedMeshes.push(sky);
    }
  }

  /** Sparse drifting dust motes near the system — foreground parallax depth. */
  private createSpaceDust(): void {
    const dustTex = new DynamicTexture('dustTex', 32, this.scene, false);
    const dCtx = dustTex.getContext() as CanvasRenderingContext2D;
    const dG = dCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    dG.addColorStop(0,   'rgba(255,255,255,1)');
    dG.addColorStop(0.4, 'rgba(210,225,255,0.5)');
    dG.addColorStop(1,   'rgba(0,0,0,0)');
    dCtx.fillStyle = dG; dCtx.fillRect(0, 0, 32, 32);
    dustTex.update();

    const dust = new ParticleSystem('spaceDust', 300, this.scene);
    dust.emitter = Vector3.Zero();
    dust.minEmitBox = new Vector3(-140, -60, -140);
    dust.maxEmitBox = new Vector3(140, 60, 140);
    dust.particleTexture = dustTex;
    dust.minSize = 0.05; dust.maxSize = 0.22;
    dust.minLifeTime = 18; dust.maxLifeTime = 34;
    dust.emitRate = 11;
    dust.blendMode = ParticleSystem.BLENDMODE_ADD;
    dust.minEmitPower = 0.01; dust.maxEmitPower = 0.06;
    dust.color1 = new Color4(0.75, 0.82, 1.0, 0.32);
    dust.color2 = new Color4(0.95, 0.9, 0.8, 0.2);
    dust.colorDead = new Color4(0.5, 0.55, 0.8, 0);
    dust.preWarmCycles = 220; // field is already populated on first frame
    dust.preWarmStepOffset = 8;
    dust.start();

    this.starFieldParticleSystem = dust;
  }

  private createMeteorSystem(): void {
    // Rare, slow comets with sun-blown twin tails — an event, not confetti
    this.meteorInterval = window.setInterval(() => {
      this.spawnMeteor();
    }, 20000);
    // First one arrives early so new visitors see it
    const firstComet = window.setTimeout(() => this.spawnMeteor(), 6000);
    this.meteorTimeouts.push(firstComet);
  }

  private spawnMeteor(): void {
    // Random starting position on the edge of the scene
    const angle = Math.random() * Math.PI * 2;
    const distance = 150;
    const startPos = new Vector3(
      Math.cos(angle) * distance,
      (Math.random() - 0.5) * 50,
      Math.sin(angle) * distance,
    );

    // Target position (opposite side)
    const endPos = new Vector3(
      -startPos.x + (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 50,
      -startPos.z + (Math.random() - 0.5) * 30,
    );

    // Comet nucleus — small, icy-bright
    const meteor = MeshBuilder.CreateSphere(
      'meteor',
      { diameter: 0.4, segments: 8 },
      this.scene,
    );
    meteor.position = startPos.clone();

    const meteorMat = new StandardMaterial('meteorMat', this.scene);
    meteorMat.emissiveColor = new Color3(0.85, 0.95, 1.0);
    meteorMat.diffuseColor = new Color3(0.5, 0.55, 0.6);
    meteorMat.specularColor = Color3.Black();
    meteor.material = meteorMat;

    // ── Dust tail — wide, warm-white, pushed AWAY from the sun ──────────
    const trailTexture = new DynamicTexture(
      'trailTexture',
      64,
      this.scene,
      false,
    );
    const ctx = trailTexture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0,   'rgba(255, 250, 235, 1)');
    gradient.addColorStop(0.3, 'rgba(230, 225, 205, 0.7)');
    gradient.addColorStop(0.7, 'rgba(190, 190, 200, 0.25)');
    gradient.addColorStop(1,   'rgba(120, 130, 160, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    trailTexture.update();

    const trail = new ParticleSystem('meteorTrail', 260, this.scene);
    trail.emitter = meteor;
    trail.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
    trail.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
    trail.particleTexture = trailTexture;
    trail.minSize = 0.3;
    trail.maxSize = 1.3;
    trail.minLifeTime = 1.2;
    trail.maxLifeTime = 2.6;
    trail.emitRate = 90;
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    trail.gravity = new Vector3(0, 0, 0);
    trail.direction1 = new Vector3(1, 0, 0);
    trail.direction2 = new Vector3(1, 0, 0);
    trail.minEmitPower = 1.2;
    trail.maxEmitPower = 2.6;
    trail.updateSpeed = 0.02;
    trail.color1 = new Color4(1, 0.98, 0.9, 0.8);
    trail.color2 = new Color4(0.85, 0.85, 0.9, 0.5);
    trail.colorDead = new Color4(0.4, 0.45, 0.6, 0);
    trail.start();
    this.meteorParticleSystems.push(trail);

    // ── Ion tail — thin, electric blue, faster and straighter ───────────
    const ion = new ParticleSystem('meteorIonTail', 200, this.scene);
    ion.emitter = meteor;
    ion.minEmitBox = new Vector3(-0.04, -0.04, -0.04);
    ion.maxEmitBox = new Vector3(0.04, 0.04, 0.04);
    ion.particleTexture = trailTexture;
    ion.minSize = 0.12;
    ion.maxSize = 0.45;
    ion.minLifeTime = 0.9;
    ion.maxLifeTime = 1.8;
    ion.emitRate = 110;
    ion.blendMode = ParticleSystem.BLENDMODE_ADD;
    ion.direction1 = new Vector3(1, 0, 0);
    ion.direction2 = new Vector3(1, 0, 0);
    ion.minEmitPower = 4.0;
    ion.maxEmitPower = 7.0;
    ion.updateSpeed = 0.02;
    ion.color1 = new Color4(0.45, 0.7, 1.0, 0.9);
    ion.color2 = new Color4(0.25, 0.5, 1.0, 0.5);
    ion.colorDead = new Color4(0.1, 0.2, 0.8, 0);
    ion.start();
    this.meteorParticleSystems.push(ion);

    // Both tails always stream anti-sunward (sun sits at the origin) — the
    // detail that makes it read as a comet rather than a firework.
    const tailUpdate = this.scene.onBeforeRenderObservable.add(() => {
      const away = meteor.position.clone().normalize();
      trail.direction1.copyFrom(away.scale(0.85).add(new Vector3(0.1, 0.08, -0.1)));
      trail.direction2.copyFrom(away.scale(1.15).add(new Vector3(-0.1, -0.08, 0.1)));
      ion.direction1.copyFrom(away);
      ion.direction2.copyFrom(away);
    });

    // Animate comet movement — a slow, stately crossing
    const distance_total = Vector3.Distance(startPos, endPos);
    const speed = 12; // Units per second (~25s to cross the system)
    const duration = (distance_total / speed) * 1000; // Convert to milliseconds

    // Create animation
    const animKeys = [];
    animKeys.push({ frame: 0, value: startPos });
    animKeys.push({ frame: 60, value: endPos });

    const anim = new Animation(
      'meteorAnim',
      'position',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    anim.setKeys(animKeys);
    meteor.animations.push(anim);

    // Run animation (speed ratio converts the 60-frame track to `duration`)
    this.scene.beginAnimation(meteor, 0, 60, false, 1000 / duration, () => {
      // Cleanup after animation
      trail.stop();
      ion.stop();
      this.scene.onBeforeRenderObservable.remove(tailUpdate);
      const timeoutId = window.setTimeout(() => {
        meteor.dispose(false, true);
        for (const sys of [trail, ion]) {
          sys.dispose();
          const index = this.meteorParticleSystems.indexOf(sys);
          if (index > -1) {
            this.meteorParticleSystems.splice(index, 1);
          }
        }
      }, 3000);
      this.meteorTimeouts.push(timeoutId);
    });
  }

  private createPlanet(id: string, data: PlanetData): Mesh {
    // Create planet mesh based on shape type (default to sphere for backward compatibility)
    const shape = data.shape || 'sphere';
    let planet: Mesh;

    switch (shape) {
      case 'cube':
        planet = MeshBuilder.CreateBox(id, { size: data.size }, this.scene);
        break;
      case 'torus':
        planet = MeshBuilder.CreateTorus(
          id,
          { diameter: data.size, thickness: data.size * 0.3, tessellation: 64 },
          this.scene,
        );
        break;
      case 'octahedron':
        planet = MeshBuilder.CreatePolyhedron(
          id,
          { type: 1, size: data.size * 0.6 },
          this.scene,
        );
        break;
      case 'dodecahedron':
        planet = MeshBuilder.CreatePolyhedron(
          id,
          { type: 2, size: data.size * 0.6 },
          this.scene,
        );
        break;
      case 'icosahedron':
        planet = MeshBuilder.CreatePolyhedron(
          id,
          { type: 0, size: data.size * 0.6 },
          this.scene,
        );
        break;
      case 'cylinder':
        planet = MeshBuilder.CreateCylinder(
          id,
          { diameter: data.size, height: data.size * 1.2, tessellation: 32 },
          this.scene,
        );
        break;
      case 'sphere':
      default:
        // Create planet sphere with high detail for cinematic look.
        // (Keep segments bounded for performance on mid-range GPUs.)
        planet = MeshBuilder.CreateSphere(
          id,
          { diameter: data.size, segments: 48 },
          this.scene,
        );
        break;
    }

    planet.position = new Vector3(
      data.position.x,
      data.position.y,
      data.position.z,
    );

    // Ensure planet is pickable
    planet.isPickable = true;

    // Deterministic per-planet seed + axial tilt (movie planets never sit
    // perfectly upright)
    const seed = this.hashString(id);
    planet.rotation.z = ((seed % 100) / 100 - 0.5) * 0.55;

    const kind = this.getPlanetKind(data);

    if (shape === 'sphere') {
      // ── Procedural GPU planet surface — continents, storm bands, magma…
      const material = new ShaderMaterial(`mat_${id}`, this.scene, 'cinematicPlanet', {
        attributes: ['position', 'normal'],
        uniforms: [
          'world', 'worldViewProjection', 'cameraPosition', 'sunPosition',
          'baseColor', 'kind', 'seed', 'time', 'nightLights',
        ],
      });
      material.setVector3('sunPosition', Vector3.Zero());
      material.setColor3('baseColor', Color3.FromHexString(data.color));
      material.setFloat('kind', kind.kind);
      material.setFloat('seed', (seed % 1000) / 41.7);
      material.setFloat('time', 0);
      material.setFloat('nightLights', kind.nightLights ? 1 : 0);
      material.backFaceCulling = true;
      planet.material = material;
      this.planetShaderMats.push(material);
    } else {
      // ── Geometric worlds keep the PBR + canvas-texture look ───────────
      const material = new PBRMaterial(`mat_${id}`, this.scene);
      const planetTexture = this.createPlanetTexture(data.name, data.color);
      material.albedoTexture = planetTexture;
      material.albedoColor   = Color3.FromHexString(data.color).scale(1.05);
      material.metallic  = 0.06;
      material.roughness = 0.6;
      const bumpTexture = this.createBumpTexture();
      material.bumpTexture       = bumpTexture;
      material.bumpTexture.level = 1.6;
      material.usePhysicalLightFalloff = false;
      material.emissiveColor     = Color3.FromHexString(data.color).scale(0.08);
      material.directIntensity   = 1.7;
      material.environmentIntensity = 0.4;
      material.alpha             = 1.0;
      material.alphaMode         = Engine.ALPHA_DISABLE;
      material.transparencyMode  = null;
      planet.material = material;
    }

    // Atmosphere + clouds (for spherical planets only)
    if (shape === 'sphere') {
      this.addAtmosphereLayer(planet, data, kind.kind);
      // Clouds only where they make sense — living/ocean/ice worlds.
      if (kind.kind === 4 || kind.kind === 2) {
        this.addCloudLayer(planet, data);
      }
    }

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
      this.createInclinedOrbitPath(
        id,
        data.orbitRadius,
        data.orbitInclination || 0,
      );
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
      }),
    );

    // Also add a hover effect to show the planet is interactive
    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        this.playSound('hover');
        planet.scaling = new Vector3(1.05, 1.05, 1.05);
        this.showPlanetTooltip(id);
      }),
    );

    planet.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
        planet.scaling = new Vector3(1, 1, 1);
        this.hidePlanetTooltip();
      }),
    );

    // Store references
    this.planets.set(id, planet);
    this.planetDataMap.set(id, data);

    return planet;
  }

  /** Simple deterministic string hash for per-planet seeds. */
  private hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  /**
   * Classifies a planet into a shader surface type.
   * kind: 0 rocky · 1 gas · 2 ice · 3 lava · 4 terra · 5 tech
   */
  private getPlanetKind(data: PlanetData): { kind: number; nightLights: boolean } {
    const n = data.name;
    const has = (...words: string[]) => words.some((w) => n.includes(w));

    if (n === 'Earth') return { kind: 4, nightLights: true };
    if (has('Mercury', 'Mars', 'Moon')) return { kind: 0, nightLights: false };
    if (has('Venus', 'Jupiter', 'Saturn', 'Uranus', 'Neptune')) {
      return { kind: 1, nightLights: false };
    }
    if (has('Pyros', 'Magmara', 'Blazeon', 'Ember', 'Inferno')) {
      return { kind: 3, nightLights: false };
    }
    if (has('Luminos', 'Celestia')) return { kind: 3, nightLights: false };
    if (has('Crystalia', 'Prisma', 'Frost', 'Glacia', 'Ice')) {
      return { kind: 2, nightLights: false };
    }
    if (has('Neptara', 'Tidalis', 'Marinius', 'Aqua')) {
      return { kind: 4, nightLights: false };
    }
    if (has('Floralis', 'Junglios', 'Vineworld', 'Terra')) {
      return { kind: 4, nightLights: false };
    }
    if (has('Cubix', 'Octara', 'Dodeca', 'Icosa', 'Cylios')) {
      return { kind: 5, nightLights: true };
    }

    // Fallback: big planets read as gas giants, blue ones as ocean worlds,
    // the rest as rocky.
    if (data.size >= 3.5) return { kind: 1, nightLights: false };
    const c = Color3.FromHexString(data.color);
    if (c.b > c.r && c.b > c.g) return { kind: 4, nightLights: false };
    return { kind: 0, nightLights: false };
  }

  /**
   * View-dependent atmospheric scattering shell. The limb glows where sunlight
   * grazes it and fades into the night side — the classic movie-planet rim.
   */
  private addAtmosphereLayer(planet: Mesh, data: PlanetData, kind: number = 0): Mesh {
    const atmo = MeshBuilder.CreateSphere(
      `${planet.name}_atmosphere`,
      { diameter: data.size * 1.09, segments: 48 },
      this.scene,
    );
    atmo.parent = planet;
    atmo.isPickable = false;

    // Atmosphere tint follows the world type: lava worlds smolder orange,
    // everything else scatters toward blue like real air.
    const c = Color3.FromHexString(data.color);
    let tint: Color3;
    if (kind === 3) {
      tint = new Color3(
        Math.min(1, c.r * 0.7 + 0.45),
        Math.min(1, c.g * 0.5 + 0.16),
        Math.min(1, c.b * 0.3 + 0.05),
      );
    } else {
      tint = new Color3(
        Math.min(1, c.r * 0.55 + 0.18),
        Math.min(1, c.g * 0.6 + 0.26),
        Math.min(1, c.b * 0.7 + 0.42),
      );
    }
    atmo.material = this.makeAtmosphereRimMaterial(
      `${planet.name}_atmoMat`, tint, 1.6, 3.4,
    );

    // Additive shells must not stamp occluders into the god-ray pass.
    if (this.godRays) this.godRays.excludedMeshes.push(atmo);

    return atmo;
  }

  private makeAtmosphereRimMaterial(
    name: string,
    color: Color3,
    strength: number,
    falloff: number,
  ): ShaderMaterial {
    const mat = new ShaderMaterial(name, this.scene, 'atmosphereRim', {
      attributes: ['position', 'normal'],
      uniforms: [
        'world', 'worldViewProjection', 'cameraPosition',
        'sunPosition', 'atmoColor', 'atmoStrength', 'atmoFalloff',
      ],
      needAlphaBlending: true,
    });
    mat.setVector3('sunPosition', Vector3.Zero());
    mat.setColor3('atmoColor', color);
    mat.setFloat('atmoStrength', strength);
    mat.setFloat('atmoFalloff', falloff);
    mat.alphaMode = Engine.ALPHA_ADD;
    mat.backFaceCulling = true;
    return mat;
  }

  private addCloudLayer(planet: Mesh, data: PlanetData): Mesh {
    // Cloud shell:
    // A second, slightly larger sphere with an alpha noise texture.
    // For real 4K cloud maps, replace the DynamicTexture with `new Texture(...)`.
    const clouds = MeshBuilder.CreateSphere(
      `${planet.name}_clouds`,
      { diameter: data.size * 1.025, segments: 32 },
      this.scene,
    );
    clouds.parent = planet;
    clouds.isPickable = false;

    const cloudsMat = new PBRMaterial(`${planet.name}_cloudMat`, this.scene);
    cloudsMat.metallic = 0;
    cloudsMat.roughness = 1;
    cloudsMat.alpha = 0.42;
    cloudsMat.alphaMode = Engine.ALPHA_COMBINE;
    // Near-zero emissive: clouds should be LIT by the sun, not self-glow,
    // or the whole planet disc washes out to a pale veil.
    cloudsMat.emissiveColor = new Color3(0.03, 0.04, 0.05);
    cloudsMat.environmentIntensity = 0.15;

    const cloudTex = new DynamicTexture(`${planet.name}_cloudTex`, 256, this.scene, false);
    const ctx = cloudTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 512, 512);

    // Cheap fractal-ish noise using many blurred circles.
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 6 + Math.random() * 28;
      const a = 0.025 + Math.random() * 0.07;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    cloudTex.update();

    cloudsMat.opacityTexture = cloudTex;
    cloudsMat.albedoColor = new Color3(1, 1, 1);
    cloudsMat.useAlphaFromAlbedoTexture = false;

    clouds.material = cloudsMat;

    // Slow cloud rotation — unregistered when the planet is disposed so
    // galaxy switches don't accumulate dead callbacks.
    const rotateClouds = () => {
      clouds.rotation.y += 0.0008 * this.scene.getAnimationRatio();
    };
    this.scene.registerBeforeRender(rotateClouds);
    clouds.onDisposeObservable.add(() => {
      this.scene.unregisterBeforeRender(rotateClouds);
    });

    if (this.godRays) this.godRays.excludedMeshes.push(clouds);

    return clouds;
  }

  private createPlanetTexture(
    planetName: string,
    baseColor: string,
  ): DynamicTexture {
    const texture = new DynamicTexture(
      `planetTex_${planetName}`,
      1024,
      this.scene,
      false,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    // Base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 1024, 1024);

    // Add artistic variations for all planets - more detailed and unique
    switch (planetName) {
      case 'Mercury':
        // Rocky surface with craters
        this.addCraters(ctx, 50, baseColor);
        break;
      case 'Venus':
        // Thick clouds
        this.addClouds(ctx, '#FFA54F', 30);
        break;
      case 'Earth':
        // Continents and oceans
        this.addContinents(ctx);
        break;
      case 'Mars':
        // Red desert with darker regions
        this.addMarsFeatures(ctx);
        break;
      case 'Jupiter':
        // Gas bands
        this.addGasBands(ctx, '#DAA520', '#B8860B');
        break;
      case 'Saturn':
        // Similar gas bands but lighter
        this.addGasBands(ctx, '#F4A460', '#DEB887');
        break;
      case 'Uranus':
        // Icy blue with subtle bands
        this.addGasBands(ctx, '#4682B4', '#5F9EA0');
        break;
      case 'Neptune':
        // Deep blue with storm spots
        this.addStormSpots(ctx);
        break;
      default:
        // For new galaxies' planets, add unique artistic patterns
        if (planetName.includes('Crystalia') || planetName.includes('Prisma')) {
          // Crystalline pattern
          this.addCrystalPattern(ctx, baseColor);
        } else if (
          planetName.includes('Luminos') ||
          planetName.includes('Celestia')
        ) {
          // Glowing energy pattern
          this.addEnergyPattern(ctx, baseColor);
        } else if (
          planetName.includes('Pyros') ||
          planetName.includes('Magmara') ||
          planetName.includes('Blazeon')
        ) {
          // Lava/fire pattern
          this.addLavaPattern(ctx, baseColor);
        } else if (
          planetName.includes('Neptara') ||
          planetName.includes('Tidalis') ||
          planetName.includes('Marinius')
        ) {
          // Water/ocean pattern
          this.addWaterPattern(ctx, baseColor);
        } else if (
          planetName.includes('Floralis') ||
          planetName.includes('Junglios') ||
          planetName.includes('Vineworld')
        ) {
          // Organic/vegetation pattern
          this.addVegetationPattern(ctx, baseColor);
        } else if (
          planetName.includes('Cubix') ||
          planetName.includes('Octara') ||
          planetName.includes('Dodeca') ||
          planetName.includes('Icosa')
        ) {
          // Geometric/tech pattern
          this.addTechPattern(ctx, baseColor);
        } else {
          // Default artistic pattern - swirls and textures
          this.addArtisticSwirls(ctx, baseColor);
        }
        break;
    }

    texture.update();
    return texture;
  }

  private createBumpTexture(): DynamicTexture {
    const texture = new DynamicTexture('bumpTex', 512, this.scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    // Neutral base, then layered soft blobs — reads as rolling terrain
    // instead of pixel noise when lit by the sun.
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 6 + Math.random() * 34;
      const up = Math.random() > 0.5;
      const a = 0.08 + Math.random() * 0.14;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, up ? `rgba(220,220,220,${a})` : `rgba(40,40,40,${a})`);
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    texture.update();
    return texture;
  }

  private addCraters(
    ctx: CanvasRenderingContext2D,
    count: number,
    baseColor: string,
  ): void {
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

  private addClouds(
    ctx: CanvasRenderingContext2D,
    color: string,
    count: number,
  ): void {
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

  private addGasBands(
    ctx: CanvasRenderingContext2D,
    color1: string,
    color2: string,
  ): void {
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

  private addCrystalPattern(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create crystalline facets
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 60 + 30;
      const sides = Math.floor(Math.random() * 3) + 5; // 5-7 sides

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI * 2);
      ctx.beginPath();
      for (let j = 0; j < sides; j++) {
        const angle = (j * Math.PI * 2) / sides;
        const px = Math.cos(angle) * size;
        const py = Math.sin(angle) * size;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(200, 200, 255, ${Math.random() * 0.5 + 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private addEnergyPattern(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create glowing energy streams
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      const startX = Math.random() * 1024;
      const startY = Math.random() * 1024;
      ctx.moveTo(startX, startY);

      // Create wavy line
      for (let j = 0; j < 10; j++) {
        const x = startX + j * 100 + (Math.random() - 0.5) * 50;
        const y = startY + (Math.random() - 0.5) * 200;
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = `rgba(255, 255, 100, ${Math.random() * 0.4 + 0.2})`;
      ctx.lineWidth = Math.random() * 4 + 2;
      ctx.stroke();

      // Add glow
      ctx.strokeStyle = `rgba(255, 255, 200, ${Math.random() * 0.2 + 0.1})`;
      ctx.lineWidth = Math.random() * 8 + 4;
      ctx.stroke();
    }
  }

  private addLavaPattern(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create lava flows and cracks
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const length = Math.random() * 200 + 100;
      const angle = Math.random() * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(x, y);

      // Create branching cracks
      for (let j = 0; j < 5; j++) {
        const dx = Math.cos(angle + (Math.random() - 0.5) * 0.5) * (length / 5);
        const dy = Math.sin(angle + (Math.random() - 0.5) * 0.5) * (length / 5);
        ctx.lineTo(x + dx * j, y + dy * j);
      }

      ctx.strokeStyle = `rgba(255, ${100 + Math.random() * 50}, 0, ${Math.random() * 0.6 + 0.3})`;
      ctx.lineWidth = Math.random() * 3 + 1;
      ctx.stroke();
    }
  }

  private addWaterPattern(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create wave patterns
    for (let i = 0; i < 25; i++) {
      const y = Math.random() * 1024;
      ctx.beginPath();
      ctx.moveTo(0, y);

      // Create wave
      for (let x = 0; x <= 1024; x += 20) {
        const wave = Math.sin((x + i * 50) * 0.01) * 10;
        ctx.lineTo(x, y + wave);
      }

      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.2 + 0.05})`;
      ctx.lineWidth = Math.random() * 2 + 1;
      ctx.stroke();
    }

    // Add ripples
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const maxRadius = Math.random() * 40 + 20;

      for (let r = 5; r < maxRadius; r += 8) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 - (r / maxRadius) * 0.3})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private addVegetationPattern(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create organic, leafy patterns
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 40 + 20;

      // Draw leaf-like shapes
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI * 2);

      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(size * 0.6, -size * 0.5, size * 0.3, 0);
      ctx.quadraticCurveTo(size * 0.6, size * 0.5, 0, size);
      ctx.quadraticCurveTo(-size * 0.6, size * 0.5, -size * 0.3, 0);
      ctx.quadraticCurveTo(-size * 0.6, -size * 0.5, 0, -size);

      ctx.fillStyle = `rgba(${50 + Math.random() * 100}, ${150 + Math.random() * 105}, ${50 + Math.random() * 100}, ${Math.random() * 0.4 + 0.2})`;
      ctx.fill();

      ctx.restore();
    }
  }

  private addTechPattern(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create circuit-like technological patterns
    ctx.strokeStyle = `rgba(100, 200, 255, 0.4)`;
    ctx.lineWidth = 2;

    // Grid lines
    for (let i = 0; i < 1024; i += 64) {
      // Vertical lines
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);
      ctx.stroke();

      // Horizontal lines
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
      ctx.stroke();
    }

    // Circuit nodes
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(Math.random() * 16) * 64;
      const y = Math.floor(Math.random() * 16) * 64;
      const size = Math.random() * 10 + 5;

      ctx.fillStyle = `rgba(100, 255, 255, ${Math.random() * 0.6 + 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // Connecting lines
      const connections = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < connections; j++) {
        const targetX = Math.floor(Math.random() * 16) * 64;
        const targetY = Math.floor(Math.random() * 16) * 64;
        ctx.strokeStyle = `rgba(100, 200, 255, ${Math.random() * 0.3 + 0.2})`;
        ctx.lineWidth = Math.random() * 2 + 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
      }
    }
  }

  private addArtisticSwirls(
    ctx: CanvasRenderingContext2D,
    baseColor: string,
  ): void {
    // Create artistic swirls and patterns
    for (let i = 0; i < 15; i++) {
      const centerX = Math.random() * 1024;
      const centerY = Math.random() * 1024;
      const spirals = Math.floor(Math.random() * 3) + 2;

      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 4; angle += 0.1) {
        const radius = angle * 10;
        const x = centerX + Math.cos(angle * spirals) * radius;
        const y = centerY + Math.sin(angle * spirals) * radius;

        if (angle === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.2 + 0.1})`;
      ctx.lineWidth = Math.random() * 3 + 1;
      ctx.stroke();
    }
  }

  private addPlanetSpecificEffects(
    planet: Mesh,
    planetName: string,
    radius: number,
  ): void {
    // Add enhanced glow for non-sphere shapes
    const planetData = Array.from(this.planetDataMap.values()).find(
      (p) => p.name === planetName,
    );
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

    switch (planetName) {
      case 'Mercury':
        // Hot surface shimmer - no atmosphere
        break;
      case 'Venus':
        // Thick atmosphere glow
        this.addAtmosphereGlow(planet, new Color3(1, 0.8, 0.4), 1.3, radius);
        this.addCloudParticles(planet, new Color3(0.9, 0.8, 0.5), radius);
        break;
      case 'Earth':
        // Blue atmosphere
        this.addAtmosphereGlow(planet, new Color3(0.3, 0.5, 1), 1.2, radius);
        this.addCloudParticles(planet, new Color3(1, 1, 1), radius);
        break;
      case 'Mars':
        // Thin reddish atmosphere with dust
        this.addAtmosphereGlow(planet, new Color3(0.8, 0.4, 0.3), 1.15, radius);
        this.addDustParticles(planet, radius);
        break;
      case 'Jupiter':
        // Gas giant with storm particles
        this.addAtmosphereGlow(planet, new Color3(0.9, 0.7, 0.4), 1.25, radius);
        this.addStormParticles(planet, radius);
        break;
      case 'Saturn':
        // Rings!
        this.addRings(planet, radius);
        this.addAtmosphereGlow(planet, new Color3(0.95, 0.8, 0.6), 1.2, radius);
        break;
      case 'Uranus':
        // Icy blue glow
        this.addAtmosphereGlow(planet, new Color3(0.4, 0.7, 0.9), 1.18, radius);
        break;
      case 'Neptune':
        // Deep blue with active atmosphere
        this.addAtmosphereGlow(planet, new Color3(0.2, 0.5, 1), 1.2, radius);
        this.addStormParticles(planet, radius);
        break;
      default:
        // For new galaxies' planets, add subtle atmosphere based on their properties
        if (
          planetName.includes('Cubix') ||
          planetName.includes('Octara') ||
          planetName.includes('Dodeca') ||
          planetName.includes('Icosa') ||
          planetName.includes('Cylios')
        ) {
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

  private addAtmosphereGlow(
    planet: Mesh,
    color: Color3,
    scale: number,
    radius: number,
  ): void {
    // Single soft outer halo using the scattering rim shader — replaces the
    // old pair of alpha-blended shells (half the overdraw, better look).
    const halo = MeshBuilder.CreateSphere(
      `atmo_${planet.name}`,
      { diameter: radius * 2 * scale, segments: 32 },
      this.scene,
    );
    halo.parent = planet;
    halo.position = Vector3.Zero();
    halo.isPickable = false;
    halo.material = this.makeAtmosphereRimMaterial(
      `atmoMat_${planet.name}`, color, 1.0, 2.4,
    );
    if (this.godRays) this.godRays.excludedMeshes.push(halo);
  }

  private addCloudParticles(planet: Mesh, color: Color3, radius: number): void {
    const clouds = new ParticleSystem(`clouds_${planet.name}`, 100, this.scene);
    clouds.emitter = planet;

    const sphereEmitter = new SphereParticleEmitter(radius * 0.55);
    clouds.particleEmitterType = sphereEmitter;

    // Cloud texture
    const cloudTexture = new DynamicTexture('cloudTex', 32, this.scene, false);
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
    const dustTexture = new DynamicTexture('dustTex', 16, this.scene, false);
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
    const stormTexture = new DynamicTexture('stormTex', 32, this.scene, false);
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
    // One flat annulus with hundreds of fine concentric bands painted into a
    // single texture — reads like actual Saturn photography instead of the
    // old stack of seven glowing donuts.
    const outerScale = 3.8;
    const innerScale = 1.35;
    const S = 1024;
    const tex = new DynamicTexture(`ringsTex_${planet.name}`, S, this.scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const c = S / 2;

    ctx.clearRect(0, 0, S, S);

    // Named gaps (Cassini/Encke analogues) as fractions of the ring span
    const gaps = [
      { at: 0.62, w: 0.045 },
      { at: 0.83, w: 0.015 },
      { at: 0.35, w: 0.02 },
    ];

    const rInPx = (innerScale / outerScale) * c;
    for (let px = Math.floor(rInPx); px < c; px++) {
      const t = (px - rInPx) / (c - rInPx); // 0 inner → 1 outer
      // Layered sine density — fine grooves over broad bands
      let density =
        0.5 +
        Math.sin(t * Math.PI * 14) * 0.16 +
        Math.sin(t * Math.PI * 43 + 1.7) * 0.10 +
        Math.sin(t * Math.PI * 90 + 0.4) * 0.06 +
        Math.cos(t * Math.PI * 6) * 0.14;
      // Broad structure: C ring translucent, B ring dense, A ring medium
      density *= t < 0.25 ? 0.45 + t : t > 0.85 ? 1.4 - t : 1.0;
      // Carve the gaps
      for (const gap of gaps) {
        const d = Math.abs(t - gap.at) / gap.w;
        if (d < 1) density *= d * d;
      }
      // Soft outer/inner edges
      density *= Math.min(1, t * 12) * Math.min(1, (1 - t) * 8);
      const a = Math.max(0, Math.min(0.92, density));
      // Icy cream color, slightly warmer toward the planet
      const warm = 1 - t * 0.25;
      const rr = Math.round(232 * warm);
      const gg = Math.round(215 * warm);
      const bb = Math.round(178 * warm * (0.92 + t * 0.15));
      ctx.strokeStyle = `rgba(${rr},${gg},${bb},${a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c, c, px, 0, Math.PI * 2);
      ctx.stroke();
    }
    tex.update();

    const ring = MeshBuilder.CreatePlane(
      `rings_${planet.name}`,
      { size: radius * 2 * outerScale },
      this.scene,
    );
    ring.parent = planet;
    ring.position = Vector3.Zero();
    ring.rotation.x = Math.PI / 2; // equatorial plane (planet carries the tilt)
    ring.isPickable = false;

    const ringMat = new StandardMaterial(`ringsMat_${planet.name}`, this.scene);
    // Rings sit edge-on to the sun, so diffuse lighting dies at grazing
    // angles — render them self-lit from the painted texture instead, the
    // way backscattered ice actually looks.
    ringMat.diffuseTexture = tex;
    ringMat.diffuseTexture.hasAlpha = true;
    ringMat.useAlphaFromDiffuseTexture = true;
    ringMat.emissiveTexture = tex;
    ringMat.disableLighting = true;
    ringMat.specularColor = Color3.Black();
    ringMat.backFaceCulling = false;
    ring.material = ringMat;
  }

  private addEnergyField(planet: Mesh, radius: number): void {
    // Create energy field effect for geometric/tech planets
    const field = MeshBuilder.CreateSphere(
      `field_${planet.name}`,
      { diameter: radius * 2 * 1.4, segments: 16 },
      this.scene,
    );
    field.parent = planet;
    field.position = Vector3.Zero();
    field.isPickable = false;

    const fieldMat = new StandardMaterial(
      `fieldMat_${planet.name}`,
      this.scene,
    );
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
      this.scene,
    );
    plane.parent = planet;

    // Position label above planet, centered (no left/right offset)
    // Scale position based on planet size to ensure visibility
    const planetSize = planet.scaling.x || 1;
    const offset = Math.max(2.5, planetSize * 1.5); // Larger offset for bigger planets
    plane.position = new Vector3(0, offset, 0); // Centered - no Z offset

    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false; // Don't block planet picking

    // Render label on top by setting render order
    plane.renderingGroupId = 1; // Higher rendering group to draw on top

    // Create dynamic texture for text
    const texture = new DynamicTexture(
      `texture_${planet.name}`,
      { width: 512, height: 128 },
      this.scene,
      true,
    );
    texture.hasAlpha = true;

    // Draw text with semi-transparent background and rounded corners
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    // Draw rounded rectangle background
    const x = 0,
      y = 0,
      width = 512,
      height = 128;
    const radius = 20; // Rounded corner radius

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fill();

    // Draw text centered
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 64);
    texture.update();

    // Apply texture to plane
    const material = new StandardMaterial(
      `labelMat_${planet.name}`,
      this.scene,
    );
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = new Color3(1, 1, 1);
    material.backFaceCulling = false;
    material.disableDepthWrite = false; // Enable depth testing but still visible
    plane.material = material;

    // UI labels must not block the volumetric sun rays.
    if (this.godRays) this.godRays.excludedMeshes.push(plane);
  }

  private onPlanetClick(planet: Mesh, planetId: string): void {
    this.playSound('click');
    this.hidePlanetTooltip();

    // Require authentication
    if (!this.currentUser) {
      const authModal = document.getElementById('authModal');
      const planetModal = document.getElementById('planetModal');
      if (authModal) {
        authModal.style.display = 'block';
        if (planetModal) (planetModal as any).dataset.pendingPlanetId = planetId;
      }
      return;
    }

    this.selectedPlanet = planet;
    this.updateCinematicFocusTarget();
    const modal = document.getElementById('planetModal');
    const nameInput = document.getElementById('planetName') as HTMLInputElement;
    const descInput = document.getElementById(
      'planetDescription',
    ) as HTMLTextAreaElement;

    if (modal && nameInput && descInput) {
      // Load current planet data (use stored data or fetch once)
      const storedData = this.planetDataMap.get(planetId);
      if (storedData) {
        nameInput.value = storedData.name || '';
        descInput.value = storedData.description || '';
        // Populate customization checkboxes
        this.getAllCustomizationIds().forEach(cid => {
          const cb = document.getElementById(`custom_${cid}`) as HTMLInputElement;
          if (cb) cb.checked = (storedData.customizations || []).includes(cid);
        });
      } else {
        // Fetch once if not in cache
        const sub = this.database
          .object(`planets/${planetId}`)
          .valueChanges()
          .subscribe((data: any) => {
            if (data) {
              nameInput.value = data.name || '';
              descInput.value = data.description || '';
            }
            sub.unsubscribe();
          });
      }

      // Show streak info
      this.updateStreakDisplay(planetId);
      // Update rent section
      this.updateRentSection(planetId);

      this.playSound('modal-open');
      modal.style.display = 'block';
      (modal as any).dataset.planetId = planetId;
    }
  }

  private updateCinematicFocusTarget(): void {
    if (!this.cinematicPipeline || !this.cinematicPipeline.depthOfFieldEnabled) return;
    if (!this.selectedPlanet) return;

    // Approximate focus distance based on current camera -> planet distance.
    const distance = Vector3.Distance(this.camera.position, this.selectedPlanet.getAbsolutePosition());
    // DepthOfFieldEffect uses millimeter-like units; values around 1500–6000 are practical.
    this.cinematicPipeline.depthOfField.focusDistance = Math.max(1200, distance * 30);
  }

  private setupModalInteraction(): void {
    const modal = document.getElementById('planetModal');
    const closeBtn = document.querySelector('#planetModal .close');
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

    // Rent button
    const rentBtn = document.getElementById('rentBtn');
    if (rentBtn) {
      rentBtn.addEventListener('click', () => {
        const planetId = (modal as any)?.dataset?.planetId;
        if (planetId) this.rentPlanet(planetId);
      });
    }

    // Watch ad for rent credits
    const watchAdForRentBtn = document.getElementById('watchAdForRentBtn');
    if (watchAdForRentBtn) {
      watchAdForRentBtn.addEventListener('click', () => {
        const planetId = (modal as any)?.dataset?.planetId || '';
        this.watchAd('rent', planetId);
      });
    }

    // Watch ad for save credits
    const watchAdForSaveBtn = document.getElementById('watchAdForSaveBtn');
    if (watchAdForSaveBtn) {
      watchAdForSaveBtn.addEventListener('click', () => {
        const planetId = (modal as any)?.dataset?.planetId || '';
        this.watchAd('save', planetId);
      });
    }

    // Ad modal claim button
    const adClaimBtn = document.getElementById('adClaimBtn');
    if (adClaimBtn) {
      adClaimBtn.addEventListener('click', () => this.claimAdCredits());
    }

    // Ad modal close
    const adModalClose = document.getElementById('adModalClose');
    const adModal = document.getElementById('adModal');
    if (adModalClose && adModal) {
      adModalClose.addEventListener('click', () => { adModal.style.display = 'none'; });
    }
    window.addEventListener('click', (event) => {
      if (event.target === adModal) adModal!.style.display = 'none';
    });
  }

  private initPayPalButton(): void {
    // PayPal has been replaced by the credits system.
    // This method is kept as a no-op for backwards compatibility.
  }

  // ── Credits System ──────────────────────────────────────────────────────────

  private loadUserCredits(): void {
    if (!this.currentUser) {
      this.userCredits = 0;
      this.updateCreditsUI();
      return;
    }
    const sub = this.database
      .object(`users/${this.currentUser.uid}/credits`)
      .valueChanges()
      .subscribe((credits: any) => {
        this.userCredits = typeof credits === 'number' ? credits : 0;
        this.updateCreditsUI();
      });
    this.subscriptions.push(sub);
  }

  private saveUserCredits(): void {
    if (!this.currentUser) return;
    this.database.object(`users/${this.currentUser.uid}/credits`).set(this.userCredits);
  }

  private updateCreditsUI(): void {
    const creditsDisplay = document.getElementById('creditsDisplay');
    if (creditsDisplay) creditsDisplay.textContent = `💰 ${this.userCredits} credits`;
    // Also refresh planet modal rent section if open
    const modal = document.getElementById('planetModal');
    if (modal && modal.style.display !== 'none') {
      const planetId = (modal as any).dataset.planetId;
      if (planetId) this.updateRentSection(planetId);
    }
  }

  private updateRentSection(planetId: string): void {
    const rentSection = document.getElementById('rentSection');
    if (!rentSection) return;
    const storedData = this.planetDataMap.get(planetId);
    const now = Date.now();
    const isRentedByMe = storedData?.rentedBy === this.currentUser?.uid &&
                         storedData?.rentedUntil && storedData.rentedUntil > now;
    const isRentedByOther = storedData?.rentedBy && storedData.rentedBy !== this.currentUser?.uid &&
                             storedData?.rentedUntil && storedData.rentedUntil > now;
    const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    const rentInfo = document.getElementById('rentInfo');
    const rentBtn = document.getElementById('rentBtn') as HTMLButtonElement;
    const watchAdForRentBtn = document.getElementById('watchAdForRentBtn') as HTMLButtonElement;
    const creditsNeededForSave = document.getElementById('creditsNeededForSave');
    const watchAdForSaveBtn = document.getElementById('watchAdForSaveBtn') as HTMLButtonElement;

    if (isRentedByMe) {
      const expiryDate = new Date(storedData!.rentedUntil!).toLocaleDateString();
      if (rentInfo) rentInfo.textContent = `✅ You rented this planet until ${expiryDate}`;
      if (rentBtn) rentBtn.style.display = 'none';
      if (watchAdForRentBtn) watchAdForRentBtn.style.display = 'none';
      const hasSaveCredits = this.userCredits >= this.CREDITS_SAVE_COST;
      if (creditsNeededForSave) creditsNeededForSave.style.display = hasSaveCredits ? 'none' : 'block';
      if (watchAdForSaveBtn) watchAdForSaveBtn.style.display = hasSaveCredits ? 'none' : 'inline-block';
      if (saveButton) saveButton.style.display = hasSaveCredits ? 'block' : 'none';
    } else if (isRentedByOther) {
      if (rentInfo) rentInfo.textContent = '🔒 This planet is currently rented by someone else';
      if (rentBtn) rentBtn.style.display = 'none';
      if (watchAdForRentBtn) watchAdForRentBtn.style.display = 'none';
      if (creditsNeededForSave) creditsNeededForSave.style.display = 'none';
      if (watchAdForSaveBtn) watchAdForSaveBtn.style.display = 'none';
      if (saveButton) saveButton.style.display = 'none';
    } else {
      // Not rented — show rent button
      if (rentInfo) rentInfo.textContent = `🪐 Rent this planet for ${this.CREDITS_RENT_COST} credits (1 week)`;
      const hasRentCredits = this.userCredits >= this.CREDITS_RENT_COST;
      if (rentBtn) rentBtn.style.display = hasRentCredits ? 'inline-block' : 'none';
      if (watchAdForRentBtn) watchAdForRentBtn.style.display = hasRentCredits ? 'none' : 'inline-block';
      if (creditsNeededForSave) creditsNeededForSave.style.display = 'none';
      if (watchAdForSaveBtn) watchAdForSaveBtn.style.display = 'none';
      if (saveButton) saveButton.style.display = 'none';
    }
  }

  private rentPlanet(planetId: string): void {
    if (!this.currentUser) return;
    if (this.userCredits < this.CREDITS_RENT_COST) {
      this.showNotification('❌ Not enough credits! Watch an ad to earn more.', 'error');
      return;
    }
    const storedData = this.planetDataMap.get(planetId);
    if (!storedData) return;
    this.userCredits -= this.CREDITS_RENT_COST;
    this.saveUserCredits();
    const rentedUntil = Date.now() + this.RENT_DURATION_MS;
    const updatedData = { ...storedData, rentedUntil, rentedBy: this.currentUser.uid };
    this.database.object(`planets/${planetId}`).update({ rentedUntil, rentedBy: this.currentUser.uid });
    this.planetDataMap.set(planetId, updatedData);
    this.showNotification(`🎉 Planet rented for 1 week! You have ${this.userCredits} credits remaining.`, 'success');
    this.updateCreditsUI();
    this.updateRentSection(planetId);
  }

  private watchAd(context: 'rent' | 'save', planetId: string): void {
    console.log('🎬 Opening ad modal for:', context, 'Planet:', planetId);
    
    const adModal = document.getElementById('adModal');
    if (!adModal) return;

    adModal.style.display = 'block';
    (adModal as any).dataset.context = context;
    (adModal as any).dataset.planetId = planetId;

    const adContainer = document.getElementById('adContainer');
    const adTimer = document.getElementById('adTimer');
    const adClaimBtn = document.getElementById('adClaimBtn') as HTMLButtonElement;
    if (adClaimBtn) adClaimBtn.disabled = true;

    // Inject a fresh AdSense ins element each time the modal opens.
    // AdSense requires a new element per push() call; reusing the same ins element
    // will not load a second ad.
    if (adContainer) {
      console.log('🔍 Ad Container found, preparing ad...');
      // Clear previous ad node safely (avoids innerHTML assignment)
      while (adContainer.firstChild) {
        adContainer.removeChild(adContainer.firstChild);
      }
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.style.width = '100%';
      ins.dataset['adClient'] = 'ca-pub-4685187700153873';
      ins.dataset['adSlot']   = '2386376483';
      ins.dataset['adFormat'] = 'auto';
      ins.dataset['fullWidthResponsive'] = 'true';
      adContainer.appendChild(ins);
      console.log('📺 Ad element created:', ins);
      console.log('🔧 AdSense object available:', !!(window as any).adsbygoogle);
      // Defer push() so the browser paints the modal at its final dimensions
      // AND AdSense's lazily-loaded show_ads_impl module finishes loading.
      // 300 ms covers the lazy-load round-trip on moderate mobile connections;
      // 100 ms was too short and caused an async TypeError inside AdSense.
      // The isConnected guard prevents push() on a detached element if the
      // modal is closed before the timeout fires.
      setTimeout(() => {
        if (!ins.isConnected) {
          console.warn('⚠️ Ad element disconnected before push');
          return;
        }
        try {
          console.log('🚀 Pushing ad to AdSense...');
          ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          console.log('✅ AdSense push successful');
          
          // Check if ad loaded after a delay
          setTimeout(() => {
            if (ins.innerHTML.trim() === '') {
              console.warn('⚠️ No ad served (likely localhost or test environment). Showing placeholder.');
              this.showPlaceholderAd(adContainer);
            }
          }, 1500);
        } catch (e) {
          console.error('❌ AdSense push failed:', e);
          this.showPlaceholderAd(adContainer);
        }
      }, 300);
    } else {
      console.error('❌ Ad container not found!');
    }

    // Minimum 30-second viewing window before credits can be claimed.
    let seconds = 30;
    if (adTimer) adTimer.textContent = `Ad ends in ${seconds}s`;
    const interval = window.setInterval(() => {
      seconds--;
      if (adTimer) adTimer.textContent = seconds > 0 ? `Ad ends in ${seconds}s` : 'Ad complete!';
      if (seconds <= 0) {
        clearInterval(interval);
        if (adClaimBtn) adClaimBtn.disabled = false;
      }
    }, 1000);
  }

  private showPlaceholderAd(container: HTMLElement): void {
    // Show a placeholder for local testing when real ads don't load
    container.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      width: 100%;
      min-height: 250px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      text-align: center;
      padding: 20px;
      box-sizing: border-box;
    `;
    placeholder.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 16px;">📺</div>
      <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">Test Ad Placeholder</div>
      <div style="font-size: 14px; opacity: 0.9;">Real ads will show on production site</div>
      <div style="font-size: 12px; opacity: 0.7; margin-top: 12px;">
        (AdSense doesn't serve ads on localhost)
      </div>
    `;
    container.appendChild(placeholder);
  }

  private claimAdCredits(): void {
    const adModal = document.getElementById('adModal');
    if (!adModal) return;
    const context = (adModal as any).dataset.context as 'rent' | 'save';
    const planetId = (adModal as any).dataset.planetId;
    adModal.style.display = 'none';
    this.userCredits += this.CREDITS_PER_AD;
    this.saveUserCredits();
    this.showNotification(`🎉 You earned ${this.CREDITS_PER_AD} credits! You now have ${this.userCredits} credits.`, 'success');
    this.updateCreditsUI();
    if (planetId) this.updateRentSection(planetId);
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notif = document.createElement('div');
    notif.className = `credits-notification credits-notification-${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => { notif.classList.add('credits-notification-visible'); }, 10);
    setTimeout(() => {
      notif.classList.remove('credits-notification-visible');
      setTimeout(() => notif.remove(), 400);
    }, 3500);
  }

  private setupLeaderboard(): void {
    const toggleBtn = document.getElementById('leaderboardToggle');
    const closeBtn = document.getElementById('leaderboardClose');
    const panel = document.getElementById('leaderboardPanel');

    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        const wasOpen = panel.classList.contains('open');
        panel.classList.toggle('open');
        
        if (panel.classList.contains('open')) {
          this.playSound('modal-open');
          this.updateLeaderboard();
          // Start periodic updates when opened
          this.startLeaderboardUpdates();
        } else {
          this.playSound('modal-close');
          // Stop periodic updates when closed
          this.stopLeaderboardUpdates();
        }
      });
    }

    if (closeBtn && panel) {
      closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        this.playSound('modal-close');
        // Stop periodic updates when closed
        this.stopLeaderboardUpdates();
      });
    }
  }

  private startLeaderboardUpdates(): void {
    // Clear any existing interval
    this.stopLeaderboardUpdates();
    // Update every 30 seconds when open
    this.leaderboardUpdateInterval = window.setInterval(() => {
      this.updateLeaderboard();
    }, 30000);
  }

  private stopLeaderboardUpdates(): void {
    if (this.leaderboardUpdateInterval !== null) {
      clearInterval(this.leaderboardUpdateInterval);
      this.leaderboardUpdateInterval = null;
    }
  }

  private updateLeaderboard(): void {
    const content = document.getElementById('leaderboardContent');
    if (!content) return;

    // Get all planets with names and calculate their streaks
    const leaderboardData: Array<{
      name: string;
      planetId: string;
      daysOwned: number;
      claimedAt: number;
    }> = [];

    const now = Date.now();
    
    this.planetDataMap.forEach((data, planetId) => {
      // Only include planets with custom names (not default planet names)
      if (data.claimedAt) {
        const daysOwned = Math.max(0, Math.floor((now - data.claimedAt) / (1000 * 60 * 60 * 24)));
        leaderboardData.push({
          name: data.claimedBy || data.name,
          planetId: planetId,
          daysOwned: daysOwned,
          claimedAt: data.claimedAt,
        });
      }
    });

    // Sort by days owned (descending)
    leaderboardData.sort((a, b) => b.daysOwned - a.daysOwned);

    // Display leaderboard
    if (leaderboardData.length === 0) {
      content.innerHTML = `
        <div class="leaderboard-empty">
          No planet names claimed yet! 🌍<br>
          Be the first to claim a planet!
        </div>
      `;
      return;
    }

    let html = '';
    leaderboardData.forEach((entry, index) => {
      const rank = index + 1;
      const rankClass = rank <= 5 ? `rank-${rank}` : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
      
      html += `
        <div class="leaderboard-item ${rankClass}" data-planet-id="${this.escapeHtml(entry.planetId)}">
          <span class="leaderboard-rank">${medal || rank}</span>
          <span class="leaderboard-name">${this.escapeHtml(entry.name)}</span>
          <span class="leaderboard-days">${entry.daysOwned} day${entry.daysOwned !== 1 ? 's' : ''} 🔥</span>
        </div>
      `;
    });

    content.innerHTML = html;

    // Add click handlers to navigate to planets
    const items = content.querySelectorAll('.leaderboard-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const planetId = item.getAttribute('data-planet-id');
        if (planetId) {
          const planet = this.planets.get(planetId);
          if (planet) {
            this.followPlanet(planet, planetId);
            // Close the leaderboard panel
            const panel = document.getElementById('leaderboardPanel');
            if (panel) {
              panel.classList.remove('open');
            }
          }
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private savePlanet(): void {
    const modal = document.getElementById('planetModal');
    const planetId = (modal as any)?.dataset?.planetId;
    const nameInput = document.getElementById('planetName') as HTMLInputElement;
    const descInput = document.getElementById(
      'planetDescription',
    ) as HTMLTextAreaElement;

    if (planetId && nameInput && descInput) {
      const planet = this.planets.get(planetId);
      const storedData = this.planetDataMap.get(planetId);
      if (planet && storedData) {
        // Verify planet is rented by current user
        const now = Date.now();
        const isRentedByMe = storedData.rentedBy === this.currentUser?.uid &&
                             storedData.rentedUntil && storedData.rentedUntil > now;
        if (!isRentedByMe) {
          this.showNotification('🔒 You must rent this planet before making changes!', 'error');
          return;
        }
        // Verify enough credits to save
        if (this.userCredits < this.CREDITS_SAVE_COST) {
          this.showNotification(`❌ You need ${this.CREDITS_SAVE_COST} credits to save. Watch an ad to earn more!`, 'error');
          this.updateRentSection(planetId);
          return;
        }

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

        const previousName = storedData.name;
        const previousClaimedAt = storedData.claimedAt;
        const isNameChange = previousClaimedAt && previousName !== nameInput.value;
        
        // Determine claimedAt: 
        // - If this is the first time claiming (no previous claimedAt), set to now
        // - If the name changed, reset to now (new ownership starts)
        // - Otherwise, keep the existing claimedAt timestamp
        const finalClaimedAt = isNameChange || !previousClaimedAt ? now : previousClaimedAt;

        // Collect selected customizations
        const customizations = this.getAllCustomizationIds().filter(cid => {
          const checkbox = document.getElementById(`custom_${cid}`) as HTMLInputElement;
          return checkbox?.checked ?? false;
        });

        const planetData: PlanetData = {
          id: planetId,
          name: nameInput.value,
          description: descInput.value,
          position: {
            x: planet.position.x,
            y: planet.position.y,
            z: planet.position.z,
          },
          color: color,
          size: storedData.size,
          orbitRadius: storedData.orbitRadius,
          orbitSpeed: storedData.orbitSpeed,
          orbitAngle: storedData.orbitAngle,
          orbitInclination: storedData.orbitInclination, // IMPORTANT: Save inclination to preserve orbital path
          claimedAt: finalClaimedAt,
          lastUpdated: now,
          claimedBy: nameInput.value, // Use the planet name as the claimer identifier
          customizations,
          userId: this.currentUser?.uid,
          userEmail: this.currentUser?.email || undefined,
          rentedUntil: storedData.rentedUntil,
          rentedBy: storedData.rentedBy,
        };

        // Deduct save credits
        this.userCredits -= this.CREDITS_SAVE_COST;
        this.saveUserCredits();

        // Save to Firebase
        this.database.object(`planets/${planetId}`).set(planetData);

        // Update local cache
        this.planetDataMap.set(planetId, planetData);

        // Update the label
        this.updatePlanetLabel(planet, nameInput.value);

        // Apply customizations to the 3D world
        this.applyPlanetCustomizations(planet, planetId, customizations);

        // Play success sound
        this.playSound('save');

        this.showNotification(`✅ Planet saved! ${this.CREDITS_SAVE_COST} credits used. You have ${this.userCredits} credits remaining.`, 'success');

        // Close modal
        if (modal) modal.style.display = 'none';

        // Update leaderboard if it's open
        const leaderboardPanel = document.getElementById('leaderboardPanel');
        if (leaderboardPanel?.classList.contains('open')) {
          this.updateLeaderboard();
        }
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
    const sub = this.database
      .list('planets')
      .snapshotChanges()
      .subscribe((planets: any[]) => {
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
                if (data.customizations?.length) {
                  this.applyPlanetCustomizations(existingPlanet, planetId, data.customizations);
                }
              }
            } else {
              // Create new planet
              const newPlanet = this.createPlanet(planetId, data);
              if (data.customizations?.length) {
                this.applyPlanetCustomizations(newPlanet, planetId, data.customizations);
              }
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
        {
          name: 'Mercury',
          description: 'Closest to the sun',
          color: '#E8B4A0',
          size: 1.8,
          orbitRadius: 15,
          speed: 0.002,
          inclination: 0.25,
        },
        {
          name: 'Venus',
          description: 'The morning star',
          color: '#FFB84D',
          size: 2.3,
          orbitRadius: 22,
          speed: 0.0016,
          inclination: 0.15,
        },
        {
          name: 'Earth',
          description: 'Our home',
          color: '#4A9EFF',
          size: 2.5,
          orbitRadius: 30,
          speed: 0.0013,
          inclination: 0,
        },
        {
          name: 'Mars',
          description: 'The red planet',
          color: '#FF6B4D',
          size: 2.0,
          orbitRadius: 38,
          speed: 0.001,
          inclination: 0.12,
        },
        {
          name: 'Jupiter',
          description: 'Gas giant',
          color: '#FFD700',
          size: 4.5,
          orbitRadius: 55,
          speed: 0.0007,
          inclination: 0.08,
        },
        {
          name: 'Saturn',
          description: 'Ringed beauty',
          color: '#FFE4B5',
          size: 4.0,
          orbitRadius: 70,
          speed: 0.0005,
          inclination: 0.18,
        },
        {
          name: 'Uranus',
          description: 'Ice giant',
          color: '#87CEEB',
          size: 3.2,
          orbitRadius: 85,
          speed: 0.0004,
          inclination: 0.06,
        },
        {
          name: 'Neptune',
          description: 'Deep blue',
          color: '#4169FF',
          size: 3.0,
          orbitRadius: 100,
          speed: 0.0003,
          inclination: 0.14,
        },
      ],
    });

    // Zephyria - A mystical galaxy
    this.galaxies.push({
      id: 'zephyria',
      name: 'Zephyria',
      description: 'A mystical galaxy with crystalline worlds',
      sunColor: '#00FFFF',
      sunSize: 10,
      planets: [
        {
          name: 'Crystalia',
          description: 'A world of pure crystal',
          color: '#E0BBE4',
          size: 2.0,
          orbitRadius: 20,
          speed: 0.0025,
          inclination: 0.3,
        },
        {
          name: 'Luminos',
          description: 'Glowing with ethereal light',
          color: '#FFD700',
          size: 2.8,
          orbitRadius: 28,
          speed: 0.002,
          inclination: 0.18,
        },
        {
          name: 'Nebulae',
          description: 'Wrapped in colorful mists',
          color: '#FF69B4',
          size: 3.5,
          orbitRadius: 40,
          speed: 0.0015,
          inclination: 0.12,
        },
        {
          name: 'Prisma',
          description: 'Refracts starlight beautifully',
          color: '#7FFFD4',
          size: 2.2,
          orbitRadius: 52,
          speed: 0.0012,
          inclination: 0.22,
        },
        {
          name: 'Celestia',
          description: 'Home to ancient star beings',
          color: '#DDA0DD',
          size: 4.0,
          orbitRadius: 68,
          speed: 0.0008,
          inclination: 0.16,
        },
        {
          name: 'Auroris',
          description: 'Dancing aurora skies',
          color: '#00FF7F',
          size: 3.0,
          orbitRadius: 85,
          speed: 0.0006,
          inclination: 0.26,
        },
      ],
    });

    // Infernia - A fiery galaxy
    this.galaxies.push({
      id: 'infernia',
      name: 'Infernia',
      description: 'A galaxy of volcanic and fiery worlds',
      sunColor: '#FF4500',
      sunSize: 12,
      planets: [
        {
          name: 'Pyros',
          description: 'Eternal volcanic eruptions',
          color: '#FF0000',
          size: 2.5,
          orbitRadius: 18,
          speed: 0.003,
          inclination: 0.35,
        },
        {
          name: 'Emberon',
          description: 'Covered in burning embers',
          color: '#FF6347',
          size: 2.0,
          orbitRadius: 26,
          speed: 0.0022,
          inclination: 0.22,
        },
        {
          name: 'Magmara',
          description: 'Rivers of flowing magma',
          color: '#FF4500',
          size: 3.2,
          orbitRadius: 35,
          speed: 0.0018,
          inclination: 0.15,
        },
        {
          name: 'Scorchia',
          description: 'Scorched by twin suns',
          color: '#FFD700',
          size: 2.8,
          orbitRadius: 48,
          speed: 0.0014,
          inclination: 0.2,
        },
        {
          name: 'Furnaxis',
          description: 'A giant forge world',
          color: '#FF8C00',
          size: 5.0,
          orbitRadius: 65,
          speed: 0.0009,
          inclination: 0.12,
        },
        {
          name: 'Cinderis',
          description: 'Ash-covered wasteland',
          color: '#DC143C',
          size: 2.5,
          orbitRadius: 80,
          speed: 0.0007,
          inclination: 0.25,
        },
        {
          name: 'Blazeon',
          description: 'Eternal solar flares',
          color: '#FF1493',
          size: 3.5,
          orbitRadius: 95,
          speed: 0.0005,
          inclination: 0.18,
        },
      ],
    });

    // Mechanis - A technological galaxy with geometric worlds
    this.galaxies.push({
      id: 'mechanis',
      name: 'Mechanis',
      description: 'A galaxy of geometric and technological worlds',
      sunColor: '#00FF00',
      sunSize: 9,
      planets: [
        {
          name: 'Cubix',
          description: 'A perfect cubic world',
          color: '#4169E1',
          size: 2.2,
          orbitRadius: 20,
          speed: 0.0024,
          inclination: 0.22,
          shape: 'cube',
        },
        {
          name: 'Torusphere',
          description: 'Ringed artificial world',
          color: '#32CD32',
          size: 2.5,
          orbitRadius: 30,
          speed: 0.0019,
          inclination: 0.13,
          shape: 'torus',
        },
        {
          name: 'Octara',
          description: 'Eight-sided crystal formation',
          color: '#FF6347',
          size: 2.0,
          orbitRadius: 42,
          speed: 0.0015,
          inclination: 0.28,
          shape: 'octahedron',
        },
        {
          name: 'Dodeca',
          description: 'Twelve-faced geometric marvel',
          color: '#FFD700',
          size: 2.8,
          orbitRadius: 56,
          speed: 0.0011,
          inclination: 0.18,
          shape: 'dodecahedron',
        },
        {
          name: 'Icosa',
          description: 'Twenty-sided engineering wonder',
          color: '#00CED1',
          size: 3.2,
          orbitRadius: 72,
          speed: 0.0008,
          inclination: 0.15,
          shape: 'icosahedron',
        },
        {
          name: 'Cylios',
          description: 'Rotating cylindrical habitat',
          color: '#9370DB',
          size: 2.6,
          orbitRadius: 88,
          speed: 0.0006,
          inclination: 0.32,
          shape: 'cylinder',
        },
      ],
    });

    // Aquaterra - An ocean-themed galaxy
    this.galaxies.push({
      id: 'aquaterra',
      name: 'Aquaterra',
      description: 'A galaxy of water worlds and aquatic paradises',
      sunColor: '#1E90FF',
      sunSize: 8.5,
      planets: [
        {
          name: 'Neptara',
          description: 'Endless ocean planet',
          color: '#1E90FF',
          size: 2.4,
          orbitRadius: 22,
          speed: 0.0023,
          inclination: 0.2,
          shape: 'sphere',
        },
        {
          name: 'Coralys',
          description: 'Living reef world',
          color: '#FF7F50',
          size: 2.1,
          orbitRadius: 32,
          speed: 0.0018,
          inclination: 0.25,
          shape: 'icosahedron',
        },
        {
          name: 'Tidalis',
          description: 'World of eternal tides',
          color: '#4682B4',
          size: 2.9,
          orbitRadius: 44,
          speed: 0.0014,
          inclination: 0.16,
          shape: 'sphere',
        },
        {
          name: 'Marinius',
          description: 'Deep trench planet',
          color: '#000080',
          size: 3.5,
          orbitRadius: 58,
          speed: 0.001,
          inclination: 0.12,
          shape: 'octahedron',
        },
        {
          name: 'Vaporis',
          description: 'Steam and mist covered',
          color: '#B0E0E6',
          size: 2.3,
          orbitRadius: 74,
          speed: 0.0007,
          inclination: 0.29,
          shape: 'sphere',
        },
        {
          name: 'Abyssus',
          description: 'Mysterious underwater caverns',
          color: '#191970',
          size: 4.0,
          orbitRadius: 92,
          speed: 0.0005,
          inclination: 0.22,
          shape: 'dodecahedron',
        },
      ],
    });

    // Verdantia - A lush, bio-diverse galaxy
    this.galaxies.push({
      id: 'verdantia',
      name: 'Verdantia',
      description: 'A galaxy teeming with exotic life and lush forests',
      sunColor: '#ADFF2F',
      sunSize: 7.5,
      planets: [
        {
          name: 'Floralis',
          description: 'Covered in giant flowers',
          color: '#FF1493',
          size: 2.3,
          orbitRadius: 19,
          speed: 0.0026,
          inclination: 0.23,
          shape: 'sphere',
        },
        {
          name: 'Arboria',
          description: 'World of massive trees',
          color: '#228B22',
          size: 2.7,
          orbitRadius: 28,
          speed: 0.002,
          inclination: 0.17,
          shape: 'cylinder',
        },
        {
          name: 'Fungara',
          description: 'Bioluminescent mushroom forests',
          color: '#9370DB',
          size: 2.0,
          orbitRadius: 39,
          speed: 0.0016,
          inclination: 0.27,
          shape: 'torus',
        },
        {
          name: 'Vineworld',
          description: 'Interconnected vine networks',
          color: '#32CD32',
          size: 3.3,
          orbitRadius: 52,
          speed: 0.0012,
          inclination: 0.14,
          shape: 'icosahedron',
        },
        {
          name: 'Junglios',
          description: 'Dense rainforest planet',
          color: '#006400',
          size: 3.8,
          orbitRadius: 67,
          speed: 0.0009,
          inclination: 0.2,
          shape: 'sphere',
        },
        {
          name: 'Pollenis',
          description: 'Eternal spring with blooming meadows',
          color: '#FFB6C1',
          size: 2.5,
          orbitRadius: 84,
          speed: 0.0006,
          inclination: 0.25,
          shape: 'octahedron',
        },
        {
          name: 'Bioforge',
          description: 'Living organism planet',
          color: '#7FFF00',
          size: 4.2,
          orbitRadius: 98,
          speed: 0.0004,
          inclination: 0.16,
          shape: 'dodecahedron',
        },
      ],
    });
  }

  private switchGalaxy(index: number, withAnimation: boolean = true): void {
    if (index < 0 || index >= this.galaxies.length) return;
    if (this.isCameraTransitioning) return; // Prevent multiple transitions

    this.playSound('galaxy-switch');
    this.hidePlanetTooltip();
    const previousIndex = this.currentGalaxyIndex;
    this.currentGalaxyIndex = index;

    if (withAnimation && previousIndex !== index) {
      // Smooth camera transition
      this.isCameraTransitioning = true;
      this.animateCameraTransition(() => {
        // Hyperspace jump at the moment the system swaps
        this.playWarpEffect();

        // Clear and create new galaxy after camera zooms out
        this.clearGalaxy();
        this.updateSun(this.galaxies[index]);
        this.createGalaxyPlanets(this.galaxies[index]);
        this.updateGalaxyUI();
        this.updateDistantGalaxies();

        // Apply saved planet names from Firebase
        this.applySavedPlanetNames();

        // Zoom camera back in
        this.animateCameraZoomIn(() => {
          this.isCameraTransitioning = false;
          this.setCameraPreset(CameraPreset.SPAWN_POINT);
        });
      });
    } else {
      // Instant switch (first load)
      this.clearGalaxy();
      this.updateSun(this.galaxies[index]);
      this.createGalaxyPlanets(this.galaxies[index]);
      this.updateGalaxyUI();
      this.updateDistantGalaxies();

      // Apply saved planet names from Firebase
      this.applySavedPlanetNames();

      this.setCameraPreset(CameraPreset.SPAWN_POINT);
    }
  }

  private applySavedPlanetNames(): void {
    // Apply any saved planet names from Firebase to the current planets
    this.database
      .list('planets')
      .valueChanges()
      .pipe(
        take(1), // Get the data once and complete
      )
      .subscribe((planetsData: any) => {
        if (!planetsData) return;

        // planetsData is an array, iterate through it
        planetsData.forEach((data: any) => {
          if (data && data.id) {
            const planetId = data.id;
            const planet = this.planets.get(planetId);

            if (planet && data.name) {
              // Update the planet's label with the saved name
              this.updatePlanetLabel(planet, data.name);
              // Also update the local data map
              if (this.planetDataMap.has(planetId)) {
                const existingData = this.planetDataMap.get(planetId);
                if (existingData) {
                  existingData.name = data.name;
                  existingData.description =
                    data.description || existingData.description;
                  if (data.customizations !== undefined) {
                    existingData.customizations = data.customizations;
                  }
                }
              }
              // Apply customizations if any
              if (data.customizations?.length) {
                this.applyPlanetCustomizations(planet, planetId, data.customizations);
              }
            }
          }
        });
      });
  }

  private clearGalaxy(): void {
    // Cleanup customization effects before disposing planets
    this.planetCustomizationCallbacks.forEach((callbacks) => {
      callbacks.forEach((cb) => this.scene.unregisterBeforeRender(cb));
    });
    this.planetCustomizationCallbacks.clear();
    this.planetCustomizationParticles.forEach((systems) => {
      systems.forEach((sys) => { sys.stop(); sys.dispose(); });
    });
    this.planetCustomizationParticles.clear();
    this.moonMeshes.clear();

    // Dispose all planets
    this.planets.forEach((planet) => {
      planet.dispose();
    });
    this.planets.clear();
    this.planetDataMap.clear();

    // Dispose the per-planet surface shaders (meshes don't own materials)
    this.planetShaderMats.forEach((mat) => mat.dispose());
    this.planetShaderMats = [];

    // Dispose the asteroid belt
    if (this.asteroidBelt) {
      this.asteroidBelt.dispose(false, true);
      this.asteroidBelt = null;
    }

    // Dispose all orbit paths
    this.orbitPaths.forEach((path) => {
      path.dispose();
    });
    this.orbitPaths.clear();

    // Clear following planet reference
    this.followingPlanet = null;
  }

  private updateSun(galaxy: GalaxyData): void {
    if (!this.sun) return;

    const sunColor = Color3.FromHexString(galaxy.sunColor);

    // Re-tint the plasma shader for this galaxy's star
    if (this.sunMaterial) {
      const core = new Color3(
        Math.min(1, sunColor.r * 0.9 + 0.25),
        Math.min(1, sunColor.g * 0.9 + 0.2),
        Math.min(1, sunColor.b * 0.9 + 0.12),
      );
      this.sunMaterial.setColor3('coreColor', core);
      this.sunMaterial.setColor3('edgeColor', sunColor.scale(0.4));
    }

    // Tint the light the star casts on its planets (kept near-white so
    // planet albedos stay readable).
    if (this.sunLight) {
      this.sunLight.diffuse = Color3.Lerp(new Color3(1, 0.96, 0.88), sunColor, 0.35);
      this.sunLight.specular = this.sunLight.diffuse.clone();
    }

    // Re-paint halo + lens streak in the star's color
    this.drawSunHalo(sunColor);

    // Update sun size (halo scales with it)
    const s = galaxy.sunSize / 8;
    this.sun.scaling = new Vector3(s, s, s);
    if (this.sunHalo) {
      this.sunHalo.scaling = new Vector3(s, s, s);
    }
  }

  private createGalaxyPlanets(galaxy: GalaxyData): void {
    // A wheeling belt of rocky debris between the orbits
    this.createAsteroidBelt(galaxy);

    galaxy.planets.forEach((planetConfig, index) => {
      // Make planet ID specific to the galaxy to avoid name conflicts across galaxies
      const planetId = `${galaxy.id}_planet_${index}`;
      const startAngle = (Math.PI * 2 * index) / galaxy.planets.length;

      // Calculate initial position matching the animation loop calculation
      const x = Math.cos(startAngle) * planetConfig.orbitRadius;
      const z = Math.sin(startAngle) * planetConfig.orbitRadius;

      this.createPlanet(planetId, {
        id: planetId,
        name: planetConfig.name,
        description: planetConfig.description,
        position: {
          x: x,
          y: -z * Math.sin(planetConfig.inclination),
          z: z * Math.cos(planetConfig.inclination),
        },
        color: planetConfig.color,
        size: planetConfig.size,
        orbitRadius: planetConfig.orbitRadius,
        orbitSpeed: planetConfig.speed,
        orbitAngle: startAngle,
        orbitInclination: planetConfig.inclination,
        shape: planetConfig.shape || 'sphere',
      });
    });
  }

  /**
   * A belt of ~1100 tumbling rocks rendered as thin instances — one draw
   * call for an entire asteroid field. Settles into the widest gap between
   * planetary orbits, like the real one between Mars and Jupiter.
   */
  private createAsteroidBelt(galaxy: GalaxyData): void {
    const radii = galaxy.planets
      .map((p) => p.orbitRadius)
      .sort((a, b) => a - b);
    let beltRadius = radii.length ? radii[radii.length - 1] + 10 : 55;
    let bestGap = 0;
    for (let i = 0; i < radii.length - 1; i++) {
      const gap = radii[i + 1] - radii[i];
      if (gap > bestGap) {
        bestGap = gap;
        beltRadius = (radii[i] + radii[i + 1]) / 2;
      }
    }
    if (bestGap < 9 && radii.length) beltRadius = radii[radii.length - 1] + 10;

    const rock = MeshBuilder.CreatePolyhedron(
      'asteroidBelt',
      { type: 3, size: 1 }, // icosahedron — reads as a rock chunk when squashed
      this.scene,
    );
    rock.isPickable = false;

    const mat = new PBRMaterial('asteroidMat', this.scene);
    // Dark charcoal rock — reads as debris dust, not bright popcorn
    mat.albedoColor = new Color3(0.13, 0.12, 0.11);
    mat.metallic = 0.0;
    mat.roughness = 1.0;
    mat.directIntensity = 1.2;
    mat.usePhysicalLightFalloff = false;
    rock.material = mat;

    // Deterministic scatter per galaxy
    let s = (this.hashString(galaxy.id) % 2147483645) + 1;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };

    const count = 1100;
    const buffer = new Float32Array(16 * count);
    const m = Matrix.Identity();
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const r = beltRadius + (rand() + rand() - 1) * 3.4;
      const y = (rand() + rand() - 1) * 0.9;
      const scl = 0.03 + Math.pow(rand(), 2.6) * 0.16;
      Matrix.ComposeToRef(
        new Vector3(
          scl * (0.6 + rand() * 0.9),
          scl * (0.6 + rand() * 0.9),
          scl * (0.6 + rand() * 0.9),
        ),
        Quaternion.FromEulerAngles(
          rand() * Math.PI * 2,
          rand() * Math.PI * 2,
          rand() * Math.PI * 2,
        ),
        new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
        m,
      );
      m.copyToArray(buffer, i * 16);
    }
    rock.thinInstanceSetBuffer('matrix', buffer, 16, true);
    rock.thinInstanceRefreshBoundingInfo();

    this.asteroidBelt = rock;
  }

  private updateGalaxyUI(): void {
    const galaxyElement = document.getElementById('currentGalaxy');
    if (galaxyElement) {
      const galaxy = this.galaxies[this.currentGalaxyIndex];
      galaxyElement.textContent = galaxy.name;
    }
  }

  private static readonly CAMERA_TRANSITION_FRAMES = 60; // 1 second at 60fps

  private animateCameraTransition(onComplete: () => void): void {
    // Smoothly zoom out to show galaxy transition
    const targetRadius = 250;
    const duration = PlanetScene.CAMERA_TRANSITION_FRAMES;
    const startRadius = this.camera.radius;
    const deltaRadius = targetRadius - startRadius;

    let frame = 0;
    const animationCallback = () => {
      frame++;
      const progress = frame / duration;
      const eased = this.easeInOutCubic(progress);

      this.camera.radius = startRadius + deltaRadius * eased;

      if (frame >= duration) {
        this.scene.unregisterBeforeRender(animationCallback);
        onComplete();
      }
    };
    this.scene.registerBeforeRender(animationCallback);
  }

  private animateCameraZoomIn(onComplete: () => void): void {
    // Smoothly zoom back in after galaxy switch
    const targetRadius = 80; // Default spawn point radius
    const duration = PlanetScene.CAMERA_TRANSITION_FRAMES;
    const startRadius = this.camera.radius;
    const deltaRadius = targetRadius - startRadius;

    let frame = 0;
    const animationCallback = () => {
      frame++;
      const progress = frame / duration;
      const eased = this.easeInOutCubic(progress);

      this.camera.radius = startRadius + deltaRadius * eased;

      if (frame >= duration) {
        this.scene.unregisterBeforeRender(animationCallback);
        onComplete();
      }
    };
    this.scene.registerBeforeRender(animationCallback);
  }

  private createDistantGalaxies(): void {
    // Distant galaxies rendered as slowly spinning procedural spiral sprites —
    // one billboard each instead of sphere + rings + particles.
    this.galaxies.forEach((galaxy, index) => {
      if (index === this.currentGalaxyIndex) return;

      const angle = (Math.PI * 2 * index) / this.galaxies.length;
      const distance = 230;

      const sprite = MeshBuilder.CreatePlane(
        `distantGalaxy_${index}`,
        { size: 26 },
        this.scene,
      );
      sprite.position.x = Math.cos(angle) * distance;
      sprite.position.y = Math.sin(index * 2.7) * 45; // scatter vertically
      sprite.position.z = Math.sin(angle) * distance;
      sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;

      const spriteTexture = this.createGalaxySpriteTexture(index, galaxy.sunColor);
      const material = new StandardMaterial(
        `distantGalaxyMat_${index}`,
        this.scene,
      );
      material.emissiveTexture = spriteTexture;
      material.diffuseTexture = spriteTexture;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableLighting = true;
      material.alphaMode = Engine.ALPHA_ADD; // black background adds nothing
      material.alpha = 0.95;
      sprite.material = material;

      // Sprites shouldn't cast occlusion into the god-ray pass.
      if (this.godRays) this.godRays.excludedMeshes.push(sprite);

      // Make it clickable to switch to that galaxy. The texture reference is
      // kept in metadata so the animation loop can spin the spiral.
      sprite.metadata = { galaxyIndex: index, spriteTexture };
      sprite.actionManager = new ActionManager(this.scene);
      sprite.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          const targetIndex = sprite.metadata.galaxyIndex;
          this.switchGalaxy(targetIndex);
        }),
      );

      this.distantGalaxies.set(index, sprite);
    });
  }

  /** Paints a spiral galaxy (bulge + two arms + star specks) tinted by color. */
  private createGalaxySpriteTexture(index: number, colorHex: string): DynamicTexture {
    const S = 256;
    const c = S / 2;
    const tex = new DynamicTexture(`distantGalaxyTex_${index}`, S, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const col = Color3.FromHexString(colorHex);
    const r = Math.round(255 * col.r);
    const g = Math.round(255 * col.g);
    const b = Math.round(255 * col.b);

    ctx.fillStyle = 'rgb(0,0,0)';
    ctx.fillRect(0, 0, S, S);

    // Deterministic pseudo-random per galaxy so each spiral looks distinct
    let seed = index * 1013 + 71;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    // Spiral arms
    const arms = 2 + (index % 2);
    for (let arm = 0; arm < arms; arm++) {
      const phase = (Math.PI * 2 * arm) / arms + rand() * 0.5;
      for (let i = 0; i < 90; i++) {
        const t = i / 90;
        const rad = 6 + t * (c - 22);
        const th = phase + t * 3.9 + rand() * 0.12;
        const x = c + Math.cos(th) * rad;
        const y = c + Math.sin(th) * rad * 0.82;
        const blobR = 3 + (1 - t) * 9 + rand() * 3;
        const a = (1 - t) * 0.16 + 0.03;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, blobR);
        const mixW = 1 - t * 0.65; // whiter toward the core
        const rr = Math.round(r * (1 - mixW) + 255 * mixW);
        const gg = Math.round(g * (1 - mixW) + 250 * mixW);
        const bb = Math.round(b * (1 - mixW) + 240 * mixW);
        grad.addColorStop(0, `rgba(${rr},${gg},${bb},${a})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - blobR, y - blobR, blobR * 2, blobR * 2);
      }
    }

    // Bright central bulge
    const bulge = ctx.createRadialGradient(c, c, 0, c, c, 34);
    bulge.addColorStop(0,   'rgba(255,250,235,0.98)');
    bulge.addColorStop(0.3, `rgba(${Math.min(255, r + 90)},${Math.min(255, g + 80)},${Math.min(255, b + 60)},0.6)`);
    bulge.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = bulge;
    ctx.fillRect(0, 0, S, S);

    // Star specks scattered along the disc
    for (let i = 0; i < 70; i++) {
      const th = rand() * Math.PI * 2;
      const rad = rand() * (c - 18);
      const x = c + Math.cos(th) * rad;
      const y = c + Math.sin(th) * rad * 0.82;
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.5})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    tex.update();
    return tex;
  }

  private updateDistantGalaxies(): void {
    // Clear existing distant galaxies (including their materials/textures,
    // so repeated galaxy switching doesn't leak GPU memory)
    this.distantGalaxies.forEach((mesh) => {
      mesh.dispose(false, true);
    });
    this.distantGalaxies.clear();

    // Recreate them
    this.createDistantGalaxies();
  }

  private createInclinedOrbitPath(
    id: string,
    orbitRadius: number,
    inclination: number,
  ): void {
    // Create a torus for the orbit path
    const orbitPath = MeshBuilder.CreateTorus(
      `orbit_${id}`,
      {
        diameter: orbitRadius * 2,
        thickness: 0.035,
        tessellation: 96,
      },
      this.scene,
    );
    orbitPath.position = Vector3.Zero();

    // Rotate the orbit path to match the inclined orbital plane
    // The torus starts in XZ plane, we need to tilt it around the X-axis
    // to create the inclined orbit that matches planet movement
    orbitPath.rotation.x = inclination;

    // Note: When rotating around X-axis by angle θ:
    // For a point on XZ plane (x, 0, z), the rotated position is:
    // x' = x (unchanged)
    // y' = -z * sin(θ)
    // z' = z * cos(θ)
    // This is the formula used in the animation loop

    const orbitMaterial = new StandardMaterial(`orbitMat_${id}`, this.scene);
    orbitMaterial.emissiveColor = new Color3(0.32, 0.4, 0.58);
    orbitMaterial.disableLighting = true;
    orbitMaterial.alpha = 0.2; // faint guide lines, like a HUD overlay
    orbitPath.material = orbitMaterial;
    orbitPath.isPickable = false;

    // Static geometry — freeze its transform so it costs nothing per frame.
    orbitPath.computeWorldMatrix(true);
    orbitPath.freezeWorldMatrix();

    // Store orbit path for later cleanup
    this.orbitPaths.set(id, orbitPath);
  }

  private setupKeyboardControls(): void {
    // Store handler reference for cleanup
    this.keyboardHandler = (event: KeyboardEvent) => {
      switch (event.key) {
        case '1':
          this.setCameraPreset(CameraPreset.SPAWN_POINT);
          break;
        case '2':
          this.setCameraPreset(CameraPreset.OVERVIEW);
          break;
        case '3':
          this.setCameraPreset(CameraPreset.FOLLOW_SUN);
          break;
        case '4': // Follow Mercury (first planet)
        case '5': // Follow Venus (second planet)
        case '6': // Follow Earth (third planet)
        case '7': // Follow Mars (fourth planet)
        case '8': // Follow Jupiter (fifth planet)
        case '9': // Follow Saturn (sixth planet)
          // Follow specific planet: Keys 4-9 map to first 6 planets in current galaxy
          const planetIndex = parseInt(event.key) - 4;
          // Use galaxy-specific planet ID
          const currentGalaxy = this.galaxies[this.currentGalaxyIndex];
          const planetId = `${currentGalaxy.id}_planet_${planetIndex}`;
          const planet = this.planets.get(planetId);
          if (planet) {
            this.followPlanet(planet, planetId);
          }
          break;
        case 'ArrowUp':
          // Zoom in
          this.camera.radius = Math.max(
            this.camera.lowerRadiusLimit,
            this.camera.radius - 5,
          );
          break;
        case 'ArrowDown':
          // Zoom out
          this.camera.radius = Math.min(
            this.camera.upperRadiusLimit,
            this.camera.radius + 5,
          );
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
          const nextIndex =
            (this.currentGalaxyIndex + 1) % this.galaxies.length;
          this.switchGalaxy(nextIndex);
          break;
        case 'n':
        case 'N':
          // Switch to next melody mode
          this.switchMelodyMode();
          break;
        case 'r':
        case 'R':
          // Randomize melody mode
          this.randomizeMelodyMode();
          break;
      }
    };

    window.addEventListener('keydown', this.keyboardHandler);
  }

  private createPlanetTooltip(): void {
    const tooltip = document.createElement('div');
    tooltip.id = 'planetTooltip';
    tooltip.style.cssText = `
      position: fixed;
      display: none;
      max-width: 240px;
      background: linear-gradient(135deg, rgba(26,26,46,0.97) 0%, rgba(22,33,62,0.97) 100%);
      border: 1px solid rgba(138,127,255,0.45);
      border-radius: 12px;
      padding: 12px 15px;
      color: #e0d9ff;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
      pointer-events: none;
      z-index: 800;
      box-shadow: 0 6px 24px rgba(0,0,0,0.55), 0 0 18px rgba(106,90,205,0.25);
      backdrop-filter: blur(8px);
      transition: opacity 0.15s ease;
    `;
    document.body.appendChild(tooltip);
    this.planetTooltip = tooltip;

    // Follow the mouse cursor
    window.addEventListener('mousemove', (e) => {
      if (this.planetTooltip && this.planetTooltip.style.display !== 'none') {
        const offsetX = 18;
        const offsetY = 12;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const tipW = this.planetTooltip.offsetWidth || 240;
        const tipH = this.planetTooltip.offsetHeight || 80;
        let x = e.clientX + offsetX;
        let y = e.clientY + offsetY;
        if (x + tipW > vpW - 8) x = e.clientX - tipW - offsetX;
        if (y + tipH > vpH - 8) y = e.clientY - tipH - offsetY;
        this.planetTooltip.style.left = `${x}px`;
        this.planetTooltip.style.top = `${y}px`;
      }
    });
  }

  private showPlanetTooltip(planetId: string): void {
    if (!this.planetTooltip) return;
    const data = this.planetDataMap.get(planetId);
    if (!data) return;

    const isClaimed = !!(data.claimedBy || data.userId);
    const claimedByText = data.claimedBy
      ? `<div style="margin-top:6px;font-size:11px;color:#9a8fff;">
           👤 Claimed by <strong style="color:#c4bcff;">${this.escapeHtml(data.claimedBy || '')}</strong>
         </div>`
      : '';
    const descText = data.description
      ? `<div style="margin-top:6px;color:#b8b4e0;font-size:12px;line-height:1.4;">${this.escapeHtml(data.description)}</div>`
      : '';
    const statusBadge = isClaimed
      ? `<span style="background:rgba(138,127,255,0.25);border:1px solid rgba(138,127,255,0.5);border-radius:8px;padding:1px 7px;font-size:10px;color:#c4bcff;margin-left:6px;">claimed</span>`
      : `<span style="background:rgba(80,200,120,0.18);border:1px solid rgba(80,200,120,0.4);border-radius:8px;padding:1px 7px;font-size:10px;color:#7eeea0;margin-left:6px;">unclaimed</span>`;

    this.planetTooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:4px;font-weight:700;font-size:14px;color:#fff;">
        🪐 ${this.escapeHtml(data.name)}${statusBadge}
      </div>
      ${descText}
      ${claimedByText}
      <div style="margin-top:8px;font-size:10px;color:rgba(138,127,255,0.6);font-style:italic;">Click to ${isClaimed ? 'edit' : 'claim'} this planet</div>
    `;
    this.planetTooltip.style.display = 'block';
  }

  private hidePlanetTooltip(): void {
    if (this.planetTooltip) {
      this.planetTooltip.style.display = 'none';
    }
  }

  private setupCameraPresetUI(): void {
    // Create UI overlay
    const uiDiv = document.createElement('div');
    uiDiv.id = 'controls-panel';
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
    uiDiv.style.transition = 'all 0.3s ease';
    uiDiv.style.maxHeight = '600px';
    uiDiv.style.overflow = 'hidden';

    // Apply backdrop filter with browser compatibility check
    if (
      'backdropFilter' in uiDiv.style ||
      'webkitBackdropFilter' in uiDiv.style
    ) {
      (uiDiv.style as any).backdropFilter = 'blur(10px)';
      (uiDiv.style as any).webkitBackdropFilter = 'blur(10px)';
    }

    // Create header with toggle button
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.marginBottom = '10px';
    headerDiv.style.cursor = 'pointer';

    const titleSpan = document.createElement('span');
    titleSpan.style.fontWeight = 'bold';
    titleSpan.style.fontSize = '16px';
    titleSpan.textContent = 'Controls 🎮';

    const toggleButton = document.createElement('button');
    toggleButton.textContent = '−';
    toggleButton.style.background = 'rgba(255, 255, 255, 0.2)';
    toggleButton.style.border = 'none';
    toggleButton.style.color = 'white';
    toggleButton.style.fontSize = '20px';
    toggleButton.style.width = '30px';
    toggleButton.style.height = '30px';
    toggleButton.style.borderRadius = '4px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.transition = 'background 0.2s';
    toggleButton.title = 'Click to minimize/expand';

    toggleButton.addEventListener('mouseenter', () => {
      toggleButton.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    toggleButton.addEventListener('mouseleave', () => {
      toggleButton.style.background = 'rgba(255, 255, 255, 0.2)';
    });

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(toggleButton);

    // Helper: create a tappable control button (works for mouse and touch)
    const mkBtn = (label: string, action: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = [
        'padding:6px 8px',
        'background:rgba(255,255,255,0.15)',
        'border:1px solid rgba(255,255,255,0.3)',
        'color:white',
        'border-radius:6px',
        'cursor:pointer',
        'font-size:12px',
        'width:100%',
        'text-align:center',
        'transition:background 0.2s',
        'touch-action:manipulation',
        'user-select:none',
        '-webkit-user-select:none',
      ].join(';');
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.28)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.15)'; });
      btn.addEventListener('click', (e) => { e.stopPropagation(); action(); });
      return btn;
    };

    // Create content div with interactive tap buttons
    const contentDiv = document.createElement('div');

    // — Preset buttons row (1 / 2 / 3)
    const presetGrid = document.createElement('div');
    presetGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px';
    presetGrid.appendChild(mkBtn('1 · Spawn', () => this.setCameraPreset(CameraPreset.SPAWN_POINT)));
    presetGrid.appendChild(mkBtn('2 · View', () => this.setCameraPreset(CameraPreset.OVERVIEW)));
    presetGrid.appendChild(mkBtn('3 · Sun', () => this.setCameraPreset(CameraPreset.FOLLOW_SUN)));
    contentDiv.appendChild(presetGrid);

    // — Planet follow buttons (P1–P6)
    const planetLabel = document.createElement('div');
    planetLabel.textContent = 'Follow Planet:';
    planetLabel.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px';
    contentDiv.appendChild(planetLabel);

    const planetGrid = document.createElement('div');
    planetGrid.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:8px';
    for (let i = 0; i < 6; i++) {
      const idx = i;
      const pBtn = mkBtn(`P${idx + 1}`, () => {
        const gal = this.galaxies[this.currentGalaxyIndex];
        const pid = `${gal.id}_planet_${idx}`;
        const mesh = this.planets.get(pid);
        if (mesh) this.followPlanet(mesh, pid);
      });
      pBtn.style.padding = '6px 2px';
      planetGrid.appendChild(pBtn);
    }
    contentDiv.appendChild(planetGrid);

    // Detect touch/mobile: coarse pointer = no mouse/keyboard
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    if (!isTouchDevice) {
      // — Camera D-pad (zoom + rotate) — desktop only
      const camLabel = document.createElement('div');
      camLabel.textContent = 'Camera:';
      camLabel.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px';
      contentDiv.appendChild(camLabel);

      const dpad = document.createElement('div');
      dpad.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:8px';
      const empty1 = document.createElement('div');
      const empty2 = document.createElement('div');
      const zoomIn  = mkBtn('▲',  () => { this.camera.radius = Math.max(this.camera.lowerRadiusLimit, this.camera.radius - 5); });
      const rotL    = mkBtn('◀',  () => { this.camera.alpha -= 0.1; });
      const zoomOut = mkBtn('▼',  () => { this.camera.radius = Math.min(this.camera.upperRadiusLimit, this.camera.radius + 5); });
      const rotR    = mkBtn('▶',  () => { this.camera.alpha += 0.1; });
      dpad.appendChild(empty1); dpad.appendChild(zoomIn); dpad.appendChild(empty2);
      dpad.appendChild(rotL);   dpad.appendChild(zoomOut); dpad.appendChild(rotR);
      contentDiv.appendChild(dpad);
    }

    // — Action buttons (G / N / R, plus M·Mouse for desktop only)
    const actionGrid = document.createElement('div');
    actionGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px';
    if (!isTouchDevice) {
      actionGrid.appendChild(mkBtn('M · Mouse', () => this.toggleManualControl()));
    }
    actionGrid.appendChild(mkBtn('G · Galaxy', () => {
      this.switchGalaxy((this.currentGalaxyIndex + 1) % this.galaxies.length);
    }));
    actionGrid.appendChild(mkBtn('N · Melody', () => this.switchMelodyMode()));
    actionGrid.appendChild(mkBtn('R · Random', () => this.randomizeMelodyMode()));
    contentDiv.appendChild(actionGrid);

    // — Status display
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'padding-top:8px;border-top:1px solid rgba(255,255,255,0.3);font-size:12px';
    statusDiv.innerHTML = `
      <div><strong>Current:</strong> <span id="currentPreset">Spawn Point</span></div>
      <div style="margin-top:4px"><strong>Galaxy:</strong> <span id="currentGalaxy">Solar System</span></div>
    `;
    contentDiv.appendChild(statusDiv);

    // Create volume control section
    const volumeDiv = document.createElement('div');
    volumeDiv.style.marginTop = '15px';
    volumeDiv.style.paddingTop = '15px';
    volumeDiv.style.borderTop = '1px solid rgba(255,255,255,0.3)';

    const volumeLabel = document.createElement('div');
    volumeLabel.innerHTML = '<strong>🎵 Music Volume:</strong>';
    volumeLabel.style.marginBottom = '8px';

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = '40'; // Default to 40% (0.08 gain / 0.2 max)
    volumeSlider.style.width = '100%';
    volumeSlider.style.cursor = 'pointer';

    const volumeValue = document.createElement('span');
    volumeValue.textContent = '40%';
    volumeValue.style.fontSize = '12px';
    volumeValue.style.marginLeft = '10px';

    volumeSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      volumeValue.textContent = `${value}%`;
      if (this.musicGainNode) {
        // Scale volume from 0 to 0.2 (max reasonable volume)
        this.musicGainNode.gain.value = value / 500;
      }
    });

    const volumeControls = document.createElement('div');
    volumeControls.style.display = 'flex';
    volumeControls.style.alignItems = 'center';
    volumeControls.appendChild(volumeSlider);
    volumeControls.appendChild(volumeValue);

    volumeDiv.appendChild(volumeLabel);
    volumeDiv.appendChild(volumeControls);

    // Assemble the UI
    uiDiv.appendChild(headerDiv);
    uiDiv.appendChild(contentDiv);
    uiDiv.appendChild(volumeDiv);

    // Add toggle functionality - retractable, not hidden
    let isExpanded = true;
    const toggleContent = () => {
      isExpanded = !isExpanded;
      if (isExpanded) {
        contentDiv.style.display = 'block';
        volumeDiv.style.display = 'block';
        toggleButton.textContent = '−';
        uiDiv.style.maxHeight = '600px';
      } else {
        contentDiv.style.display = 'none';
        volumeDiv.style.display = 'none';
        toggleButton.textContent = '+';
        uiDiv.style.maxHeight = '60px';
      }
    };

    headerDiv.addEventListener('click', toggleContent);

    // Hide the controls panel whenever a modal is open, restore when closed
    const modalIds = ['planetModal', 'authModal'];
    const observeModal = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new MutationObserver(() => {
        const anyOpen = modalIds.some(
          mid => (document.getElementById(mid)?.style.display || 'none') !== 'none'
        );
        uiDiv.style.visibility = anyOpen ? 'hidden' : 'visible';
        uiDiv.style.pointerEvents = anyOpen ? 'none' : 'auto';
      });
      obs.observe(el, { attributes: true, attributeFilter: ['style'] });
      this.modalObservers.push(obs);
    };
    modalIds.forEach(observeModal);

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
      const planetEntry = Array.from(this.planetDataMap.entries()).find(
        ([id, _]) => this.planets.get(id) === planet,
      );
      planetName = planetEntry ? planetEntry[1].name : 'Unknown';
    }

    const offset = new Vector3(10, 10, 10);
    const targetPosition = planet.position.add(offset);

    this.animateCamera(targetPosition, planet.position);
    this.updatePresetUI(`Follow ${planetName}`);
  }

  private getPresetCameraPosition(preset: CameraPreset): Vector3 {
    switch (preset) {
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
    switch (preset) {
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

  /**
   * Hyperspace jump: a burst of velocity-stretched star streaks past the
   * camera, an FOV punch, and a white-hot exposure flash. Fired at the moment
   * a galaxy switch swaps the system.
   */
  private playWarpEffect(): void {
    // ── Star streaks radiating past the camera ──────────────────────────
    const streakTex = new DynamicTexture('warpStreakTex', 32, this.scene, false);
    const sCtx = streakTex.getContext() as CanvasRenderingContext2D;
    const sg = sCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.5, 'rgba(190,215,255,0.7)');
    sg.addColorStop(1, 'rgba(120,160,255,0)');
    sCtx.fillStyle = sg; sCtx.fillRect(0, 0, 32, 32);
    streakTex.update();

    const streaks = new ParticleSystem('warpStreaks', 160, this.scene);
    streaks.emitter = this.camera.position.clone();
    streaks.particleEmitterType = new SphereParticleEmitter(3);
    streaks.particleTexture = streakTex;
    streaks.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED; // hyperspace lines
    streaks.minSize = 0.22; streaks.maxSize = 0.5;
    streaks.minLifeTime = 0.5; streaks.maxLifeTime = 0.9;
    streaks.emitRate = 0;
    streaks.manualEmitCount = 160;
    streaks.blendMode = ParticleSystem.BLENDMODE_ADD;
    streaks.minEmitPower = 90; streaks.maxEmitPower = 170;
    streaks.color1 = new Color4(0.85, 0.92, 1.0, 0.9);
    streaks.color2 = new Color4(0.55, 0.75, 1.0, 0.7);
    streaks.colorDead = new Color4(0.3, 0.5, 1.0, 0);
    streaks.start();
    const cleanup = window.setTimeout(() => streaks.dispose(), 2500);
    this.meteorTimeouts.push(cleanup);

    // ── FOV punch + exposure flash envelope ─────────────────────────────
    const baseFov = 0.92;
    const baseExposure = 1.12;
    let t = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.engine.getDeltaTime() / 1000;
      const k = t / 1.1; // total flash duration in seconds
      if (k >= 1) {
        this.camera.fov = baseFov;
        if (this.cinematicPipeline) {
          this.cinematicPipeline.imageProcessing.exposure = baseExposure;
        }
        this.scene.onBeforeRenderObservable.remove(obs);
        return;
      }
      const env = Math.sin(Math.min(1, k) * Math.PI);
      this.camera.fov = baseFov + env * 0.22;
      if (this.cinematicPipeline) {
        this.cinematicPipeline.imageProcessing.exposure = baseExposure + env * 1.4;
      }
    });

    this.playSound('warp');
  }

  /**
   * Opening establishing shot: the camera starts far out and sweeps down
   * into the system over six seconds, like a title sequence.
   */
  private playIntroShot(): void {
    const cam = this.camera;
    const endAlpha = Math.PI / 4;
    const endBeta = Math.acos(40 / Math.sqrt(80 * 80 + 40 * 40 + 80 * 80));
    const endRadius = 120;
    const startAlpha = endAlpha - 1.7;
    const startBeta = Math.min(endBeta + 0.25, 1.35);
    const startRadius = 290;

    this.isCameraTransitioning = true; // pause idle drift during the shot
    let t = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.engine.getDeltaTime() / 1000;
      const k = Math.min(1, t / 6);
      const e = this.easeInOutCubic(k);
      cam.alpha = startAlpha + (endAlpha - startAlpha) * e;
      cam.beta = startBeta + (endBeta - startBeta) * e;
      cam.radius = startRadius + (endRadius - startRadius) * e;
      cam.target = Vector3.Zero();
      if (k >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        this.isCameraTransitioning = false;
      }
    });
  }

  private getPresetName(preset: CameraPreset): string {
    switch (preset) {
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
        this.backgroundMusic.play().catch((err) => {
          console.log(
            'Background music autoplay blocked - user interaction needed',
          );
        });
      }
    } catch (err) {
      console.warn('Audio initialization failed:', err);
    }
  }

  private createSynthesizedSpaceMusic(): void {
    // Cinematic ambient score, fully synthesized with WebAudio:
    //  · a deep detuned sub-drone (the "engine hum of the universe")
    //  · filtered noise "air" that slowly breathes
    //  · vast pad chords built from open fifths + ninths that drift by
    try {
      // Reuse existing audio context or create new one
      if (!this.audioContext) {
        this.audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      const ctx = this.audioContext;

      // Master volume — fades in over five seconds like a film open
      this.musicGainNode = ctx.createGain();
      this.musicGainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.musicGainNode.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 5);
      this.musicGainNode.connect(ctx.destination);

      // ── Sub drone: detuned sines an octave apart, slowly swelling ──────
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.14;
      droneGain.connect(this.musicGainNode);
      [
        { f: 55.0, g: 0.5 },
        { f: 55.35, g: 0.45 },
        { f: 110.4, g: 0.22 },
      ].forEach((v) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = v.f;
        const g = ctx.createGain();
        g.gain.value = v.g;
        osc.connect(g);
        g.connect(droneGain);
        osc.start();
        this.musicOscillators.push(osc);
      });
      // Slow amplitude swell on the drone
      const droneLfo = ctx.createOscillator();
      droneLfo.type = 'sine';
      droneLfo.frequency.value = 0.05;
      const droneLfoGain = ctx.createGain();
      droneLfoGain.gain.value = 0.05;
      droneLfo.connect(droneLfoGain);
      droneLfoGain.connect(droneGain.gain);
      droneLfo.start();
      this.musicOscillators.push(droneLfo);

      // ── Space "air": looped brown noise through a breathing lowpass ────
      const noiseLen = 2 * ctx.sampleRate;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < noiseLen; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        nd[i] = last * 3.5;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 320;
      noiseFilter.Q.value = 0.4;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.05;
      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.musicGainNode);
      noiseSrc.start();
      // The filter slowly opens and closes — solar wind
      const airLfo = ctx.createOscillator();
      airLfo.type = 'sine';
      airLfo.frequency.value = 0.02;
      const airLfoGain = ctx.createGain();
      airLfoGain.gain.value = 160;
      airLfo.connect(airLfoGain);
      airLfoGain.connect(noiseFilter.frequency);
      airLfo.start();
      this.musicOscillators.push(airLfo);

      // ── Pad progressions: each "melody mode" is a sequence of chord
      //    roots; the pad voicing (root · 5th · octave · 9th) is stacked in
      //    schedulePad(). Open voicings = vast, weightless, never saccharine.
      this.melodyModes = [
        // Mode 0: A minor space — wonder with gravity
        [
          { freq: 110.0, duration: 13 }, // A2
          { freq: 87.31, duration: 13 }, // F2
          { freq: 130.81, duration: 13 }, // C3
          { freq: 98.0, duration: 13 }, // G2
        ],
        // Mode 1: D dorian drift
        [
          { freq: 73.42, duration: 14 }, // D2
          { freq: 116.54, duration: 14 }, // Bb2
          { freq: 87.31, duration: 14 }, // F2
          { freq: 110.0, duration: 14 }, // A2
        ],
        // Mode 2: E minor deep field
        [
          { freq: 82.41, duration: 13 }, // E2
          { freq: 130.81, duration: 13 }, // C3
          { freq: 98.0, duration: 13 }, // G2
          { freq: 123.47, duration: 13 }, // B2
        ],
        // Mode 3: C lydian dawn — the bright one
        [
          { freq: 65.41, duration: 14 }, // C2
          { freq: 98.0, duration: 14 }, // G2
          { freq: 110.0, duration: 14 }, // A2
          { freq: 87.31, duration: 14 }, // F2
        ],
      ];

      this.playCurrentMelody();
    } catch (err) {
      console.warn('Could not create synthesized music:', err);
    }
  }

  private playCurrentMelody(): void {
    if (!this.audioContext || !this.musicGainNode) return;

    const progression = this.melodyModes[this.currentMelodyMode];
    let tCur = this.audioContext.currentTime + 0.2;

    progression.forEach((chord) => {
      // Pads overlap by a few seconds so the harmony crossfades seamlessly
      this.schedulePad(chord.freq, tCur, chord.duration + 5);
      tCur += chord.duration;
    });

    // Schedule next loop
    const totalDuration = progression.reduce((sum, c) => sum + c.duration, 0);
    this.melodyTimeout = window.setTimeout(() => {
      if (this.isMusicEnabled && this.audioContext) {
        this.playCurrentMelody();
      }
    }, totalDuration * 1000);
  }

  /** One vast pad chord: root · fifth · octave · ninth, detuned & filtered. */
  private schedulePad(root: number, start: number, length: number): void {
    if (!this.audioContext || !this.musicGainNode) return;
    const ctx = this.audioContext;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    // The filter blooms open mid-chord and settles — the pad "breathes"
    filter.frequency.setValueAtTime(500, start);
    filter.frequency.linearRampToValueAtTime(1100, start + length * 0.5);
    filter.frequency.linearRampToValueAtTime(600, start + length);
    filter.connect(this.musicGainNode);

    const intervals = [1, 1.4983, 2, 2.2449, 2.9966]; // root 5th oct 9th 12th
    intervals.forEach((ratio, i) => {
      const level = 0.16 / (1 + i * 0.55);
      [-5, 5].forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'triangle' : 'sine';
        osc.frequency.value = root * ratio;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(level, start + length * 0.35);
        g.gain.setValueAtTime(level, start + length * 0.6);
        g.gain.linearRampToValueAtTime(0.0001, start + length);
        osc.connect(g);
        g.connect(filter);
        osc.start(start);
        osc.stop(start + length + 0.2);
        this.musicOscillators.push(osc);
      });
    });

    // Don't let the bookkeeping array grow without bound on long sessions
    if (this.musicOscillators.length > 300) {
      this.musicOscillators.splice(0, 150);
    }
  }

  private switchMelodyMode(): void {
    // Stop current melody
    if (this.melodyTimeout !== null) {
      clearTimeout(this.melodyTimeout);
      this.melodyTimeout = null;
    }

    // Stop all current oscillators
    this.musicOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (err) {
        // Oscillator might already be stopped
      }
    });
    this.musicOscillators = [];

    // Switch to next mode
    this.currentMelodyMode =
      (this.currentMelodyMode + 1) % this.melodyModes.length;

    // Start new melody
    if (this.isMusicEnabled && this.audioContext) {
      this.playCurrentMelody();
      console.log(`Switched to melody mode ${this.currentMelodyMode}`);
    }
  }

  private randomizeMelodyMode(): void {
    // Stop current melody
    if (this.melodyTimeout !== null) {
      clearTimeout(this.melodyTimeout);
      this.melodyTimeout = null;
    }

    // Stop all current oscillators
    this.musicOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (err) {
        // Oscillator might already be stopped
      }
    });
    this.musicOscillators = [];

    // Pick random mode (different from current)
    let newMode = this.currentMelodyMode;
    while (newMode === this.currentMelodyMode && this.melodyModes.length > 1) {
      newMode = Math.floor(Math.random() * this.melodyModes.length);
    }
    this.currentMelodyMode = newMode;

    // Start new melody
    if (this.isMusicEnabled && this.audioContext) {
      this.playCurrentMelody();
      console.log(`Randomized to melody mode ${this.currentMelodyMode}`);
    }
  }

  private createSoundEffects(): void {
    // Generate cute sounds using Web Audio API
    // No need for external audio files
    console.log('Sound effects system initialized with synthesized sounds');
  }

  private playSound(soundName: string): void {
    if (!this.isSoundEnabled || !this.audioContext) return;

    try {
      // Create cute synthesized sounds using Web Audio API
      const now = this.audioContext.currentTime;
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Different sounds for different actions
      switch (soundName) {
        case 'click':
          // Planet click - cute ascending chirp
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(600, now);
          oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
          gainNode.gain.setValueAtTime(0.3, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          oscillator.start(now);
          oscillator.stop(now + 0.15);
          break;

        case 'hover':
          // Hover - soft pop
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(800, now);
          gainNode.gain.setValueAtTime(0.15, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
          oscillator.start(now);
          oscillator.stop(now + 0.08);
          break;

        case 'galaxy-switch':
          // Galaxy switch - magical sparkle
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(523.25, now); // C5
          oscillator.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2); // C6
          gainNode.gain.setValueAtTime(0.25, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
          break;

        case 'camera-change':
          // Camera change - soft cinematic ping
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(660, now);
          oscillator.frequency.exponentialRampToValueAtTime(495, now + 0.18);
          gainNode.gain.setValueAtTime(0.12, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;

        case 'warp': {
          // Hyperspace jump — noise sweep rising through a bandpass + sub boom
          const dur = 1.1;
          const len = Math.ceil(dur * this.audioContext.sampleRate);
          const buf = this.audioContext.createBuffer(1, len, this.audioContext.sampleRate);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
          const src = this.audioContext.createBufferSource();
          src.buffer = buf;
          const bp = this.audioContext.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 1.2;
          bp.frequency.setValueAtTime(180, now);
          bp.frequency.exponentialRampToValueAtTime(3200, now + dur * 0.6);
          bp.frequency.exponentialRampToValueAtTime(400, now + dur);
          const ng = this.audioContext.createGain();
          ng.gain.setValueAtTime(0.0001, now);
          ng.gain.linearRampToValueAtTime(0.35, now + dur * 0.35);
          ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(this.audioContext.destination);
          src.start(now);
          // Sub-bass boom underneath
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(70, now);
          oscillator.frequency.exponentialRampToValueAtTime(26, now + 0.9);
          gainNode.gain.setValueAtTime(0.4, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
          oscillator.start(now);
          oscillator.stop(now + 0.95);
          break;
        }

        case 'modal-open':
          // Modal open - rising arpeggio
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(400, now);
          oscillator.frequency.setValueAtTime(500, now + 0.05);
          oscillator.frequency.setValueAtTime(650, now + 0.1);
          gainNode.gain.setValueAtTime(0.2, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;

        case 'modal-close':
          // Modal close - descending tone
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(650, now);
          oscillator.frequency.exponentialRampToValueAtTime(350, now + 0.15);
          gainNode.gain.setValueAtTime(0.2, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          oscillator.start(now);
          oscillator.stop(now + 0.15);
          break;

        case 'save':
          // Save - success chime (C major chord progression)
          this.playChord([523.25, 659.25, 783.99], 0.3, 0.2); // C-E-G
          break;

        default:
          // Default - simple beep
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, now);
          gainNode.gain.setValueAtTime(0.15, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          oscillator.start(now);
          oscillator.stop(now + 0.1);
      }
    } catch (err) {
      console.debug(`Could not play sound ${soundName}:`, err);
    }
  }

  private playChord(
    frequencies: number[],
    duration: number,
    volume: number,
  ): void {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;

    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        const oscillator = this.audioContext!.createOscillator();
        const gainNode = this.audioContext!.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, now);
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext!.destination);

        gainNode.gain.setValueAtTime(volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
      }, index * 50); // Slight delay between notes for arpeggio effect
    });
  }

  private addOrbitalTrail(planet: Mesh, color: string, planetId: string): void {
    // Create a vivid particle trail that follows the planet
    const trail = new ParticleSystem(`trail_${planetId}`, 140, this.scene);
    trail.emitter = planet;

    // Point emitter at planet position
    trail.minEmitBox = new Vector3(-0.15, -0.15, -0.15);
    trail.maxEmitBox = new Vector3(0.15, 0.15, 0.15);

    // Parse hex color and boost it for impact
    const hexColor = Color3.FromHexString(color);
    trail.color1 = new Color4(
      Math.min(1, hexColor.r * 1.4),
      Math.min(1, hexColor.g * 1.4),
      Math.min(1, hexColor.b * 1.4),
      0.9,
    );
    trail.color2 = new Color4(hexColor.r, hexColor.g, hexColor.b, 0.5);
    trail.colorDead = new Color4(hexColor.r * 0.5, hexColor.g * 0.5, hexColor.b * 0.5, 0);

    // Slightly larger particles compensate for the reduced count
    trail.minSize = 0.12;
    trail.maxSize = 0.32;

    // Longer fade for comet-tail effect
    trail.minLifeTime = 0.8;
    trail.maxLifeTime = 2.5;

    // Modest emit rate — comet tail look at reduced update cost
    trail.emitRate = 45;

    // Minimal velocity so particles stay close to orbit path
    trail.minEmitPower = 0.04;
    trail.maxEmitPower = 0.12;

    // Additive blending for bright glow
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;

    trail.start();
  }

  private toggleMusic(): void {
    this.isMusicEnabled = !this.isMusicEnabled;
    if (this.musicGainNode && this.audioContext) {
      // Smooth two-second fade instead of an abrupt cut
      const now = this.audioContext.currentTime;
      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.linearRampToValueAtTime(
        this.isMusicEnabled ? 0.09 : 0.0001,
        now + 2,
      );
    }
  }

  private toggleSounds(): void {
    this.isSoundEnabled = !this.isSoundEnabled;
  }

  private trackCustomizationParticle(planetId: string, system: ParticleSystem): void {
    if (!this.planetCustomizationParticles.has(planetId)) {
      this.planetCustomizationParticles.set(planetId, []);
    }
    this.planetCustomizationParticles.get(planetId)!.push(system);
  }

  private trackCustomizationCallback(planetId: string, callback: () => void): void {
    if (!this.planetCustomizationCallbacks.has(planetId)) {
      this.planetCustomizationCallbacks.set(planetId, []);
    }
    this.planetCustomizationCallbacks.get(planetId)!.push(callback);
    this.scene.registerBeforeRender(callback);
  }

  private removePlanetCustomizations(planetId: string): void {
    // Unregister render callbacks
    const callbacks = this.planetCustomizationCallbacks.get(planetId) || [];
    callbacks.forEach((cb) => this.scene.unregisterBeforeRender(cb));
    this.planetCustomizationCallbacks.delete(planetId);

    // Dispose particle systems
    const particles = this.planetCustomizationParticles.get(planetId) || [];
    particles.forEach((p) => { p.stop(); p.dispose(); });
    this.planetCustomizationParticles.delete(planetId);

    // Clear moon tracking (mesh is parented and auto-disposed with planet)
    this.moonMeshes.delete(planetId);

    // Dispose child meshes tagged as customizations
    const planet = this.planets.get(planetId);
    if (planet) {
      const toDispose = planet.getChildMeshes().filter((m) => m.name.startsWith('custom_'));
      toDispose.forEach((m) => m.dispose());
    }
  }

  private applyPlanetCustomizations(planet: Mesh, planetId: string, customizations: string[]): void {
    const data = this.planetDataMap.get(planetId);
    if (!data) return;
    const radius = data.actualRadius ?? data.size / 2;

    // Remove any previous customization effects first
    this.removePlanetCustomizations(planetId);

    customizations.forEach((id) => {
      switch (id) {
        case 'cosmic_rings':    this.addCosmicRings(planet, radius, planetId);    break;
        case 'star_aura':       this.addStarAura(planet, radius, planetId);       break;
        case 'moon_companion':  this.addMoonCompanion(planet, radius, planetId);  break;
        case 'crystal_shield':  this.addCrystalShield(planet, radius, planetId);  break;
        case 'nebula_cloud':    this.addNebulaCloud(planet, radius, planetId);    break;
        case 'comet_streaks':   this.addCometStreaks(planet, radius, planetId);   break;
        case 'sparkle_orbit':   this.addSparkleOrbit(planet, radius, planetId);  break;
        case 'aurora_glow':     this.addAuroraGlow(planet, radius, planetId);    break;
        // Particle Effects
        case 'fairy_dust':           this.addFairyDust(planet, radius, planetId);           break;
        case 'sakura_petals':        this.addSakuraPetals(planet, radius, planetId);        break;
        case 'snow_globe':           this.addSnowGlobe(planet, radius, planetId);           break;
        case 'firefly_dance':        this.addFireflyDance(planet, radius, planetId);        break;
        case 'spirit_orbs':          this.addSpiritOrbs(planet, radius, planetId);          break;
        case 'ember_sparks':         this.addEmberSparks(planet, radius, planetId);         break;
        case 'poison_cloud':         this.addPoisonCloud(planet, radius, planetId);         break;
        case 'stardust_rain':        this.addStardustRain(planet, radius, planetId);        break;
        case 'candy_confetti':       this.addCandyConfetti(planet, radius, planetId);       break;
        case 'butterfly_shower':     this.addButterflyShower(planet, radius, planetId);     break;
        case 'ghost_wisps':          this.addGhostWisps(planet, radius, planetId);          break;
        case 'crystal_shards':       this.addCrystalShards(planet, radius, planetId);       break;
        case 'love_hearts':          this.addLoveHearts(planet, radius, planetId);          break;
        case 'sand_vortex':          this.addSandVortex(planet, radius, planetId);          break;
        case 'cosmic_web':           this.addCosmicWeb(planet, radius, planetId);           break;
        case 'music_particles':      this.addMusicParticles(planet, radius, planetId);      break;
        case 'quantum_foam':         this.addQuantumFoam(planet, radius, planetId);         break;
        case 'rainbow_mist':         this.addRainbowMist(planet, radius, planetId);         break;
        case 'void_particles':       this.addVoidParticles(planet, radius, planetId);       break;
        case 'ancient_dust':         this.addAncientDust(planet, radius, planetId);         break;
        case 'water_droplets':       this.addWaterDroplets(planet, radius, planetId);       break;
        case 'neon_rain':            this.addNeonRain(planet, radius, planetId);            break;
        case 'phoenix_sparks':       this.addPhoenixSparks(planet, radius, planetId);       break;
        case 'icy_flakes':           this.addIcyFlakes(planet, radius, planetId);           break;
        case 'solar_wind':           this.addSolarWind(planet, radius, planetId);           break;
        case 'toxic_bubbles':        this.addToxicBubbles(planet, radius, planetId);        break;
        case 'dream_wisps':          this.addDreamWisps(planet, radius, planetId);          break;
        case 'golden_sparkles':      this.addGoldenSparkles(planet, radius, planetId);      break;
        case 'galaxy_motes':         this.addGalaxyMotes(planet, radius, planetId);         break;
        case 'plasma_sparks':        this.addPlasmaSparks(planet, radius, planetId);        break;
        // Glow/Shell Effects
        case 'dark_matter_shell':    this.addDarkMatterShell(planet, radius, planetId);     break;
        case 'plasma_mantle':        this.addPlasmaMantle(planet, radius, planetId);        break;
        case 'jade_aura':            this.addJadeAura(planet, radius, planetId);            break;
        case 'golden_divine':        this.addGoldenDivine(planet, radius, planetId);        break;
        case 'void_aura':            this.addVoidAura(planet, radius, planetId);            break;
        case 'lunar_glow':           this.addLunarGlow(planet, radius, planetId);           break;
        case 'flame_shell':          this.addFlameShell(planet, radius, planetId);          break;
        case 'ice_shell':            this.addIceShell(planet, radius, planetId);            break;
        case 'thunder_mantle':       this.addThunderMantle(planet, radius, planetId);       break;
        case 'prismatic_shell':      this.addPrismaticShell(planet, radius, planetId);      break;
        case 'spectral_veil':        this.addSpectralVeil(planet, radius, planetId);        break;
        case 'solar_corona':         this.addSolarCorona(planet, radius, planetId);         break;
        case 'nature_bloom':         this.addNatureBloom(planet, radius, planetId);         break;
        case 'holographic_field':    this.addHolographicField(planet, radius, planetId);    break;
        case 'shadow_cloak':         this.addShadowCloak(planet, radius, planetId);         break;
        case 'rose_quartz_glow':     this.addRoseQuartzGlow(planet, radius, planetId);      break;
        case 'sapphire_aura':        this.addSapphireAura(planet, radius, planetId);        break;
        case 'emerald_pulse':        this.addEmeraldPulse(planet, radius, planetId);        break;
        case 'ruby_glow':            this.addRubyGlow(planet, radius, planetId);            break;
        case 'obsidian_shell':       this.addObsidianShell(planet, radius, planetId);       break;
        case 'amethyst_haze':        this.addAmethystHaze(planet, radius, planetId);        break;
        case 'topaz_shimmer':        this.addTopazShimmer(planet, radius, planetId);        break;
        case 'opal_glow':            this.addOpalGlow(planet, radius, planetId);            break;
        case 'divine_light_aura':    this.addDivineLightAura(planet, radius, planetId);     break;
        case 'abyssal_dark':         this.addAbyssalDark(planet, radius, planetId);         break;
        // Ring/Torus Effects
        case 'rainbow_rings':        this.addRainbowRings(planet, radius, planetId);        break;
        case 'neon_rings':           this.addNeonRings(planet, radius, planetId);           break;
        case 'pearl_rings':          this.addPearlRings(planet, radius, planetId);          break;
        case 'fire_ring':            this.addFireRing(planet, radius, planetId);            break;
        case 'ice_ring':             this.addIceRing(planet, radius, planetId);             break;
        case 'void_ring':            this.addVoidRing(planet, radius, planetId);            break;
        case 'golden_halo_ring':     this.addGoldenHaloRing(planet, radius, planetId);      break;
        case 'radiant_halo_rings':   this.addRadiantHaloRings(planet, radius, planetId);    break;
        case 'eclipse_ring':         this.addEclipseRing(planet, radius, planetId);         break;
        case 'atomic_rings':         this.addAtomicRings(planet, radius, planetId);         break;
        case 'double_helix_ring':    this.addDoubleHelixRing(planet, radius, planetId);     break;
        case 'spiral_rings':         this.addSpiralRings(planet, radius, planetId);         break;
        case 'electric_hoop':        this.addElectricHoop(planet, radius, planetId);        break;
        case 'cosmic_crown_rings':   this.addCosmicCrownRings(planet, radius, planetId);    break;
        case 'sakura_ring':          this.addSakuraRing(planet, radius, planetId);          break;
        // Orbiting Objects
        case 'triple_moons':         this.addTripleMoons(planet, radius, planetId);         break;
        case 'asteroid_belt_orbit':  this.addAsteroidBeltOrbit(planet, radius, planetId);   break;
        case 'gem_orbit':            this.addGemOrbit(planet, radius, planetId);            break;
        case 'crystal_orbit':        this.addCrystalOrbit(planet, radius, planetId);        break;
        case 'fairy_lights_orbit':   this.addFairyLightsOrbit(planet, radius, planetId);    break;
        case 'satellite_swarm':      this.addSatelliteSwarm(planet, radius, planetId);      break;
        case 'lotus_orbit':          this.addLotusOrbit(planet, radius, planetId);          break;
        case 'clockwork_orbit':      this.addClockworkOrbit(planet, radius, planetId);      break;
        case 'soul_lanterns_orbit':  this.addSoulLanternsOrbit(planet, radius, planetId);   break;
        case 'star_companions':      this.addStarCompanions(planet, radius, planetId);      break;
        case 'diamond_orbit':        this.addDiamondOrbit(planet, radius, planetId);        break;
        case 'ancient_orbs':         this.addAncientOrbs(planet, radius, planetId);         break;
        case 'binary_moons':         this.addBinaryMoons(planet, radius, planetId);         break;
        case 'prism_towers_orbit':   this.addPrismTowersOrbit(planet, radius, planetId);    break;
        case 'flower_companions':    this.addFlowerCompanions(planet, radius, planetId);    break;
        case 'sacred_geometry_orbit':this.addSacredGeometryOrbit(planet, radius, planetId); break;
        case 'ice_pillar_orbit':     this.addIcePillarOrbit(planet, radius, planetId);      break;
        case 'thunder_orbs_orbit':   this.addThunderOrbsOrbit(planet, radius, planetId);    break;
        case 'mini_planets_orbit':   this.addMiniPlanetsOrbit(planet, radius, planetId);    break;
        case 'comet_companions':     this.addCometCompanions(planet, radius, planetId);     break;
        // Complex/Special Effects
        case 'supernova_pulse':      this.addSupernovaPulse(planet, radius, planetId);      break;
        case 'vortex_storm':         this.addVortexStorm(planet, radius, planetId);         break;
        case 'aurora_pillars':       this.addAuroraPillars(planet, radius, planetId);       break;
        case 'galaxy_swirl_effect':  this.addGalaxySwirl(planet, radius, planetId);         break;
        case 'time_ripple':          this.addTimeRipple(planet, radius, planetId);          break;
        case 'eclipse_shadow':       this.addEclipseShadow(planet, radius, planetId);       break;
        case 'northern_lights_effect':this.addNorthernLightsEffect(planet, radius, planetId);break;
        case 'cosmic_bloom_effect':  this.addCosmicBloomEffect(planet, radius, planetId);   break;
        case 'dimensional_rift':     this.addDimensionalRift(planet, radius, planetId);     break;
        case 'heartbeat_pulse':      this.addHeartbeatPulse(planet, radius, planetId);      break;
      }
    });
  }

  // ── Cosmic Rings ────────────────────────────────────────────────────────────
  private addCosmicRings(planet: Mesh, radius: number, planetId: string): void {
    const ringColors = [
      new Color3(1.0, 0.3, 0.9),
      new Color3(0.3, 0.9, 1.0),
      new Color3(1.0, 0.85, 0.2),
      new Color3(0.5, 1.0, 0.4),
    ];
    // Each ring spins on a different axis at a different speed (some CW, some CCW)
    const rotSpeeds = [
      { x: 0.007,  y: 0.003,  z: 0 },
      { x: 0,      y: -0.011, z: 0.004 },
      { x: -0.005, y: 0.014,  z: 0 },
      { x: 0.009,  y: -0.006, z: 0.003 },
    ];

    const ringRefs: Mesh[] = [];
    ringColors.forEach((color, i) => {
      const ring = MeshBuilder.CreateTorus(
        `custom_cosmicRing${i}_${planetId}`,
        { diameter: radius * 2 * (2.8 + i * 0.7), thickness: 0.25, tessellation: 128 },
        this.scene,
      );
      ring.parent = planet;
      ring.position = Vector3.Zero();
      ring.rotation.x = Math.PI / 2 + i * 0.2;
      ring.rotation.z = i * 0.25;
      ring.isPickable = false;
      const mat = new StandardMaterial(`custom_cosmicRingMat${i}_${planetId}`, this.scene);
      mat.emissiveColor = color;
      mat.alpha = 0.65;
      mat.backFaceCulling = false;
      ring.material = mat;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(ring);
      ringRefs.push(ring);
    });

    // Animate each ring independently
    const cb = () => {
      ringRefs.forEach((ring, i) => {
        if (ring.isDisposed()) return;
        ring.rotation.x += rotSpeeds[i].x;
        ring.rotation.y += rotSpeeds[i].y;
        ring.rotation.z += rotSpeeds[i].z;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }

  // ── Star Aura ────────────────────────────────────────────────────────────────
  private addStarAura(planet: Mesh, radius: number, planetId: string): void {
    // Pulsing glow sphere
    const glowSphere = MeshBuilder.CreateSphere(
      `custom_starAuraGlow_${planetId}`,
      { diameter: radius * 2 * 1.35, segments: 16 },
      this.scene,
    );
    glowSphere.parent = planet;
    glowSphere.position = Vector3.Zero();
    glowSphere.isPickable = false;
    const glowMat = new StandardMaterial(`custom_starAuraMat_${planetId}`, this.scene);
    glowMat.emissiveColor = new Color3(1, 0.95, 0.5);
    glowMat.alpha = 0.18;
    glowMat.backFaceCulling = false;
    glowSphere.material = glowMat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(glowSphere);

    // Pulse scale + cycle through warm hues (gold → orange → white → gold)
    let t = 0;
    const cb = () => {
      if (glowSphere.isDisposed()) return;
      t += 0.04;
      glowSphere.scaling.setAll(1 + Math.sin(t) * 0.12);
      // Colour cycle: r always 1, g oscillates 0.6–1, b oscillates 0.1–0.6
      const g = 0.75 + Math.sin(t * 0.7) * 0.2;
      const b = 0.35 + Math.sin(t * 0.5 + 1.0) * 0.25;
      glowMat.emissiveColor.set(1, Math.max(0.6, g), Math.max(0.1, b));
    };
    this.trackCustomizationCallback(planetId, cb);

    // Corona particle burst
    const sys = new ParticleSystem(`custom_starAuraParticles_${planetId}`, 250, this.scene);
    sys.emitter = planet;
    sys.particleEmitterType = new SphereParticleEmitter(radius * 0.65);
    const tex = new DynamicTexture(`custom_starAuraTex_${planetId}`, 64, this.scene, false);
    const ctx = tex.getContext();
    const g2 = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g2.addColorStop(0, 'rgba(255, 255, 200, 1)');
    g2.addColorStop(0.5, 'rgba(255, 200, 80, 0.6)');
    g2.addColorStop(1, 'rgba(255, 150, 0, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 64, 64);
    tex.update();
    sys.particleTexture = tex;
    sys.minSize = 0.1; sys.maxSize = 0.45;
    sys.minLifeTime = 1; sys.maxLifeTime = 2.5;
    sys.emitRate = 60;
    sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 0.05; sys.maxEmitPower = 0.2;
    sys.color1 = new Color4(1, 1, 0.8, 0.9);
    sys.color2 = new Color4(1, 0.85, 0.4, 0.6);
    sys.colorDead = new Color4(1, 0.5, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }

  // ── Moon Companion ───────────────────────────────────────────────────────────
  private addMoonCompanion(planet: Mesh, radius: number, planetId: string): void {
    const moonDiameter = Math.max(radius * 0.7, 1.0);
    const moon = MeshBuilder.CreateSphere(
      `custom_moon_${planetId}`,
      { diameter: moonDiameter, segments: 32 },
      this.scene,
    );
    moon.parent = planet;
    moon.isPickable = false;
    const mat = new PBRMaterial(`custom_moonMat_${planetId}`, this.scene);
    mat.albedoColor = new Color3(0.85, 0.82, 0.75);
    mat.metallic = 0;
    mat.roughness = 0.9;
    mat.emissiveColor = new Color3(0.12, 0.11, 0.1);
    moon.material = mat;

    const orbitRadius = radius * 3.5;
    this.moonMeshes.set(planetId, { mesh: moon, angle: 0, orbitRadius });
  }

  // ── Crystal Shield ───────────────────────────────────────────────────────────
  private addCrystalShield(planet: Mesh, radius: number, planetId: string): void {
    const shield = MeshBuilder.CreateSphere(
      `custom_crystalShield_${planetId}`,
      { diameter: radius * 2 * 1.45, segments: 16 },
      this.scene,
    );
    shield.parent = planet;
    shield.position = Vector3.Zero();
    shield.isPickable = false;
    const mat = new StandardMaterial(`custom_crystalShieldMat_${planetId}`, this.scene);
    mat.emissiveColor = new Color3(0.5, 0.2, 1.0);
    mat.alpha = 0.2;
    mat.wireframe = true;
    mat.backFaceCulling = false;
    shield.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(shield);

    let t = Math.random() * Math.PI * 2;
    const cb = () => {
      if (shield.isDisposed()) return;
      t += 0.025;
      shield.scaling.setAll(1 + Math.sin(t) * 0.08);
      // Dual-axis spin at different rates
      shield.rotation.y += 0.007;
      shield.rotation.x += 0.004;
      // Colour shift between violet and cyan
      const r = 0.4 + Math.sin(t * 0.6) * 0.3;
      const b = 0.9 + Math.sin(t * 0.4 + 1.2) * 0.1;
      mat.emissiveColor.set(Math.max(0.1, r), 0.15 + Math.abs(Math.sin(t * 0.9)) * 0.2, b);
      mat.alpha = 0.13 + Math.abs(Math.sin(t * 1.3)) * 0.12;
    };
    this.trackCustomizationCallback(planetId, cb);
  }

  // ── Nebula Cloud ─────────────────────────────────────────────────────────────
  private addNebulaCloud(planet: Mesh, radius: number, planetId: string): void {
    const sys = new ParticleSystem(`custom_nebula_${planetId}`, 200, this.scene);
    sys.emitter = planet;
    sys.particleEmitterType = new SphereParticleEmitter(radius * 1.5);
    sys.particleTexture = this.makeDefaultParticleTexture(`custom_nebula_${planetId}`);
    sys.minSize = 0.5; sys.maxSize = 1.5;
    sys.minLifeTime = 4; sys.maxLifeTime = 8;
    sys.emitRate = 25;
    sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 0.05; sys.maxEmitPower = 0.15;
    sys.color1 = new Color4(0.5, 0.2, 0.9, 0.4);
    sys.color2 = new Color4(0.9, 0.3, 0.5, 0.3);
    sys.colorDead = new Color4(0.3, 0.1, 0.6, 0);
    sys.minAngularSpeed = -0.2; sys.maxAngularSpeed = 0.2;
    sys.gravity = new Vector3(0, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }

  // ── Comet Streaks ────────────────────────────────────────────────────────────
  private addCometStreaks(planet: Mesh, radius: number, planetId: string): void {
    const sys = new ParticleSystem(`custom_comets_${planetId}`, 150, this.scene);
    sys.emitter = planet;
    sys.particleEmitterType = new SphereParticleEmitter(radius * 2.2);
    sys.particleTexture = this.makeDefaultParticleTexture(`custom_comets_${planetId}`);
    sys.minSize = 0.08; sys.maxSize = 0.2;
    sys.minLifeTime = 0.6; sys.maxLifeTime = 1.8;
    sys.emitRate = 40;
    sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 1.5; sys.maxEmitPower = 3.0;
    sys.direction1 = new Vector3(-1, 0.5, -1);
    sys.direction2 = new Vector3(1, -0.5, 1);
    sys.color1 = new Color4(1, 0.95, 0.7, 1);
    sys.color2 = new Color4(0.8, 0.9, 1, 0.8);
    sys.colorDead = new Color4(0.5, 0.7, 1, 0);
    sys.gravity = new Vector3(0, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }

  // ── Sparkle Orbit ────────────────────────────────────────────────────────────
  private addSparkleOrbit(planet: Mesh, radius: number, planetId: string): void {
    const sys = new ParticleSystem(`custom_sparkles_${planetId}`, 300, this.scene);
    sys.emitter = planet;
    sys.particleEmitterType = new SphereParticleEmitter(radius * 1.8);

    // 4-point star texture
    const tex = new DynamicTexture(`custom_sparkleTex_${planetId}`, 32, this.scene, false);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 32, 32);
    ctx.strokeStyle = 'rgba(255, 255, 200, 1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 1); ctx.lineTo(16, 31);
    ctx.moveTo(1, 16); ctx.lineTo(31, 16);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, 5); ctx.lineTo(27, 27);
    ctx.moveTo(27, 5); ctx.lineTo(5, 27);
    ctx.stroke();
    tex.update();
    sys.particleTexture = tex;

    sys.minSize = 0.12; sys.maxSize = 0.3;
    sys.minLifeTime = 1.5; sys.maxLifeTime = 3;
    sys.emitRate = 70;
    sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 0.05; sys.maxEmitPower = 0.25;
    sys.minAngularSpeed = -1; sys.maxAngularSpeed = 1;
    sys.color1 = new Color4(1, 1, 0.9, 1);
    sys.color2 = new Color4(0.9, 0.95, 1, 0.8);
    sys.colorDead = new Color4(1, 1, 1, 0);
    sys.gravity = new Vector3(0, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }

  // ── Aurora Glow ──────────────────────────────────────────────────────────────
  private addAuroraGlow(planet: Mesh, radius: number, planetId: string): void {
    const layers = [
      { color: new Color3(0, 1.0, 0.5),  scale: 1.28, alpha: 0.12 },
      { color: new Color3(0.5, 0, 1.0),  scale: 1.36, alpha: 0.10 },
      { color: new Color3(0, 0.8, 1.0),  scale: 1.44, alpha: 0.08 },
    ];
    // Each shell spins on a different axis at a different rate
    const spinAxes = [
      { y: 0.006, x: 0 },
      { y: -0.009, x: 0.004 },
      { y: 0.004,  x: -0.007 },
    ];

    const auroraRefs: { mesh: Mesh; mat: StandardMaterial; baseColor: Color3 }[] = [];

    layers.forEach((layer, i) => {
      const sphere = MeshBuilder.CreateSphere(
        `custom_aurora${i}_${planetId}`,
        { diameter: radius * 2 * layer.scale, segments: 16 },
        this.scene,
      );
      sphere.parent = planet;
      sphere.position = Vector3.Zero();
      sphere.isPickable = false;
      const mat = new StandardMaterial(`custom_auroraMat${i}_${planetId}`, this.scene);
      mat.emissiveColor = layer.color.clone();
      mat.alpha = layer.alpha;
      mat.backFaceCulling = false;
      sphere.material = mat;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(sphere);
      auroraRefs.push({ mesh: sphere, mat, baseColor: layer.color });
    });

    let t = Math.random() * Math.PI * 2;
    const cb = () => {
      t += 0.012;
      auroraRefs.forEach((ref, i) => {
        if (ref.mesh.isDisposed()) return;
        // Rotate each shell on its own axis
        ref.mesh.rotation.y += spinAxes[i].y;
        ref.mesh.rotation.x += spinAxes[i].x;
        // Colour shift
        const shift = Math.sin(t + i * 1.2);
        ref.mat.emissiveColor = new Color3(
          Math.max(0, ref.baseColor.r + shift * 0.3),
          Math.max(0, ref.baseColor.g + shift * 0.2),
          Math.max(0, ref.baseColor.b + shift * 0.15),
        );
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }


  // ── Auth Methods ────────────────────────────────────────────────────────────
  private setupAuthModal(): void {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authModalClose = document.getElementById('authModalClose');
    const authSignOutBtn = document.getElementById('authSignOutBtn');
    const authSignInBtn = document.getElementById('authSignInBtn');
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');

    // Tab switching (replaces inline onclick handlers)
    if (loginTab && registerTab && loginForm && registerForm) {
      loginTab.addEventListener('click', () => {
        (loginForm as HTMLElement).style.display = 'block';
        (registerForm as HTMLElement).style.display = 'none';
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
      });
      registerTab.addEventListener('click', () => {
        (registerForm as HTMLElement).style.display = 'block';
        (loginForm as HTMLElement).style.display = 'none';
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
      });
    }

    if (authModalClose) {
      authModalClose.addEventListener('click', () => {
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.style.display = 'none';
      });
    }
    window.addEventListener('click', (event) => {
      const authModal = document.getElementById('authModal');
      if (event.target === authModal && authModal) authModal.style.display = 'none';
    });

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (document.getElementById('loginEmail') as HTMLInputElement)?.value;
        const password = (document.getElementById('loginPassword') as HTMLInputElement)?.value;
        const errorEl = document.getElementById('loginError');
        if (errorEl) errorEl.style.display = 'none';
        try {
          await signInWithEmailAndPassword(this.auth, email, password);
          const authModal = document.getElementById('authModal');
          if (authModal) authModal.style.display = 'none';
          const planetModal = document.getElementById('planetModal');
          if (planetModal && (planetModal as any).dataset.pendingPlanetId) {
            const pendingId = (planetModal as any).dataset.pendingPlanetId;
            delete (planetModal as any).dataset.pendingPlanetId;
            const planet = this.planets.get(pendingId);
            if (planet) this.onPlanetClick(planet, pendingId);
          }
        } catch (err: any) {
          if (errorEl) { errorEl.textContent = err.message || 'Login failed'; errorEl.style.display = 'block'; }
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (document.getElementById('registerEmail') as HTMLInputElement)?.value;
        const password = (document.getElementById('registerPassword') as HTMLInputElement)?.value;
        const errorEl = document.getElementById('registerError');
        if (errorEl) errorEl.style.display = 'none';
        try {
          await createUserWithEmailAndPassword(this.auth, email, password);
          const authModal = document.getElementById('authModal');
          if (authModal) authModal.style.display = 'none';
          const planetModal = document.getElementById('planetModal');
          if (planetModal && (planetModal as any).dataset.pendingPlanetId) {
            const pendingId = (planetModal as any).dataset.pendingPlanetId;
            delete (planetModal as any).dataset.pendingPlanetId;
            const planet = this.planets.get(pendingId);
            if (planet) this.onPlanetClick(planet, pendingId);
          }
        } catch (err: any) {
          if (errorEl) { errorEl.textContent = err.message || 'Registration failed'; errorEl.style.display = 'block'; }
        }
      });
    }

    if (authSignOutBtn) {
      authSignOutBtn.addEventListener('click', async () => { await signOut(this.auth); });
    }
    if (authSignInBtn) {
      authSignInBtn.addEventListener('click', () => {
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.style.display = 'block';
      });
    }
  }

  private readonly BASE_CUSTOMIZATION_SLOTS = 2;
  private readonly STREAK_DIVISOR = 3;
  private readonly MAX_CUSTOMIZATION_SLOTS = 108;

  private updateAuthStatusUI(): void {
    const userDisplay = document.getElementById('authUserDisplay');
    const signOutBtn = document.getElementById('authSignOutBtn');
    const signInBtn = document.getElementById('authSignInBtn');
    const creditsDisplay = document.getElementById('creditsDisplay');
    if (this.currentUser) {
      const email = this.currentUser.email || '';
      const atIndex = email.indexOf('@');
      const displayEmail = atIndex > 0 ? email.substring(0, Math.min(3, atIndex)) + '***@' + email.substring(atIndex + 1) : email;
      if (userDisplay) userDisplay.textContent = '\uD83D\uDC64 ' + displayEmail;
      if (signOutBtn) signOutBtn.style.display = 'inline-block';
      if (signInBtn) signInBtn.style.display = 'none';
      if (creditsDisplay) { creditsDisplay.style.display = 'inline'; creditsDisplay.textContent = `💰 ${this.userCredits} credits`; }
    } else {
      if (userDisplay) userDisplay.textContent = '\uD83D\uDC64 Not logged in';
      if (signOutBtn) signOutBtn.style.display = 'none';
      if (signInBtn) signInBtn.style.display = 'inline-block';
      if (creditsDisplay) creditsDisplay.style.display = 'none';
    }
  }

  private updateStreakDisplay(planetId: string): void {
    const streakDisplay = document.getElementById('streakDisplay');
    const streakDaysEl = document.getElementById('streakDays');
    const customSlotsEl = document.getElementById('customSlots');
    let maxStreak = 0;
    const now = Date.now();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    this.planetDataMap.forEach((data) => {
      if (data.userId && this.currentUser && data.userId === this.currentUser.uid && data.claimedAt) {
        const ownershipDays = Math.max(0, Math.floor((now - data.claimedAt) / MS_PER_DAY));
        if (ownershipDays > maxStreak) maxStreak = ownershipDays;
      }
    });
    const slots = Math.min(this.BASE_CUSTOMIZATION_SLOTS + Math.floor(maxStreak / this.STREAK_DIVISOR), this.MAX_CUSTOMIZATION_SLOTS);
    if (streakDisplay) streakDisplay.style.display = 'flex';
    if (streakDaysEl) streakDaysEl.textContent = String(maxStreak);
    if (customSlotsEl) customSlotsEl.textContent = String(slots);
    this.enforceCustomizationSlots(slots);
  }

  private slotChangeHandler: (() => void) | null = null;

  private enforceCustomizationSlots(maxSlots: number): void {
    const allIds = this.getAllCustomizationIds();
    let checkedCount = 0;
    const checkboxes: HTMLInputElement[] = [];
    allIds.forEach(cid => {
      const cb = document.getElementById('custom_' + cid) as HTMLInputElement;
      checkboxes.push(cb);
      if (cb?.checked) checkedCount++;
    });

    const updateDisabledState = () => {
      let checked = 0;
      checkboxes.forEach(c => { if (c?.checked) checked++; });
      checkboxes.forEach(c => { if (c && !c.checked) c.disabled = checked >= maxSlots; });
    };

    checkboxes.forEach((cb, i) => {
      if (!cb) return;
      cb.disabled = !cb.checked && checkedCount >= maxSlots;
      if (this.slotChangeHandler) {
        cb.removeEventListener('change', this.slotChangeHandler);
      }
    });

    this.slotChangeHandler = updateDisabledState;
    checkboxes.forEach(cb => {
      if (cb) cb.addEventListener('change', this.slotChangeHandler!);
    });
  }

  private getAllCustomizationIds(): string[] {
    return [
      'cosmic_rings', 'star_aura', 'moon_companion', 'crystal_shield',
      'nebula_cloud', 'comet_streaks', 'sparkle_orbit', 'aurora_glow',
      'stardust_rain', 'phoenix_sparks', 'solar_wind', 'plasma_sparks',
      'dark_matter_shell', 'flame_shell', 'ice_shell', 'golden_divine',
      'rainbow_rings', 'atomic_rings', 'supernova_pulse', 'gem_orbit',
    ];
  }

  // ── Shared Helpers ──────────────────────────────────────────────────────────
  private makeGlowShell(id: string, planet: Mesh, radius: number, planetId: string,
    r: number, g: number, b: number, scale: number, alpha: number, pulseAmp: number, pulseSpeed: number): void {
    const sphere = MeshBuilder.CreateSphere('custom_' + id + '_' + planetId, { diameter: radius * 2 * scale, segments: 16 }, this.scene);
    sphere.parent = planet;
    sphere.position = Vector3.Zero();
    sphere.isPickable = false;
    const mat = new StandardMaterial('custom_' + id + 'Mat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(r, g, b);
    mat.alpha = alpha;
    mat.backFaceCulling = false;
    sphere.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(sphere);
    let t = 0;
    const cb = () => { if (sphere.isDisposed()) return; t += pulseSpeed; sphere.scaling.setAll(1 + Math.sin(t) * pulseAmp); };
    this.trackCustomizationCallback(planetId, cb);
  }

  private makeDefaultParticleTexture(id: string): DynamicTexture {
    const tex = new DynamicTexture('ptex_' + id, 32, this.scene, false);
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();
    return tex;
  }

  private makeParticleEffect(id: string, planet: Mesh, radius: number, planetId: string,
    capacity: number, emitRadius: number, minSize: number, maxSize: number, emitRate: number,
    minLife: number, maxLife: number, c1: Color4, c2: Color4, cDead: Color4, power: number = 0.1): void {
    const sys = new ParticleSystem('custom_' + id + '_' + planetId, capacity, this.scene);
    sys.emitter = planet;
    sys.particleEmitterType = new SphereParticleEmitter(emitRadius);
    sys.particleTexture = this.makeDefaultParticleTexture('custom_' + id + '_' + planetId);
    sys.minSize = minSize;
    sys.maxSize = maxSize;
    sys.minLifeTime = minLife;
    sys.maxLifeTime = maxLife;
    sys.emitRate = emitRate;
    sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 0.01;
    sys.maxEmitPower = power;
    sys.color1 = c1;
    sys.color2 = c2;
    sys.colorDead = cDead;
    sys.gravity = new Vector3(0, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }

  private makeRings(id: string, planet: Mesh, radius: number, planetId: string,
    configs: Array<{color: Color3; diameterMult: number; thickness: number; alpha: number;
      rotX: number; rotZ: number; spinX: number; spinY: number; spinZ: number}>): void {
    const ringRefs: {mesh: Mesh; sx: number; sy: number; sz: number}[] = [];
    configs.forEach((cfg, i) => {
      const ring = MeshBuilder.CreateTorus('custom_' + id + 'Ring' + i + '_' + planetId,
        { diameter: radius * 2 * cfg.diameterMult, thickness: cfg.thickness, tessellation: 64 }, this.scene);
      ring.parent = planet;
      ring.position = Vector3.Zero();
      ring.rotation.x = cfg.rotX;
      ring.rotation.z = cfg.rotZ;
      ring.isPickable = false;
      const mat = new StandardMaterial('custom_' + id + 'Mat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = cfg.color;
      mat.alpha = cfg.alpha;
      mat.backFaceCulling = false;
      ring.material = mat;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(ring);
      ringRefs.push({mesh: ring, sx: cfg.spinX, sy: cfg.spinY, sz: cfg.spinZ});
    });
    const cb = () => { ringRefs.forEach(r => { if (!r.mesh.isDisposed()) { r.mesh.rotation.x += r.sx; r.mesh.rotation.y += r.sy; r.mesh.rotation.z += r.sz; } }); };
    this.trackCustomizationCallback(planetId, cb);
  }

  private makeOrbitingObjects(id: string, planet: Mesh, radius: number, planetId: string,
    count: number, shape: 'sphere' | 'box' | 'cylinder', size: number, orbitR: number,
    color: Color3, emissive: Color3, speed: number, tilt: number, useGlow: boolean = true): void {
    const objects: {mesh: Mesh; angle: number; speed: number; orbitR: number; tilt: number}[] = [];
    for (let i = 0; i < count; i++) {
      let mesh: Mesh;
      const name = 'custom_' + id + i + '_' + planetId;
      if (shape === 'sphere') mesh = MeshBuilder.CreateSphere(name, {diameter: size}, this.scene);
      else if (shape === 'box') mesh = MeshBuilder.CreateBox(name, {size: size}, this.scene);
      else mesh = MeshBuilder.CreateCylinder(name, {height: size * 2, diameter: size * 0.5}, this.scene);
      mesh.parent = planet;
      const mat = new PBRMaterial('custom_' + id + 'Mat' + i + '_' + planetId, this.scene);
      mat.albedoColor = color;
      mat.emissiveColor = emissive;
      mat.metallic = 0.3;
      mat.roughness = 0.5;
      mesh.material = mat;
      mesh.isPickable = false;
      if (useGlow && this.glowLayer) this.glowLayer.addIncludedOnlyMesh(mesh);
      const initAngle = (i / count) * Math.PI * 2;
      objects.push({mesh, angle: initAngle, speed: speed * (0.8 + Math.random() * 0.4), orbitR, tilt});
    }
    const cb = () => {
      objects.forEach(o => {
        if (o.mesh.isDisposed()) return;
        o.angle += o.speed;
        o.mesh.position.x = Math.cos(o.angle) * o.orbitR;
        o.mesh.position.z = Math.sin(o.angle) * o.orbitR;
        o.mesh.position.y = Math.sin(o.angle * 0.7) * o.orbitR * o.tilt;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }

  // ── Particle Effects (30) ──────────────────────────────────────────────────
  private addFairyDust(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('fairy_dust', planet, radius, planetId, 300, radius * 1.5, 0.05, 0.2, 80, 1, 4,
      new Color4(1, 0.9, 0.3, 1), new Color4(1, 0.5, 0.8, 1), new Color4(0, 0, 0, 0));
  }
  private addSakuraPetals(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('sakura_petals', planet, radius, planetId, 150, radius * 1.8, 0.15, 0.4, 30, 3, 8,
      new Color4(1, 0.7, 0.8, 1), new Color4(1, 0.5, 0.65, 0.8), new Color4(0, 0, 0, 0));
  }
  private addSnowGlobe(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('snow_globe', planet, radius, planetId, 200, radius * 1.6, 0.05, 0.15, 60, 2, 6,
      new Color4(0.9, 0.95, 1, 1), new Color4(0.7, 0.85, 1, 0.9), new Color4(0, 0, 0, 0));
  }
  private addFireflyDance(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('firefly_dance', planet, radius, planetId, 80, radius * 2, 0.1, 0.25, 25, 3, 8,
      new Color4(0.8, 1, 0.2, 1), new Color4(0.4, 1, 0.1, 0.9), new Color4(0, 0, 0, 0));
  }
  private addSpiritOrbs(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('spirit_orbs', planet, radius, planetId, 40, radius * 2, 0.2, 0.5, 15, 5, 10,
      new Color4(0.8, 0.9, 1, 0.9), new Color4(0.5, 0.7, 1, 0.7), new Color4(0, 0, 0, 0));
  }
  private addEmberSparks(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('ember_sparks', planet, radius, planetId, 300, radius * 1.2, 0.05, 0.15, 80, 0.5, 2,
      new Color4(1, 0.5, 0.1, 1), new Color4(1, 0.2, 0.05, 1), new Color4(0, 0, 0, 0), 2.0);
  }
  private addPoisonCloud(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('poison_cloud', planet, radius, planetId, 80, radius * 2, 0.4, 1.0, 20, 6, 12,
      new Color4(0.2, 1, 0.1, 0.7), new Color4(0.1, 0.7, 0.05, 0.5), new Color4(0, 0, 0, 0));
  }
  private addStardustRain(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('stardust_rain', planet, radius, planetId, 400, radius * 2, 0.03, 0.1, 100, 1, 4,
      new Color4(1, 0.95, 0.5, 1), new Color4(1, 0.8, 0.3, 0.8), new Color4(0, 0, 0, 0));
  }
  private addCandyConfetti(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('candy_confetti', planet, radius, planetId, 200, radius * 1.7, 0.1, 0.3, 50, 2, 5,
      new Color4(1, 0.3, 0.6, 1), new Color4(0.3, 0.8, 1, 1), new Color4(0, 0, 0, 0));
  }
  private addButterflyShower(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('butterfly_shower', planet, radius, planetId, 100, radius * 2, 0.2, 0.5, 25, 3, 7,
      new Color4(0.6, 0.2, 1, 1), new Color4(1, 0.5, 0.1, 1), new Color4(0, 0, 0, 0));
  }
  private addGhostWisps(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('ghost_wisps', planet, radius, planetId, 50, radius * 2, 0.3, 0.8, 15, 8, 15,
      new Color4(0.9, 0.95, 1, 0.6), new Color4(0.7, 0.8, 1, 0.4), new Color4(0, 0, 0, 0));
  }
  private addCrystalShards(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('crystal_shards', planet, radius, planetId, 150, radius * 1.8, 0.1, 0.3, 40, 2, 6,
      new Color4(0.8, 0.9, 1, 1), new Color4(0.5, 0.8, 1, 1), new Color4(0, 0, 0, 0));
  }
  private addLoveHearts(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('love_hearts', planet, radius, planetId, 120, radius * 1.8, 0.15, 0.4, 30, 2, 6,
      new Color4(1, 0.3, 0.5, 1), new Color4(1, 0.6, 0.7, 0.9), new Color4(0, 0, 0, 0));
  }
  private addSandVortex(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('sand_vortex', planet, radius, planetId, 250, radius * 1.6, 0.2, 0.5, 60, 1, 4,
      new Color4(0.9, 0.75, 0.3, 1), new Color4(0.7, 0.5, 0.15, 0.8), new Color4(0, 0, 0, 0), 0.5);
  }
  private addCosmicWeb(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('cosmic_web', planet, radius, planetId, 200, radius * 2, 0.05, 0.15, 50, 3, 7,
      new Color4(0.9, 0.9, 1, 0.9), new Color4(0.7, 0.7, 0.9, 0.7), new Color4(0, 0, 0, 0));
  }
  private addMusicParticles(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('music_particles', planet, radius, planetId, 160, radius * 1.8, 0.1, 0.3, 40, 2, 5,
      new Color4(0.4, 0.8, 1, 1), new Color4(1, 0.3, 0.8, 1), new Color4(0, 0, 0, 0));
  }
  private addQuantumFoam(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('quantum_foam', planet, radius, planetId, 500, radius * 1.3, 0.03, 0.1, 120, 0.3, 1.5,
      new Color4(0.6, 0.9, 1, 1), new Color4(0.4, 0.7, 1, 0.8), new Color4(0, 0, 0, 0));
  }
  private addRainbowMist(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('rainbow_mist', planet, radius, planetId, 80, radius * 2.2, 0.4, 1.2, 20, 4, 10,
      new Color4(1, 0.5, 0.5, 0.6), new Color4(0.5, 0.5, 1, 0.6), new Color4(0, 0, 0, 0));
  }
  private addVoidParticles(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('void_particles', planet, radius, planetId, 200, radius * 1.8, 0.1, 0.3, 50, 2, 6,
      new Color4(0.3, 0.1, 0.5, 0.9), new Color4(0.1, 0.05, 0.2, 0.7), new Color4(0, 0, 0, 0));
  }
  private addAncientDust(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('ancient_dust', planet, radius, planetId, 250, radius * 2, 0.05, 0.2, 60, 3, 8,
      new Color4(1, 0.9, 0.5, 0.9), new Color4(0.8, 0.7, 0.3, 0.7), new Color4(0, 0, 0, 0));
  }
  private addWaterDroplets(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('water_droplets', planet, radius, planetId, 280, radius * 1.7, 0.08, 0.2, 70, 1, 4,
      new Color4(0.4, 0.7, 1, 0.9), new Color4(0.2, 0.5, 1, 0.7), new Color4(0, 0, 0, 0));
  }
  private addNeonRain(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('neon_rain', planet, radius, planetId, 350, radius * 2, 0.05, 0.12, 90, 0.5, 3,
      new Color4(0, 1, 0.8, 1), new Color4(1, 0, 1, 1), new Color4(0, 0, 0, 0), 1.5);
  }
  private addPhoenixSparks(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('phoenix_sparks', planet, radius, planetId, 300, radius * 1.5, 0.08, 0.2, 70, 1, 3,
      new Color4(1, 0.3, 0.05, 1), new Color4(1, 0.8, 0.1, 1), new Color4(0, 0, 0, 0), 1.8);
  }
  private addIcyFlakes(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('icy_flakes', planet, radius, planetId, 200, radius * 2, 0.08, 0.25, 50, 2, 6,
      new Color4(0.7, 0.9, 1, 0.9), new Color4(0.5, 0.8, 1, 0.7), new Color4(0, 0, 0, 0));
  }
  private addSolarWind(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('solar_wind', planet, radius, planetId, 600, radius * 1.5, 0.03, 0.08, 150, 0.3, 2,
      new Color4(1, 0.98, 0.9, 1), new Color4(1, 0.9, 0.7, 0.8), new Color4(0, 0, 0, 0), 3.0);
  }
  private addToxicBubbles(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('toxic_bubbles', planet, radius, planetId, 100, radius * 1.8, 0.15, 0.4, 25, 3, 7,
      new Color4(0.3, 1, 0.2, 0.8), new Color4(0.1, 0.7, 0.1, 0.6), new Color4(0, 0, 0, 0));
  }
  private addDreamWisps(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('dream_wisps', planet, radius, planetId, 80, radius * 2, 0.2, 0.6, 20, 4, 10,
      new Color4(0.7, 0.4, 1, 0.8), new Color4(0.5, 0.2, 0.9, 0.6), new Color4(0, 0, 0, 0));
  }
  private addGoldenSparkles(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('golden_sparkles', planet, radius, planetId, 320, radius * 1.8, 0.08, 0.25, 80, 1, 4,
      new Color4(1, 0.9, 0.2, 1), new Color4(1, 0.75, 0.1, 0.9), new Color4(0, 0, 0, 0));
  }
  private addGalaxyMotes(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('galaxy_motes', planet, radius, planetId, 320, radius * 2.2, 0.04, 0.12, 80, 2, 7,
      new Color4(0.4, 0.3, 1, 0.9), new Color4(0.2, 0.1, 0.6, 0.7), new Color4(0, 0, 0, 0));
  }
  private addPlasmaSparks(planet: Mesh, radius: number, planetId: string): void {
    this.makeParticleEffect('plasma_sparks', planet, radius, planetId, 400, radius * 1.5, 0.06, 0.18, 100, 0.5, 2.5,
      new Color4(0.3, 0.8, 1, 1), new Color4(0.1, 0.5, 1, 1), new Color4(0, 0, 0, 0), 2.5);
  }

  // ── Glow/Shell Effects (25) ────────────────────────────────────────────────
  private addDarkMatterShell(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('dark_matter_shell', planet, radius, planetId, 0.1, 0, 0.2, 1.4, 0.2, 0.1, 0.02);
  }
  private addPlasmaMantle(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('plasma_mantle', planet, radius, planetId, 0, 0.5, 1, 1.3, 0.22, 0.15, 0.05);
  }
  private addJadeAura(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('jade_aura', planet, radius, planetId, 0.1, 0.9, 0.4, 1.35, 0.2, 0.08, 0.03);
  }
  private addGoldenDivine(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('golden_divine', planet, radius, planetId, 1, 0.85, 0.3, 1.4, 0.18, 0.12, 0.04);
  }
  private addVoidAura(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('void_aura', planet, radius, planetId, 0.05, 0, 0.1, 1.5, 0.25, 0.05, 0.01);
  }
  private addLunarGlow(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('lunar_glow', planet, radius, planetId, 0.7, 0.8, 1, 1.3, 0.15, 0.1, 0.03);
  }
  private addFlameShell(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('flame_shell', planet, radius, planetId, 1, 0.4, 0.1, 1.35, 0.2, 0.18, 0.06);
  }
  private addIceShell(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('ice_shell', planet, radius, planetId, 0.5, 0.85, 1, 1.4, 0.18, 0.07, 0.025);
  }
  private addThunderMantle(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('thunder_mantle', planet, radius, planetId, 0.4, 0.6, 1, 1.32, 0.2, 0.2, 0.08);
  }
  private addPrismaticShell(planet: Mesh, radius: number, planetId: string): void {
    const sphere = MeshBuilder.CreateSphere('custom_prismatic_shell_' + planetId, { diameter: radius * 2 * 1.38, segments: 16 }, this.scene);
    sphere.parent = planet; sphere.position = Vector3.Zero(); sphere.isPickable = false;
    const mat = new StandardMaterial('custom_prismatic_shellMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(1, 1, 1); mat.alpha = 0.12; mat.backFaceCulling = false;
    sphere.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(sphere);
    let t = 0;
    const cb = () => {
      if (sphere.isDisposed()) return;
      t += 0.04;
      sphere.scaling.setAll(1 + Math.sin(t) * 0.1);
      mat.emissiveColor.set(0.5 + 0.5 * Math.sin(t), 0.5 + 0.5 * Math.sin(t + 2.1), 0.5 + 0.5 * Math.sin(t + 4.2));
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addSpectralVeil(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('spectral_veil', planet, radius, planetId, 0.9, 0.95, 1, 1.45, 0.1, 0.06, 0.02);
  }
  private addSolarCorona(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('solar_corona', planet, radius, planetId, 1, 0.7, 0.2, 1.5, 0.15, 0.2, 0.07);
  }
  private addNatureBloom(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('nature_bloom', planet, radius, planetId, 0.2, 0.9, 0.3, 1.3, 0.2, 0.1, 0.03);
  }
  private addHolographicField(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('holographic_field', planet, radius, planetId, 0, 0.9, 0.9, 1.4, 0.15, 0.12, 0.05);
  }
  private addShadowCloak(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('shadow_cloak', planet, radius, planetId, 0.1, 0.05, 0.15, 1.35, 0.3, 0.05, 0.02);
  }
  private addRoseQuartzGlow(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('rose_quartz_glow', planet, radius, planetId, 1, 0.6, 0.75, 1.35, 0.18, 0.1, 0.04);
  }
  private addSapphireAura(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('sapphire_aura', planet, radius, planetId, 0.1, 0.3, 1, 1.4, 0.2, 0.12, 0.04);
  }
  private addEmeraldPulse(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('emerald_pulse', planet, radius, planetId, 0.1, 1, 0.3, 1.35, 0.2, 0.15, 0.05);
  }
  private addRubyGlow(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('ruby_glow', planet, radius, planetId, 1, 0.1, 0.2, 1.38, 0.2, 0.14, 0.05);
  }
  private addObsidianShell(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('obsidian_shell', planet, radius, planetId, 0.05, 0.02, 0.08, 1.4, 0.35, 0.04, 0.02);
  }
  private addAmethystHaze(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('amethyst_haze', planet, radius, planetId, 0.7, 0.2, 1, 1.42, 0.18, 0.1, 0.035);
  }
  private addTopazShimmer(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('topaz_shimmer', planet, radius, planetId, 1, 0.85, 0.2, 1.36, 0.18, 0.12, 0.05);
  }
  private addOpalGlow(planet: Mesh, radius: number, planetId: string): void {
    const sphere = MeshBuilder.CreateSphere('custom_opal_glow_' + planetId, { diameter: radius * 2 * 1.38, segments: 16 }, this.scene);
    sphere.parent = planet; sphere.position = Vector3.Zero(); sphere.isPickable = false;
    const mat = new StandardMaterial('custom_opal_glowMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(1, 0.9, 1); mat.alpha = 0.16; mat.backFaceCulling = false;
    sphere.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(sphere);
    let t = 0;
    const cb = () => {
      if (sphere.isDisposed()) return;
      t += 0.04;
      sphere.scaling.setAll(1 + Math.sin(t) * 0.1);
      mat.emissiveColor.set(0.8 + 0.2 * Math.sin(t * 0.7), 0.7 + 0.3 * Math.sin(t * 1.1), 0.8 + 0.2 * Math.sin(t * 0.5));
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addDivineLightAura(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('divine_light_aura', planet, radius, planetId, 1, 1, 0.95, 1.5, 0.14, 0.2, 0.06);
  }
  private addAbyssalDark(planet: Mesh, radius: number, planetId: string): void {
    this.makeGlowShell('abyssal_dark', planet, radius, planetId, 0, 0, 0.02, 1.6, 0.4, 0.03, 0.01);
  }

  // ── Ring/Torus Effects (15) ────────────────────────────────────────────────
  private addRainbowRings(planet: Mesh, radius: number, planetId: string): void {
    const colors = [new Color3(1,0.2,0.2), new Color3(1,0.7,0.1), new Color3(0.2,1,0.2), new Color3(0.2,0.5,1), new Color3(0.8,0.2,1)];
    this.makeRings('rainbow_rings', planet, radius, planetId, colors.map((c,i) => ({
      color: c, diameterMult: 2.5+i*0.4, thickness: 0.2, alpha: 0.7,
      rotX: i*0.4, rotZ: i*0.3, spinX: 0.005*((i%2)*2-1), spinY: 0.008, spinZ: 0.003
    })));
  }
  private addNeonRings(planet: Mesh, radius: number, planetId: string): void {
    const colors = [new Color3(0,1,1), new Color3(1,0,1), new Color3(1,1,0)];
    this.makeRings('neon_rings', planet, radius, planetId, colors.map((c,i) => ({
      color: c, diameterMult: 2.6+i*0.5, thickness: 0.18, alpha: 0.75,
      rotX: 0.3+i*0.5, rotZ: i*0.4, spinX: 0, spinY: 0.015*((i%2)*2-1), spinZ: 0.005
    })));
  }
  private addPearlRings(planet: Mesh, radius: number, planetId: string): void {
    const colors = [new Color3(1,0.97,0.95), new Color3(0.95,0.9,1)];
    this.makeRings('pearl_rings', planet, radius, planetId, colors.map((c,i) => ({
      color: c, diameterMult: 2.8+i*0.4, thickness: 0.22, alpha: 0.6,
      rotX: Math.PI/2+i*0.15, rotZ: i*0.1, spinX: 0.002, spinY: 0.003*((i%2)*2-1), spinZ: 0
    })));
  }
  private addFireRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('fire_ring', planet, radius, planetId, [{
      color: new Color3(1,0.4,0.05), diameterMult: 3.2, thickness: 0.3, alpha: 0.8,
      rotX: Math.PI/2, rotZ: 0.1, spinX: 0, spinY: 0.012, spinZ: 0
    }]);
  }
  private addIceRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('ice_ring', planet, radius, planetId, [{
      color: new Color3(0.6,0.9,1), diameterMult: 3.5, thickness: 0.25, alpha: 0.65,
      rotX: Math.PI/2+0.08, rotZ: 0, spinX: 0, spinY: 0.006, spinZ: 0
    }]);
  }
  private addVoidRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('void_ring', planet, radius, planetId, [{
      color: new Color3(0.15,0.05,0.3), diameterMult: 3.0, thickness: 0.4, alpha: 0.85,
      rotX: Math.PI/2, rotZ: 0.2, spinX: 0, spinY: -0.008, spinZ: 0
    }]);
  }
  private addGoldenHaloRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('golden_halo_ring', planet, radius, planetId, [{
      color: new Color3(1,0.88,0.3), diameterMult: 2.8, thickness: 0.15, alpha: 0.75,
      rotX: 0.3, rotZ: 0, spinX: 0.001, spinY: 0.005, spinZ: 0.001
    }]);
  }
  private addRadiantHaloRings(planet: Mesh, radius: number, planetId: string): void {
    const colors = [new Color3(1,0.9,0.3), new Color3(1,1,0.9), new Color3(0.9,0.8,0.5)];
    this.makeRings('radiant_halo_rings', planet, radius, planetId, colors.map((c,i) => ({
      color: c, diameterMult: 2.5+i*0.3, thickness: 0.13, alpha: 0.7-i*0.1,
      rotX: 0.2+i*0.1, rotZ: 0, spinX: 0.001, spinY: 0.004*(i+1), spinZ: 0
    })));
  }
  private addEclipseRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('eclipse_ring', planet, radius, planetId, [{
      color: new Color3(0.05,0.02,0.1), diameterMult: 4.0, thickness: 0.5, alpha: 0.9,
      rotX: Math.PI/2, rotZ: 0, spinX: 0, spinY: 0.004, spinZ: 0
    }]);
  }
  private addAtomicRings(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('atomic_rings', planet, radius, planetId, [
      {color: new Color3(0.3,0.8,1), diameterMult: 2.8, thickness: 0.15, alpha: 0.7, rotX: 0, rotZ: 0, spinX: 0.015, spinY: 0, spinZ: 0},
      {color: new Color3(0.8,0.3,1), diameterMult: 2.8, thickness: 0.15, alpha: 0.7, rotX: Math.PI/2, rotZ: 0, spinX: 0, spinY: 0.015, spinZ: 0},
      {color: new Color3(0.3,1,0.5), diameterMult: 2.8, thickness: 0.15, alpha: 0.7, rotX: Math.PI/4, rotZ: Math.PI/4, spinX: 0, spinY: 0, spinZ: 0.015},
    ]);
  }
  private addDoubleHelixRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('double_helix_ring', planet, radius, planetId, [
      {color: new Color3(0.3,1,0.6), diameterMult: 2.6, thickness: 0.18, alpha: 0.7, rotX: 0.8, rotZ: 0, spinX: 0.006, spinY: 0.008, spinZ: 0},
      {color: new Color3(1,0.5,0.3), diameterMult: 2.6, thickness: 0.18, alpha: 0.7, rotX: -0.8, rotZ: 0, spinX: -0.006, spinY: 0.008, spinZ: 0},
    ]);
  }
  private addSpiralRings(planet: Mesh, radius: number, planetId: string): void {
    const colors = [new Color3(1,0.5,0.2), new Color3(0.5,1,0.2), new Color3(0.2,0.5,1), new Color3(1,0.2,0.8)];
    this.makeRings('spiral_rings', planet, radius, planetId, colors.map((c,i) => ({
      color: c, diameterMult: 2.2+i*0.5, thickness: 0.15, alpha: 0.65,
      rotX: i*0.5, rotZ: i*0.4, spinX: 0.004, spinY: 0.007*(i+1)*0.5, spinZ: 0.003
    })));
  }
  private addElectricHoop(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('electric_hoop', planet, radius, planetId, [{
      color: new Color3(0.3,0.7,1), diameterMult: 3.0, thickness: 0.12, alpha: 0.85,
      rotX: Math.PI/2, rotZ: 0.3, spinX: 0.02, spinY: 0.03, spinZ: 0.015
    }]);
  }
  private addCosmicCrownRings(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('cosmic_crown_rings', planet, radius, planetId, [
      {color: new Color3(1,0.85,0.2), diameterMult: 2.4, thickness: 0.18, alpha: 0.75, rotX: 1.2, rotZ: 0, spinX: 0.003, spinY: 0.005, spinZ: 0},
      {color: new Color3(1,0.6,0.1), diameterMult: 2.4, thickness: 0.18, alpha: 0.75, rotX: 1.2, rotZ: 2.1, spinX: 0.003, spinY: 0.005, spinZ: 0},
      {color: new Color3(1,1,0.5), diameterMult: 2.4, thickness: 0.18, alpha: 0.75, rotX: 1.2, rotZ: 4.2, spinX: 0.003, spinY: 0.005, spinZ: 0},
    ]);
  }
  private addSakuraRing(planet: Mesh, radius: number, planetId: string): void {
    this.makeRings('sakura_ring', planet, radius, planetId, [{
      color: new Color3(1,0.65,0.75), diameterMult: 3.2, thickness: 0.2, alpha: 0.7,
      rotX: Math.PI/2, rotZ: 0.05, spinX: 0, spinY: 0.005, spinZ: 0
    }]);
  }

  // ── Orbiting Objects (20) ──────────────────────────────────────────────────
  private addTripleMoons(planet: Mesh, radius: number, planetId: string): void {
    const speeds = [0.008, 0.005, 0.011];
    const orbits = [radius*3, radius*4.5, radius*6];
    const tilts = [0.1, 0.25, 0.15];
    const moonObjs: {mesh: Mesh; angle: number; speed: number; orbitR: number; tilt: number}[] = [];
    for (let i = 0; i < 3; i++) {
      const m = MeshBuilder.CreateSphere('custom_triple_moon' + i + '_' + planetId, {diameter: radius*0.4}, this.scene);
      m.parent = planet;
      const mat = new StandardMaterial('custom_triple_moonMat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = new Color3(0.7, 0.75, 0.8);
      m.material = mat; m.isPickable = false;
      moonObjs.push({mesh: m, angle: (i/3)*Math.PI*2, speed: speeds[i], orbitR: orbits[i], tilt: tilts[i]});
    }
    const cb = () => {
      moonObjs.forEach(o => {
        if (o.mesh.isDisposed()) return;
        o.angle += o.speed;
        o.mesh.position.x = Math.cos(o.angle) * o.orbitR;
        o.mesh.position.z = Math.sin(o.angle) * o.orbitR;
        o.mesh.position.y = Math.sin(o.angle * 0.5) * o.orbitR * o.tilt;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addAsteroidBeltOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('asteroid_belt', planet, radius, planetId, 12, 'box', radius*0.2,
      radius*4, new Color3(0.5,0.4,0.3), new Color3(0.15,0.1,0.05), 0.003, 0.08, false);
  }
  private addGemOrbit(planet: Mesh, radius: number, planetId: string): void {
    const colors = [new Color3(1,0.2,0.2), new Color3(0.2,1,0.4), new Color3(0.2,0.5,1), new Color3(1,0.9,0.2), new Color3(0.8,0.2,1), new Color3(1,0.5,0.1)];
    const objs: {mesh: Mesh; angle: number}[] = [];
    for (let i = 0; i < 6; i++) {
      // Octahedron (type 1) looks like a real faceted gemstone/diamond
      const m = MeshBuilder.CreatePolyhedron('custom_gem_orbit' + i + '_' + planetId, {type: 1, size: radius * 0.15}, this.scene);
      m.parent = planet;
      const mat = new PBRMaterial('custom_gem_orbitMat' + i + '_' + planetId, this.scene);
      mat.albedoColor = colors[i]; mat.emissiveColor = colors[i].scale(0.5); mat.metallic = 0; mat.roughness = 0;
      m.material = mat; m.isPickable = false;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(m);
      objs.push({mesh: m, angle: (i/6)*Math.PI*2});
    }
    const r2 = radius * 3.5;
    const cb = () => {
      objs.forEach(o => {
        if (o.mesh.isDisposed()) return;
        o.angle += 0.009;
        o.mesh.position.x = Math.cos(o.angle) * r2;
        o.mesh.position.z = Math.sin(o.angle) * r2;
        o.mesh.position.y = Math.sin(o.angle * 1.2) * r2 * 0.1;
        o.mesh.rotation.y += 0.02;
        o.mesh.rotation.x += 0.01;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addCrystalOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('crystal_orbit', planet, radius, planetId, 5, 'box', radius*0.35,
      radius*4, new Color3(0.7,0.9,1), new Color3(0.4,0.7,1), 0.007, 0.12);
  }
  private addFairyLightsOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('fairy_lights', planet, radius, planetId, 15, 'sphere', radius*0.12,
      radius*2.8, new Color3(1,1,0.5), new Color3(1,0.9,0.3), 0.012, 0.15);
  }
  private addSatelliteSwarm(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('satellite', planet, radius, planetId, 8, 'box', radius*0.25,
      radius*4, new Color3(0.7,0.7,0.8), new Color3(0.3,0.4,0.5), 0.006, 0.05, false);
  }
  private addLotusOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('lotus', planet, radius, planetId, 6, 'cylinder', radius*0.3,
      radius*3, new Color3(1,0.7,0.8), new Color3(0.8,0.4,0.6), 0.007, 0.08);
  }
  private addClockworkOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('clockwork', planet, radius, planetId, 6, 'cylinder', radius*0.3,
      radius*3.5, new Color3(0.8,0.65,0.2), new Color3(0.6,0.5,0.1), 0.014, 0.05, false);
  }
  private addSoulLanternsOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('soul_lantern', planet, radius, planetId, 5, 'box', radius*0.28,
      radius*3.2, new Color3(1,0.75,0.3), new Color3(1,0.6,0.1), 0.007, 0.1);
  }
  private addStarCompanions(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('star_comp', planet, radius, planetId, 6, 'sphere', radius*0.22,
      radius*3, new Color3(1,0.95,0.4), new Color3(1,0.9,0.2), 0.009, 0.1);
  }
  private addDiamondOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('diamond', planet, radius, planetId, 8, 'box', radius*0.2,
      radius*3.5, new Color3(0.9,0.95,1), new Color3(0.6,0.8,1), 0.008, 0.08);
  }
  private addAncientOrbs(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('ancient_orb', planet, radius, planetId, 4, 'sphere', radius*0.5,
      radius*5, new Color3(0.6,0.3,1), new Color3(0.4,0.1,0.8), 0.004, 0.15);
  }
  private addBinaryMoons(planet: Mesh, radius: number, planetId: string): void {
    let angle1 = 0, angle2 = Math.PI;
    const orbitR = radius * 4.5;
    const m1 = MeshBuilder.CreateSphere('custom_binary_moon1_' + planetId, {diameter: radius*0.38}, this.scene);
    const m2 = MeshBuilder.CreateSphere('custom_binary_moon2_' + planetId, {diameter: radius*0.32}, this.scene);
    [m1, m2].forEach((m, i) => {
      m.parent = planet;
      const mat = new StandardMaterial('custom_binary_moonMat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = new Color3(0.75, 0.8, 0.85);
      m.material = mat; m.isPickable = false;
    });
    const cb = () => {
      if (m1.isDisposed() || m2.isDisposed()) return;
      angle1 += 0.007; angle2 += 0.007;
      m1.position.x = Math.cos(angle1) * orbitR; m1.position.z = Math.sin(angle1) * orbitR; m1.position.y = Math.sin(angle1 * 0.6) * orbitR * 0.1;
      m2.position.x = Math.cos(angle2) * orbitR; m2.position.z = Math.sin(angle2) * orbitR; m2.position.y = Math.sin(angle2 * 0.6) * orbitR * 0.1;
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addPrismTowersOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('prism_tower', planet, radius, planetId, 6, 'cylinder', radius*0.3,
      radius*3.5, new Color3(0.8,0.6,1), new Color3(0.5,0.3,1), 0.006, 0.06);
  }
  private addFlowerCompanions(planet: Mesh, radius: number, planetId: string): void {
    const flowerColors = [new Color3(1,0.4,0.6), new Color3(1,0.8,0.3), new Color3(0.4,0.9,0.5), new Color3(0.5,0.5,1), new Color3(1,0.5,0.2), new Color3(0.8,0.3,1), new Color3(1,0.9,0.5), new Color3(0.3,0.8,1)];
    const objs: {mesh: Mesh; angle: number}[] = [];
    for (let i = 0; i < 8; i++) {
      const m = MeshBuilder.CreateSphere('custom_flower_comp' + i + '_' + planetId, {diameter: radius*0.22}, this.scene);
      m.parent = planet;
      const mat = new PBRMaterial('custom_flower_compMat' + i + '_' + planetId, this.scene);
      mat.albedoColor = flowerColors[i]; mat.emissiveColor = flowerColors[i].scale(0.4); mat.metallic = 0; mat.roughness = 0.3;
      m.material = mat; m.isPickable = false;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(m);
      objs.push({mesh: m, angle: (i/8)*Math.PI*2});
    }
    const orbitR = radius * 3;
    const cb = () => {
      objs.forEach(o => {
        if (o.mesh.isDisposed()) return;
        o.angle += 0.008;
        o.mesh.position.x = Math.cos(o.angle) * orbitR;
        o.mesh.position.z = Math.sin(o.angle) * orbitR;
        o.mesh.position.y = Math.sin(o.angle * 1.3) * orbitR * 0.05;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addSacredGeometryOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('sacred_geo', planet, radius, planetId, 3, 'box', radius*0.4,
      radius*4, new Color3(1,0.85,0.3), new Color3(0.8,0.65,0.1), 0.005, 0.18);
  }
  private addIcePillarOrbit(planet: Mesh, radius: number, planetId: string): void {
    this.makeOrbitingObjects('ice_pillar', planet, radius, planetId, 6, 'cylinder', radius*0.35,
      radius*3.2, new Color3(0.7,0.92,1), new Color3(0.4,0.75,1), 0.006, 0.05);
  }
  private addThunderOrbsOrbit(planet: Mesh, radius: number, planetId: string): void {
    const objs: {mesh: Mesh; angle: number; t: number}[] = [];
    for (let i = 0; i < 4; i++) {
      const m = MeshBuilder.CreateSphere('custom_thunder_orb' + i + '_' + planetId, {diameter: radius*0.4}, this.scene);
      m.parent = planet;
      const mat = new StandardMaterial('custom_thunder_orbMat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = new Color3(0.3, 0.6, 1);
      m.material = mat; m.isPickable = false;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(m);
      objs.push({mesh: m, angle: (i/4)*Math.PI*2, t: 0});
    }
    const orbitR = radius * 4;
    const cb = () => {
      objs.forEach(o => {
        if (o.mesh.isDisposed()) return;
        o.angle += 0.007; o.t += 0.1;
        o.mesh.position.x = Math.cos(o.angle) * orbitR;
        o.mesh.position.z = Math.sin(o.angle) * orbitR;
        o.mesh.position.y = Math.sin(o.angle) * orbitR * 0.12;
        const mat = o.mesh.material as StandardMaterial;
        if (mat) mat.emissiveColor.set(0.2 + 0.5*Math.abs(Math.sin(o.t)), 0.4 + 0.3*Math.abs(Math.sin(o.t*0.7)), 1);
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addMiniPlanetsOrbit(planet: Mesh, radius: number, planetId: string): void {
    const objs: {planet: Mesh; ring: Mesh; angle: number}[] = [];
    for (let i = 0; i < 3; i++) {
      const p = MeshBuilder.CreateSphere('custom_mini_planet' + i + '_' + planetId, {diameter: radius*0.4}, this.scene);
      const ring = MeshBuilder.CreateTorus('custom_mini_ring' + i + '_' + planetId, {diameter: radius*0.8, thickness: 0.06, tessellation: 32}, this.scene);
      p.parent = planet; ring.parent = p; ring.rotation.x = Math.PI/2;
      const colors = [new Color3(0.8,0.5,0.3), new Color3(0.4,0.7,1), new Color3(0.6,1,0.5)];
      const pm = new StandardMaterial('custom_mini_pMat' + i + '_' + planetId, this.scene);
      pm.emissiveColor = colors[i]; p.material = pm; p.isPickable = false;
      const rm = new StandardMaterial('custom_mini_rMat' + i + '_' + planetId, this.scene);
      rm.emissiveColor = new Color3(0.9,0.8,0.6); rm.alpha = 0.7; ring.material = rm; ring.isPickable = false;
      objs.push({planet: p, ring, angle: (i/3)*Math.PI*2});
    }
    const orbR = radius * 5.5;
    const cb = () => {
      objs.forEach(o => {
        if (o.planet.isDisposed()) return;
        o.angle += 0.004;
        o.planet.position.x = Math.cos(o.angle) * orbR;
        o.planet.position.z = Math.sin(o.angle) * orbR;
        o.planet.position.y = Math.sin(o.angle * 0.8) * orbR * 0.1;
        o.ring.rotation.y += 0.02;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addCometCompanions(planet: Mesh, radius: number, planetId: string): void {
    const objs: {mesh: Mesh; angle: number}[] = [];
    for (let i = 0; i < 4; i++) {
      const m = MeshBuilder.CreateSphere('custom_comet_comp' + i + '_' + planetId, {diameter: radius*0.28}, this.scene);
      m.parent = planet;
      const mat = new StandardMaterial('custom_comet_compMat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = new Color3(0.7, 0.9, 1); m.material = mat; m.isPickable = false;
      const sys = new ParticleSystem('custom_comet_compSys' + i + '_' + planetId, 50, this.scene);
      sys.emitter = m; sys.particleEmitterType = new SphereParticleEmitter(0.1);
      sys.minSize = 0.05; sys.maxSize = 0.15; sys.minLifeTime = 0.3; sys.maxLifeTime = 1;
      sys.emitRate = 30; sys.blendMode = ParticleSystem.BLENDMODE_ADD;
      sys.minEmitPower = 0.01; sys.maxEmitPower = 0.2;
      sys.color1 = new Color4(0.5,0.8,1,1); sys.color2 = new Color4(0.3,0.6,1,0.5); sys.colorDead = new Color4(0,0,0,0);
      sys.start();
      this.trackCustomizationParticle(planetId, sys);
      objs.push({mesh: m, angle: (i/4)*Math.PI*2});
    }
    const orbR = radius * 4;
    const cb = () => {
      objs.forEach(o => {
        if (o.mesh.isDisposed()) return;
        o.angle += 0.009;
        o.mesh.position.x = Math.cos(o.angle) * orbR;
        o.mesh.position.z = Math.sin(o.angle) * orbR;
        o.mesh.position.y = Math.sin(o.angle * 0.6) * orbR * 0.15;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }

  // ── Complex/Special Effects (10) ──────────────────────────────────────────
  private addSupernovaPulse(planet: Mesh, radius: number, planetId: string): void {
    let t = 0, pulseR = 0, active = false;
    const ring = MeshBuilder.CreateTorus('custom_supernova_' + planetId,
      {diameter: 1, thickness: 0.15, tessellation: 64}, this.scene);
    ring.parent = planet; ring.position = Vector3.Zero(); ring.isPickable = false;
    const mat = new StandardMaterial('custom_supernovaMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(1, 0.5, 0.1); mat.alpha = 0; mat.backFaceCulling = false;
    ring.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(ring);
    const cb = () => {
      if (ring.isDisposed()) return;
      t += 0.016;
      if (!active && t > 3) { active = true; pulseR = 0; t = 0; }
      if (active) {
        pulseR += 0.18;
        ring.scaling.setAll(pulseR);
        mat.alpha = Math.max(0, 0.9 - pulseR / 20);
        if (pulseR > 20) { active = false; pulseR = 0; }
      }
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addVortexStorm(planet: Mesh, radius: number, planetId: string): void {
    const sys = new ParticleSystem('custom_vortex_' + planetId, 400, this.scene);
    sys.emitter = planet;
    const emitter = new SphereParticleEmitter(radius * 2.5);
    emitter.radiusRange = 0.3;
    sys.particleEmitterType = emitter;
    sys.minSize = 0.15; sys.maxSize = 0.5; sys.minLifeTime = 1; sys.maxLifeTime = 3;
    sys.emitRate = 100; sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 0.5; sys.maxEmitPower = 1.5;
    sys.color1 = new Color4(0.3, 0.4, 0.8, 0.8); sys.color2 = new Color4(0.6, 0.2, 0.8, 0.6); sys.colorDead = new Color4(0,0,0,0);
    sys.gravity = new Vector3(0, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }
  private addAuroraPillars(planet: Mesh, radius: number, planetId: string): void {
    const pillars = [
      MeshBuilder.CreateCylinder('custom_aurora_pillar_n_' + planetId, {height: radius*5, diameter: radius*0.4, tessellation: 16}, this.scene),
      MeshBuilder.CreateCylinder('custom_aurora_pillar_s_' + planetId, {height: radius*5, diameter: radius*0.4, tessellation: 16}, this.scene),
    ];
    const pColors = [new Color3(0.3, 1, 0.6), new Color3(0.3, 0.6, 1)];
    pillars.forEach((p, i) => {
      p.parent = planet; p.position = new Vector3(0, (i === 0 ? 1 : -1) * radius * 1.8, 0);
      p.isPickable = false;
      const mat = new StandardMaterial('custom_aurora_pillarMat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = pColors[i]; mat.alpha = 0.35; mat.backFaceCulling = false;
      p.material = mat;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(p);
    });
    let t = 0;
    const cb = () => {
      if (pillars[0].isDisposed()) return;
      t += 0.03;
      pillars.forEach((p, i) => {
        const mat = p.material as StandardMaterial;
        if (mat) { mat.emissiveColor.set(0.2+0.3*Math.sin(t+i), 0.6+0.4*Math.sin(t*0.7+i), 0.5+0.5*Math.sin(t*1.2)); mat.alpha = 0.25 + 0.15 * Math.abs(Math.sin(t)); }
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addGalaxySwirl(planet: Mesh, radius: number, planetId: string): void {
    const sys = new ParticleSystem('custom_galaxy_swirl_' + planetId, 500, this.scene);
    sys.emitter = planet;
    sys.particleEmitterType = new SphereParticleEmitter(radius * 4);
    sys.minSize = 0.05; sys.maxSize = 0.2; sys.minLifeTime = 4; sys.maxLifeTime = 8;
    sys.emitRate = 60; sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    sys.minEmitPower = 0.05; sys.maxEmitPower = 0.2;
    sys.color1 = new Color4(0.6, 0.4, 1, 0.7); sys.color2 = new Color4(0.2, 0.5, 1, 0.5); sys.colorDead = new Color4(0,0,0,0);
    sys.gravity = new Vector3(0, 0, 0);
    sys.start();
    this.trackCustomizationParticle(planetId, sys);
  }
  private addTimeRipple(planet: Mesh, radius: number, planetId: string): void {
    let t = 0, rScale = 0, active = false;
    const ring = MeshBuilder.CreateTorus('custom_time_ripple_' + planetId,
      {diameter: radius * 4, thickness: 0.08, tessellation: 64}, this.scene);
    ring.parent = planet; ring.position = Vector3.Zero(); ring.isPickable = false;
    const mat = new StandardMaterial('custom_time_rippleMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(0.5, 0.8, 1); mat.alpha = 0; mat.backFaceCulling = false;
    ring.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(ring);
    const cb = () => {
      if (ring.isDisposed()) return;
      t += 0.016;
      if (!active && t > 1.5) { active = true; rScale = 0.3; t = 0; }
      if (active) {
        rScale += 0.06;
        ring.scaling.setAll(rScale);
        mat.alpha = Math.max(0, 0.7 - rScale / 10);
        if (rScale > 10) { active = false; rScale = 0; }
      }
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addEclipseShadow(planet: Mesh, radius: number, planetId: string): void {
    const shadow = MeshBuilder.CreateSphere('custom_eclipse_shadow_' + planetId, {diameter: radius*2.1, segments: 16}, this.scene);
    shadow.parent = planet; shadow.isPickable = false;
    const mat = new StandardMaterial('custom_eclipse_shadowMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(0, 0, 0); mat.alpha = 0.75; mat.backFaceCulling = false;
    shadow.material = mat;
    let angle = 0;
    const orbitR = radius * 1.05;
    const cb = () => {
      if (shadow.isDisposed()) return;
      angle += 0.003;
      shadow.position.x = Math.cos(angle) * orbitR;
      shadow.position.z = Math.sin(angle) * orbitR * 0.3;
      shadow.position.y = Math.sin(angle * 0.4) * orbitR * 0.1;
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addNorthernLightsEffect(planet: Mesh, radius: number, planetId: string): void {
    const nlColors: [Color4, Color4][] = [
      [new Color4(0.1,1,0.5,0.6), new Color4(0.1,0.7,1,0.4)],
      [new Color4(0.5,0.1,1,0.5), new Color4(0.3,1,0.7,0.3)],
    ];
    nlColors.forEach(([c1, c2], i) => {
      const sys = new ParticleSystem('custom_northern' + i + '_' + planetId, 200, this.scene);
      sys.emitter = planet;
      sys.particleEmitterType = new SphereParticleEmitter(radius * (2 + i));
      sys.minSize = 0.2; sys.maxSize = 0.8; sys.minLifeTime = 2; sys.maxLifeTime = 5;
      sys.emitRate = 40; sys.blendMode = ParticleSystem.BLENDMODE_ADD;
      sys.minEmitPower = 0.1; sys.maxEmitPower = 0.3;
      sys.color1 = c1; sys.color2 = c2; sys.colorDead = new Color4(0,0,0,0);
      sys.gravity = new Vector3(0, 0, 0);
      sys.start();
      this.trackCustomizationParticle(planetId, sys);
    });
  }
  private addCosmicBloomEffect(planet: Mesh, radius: number, planetId: string): void {
    const petals: Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const petal = MeshBuilder.CreateSphere('custom_bloom_petal' + i + '_' + planetId, {diameter: radius*0.6, segments: 8}, this.scene);
      petal.parent = planet; petal.isPickable = false;
      const mat = new StandardMaterial('custom_bloom_petalMat' + i + '_' + planetId, this.scene);
      mat.emissiveColor = new Color3(1, 0.5+i*0.08, 0.6); mat.alpha = 0.7; mat.backFaceCulling = false;
      petal.material = mat;
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(petal);
      petals.push(petal);
    }
    let t = 0;
    const cb = () => {
      if (petals[0].isDisposed()) return;
      t += 0.02;
      const bloomScale = 1 + 0.8 * Math.abs(Math.sin(t * 0.5));
      petals.forEach((p, i) => {
        const angle = (i / petals.length) * Math.PI * 2;
        p.position.x = Math.cos(angle) * radius * bloomScale;
        p.position.z = Math.sin(angle) * radius * bloomScale;
        p.position.y = Math.sin(t + i) * radius * 0.3;
      });
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addDimensionalRift(planet: Mesh, radius: number, planetId: string): void {
    const rift = MeshBuilder.CreateTorus('custom_dim_rift_' + planetId,
      {diameter: radius*3.5, thickness: radius*0.6, tessellation: 32}, this.scene);
    rift.parent = planet; rift.position = Vector3.Zero(); rift.isPickable = false;
    const mat = new StandardMaterial('custom_dim_riftMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(0.5, 0.1, 1); mat.alpha = 0.45; mat.backFaceCulling = false;
    rift.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(rift);
    let t = 0;
    const cb = () => {
      if (rift.isDisposed()) return;
      t += 0.02;
      rift.rotation.x += 0.007; rift.rotation.y += 0.009; rift.rotation.z += 0.005;
      const mat2 = rift.material as StandardMaterial;
      if (mat2) {
        mat2.emissiveColor.set(0.3+0.3*Math.sin(t), 0.05+0.1*Math.sin(t*0.7), 0.7+0.3*Math.cos(t*0.5));
        mat2.alpha = 0.3 + 0.2 * Math.abs(Math.sin(t));
      }
    };
    this.trackCustomizationCallback(planetId, cb);
  }
  private addHeartbeatPulse(planet: Mesh, radius: number, planetId: string): void {
    const sphere = MeshBuilder.CreateSphere('custom_heartbeat_' + planetId, {diameter: radius * 2 * 1.4, segments: 16}, this.scene);
    sphere.parent = planet; sphere.position = Vector3.Zero(); sphere.isPickable = false;
    const mat = new StandardMaterial('custom_heartbeatMat_' + planetId, this.scene);
    mat.emissiveColor = new Color3(1, 0.2, 0.4); mat.alpha = 0.15; mat.backFaceCulling = false;
    sphere.material = mat;
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(sphere);
    let t = 0;
    const cb = () => {
      if (sphere.isDisposed()) return;
      t += 0.05;
      const beat = Math.sin(t * 3) * 0.5 + Math.sin(t * 6) * 0.25;
      const s = 1 + Math.max(0, beat) * 0.3;
      sphere.scaling.setAll(s);
      mat.alpha = 0.1 + Math.max(0, beat) * 0.2;
    };
    this.trackCustomizationCallback(planetId, cb);
  }

  public dispose(): void {
    // Stop and cleanup audio
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic = null;
    }

    // Stop melody timeout
    if (this.melodyTimeout !== null) {
      clearTimeout(this.melodyTimeout);
      this.melodyTimeout = null;
    }

    // Stop oscillators
    this.musicOscillators.forEach((osc) => {
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

    // Clear adaptive-quality monitor
    if (this.adaptiveQualityInterval !== null) {
      clearInterval(this.adaptiveQualityInterval);
      this.adaptiveQualityInterval = null;
    }

    // Clear leaderboard update interval
    this.stopLeaderboardUpdates();

    // Clear all pending meteor timeouts
    this.meteorTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.meteorTimeouts = [];

    // Stop and dispose meteor particle systems
    this.meteorParticleSystems.forEach((system) => {
      system.stop();
      system.dispose();
    });
    this.meteorParticleSystems = [];

    // Dispose distant galaxies
    this.distantGalaxies.forEach((mesh) => {
      mesh.dispose(false, true);
    });
    this.distantGalaxies.clear();

    // Remove keyboard event listener
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Disconnect modal observers
    this.modalObservers.forEach(obs => obs.disconnect());
    this.modalObservers = [];

    // Remove camera preset UI
    if (this.cameraPresetUI && this.cameraPresetUI.parentNode) {
      this.cameraPresetUI.parentNode.removeChild(this.cameraPresetUI);
      this.cameraPresetUI = null;
    }

    // Remove planet tooltip
    if (this.planetTooltip && this.planetTooltip.parentNode) {
      this.planetTooltip.parentNode.removeChild(this.planetTooltip);
      this.planetTooltip = null;
    }

    // Unsubscribe from all Firebase subscriptions
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];

    // Cleanup customization effects
    this.planetCustomizationCallbacks.forEach((callbacks) => {
      callbacks.forEach((cb) => this.scene.unregisterBeforeRender(cb));
    });
    this.planetCustomizationCallbacks.clear();
    this.planetCustomizationParticles.forEach((systems) => {
      systems.forEach((sys) => { sys.stop(); sys.dispose(); });
    });
    this.planetCustomizationParticles.clear();
    this.moonMeshes.clear();

    // Dispose Babylon.js resources
    this.scene.dispose();
    this.engine.dispose();

    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
  }
}
