import * as THREE from 'three';

/* ============================================================================
   NEON HOLLOW — a cel-shaded Halloween endless runner.
   All geometry, textures, music and sound are generated at runtime.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

const LANES = [-2.2, 0, 2.2];
const SPAWN_Z = -128;
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  hud: $('hud'), score: $('score'), distance: $('distance'), candy: $('candy-count'),
  combo: $('combo'), comboX: $('combo-x'), powerups: $('powerups'), toast: $('toast'),
  tutorial: $('tutorial'), menu: $('menu'), pause: $('pause'), gameover: $('gameover'),
  flash: $('flash'), bestMenu: $('best-menu'), pauseScore: $('pause-score'),
  pauseDistance: $('pause-distance'), pauseCandy: $('pause-candy'), finalScore: $('final-score'),
  finalBest: $('final-best'), finalDistance: $('final-distance'), finalCandy: $('final-candy'),
  finalDodged: $('final-dodged'), newBest: $('new-best'), touch: $('touch-controls'),
  loader: $('loader'), mute: $('btn-mute'), pauseBtn: $('btn-pause'),
};

if (IS_TOUCH) document.body.classList.add('touch');

const BEST_KEY = 'neonHollowBest';
let best = Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0) || 0);
ui.bestMenu.textContent = best.toLocaleString();

/* -------------------------------------------------------------------------- */
/*  Renderer, scene, lighting                                                  */
/* -------------------------------------------------------------------------- */

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07030f);
scene.fog = new THREE.FogExp2(0x0d0519, 0.0076);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 320);
camera.position.set(4.4, 3.0, -6.3);

const hemi = new THREE.HemisphereLight(0xa883ff, 0x2c0c1c, 3.0);
scene.add(hemi);

const moonLight = new THREE.DirectionalLight(0xffb070, 2.7);
moonLight.position.set(-9, 18, 12);
scene.add(moonLight);

const cyanFill = new THREE.DirectionalLight(0x35dfff, 1.25);
cyanFill.position.set(10, 7, -10);
scene.add(cyanFill);

const ambient = new THREE.AmbientLight(0x5f3b8c, 1.05);
scene.add(ambient);

const frontFill = new THREE.DirectionalLight(0xb79bff, 1.15);
frontFill.position.set(5, 5, -9);
scene.add(frontFill);

const backFill = new THREE.DirectionalLight(0x8f7dff, 0.45);
backFill.position.set(-5, 5, 8);
scene.add(backFill);

/* -------------------------------------------------------------------------- */
/*  Cel-shading helpers                                                        */
/* -------------------------------------------------------------------------- */

const shadeRamp = new THREE.DataTexture(new Uint8Array([54, 132, 220, 255]), 4, 1, THREE.RedFormat);
shadeRamp.minFilter = THREE.NearestFilter;
shadeRamp.magFilter = THREE.NearestFilter;
shadeRamp.generateMipmaps = false;
shadeRamp.needsUpdate = true;

const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x07020c, side: THREE.BackSide });
const OUTLINE_SOFT = new THREE.MeshBasicMaterial({ color: 0x0a0412, side: THREE.BackSide });

function toon(color, options = {}) {
  const { flatShading, ...rest } = options;
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: shadeRamp,
    ...rest,
  });
}

function outlined(geometry, material, amount = 0.06) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(geometry, material);
  group.add(base);
  if (amount > 0) {
    const edge = new THREE.Mesh(geometry, OUTLINE_MAT);
    edge.scale.setScalar(1 + amount);
    edge.renderOrder = -1;
    group.add(edge);
  }
  group.userData.baseMesh = base;
  return group;
}

function part(parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], edge = 0) {
  const obj = edge > 0 ? outlined(geometry, material, edge) : new THREE.Mesh(geometry, material);
  obj.position.set(pos[0], pos[1], pos[2]);
  obj.rotation.set(rot[0], rot[1], rot[2]);
  obj.scale.set(scale[0], scale[1], scale[2]);
  parent.add(obj);
  return obj;
}

const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 128;
{
  const ctx = glowCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.16, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.38, 'rgba(255,255,255,0.38)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
}
const GLOW_TEX = new THREE.CanvasTexture(glowCanvas);
GLOW_TEX.colorSpace = THREE.SRGBColorSpace;

const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 128;
{
  const ctx = shadowCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
}
const SHADOW_TEX = new THREE.CanvasTexture(shadowCanvas);

function glowSprite(color, size = 2, opacity = 0.65) {
  const mat = new THREE.SpriteMaterial({
    map: GLOW_TEX, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

function groundGlow(color, size = 2, opacity = 0.3) {
  const mat = new THREE.MeshBasicMaterial({
    map: GLOW_TEX, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}

function textTexture(text, color, { bg = '#0a0414', border = color, font = 'Creepster', width = 512, height = 256, size = 112 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = 5;
  ctx.shadowColor = border;
  ctx.shadowBlur = 18;
  ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, width - 44, height - 44);
  ctx.font = `${size}px ${font}, fantasy`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 34;
  ctx.fillText(text, width / 2, height / 2 + size * 0.05);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, width / 2, height / 2 + size * 0.05);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/* -------------------------------------------------------------------------- */
/*  Sky, moon and stars                                                        */
/* -------------------------------------------------------------------------- */

const skyGroup = new THREE.Group();
scene.add(skyGroup);

const skyGeo = new THREE.SphereGeometry(250, 32, 18);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x06020d) },
    midColor: { value: new THREE.Color(0x1a0731) },
    lowColor: { value: new THREE.Color(0x2a0a31) },
    glowColor: { value: new THREE.Color(0x8b1d48) },
    moonDir: { value: new THREE.Vector3(0.18, 0.27, -0.94).normalize() },
  },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 lowColor;
    uniform vec3 glowColor;
    uniform vec3 moonDir;
    varying vec3 vDir;
    void main() {
      float h = vDir.y;
      vec3 col = mix(lowColor, midColor, smoothstep(-0.12, 0.24, h));
      col = mix(col, topColor, smoothstep(0.2, 0.9, h));
      float halo = pow(max(dot(normalize(vDir), moonDir), 0.0), 9.0);
      col += glowColor * halo * 0.42;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.renderOrder = -100;
skyGroup.add(sky);

const starCount = 620;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starPalette = [new THREE.Color(0xfff3cf), new THREE.Color(0x9ef8ff), new THREE.Color(0xffb3df)];
for (let i = 0; i < starCount; i++) {
  const phi = rand(0, Math.PI * 2);
  const y = rand(-0.06, 1);
  const r = Math.sqrt(1 - y * y) * 228;
  starPositions[i * 3] = Math.cos(phi) * r;
  starPositions[i * 3 + 1] = y * 228;
  starPositions[i * 3 + 2] = Math.sin(phi) * r;
  const c = pick(starPalette);
  const k = rand(0.35, 1);
  starColors[i * 3] = c.r * k;
  starColors[i * 3 + 1] = c.g * k;
  starColors[i * 3 + 2] = c.b * k;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
const starMat = new THREE.PointsMaterial({
  size: 1.55, map: GLOW_TEX, vertexColors: true, transparent: true,
  opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  sizeAttenuation: true, fog: false,
});
const stars = new THREE.Points(starGeo, starMat);
skyGroup.add(stars);

function makeMoonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(210, 190, 25, 256, 256, 250);
  g.addColorStop(0, '#fff9dc');
  g.addColorStop(0.45, '#ffe3a1');
  g.addColorStop(0.78, '#ffb75c');
  g.addColorStop(1, '#e77a32');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(256, 256, 246, 0, Math.PI * 2);
  ctx.fill();
  const craters = [
    [170, 170, 33, 0.13], [306, 144, 19, 0.12], [330, 290, 46, 0.13],
    [214, 330, 26, 0.1], [288, 370, 15, 0.12], [138, 282, 18, 0.1],
    [364, 218, 16, 0.1], [238, 224, 40, 0.07], [198, 112, 12, 0.11],
  ];
  for (const [x, y, r, a] of craters) {
    const cg = ctx.createRadialGradient(x - r * 0.25, y - r * 0.2, 1, x, y, r);
    cg.addColorStop(0, `rgba(103,43,31,${Math.min(0.35, a * 1.8)})`);
    cg.addColorStop(0.7, `rgba(145,61,29,${a * 1.2})`);
    cg.addColorStop(1, 'rgba(154,70,33,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const moonGroup = new THREE.Group();
const moonHalo = glowSprite(0xff7b24, 64, 0.56);
moonGroup.add(moonHalo);
const moonDisc = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshBasicMaterial({ map: makeMoonTexture(), transparent: true, side: THREE.DoubleSide, toneMapped: false })
);
moonGroup.add(moonDisc);
const moonRim = glowSprite(0xffd58c, 30, 0.34);
moonGroup.add(moonRim);
moonGroup.position.set(34, 36, -120);
moonGroup.rotation.z = -0.08;
skyGroup.add(moonGroup);

const cloudGroup = new THREE.Group();
for (let i = 0; i < 7; i++) {
  const cloud = new THREE.Mesh(
    new THREE.PlaneGeometry(rand(22, 46), rand(2.5, 5)),
    new THREE.MeshBasicMaterial({
      color: i % 2 ? 0x3b1551 : 0x2a0b3d, transparent: true, opacity: 0.24,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    })
  );
  cloud.position.set(rand(-110, 90), rand(24, 62), rand(-170, -70));
  cloud.rotation.z = rand(-0.04, 0.04);
  cloudGroup.add(cloud);
}
skyGroup.add(cloudGroup);

/* -------------------------------------------------------------------------- */
/*  Road                                                                       */
/* -------------------------------------------------------------------------- */

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1029';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.72 ? 'rgba(129,101,166,0.16)' : 'rgba(0,0,0,0.22)';
    const s = Math.random() * 2.4 + 0.4;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  ctx.strokeStyle = 'rgba(95,61,130,0.28)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += rand(-22, 22);
      y += rand(10, 28);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 42);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

const roadTexture = asphaltTexture();
const roadMaterial = toon(0xffffff, { map: roadTexture });
const shoulderMaterial = toon(0x24122f, { map: asphaltTexture() });
const roadBase = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 420), roadMaterial);
roadBase.rotation.x = -Math.PI / 2;
roadBase.position.set(0, 0, -150);
scene.add(roadBase);

const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(170, 520), shoulderMaterial);
shoulder.rotation.x = -Math.PI / 2;
shoulder.position.set(0, -0.07, -170);
scene.add(shoulder);

const vergeMat = toon(0x140a1e);
const vergeLeft = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 420), vergeMat);
vergeLeft.position.set(-5.0, 0.02, -150);
scene.add(vergeLeft);
const vergeRight = vergeLeft.clone();
vergeRight.position.x = 5.0;
scene.add(vergeRight);

const NEON_CYAN = 0x34f6ff;
const NEON_PINK = 0xff2fa6;
const NEON_ORANGE = 0xff8b24;
const NEON_PURPLE = 0xa25cff;

const railL = new THREE.Mesh(
  new THREE.BoxGeometry(0.065, 0.055, 420),
  new THREE.MeshBasicMaterial({ color: NEON_CYAN, toneMapped: false })
);
railL.position.set(-4.12, 0.09, -150);
scene.add(railL);
const railR = new THREE.Mesh(
  new THREE.BoxGeometry(0.065, 0.055, 420),
  new THREE.MeshBasicMaterial({ color: NEON_PINK, toneMapped: false })
);
railR.position.set(4.12, 0.09, -150);
scene.add(railR);

const railGlowL = new THREE.Mesh(
  new THREE.PlaneGeometry(1.0, 420),
  new THREE.MeshBasicMaterial({
    map: GLOW_TEX, color: NEON_CYAN, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  })
);
railGlowL.rotation.x = -Math.PI / 2;
railGlowL.position.set(-4.12, 0.055, -150);
scene.add(railGlowL);
const railGlowR = railGlowL.clone();
railGlowR.material = railGlowL.material.clone();
railGlowR.material.color.setHex(NEON_PINK);
railGlowR.position.x = 4.12;
scene.add(railGlowR);

// Moving lane dashes: a single instanced draw call.
const DASH_PER_LANE = 58;
const DASH_SPACING = 3.5;
const dashGeo = new THREE.BoxGeometry(0.06, 0.022, 1.25);
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, DASH_PER_LANE * 2);
dashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
dashMesh.frustumCulled = false;
for (let lane = 0; lane < 2; lane++) {
  for (let i = 0; i < DASH_PER_LANE; i++) {
    dashMesh.setColorAt(lane * DASH_PER_LANE + i, new THREE.Color(lane === 0 ? 0x6f49b5 : 0x8c3b9c));
  }
}
dashMesh.instanceColor.needsUpdate = true;
scene.add(dashMesh);
let dashScroll = 0;
const dashMatrix = new THREE.Matrix4();
const dashPos = new THREE.Vector3();

function updateDashes(speed, dt) {
  dashScroll = (dashScroll + speed * dt) % DASH_SPACING;
  for (let lane = 0; lane < 2; lane++) {
    const x = lane === 0 ? -1.1 : 1.1;
    for (let i = 0; i < DASH_PER_LANE; i++) {
      const z = 16 - i * DASH_SPACING + dashScroll;
      dashPos.set(x, 0.03, z);
      dashMatrix.makeTranslation(dashPos.x, dashPos.y, dashPos.z);
      dashMesh.setMatrixAt(lane * DASH_PER_LANE + i, dashMatrix);
    }
  }
  dashMesh.instanceMatrix.needsUpdate = true;
}

/* -------------------------------------------------------------------------- */
/*  Roadside props                                                             */
/* -------------------------------------------------------------------------- */

