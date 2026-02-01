import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TIMELINE_CONFIG, type SceneSegment } from './timeline.config';

const AUDIO_SRC = '/Goodbye_Dark_OST_-_Apparat_(mp3.pm)%20(1).mp3';
const VISITOR_COUNT_KEY = 'vishwakarma_tribute_visitors';
const COMMENTS_KEY = 'vishwakarma_tribute_comments';
const LINKEDIN_URL = 'https://www.linkedin.com/in/dhrumil-panchal-222808215/';
const ROTATION_RETURN_SPEED = 0.7;
const INTRO_FADE_DURATION = 2;
const MIN_STARTING_LOADER_MS = 600;
const META_UI_OPACITY = 0.95;
const META_UI_FADE_START = 15;
const META_UI_FADE_END = 20;
const STATUE_SCALE_FACTOR = 2.16;
const ROTATION_VARIATION = 0.05;
const FEELING_OPTIONS = ['Still', 'Reflective', 'Inspired', 'Calm'] as const;

@Component({
  selector: 'app-glb-viewer',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './glb-viewer.component.html',
  styleUrl: './glb-viewer.component.scss',
})
export class GlbViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('commentsList') commentsListRef!: ElementRef<HTMLElement>;

  protected readonly modelLoaded = signal(false);
  protected readonly currentSegment = signal<SceneSegment | null>(null);
  protected readonly overlayFade = signal(1);
  protected readonly visitorCount = signal(0);
  protected readonly isFadingToBlack = signal(false);
  protected readonly audioReady = signal(false);
  protected readonly musicPlaying = signal(false);
  /** 1 = full intro (dark + Welcome), 0 = main scene visible. Fades out at 13s. */
  protected readonly introOverlayOpacity = signal(1);
  /** Show "Drag to rotate" hint; hides after first drag or after 30s of scene. */
  protected readonly showDraggableHint = signal(true);
  /** Shown when user clicked Begin and we are waiting for playback to start. */
  protected readonly startingRitual = signal(false);
  /** Current playback time in seconds (for seekbar). */
  protected readonly currentTimeSeconds = signal(0);
  /** Comments: array of { id, name, message, feeling, date }. */
  protected readonly comments = signal<
    { id: string; name: string; message: string; feeling: string; date: string }[]
  >([]);
  protected commentName = '';
  protected commentMessage = '';
  protected commentFeeling: string = FEELING_OPTIONS[0];
  protected readonly feelingOptions = FEELING_OPTIONS;
  protected readonly linkedInUrl = LINKEDIN_URL;
  /** Meta UI (LinkedIn, visitors, comments) fades in after 15–20s or on first drag. */
  protected readonly metaUIOpacity = signal(0);
  /** Comments panel expanded. */
  protected readonly commentsExpanded = signal(false);
  /** "You are now shaping the view." shown after first drag. */
  protected readonly showShapingMessage = signal(false);
  /** Ending line "Creation is never finished." during fade-out. */
  protected readonly showEndingLine = signal(false);
  /** Seekbar idle (fade when not hovered). */
  protected readonly seekbarHovered = signal(false);
  private userHasDraggedOnce = false;
  private showedShapingMessage = false;
  private sceneTimeAtFirstShow = 0;
  private ritualStartTime = 0;
  private shapingMessageTimeout: ReturnType<typeof setTimeout> | null = null;
  isSeeking = false;

  readonly config = TIMELINE_CONFIG;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private model: THREE.Group | null = null;
  private animationId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private audio: HTMLAudioElement | null = null;

  private activeTimeSeconds = 0;
  private initialExposure = 1.6;
  private initialBackground = new THREE.Color(0x0a0a0f);
  private sceneBackgroundColor!: THREE.Color;
  private fadePhase: 'none' | 'fading' | 'silence' | 'restarting' = 'none';
  private fadePhaseStartTime = 0;

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private userRotationY = 0;
  private userRotationX = 0;

  /** Scene time = time since 13s (0–124). Used for camera and rotation. */
  private readonly cameraKeyframes: { t: number; pos: [number, number, number] }[] = [
    { t: 0, pos: [0, 0.2, 5] },
    { t: 17, pos: [0, 0, 5] },
    { t: 37, pos: [0, 0, 5] },
    { t: 57, pos: [0, -0.35, 5.3] },
    { t: 77, pos: [0, -0.2, 5.1] },
    { t: 92, pos: [0, 0, 5] },
    { t: 124, pos: [0, 0, 5] },
  ];

  private readonly rotationSpeeds: { t: number; speed: number }[] = [
    { t: 0, speed: 0.002 },
    { t: 17, speed: 0.006 },
    { t: 37, speed: 0.008 },
    { t: 57, speed: 0.006 },
    { t: 77, speed: 0.002 },
    { t: 92, speed: 0 },
    { t: 124, speed: 0 },
  ];

  ngAfterViewInit(): void {
    this.initVisitorCount();
    this.loadComments();
    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.initLights();
    this.initAudio();
    this.loadModel();
    this.setupResizeHandler();
    this.setupPointerHandlers();
    this.animate();
    requestAnimationFrame(() => this.onResize());
    setTimeout(() => this.onResize(), 100);
  }

  ngOnDestroy(): void {
    if (this.shapingMessageTimeout) clearTimeout(this.shapingMessageTimeout);
    const el = this.canvasContainer?.nativeElement;
    if (el) {
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointerleave', this.onPointerUp);
    }
    window.removeEventListener('resize', this.boundOnResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.audio?.pause();
    this.audio = null;
    this.renderer?.dispose();
    this.scene?.clear();
    if (this.model) {
      this.model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
    }
  }

  private initVisitorCount(): void {
    try {
      const raw = localStorage.getItem(VISITOR_COUNT_KEY);
      const count = raw ? Math.max(0, parseInt(raw, 10) + 1) : 1;
      localStorage.setItem(VISITOR_COUNT_KEY, String(count));
      this.visitorCount.set(count);
    } catch {
      this.visitorCount.set(1);
    }
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.sceneBackgroundColor = this.initialBackground.clone();
    this.scene.background = this.sceneBackgroundColor;
  }

  private getContainerSize(): { width: number; height: number } {
    const container = this.canvasContainer.nativeElement;
    const width = container.clientWidth || window.innerWidth || 1;
    const height = container.clientHeight || window.innerHeight || 1;
    return { width, height };
  }

  private initCamera(): void {
    const { width, height } = this.getContainerSize();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  private initRenderer(): void {
    const container = this.canvasContainer.nativeElement;
    const { width, height } = this.getContainerSize();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(this.initialBackground, 1);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.initialExposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
  }

  private initLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xccddff, 0x554466, 0.6);
    this.scene.add(hemi);
    const front = new THREE.DirectionalLight(0xfff8f0, 1.8);
    front.position.set(0, 0.5, 6);
    front.target.position.set(0, 0, 0);
    this.scene.add(front);
    this.scene.add(front.target);
    const key = new THREE.DirectionalLight(0xfff0e0, 1.4);
    key.position.set(4, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0001;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbbccff, 1.0);
    fill.position.set(-4, 3, 3);
    this.scene.add(fill);
    const fill2 = new THREE.DirectionalLight(0xe8e8ff, 0.7);
    fill2.position.set(2, 2, 2);
    this.scene.add(fill2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.0);
    rim.position.set(0, 4, -5);
    this.scene.add(rim);
    const top = new THREE.DirectionalLight(0xffffff, 0.8);
    top.position.set(0, 8, 0);
    this.scene.add(top);
  }

  private initAudio(): void {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 1;
    this.audio.crossOrigin = 'anonymous';

    this.audio.addEventListener('loadeddata', () => {
      this.audioReady.set(true);
    });
    this.audio.addEventListener('canplaythrough', () => {
      this.audioReady.set(true);
    });
    this.audio.addEventListener('error', () => {
      console.warn(
        'Audio failed to load. Check that the file exists in public/ and the path is correct.'
      );
      this.audioReady.set(false);
    });
    this.audio.addEventListener('ended', () => this.onAudioEnded());
    this.audio.addEventListener('pause', () => this.musicPlaying.set(false));
    this.audio.addEventListener('play', () => {
      this.musicPlaying.set(true);
      const elapsed = Date.now() - this.ritualStartTime;
      const remaining = Math.max(0, MIN_STARTING_LOADER_MS - elapsed);
      setTimeout(() => {
        this.startingRitual.set(false);
        this.onResize();
      }, remaining);
    });
    this.audio.src = AUDIO_SRC;
    this.audio.load();
  }

  protected startMusic(): void {
    if (!this.audio) return;
    if (!this.audioReady()) return;
    this.ritualStartTime = Date.now();
    this.startingRitual.set(true);
    const startAt = this.config.audio.introEndSeconds;
    this.audio.currentTime = startAt;
    this.activeTimeSeconds = startAt;
    this.currentTimeSeconds.set(startAt);
    this.introOverlayOpacity.set(0);
    this.sceneTimeAtFirstShow = 0;
    // Force resize so canvas and camera are in sync when main screen appears
    requestAnimationFrame(() => this.onResize());
    setTimeout(() => this.onResize(), 50);
    this.audio
      .play()
      .then(() => this.musicPlaying.set(true))
      .catch((err) => {
        console.warn('Playback failed:', err);
        this.startingRitual.set(false);
      });
  }

  protected seekTo(seconds: number): void {
    if (!this.audio) return;
    const t = Math.max(0, Math.min(seconds, this.config.audio.totalDurationSeconds));
    this.audio.currentTime = t;
    this.activeTimeSeconds = t;
    this.currentTimeSeconds.set(t);
  }

  private loadComments(): void {
    try {
      const raw = localStorage.getItem(COMMENTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const items = Array.isArray(list) ? list : [];
      const normalized: {
        id: string;
        name: string;
        message: string;
        feeling: string;
        date: string;
      }[] = items.map((c: Record<string, unknown>) => ({
        id: (c['id'] as string) ?? crypto.randomUUID(),
        name: (c['name'] as string) ?? '',
        message: (c['message'] as string) ?? '',
        date: (c['date'] as string) ?? new Date().toISOString(),
        feeling:
          (c['feeling'] as string) ??
          (c['rating'] != null
            ? FEELING_OPTIONS[Math.min((c['rating'] as number) - 1, 3)]
            : FEELING_OPTIONS[0]),
      }));
      this.comments.set(normalized);
    } catch {
      this.comments.set([]);
    }
  }

  protected submitComment(): void {
    const name = this.commentName.trim();
    const message = this.commentMessage.trim();
    if (!name || !message) return;
    const comment = {
      id: crypto.randomUUID(),
      name,
      message,
      feeling: this.commentFeeling || FEELING_OPTIONS[0],
      date: new Date().toISOString(),
    };
    const next = [...this.comments(), comment];
    this.comments.set(next);
    try {
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(next));
    } catch {}
    this.commentName = '';
    this.commentMessage = '';
    this.commentFeeling = FEELING_OPTIONS[0];
    this.scrollCommentsToBottom();
  }

  private scrollCommentsToBottom(): void {
    setTimeout(() => {
      const el = this.commentsListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  protected formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  protected formatCommentDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  }

  /** Percent (0–100) for timeline marker at start of segment (audio time). */
  protected getTimelineMarkerPercent(seg: SceneSegment): number {
    const t = this.config.audio.introEndSeconds + seg.startSeconds;
    return (t / this.config.audio.totalDurationSeconds) * 100;
  }

  private onAudioEnded(): void {
    // Don't fade or restart – keep scene as-is so user can keep dragging the model
    if (this.fadePhase !== 'none') return;
    this.currentTimeSeconds.set(this.config.audio.totalDurationSeconds);
  }

  private startFadeToBlack(): void {
    this.fadePhase = 'fading';
    this.fadePhaseStartTime = performance.now();
    this.isFadingToBlack.set(true);
  }

  private updateTimelineFromAudio(): void {
    if (!this.audio) return;
    this.activeTimeSeconds = Math.max(0, this.audio.currentTime);
  }

  /** Time since main scene appeared (0 at 13s). Used for segments, camera, rotation. */
  private getSceneTime(): number {
    return Math.max(0, this.activeTimeSeconds - this.config.audio.introEndSeconds);
  }

  private getSegmentAt(t: number): SceneSegment | null {
    for (const seg of this.config.sceneTimeline) {
      if (t >= seg.startSeconds && t < seg.endSeconds) return seg;
    }
    if (t >= this.config.sceneTimeline[this.config.sceneTimeline.length - 1].endSeconds) {
      return this.config.sceneTimeline[this.config.sceneTimeline.length - 1];
    }
    return null;
  }

  private lerpKeyframes(
    keyframes: { t: number; pos: [number, number, number] }[],
    time: number
  ): [number, number, number] {
    if (time <= keyframes[0].t) return keyframes[0].pos;
    for (let i = 1; i < keyframes.length; i++) {
      if (time <= keyframes[i].t) {
        const a = keyframes[i - 1];
        const b = keyframes[i];
        const f = (time - a.t) / (b.t - a.t);
        return [
          a.pos[0] + (b.pos[0] - a.pos[0]) * f,
          a.pos[1] + (b.pos[1] - a.pos[1]) * f,
          a.pos[2] + (b.pos[2] - a.pos[2]) * f,
        ];
      }
    }
    return keyframes[keyframes.length - 1].pos;
  }

  private getRotationSpeedAt(time: number): number {
    const k = this.rotationSpeeds;
    if (time <= k[0].t) return k[0].speed;
    for (let i = 1; i < k.length; i++) {
      if (time <= k[i].t) {
        const a = k[i - 1];
        const b = k[i];
        const f = (time - a.t) / (b.t - a.t);
        return a.speed + (b.speed - a.speed) * f;
      }
    }
    return k[k.length - 1].speed;
  }

  /** Cumulative rotation Y (radians) at timeline time t – keeps model in sync with audio. */
  private getTargetRotationY(t: number): number {
    const k = this.rotationSpeeds;
    let total = 0;
    for (let i = 1; i < k.length; i++) {
      const t0 = k[i - 1].t;
      const t1 = k[i].t;
      const s0 = k[i - 1].speed;
      const s1 = k[i].speed;
      if (t <= t0) break;
      const segEnd = Math.min(t, t1);
      const segDur = segEnd - t0;
      const sEnd = s0 + (s1 - s0) * (segDur / (t1 - t0));
      total += ((s0 + sEnd) / 2) * segDur;
    }
    return total;
  }

  private loadModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/hitem3d.glb',
      (gltf) => {
        this.model = gltf.scene;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x1a1a28);
        const envMap = pmrem.fromScene(envScene).texture;
        pmrem.dispose();
        this.model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
            if (mat && !Array.isArray(mat)) {
              if (mat.color) {
                mat.color.multiplyScalar(1.5);
                mat.color.r = Math.min(mat.color.r, 1);
                mat.color.g = Math.min(mat.color.g, 1);
                mat.color.b = Math.min(mat.color.b, 1);
              }
              mat.envMap = envMap;
              mat.envMapIntensity = 0.6;
              if (typeof mat.metalness === 'number')
                mat.metalness = Math.min(0.4, mat.metalness + 0.15);
              if (typeof mat.roughness === 'number')
                mat.roughness = Math.max(0.45, mat.roughness * 0.9);
              mat.needsUpdate = true;
            }
          }
        });
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        this.model.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = STATUE_SCALE_FACTOR / maxDim;
        this.model.scale.setScalar(scale);
        const shadowPlane = new THREE.Mesh(
          new THREE.CircleGeometry(1.2, 32),
          new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.25,
          })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -1.05;
        shadowPlane.renderOrder = -1;
        this.model.add(shadowPlane);
        this.scene.add(this.model);
        this.modelLoaded.set(true);
      },
      undefined,
      (err) => console.error('GLB load error:', err)
    );
  }

  private setupResizeHandler(): void {
    const container = this.canvasContainer.nativeElement;
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.boundOnResize);
  }

  private setupPointerHandlers(): void {
    const el = this.canvasContainer.nativeElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.userHasDraggedOnce = true;
    this.showDraggableHint.set(false);
    this.metaUIOpacity.set(META_UI_OPACITY);
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.userRotationY += dx * 0.004;
    this.userRotationX += dy * 0.004;
    this.userRotationX = Math.max(-0.5, Math.min(0.5, this.userRotationX));
  };

  private onPointerUp = (): void => {
    if (this.isDragging && this.userHasDraggedOnce && !this.showedShapingMessage) {
      this.showShapingMessage.set(true);
      this.showedShapingMessage = true;
      if (this.shapingMessageTimeout) clearTimeout(this.shapingMessageTimeout);
      this.shapingMessageTimeout = setTimeout(() => this.showShapingMessage.set(false), 3500);
    }
    this.isDragging = false;
  };

  private boundOnResize = (): void => this.onResize();

  private onResize(): void {
    const { width, height } = this.getContainerSize();
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    const now = performance.now() / 1000;

    if (this.audio) {
      this.updateTimelineFromAudio();
      if (!this.isSeeking) this.currentTimeSeconds.set(this.activeTimeSeconds);
      const sceneTime = this.getSceneTime();
      const seg = this.getSegmentAt(sceneTime);
      this.currentSegment.set(seg);

      if (sceneTime >= 1 && this.showDraggableHint() && !this.userHasDraggedOnce) {
        if (this.sceneTimeAtFirstShow === 0) this.sceneTimeAtFirstShow = sceneTime;
        if (sceneTime - this.sceneTimeAtFirstShow > 30) this.showDraggableHint.set(false);
      }

      // Meta UI (LinkedIn, visitors, Reflections) visible as soon as main scene is shown
      this.metaUIOpacity.set(META_UI_OPACITY);

      const introEnd = this.config.audio.introEndSeconds;
      const fadeEnd = introEnd + INTRO_FADE_DURATION;
      if (this.activeTimeSeconds < introEnd) {
        this.introOverlayOpacity.set(1);
      } else if (this.activeTimeSeconds < fadeEnd) {
        const f = (this.activeTimeSeconds - introEnd) / INTRO_FADE_DURATION;
        this.introOverlayOpacity.set(1 - f);
      } else {
        this.introOverlayOpacity.set(0);
      }

      // When music completes: stop playback and keep scene as-is (no loop, no blank screen)
      if (
        this.fadePhase === 'none' &&
        this.activeTimeSeconds >= this.config.audio.totalDurationSeconds - 0.1
      ) {
        this.audio.pause();
        this.activeTimeSeconds = this.config.audio.totalDurationSeconds;
        this.currentTimeSeconds.set(this.config.audio.totalDurationSeconds);
        // Scene stays visible; user can still drag the model
      }
    }

    if (this.fadePhase === 'fading') {
      const elapsed = now - this.fadePhaseStartTime;
      const dur = 1.5;
      if (elapsed >= dur) {
        this.fadePhase = 'silence';
        this.fadePhaseStartTime = now;
        this.renderer.toneMappingExposure = 0;
        this.sceneBackgroundColor.setHex(0x000000);
        this.overlayFade.set(0);
        this.showEndingLine.set(false);
      } else {
        if (elapsed > 0.3) this.showEndingLine.set(true);
        const f = elapsed / dur;
        this.renderer.toneMappingExposure = this.initialExposure * (1 - f);
        this.sceneBackgroundColor.lerpColors(this.initialBackground, new THREE.Color(0x000000), f);
        this.overlayFade.set(1 - f);
      }
    } else if (this.fadePhase === 'silence') {
      const elapsed = now - this.fadePhaseStartTime;
      if (elapsed >= this.config.loopBehavior.silenceAfterEndSeconds) {
        this.fadePhase = 'restarting';
        this.fadePhaseStartTime = now;
        this.renderer.toneMappingExposure = this.initialExposure;
        this.sceneBackgroundColor.copy(this.initialBackground);
        this.overlayFade.set(1);
        this.showEndingLine.set(false);
        const startAt = this.config.audio.introEndSeconds;
        this.activeTimeSeconds = startAt;
        this.currentTimeSeconds.set(startAt);
        this.introOverlayOpacity.set(0);
        this.currentSegment.set(this.getSegmentAt(0));
        if (this.audio) {
          this.audio.currentTime = startAt;
          this.audio.play().catch(() => {});
        }
        this.isFadingToBlack.set(false);
        requestAnimationFrame(() => this.onResize());
      }
    } else if (this.fadePhase === 'restarting') {
      this.fadePhase = 'none';
    }

    const sceneTime = this.getSceneTime();
    const t = this.fadePhase === 'fading' || this.fadePhase === 'silence' ? 124 : sceneTime;
    const [cx, cy, cz] = this.lerpKeyframes(this.cameraKeyframes, t);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(0, 0, 0);

    const baseRotY = this.getTargetRotationY(this.fadePhase === 'fading' ? 92 : sceneTime);
    const variation = 1 + ROTATION_VARIATION * Math.sin(sceneTime * 0.5);
    const timelineRotY = baseRotY * variation;
    if (!this.isDragging) {
      const delta = 16 / 1000;
      const ease = 1 - Math.exp(-ROTATION_RETURN_SPEED * delta);
      this.userRotationY += (0 - this.userRotationY) * ease;
      this.userRotationX += (0 - this.userRotationX) * ease;
    }
    if (this.model) {
      this.model.rotation.y = timelineRotY + this.userRotationY;
      this.model.rotation.x = this.userRotationX;
    }

    this.renderer.render(this.scene, this.camera);
  };
}