const propSignTextures = [
  textTexture('BEWARE', '#ff4fbc', { border: '#ff2fa6', size: 100 }),
  textTexture('TRICK OR TREAT', '#ffd23f', { border: '#ff8b24', size: 66 }),
  textTexture('NO EXIT', '#54f7ff', { border: '#34f6ff', size: 98 }),
  textTexture('CANDY', '#b67bff', { border: '#a25cff', size: 113 }),
  textTexture('R.I.P.', '#ff8b24', { border: '#ff5d2a', size: 108 }),
];
const RIP_TEXTURE = textTexture('R.I.P.', '#ff4fbc', { bg: null, border: '#ff2fa6', width: 256, height: 128, size: 68 });

function makeDeadTree() {
  const g = new THREE.Group();
  const wood = toon(0x1b0e28, { flatShading: true });
  const woodLight = toon(0x291538, { flatShading: true });
  part(g, new THREE.CylinderGeometry(0.09, 0.24, 3.3, 5), wood, [0, 1.65, 0], [0.03, 0, -0.06], [1, 1, 1], 0.1);
  part(g, new THREE.CylinderGeometry(0.045, 0.11, 1.8, 5), wood, [-0.44, 2.85, 0.02], [0.18, 0, 0.78], [1, 1, 1], 0.1);
  part(g, new THREE.CylinderGeometry(0.035, 0.09, 1.5, 5), wood, [0.48, 3.05, -0.03], [-0.1, 0, -0.95], [1, 1, 1], 0.1);
  part(g, new THREE.CylinderGeometry(0.025, 0.06, 1.0, 5), wood, [-0.8, 3.72, 0.02], [0.1, 0, 0.38], [1, 1, 1], 0.1);
  part(g, new THREE.CylinderGeometry(0.02, 0.05, 0.85, 5), wood, [-0.16, 2.18, 0.02], [0.1, 0, -1.12], [1, 1, 1], 0.1);
  const rootGeo = new THREE.ConeGeometry(0.24, 0.55, 5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    part(g, rootGeo, wood, [Math.cos(a) * 0.32, 0.1, Math.sin(a) * 0.32], [0, 0, Math.PI / 2 + Math.cos(a) * 0.7], [0.75, 1, 0.75]);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff9a2b });
  part(g, new THREE.SphereGeometry(0.045, 6, 5), eyeMat, [-0.09, 2.1, 0.225]);
  part(g, new THREE.SphereGeometry(0.045, 6, 5), eyeMat, [0.09, 2.1, 0.225]);
  const halo = glowSprite(0xff7a1f, 1.1, 0.3);
  halo.position.set(0, 2.1, 0.28);
  g.add(halo);
  // A witch-light caught in the branches.
  const orbColor = pick([0x45f5ff, 0xff3fae, 0xff8b24]);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: orbColor, toneMapped: false }));
  orb.position.set(-0.82, 3.55, 0.04);
  g.add(orb);
  const orbGlow = glowSprite(orbColor, 1.9, 0.47);
  orbGlow.position.copy(orb.position);
  g.add(orbGlow);
  // A few crooked twig silhouettes.
  const twigGeo = new THREE.CylinderGeometry(0.012, 0.035, 0.8, 4);
  part(g, twigGeo, woodLight, [0.25, 3.7, 0.05], [0.2, 0, -0.75]);
  part(g, twigGeo, woodLight, [-0.47, 3.5, -0.05], [-0.5, 0, 0.47]);
  return g;
}

function makeTombstone() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.46, 0);
  shape.lineTo(0.46, 0);
  shape.lineTo(0.46, 0.72);
  shape.absarc(0, 0.72, 0.46, 0, Math.PI, false);
  shape.lineTo(-0.46, 0);
  const stone = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 });
  const mat = toon(0x57476f, { flatShading: true });
  part(g, stone, mat, [0, 0, -0.1], [0, 0, rand(-0.045, 0.045)], [1, 1, 1], 0.09);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 4), toon(0x1b0d20, { flatShading: true }));
  mound.scale.set(1, 0.28, 0.6);
  mound.position.set(0, 0.02, 0.02);
  g.add(mound);
  const rip = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.27),
    new THREE.MeshBasicMaterial({ map: RIP_TEXTURE, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  rip.position.set(0, 0.55, 0.135);
  g.add(rip);
  const glow = glowSprite(0xff3fae, 1.5, 0.2);
  glow.position.set(0, 0.6, 0.2);
  g.add(glow);
  return g;
}

function pumpkinFace(parent, scale = 1, z = 0.42, color = 0xffd23f) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const eyeShape = new THREE.Shape();
  eyeShape.moveTo(-0.1, -0.06);
  eyeShape.lineTo(0.1, -0.06);
  eyeShape.lineTo(0, 0.115);
  eyeShape.closePath();
  const eyeGeo = new THREE.ShapeGeometry(eyeShape);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, mat);
    eye.position.set(side * 0.165, 0.12, z);
    eye.scale.setScalar(scale);
    parent.add(eye);
  }
  const mouthShape = new THREE.Shape();
  mouthShape.moveTo(-0.22, 0);
  mouthShape.lineTo(-0.11, -0.09);
  mouthShape.lineTo(0, 0);
  mouthShape.lineTo(0.11, -0.09);
  mouthShape.lineTo(0.22, 0);
  mouthShape.lineTo(0.16, 0.09);
  mouthShape.lineTo(0.05, 0.02);
  mouthShape.lineTo(-0.05, 0.11);
  mouthShape.lineTo(-0.16, 0.03);
  mouthShape.closePath();
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(mouthShape), mat);
  mouth.position.set(0, -0.11, z);
  mouth.scale.setScalar(scale);
  parent.add(mouth);
}

function makePumpkinPatch() {
  const g = new THREE.Group();
  const orange = toon(0xff7b18, { flatShading: true });
  const stemMat = toon(0x3c6d2b, { flatShading: true });
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : 0.62;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.42, 9, 6), orange);
    p.scale.set(s, s * 0.72, s);
    p.position.set(i === 0 ? -0.15 : 0.48, 0.3 * s + 0.03, i === 0 ? 0 : 0.22);
    g.add(p);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.065 * s, 0.2 * s, 5), stemMat);
    stem.position.set(p.position.x, p.position.y + 0.31 * s, p.position.z);
    stem.rotation.z = 0.18;
    g.add(stem);
    const face = new THREE.Group();
    face.position.set(p.position.x, p.position.y, 0);
    face.scale.setScalar(s * 0.9);
    pumpkinFace(face, 0.9, 0.4, 0xffe35d);
    g.add(face);
    const gl = glowSprite(0xff8b24, 1.7 * s, 0.23);
    gl.position.set(p.position.x, p.position.y + 0.12, 0.45);
    g.add(gl);
  }
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.75, 7, 4), toon(0x20102a, { flatShading: true }));
  base.scale.set(1.4, 0.18, 1.1);
  base.position.y = 0.01;
  g.add(base);
  return g;
}

function makeLamp() {
  const g = new THREE.Group();
  const metal = toon(0x171022, { flatShading: true });
  part(g, new THREE.CylinderGeometry(0.055, 0.12, 3.2, 6), metal, [0, 1.6, 0], [0, 0, 0], [1, 1, 1], 0.07);
  part(g, new THREE.CylinderGeometry(0.16, 0.24, 0.22, 6), metal, [0, 0.11, 0]);
  part(g, new THREE.BoxGeometry(0.9, 0.06, 0.06), metal, [0.37, 3.18, 0], [0, 0, 0.08]);
  part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), metal, [0.76, 3.02, 0]);
  const lantern = new THREE.Group();
  lantern.position.set(0.76, 2.76, 0);
  const cageMat = toon(0x24132e);
  part(lantern, new THREE.CylinderGeometry(0.17, 0.22, 0.42, 6), cageMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.07);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff9e3d });
  part(lantern, new THREE.SphereGeometry(0.13, 7, 5), glowMat, [0, 0, 0]);
  part(lantern, new THREE.ConeGeometry(0.26, 0.2, 6), cageMat, [0, 0.31, 0]);
  const gl = glowSprite(0xff7b24, 2.4, 0.55);
  gl.position.set(0, 0, 0);
  lantern.add(gl);
  g.add(lantern);
  return g;
}

function makeHouse() {
  const g = new THREE.Group();
  const wall = toon(0x261435, { flatShading: true });
  const roofMat = toon(0x120a1c, { flatShading: true });
  const trim = new THREE.MeshBasicMaterial({ color: 0xff2fa6 });
  part(g, new THREE.BoxGeometry(4.6, 3.4, 3.4), wall, [0, 1.7, 0], [0, 0, 0], [1, 1, 1], 0.035);
  part(g, new THREE.ConeGeometry(3.65, 2.4, 4), roofMat, [0, 4.55, 0], [0, Math.PI / 4, 0], [1, 1, 1], 0.035);
  part(g, new THREE.BoxGeometry(4.7, 0.11, 0.11), trim, [0, 3.38, 1.72]);
  part(g, new THREE.BoxGeometry(0.11, 0.11, 3.5), trim, [-2.33, 3.38, 0]);
  part(g, new THREE.BoxGeometry(0.11, 0.11, 3.5), trim, [2.33, 3.38, 0]);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffb348 });
  const winMat2 = new THREE.MeshBasicMaterial({ color: 0x5af7ff });
  for (let i = 0; i < 3; i++) {
    const x = i % 2 === 0 ? -1.15 : 1.15;
    const y = i === 2 ? 2.65 : 1.9;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.76), i === 2 ? winMat2 : winMat);
    win.position.set(x, y, 1.715);
    g.add(win);
    const wg = glowSprite(i === 2 ? 0x45f5ff : 0xffa12e, 1.8, 0.34);
    wg.position.set(x, y, 1.78);
    g.add(wg);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.3), toon(0x09030f));
  door.position.set(0, 0.68, 1.715);
  g.add(door);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), wall);
  chimney.position.set(1.2, 5.2, -0.5);
  g.add(chimney);
  return g;
}

function makeFence() {
  const g = new THREE.Group();
  const mat = toon(0x120b1b, { flatShading: true });
  const postGeo = new THREE.BoxGeometry(0.13, 1.45, 0.13);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(postGeo, mat);
    p.position.set(0, 0.72, -1.55 + i * 0.78);
    p.rotation.z = rand(-0.035, 0.035);
    g.add(p);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), mat);
    tip.position.set(0, 1.56, p.position.z);
    g.add(tip);
  }
  for (const y of [0.42, 1.08]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 3.6), mat);
    bar.position.set(0, y, 0);
    g.add(bar);
  }
  return g;
}

function makeSign() {
  const g = new THREE.Group();
  const metal = toon(0x171022);
  part(g, new THREE.CylinderGeometry(0.05, 0.08, 2.05, 5), metal, [-0.9, 1.02, 0], [0, 0, 0], [1, 1, 1], 0.06);
  part(g, new THREE.CylinderGeometry(0.05, 0.08, 2.05, 5), metal, [0.9, 1.02, 0], [0, 0, 0], [1, 1, 1], 0.06);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.4),
    new THREE.MeshBasicMaterial({
      map: pick(propSignTextures), transparent: true, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    })
  );
  sign.position.set(0, 2.58, 0);
  g.add(sign);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.5, 0.08), metal);
  back.position.set(0, 2.58, -0.06);
  g.add(back);
  const gl = glowSprite(0xff3fae, 3.4, 0.18);
  gl.position.set(0, 2.58, 0.2);
  g.add(gl);
  return g;
}

const envPropFactory = {
  tree: makeDeadTree,
  tomb: makeTombstone,
  pumpkin: makePumpkinPatch,
  lamp: makeLamp,
  house: makeHouse,
  fence: makeFence,
  sign: makeSign,
};
const envTypeWeights = [
  ['tree', 26], ['tomb', 24], ['pumpkin', 16], ['lamp', 14],
  ['sign', 10], ['fence', 7], ['house', 3],
];
const totalWeight = envTypeWeights.reduce((s, [, w]) => s + w, 0);
function randomEnvType() {
  let r = Math.random() * totalWeight;
  for (const [type, w] of envTypeWeights) {
    if ((r -= w) <= 0) return type;
  }
  return 'tree';
}

const envProps = [];
function placeEnv(record, z, initial = false) {
  const type = record.type;
  const side = Math.random() < 0.5 ? -1 : 1;
  let x, spread;
  if (type === 'house') {
    x = side * rand(12.5, 19);
    spread = 1;
  } else if (type === 'sign') {
    x = side * rand(6.5, 7.8);
    spread = 1;
  } else if (type === 'fence') {
    x = side * rand(5.25, 6.4);
    spread = 1;
  } else if (type === 'lamp') {
    x = side * rand(5.35, 6.5);
    spread = 1;
  } else {
    x = side * rand(5.7, 10.5);
    spread = rand(0.72, 1.25);
  }
  record.obj.position.set(x, 0, z);
  record.obj.rotation.y = type === 'sign' ? (side < 0 ? 0.16 : -0.16) : rand(-0.7, 0.7);
  record.obj.scale.setScalar(type === 'house' ? rand(0.82, 1.1) : spread);
  record.obj.visible = true;
  record.z = z;
  record.side = side;
}

function initEnvironment() {
  let z = 18;
  let i = 0;
  while (z > -185) {
    const type = randomEnvType();
    const obj = envPropFactory[type]();
    scene.add(obj);
    const record = { obj, type, z };
    envProps.push(record);
    placeEnv(record, z);
    z -= rand(5.5, 11);
    i++;
  }
  // A few guaranteed houses loom farther out in the fog.
  for (let k = 0; k < 3; k++) {
    const type = 'house';
    const obj = envPropFactory[type]();
    scene.add(obj);
    const record = { obj, type, z };
    envProps.push(record);
    placeEnv(record, -55 - k * 52);
    record.obj.position.x = (k % 2 ? -1 : 1) * rand(13, 18);
  }
}

function updateEnvironment(speed, dt) {
  let minZ = Infinity;
  for (const record of envProps) {
    record.z += speed * dt;
    record.obj.position.z = record.z;
    if (record.z < minZ) minZ = record.z;
  }
  for (const record of envProps) {
    if (record.z > 20) {
      // Recycle to just beyond the current far edge.
      record.z = minZ - rand(7, 17);
      placeEnv(record, record.z);
      minZ = record.z;
    }
  }
  for (const gate of gates) {
    gate.position.z += speed * dt;
    if (gate.position.z > 18) gate.position.z -= GATE_SPACING * gates.length;
  }
}

/* -------------------------------------------------------------------------- */
/*  Neon gateways                                                              */
/* -------------------------------------------------------------------------- */

const gateTextures = [
  textTexture('NEON HOLLOW', '#ff55c1', { border: '#ff2fa6', width: 768, height: 192, size: 98 }),
  textTexture('ALL HALLOWS', '#ffd23f', { border: '#ff8b24', width: 768, height: 192, size: 94 }),
  textTexture('TRICK OR TREAT', '#5cf7ff', { border: '#34f6ff', width: 768, height: 192, size: 82 }),
  textTexture('BEWARE', '#b47bff', { border: '#a25cff', width: 768, height: 192, size: 112 }),
];
const gates = [];
const GATE_SPACING = 62;

function makeGate(index) {
  const g = new THREE.Group();
  const metal = toon(0x180e24, { flatShading: true });
  for (const side of [-1, 1]) {
    part(g, new THREE.BoxGeometry(0.34, 5.4, 0.34), metal, [side * 4.65, 2.7, 0], [0, 0, 0], [1, 1, 1], 0.035);
    part(g, new THREE.BoxGeometry(0.52, 0.22, 0.52), metal, [side * 4.65, 0.11, 0]);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 4.8, 0.07),
      new THREE.MeshBasicMaterial({ color: side < 0 ? NEON_CYAN : NEON_PINK })
    );
    strip.position.set(side * 4.65, 2.7, 0.2);
    g.add(strip);
    const gl = glowSprite(side < 0 ? NEON_CYAN : NEON_PINK, 2.6, 0.28);
    gl.position.set(side * 4.65, 4.9, 0.1);
    g.add(gl);
  }
  part(g, new THREE.BoxGeometry(9.65, 0.22, 0.4), metal, [0, 5.28, 0], [0, 0, 0], [1, 1, 1], 0.03);
  const signMat = new THREE.MeshBasicMaterial({
    map: gateTextures[index % gateTextures.length], transparent: true,
    depthWrite: false, side: THREE.FrontSide, toneMapped: false,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), signMat);
  sign.position.set(0, 4.9, 0.245);
  g.add(sign);
  // A second face so the wording reads correctly when the menu camera
  // looks back through the gate.
  const signBack = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), signMat);
  signBack.position.set(0, 4.9, 0.235);
  signBack.rotation.y = Math.PI;
  g.add(signBack);
  const signGlow = glowSprite(index % 2 ? 0xffa12e : 0xff3fae, 6.2, 0.16);
  signGlow.position.set(0, 4.9, -0.15);
  g.add(signGlow);
  // Hanging bulbs along the crossbar.
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd67a, toneMapped: false });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), bulbMat);
    b.position.set(-3.6 + i * 1.2, 4.02, 0.32);
    g.add(b);
    const bg = glowSprite(0xffc15e, 0.8, 0.4);
    bg.position.copy(b.position);
    g.add(bg);
  }
  return g;
}

function initGates() {
  for (let i = 0; i < 4; i++) {
    const gate = makeGate(i);
    gate.position.z = 6 - i * GATE_SPACING;
    scene.add(gate);
    gates.push(gate);
  }
}

/* -------------------------------------------------------------------------- */
/*  Floating embers and fireflies                                              */
/* -------------------------------------------------------------------------- */

const moteCount = 190;
const motePositions = new Float32Array(moteCount * 3);
const moteColors = new Float32Array(moteCount * 3);
const moteSeeds = new Float32Array(moteCount);
const motePalette = [new THREE.Color(0xff8b24), new THREE.Color(0x45f5ff), new THREE.Color(0xff3fae), new THREE.Color(0xffd23f)];
for (let i = 0; i < moteCount; i++) {
  motePositions[i * 3] = rand(-17, 17);
  motePositions[i * 3 + 1] = rand(0.25, 7.5);
  motePositions[i * 3 + 2] = rand(-185, 24);
  const c = pick(motePalette);
  moteColors[i * 3] = c.r;
  moteColors[i * 3 + 1] = c.g;
  moteColors[i * 3 + 2] = c.b;
  moteSeeds[i] = rand(0, Math.PI * 2);
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));
const moteMat = new THREE.PointsMaterial({
  size: 0.14, map: GLOW_TEX, vertexColors: true, transparent: true, opacity: 0.66,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
});
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
scene.add(motes);

function updateMotes(speed, dt, time) {
  const positions = moteGeo.attributes.position.array;
  for (let i = 0; i < moteCount; i++) {
    positions[i * 3 + 2] += speed * dt;
    positions[i * 3] += Math.sin(time * 0.7 + moteSeeds[i]) * dt * 0.32;
    positions[i * 3 + 1] += Math.cos(time * 0.9 + moteSeeds[i] * 1.3) * dt * 0.16;
    if (positions[i * 3 + 2] > 26) {
      positions[i * 3 + 2] = rand(-190, -170);
      positions[i * 3] = rand(-17, 17);
      positions[i * 3 + 1] = rand(0.25, 7.5);
    }
  }
  moteGeo.attributes.position.needsUpdate = true;
}

initEnvironment();
initGates();

/* -------------------------------------------------------------------------- */
/*  The runner — a pumpkin-headed little witch                                 */
/* -------------------------------------------------------------------------- */

function shapeMesh(points, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

function buildPlayer() {
  const root = new THREE.Group();
  scene.add(root);
  const visual = new THREE.Group();
  root.add(visual);

  const purple = toon(0x4a1b69, { flatShading: true });
  const purpleLight = toon(0x712d9c, { flatShading: true });
  const orange = toon(0xf06a0e, { flatShading: true });
  const orangeDark = toon(0xb63c08, { flatShading: true });
  const black = toon(0x100818);
  const bootMat = toon(0x160a21, { flatShading: true });
  const skinPale = toon(0xffb694);
  const neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xff3fae, toneMapped: false });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x45f5ff, toneMapped: false });
  const neonAmberMat = new THREE.MeshBasicMaterial({ color: 0xffc23f, toneMapped: false });

  // Cloak / body
  part(visual, new THREE.ConeGeometry(0.49, 1.2, 7), purple, [0, 0.8, 0], [0, 0.17, 0], [1, 1, 0.9], 0.055);
  part(visual, new THREE.CylinderGeometry(0.36, 0.44, 0.28, 7), purpleLight, [0, 1.3, 0], [0, 0, 0], [1, 1, 1], 0.05);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 5, 24), neonPinkMat);
  hem.position.y = 0.82;
  hem.rotation.x = Math.PI / 2;
  visual.add(hem);
  const hemGlow = glowSprite(0xff3fae, 1.3, 0.22);
  hemGlow.position.y = 0.82;
  visual.add(hemGlow);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.038, 5, 24), neonAmberMat);
  belt.position.y = 1.22;
  belt.rotation.x = Math.PI / 2;
  visual.add(belt);

  // Legs
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.18, 0.57, 0);
  legR.position.set(0.18, 0.57, 0);
  visual.add(legL, legR);
  for (const [leg, side] of [[legL, -1], [legR, 1]]) {
    part(leg, new THREE.CylinderGeometry(0.075, 0.085, 0.42, 5), black, [0, -0.2, 0], [0, 0, 0], [1, 1, 1], 0.08);
    part(leg, new THREE.BoxGeometry(0.19, 0.16, 0.31), bootMat, [0, -0.43, -0.045], [0, 0, 0], [1, 1, 1], 0.07);
    part(leg, new THREE.BoxGeometry(0.2, 0.035, 0.32), neonCyanMat, [0, -0.515, -0.045]);
  }

  // Arms
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.4, 1.32, 0);
  armR.position.set(0.4, 1.32, 0);
  visual.add(armL, armR);
  for (const [arm, side] of [[armL, -1], [armR, 1]]) {
    part(arm, new THREE.CylinderGeometry(0.07, 0.115, 0.5, 5), purple, [0, -0.24, 0], [0, 0, 0], [1, 1, 1], 0.06);
    part(arm, new THREE.SphereGeometry(0.09, 6, 5), skinPale, [0, -0.51, 0], [0, 0, 0], [1, 1, 1], 0.06);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.017, 4, 14), neonCyanMat);
    cuff.position.y = -0.43;
    cuff.rotation.x = Math.PI / 2;
    arm.add(cuff);
  }

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.82, 0);
  visual.add(head);
  const pumpkinMat = toon(0xff7a16, { flatShading: true });
  const skull = part(head, new THREE.SphereGeometry(0.43, 10, 7), pumpkinMat, [0, 0, 0], [0, 0.1, 0], [1.03, 0.84, 0.98], 0.045);
  // Ribbed pumpkin segments, subtle and low-poly.
  for (const side of [-1, 1]) {
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(0.31, 7, 6), orangeDark);
    ridge.scale.set(0.42, 0.83, 1.0);
    ridge.position.set(side * 0.22, -0.005, 0.03);
    head.add(ridge);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.17, 5), toon(0x4f7c32, { flatShading: true }));
  stem.position.set(0.02, 0.38, 0.02);
  stem.rotation.z = 0.18;
  head.add(stem);

  // Face (faces -Z, toward the menu camera; from behind we see the cape instead)
  const faceMat = new THREE.MeshBasicMaterial({ color: 0xffe25c, side: THREE.DoubleSide, toneMapped: false });
  const eyeShape = new THREE.Shape();
  eyeShape.moveTo(-0.11, -0.075);
  eyeShape.lineTo(0.11, -0.075);
  eyeShape.lineTo(0, 0.1);
  eyeShape.closePath();
  const eyeGeo = new THREE.ShapeGeometry(eyeShape);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, faceMat);
    eye.position.set(side * 0.16, 0.07, -0.442);
    eye.rotation.y = Math.PI;
    head.add(eye);
  }
  const mouthShape = new THREE.Shape();
  mouthShape.moveTo(-0.22, 0);
  mouthShape.lineTo(-0.1, -0.1);
  mouthShape.lineTo(0.01, -0.01);
  mouthShape.lineTo(0.12, -0.11);
  mouthShape.lineTo(0.23, 0);
  mouthShape.lineTo(0.14, 0.08);
  mouthShape.lineTo(0.01, 0.0);
  mouthShape.lineTo(-0.12, 0.09);
  mouthShape.closePath();
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(mouthShape), faceMat);
  mouth.position.set(0, -0.2, -0.425);
  mouth.rotation.y = Math.PI;
  head.add(mouth);
  const faceGlow = glowSprite(0xffab2e, 1.3, 0.28);
  faceGlow.position.set(0, 0.02, -0.44);
  head.add(faceGlow);

  // Witch hat, bent tip and all.
  const hat = new THREE.Group();
  hat.position.set(0.02, 0.3, 0.02);
  hat.rotation.z = -0.1;
  head.add(hat);
  part(hat, new THREE.CylinderGeometry(0.61, 0.64, 0.075, 12), purple, [0, 0.04, 0], [0, 0, 0], [1, 1, 1], 0.045);
  part(hat, new THREE.ConeGeometry(0.36, 0.87, 9), purple, [0, 0.48, 0], [0.06, 0, -0.06], [1, 1, 1], 0.055);
  const hatTip = part(hat, new THREE.ConeGeometry(0.13, 0.56, 8), purple, [0.17, 0.9, 0], [0, 0, -0.7], [1, 1, 1], 0.05);
  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 5, 22), neonPinkMat);
  hatBand.position.y = 0.16;
  hatBand.rotation.x = Math.PI / 2;
  hat.add(hatBand);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.035), neonAmberMat);
  buckle.position.set(0.0, 0.18, -0.35);
  hat.add(buckle);
  const hatStar = glowSprite(0xff3fae, 1.3, 0.18);
  hatStar.position.set(0.03, 0.4, 0.05);
  hat.add(hatStar);

  // Cape and glowing bat emblem on the back.
  const cape = shapeMesh([[-0.38, 0.42], [0.38, 0.42], [0.31, -0.34], [0, -0.64], [-0.31, -0.34]], new THREE.MeshToonMaterial({
    color: 0x42145f, gradientMap: shadeRamp, side: THREE.DoubleSide,
  }));
  cape.position.set(0, 1.02, 0.25);
  cape.rotation.x = -0.06;
  visual.add(cape);
  const capeEdge = shapeMesh([[-0.4, 0.44], [0.4, 0.44], [0.33, -0.36], [0, -0.68], [-0.33, -0.36]], new THREE.MeshBasicMaterial({
    color: 0xff3fae, side: THREE.DoubleSide, transparent: true, opacity: 0.26,
  }));
  capeEdge.position.set(0, 1.02, 0.258);
  visual.add(capeEdge);
  const batShape = shapeMesh([
    [0, 0.15], [0.12, 0.06], [0.35, 0.22], [0.29, -0.06], [0.13, -0.07],
    [0, -0.26], [-0.13, -0.07], [-0.29, -0.06], [-0.35, 0.22], [-0.12, 0.06],
  ], new THREE.MeshBasicMaterial({ color: 0x5af7ff, side: THREE.DoubleSide, toneMapped: false }));
  batShape.position.set(0, 1.18, 0.29);
  batShape.scale.setScalar(0.95);
  visual.add(batShape);
  const batGlow = glowSprite(0x45f5ff, 1.55, 0.34);
  batGlow.position.set(0, 1.18, 0.34);
  visual.add(batGlow);

  // Little pumpkin charm swinging from a belt loop.
  const charm = new THREE.Group();
  charm.position.set(0.32, 1.06, 0.16);
  visual.add(charm);
  part(charm, new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), neonAmberMat, [0, -0.1, 0]);
  part(charm, new THREE.SphereGeometry(0.075, 6, 5), orange, [0, -0.25, 0], [0, 0, 0], [1, 0.8, 1], 0.08);
  const charmGlow = glowSprite(0xff9c2f, 0.55, 0.35);
  charmGlow.position.set(0, -0.25, 0.04);
  charm.add(charmGlow);

  // Shield bubble and magnet ring, hidden until a power-up is active.
  const shield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18, 1),
    new THREE.MeshBasicMaterial({
      color: 0xb073ff, wireframe: true, transparent: true, opacity: 0.52,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  shield.position.y = 1.05;
  shield.scale.set(0.95, 1.15, 0.95);
  shield.visible = false;
  root.add(shield);
  const shieldCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 2),
    new THREE.MeshBasicMaterial({
      color: 0x6c35ff, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  shieldCore.position.y = 1.05;
  shieldCore.scale.set(0.95, 1.15, 0.95);
  shieldCore.visible = false;
  root.add(shieldCore);

  const magnetRing = new THREE.Group();
  magnetRing.visible = false;
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.78 + i * 0.22, 0.018, 4, 32),
      new THREE.MeshBasicMaterial({ color: i ? 0xff8b24 : 0x45f5ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08 + i * 0.06;
    magnetRing.add(ring);
  }
  root.add(magnetRing);

  const playerLight = new THREE.PointLight(0xff963f, 2.2, 5.5, 1.8);
  playerLight.position.set(0, 1.3, 0.8);
  root.add(playerLight);

  // Shadow stays on the ground even while jumping.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.1),
    new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, opacity: 0.75 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  scene.add(shadow);

  return {
    root, visual, head, armL, armR, legL, legR, cape, hat, hatTip, charm,
    shield, shieldCore, magnetRing, playerLight, shadow, capeEdge, batShape, batGlow, faceGlow,
  };
}

const player = buildPlayer();

/* -------------------------------------------------------------------------- */
/*  Spooky things that want to ruin your night                                 */
/* -------------------------------------------------------------------------- */

function makeZombie() {
  const g = new THREE.Group();
  const skin = toon(0x7da365, { flatShading: true });
  const coat = toon(0x243c3a, { flatShading: true });
  const dark = toon(0x11131c, { flatShading: true });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });
  part(g, new THREE.CylinderGeometry(0.29, 0.42, 1.05, 6), coat, [0, 1.02, 0], [0, 0, 0], [1, 1, 1], 0.05);
  part(g, new THREE.CylinderGeometry(0.31, 0.39, 0.18, 6), dark, [0, 1.51, 0]);
  part(g, new THREE.SphereGeometry(0.3, 8, 6), skin, [0, 1.78, 0.02], [0.08, 0, 0], [1, 1.08, 1], 0.05);
  // Hair tufts.
  part(g, new THREE.ConeGeometry(0.08, 0.25, 4), dark, [-0.12, 2.02, 0], [0, 0, 0.3]);
  part(g, new THREE.ConeGeometry(0.07, 0.2, 4), dark, [0.1, 2.03, 0.02], [0, 0, -0.2]);
  part(g, new THREE.ConeGeometry(0.06, 0.18, 4), dark, [0.0, 2.05, -0.1], [0.1, 0, 0]);
  // Eyes and mouth.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 4), red);
    eye.scale.set(1.1, 0.8, 0.5);
    eye.position.set(side * 0.105, 1.83, 0.285);
    g.add(eye);
    const eg = glowSprite(0xff2f24, 0.42, 0.4);
    eg.position.copy(eye.position);
    g.add(eg);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 0.025), new THREE.MeshBasicMaterial({ color: 0x16050b }));
  mouth.position.set(0, 1.66, 0.294);
  g.add(mouth);
  // Reaching arms.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.31, 1.41, 0.02);
    arm.rotation.x = -Math.PI / 2 + 0.25;
    arm.rotation.z = side * 0.1;
    g.add(arm);
    part(arm, new THREE.CylinderGeometry(0.07, 0.085, 0.65, 5), coat, [0, 0.35, 0], [0, 0, 0], [1, 1, 1], 0.05);
    part(arm, new THREE.SphereGeometry(0.085, 6, 5), skin, [0, 0.72, 0], [0, 0, 0], [1, 1, 1], 0.05);
    part(arm, new THREE.CylinderGeometry(0.015, 0.025, 0.16, 4), skin, [0.045, 0.79, 0.05], [0.2, 0, 0.5]);
    arm.userData.baseRot = arm.rotation.x;
  }
  // Legs.
  for (const side of [-1, 1]) {
    part(g, new THREE.CylinderGeometry(0.09, 0.1, 0.52, 5), dark, [side * 0.16, 0.35, 0], [0, 0, side * 0.05], [1, 1, 1], 0.05);
    part(g, new THREE.BoxGeometry(0.18, 0.12, 0.3), dark, [side * 0.16, 0.09, -0.05], [0, 0, 0], [1, 1, 1], 0.06);
  }
  const glow = glowSprite(0x6bff9a, 1.9, 0.13);
  glow.position.y = 1.2;
  g.add(glow);
  return g;
}

function makeGhost() {
  const g = new THREE.Group();
  const sheet = toon(0xdff8ff, { flatShading: true, emissive: 0x123844, emissiveIntensity: 0.35 });
  const profile = [];
  const radii = [
    [0.05, -0.62], [0.26, -0.64], [0.48, -0.48], [0.58, -0.15],
    [0.56, 0.2], [0.44, 0.48], [0.26, 0.64], [0.05, 0.68],
  ];
  for (const [r, y] of radii) profile.push(new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 9), sheet);
  part(g, new THREE.LatheGeometry(profile, 9), sheet, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.035);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x9ef7ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.33, 5), sheet);
    tail.position.set(Math.cos(a) * 0.39, -0.67, Math.sin(a) * 0.39);
    tail.rotation.x = Math.PI;
    tail.rotation.z = Math.cos(a) * 0.3;
    g.add(tail);
  }
  // Face
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x07242b, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 4), eyeMat);
    eye.scale.set(0.85, 1.35, 0.35);
    eye.position.set(side * 0.16, 0.19, 0.5);
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), eyeMat);
  mouth.scale.set(0.7, 1.4, 0.3);
  mouth.position.set(0, -0.04, 0.53);
  g.add(mouth);
  // Stubby arms.
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 6), sheet);
    arm.position.set(side * 0.56, -0.1, 0.05);
    arm.rotation.z = side * 0.6;
    g.add(arm);
  }
  const aura = glowSprite(0x62efff, 3.4, 0.27);
  g.add(aura);
  g.position.y = 1.62;
  return g;
}

function makeBatWing(side) {
  const wing = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(side * 0.22, 0.17);
  shape.lineTo(side * 0.52, 0.11);
  shape.lineTo(side * 0.39, -0.05);
  shape.lineTo(side * 0.55, -0.18);
  shape.lineTo(side * 0.2, -0.14);
  shape.lineTo(side * 0.04, -0.2);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({
    color: 0x3a1858, gradientMap: shadeRamp, side: THREE.DoubleSide,
  }));
  wing.add(mesh);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape)),
    new THREE.LineBasicMaterial({ color: 0xff3fae, transparent: true, opacity: 0.8 })
  );
  edge.position.z = 0.002;
  wing.add(edge);
  return wing;
}

function makeBat() {
  const g = new THREE.Group();
  const bodyMat = toon(0x1d0e2e, { flatShading: true });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3fae, toneMapped: false });
  const bats = [];
  const anchors = [[0, 0, 0, 1], [-0.38, 0.22, 0.16, 0.55], [0.4, -0.1, 0.22, 0.45]];
  for (const [x, y, z, s] of anchors) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    b.scale.setScalar(s);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), bodyMat);
    body.scale.set(0.8, 1.1, 0.9);
    b.add(body);
    const earGeo = new THREE.ConeGeometry(0.06, 0.16, 4);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(side * 0.09, 0.2, 0);
      ear.rotation.z = side * 0.25;
      b.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 5, 4), red);
      eye.position.set(side * 0.065, 0.045, 0.15);
      b.add(eye);
    }
    const left = makeBatWing(-1);
    const right = makeBatWing(1);
    left.position.set(-0.08, 0.02, 0);
    right.position.set(0.08, 0.02, 0);
    b.add(left, right);
    b.userData.leftWing = left;
    b.userData.rightWing = right;
    b.userData.phase = rand(0, Math.PI * 2);
    g.add(b);
    bats.push(b);
  }
  g.userData.bats = bats;
  const aura = glowSprite(0xff3fae, 2.5, 0.17);
  g.add(aura);
  g.position.y = 1.72;
  return g;
}

function makeBigPumpkin() {
  const g = new THREE.Group();
  const skin = toon(0xff7614, { flatShading: true });
  const darkSkin = toon(0xbc480b, { flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.69, 10, 7), skin);
  body.scale.set(1, 0.72, 1);
  body.position.y = 0.54;
  g.add(body);
  for (const side of [-1, 1]) {
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), darkSkin);
    ridge.scale.set(0.42, 0.75, 1);
    ridge.position.set(side * 0.37, 0.54, 0);
    g.add(ridge);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.26, 5), toon(0x4e7b30, { flatShading: true }));
  stem.position.set(0.03, 1.0, 0);
  stem.rotation.z = 0.22;
  g.add(stem);
  const face = new THREE.Group();
  face.position.y = 0.56;
  pumpkinFace(face, 1.35, 0.62, 0xffe35d);
  g.add(face);
  const glow = glowSprite(0xff8b24, 2.6, 0.3);
  glow.position.y = 0.65;
  g.add(glow);
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.8, 7, 4), toon(0x211027));
  base.scale.set(1.15, 0.16, 0.9);
  base.position.y = 0.02;
  g.add(base);
  return g;
}

function makeGraveObstacle() {
  const g = makeTombstone();
  g.scale.setScalar(1.15);
  return g;
}

/* -------------------------------------------------------------------------- */
/*  Collectibles                                                               */
/* -------------------------------------------------------------------------- */

function makeCandyCorn() {
  const g = new THREE.Group();
  const white = toon(0xf7edda);
  const orange = toon(0xff8a1e);
  const yellow = toon(0xffd23f);
  part(g, new THREE.CylinderGeometry(0.2, 0.23, 0.17, 7), white, [0, -0.22, 0], [0, 0, 0], [1, 1, 1], 0.07);
  part(g, new THREE.CylinderGeometry(0.14, 0.2, 0.25, 7), orange, [0, -0.01, 0], [0, 0, 0], [1, 1, 1], 0.07);
  part(g, new THREE.ConeGeometry(0.14, 0.28, 7), yellow, [0, 0.255, 0], [0, 0, 0], [1, 1, 1], 0.07);
  const halo = glowSprite(0xffa12e, 1.05, 0.42);
  halo.position.y = 0.02;
  g.add(halo);
  g.userData.spin = new THREE.Group();
  return g;
}

function makePotion() {
  const g = new THREE.Group();
  const glass = new THREE.MeshToonMaterial({ color: 0xb47bff, gradientMap: shadeRamp, transparent: true, opacity: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xcf9bff, toneMapped: false });
  part(g, new THREE.SphereGeometry(0.26, 8, 6), glass, [0, -0.08, 0], [0, 0, 0], [1, 1.05, 1], 0.05);
  part(g, new THREE.CylinderGeometry(0.1, 0.12, 0.19, 7), glass, [0, 0.23, 0], [0, 0, 0], [1, 1, 1], 0.05);
  part(g, new THREE.CylinderGeometry(0.12, 0.12, 0.055, 7), toon(0x7b4a29), [0, 0.35, 0], [0, 0, 0], [1, 1, 1], 0.07);
  part(g, new THREE.SphereGeometry(0.15, 6, 5), glowMat, [0, -0.08, 0]);
  const halo = glowSprite(0x9d5cff, 2.3, 0.5);
  g.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.013, 4, 28), new THREE.MeshBasicMaterial({ color: 0xcf9bff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.34;
  g.add(ring);
  return g;
}

function makeLantern() {
  const g = new THREE.Group();
  const metal = toon(0x2b1a2d, { flatShading: true });
  part(g, new THREE.CylinderGeometry(0.23, 0.28, 0.46, 6), metal, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.06);
  part(g, new THREE.ConeGeometry(0.31, 0.18, 6), metal, [0, 0.31, 0]);
  part(g, new THREE.ConeGeometry(0.31, 0.15, 6), metal, [0, -0.3, 0], [Math.PI, 0, 0]);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffb13d, toneMapped: false }));
  g.add(core);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 4, 16, Math.PI), metal);
  handle.position.y = 0.42;
  g.add(handle);
  const halo = glowSprite(0xff8b24, 2.6, 0.6);
  g.add(halo);
  return g;
}

function makeBroom() {
  const g = new THREE.Group();
  const stick = toon(0xa4713c);
  const bristle = toon(0xff9b2b, { flatShading: true });
  part(g, new THREE.CylinderGeometry(0.037, 0.05, 1.05, 5), stick, [0, 0.16, 0], [0, 0, 0.74], [1, 1, 1], 0.06);
  part(g, new THREE.ConeGeometry(0.27, 0.55, 7), bristle, [-0.46, -0.35, 0], [0, 0, 0.78], [1, 1, 1], 0.055);
  part(g, new THREE.CylinderGeometry(0.12, 0.15, 0.17, 6), new THREE.MeshBasicMaterial({ color: 0x45f5ff, toneMapped: false }), [-0.34, -0.12, 0], [0, 0, 0.74]);
  const halo = glowSprite(0x45f5ff, 2.5, 0.48);
  g.add(halo);
  return g;
}

function makeClock() {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.045, 5, 24), toon(0xd69a32, { flatShading: true }));
  g.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.29, 24), new THREE.MeshBasicMaterial({ color: 0x5bffb0, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  face.position.z = 0.005;
  g.add(face);
  const handMat = new THREE.MeshBasicMaterial({ color: 0x063b26 });
  const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.23, 0.025), handMat);
  hand1.position.set(0, 0.09, 0.03);
  g.add(hand1);
  const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.025), handMat);
  hand2.position.set(0.07, 0, 0.03);
  g.add(hand2);
  const halo = glowSprite(0x5bffb0, 2.2, 0.5);
  g.add(halo);
  g.rotation.x = 0.15;
  return g;
}

/* -------------------------------------------------------------------------- */
/*  Arcade particles                                                           */
/* -------------------------------------------------------------------------- */

class ParticleField {
  constructor(max = 320) {
    this.max = max;
    this.cursor = 0;
    this.particles = new Array(max).fill(null).map(() => ({ life: 0, maxLife: 1 }));
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (140.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.02, d);
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(position, color, count = 8, options = {}) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const speed = options.speed ?? 3.5;
    const life = options.life ?? 0.65;
    const size = options.size ?? 0.6;
    const gravity = options.gravity ?? 4;
    const spread = options.spread ?? 0.25;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.particles[i];
      p.life = p.maxLife = life * rand(0.65, 1.3);
      p.x = position.x + rand(-spread, spread);
      p.y = position.y + rand(-spread, spread);
      p.z = position.z + rand(-spread, spread);
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.15, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.35, 1));
      if (options.dir) dir.add(options.dir);
      p.vx = dir.x;
      p.vy = dir.y;
      p.vz = dir.z;
      p.gravity = gravity;
      p.size = size * rand(0.55, 1.35);
      p.baseAlpha = options.alpha ?? 0.95;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.colors[i * 3] = p.r;
      this.colors[i * 3 + 1] = p.g;
      this.colors[i * 3 + 2] = p.b;
      this.sizes[i] = p.size;
      this.alphas[i] = p.baseAlpha;
    }
    this.geometry.attributes.aColor.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.vx *= 1 - 1.8 * dt;
      p.vz *= 1 - 1.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.life / p.maxLife;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.sizes[i] = p.size * (0.5 + k * 0.7);
      this.alphas[i] = p.baseAlpha * Math.min(1, k * 2.2);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

const fx = new ParticleField(340);

/* -------------------------------------------------------------------------- */
/*  Object pools                                                               */
/* -------------------------------------------------------------------------- */

const pools = {
  zombie: [], ghost: [], bat: [], tomb: [], pumpkin: [],
  candy: [], potion: [], lantern: [], broom: [], clock: [],
};
const obstacles = [];
const candyPickups = [];
const powerupPickups = [];

function acquire(type, factory) {
  let obj = pools[type].pop();
  if (!obj) {
    obj = factory();
    scene.add(obj);
  }
  obj.visible = true;
  return obj;
}

function release(type, obj) {
  obj.visible = false;
  pools[type].push(obj);
}

const OBSTACLE_DEFS = {
  zombie: { pool: 'zombie', build: makeZombie, y: 0, rule: 'block', radius: 0.72, depth: 0.7, hue: 0x6bff9a },
  ghost: { pool: 'ghost', build: makeGhost, y: 1.62, rule: 'high', radius: 0.78, depth: 0.7, hue: 0x62efff },
  bat: { pool: 'bat', build: makeBat, y: 1.72, rule: 'high', radius: 0.8, depth: 0.65, hue: 0xff3fae },
  tomb: { pool: 'tomb', build: makeGraveObstacle, y: 0, rule: 'low', radius: 0.74, depth: 0.55, hue: 0xff3fae },
  pumpkin: { pool: 'pumpkin', build: makeBigPumpkin, y: 0, rule: 'low', radius: 0.76, depth: 0.62, hue: 0xff8b24 },
};
const BLOCKER_TYPES = ['zombie', 'zombie', 'ghost'];
const LOW_TYPES = ['tomb', 'pumpkin'];
const HIGH_TYPES = ['bat', 'ghost'];

function spawnObstacle(type, lane, z, opts = {}) {
  const def = OBSTACLE_DEFS[type];
  const obj = acquire(def.pool, def.build);
  obj.position.set(LANES[lane], def.y, z);
  obj.rotation.set(0, opts.rotation ?? rand(-0.04, 0.04), 0);
  const scale = opts.scale ?? 1;
  obj.scale.setScalar(type === 'tomb' ? scale * 1.15 : scale);
  const record = {
    obj, type, lane, x: LANES[lane], z, rule: def.rule,
    radius: def.radius, depth: def.depth, resolved: false, phase: rand(0, Math.PI * 2),
    baseY: def.y, smash: false,
  };
  obstacles.push(record);
  return record;
}

function spawnCandy(lane, z, y = 1.0) {
  const obj = acquire('candy', makeCandyCorn);
  obj.position.set(LANES[lane], y, z);
  obj.rotation.set(0, rand(0, Math.PI), 0);
  obj.scale.setScalar(1);
  const record = { obj, lane, x: LANES[lane], y, z, baseY: y, phase: rand(0, Math.PI * 2), pulled: false };
  candyPickups.push(record);
  return record;
}

const POWERUP_TYPES = {
  potion: { name: 'SHIELD BREW', key: 'shield', color: '#c79bff', power: 'shield' },
  lantern: { name: 'SOUL MAGNET', key: 'magnet', color: '#ff9d3c', power: 'magnet' },
  broom: { name: 'BROOM RUSH', key: 'boost', color: '#47f5ff', power: 'boost' },
  clock: { name: 'TIME HEX', key: 'slow', color: '#5bffb0', power: 'slow' },
};

function spawnPowerup(type, lane, z) {
  const obj = acquire(type, type === 'potion' ? makePotion : type === 'lantern' ? makeLantern : type === 'broom' ? makeBroom : makeClock);
  obj.position.set(LANES[lane], 1.2, z);
  obj.rotation.set(0, rand(0, Math.PI * 2), 0);
  obj.scale.setScalar(1);
  const record = { obj, type, lane, x: LANES[lane], z, phase: rand(0, Math.PI * 2), baseY: 1.2 };
  powerupPickups.push(record);
  return record;
}

function clearPickups() {
  for (const rec of obstacles) {
    if (!rec.smash) release(rec.type, rec.obj);
  }
  for (const rec of candyPickups) release('candy', rec.obj);
  for (const rec of powerupPickups) release(rec.type, rec.obj);
  obstacles.length = 0;
  candyPickups.length = 0;
  powerupPickups.length = 0;
}

/* -------------------------------------------------------------------------- */
/*  Candy trails and obstacle patterns                                         */
/* -------------------------------------------------------------------------- */

function spawnCandyTrail(lane, startZ, count = 5, { arc = 0, spacing = 2.05, y = 1.0 } = {}) {
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const lift = arc * Math.sin(t * Math.PI);
    spawnCandy(lane, startZ - i * spacing, y + lift);
  }
}

function spawnArcCandy(lane, startZ, count = 5) {
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1);
    spawnCandy(lane, startZ - i * 1.8, 1.0 + Math.sin(t * Math.PI) * 1.05);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let patternIndex = 0;
let powerupEvery = 0;

function spawnPattern() {
  const level = Math.min(7, 1 + Math.floor(distance / 160));
  const z = SPAWN_Z;
  const lanes = shuffle([0, 1, 2]);
  const roll = Math.random();
  let usedPowerup = false;

  // A burst of decoy candy sometimes leads into the real pattern.
  if (Math.random() < 0.18) {
    spawnCandyTrail(pick([0, 1, 2]), z + 22 + rand(2, 7), 3, { arc: 0 });
  }

  if (roll < 0.18) {
    // Lane-by-lane slalom: one blocker, then another, then one more.
    const seq = shuffle([0, 1, 2]);
    for (let k = 0; k < (level > 2 ? 3 : 2); k++) {
      const type = pick(BLOCKER_TYPES);
      spawnObstacle(type, seq[k], z - k * (12 + level * 0.6));
      spawnCandyTrail(seq[(k + 1) % 3], z - k * (12 + level * 0.6) - 4, 3, { arc: k === 0 ? 0.3 : 0 });
    }
    spawnCandyTrail(seq[0], z - 6, 2);
  } else if (roll < 0.34) {
    // Low roadblock across all three lanes — jump!
    for (const lane of [0, 1, 2]) spawnObstacle(pick(LOW_TYPES), lane, z);
    spawnArcCandy(1, z + 7, 6);
    if (Math.random() < 0.4) spawnCandyTrail(pick([0, 2]), z + 12, 3);
  } else if (roll < 0.48) {
    // A shrieking high row — slide!
    for (const lane of [0, 1, 2]) spawnObstacle(pick(HIGH_TYPES), lane, z);
    spawnCandyTrail(1, z + 5, 4, { y: 0.55 });
    if (Math.random() < 0.45) spawnCandyTrail(pick([0, 2]), z + 13, 3);
  } else if (roll < 0.68) {
    // Two-lane split, with a clean candy path through the gap.
    const blocked = lanes.slice(0, 2);
    for (const lane of blocked) {
      const type = pick(level > 2 ? ['zombie', 'tomb', 'pumpkin', 'ghost'] : ['zombie', 'tomb']);
      spawnObstacle(type, lane, z + rand(-0.4, 0.4));
    }
    const safe = lanes[2];
    spawnCandyTrail(safe, z + 9, 5, { arc: 0 });
    if (Math.random() < 0.3) spawnPowerup(pick(Object.keys(POWERUP_TYPES)), safe, z + 1.4);
  } else if (roll < 0.82) {
    // A single hulking monster and a tempting detour.
    const lane = lanes[0];
    spawnObstacle(pick(['zombie', 'pumpkin']), lane, z);
    const safe = pick([0, 1, 2].filter((l) => l !== lane));
    spawnCandyTrail(safe, z + 8, 7, { arc: 0.25 });
    if (Math.random() < 0.38) {
      spawnObstacle(pick(HIGH_TYPES), safe, z - 14);
      const safe2 = pick([0, 1, 2].filter((l) => l !== safe && l !== lane));
      spawnCandyTrail(safe2, z - 8, 3);
    }
  } else {
    // Twin low hurdles, one lane left open.
    const blocked = lanes.slice(0, 2);
    for (const lane of blocked) spawnObstacle(pick(LOW_TYPES), lane, z + rand(-0.5, 0.5));
    const safe = lanes[2];
    spawnCandyTrail(safe, z + 8, 4);
    spawnArcCandy(pick(blocked), z + 6, 4);
  }

  // Guaranteed power-up rhythm, always placed in a lane that just had candy.
  powerupEvery++;
  if (!usedPowerup && (powerupEvery >= 3 || distance > 340 && powerupEvery >= 2)) {
    const safeLane = lanes[2];
    const powerupType = pick(Object.keys(POWERUP_TYPES));
    spawnPowerup(powerupType, safeLane, z + 24 + rand(0, 3));
    powerupEvery = 0;
  }
  patternIndex++;
}

/* -------------------------------------------------------------------------- */
/*  Procedural spooky synth soundtrack and SFX                                 */
/* -------------------------------------------------------------------------- */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.muted = localStorage.getItem('neonHollowMuted') === '1';
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.stepDur = 60 / 98 / 2;
    this.bpm = 98;
    document.body.classList.toggle('muted', this.muted);
    ui.mute.setAttribute('aria-pressed', String(this.muted));
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.17;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.45;
      this.sfxGain.connect(this.master);
      this.noiseBuffer = this.makeNoiseBuffer();
    } catch (e) {
      this.ctx = null;
    }
  }

  makeNoiseBuffer() {
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('neonHollowMuted', muted ? '1' : '0');
    document.body.classList.toggle('muted', muted);
    ui.mute.setAttribute('aria-pressed', String(muted));
    if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.85, this.ctx.currentTime + 0.08);
    }
  }

  startMusic() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.musicOn = true;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
  }

  stopMusic() { this.musicOn = false; }

  update() {
    if (!this.ctx || !this.musicOn) return;
    const ahead = this.ctx.currentTime + 0.25;
    let guard = 0;
    while (this.nextNoteTime < ahead && guard++ < 16) {
      this.scheduleStep(this.musicStep, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  tone(freq, time, dur, type, volume, destination, filterFreq = 0, endFreq = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + dur);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    let tail = gain;
    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      gain.connect(filter);
      tail = filter;
    }
    tail.connect(destination);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + dur + 0.04);
  }

  noise(time, dur, volume, destination, highpass = 0, lowpass = 0) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    let tail = gain;
    if (highpass) {
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = highpass;
      tail.connect(hp);
      tail = hp;
    }
    if (lowpass) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      tail.connect(lp);
      tail = lp;
    }
    tail.connect(destination);
    src.connect(gain);
    src.start(time);
    src.stop(time + dur + 0.03);
  }

  scheduleStep(step, time) {
    const bar = Math.floor(step / 8) % 4;
    const roots = [55, 43.65, 65.41, 49];
    const root = roots[bar];
    const inBar = step % 8;

    // Low, brooding bass pulse.
    if (inBar % 2 === 0) {
      const octave = inBar === 6 ? 1.5 : 1;
      this.tone(root * octave, time, 0.22, 'triangle', 0.085, this.musicGain, 540);
      this.tone(root * 0.5, time, 0.3, 'sine', 0.06, this.musicGain);
      this.noise(time, 0.07, 0.011, this.musicGain, 100, 280);
    }
    // Kick / heartbeat.
    if (inBar === 0 || inBar === 4) this.tone(92, time, 0.16, 'sine', 0.12, this.musicGain, 0, 42);
    // Tick hats.
    if (inBar % 2 === 1) this.noise(time, 0.035, 0.016, this.musicGain, 5200);
    // Eerie arpeggio, D-minor-ish bells.
    const arpSteps = { 0: 1, 2: 1.5, 3: 1.78, 5: 2, 6: 2.38, 7: 2.67 };
    if (arpSteps[inBar] !== undefined && (bar + inBar) % 3 !== 2) {
      const melody = root * arpSteps[inBar] * 2;
      this.tone(melody, time + 0.01, 0.42, 'sine', 0.034, this.musicGain, 2200);
      this.tone(melody * 2.01, time + 0.01, 0.2, 'triangle', 0.012, this.musicGain, 3500);
    }
    // Slow pad on every bar.
    if (inBar === 0) {
      const pad = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      pad.gain.setValueAtTime(0.0001, time);
      pad.gain.linearRampToValueAtTime(0.032, time + 0.9);
      pad.gain.linearRampToValueAtTime(0.0001, time + this.stepDur * 8.5);
      filter.type = 'lowpass';
      filter.frequency.value = 680;
      filter.Q.value = 2;
      pad.connect(filter);
      filter.connect(this.musicGain);
      for (const mult of [1, 1.5]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = root * mult;
        osc.detune.value = mult === 1 ? -7 : 6;
        osc.connect(pad);
        osc.start(time);
        osc.stop(time + this.stepDur * 8.6);
      }
    }
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'jump':
        this.tone(280, t, 0.2, 'sine', 0.2, this.sfxGain, 0, 720);
        this.noise(t, 0.08, 0.03, this.sfxGain, 1800);
        break;
      case 'land':
        this.tone(130, t, 0.13, 'sine', 0.16, this.sfxGain, 0, 62);
        this.noise(t, 0.06, 0.04, this.sfxGain, 200, 700);
        break;
      case 'lane':
        this.tone(480, t, 0.095, 'triangle', 0.09, this.sfxGain, 1800, 780);
        this.noise(t, 0.055, 0.028, this.sfxGain, 1400);
        break;
      case 'coin':
        this.tone(1320, t, 0.09, 'sine', 0.13, this.sfxGain);
        this.tone(1760, t + 0.055, 0.12, 'sine', 0.1, this.sfxGain);
        this.tone(2640, t + 0.11, 0.1, 'sine', 0.045, this.sfxGain);
        break;
      case 'combo':
        this.tone(880, t, 0.12, 'sine', 0.08, this.sfxGain);
        this.tone(1320, t + 0.07, 0.15, 'sine', 0.06, this.sfxGain);
        break;
      case 'power':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone(f, t + i * 0.075, 0.25, 'triangle', 0.11, this.sfxGain, 3000);
        });
        break;
      case 'shield':
        this.tone(760, t, 0.4, 'sine', 0.12, this.sfxGain, 0, 1240);
        this.noise(t, 0.28, 0.03, this.sfxGain, 2200);
        break;
      case 'smash':
        this.noise(t, 0.22, 0.12, this.sfxGain, 100, 1600);
        this.tone(160, t, 0.2, 'square', 0.08, this.sfxGain, 0, 48);
        break;
      case 'hit':
        this.tone(180, t, 0.5, 'sawtooth', 0.18, this.sfxGain, 0, 36);
        this.tone(92, t + 0.03, 0.6, 'square', 0.13, this.sfxGain, 0, 30);
        this.noise(t, 0.45, 0.16, this.sfxGain, 80, 1800);
        break;
      case 'start':
        this.tone(196, t, 0.24, 'triangle', 0.11, this.sfxGain, 0, 392);
        this.tone(392, t + 0.12, 0.35, 'sine', 0.09, this.sfxGain, 0, 784);
        break;
      default:
        break;
    }
  }
}

const audio = new AudioEngine();

/* -------------------------------------------------------------------------- */
/*  Game state                                                                 */
/* -------------------------------------------------------------------------- */

let state = 'menu';
let time = 0;
let worldSpeed = 2.4;
let runDistance = 0;
let score = 0;
let candyCount = 0;
let combo = 0;
let comboTimer = 0;
let comboMult = 1;
let dodged = 0;
let lane = 1;
let playerX = 0;
let playerY = 0;
let vy = 0;
let slideTimer = 0;
let invuln = 0;
let runPhase = 0;
let trailTimer = 0;
let nextPatternDistance = 60;
let deadTimer = 0;
let cameraShake = 0;
let lastScoreShown = -1;
let lastDistanceShown = -1;
let lastCandyShown = -1;
let tutorialTimer = null;
let toastTimer = null;
let overTimer = null;
let isNewBest = false;
const activeChips = {};

const POWER_DURATION = { shield: 12, magnet: 9.5, boost: 5.5, slow: 7 };
const POWER_INFO = {
  shield: { label: 'SHIELD', color: '#c79bff' },
  magnet: { label: 'MAGNET', color: '#ff9d3c' },
  boost: { label: 'RUSH', color: '#47f5ff' },
  slow: { label: 'TIME HEX', color: '#5bffb0' },
};
const power = { shield: 0, magnet: 0, boost: 0, slow: 0 };

function resetRun() {
  if (overTimer) { clearTimeout(overTimer); overTimer = null; }
  clearPickups();
  runDistance = 0;
  score = 0;
  candyCount = 0;
  dodged = 0;
  combo = 0;
  comboTimer = 0;
  comboMult = 1;
  lane = 1;
  playerX = 0;
  playerY = 0;
  vy = 0;
  slideTimer = 0;
  invuln = 0;
  runPhase = 0;
  trailTimer = 0;
  deadTimer = 0;
  worldSpeed = 7.5;
  nextPatternDistance = 58;
  power.shield = power.magnet = power.boost = power.slow = 0;
  activeChipsClear();
  player.root.position.set(0, 0, 0);
  player.visual.position.set(0, 0, 0);
  player.visual.rotation.set(0, 0, 0);
  player.visual.scale.set(1, 1, 1);
  player.visual.visible = true;
  player.shield.visible = false;
  player.shieldCore.visible = false;
  player.magnetRing.visible = false;
  player.playerLight.color.setHex(0xff8b24);
  player.playerLight.intensity = 8;
  cameraShake = 0;
  lastScoreShown = -1;
  lastDistanceShown = -1;
  lastCandyShown = -1;
  ui.combo.classList.add('hidden');
  ui.toast.classList.remove('show');
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  updateHud(true);
}

function activeChipsClear() {
  ui.powerups.innerHTML = '';
  for (const key of Object.keys(activeChips)) delete activeChips[key];
}

/* -------------------------------------------------------------------------- */
/*  HUD helpers                                                                */
/* -------------------------------------------------------------------------- */

function updateHud(force = false) {
  const shownScore = Math.floor(score);
  if (force || shownScore !== lastScoreShown) {
    ui.score.textContent = shownScore.toLocaleString();
    lastScoreShown = shownScore;
  }
  const shownDistance = Math.floor(runDistance);
  if (force || shownDistance !== lastDistanceShown) {
    ui.distance.textContent = `${shownDistance} m`;
    lastDistanceShown = shownDistance;
  }
  if (force || candyCount !== lastCandyShown) {
    ui.candy.textContent = candyCount.toLocaleString();
    lastCandyShown = candyCount;
  }
  if (comboMult > 1) {
    ui.combo.classList.remove('hidden');
    ui.comboX.textContent = `x${comboMult}`;
  } else {
    ui.combo.classList.add('hidden');
  }
  updatePowerupChips();
}

function updatePowerupChips() {
  for (const key of Object.keys(POWER_INFO)) {
    const remaining = power[key];
    let chip = activeChips[key];
    if (remaining > 0) {
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'power-chip';
        chip.style.color = POWER_INFO[key].color;
        chip.innerHTML = `<span class="dot"></span><span>${POWER_INFO[key].label}</span><i class="bar"></i>`;
        ui.powerups.appendChild(chip);
        activeChips[key] = chip;
      }
      const bar = chip.querySelector('.bar');
      bar.style.width = `${Math.max(0, Math.min(1, remaining / POWER_DURATION[key])) * 100}%`;
    } else if (chip) {
      chip.remove();
      delete activeChips[key];
    }
  }
}

function showToast(title, subtitle = '', duration = 1500) {
  ui.toast.innerHTML = `${title}${subtitle ? `<small>${subtitle}</small>` : ''}`;
  ui.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast.classList.remove('show');
    toastTimer = null;
  }, duration);
}

function showTutorial() {
  if (IS_TOUCH) {
    ui.tutorial.innerHTML = '<span class="tutorial-key">SWIPE</span> to dodge <i></i><span class="tutorial-key">UP</span> jump <i></i><span class="tutorial-key">DOWN</span> slide';
  } else {
    ui.tutorial.innerHTML = '<span class="tutorial-key">← →</span> dodge <i></i><span class="tutorial-key">↑</span> jump <i></i><span class="tutorial-key">↓</span> slide';
  }
  ui.tutorial.style.opacity = '';
  ui.tutorial.classList.remove('hidden');
  if (tutorialTimer) clearTimeout(tutorialTimer);
  tutorialTimer = setTimeout(() => {
    ui.tutorial.classList.add('hidden');
    tutorialTimer = null;
  }, 6500);
}

/* -------------------------------------------------------------------------- */
/*  Player motion                                                              */
/* -------------------------------------------------------------------------- */

function moveLane(dir) {
  if (state !== 'playing') return;
  const next = clamp(lane + dir, 0, 2);
  if (next !== lane) {
    lane = next;
    audio.sfx('lane');
    fx.spawn(new THREE.Vector3(playerX + dir * 0.35, playerY + 0.4, 0.1), 0xff3fae, 4, {
      speed: 2, life: 0.38, size: 0.32, gravity: 0.4, spread: 0.15,
    });
  }
}

function jump() {
  if (state !== 'playing' || playerY > 0.04) return;
  vy = 9.35;
  playerY = 0.02;
  slideTimer = 0;
  audio.sfx('jump');
  fx.spawn(new THREE.Vector3(playerX, 0.18, 0.1), 0xffd23f, 9, {
    speed: 2.1, life: 0.46, size: 0.45, gravity: 2.2, spread: 0.24,
  });
}

function slide() {
  if (state !== 'playing') return;
  if (playerY > 0.04) {
    vy = Math.min(vy, -13.5);
  }
  slideTimer = 0.68;
  audio.sfx('lane');
  fx.spawn(new THREE.Vector3(playerX, 0.12, 0.15), 0x45f5ff, 7, {
    speed: 2.4, life: 0.34, size: 0.35, gravity: 1.2, spread: 0.2,
    dir: new THREE.Vector3(0, 0, 1),
  });
}

function activatePower(kind, source) {
  power[kind] = POWER_DURATION[kind];
  updatePowerupChips();
  const info = POWER_INFO[kind];
  const names = { shield: 'SHIELD BREW', magnet: 'SOUL MAGNET', boost: 'BROOM RUSH', slow: 'TIME HEX' };
  showToast(names[kind], 'POWER-UP ACTIVE', 1700);
  audio.sfx('power');
  fx.spawn(new THREE.Vector3(playerX, playerY + 1.05, 0.2), info.color, 22, {
    speed: 4.3, life: 0.8, size: 0.55, gravity: 1.4, spread: 0.3,
    alpha: 0.9,
  });
  if (kind === 'boost') cameraShake = Math.max(cameraShake, 0.35);
  if (kind === 'shield') audio.sfx('shield');
}

function triggerGameOver() {
  if (state !== 'playing') return;
  const previousBest = best;
  state = 'over';
  deadTimer = 0;
  worldSpeed = Math.max(worldSpeed, 8);
  audio.stopMusic();
  audio.sfx('hit');
  if (IS_TOUCH) ui.touch.classList.add('hidden');
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 400);
  cameraShake = 1.1;
  fx.spawn(new THREE.Vector3(playerX, 1.2 + playerY, 0.05), 0xff3fae, 30, {
    speed: 5.5, life: 1.05, size: 0.68, gravity: 3.8, spread: 0.4, alpha: 1,
  });
  fx.spawn(new THREE.Vector3(playerX, 1.2 + playerY, 0.05), 0xff8b24, 20, {
    speed: 4.2, life: 0.85, size: 0.8, gravity: 2.5, spread: 0.3, alpha: 1,
  });
  const final = Math.floor(score);
  isNewBest = final > previousBest;
  if (isNewBest) {
    best = final;
    localStorage.setItem(BEST_KEY, String(best));
    ui.bestMenu.textContent = best.toLocaleString();
  }
  ui.finalScore.textContent = final.toLocaleString();
  ui.finalBest.textContent = best.toLocaleString();
  ui.finalDistance.textContent = `${Math.floor(runDistance)} m`;
  ui.finalCandy.textContent = candyCount.toLocaleString();
  ui.finalDodged.textContent = dodged.toLocaleString();
  ui.newBest.classList.toggle('hidden', !isNewBest);
  if (overTimer) clearTimeout(overTimer);
  overTimer = setTimeout(() => {
    if (state === 'over') {
      ui.gameover.classList.remove('hidden');
      ui.touch.classList.add('hidden');
    }
    overTimer = null;
  }, 900);
}

function updatePlayer(dt) {
  if (state === 'playing' || state === 'over') {
    const target = LANES[lane];
    playerX = damp(playerX, target, 13.5, dt);

    if (state === 'playing') {
      if (playerY > 0 || vy > 0) {
        vy -= 27 * dt;
        playerY += vy * dt;
        if (playerY <= 0) {
          playerY = 0;
          if (vy < -2) {
            audio.sfx('land');
            fx.spawn(new THREE.Vector3(playerX, 0.08, 0.08), 0xff8b24, 6, {
              speed: 1.7, life: 0.35, size: 0.32, gravity: 2, spread: 0.18,
            });
          }
          vy = 0;
        }
      }
      if (slideTimer > 0) slideTimer = Math.max(0, slideTimer - dt);
      if (invuln > 0) invuln = Math.max(0, invuln - dt);
    }

    player.root.position.x = playerX;
    player.root.position.y = playerY;

    const sliding = slideTimer > 0 && state === 'playing';
    const air = playerY > 0.04 && state === 'playing';
    const playAnim = state === 'playing';
    runPhase += dt * (playAnim ? 8.5 + worldSpeed * 0.3 : 2.4);

    const swing = playAnim ? Math.sin(runPhase) : Math.sin(time * 1.7) * 0.2;
    player.legL.rotation.x = damp(player.legL.rotation.x, air ? -0.6 : sliding ? 1.35 : swing * 0.9, 14, dt);
    player.legR.rotation.x = damp(player.legR.rotation.x, air ? 0.48 : sliding ? 1.15 : -swing * 0.9, 14, dt);
    player.armL.rotation.x = damp(player.armL.rotation.x, air ? -1.4 : sliding ? 1.2 : -swing * 0.65, 13, dt);
    player.armR.rotation.x = damp(player.armR.rotation.x, air ? -1.4 : sliding ? 1.2 : swing * 0.65, 13, dt);
    player.armL.rotation.z = 0.04;
    player.armR.rotation.z = -0.04;

    const targetScaleY = sliding ? 0.54 : 1;
    player.visual.scale.y = damp(player.visual.scale.y, targetScaleY, 16, dt);
    player.visual.scale.x = damp(player.visual.scale.x, sliding ? 1.08 : 1, 12, dt);
    player.visual.scale.z = damp(player.visual.scale.z, sliding ? 1.08 : 1, 12, dt);
    const targetTilt = sliding ? -0.48 : air ? -0.1 : 0;
    player.visual.rotation.x = damp(player.visual.rotation.x, targetTilt, 12, dt);
    const targetRoll = clamp((target - playerX) * 0.13, -0.18, 0.18);
    player.visual.rotation.z = damp(player.visual.rotation.z, targetRoll, 9, dt);

    let bob = playAnim ? Math.abs(Math.sin(runPhase)) * 0.065 : 0.02 + Math.sin(time * 1.8) * 0.035;
    if (sliding) bob -= 0.04;
    player.visual.position.y = bob;
    player.head.rotation.y = playAnim ? Math.sin(runPhase * 0.5) * 0.035 : Math.sin(time * 0.7) * 0.25;
    player.hatTip.rotation.z = -0.7 + Math.sin(runPhase * 0.8) * 0.05;
    player.cape.rotation.x = -0.06 - (playAnim ? 0.08 + Math.sin(runPhase) * 0.04 : 0);
    player.cape.scale.y = 1 + Math.sin(runPhase * 0.5) * 0.03;
    player.batShape.rotation.z = Math.sin(time * 2.2) * 0.02;
    player.charm.rotation.z = Math.sin(runPhase * 1.2 + 0.4) * 0.18;
    player.shadow.position.set(playerX, 0.018, 0.02);
    const shadowScale = 1 + playerY * 0.16;
    player.shadow.scale.set(shadowScale, shadowScale, shadowScale);
    player.shadow.material.opacity = 0.75 * clamp(1 - playerY * 0.34, 0.25, 1);

    if (state === 'over') {
      player.visual.rotation.z += dt * 3.6;
      player.visual.rotation.x += dt * 1.8;
      player.visual.position.y = Math.max(-0.25, player.visual.position.y - dt * 0.8);
    }
  } else if (state === 'menu') {
    // Idle showroom animation, with a slow breath and head turn.
    playerX = 0;
    player.root.position.set(0, 0, 0);
    player.visual.position.y = 0.02 + Math.sin(time * 1.55) * 0.035;
    player.visual.rotation.set(0, 0, Math.sin(time * 0.6) * 0.015);
    player.visual.scale.set(1, 1, 1);
    runPhase += dt * 2.2;
    const idleSwing = Math.sin(time * 1.4) * 0.09;
    player.legL.rotation.x = damp(player.legL.rotation.x, idleSwing, 5, dt);
    player.legR.rotation.x = damp(player.legR.rotation.x, -idleSwing, 5, dt);
    player.armL.rotation.x = damp(player.armL.rotation.x, -0.08 + Math.sin(time * 1.2) * 0.06, 5, dt);
    player.armR.rotation.x = damp(player.armR.rotation.x, -0.08 - Math.sin(time * 1.2) * 0.06, 5, dt);
    player.head.rotation.y = Math.sin(time * 0.55) * 0.24;
    player.hatTip.rotation.z = -0.7 + Math.sin(time * 0.9) * 0.04;
    player.cape.rotation.x = -0.06 + Math.sin(time * 1.1) * 0.035;
    player.charm.rotation.z = Math.sin(time * 1.3) * 0.12;
    player.shadow.position.set(0, 0.018, 0.02);
    player.shadow.scale.set(1, 1, 1);
    player.shadow.material.opacity = 0.75;
    player.shield.visible = false;
    player.shieldCore.visible = false;
    player.magnetRing.visible = false;
  }

  if (state === 'playing') {
    // Magic sparks trailing the boots.
    trailTimer -= dt;
    if (trailTimer <= 0) {
      trailTimer = power.boost > 0 ? 0.035 : 0.07;
      const color = power.boost > 0 ? 0x45f5ff : power.magnet > 0 ? 0xff9d3c : 0xff3fae;
      fx.spawn(new THREE.Vector3(playerX + rand(-0.14, 0.14), 0.09 + rand(0, 0.1), 0.22), color, power.boost > 0 ? 2 : 1, {
        speed: 0.9, life: 0.38, size: power.boost > 0 ? 0.48 : 0.3, gravity: -0.4, spread: 0.1, alpha: 0.7,
      });
    }
  }

  // Power-up visuals.
  const shieldOn = power.shield > 0 && state !== 'menu';
  player.shield.visible = shieldOn;
  player.shieldCore.visible = shieldOn;
  if (shieldOn) {
    player.shield.rotation.y += dt * 1.2;
    player.shield.rotation.z += dt * 0.4;
    player.shield.material.opacity = 0.4 + Math.sin(time * 5) * 0.12;
    player.shieldCore.rotation.y -= dt * 0.6;
  }
  const magnetOn = power.magnet > 0 && state !== 'menu';
  player.magnetRing.visible = magnetOn;
  if (magnetOn) {
    player.magnetRing.rotation.y += dt * 2.3;
    player.magnetRing.scale.setScalar(1 + Math.sin(time * 4) * 0.05);
  }
  player.playerLight.color.setHex(power.boost > 0 ? 0x45f5ff : power.shield > 0 ? 0xbf7bff : 0xff8b24);
  player.playerLight.intensity = power.boost > 0 ? 6 : 2.2;
}

/* -------------------------------------------------------------------------- */
/*  Camera                                                                     */
/* -------------------------------------------------------------------------- */

const camLook = new THREE.Vector3(0, 1.2, 0);
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function portrait() { return window.innerWidth / window.innerHeight < 0.92; }

function menuCameraTargets(pos, look) {
  if (portrait()) {
    pos.set(2.8, 2.62, -5.5);
    look.set(0.95, 1.18, 0.1);
  } else {
    pos.set(4.7, 2.82, -6.2);
    look.set(3.0, 1.24, 0.15);
  }
}

function snapMenuCamera() {
  menuCameraTargets(camTarget, lookTarget);
  camera.position.copy(camTarget);
  camLook.copy(lookTarget);
  camera.lookAt(camLook);
  camera.fov = portrait() ? 57 : 52;
  camera.updateProjectionMatrix();
}

function snapGameCamera() {
  camera.position.set(playerX * 0.32, 4.05, 8.3);
  camLook.set(playerX * 0.2, 1.08, -10.5);
  camera.lookAt(camLook);
  camera.fov = 56;
  camera.updateProjectionMatrix();
}

function setSkyMode(mode) {
  if (mode === 'menu') {
    moonGroup.position.set(-36, 7.5, 56);
    skyMat.uniforms.moonDir.value.set(0.25, 0.29, 0.92).normalize();
  } else {
    moonGroup.position.set(34, 36, -120);
    skyMat.uniforms.moonDir.value.set(0.18, 0.27, -0.94).normalize();
  }
}

function updateCamera(dt) {
  if (state === 'menu') {
    menuCameraTargets(camTarget, lookTarget);
    camTarget.x += Math.sin(time * 0.22) * 0.18;
    camTarget.y += Math.sin(time * 0.3) * 0.05;
    const k = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(camTarget, k);
    camLook.lerp(lookTarget, k);
    camera.fov = damp(camera.fov, portrait() ? 57 : 52, 3, dt);
  } else {
    const speedBoost = power.boost > 0 ? 0.35 : 0;
    camTarget.set(playerX * 0.34, 4.05 + playerY * 0.15 + Math.sin(time * 2.2) * 0.035, 8.3 - speedBoost);
    lookTarget.set(playerX * 0.18, 1.08 + playerY * 0.18, -10.5);
    if (state === 'over') {
      camTarget.y += 0.18;
      camTarget.z -= 0.3;
      lookTarget.y = 1.2;
    }
    const k = 1 - Math.exp(-5.2 * dt);
    camera.position.lerp(camTarget, k);
    camLook.lerp(lookTarget, k);
    const targetFov = 56 + (power.boost > 0 ? 6 : 0) + Math.min(3, runDistance / 400);
    camera.fov = damp(camera.fov, targetFov, 4, dt);
  }

  if (cameraShake > 0.001 && !REDUCED) {
    const s = cameraShake;
    camera.position.x += Math.sin(time * 73.3) * 0.08 * s;
    camera.position.y += Math.cos(time * 61.1) * 0.06 * s;
    cameraShake = damp(cameraShake, 0, 5.5, dt);
  } else {
    cameraShake = 0;
  }
  camera.lookAt(camLook.x, camLook.y, camLook.z);
  camera.updateProjectionMatrix();

  skyGroup.position.set(camera.position.x, 0, camera.position.z);
  stars.rotation.y = time * 0.004;
  cloudGroup.position.x = Math.sin(time * 0.03) * 5;
  moonGroup.rotation.z = -0.08 + Math.sin(time * 0.12) * 0.012;
}

/* -------------------------------------------------------------------------- */
/*  Entity updates                                                             */
/* -------------------------------------------------------------------------- */

function collectCandy(rec) {
  candyCount++;
  combo++;
  comboTimer = 3.5;
  const newMult = 1 + Math.min(4, Math.floor(combo / 8));
  if (newMult > comboMult) {
    comboMult = newMult;
    audio.sfx('combo');
    showToast(`COMBO x${comboMult}`, 'THE CANDY LOVES YOU', 1300);
  }
  score += 7 * comboMult;
  audio.sfx('coin');
  fx.spawn(rec.obj.position.clone(), 0xffc23f, 9, {
    speed: 2.6, life: 0.55, size: 0.45, gravity: 2.4, spread: 0.16, alpha: 0.95,
  });
  fx.spawn(rec.obj.position.clone(), 0xff8b24, 4, {
    speed: 1.5, life: 0.7, size: 0.65, gravity: 0.4, spread: 0.12, alpha: 0.6,
  });
}

function smashObstacle(rec, index) {
  rec.dead = true;
  rec.resolved = true;
  score += 45;
  dodged++;
  audio.sfx('smash');
  cameraShake = Math.max(cameraShake, 0.32);
  const p = new THREE.Vector3(rec.obj.position.x, Math.max(0.7, rec.obj.position.y + 0.4), rec.obj.position.z);
  const hue = OBSTACLE_DEFS[rec.type].hue;
  fx.spawn(p, hue, 22, { speed: 5, life: 0.8, size: 0.65, gravity: 4, spread: 0.35, alpha: 0.95 });
  fx.spawn(p, 0xffd23f, 8, { speed: 3.2, life: 0.55, size: 0.5, gravity: 3, spread: 0.2, alpha: 0.9 });
  release(rec.type, rec.obj);
  const idx = obstacles.indexOf(rec);
  if (idx >= 0) obstacles.splice(idx, 1);
}

function handleObstacleCollision(rec) {
  if (power.boost > 0) { smashObstacle(rec); return; }
  if (power.shield > 0) {
    power.shield = 0;
    invuln = 1.5;
    updatePowerupChips();
    showToast('SHIELD BROKEN', 'KEEP RUNNING', 1400);
    audio.sfx('shield');
    smashObstacle(rec);
    return;
  }
  if (invuln > 0) { smashObstacle(rec); return; }
  rec.resolved = true;
  triggerGameOver();
}

function animateObstacle(rec) {
  const obj = rec.obj;
  switch (rec.type) {
    case 'ghost':
      obj.position.y = rec.baseY + Math.sin(time * 2.1 + rec.phase) * 0.16;
      obj.rotation.z = Math.sin(time * 1.4 + rec.phase) * 0.07;
      obj.rotation.y = Math.sin(time * 0.8 + rec.phase) * 0.1;
      break;
    case 'bat':
      obj.position.y = rec.baseY + Math.sin(time * 3 + rec.phase) * 0.11;
      obj.rotation.y = Math.sin(time * 1.7 + rec.phase) * 0.16;
      for (const bat of obj.userData.bats) {
        const flap = Math.sin(time * 19 + rec.phase + bat.userData.phase) * 0.58;
        bat.userData.leftWing.rotation.z = flap;
        bat.userData.rightWing.rotation.z = -flap;
        bat.position.y = Math.sin(time * 4 + bat.userData.phase) * 0.035;
      }
      break;
    case 'zombie':
      obj.rotation.z = Math.sin(time * 3.5 + rec.phase) * 0.03;
      obj.rotation.y = Math.sin(time * 1.2 + rec.phase) * 0.04;
      for (const child of obj.children) {
        if (child.userData.baseRot !== undefined) {
          child.rotation.x = child.userData.baseRot + Math.sin(time * 3 + rec.phase) * 0.12;
        }
      }
      break;
    case 'pumpkin':
      obj.rotation.z = Math.sin(time * 1.4 + rec.phase) * 0.012;
      break;
    default:
      break;
  }
}

function updateObstacles(dt, collide = true) {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const rec = obstacles[i];
    if (rec.dead) { obstacles.splice(i, 1); continue; }
    const prevZ = rec.z;
    rec.z += worldSpeed * dt;
    rec.obj.position.z = rec.z;
    animateObstacle(rec);

    if (collide && !rec.resolved && prevZ < 1.0 && rec.z > -1.0) {
      const dx = Math.abs(rec.x - playerX);
      if (dx < rec.radius + 0.24) {
        if (rec.rule === 'low' && playerY > 0.46) {
          rec.resolved = true;
          dodged++;
          score += 12;
          fx.spawn(new THREE.Vector3(rec.x, 0.3, rec.z), 0x45f5ff, 7, {
            speed: 2.2, life: 0.4, size: 0.35, gravity: 2, spread: 0.15, alpha: 0.8,
          });
        } else if (rec.rule === 'high' && slideTimer > 0.015) {
          rec.resolved = true;
          dodged++;
          score += 12;
          fx.spawn(new THREE.Vector3(rec.x, 1.1, rec.z), 0xff3fae, 7, {
            speed: 2.2, life: 0.4, size: 0.35, gravity: 0.8, spread: 0.15, alpha: 0.8,
          });
        } else {
          handleObstacleCollision(rec);
          if (state !== 'playing') return;
        }
      }
    }

    if (collide && rec.resolved && !rec.cleanAwarded && rec.z > 1.1) {
      if (rec.rule === 'block') { dodged++; score += 6; }
      rec.cleanAwarded = true;
    } else if (collide && !rec.resolved && rec.z > 1.1) {
      rec.resolved = true;
      dodged++;
      score += 6;
    }

    if (rec.z > 8) {
      release(rec.type, rec.obj);
      obstacles.splice(i, 1);
    }
  }
}

function updateCandies(dt, collect = true) {
  for (let i = candyPickups.length - 1; i >= 0; i--) {
    const rec = candyPickups[i];
    rec.z += worldSpeed * dt;
    rec.obj.position.z = rec.z;
    rec.obj.rotation.y += dt * 3.2;
    const catchY = playerY + 1.0;

    if (collect && power.magnet > 0 && rec.z > -23 && rec.z < 3) {
      rec.pulled = true;
      rec.obj.position.x = damp(rec.obj.position.x, playerX, 8.5, dt);
      rec.obj.position.y = damp(rec.obj.position.y, catchY, 8.5, dt);
    } else if (rec.pulled) {
      rec.obj.position.y = damp(rec.obj.position.y, rec.baseY + Math.sin(time * 3 + rec.phase) * 0.1, 8, dt);
    } else {
      rec.obj.position.y = rec.baseY + Math.sin(time * 3.2 + rec.phase) * 0.1;
    }

    if (collect) {
      const dx = Math.abs(rec.obj.position.x - playerX);
      const dy = Math.abs(rec.obj.position.y - catchY);
      if (Math.abs(rec.z) < 1.0 && dx < 0.82 && dy < 1.05) {
        collectCandy(rec);
        release('candy', rec.obj);
        candyPickups.splice(i, 1);
        continue;
      }
    }

    if (rec.z > 9) {
      release('candy', rec.obj);
      candyPickups.splice(i, 1);
    }
  }
}

function updatePowerupPickups(dt, collect = true) {
  for (let i = powerupPickups.length - 1; i >= 0; i--) {
    const rec = powerupPickups[i];
    rec.z += worldSpeed * dt;
    rec.obj.position.z = rec.z;
    rec.obj.position.y = rec.baseY + Math.sin(time * 2.6 + rec.phase) * 0.13;
    rec.obj.rotation.y += dt * 1.7;
    if (rec.type === 'potion') rec.obj.rotation.z = Math.sin(time * 1.7 + rec.phase) * 0.09;
    if (rec.type === 'broom') rec.obj.rotation.z = Math.sin(time * 2.2 + rec.phase) * 0.12;

    if (collect) {
      const dx = Math.abs(rec.x - playerX);
      if (Math.abs(rec.z) < 1.15 && dx < 1.0) {
        activatePower(POWERUP_TYPES[rec.type].power, rec.type);
        release(rec.type, rec.obj);
        powerupPickups.splice(i, 1);
        continue;
      }
    }

    if (rec.z > 9) {
      release(rec.type, rec.obj);
      powerupPickups.splice(i, 1);
    }
  }
}

function updatePowerTimers(dt) {
  let changed = false;
  for (const key of Object.keys(power)) {
    if (power[key] > 0) {
      power[key] = Math.max(0, power[key] - dt);
      if (power[key] === 0) changed = true;
    }
  }
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      comboMult = 1;
    }
  }
  if (changed) updatePowerupChips();
}

function updateRun(dt) {
  const level = 1 + Math.min(8, Math.floor(runDistance / 145));
  const targetSpeed = (15.2 + Math.min(12.5, runDistance * 0.021)) * (power.slow > 0 ? 0.62 : 1) * (power.boost > 0 ? 1.35 : 1);
  worldSpeed = damp(worldSpeed, targetSpeed, 1.8, dt);
  runDistance += worldSpeed * dt;
  score += worldSpeed * dt * 2.65 * comboMult * (power.boost > 0 ? 1.4 : 1);

  if (runDistance >= nextPatternDistance) {
    spawnPattern();
    nextPatternDistance = runDistance + Math.max(20, rand(25, 35) - level * 0.85);
  }

  updatePowerTimers(dt);
  updatePlayer(dt);
  updateObstacles(dt);
  if (state !== 'playing') return;
  updateCandies(dt);
  updatePowerupPickups(dt);
  updateEnvironment(worldSpeed, dt);
  updateDashes(worldSpeed, dt);
  updateMotes(worldSpeed, dt, time);
  fx.update(dt);
  updateCamera(dt);
  updateHud(false);
}

/* -------------------------------------------------------------------------- */
/*  Screen flow                                                                */
/* -------------------------------------------------------------------------- */

function playFlash() {
  ui.flash.classList.remove('go');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('go');
}

function startGame() {
  if (state === 'playing') return;
  audio.init();
  audio.sfx('start');
  clearPickups();
  if (tutorialTimer) { clearTimeout(tutorialTimer); tutorialTimer = null; }
  resetRun();
  state = 'playing';
  isNewBest = false;
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.touch.classList.toggle('hidden', !IS_TOUCH);
  document.body.classList.add('playing');
  setSkyMode('game');
  snapGameCamera();
  playFlash();
  updateHud(true);
  showTutorial();
  showToast('RUN, LITTLE WITCH', 'THE HOLLOW IS AWAKE', 1700);
  audio.startMusic();
}

function toMenu() {
  state = 'menu';
  audio.stopMusic();
  resetRun();
  clearPickups();
  ui.menu.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.touch.classList.add('hidden');
  document.body.classList.remove('playing');
  setSkyMode('menu');
  snapMenuCamera();
  ui.bestMenu.textContent = best.toLocaleString();
  player.visual.visible = true;
  if (overTimer) { clearTimeout(overTimer); overTimer = null; }
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  audio.stopMusic();
  ui.pauseScore.textContent = Math.floor(score).toLocaleString();
  ui.pauseDistance.textContent = `${Math.floor(runDistance)} m`;
  ui.pauseCandy.textContent = candyCount.toLocaleString();
  ui.pause.classList.remove('hidden');
  ui.touch.classList.add('hidden');
  document.body.classList.remove('playing');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  ui.pause.classList.add('hidden');
  document.body.classList.add('playing');
  if (IS_TOUCH) ui.touch.classList.remove('hidden');
  audio.startMusic();
}

function restartFromPause() {
  ui.pause.classList.add('hidden');
  state = 'menu';
  startGame();
}

/* -------------------------------------------------------------------------- */
/*  Input                                                                      */
/* -------------------------------------------------------------------------- */

const gesture = { active: false, id: -1, x: 0, y: 0, t: 0, type: 'touch' };

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;
  gesture.active = true;
  gesture.id = e.pointerId;
  gesture.x = e.clientX;
  gesture.y = e.clientY;
  gesture.t = performance.now();
  gesture.type = e.pointerType;
});

window.addEventListener('pointerup', (e) => {
  if (!gesture.active || e.pointerId !== gesture.id) return;
  gesture.active = false;
  if (state !== 'playing') return;
  const dx = e.clientX - gesture.x;
  const dy = e.clientY - gesture.y;
  const dist = Math.hypot(dx, dy);
  const dt = performance.now() - gesture.t;
  if (dist < 18 && dt < 360) {
    if (gesture.type !== 'mouse') jump();
    return;
  }
  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    if (dx > 26) moveLane(1);
    else if (dx < -26) moveLane(-1);
  } else {
    if (dy < -28) jump();
    else if (dy > 28) slide();
  }
});

window.addEventListener('pointercancel', () => { gesture.active = false; });

document.querySelectorAll('.touch-btn').forEach((btn) => {
  const release = () => btn.classList.remove('active');
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.classList.add('active');
    const action = btn.dataset.action;
    if (action === 'left') moveLane(-1);
    else if (action === 'right') moveLane(1);
    else if (action === 'jump') jump();
    else if (action === 'slide') slide();
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (code === 'KeyM') {
    audio.init();
    audio.setMuted(!audio.muted);
    return;
  }
  if (code === 'Escape' || code === 'KeyP') {
    if (state === 'playing') { e.preventDefault(); pauseGame(); return; }
    if (state === 'paused') { e.preventDefault(); resumeGame(); return; }
  }
  if (state === 'menu' || state === 'over') {
    if ((code === 'Enter' || code === 'Space') && !e.repeat) {
      e.preventDefault();
      startGame();
    }
    return;
  }
  if (state === 'paused') {
    if (code === 'Enter' || code === 'Space') {
      e.preventDefault();
      resumeGame();
    }
    return;
  }
  if (state !== 'playing' || e.repeat) return;
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      e.preventDefault();
      moveLane(-1);
      break;
    case 'ArrowRight':
    case 'KeyD':
      e.preventDefault();
      moveLane(1);
      break;
    case 'ArrowUp':
    case 'KeyW':
    case 'Space':
      e.preventDefault();
      jump();
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      slide();
      break;
    default:
      break;
  }
}, { passive: false });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});

window.addEventListener('blur', () => {
  if (state === 'playing') pauseGame();
});

/* Buttons */
$('btn-start').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart-pause').addEventListener('click', restartFromPause);
$('btn-menu-pause').addEventListener('click', toMenu);
$('btn-menu-over').addEventListener('click', toMenu);
ui.pauseBtn.addEventListener('click', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});
ui.mute.addEventListener('click', () => {
  audio.init();
  audio.setMuted(!audio.muted);
});
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('canvas')) e.preventDefault();
});

/* -------------------------------------------------------------------------- */
/*  Main loop                                                                  */
/* -------------------------------------------------------------------------- */

function updateMenu(dt) {
  worldSpeed = damp(worldSpeed, 2.5, 2.2, dt);
  updatePlayer(dt);
  updateEnvironment(worldSpeed, dt);
  updateDashes(worldSpeed, dt);
  updateMotes(worldSpeed, dt, time);
  fx.update(dt);
  updateCamera(dt);
}

function updateGameOver(dt) {
  deadTimer += dt;
  worldSpeed = damp(worldSpeed, 0, 2.2, dt);
  updatePlayer(dt);
  updateObstacles(dt, false);
  updateCandies(dt, false);
  updatePowerupPickups(dt, false);
  updateEnvironment(worldSpeed, dt);
  updateDashes(worldSpeed, dt);
  updateMotes(worldSpeed, dt, time);
  fx.update(dt);
  updateCamera(dt);
  if (deadTimer > 0.65 && ui.gameover.classList.contains('hidden') && !overTimer) {
    // Safety net if a timer was interrupted.
    ui.gameover.classList.remove('hidden');
  }
}

function updatePaused() {
  // Keep the world frozen; only the DOM overlay breathes.
}

let lastFrame = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = Math.min(0.05, Math.max(0.001, rawDt || 0.016));
  if (state !== 'paused') {
    time += dt;
    if (state === 'menu') updateMenu(dt);
    else if (state === 'playing') updateRun(dt);
    else if (state === 'over') updateGameOver(dt);
    updatePaused();
    audio.update();
  }
  renderer.render(scene, camera);
}

/* -------------------------------------------------------------------------- */
/*  Resize, initialisation                                                     */
/* -------------------------------------------------------------------------- */

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  fx.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  if (state === 'menu') snapMenuCamera();
}

window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(resize, 180));

/* Initial presentation */
ui.hud.classList.add('hidden');
ui.touch.classList.add('hidden');
setSkyMode('menu');
snapMenuCamera();
player.root.position.set(0, 0, 0);
player.visual.visible = true;
updateHud(true);
document.body.classList.add('playing');
document.body.classList.remove('playing');
ui.bestMenu.textContent = best.toLocaleString();

requestAnimationFrame(() => {
  setTimeout(() => ui.loader.classList.add('done'), 300);
});

window.__neon = { camera, renderer, scene, moonGroup, skyGroup, player, obstacles, candyPickups, powerupPickups, spawnObstacle, spawnCandyTrail, spawnPowerup, spawnPattern, get state() { return state; }, get runDistance() { return runDistance; } };
animate(performance.now());
