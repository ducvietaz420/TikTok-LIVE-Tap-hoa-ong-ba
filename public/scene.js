import * as THREE from '/vendor/three.module.js';
import { initChaos } from './chaos.js';
import {createVisitorQueue} from './visitors.js';

// Original, procedural low-poly artwork. No external textures or character assets.
export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e0c6');
  scene.fog = new THREE.Fog('#e9e0c6', 24, 55);
  const camera = new THREE.OrthographicCamera(-4.6, 4.6, 8.2, -8.2, 0.1, 90);
  camera.position.set(5.6, 9.2, 17);
  camera.lookAt(-0.10, 3.80, 0);

  const hemi = new THREE.HemisphereLight('#fff4d6', '#8f8059', 2.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffedc6', 3.0);
  sun.position.set(-6, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 12, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#c2ddb7', 0.7);
  fill.position.set(5, 6, -10);
  scene.add(fill);

  const palette = {
    ground: '#bca477', road: '#bea279', pavement: '#cbb68d', wall: '#d6c3a1', cream: '#f0dfb0',
    wood: '#815a37', woodLight: '#a77b47', woodDark: '#4c3c29', bamboo: '#728358', leaves: '#697e49',
    leavesLight: '#8e9c64', green: '#416754', red: '#b3573b', tile: '#a65d43', skin: '#d6a57e',
    skinLight: '#e4b794', shirt: '#84634d', shirtLight: '#a48466', trousers: '#443b35', hair: '#e9e4d4',
    black: '#34352c', gold: '#e9bc4b', teal: '#4b8077', pink: '#da998b', white: '#e6e6ce',
  };
  const mats = new Map();
  function material(color, extra = {}) {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true, ...extra }));
    return mats.get(key);
  }
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 10, 7),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    cone: new THREE.ConeGeometry(1, 1, 9),
  };
  const staticRoot = new THREE.Group();
  scene.add(staticRoot);
  const animatedRoot = new THREE.Group();
  scene.add(animatedRoot);
  const shadowMeshes = [];
  function mesh(geometry, color, parent = staticRoot, cast = true) {
    const item = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color);
    item.castShadow = cast;
    item.receiveShadow = true;
    parent.add(item);
    if (cast) shadowMeshes.push(item);
    return item;
  }
  function box(x, y, z, w, h, d, color, parent = staticRoot, cast = true) {
    const m = mesh(geos.box, color, parent, cast);
    m.position.set(x, y, z); m.scale.set(w, h, d); return m;
  }
  function sphere(x, y, z, rx, ry, rz, color, parent = staticRoot, cast = true) {
    const m = mesh(geos.sphere, color, parent, cast);
    m.position.set(x, y, z); m.scale.set(rx, ry, rz); return m;
  }
  function cylinder(x, y, z, r, h, color, parent = staticRoot, rt = r, cast = true) {
    const g = rt === r ? geos.cylinder : new THREE.CylinderGeometry(rt / r, 1, 1, 10);
    const m = mesh(g, color, parent, cast);
    m.position.set(x, y, z); m.scale.set(r, h, r); return m;
  }
  function beam(from, to, radius, color, parent = staticRoot, cast = true) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const delta = end.clone().sub(start);
    const m = cylinder(...start.clone().add(end).multiplyScalar(0.5).toArray(), radius, delta.length(), color, parent, radius, cast);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return m;
  }
  function line(points, color, parent = staticRoot, opacity = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    parent.add(l); return l;
  }
  function ring(x, y, z, radius, tube, color, parent = staticRoot) {
    const m = mesh(new THREE.TorusGeometry(radius, tube, 5, 18), color, parent);
    m.position.set(x, y, z); return m;
  }
  function label(text, sub, w, h, bg, fg, parent = staticRoot, font = 'Georgia') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = fg; ctx.lineWidth = 8; ctx.strokeRect(17, 17, c.width - 34, c.height - 34);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
    ctx.font = `bold ${sub ? c.height * .32 : c.height * .43}px ${font}, Arial, sans-serif`;
    ctx.fillText(text, c.width / 2, sub ? c.height * .39 : c.height * .52, c.width * .91);
    if (sub) { ctx.font = `bold ${c.height * .14}px Arial, sans-serif`; ctx.fillText(sub, c.width / 2, c.height * .77, c.width * .87); }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }), parent, false);
    return m;
  }
  // A consistent pseudo-random seed keeps screenshots and the physical set stable.
  let seed = 62911;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  const rand = (a, b) => a + random() * (b - a);

  // Sidewalk, little street, house and garden.
  box(0, -0.22, -2, 75, .4, 70, palette.ground, staticRoot, false);
  box(0, -.025, 7, 32, .1, 10.8, palette.road, staticRoot, false);
  box(0, .015, -0.75, 12.2, .12, 5.1, palette.pavement, staticRoot, false);
  box(0, -.02, 1.86, 12.2, .16, .22, '#ae9574');
  for (let x = -7; x < 7; x += 1.4) line([[x, .083, -3.3], [x, .083, 1.7]], '#a99475', staticRoot, .37);
  for (const z of [-2.25, -.9, .43]) line([[-6, .083, z], [6, .083, z]], '#a99475', staticRoot, .37);
  const housePartsStart=staticRoot.children.length;
  box(-5.15, 1.8, -5.4, 4, 3.7, 3.4, palette.wall);
  box(-4.4, 1.25, -3.65, 1.32, 2.5, .12, '#4b6656');
  for (let i = 0; i < 5; i++) box(-4.9 + i * .25, 1.25, -3.57, .035, 2.4, .03, '#73907a');
  box(-6.0, 2.15, -3.64, 1.2, 1.1, .09, '#614d36');
  box(-6.0, 2.15, -3.57, 1.02, .94, .09, '#a6b69b');
  box(-6.0, 2.15, -3.50, .065, .94, .09, palette.wood);
  box(-6.0, 2.15, -3.49, 1.02, .065, .09, palette.wood);
  const roofHouse = box(-5.15, 3.84, -5.0, 4.8, .22, 4.4, palette.tile);
  roofHouse.rotation.x = .08;
  for (let i = 0; i < 15; i++) beam([-7.48 + i * .33, 3.98, -7.1], [-7.48 + i * .33, 3.63, -2.8], .047, '#c07954');
  const houseSign = label('TRÀ ĐÁ', 'MỜI BÀ CON GHÉ CHƠI', 1.34, .68, '#426452', '#efdfae');
  houseSign.position.set(-4.4, 2.96, -3.48);
  for (let i = 0; i < 5; i++) {
    const x = -6 + i * .43;
    box(x, .51, -2.6, .12, .91, .12, '#98815c');
  }
  box(-5.15, .7, -2.6, 2.2, .085, .09, '#8e7855');
  box(-5.15, .3, -2.6, 2.2, .085, .09, '#8e7855');
  box(4.9, .15, -5.3, 2.6, .4, 2.5, '#9b9d65');
  const house=new THREE.Group();staticRoot.add(house);
  for(const part of staticRoot.children.slice(housePartsStart,-1))house.attach(part);

  // Bamboo grove: a leafy, layered village backdrop rather than a flat wallpaper.
  const bambooGroups = [];
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.23, .17, .68, 0); leafShape.quadraticCurveTo(.24, -.07, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape);
  const leafMat = material(palette.leaves, { side: THREE.DoubleSide });
  const leafLightMat = material(palette.leavesLight, { side: THREE.DoubleSide });
  const leafTransforms = [[], []];
  const dummy = new THREE.Object3D();
  for (let b = 0; b < 19; b++) {
    const x = -10 + b * 1.07 + rand(-.3, .3), z = rand(-10, -5.6), h = rand(6.6, 11.1);
    const stalk = new THREE.Group(); stalk.position.set(x, 0, z); stalk.rotation.z = rand(-.095, .095); staticRoot.add(stalk);
    cylinder(0, h * .5, 0, rand(.045, .075), h, b % 3 ? palette.bamboo : '#85956a', stalk);
    for (let j = 1; j < h / .75; j++) cylinder(0, j * .75, 0, .077, .035, '#9ba77c', stalk, .077, false);
    for (let j = 0; j < 5; j++) {
      const yy = h - j * .91, side = j % 2 ? -1 : 1;
      const branchEnd = [side * rand(.7, 1.25), yy + .12, rand(-.2, .2)];
      beam([0, yy - .24, 0], branchEnd, .025, palette.bamboo, stalk, false);
      for (let k = 0; k < 6; k++) {
        const t = k / 6;
        dummy.position.set(x + branchEnd[0] * t + rand(-.2, .2), yy + rand(-.22, .20), z + rand(-.4, .4));
        dummy.rotation.set(rand(-.55, .55), rand(-.8, .8), (k % 2 ? .25 : 2.75) * side + rand(-.18, .18));
        dummy.scale.setScalar(rand(.85, 1.6)); dummy.updateMatrix(); leafTransforms[b % 2].push(dummy.matrix.clone());
      }
    }
    stalk.userData.restAngle = stalk.rotation.z;
    bambooGroups.push(stalk);
  }
  for (let i = 0; i < 2; i++) {
    const leaves = new THREE.InstancedMesh(leafGeo, i ? leafLightMat : leafMat, leafTransforms[i].length);
    leafTransforms[i].forEach((matrix, index) => leaves.setMatrixAt(index, matrix));
    leaves.receiveShadow = true; staticRoot.add(leaves); bambooGroups.push(leaves);
  }
  const grassTransforms = [];
  for (let i = 0; i < 160; i++) {
    let x = rand(-10, 10), z = rand(-6, -3.3);
    dummy.position.set(x, rand(.06, .2), z); dummy.rotation.set(0, rand(0, Math.PI), rand(-.32, .32)); dummy.scale.set(rand(.028, .055), rand(.16, .38), .025); dummy.updateMatrix(); grassTransforms.push(dummy.matrix.clone());
  }
  const grass = new THREE.InstancedMesh(geos.cone, material('#9ca376'), grassTransforms.length);
  grassTransforms.forEach((m, i) => grass.setMatrixAt(i, m)); staticRoot.add(grass);

  // A mature roadside tree frames the left edge, with a small bird on its branch.
  const tree = new THREE.Group(); tree.position.set(-4.1, 0, -.9); staticRoot.add(tree);
  cylinder(0, 2.5, 0, .22, 5, '#79634b', tree, .12);
  beam([0, 3.6, 0], [-1.1, 5.2, .3], .13, '#79634b', tree);
  beam([0, 3.4, 0], [.9, 5.1, -.1], .12, '#79634b', tree);
  for (let i = 0; i < 12; i++) sphere(rand(-1.5, 1.35), rand(5.1, 6.7), rand(-.65, .7), rand(.7, 1.1), rand(.45, .8), rand(.55, .9), i % 2 ? '#7c8b58' : '#8c9864', tree);
  const bird = new THREE.Group(); bird.position.set(.9, 4.5, .1); tree.add(bird);
  sphere(0, .11, 0, .14, .17, .12, '#816d4c', bird);
  sphere(.06, .27, .03, .11, .1, .1, '#8f7750', bird);
  const beak = mesh(geos.cone, '#d9ac50', bird); beak.scale.set(.035, .11, .035); beak.rotation.z = -Math.PI / 2; beak.position.set(.2, .27, .04);

  // Woven mat and tea tray in front of the grandfather.
  const mat = new THREE.Group(); mat.position.set(-.86, .115, .19); mat.rotation.y = -.1; staticRoot.add(mat);
  box(0, 0, 0, 2.5, .035, 1.8, '#b89c57', mat);
  box(0, .024, 0, 2.36, .025, 1.65, '#dfc680', mat, false);
  for (const x of [-1.12, 1.12]) box(x, .042, 0, .16, .015, 1.67, '#9d5339', mat, false);
  for (const z of [-.75, .75]) box(0, .043, z, 2.4, .015, .1, '#9d5339', mat, false);
  for (let i = 0; i < 20; i++) box(-1.13 + i * .118, .041, 0, .011, .005, 1.62, '#cbb16e', mat, false);
  const teaSet=new THREE.Group();staticRoot.add(teaSet);
  const tray = cylinder(-.48, .22, 1.26, .56, .065, '#af8750',teaSet);
  const trayRim = ring(-.48, .26, 1.26, .52, .027, '#d4b56a',teaSet); trayRim.rotation.x = Math.PI / 2;
  cylinder(-.55, .40, 1.24, .16, .30, '#c7cec2', teaSet, .13);
  sphere(-.55, .57, 1.24, .13, .055, .13, '#dbe2ce',teaSet);
  beam([-.40, .47, 1.24], [-.26, .53, 1.24], .045, '#c7cec2',teaSet);
  const potHandle = ring(-.7, .43, 1.24, .10, .027, '#c7cec2',teaSet);
  for (const [x, z] of [[-.2, 1.44], [-.73, 1.5], [-.15, 1.08]]) {
    cylinder(x, .32, z, .073, .12, '#dae2ce',teaSet);
    cylinder(x, .385, z, .06, .006, '#87754a', teaSet, .06, false);
  }
  for (let i = 0; i < 5; i++) sphere(-.87 + i * .18, .3, 1.15 + Math.sin(i) * .16, .09, .095, .09, i % 2 ? '#cbb44c' : '#7e9e50',teaSet);

  // The grandfather is a small articulated character: limbs, jaw, eyelids and fan.
  const elder = new THREE.Group(); elder.position.set(-.86, .16, -.02); elder.rotation.y = -.10; elder.scale.setScalar(1.15); animatedRoot.add(elder);
  const body = new THREE.Group(); elder.add(body);
  sphere(0, .92, 0, .36, .52, .26, palette.shirt, body);
  cylinder(0, 1.13, 0, .25, .58, palette.shirt, body, .32);
  sphere(0, .56, .035, .40, .21, .30, palette.trousers, elder);
  beam([-.18, .48, .05], [-.60, .28, .31], .17, palette.trousers, elder);
  beam([.18, .48, .05], [.60, .28, .31], .17, palette.trousers, elder);
  beam([-.60, .28, .31], [.15, .17, .62], .13, palette.trousers, elder);
  beam([.60, .28, .31], [-.18, .19, .67], .13, '#514539', elder);
  sphere(-.23, .17, .68, .17, .085, .14, '#443e32', elder);
  sphere(.22, .15, .63, .17, .08, .14, '#443e32', elder);
  // Button placket, folded collar and the worn patch on his pocket.
  box(0, 1.0, .26, .046, .68, .018, '#a68a69', body, false);
  for (let i = 0; i < 4; i++) sphere(0, .74 + i * .16, .282, .018, .018, .014, '#d9c6a0', body, false);
  const collarL = box(-.10, 1.37, .19, .14, .16, .045, '#b49a7b', body); collarL.rotation.z = .45;
  const collarR = box(.10, 1.37, .19, .14, .16, .045, '#b49a7b', body); collarR.rotation.z = -.45;
  box(-.20, 1.09, .242, .13, .15, .025, '#927256', body, false);
  box(-.20, 1.16, .26, .14, .018, .026, '#bb9970', body, false);
  cylinder(0, 1.48, .015, .12, .25, palette.skin, body);
  const head = new THREE.Group(); head.position.set(0, 1.79, .035); body.add(head);
  sphere(0, .08, 0, .30, .38, .28, '#dbad86', head);
  // Soft cheekbones and a narrow chin make the face read as an elderly person
  // rather than a perfectly round toy head, even at portrait-stream size.
  for (const side of [-1, 1]) sphere(side * .175, -.027, .195, .101, .115, .068, '#d6a17b', head, false);
  sphere(-.30, .08, 0, .065, .12, .065, palette.skin, head);
  sphere(.30, .08, 0, .065, .12, .065, palette.skin, head);
  sphere(-.307, .08, .03, .025, .06, .03, '#b88563', head, false);
  sphere(.307, .08, .03, .025, .06, .03, '#b88563', head, false);
  // Thin white hair is swept back, exposing the lined forehead.
  for (let i = 0; i < 11; i++) {
    const a = .28 + i / 10 * Math.PI * 1.75;
    const lock = sphere(Math.cos(a) * .254, .33 + Math.sin(a * 1.1) * .028, Math.sin(a) * .18 - .045, .10, .075, .09, i % 2 ? palette.hair : '#d2d0c4', head);
    lock.rotation.z = Math.cos(a) * -.35;
  }
  sphere(-.27, .21, -.04, .06, .17, .12, palette.hair, head);
  sphere(.27, .21, -.04, .06, .17, .12, palette.hair, head);
  sphere(0, .16, -.21, .24, .22, .08, '#d4d3c4', head);
  for (const x of [-.13, .13]) {
    sphere(x, .132, .245, .058, .027, .027, '#aa805e', head, false);
    sphere(x, .140, .268, .042, .018, .014, '#ded8b9', head, false);
    sphere(x, .142, .280, .017, .018, .009, '#444637', head, false);
    sphere(x - .005, .148, .288, .005, .005, .004, '#fff0cf', head, false);
    const brow = sphere(x, .205, .242, .070, .014, .024, '#d5d2bd', head, false); brow.rotation.z = x < 0 ? .22 : -.22;
    line([[x - .048, .098, .263], [x, .087, .274], [x + .045, .100, .263]], '#ab7e5d', head, .7);
  }
  const eyelids = [];
  for (const x of [-.13, .13]) eyelids.push(sphere(x, .14, .28, .049, .005, .015, palette.skin, head, false));
  sphere(0, .045, .29, .061, .12, .085, palette.skin, head);
  sphere(0, -.016, .325, .073, .050, .055, '#d2a17c', head);
  for (const x of [-.043, .043]) sphere(x, -.045, .355, .016, .010, .009, '#a67755', head, false);
  for (let i = 0; i < 3; i++) {
    const yy = .255 + i * .04;
    line([[-.14, yy, .211 - i * .009], [0, yy + .008, .267 - i * .016], [.14, yy, .211 - i * .009]], '#b28b6c', head, .65);
  }
  for (const s of [-1, 1]) {
    line([[s * .20, .08, .235], [s * .24, .055, .205]], '#a87858', head, .6);
    line([[s * .20, .13, .235], [s * .26, .14, .19]], '#a87858', head, .6);
    line([[s * .11, -.032, .277], [s * .145, -.09, .254], [s * .12, -.14, .246]], '#b28060', head, .6);
    const moustache = sphere(s * .067, -.095, .283, .083, .032, .048, palette.hair, head);
    moustache.rotation.z = s * -.16;
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -.145, .20); head.add(jaw);
  sphere(0, -.034, .01, .12, .071, .065, '#d9a783', jaw, false);
  line([[-.080, .003, .065], [-.037, -.014, .080], [0, -.020, .084], [.037, -.014, .080], [.080, .003, .065]], '#805541', jaw);
  sphere(0, -.016, .045, .065, .014, .020, '#845a43', jaw, false);
  sphere(0, -.062, .015, .13, .11, .075, palette.hair, jaw);
  const beard = mesh(new THREE.ConeGeometry(.10, .23, 7), '#e3dfcc', jaw); beard.position.set(0, -.185, .01); beard.rotation.z = Math.PI;
  // Fingers remain separate so a wave reads clearly at live-stream size.
  function arm(side) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .30, 1.31, 0); body.add(shoulder);
    beam([0, 0, 0], [side * .16, -.32, .015], .12, palette.shirt, shoulder);
    cylinder(side * .15, -.30, .017, .124, .08, '#ba9c78', shoulder);
    const elbow = new THREE.Group(); elbow.position.set(side * .16, -.33, .015); shoulder.add(elbow);
    beam([0, 0, 0], [side * .018, -.32, .22], .069, palette.skinLight, elbow);
    const hand = new THREE.Group(); hand.position.set(side * .018, -.33, .22); elbow.add(hand);
    sphere(0, 0, 0, .072, .10, .045, palette.skinLight, hand);
    for (let i = 0; i < 4; i++) beam([-.047 + i * .03, -.06, .005], [-.049 + i * .03, -.15 + Math.abs(i - 1.5) * .009, .008], .013, palette.skinLight, hand, false);
    beam([side * .06, .005, .006], [side * .10, -.045, .024], .021, palette.skin, hand, false);
    return { shoulder, elbow, hand };
  }
  const leftArm = arm(-1), rightArm = arm(1);
  const fan = new THREE.Group(); fan.position.set(-.03, -.09, .02); fan.rotation.set(.3, .1, -.6); leftArm.hand.add(fan);
  const fanShape = new THREE.Shape(); fanShape.moveTo(0, 0);
  fanShape.absarc(0, 0, .35, .12, Math.PI - .12, false); fanShape.lineTo(0, 0);
  const fanMesh = mesh(new THREE.ShapeGeometry(fanShape), material('#d5bd83', { side: THREE.DoubleSide }), fan, false);
  for (let i = 0; i < 9; i++) {
    const a = .14 + i / 8 * (Math.PI - .28);
    line([[0, 0, .003], [Math.cos(a) * .34, Math.sin(a) * .34, .003]], '#a68a55', fan);
  }
  beam([0, -.11, 0], [0, .1, 0], .016, '#8e6842', fan);
  const handCup = new THREE.Group(); handCup.visible = false; handCup.position.set(0, -.05, .09); rightArm.hand.add(handCup);
  cylinder(0, 0, 0, .09, .16, '#cbd6c2', handCup); cylinder(0, .083, 0, .076, .008, '#8d7544', handCup, .076, false);

  // The phone is attached to his palm, rather than floating as a LIVE badge.
  const phone = new THREE.Group(); phone.visible = false; phone.position.set(0, .13, .08); rightArm.hand.add(phone);
  box(0, 0, 0, .29, .50, .055, '#252d2d', phone);
  box(0, 0, .032, .245, .438, .008, '#6b9d93', phone, false);
  const phoneScreen = label('LIVE', 'ÔNG BA CHÀO CẢ NHÀ', .235, .39, '#48736c', '#fff1bf', phone, 'Arial');
  phoneScreen.position.set(0, 0, .04);
  sphere(.077, .204, .042, .019, .019, .006, material('#e35d4e', { emissive: '#d64135', emissiveIntensity: .7 }), phone, false);
  box(0, -.223, .04, .076, .010, .008, '#b6c9bb', phone, false);

  // A recognisable acoustic guitar rests across his lap; both hands actually
  // reach the fretboard and strings through a two-joint arm pose below.
  const guitar = new THREE.Group(); guitar.visible = false; guitar.position.set(0, .77, .41); guitar.rotation.z = -.10; body.add(guitar);
  sphere(.18, -.025, 0, .33, .36, .105, '#86562f', guitar);
  sphere(-.055, .145, 0, .245, .275, .096, '#86562f', guitar);
  sphere(.18, -.02, .055, .304, .335, .069, '#d0a165', guitar, false);
  sphere(-.05, .14, .05, .222, .251, .063, '#d0a165', guitar, false);
  const rosette = ring(.025, .105, .116, .112, .014, '#88633d', guitar); rosette.rotation.z = -.2;
  cylinder(.025, .105, .125, .091, .008, '#3c3529', guitar).rotation.x = Math.PI / 2;
  const neck = box(-.48, .265, .018, .76, .112, .080, '#745235', guitar); neck.rotation.z = -.20;
  const fretboard = box(-.48, .266, .064, .77, .082, .012, '#49392b', guitar, false); fretboard.rotation.z = -.20;
  const guitarHead = box(-.945, .365, .025, .23, .17, .086, '#92683c', guitar); guitarHead.rotation.z = -.20;
  for (let i = 0; i < 7; i++) {
    const x = -.77 + i * .095, y = .265 - (x + .48) * .20;
    line([[x, y - .036, .074], [x, y + .036, .074]], '#c2af83', guitar);
  }
  for (let i = 0; i < 6; i++) {
    const dy = (i - 2.5) * .010;
    line([[-1.01, .383 + dy, .078], [.28, -.032 + dy, .131]], '#e1d3a9', guitar);
    sphere(-.99 + (i % 3) * .07, .365 + (i < 3 ? .105 : -.105), .025, .026, .020, .035, '#c9c6ae', guitar, false);
  }
  const bridge = box(.27, -.033, .128, .055, .16, .018, '#6b4b2e', guitar, false); bridge.rotation.z = -.20;

  const armUpper = new THREE.Vector3(), armLower = new THREE.Vector3(), armTarget = new THREE.Vector3();
  const armAxis = new THREE.Vector3(), armBend = new THREE.Vector3(), armElbow = new THREE.Vector3();
  const armQ = new THREE.Quaternion(), armInv = new THREE.Quaternion();
  function poseArm(limb, side, target, blend = 1) {
    armUpper.set(side * .16, -.33, .015); armLower.set(side * .018, -.33, .22);
    const a = armUpper.length(), b = armLower.length();
    armTarget.copy(target).sub(limb.shoulder.position);
    const distance = THREE.MathUtils.clamp(armTarget.length(), .08, a + b - .005);
    armAxis.copy(armTarget).normalize();
    armBend.set(side * .7, -.15, .8).addScaledVector(armAxis, -new THREE.Vector3(side * .7, -.15, .8).dot(armAxis)).normalize();
    const cosine = THREE.MathUtils.clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1);
    armElbow.copy(armAxis).multiplyScalar(a * cosine).addScaledVector(armBend, a * Math.sqrt(1 - cosine * cosine));
    armQ.setFromUnitVectors(armUpper.clone().normalize(), armElbow.clone().normalize());
    limb.shoulder.quaternion.slerp(armQ, blend);
    armInv.copy(limb.shoulder.quaternion).invert();
    armTarget.sub(armElbow).normalize().applyQuaternion(armInv);
    armQ.setFromUnitVectors(armLower.clone().normalize(), armTarget);
    limb.elbow.quaternion.slerp(armQ, blend);
  }
  const rightPoseTarget = new THREE.Vector3(), leftPoseTarget = new THREE.Vector3(), cameraLocalQ = new THREE.Quaternion();

  // The shop: weathered timber, green striped awning, glass jars and sweet boxes.
  const shop = new THREE.Group(); shop.position.set(1.60, .11, -.90); shop.rotation.y = -.09; staticRoot.add(shop);
  const shopAnimated = new THREE.Group(); shop.add(shopAnimated);
  const shopW = 2.36, shopD = 1.10;
  for (const x of [-1.09, 1.09]) for (const z of [-.48, .48]) {
    box(x, .55, z, .09, 1.1, .09, palette.wood, shop);
    if (z < 0) box(x, 1.95, z, .075, 3.85, .075, palette.wood, shop);
  }
  box(0, 1.10, 0, shopW, .11, shopD, '#9a7347', shop);
  box(0, .67, 0, 2.20, .08, .97, '#8b6844', shop);
  for (let i = 0; i < 7; i++) box(-1 + i * .33, .55, -.50, .30, 1.05, .05, i % 2 ? '#9e784d' : '#a58050', shop);
  box(0, .77, .55, shopW, .55, .065, '#4e735d', shop);
  const counterText = label('BÁNH KẸO · NƯỚC MÁT', 'TIỆM NHỎ, TẤM LÒNG TO', 2.11, .43, '#4f705b', '#eadaad', shop);
  counterText.position.set(0, .78, .59);
  // Rear shelves and goods.
  box(0, 1.92, -.49, 2.27, 1.62, .07, '#7b5a38', shop);
  for (const yy of [1.29, 1.78, 2.32]) box(0, yy, -.25, 2.27, .065, .55, '#ab8350', shop);
  const snackColors = ['#b95539', '#d9b555', '#658d7c', '#c88364', '#d7d1ac'];
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 6), col = i % 6;
    const c = snackColors[(i * 3) % snackColors.length];
    if (row === 1) {
      cylinder(-.90 + col * .35, 1.96, -.22, .11, .27, '#cbd8c0', shop, .11);
      cylinder(-.90 + col * .35, 2.105, -.22, .115, .045, '#a88b4e', shop);
      box(-.90 + col * .35, 1.97, -.101, .14, .12, .008, c, shop, false);
    } else {
      box(-.90 + col * .35, 1.47 + (row ? .99 : 0), -.22, .23, .27, .20, c, shop);
      box(-.90 + col * .35, 1.48 + (row ? .99 : 0), -.113, .14, .11, .008, '#ead6a3', shop, false);
    }
  }
  // Small front row of glass drink bottles with coloured paper labels.
  for (let i = 0; i < 5; i++) {
    const x = -.82 + i * .29;
    cylinder(x, 1.36, .17, .09, .38, '#cbdcc7', shop, .075);
    cylinder(x, 1.61, .17, .045, .13, '#cbdcc7', shop);
    cylinder(x, 1.69, .17, .05, .04, '#e7dfbb', shop);
    box(x, 1.36, .265, .13, .16, .01, snackColors[i], shop, false);
  }
  for (let i = 0; i < 4; i++) box(.57 + (i % 2) * .29, 1.22 + Math.floor(i / 2) * .13, .21, .27, .12, .34, snackColors[i], shop);
  // Striped awning, with scalloped valance and a wooden shop sign.
  for (let i = 0; i < 10; i++) {
    const x = -1.25 + i * .277;
    const stripe = box(x, 3.04, -.08, .278, .055, 2.08, i % 2 ? '#e7d6a2' : '#527662', shop);
    stripe.rotation.x = -.14;
    box(x, 2.85, .95, .278, .23, .045, i % 2 ? '#e7d6a2' : '#527662', shop);
    sphere(x, 2.74, .95, .139, .075, .027, i % 2 ? '#e7d6a2' : '#527662', shop);
  }
  beam([-1.39, 3.22, -.96], [1.39, 3.22, -.96], .055, '#66563c', shop);
  box(0, 3.53, -.50, 2.72, .60, .12, '#8b5637', shop);
  const shopSign = label('TẠP HÓA ÔNG BA', 'TỪNG MÓN NHỎ · MỘT NIỀM VUI', 2.60, .49, '#b66c43', '#f6e7b9', shop);
  shopSign.position.set(0, 3.53, -.429);
  for (let i = 0; i < 7; i++) {
    const x = -.88 + i * .29;
    const sachet = box(x, 2.58 + (i % 2) * .035, -.05, .17, .23, .045, snackColors[i % 5], shop);
    sachet.rotation.z = Math.sin(i) * .12;
    box(x, 2.66 + (i % 2) * .035, -.022, .12, .045, .008, '#e7d4ac', shop, false);
    line([[x, 2.72, -.04], [x, 2.90, -.12]], '#b9ad83', shop);
  }
  // Tier upgrades appear physically as bunting, extra produce and a larger sign.
  const upgrades = new THREE.Group(); upgrades.visible = false; shop.add(upgrades);
  line([[-1.3, 3.8, -.43], [0, 3.55, -.2], [1.3, 3.8, -.43]], '#b9a978', upgrades);
  for (let i = 0; i < 8; i++) {
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-.09, 0, 0, .09, 0, 0, 0, -.21, 0], 3)); tri.computeVertexNormals();
    const flag = mesh(tri, material(snackColors[i % 5], { side: THREE.DoubleSide }), upgrades, false);
    flag.position.set(-1.1 + i * .315, 3.61 + Math.abs(3.5 - i) * .043, -.21);
  }
  const basket = new THREE.Group(); basket.position.set(2.8, .12, .55); staticRoot.add(basket);
  cylinder(0, .20, 0, .40, .36, '#a48650', basket, .47);
  for (let i = 0; i < 5; i++) {
    const hoop = ring(0, .08 + i * .066, 0, .4 + i * .015, .012, '#d1b574', basket); hoop.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4, r = .07 + .055 * (i % 5);
    sphere(Math.cos(a) * r, .40 + (i > 8 ? .09 : 0), Math.sin(a) * r, .11, .11, .11, i % 3 ? '#8f9b47' : '#d2a84b', basket);
  }
  const crate = new THREE.Group(); crate.position.set(3.05, .12, -1.53); crate.rotation.y = -.15; staticRoot.add(crate);
  box(0, .30, 0, .63, .6, .65, '#a78350', crate);
  for (let i = 0; i < 3; i++) { box(0, .13 + i * .18, .334, .58, .025, .014, '#715b3d', crate, false); box(.325, .13 + i * .18, 0, .014, .025, .60, '#715b3d', crate, false); }
  // A red cooler and a tiny handwritten sidewalk chalkboard.
  box(.45, .36, -2.25, .78, .58, .63, '#a94f3d');
  box(.45, .67, -2.25, .86, .07, .68, '#e5dac1');
  box(.45, .38, -1.922, .21, .11, .024, '#e5dac1', staticRoot, false);
  const chalk = new THREE.Group(); chalk.position.set(3.1, .11, 1.0); chalk.rotation.y = -.18; staticRoot.add(chalk);
  beam([-.30, .05, -.18], [-.30, 1.25, .02], .027, '#8d6f45', chalk);
  beam([.30, .05, -.18], [.30, 1.25, .02], .027, '#8d6f45', chalk);
  beam([-.30, .05, .36], [-.30, 1.23, .02], .027, '#8d6f45', chalk);
  beam([.30, .05, .36], [.30, 1.23, .02], .027, '#8d6f45', chalk);
  const menu = label('MỜI GHÉ CHƠI', 'TRÀ ĐÁ  ·  BÁNH KẸO', .72, .89, '#405d4a', '#eee0b2', chalk);
  menu.position.set(0, .77, .065); menu.rotation.x = -.15;
  box(0, .27, .115, .76, .06, .08, '#b58f53', chalk);

  // Stools, a little water jar and potted plants give the scene a lived-in scale.
  function stool(x, z, color, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, .1, z); g.scale.setScalar(scale); staticRoot.add(g);
    cylinder(0, .48, 0, .26, .085, color, g);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      beam([Math.cos(a) * .22, .04, Math.sin(a) * .22], [Math.cos(a) * .16, .46, Math.sin(a) * .16], .033, color, g);
    }
    const rr = ring(0, .21, 0, .20, .018, color, g); rr.rotation.x = Math.PI / 2;
    return g;
  }
  const stools=[stool(-2.47, -.8, '#7d7652', .93),stool(.35, .61, '#986c43', .74),stool(2.85, -2.55, '#836547', .9)];
  const waterJar = sphere(-2.49, .46, -2.34, .37, .51, .37, '#735e48');
  cylinder(-2.49, .95, -2.34, .26, .08, '#a98c63');
  cylinder(-2.49, .99, -2.34, .21, .025, '#494c3d');
  function plant(x, z, scale = 1) {
    const p = new THREE.Group(); p.position.set(x, .13, z); p.scale.setScalar(scale); staticRoot.add(p);
    cylinder(0, .22, 0, .25, .43, '#aa6e49', p, .31);
    cylinder(0, .45, 0, .32, .065, '#bd8157', p);
    cylinder(0, .49, 0, .28, .015, '#5a5941', p);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      beam([0, .45, 0], [Math.cos(a) * .22, .90 + .12 * (i % 2), Math.sin(a) * .22], .017, '#778454', p, false);
      const leaf = sphere(Math.cos(a) * .24, .94 + .12 * (i % 2), Math.sin(a) * .24, .12, .26, .045, i % 2 ? '#6a8051' : '#889758', p);
      leaf.rotation.z = -Math.cos(a) * .50; leaf.rotation.y = -a;
    }
    return p;
  }
  const plants=[plant(-3.25,-2.2,1.2),plant(3.48,-2.5,.86),plant(-3.5,.6,.75)];

  // Old bicycle leans against the tree.
  const bike = new THREE.Group(); bike.position.set(-3.65, .64, -1.60); bike.rotation.set(0, -.12, -.09); bike.scale.setScalar(.87); staticRoot.add(bike);
  for (const x of [-.7, .7]) {
    ring(x, 0, 0, .48, .035, '#504e3e', bike); ring(x, 0, .003, .44, .013, '#b7b7a0', bike);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; line([[x, 0, .008], [x + Math.cos(a) * .44, Math.sin(a) * .44, .008]], '#a5a58f', bike); }
  }
  for (const [a, b] of [
    [[-.7, 0, 0], [-.2, .63, 0]], [[-.7, 0, 0], [0, .02, 0]], [[-.2, .63, 0], [0, .02, 0]],
    [[-.2, .63, 0], [.50, .69, 0]], [[0, .02, 0], [.50, .69, 0]], [[.5, .69, 0], [.7, 0, 0]],
    [[.5, .69, 0], [.43, .95, 0]], [[-.2, .63, 0], [-.23, .83, 0]],
  ]) beam(a, b, .027, '#607a68', bike);
  box(-.25, .88, 0, .31, .07, .18, '#4d4b3c', bike);
  beam([.43, .95, -.15], [.43, .95, .17], .025, '#c2bba4', bike);
  box(.71, .67, .015, .34, .30, .32, '#aa8c5b', bike);
  for (let i = 0; i < 4; i++) box(.70, .57 + i * .06, .183, .30, .013, .008, '#d3b47a', bike, false);

  // Overhead festoon lights and fabric flags.
  const lampMaterials = [], lamps = [];
  const wirePoints = [];
  for (let i = 0; i <= 20; i++) { const x = -4.4 + i / 20 * 8.1; wirePoints.push([x, 5.05 - Math.sin(i / 20 * Math.PI) * .65, -2.6]); }
  line(wirePoints, '#736a4e');
  for (let i = 0; i < 9; i++) {
    const t = (i + .5) / 9, x = -4.4 + t * 8.1, y = 5.05 - Math.sin(t * Math.PI) * .65;
    line([[x, y, -2.6], [x, y - .12, -2.6]], '#6e654a');
    cylinder(x, y - .13, -2.6, .055, .09, '#786345');
    const lm = material('#f5d08c', { emissive: '#f2aa43', emissiveIntensity: .15 + i * .00001 }); lampMaterials.push(lm);
    sphere(x, y - .245, -2.6, .08, .12, .08, lm);
    if (i === 2 || i === 6) { const light = new THREE.PointLight('#ffc570', 0, 5); light.position.set(x, y - .35, -2.6); scene.add(light); lamps.push(light); }
  }

  // Lazy ginger cat, brought out by gifts or simply passing through the shop.
  const cat = new THREE.Group(); cat.position.set(-6, .15, 1.5); cat.visible = false; animatedRoot.add(cat);
  sphere(0, .31, 0, .32, .20, .15, '#c58a50', cat);
  sphere(.28, .48, .01, .17, .16, .14, '#d6a36a', cat);
  for (const z of [-.09, .09]) {
    const e = mesh(geos.cone, '#ba7a47', cat); e.position.set(.29, .67, z); e.scale.set(.07, .15, .065); e.rotation.z = -.15;
    sphere(.424, .49, z * .65, .016, .025, .016, '#65724b', cat, false);
  }
  sphere(.45, .44, .01, .055, .035, .055, '#e5ccb0', cat, false);
  sphere(.494, .46, .01, .016, .017, .023, '#8e6451', cat, false);
  for (const z of [-.065, .065]) line([[.45, .43, z], [.46, .45, z * 2.6]], '#ebd8b6', cat);
  const catLegs = [];
  for (const x of [-.20, .19]) for (const z of [-.085, .085]) {
    const leg = box(x, .12, z, .075, .26, .075, '#c18a54', cat); catLegs.push(leg);
  }
  const catTail = new THREE.Group(); catTail.position.set(-.28, .35, 0); cat.add(catTail);
  beam([0, 0, 0], [-.18, .22, .04], .045, '#c18449', catTail);
  beam([-.18, .22, .04], [-.20, .46, .02], .038, '#c18449', catTail);
  for (let i = 0; i < 3; i++) box(-.11 + i * .12, .44, 0, .04, .03, .25, '#a97041', cat, false);

  // Local villagers have original faces, clothes and bags; they are never
  // presented as TikTok users. Real viewers receive separate photo-head actors.
  function neighbour(isWoman, style = {}) {
    const g = new THREE.Group(); g.visible = false; animatedRoot.add(g);
    const skin = style.skin || '#d4a277', hair = style.hair || (isWoman ? '#44473a' : '#737366');
    const shirt = style.shirt || (isWoman ? '#a46d60' : '#6e8c7a'), trousers = style.trousers || '#414e43';
    const personHead = new THREE.Group(); g.add(personHead);
    sphere(0, 1.57, 0, .18, .23, .17, skin, personHead);
    sphere(0, 1.73, -.015, .19, .12, .18, hair, personHead);
    if (isWoman) sphere(0, 1.64, -.18, .12, .12, .09, hair, personHead);
    if (style.hat) { const hat = mesh(geos.cone, '#c5ae79', personHead); hat.position.set(0, 1.88, 0); hat.scale.set(.34, .18, .34); }
    const torso = cylinder(0, 1.02, 0, .22, .73, shirt, g, .19);
    box(0, .71, 0, .34, .13, .26, trousers, g);
    for (const x of [-.065, .065]) sphere(x, 1.6, .155, .013, .016, .012, '#3e4434', personHead, false);
    sphere(0, 1.54, .17, .026, .045, .035, '#c18c64', personHead);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * .11, .69, 0); g.add(leg);
      box(0, -.30, 0, .14, .59, .15, trousers, leg);
      box(0, -.61, .04, .15, .07, .27, '#463f32', leg); legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(side * .22, 1.31, 0); g.add(arm);
      beam([0, 0, 0], [side * .02, -.34, 0], .072, shirt, arm);
      beam([side * .02, -.34, 0], [side * .03, -.60, .04], .048, skin, arm);
      sphere(side * .03, -.62, .04, .053, .08, .047, skin, arm); arms.push(arm);
    }
    if (isWoman) {
      const scarf = box(0, 1.35, .15, .34, .12, .09, '#d3c5a4', g); scarf.rotation.z = -.12;
      box(-.14, 1.10, .18, .09, .48, .04, '#d3c5a4', g);
      const bag = new THREE.Group(); bag.position.set(.31, .58, 0); g.add(bag);
      cylinder(0, 0, 0, .16, .28, '#b69859', bag, .19);
      const handle = ring(0, .17, 0, .14, .015, '#b69859', bag);
    }
    return { group: g, head: personHead, legs, arms, progress: -1, direction: 1, duration: 15, lane: 3.2, stride: 4 };
  }
  const neighbours = [
    neighbour(true, {shirt:'#a46d60',hair:'#44473a'}),
    neighbour(false, {shirt:'#6e8c7a',hair:'#737366'}),
    neighbour(false, {shirt:'#687fa0',hair:'#45443c',hat:true}),
    neighbour(true, {shirt:'#b29a5c',hair:'#5b5147',skin:'#c49b76'}),
    neighbour(false, {shirt:'#8b765f',hair:'#ddd8c6',trousers:'#514a42'}),
    neighbour(true, {shirt:'#788a9e',hair:'#3f4038',hat:true}),
  ];
  neighbours.forEach((n,i)=>{n.group.scale.setScalar([.95,1.02,.96,.90,1.04,.94][i]);});

  const visitorQueue = createVisitorQueue({capacity:64,maxAge:90});
  const viewerActors = [];
  let viewerSpawnAt=0, viewerSequence=0, viewerFailures=0;
  for (let i=0;i<4;i++) {
    const actor=neighbour(i%2===0,{shirt:['#698f87','#bd8b69','#8d8b62','#7a8fa9'][i],hair:'#50483e'});
    actor.group.scale.setScalar(.94);actor.head.visible=false;actor.state='idle';actor.entry=null;actor.texture=null;actor.request=null;actor.serial=0;
    actor.photoHead=new THREE.Group();actor.photoHead.position.set(0,1.59,.035);actor.group.add(actor.photoHead);
    mesh(new THREE.CircleGeometry(.35,40),new THREE.MeshBasicMaterial({color:'#e8cc8a',side:THREE.DoubleSide}),actor.photoHead,false);
    actor.photoMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide,transparent:true});
    const photo=mesh(new THREE.CircleGeometry(.318,40),actor.photoMaterial,actor.photoHead,false);photo.position.z=.008;
    actor.nameCanvas=document.createElement('canvas');actor.nameCanvas.width=768;actor.nameCanvas.height=160;
    actor.nameTexture=new THREE.CanvasTexture(actor.nameCanvas);actor.nameTexture.colorSpace=THREE.SRGBColorSpace;
    actor.nameplate=mesh(new THREE.PlaneGeometry(1.65,.31),new THREE.MeshBasicMaterial({map:actor.nameTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false}),actor.group,false);
    actor.nameplate.position.set(0,2.08,.045);viewerActors.push(actor);
  }
  function clearViewerActor(actor) {
    actor.serial++;actor.request?.abort();actor.request=null;
    actor.group.visible=false;actor.photoMaterial.map=null;actor.photoMaterial.needsUpdate=true;
    actor.texture?.dispose();actor.texture=null;
    if(actor.entry)visitorQueue.complete(actor.entry.key);
    actor.entry=null;actor.state='idle';actor.progress=-1;
  }
  function drawViewerName(actor,entry) {
    const context=actor.nameCanvas.getContext('2d');context.clearRect(0,0,768,160);
    context.fillStyle=entry.demo?'rgba(99,78,47,.95)':'rgba(43,65,46,.95)';context.beginPath();context.roundRect(5,14,758,132,28);context.fill();
    context.strokeStyle='#e2c78a';context.lineWidth=4;context.stroke();context.fillStyle='#fff0cc';context.textAlign='center';context.textBaseline='middle';
    context.font='600 56px "Be Vietnam Pro","Segoe UI",Arial,sans-serif';context.fillText(entry.user,384,82,710);actor.nameTexture.needsUpdate=true;
  }
  async function loadViewerAvatar(actor,entry) {
    const serial=++actor.serial,controller=new AbortController();actor.request=controller;actor.entry=entry;actor.state='loading';actor.group.visible=false;
    const timeout=setTimeout(()=>controller.abort(),6000);let objectURL,image;
    try {
      const response=await fetch(entry.avatar,{signal:controller.signal});if(!response.ok)throw Error('Không có avatar người xem');
      const blob=await response.blob();
      // The proxy returns SVG only as a fallback. A real viewer must never be
      // shown with that fallback, or with the previous occupant's photograph.
      if(blob.size>1000000||(!entry.demo&&!/^image\/(?:png|jpe?g|webp|gif)$/i.test(blob.type)))throw Error('Thiếu ảnh avatar thật');
      if(controller.signal.aborted)throw Error('Avatar quá hạn');
      objectURL=URL.createObjectURL(blob);image=new Image();image.src=objectURL;
      await Promise.race([image.decode(),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Avatar quá hạn')),{once:true}))]);
      if(controller.signal.aborted||serial!==actor.serial||disposed)return;
      if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>4096||image.naturalHeight>4096)throw Error('Kích thước avatar không hợp lệ');
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');
      const edge=Math.min(image.naturalWidth,image.naturalHeight);context.drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,256,256);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      if(serial!==actor.serial||disposed){texture.dispose();return;}
      actor.texture?.dispose();actor.texture=texture;actor.photoMaterial.map=texture;actor.photoMaterial.needsUpdate=true;
      drawViewerName(actor,entry);actor.state='ready';
    } catch {
      if(serial===actor.serial&&!disposed){viewerFailures++;clearViewerActor(actor);}
    } finally {
      clearTimeout(timeout);if(objectURL)URL.revokeObjectURL(objectURL);if(controller.signal.aborted&&image)image.src='';if(actor.request===controller)actor.request=null;
    }
  }

  // Gift interactions use reusable meshes so a busy LIVE never grows the scene.
  // Deliveries appear beside the mat, leaving the tea tray and grandfather clear.
  const delivery = new THREE.Group(); delivery.position.set(-2.15, .16, 1.14); delivery.visible = false; animatedRoot.add(delivery);
  const giftProps = {};
  function giftProp(name) { const g = new THREE.Group(); g.visible = false; delivery.add(g); giftProps[name] = g; return g; }
  function deliveryCrate(g, color = '#ac8150') {
    box(0, .18, 0, .78, .30, .57, color, g);
    for (let i = 0; i < 3; i++) box(0, .07 + i * .11, .293, .74, .018, .014, '#725b3d', g, false);
    for (const x of [-.4, .4]) box(x, .24, 0, .045, .40, .59, '#b9935a', g);
  }
  const vegProp = giftProp('vegetables'); deliveryCrate(vegProp);
  for (let i = 0; i < 5; i++) {
    const x = -.27 + i * .13, z = i % 2 ? .13 : -.08;
    sphere(x, .45, z, .12, .14, .12, i % 2 ? '#7f9b4d' : '#a2b86b', vegProp);
    for (let j = 0; j < 3; j++) {
      const leaf = sphere(x + (j - 1) * .045, .57, z, .035, .12, .017, '#558052', vegProp, false); leaf.rotation.z = (j - 1) * .4;
    }
  }
  const snackProp = giftProp('snack'); deliveryCrate(snackProp, '#a36d41');
  for (let i = 0; i < 6; i++) {
    const packet = box(-.25 + (i % 3) * .23, .43, -.12 + Math.floor(i / 3) * .24, .17, .25, .11, snackColors[i % 5], snackProp);
    packet.rotation.z = (i % 3 - 1) * .13;
    box(packet.position.x, .44, packet.position.z + .062, .10, .07, .008, '#f1dbb4', snackProp, false);
  }
  const materialProp = giftProp('materials');
  for (let i = 0; i < 5; i++) box(0, .07 + i * .07, 0, .96, .055, .46, i % 2 ? '#b48c54' : '#a07845', materialProp);
  for (let i = 0; i < 4; i++) {
    const brick = box(-.26 + (i % 2) * .30, .43 + Math.floor(i / 2) * .13, .02, .27, .12, .34, '#ad6048', materialProp); brick.rotation.y = .05;
  }
  const milkProp = giftProp('milk'); deliveryCrate(milkProp, '#8b9c83');
  for (const x of [-.23, 0, .23]) {
    cylinder(x, .49, 0, .084, .34, '#ecebd9', milkProp, .065);
    cylinder(x, .69, 0, .055, .075, '#ecebd9', milkProp);
    cylinder(x, .735, 0, .063, .035, '#6f99a4', milkProp);
    box(x, .48, .083, .10, .13, .008, '#8fbdc4', milkProp, false);
  }
  const cakeProp = giftProp('cake');
  cylinder(0, .08, 0, .49, .045, '#d8c39a', cakeProp);
  cylinder(0, .25, 0, .37, .30, '#d8ac6b', cakeProp);
  cylinder(0, .41, 0, .38, .075, '#f2e4bc', cakeProp);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    sphere(Math.cos(a) * .26, .49, Math.sin(a) * .26, .075, .065, .075, i % 2 ? '#bd684f' : '#e6d6a3', cakeProp);
  }
  cylinder(0, .57, 0, .022, .24, '#679a9d', cakeProp, .022, false);
  sphere(0, .73, 0, .032, .062, .026, material('#eec36d', { emissive: '#e8a84b', emissiveIntensity: .6 }), cakeProp, false);

  // Each permanent tier adds a visible part to the physical shop, centred on
  // the open area by the mat instead of behind the right-hand gift menu.
  const levelDecor = [];
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.visible = false; animatedRoot.add(g); levelDecor.push(g); }
  const extraShelf = levelDecor[0]; extraShelf.position.set(-2.78, .10, .15); extraShelf.rotation.y = -.10;
  for (const x of [-.39, .39]) for (const z of [-.23, .23]) box(x, .55, z, .055, 1.08, .055, '#8b6c43', extraShelf);
  for (const y of [.22, .71]) {
    box(0, y, 0, .86, .075, .57, '#b48c50', extraShelf);
    box(0, y + .13, -.26, .86, .22, .035, '#957044', extraShelf);
    for (let i = 0; i < 4; i++) sphere(-.28 + i * .18, y + .16, 0, .10, .12, .11, i % 2 ? '#94aa5c' : '#c3ac4f', extraShelf);
  }
  const widerAwning = levelDecor[1];
  for (const x of [-2.55, .43]) {
    cylinder(x, 1.66, .55, .045, 3.15, '#8b6c43', widerAwning);
    sphere(x, 3.28, .55, .065, .08, .065, '#c7a96d', widerAwning);
  }
  for (let i = 0; i < 11; i++) {
    const roof = box(-2.45 + i * .29, 3.27, -.12, .293, .045, 1.48, i % 2 ? '#7d9271' : '#e4d8ac', widerAwning); roof.rotation.x = -.11;
    box(-2.45 + i * .29, 3.08, .60, .293, .20, .035, i % 2 ? '#7d9271' : '#e4d8ac', widerAwning);
  }
  const welcomeCorner = levelDecor[2];
  const bench = new THREE.Group(); bench.position.set(-3.07, .10, -1.14); bench.rotation.y = .25; welcomeCorner.add(bench);
  for (const x of [-.48, .48]) for (const z of [-.15, .15]) box(x, .24, z, .065, .46, .065, '#7a6345', bench);
  box(0, .49, 0, 1.16, .075, .46, '#b69664', bench);
  for (const x of [-.48, .48]) box(x, .78, -.20, .065, .68, .065, '#8a704a', bench);
  box(0, .93, -.20, 1.14, .22, .05, '#b69664', bench);
  const upgradeLamps = [];
  for (const x of [-2.38, .24]) {
    line([[x, 3.29, .30], [x, 2.91, .30]], '#7d6545', welcomeCorner);
    const lm = material('#e9bd70', { emissive: '#e7a653', emissiveIntensity: .5 });
    sphere(x, 2.75, .30, .14, .22, .14, lm, welcomeCorner);
    cylinder(x, 2.96, .30, .10, .035, '#886b43', welcomeCorner);
    cylinder(x, 2.53, .30, .08, .035, '#886b43', welcomeCorner);
    const light = new THREE.PointLight('#ffcb7e', .5, 4); light.position.set(x, 2.70, .40); welcomeCorner.add(light); upgradeLamps.push(light);
  }
  const flowerCorner = levelDecor[3];
  const friendlySign = label('TIỆM THÂN QUEN', 'AI GHÉ CŨNG LÀ NGƯỜI NHÀ', 2.55, .56, '#456853', '#f0dfa5', flowerCorner);
  friendlySign.position.set(-1.18, 3.66, .42);
  for (const x of [-3.26, -.10]) {
    cylinder(x, .28, 1.18, .21, .39, '#a96f4c', flowerCorner, .27);
    cylinder(x, .49, 1.18, .28, .045, '#c18a5b', flowerCorner);
    for (let i = 0; i < 3; i++) {
      const xx = x + (i - 1) * .13, yy = .85 + (i % 2) * .15;
      beam([xx, .49, 1.18], [xx, yy, 1.18], .014, '#6e8f54', flowerCorner, false);
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; sphere(xx + Math.cos(a) * .068, yy + Math.sin(a) * .068, 1.20, .053, .055, .025, i % 2 ? '#d8a37e' : '#d0b75c', flowerCorner, false); }
      sphere(xx, yy, 1.23, .037, .038, .027, '#aa8953', flowerCorner, false);
    }
  }

  const seatedGuest = neighbour(false); seatedGuest.group.visible = false;
  seatedGuest.group.position.set(-2.47, -.10, -.80); seatedGuest.group.rotation.y = .7;
  seatedGuest.head.visible = false;
  seatedGuest.legs.forEach((leg, i) => { leg.visible = false; });
  // A broad visible stool and horizontal thighs make the donor unmistakably
  // seated, even when the portrait camera compresses the depth of the pose.
  const guestStool=new THREE.Group();seatedGuest.group.add(guestStool);
  cylinder(0,.565,-.075,.31,.095,'#b68b55',guestStool);
  cylinder(0,.622,-.075,.285,.025,'#cfaa6c',guestStool,.285,false);
  for(const x of [-.22,.22])for(const z of [-.27,.12])beam([x,.14,z],[x*.88,.54,z*.86],.035,'#86653f',guestStool);
  beam([-.22,.28,-.27],[.22,.28,-.27],.022,'#a47e4d',guestStool);
  for (const side of [-1, 1]) {
    beam([side * .11, .675, 0], [side * .23, .61, .39], .095, '#414e43', seatedGuest.group);
    sphere(side*.23,.60,.39,.102,.10,.095,'#414e43',seatedGuest.group);
    beam([side * .23, .58, .40], [side * .24, .20, .43], .075, '#414e43', seatedGuest.group);
    box(side * .24, .17, .50, .14, .07, .27, '#463f32', seatedGuest.group);
  }
  const guestCup = new THREE.Group(); guestCup.position.set(-.32, .76, .22); seatedGuest.group.add(guestCup);
  cylinder(0, 0, 0, .065, .11, '#e0e4ce', guestCup);

  const avatarHead = new THREE.Group(); avatarHead.position.set(0, 1.59, .035); seatedGuest.group.add(avatarHead);
  const avatarBacking = mesh(new THREE.CircleGeometry(.32, 40), new THREE.MeshBasicMaterial({color:'#ead3a2',side:THREE.DoubleSide}), avatarHead, false);
  const avatarMaterial = new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide,transparent:true});
  const avatarPhoto = mesh(new THREE.CircleGeometry(.29, 40), avatarMaterial, avatarHead, false); avatarPhoto.position.z=.008;
  const nameCanvas = document.createElement('canvas'); nameCanvas.width=768; nameCanvas.height=160;
  const guestNameTexture = new THREE.CanvasTexture(nameCanvas); guestNameTexture.colorSpace=THREE.SRGBColorSpace;
  const guestName = mesh(new THREE.PlaneGeometry(1.45,.30),new THREE.MeshBasicMaterial({map:guestNameTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false}),seatedGuest.group,false);
  guestName.position.set(0,2.11,.04);
  let avatarSerial=0, avatarRequest=null, avatarTexture=null;
  function drawGuestName(name) {
    const context=nameCanvas.getContext('2d'); context.clearRect(0,0,768,160);
    context.fillStyle='rgba(43,65,46,.94)';context.beginPath();context.roundRect(5,14,758,132,28);context.fill();
    context.strokeStyle='#d6bb7f';context.lineWidth=4;context.stroke();context.textAlign='center';context.textBaseline='middle';
    context.fillStyle='#f4e5bd';context.font='600 62px "Segoe UI",Arial,sans-serif';context.fillText(String(name||'Khách ghé tiệm').normalize('NFC').slice(0,36),384,82,710);guestNameTexture.needsUpdate=true;
  }
  function fallbackAvatar(name) {
    const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
    ctx.fillStyle='#6e8d73';ctx.fillRect(0,0,256,256);ctx.fillStyle='#eddbb3';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 104px "Segoe UI",Arial,sans-serif';
    const initials=String(name||'BẠN').normalize('NFC').trim().split(/\s+/u).slice(-2).map(x=>[...x][0]||'').join('').toLocaleUpperCase('vi');ctx.fillText(initials||'B',128,137,225);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
  function applyAvatarTexture(texture) { avatarTexture?.dispose(); avatarTexture=texture;avatarMaterial.map=texture;avatarMaterial.needsUpdate=true; }
  async function setGuestAvatar(effect={}) {
    const serial=++avatarSerial;avatarRequest?.abort();const controller=new AbortController();avatarRequest=controller;
    drawGuestName(effect.user);applyAvatarTexture(fallbackAvatar(effect.user));
    const supplied=typeof effect.avatar==='string'?effect.avatar:'';
    const url=/^\/api\/avatar\?/.test(supplied)||['/avatar-placeholder.svg','/avatar-demo.svg'].includes(supplied)?supplied:'/avatar-placeholder.svg';
    const timeout=setTimeout(()=>controller.abort(),6000);let objectURL;
    try {
      const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Không tải được avatar');
      const blob=await response.blob();if(blob.size>2500000)throw Error('Avatar quá lớn');
      objectURL=URL.createObjectURL(blob);const image=new Image();image.src=objectURL;await image.decode();
      const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      if(serial!==avatarSerial||disposed){texture.dispose();return;}applyAvatarTexture(texture);
    }catch{}finally{clearTimeout(timeout);if(objectURL)URL.revokeObjectURL(objectURL);if(avatarRequest===controller)avatarRequest=null;}
  }
  drawGuestName('Khách ghé tiệm');applyAvatarTexture(fallbackAvatar('Bạn'));

  // The dog reaction has a visible sequence: run in, bark, cock a leg, then leave.
  const dog = new THREE.Group(); dog.visible = false; animatedRoot.add(dog);
  // The torso can shift its weight while the three supporting paws remain planted.
  const dogBody = new THREE.Group(); dog.add(dogBody);
  sphere(0, .43, 0, .38, .25, .20, '#d9c9a4', dogBody);
  const dogHead = new THREE.Group(); dogHead.position.set(.31,.66,.015); dogBody.add(dogHead);
  sphere(0, 0, 0, .22, .23, .20, '#e1d3b5', dogHead);
  sphere(.17, -.07, 0, .14, .10, .13, '#e9dec3', dogHead);
  sphere(.29, -.04, 0, .045, .035, .055, '#47483a', dogHead);
  for (const z of [-.15, .15]) {
    const ear = sphere(-.06, .06, z, .10, .21, .06, '#926e4b', dogHead); ear.rotation.z = -.28;
    sphere(.148, .08, z * .72, .019, .026, .020, '#3f4534', dogHead, false);
  }
  const dogJaw = new THREE.Group();dogJaw.position.set(.105,-.10,0);dogHead.add(dogJaw);
  sphere(.075,-.025,0,.115,.042,.10,'#977355',dogJaw);
  // Legs rotate from the actual hip, then bend at a separate knee and ankle.
  // The near hind leg is on +Z, facing the camera; the old -Z leg was obscured.
  const dogLegs = [];
  for (const x of [-.24, .22]) for (const side of [-1,1]) {
    const rear=x<0,hip=new THREE.Group();hip.position.set(x,.45,side*.145);dog.add(hip);
    sphere(0,-.045,0,rear?.075:.058,.095,.067,'#c5b18c',hip);
    beam([0,-.035,0],[0,-.18,0],rear?.057:.045,'#c5b18c',hip);
    const knee=new THREE.Group();knee.position.set(0,-.18,0);hip.add(knee);
    sphere(0,0,0,.048,.052,.048,'#bba480',knee);
    beam([0,0,0],[.012,-.20,0],.039,'#cfbd98',knee);
    const ankle=new THREE.Group();ankle.position.set(.012,-.20,0);knee.add(ankle);
    box(.033,-.032,0,.145,.075,.115,'#bca785',ankle);
    dogLegs.push({hip,knee,ankle,home:hip.position.clone(),rear,side,phase:(rear?0:Math.PI)+(side>0?Math.PI:0)});
  }
  const dogTail = new THREE.Group(); dogTail.position.set(-.32, .47, 0); dogBody.add(dogTail);
  beam([0, 0, 0], [-.30, .32, 0], .065, '#be9d6d', dogTail);
  const dogCollar = ring(.27, .55, 0, .21, .025, '#9b624c', dogBody); dogCollar.rotation.y = Math.PI / 2;
  const peeStream=new THREE.Group();peeStream.visible=false;dog.add(peeStream);
  peeStream.position.set(-.205,.265,.105);
  const streamPoint=u=>[.045*u,.11*Math.sin(u*Math.PI)-.29*u,.82*u];
  const peeSegments=[],peeDrops=[];
  for(let i=0;i<18;i++){
    const p=i/18,q=(i+1)/18;
    const segment=beam(streamPoint(p),streamPoint(q),.022,'#f1d94f',peeStream,false);
    peeSegments.push({mesh:segment,progress:p});
  }
  for(let i=0;i<3;i++)peeDrops.push(sphere(0,0,0,.026,.038,.026,'#f6df62',peeStream,false));
  const peePuddle=mesh(new THREE.CircleGeometry(.36,24),new THREE.MeshBasicMaterial({color:'#d5b84d',transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide}),animatedRoot,false);
  peePuddle.rotation.x=-Math.PI/2;peePuddle.visible=false;const peeTarget=new THREE.Vector3();

  const thrower=neighbour(false);thrower.group.visible=false;
  thrower.group.scale.setScalar(1.05);
  const impactStars=new THREE.Group();impactStars.visible=false;head.add(impactStars);
  for(let i=0;i<6;i++){
    const star=new THREE.Group();impactStars.add(star);const color=i%2?'#edd174':'#f3e1a0';
    box(0,0,0,.15,.045,.018,color,star,false);box(0,0,0,.045,.15,.018,color,star,false);
    star.position.set(Math.cos(i*Math.PI/3)*.34,.15+Math.sin(i*Math.PI/3)*.28,.36);
  }
  const stoneLaunch=new THREE.Vector3(),stoneTarget=new THREE.Vector3(),stoneGround=new THREE.Vector3();
  let stoneLaunched=false;

  const livePlaque = label('LIVE', 'TIỆM ÔNG BA ĐANG VUI', 1.30, .52, '#a14c42', '#fff0c9', animatedRoot, 'Arial');
  livePlaque.position.set(-2.2, 2.9, -.8); livePlaque.visible = false;
  const musicNotes = new THREE.Group(); musicNotes.visible = false; animatedRoot.add(musicNotes);
  const notes = [];
  for (let i = 0; i < 5; i++) {
    const note = new THREE.Group(); musicNotes.add(note);
    const color = ['#c99a43', '#648d8c', '#b96d54'][i % 3];
    sphere(-.055, 0, 0, .11, .072, .025, color, note, false);
    box(.025, .19, 0, .035, .40, .035, color, note, false);
    const flag = box(.10, .35, 0, .18, .055, .035, color, note, false); flag.rotation.z = -.35;
    notes.push(note);
  }
  const windStreaks = new THREE.Group(); windStreaks.visible = false; animatedRoot.add(windStreaks);
  for (let i = 0; i < 6; i++) {
    const y = 1.5 + i * .57, z = -.8 + i % 3 * .7;
    const streak = line([[-3.6, y, z], [-2.9, y + .08, z], [-2.2, y + .12, z], [-1.5, y + .09, z]], '#edead0', windStreaks, .6);
    streak.userData.phase = i * .63;
  }
  const clouds = new THREE.Group(); clouds.visible = false; animatedRoot.add(clouds);
  for (let i = 0; i < 5; i++) sphere(-2.6 + i * 1.25, 5.9 + Math.sin(i) * .18, -4.4, .96, .35, .48, '#b6baaa', clouds, false);
  const lightning = line([[-3.7, 5.8, -4], [-4.05, 5.0, -4], [-3.60, 5.0, -4], [-4.0, 4.1, -4]], '#f4dfa1', animatedRoot);
  lightning.visible = false;
  const pebble = sphere(-5, .1, 2.5, .14, .11, .13, '#8f9280', animatedRoot); pebble.visible = false;
  const pebbleBaseScale=pebble.scale.clone();

  // Sparse drifting leaves, heart reactions, confetti and soft rain.
  const floatingLeaves = [];
  for (let i = 0; i < 9; i++) {
    const leaf = mesh(leafGeo, i % 2 ? leafLightMat : leafMat, animatedRoot, false);
    leaf.position.set(rand(-5, 5), rand(1, 8), rand(-3, 2)); leaf.scale.setScalar(rand(.14, .28));
    floatingLeaves.push({ mesh: leaf, phase: rand(0, 10), velocity: rand(.06, .12) });
  }
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, .13); heartShape.bezierCurveTo(-.20, .38, -.48, .08, 0, -.30); heartShape.bezierCurveTo(.48, .08, .20, .38, 0, .13);
  const heartGeo = new THREE.ShapeGeometry(heartShape);
  const effects = [];
  function hearts(count = 8) {
    count = Math.min(count, Math.max(0, 180 - effects.length));
    for (let i = 0; i < count; i++) {
      const h = mesh(heartGeo, material(i % 2 ? '#c15d4f' : '#d98f75', { side: THREE.DoubleSide, roughness: .7 }), animatedRoot, false);
      h.position.set(rand(-1.6, 1.8), rand(1.0, 2.8), rand(.1, 1.2)); h.scale.setScalar(rand(.30, .58));
      effects.push({ mesh: h, age: -i * .11, life: 4, x: h.position.x, y: h.position.y, kind: 'heart', phase: random() * 8 });
    }
  }
  function confetti(count = 45) {
    count = Math.min(count, Math.max(0, 180 - effects.length));
    for (let i = 0; i < count; i++) {
      const c = mesh(geos.box, snackColors[i % 5], animatedRoot, false);
      c.position.set(rand(-2.2, 2.8), rand(4.3, 6), rand(-.8, 1)); c.scale.set(.055, .10, .018);
      effects.push({ mesh: c, age: -random() * .5, life: rand(3, 5), x: c.position.x, y: c.position.y, kind: 'confetti', phase: random() * 8 });
    }
  }
  const rainCount = 500, rainPositions = new Float32Array(rainCount * 6);
  const rainSpeeds = [];
  for (let i = 0; i < rainCount; i++) {
    const o = i * 6, x = rand(-8, 8), y = rand(0, 12), z = rand(-5, 7);
    rainPositions.set([x, y, z, x + .045, y - .22, z], o); rainSpeeds.push(rand(5, 8));
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#c8d9cc', transparent: true, opacity: .47, depthWrite: false }));
  rain.visible = false; animatedRoot.add(rain);
  const rainPuddles = new THREE.Group(); rainPuddles.visible = false; staticRoot.add(rainPuddles);
  for (let i = 0; i < 5; i++) {
    const puddle = mesh(new THREE.CircleGeometry(rand(.2, .55), 18), new THREE.MeshStandardMaterial({ color: '#9caa9b', roughness: .22, transparent: true, opacity: .35, depthWrite: false }), rainPuddles, false);
    puddle.rotation.x = -Math.PI / 2; puddle.position.set(rand(-4, 4), .037, rand(2.5, 6)); puddle.scale.x = rand(1.1, 2);
  }

  // Merge static pieces by material. The hundreds of bamboo joints and shop
  // details then cost a handful of draw calls, while articulated parts stay live.
  function compact(parent, skip = new Set()) {
    parent.updateWorldMatrix(true, true);
    const inverse = parent.matrixWorld.clone().invert(), groups = new Map(), oldMeshes = [];
    function collect(object) {
      if (skip.has(object)) return;
      if (object.isMesh && !object.isInstancedMesh && !Array.isArray(object.material)) {
        const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
        if (!groups.has(key)) groups.set(key, { material: object.material, cast: object.castShadow, receive: object.receiveShadow, pieces: [] });
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
        groups.get(key).pieces.push(geometry); oldMeshes.push(object);
      }
      for (const child of object.children) collect(child);
    }
    for (const child of parent.children) collect(child);
    for (const object of oldMeshes) object.removeFromParent();
    for (const group of groups.values()) {
      const length = group.pieces.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
      const pos = new Float32Array(length * 3), normals = new Float32Array(length * 3), uv = new Float32Array(length * 2);
      let offset = 0;
      for (const geometry of group.pieces) {
        const count = geometry.attributes.position.count;
        pos.set(geometry.attributes.position.array, offset * 3);
        if (geometry.attributes.normal) normals.set(geometry.attributes.normal.array, offset * 3);
        if (geometry.attributes.uv) uv.set(geometry.attributes.uv.array, offset * 2);
        offset += count; geometry.dispose();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const merged = new THREE.Mesh(geometry, group.material); merged.castShadow = group.cast; merged.receiveShadow = group.receive;
      parent.add(merged);
    }
  }
  const looseObjects=[];
  for(const object of [...teaSet.children,...shop.children,...staticRoot.children]){
    if(!object.isMesh||object.isInstancedMesh)continue;
    const largest=Math.max(object.scale.x,object.scale.y,object.scale.z);
    const inShop=object.parent===shop&&object.position.y>1.15&&object.position.y<2.72;
    const atTea=object.parent===teaSet&&object.position.y>.15&&object.position.y<1.10&&object.position.x>-1.2&&object.position.x<.15&&object.position.z>.7;
    if(largest<.62&&(inShop||atTea)&&looseObjects.length<72)looseObjects.push(object);
  }
  const stormObjects=[house,shop,mat,teaSet,basket,crate,chalk,bike,tree,...stools,...plants,...bambooGroups,...levelDecor];
  const chaos=initChaos(THREE,{scene,staticRoot,animatedRoot,elder,objects:looseObjects,stormObjects});
  for (let i = 0; i < bambooGroups.length - 2; i++) compact(bambooGroups[i]);
  compact(shop,new Set([upgrades,shopAnimated]));compact(tree,new Set([bird]));
  for(const object of [house,mat,teaSet,basket,crate,chalk,bike,...stools,...plants])compact(object);
  compact(staticRoot, new Set([...bambooGroups,bird,upgrades,rainPuddles,...stormObjects,...looseObjects]));
  for (const prop of Object.values(giftProps)) compact(prop);
  for (const decor of levelDecor) compact(decor);
  compact(clouds);
  shadowMeshes.length = 0;

  let time = 0, waveUntil = 0, teaUntil = 0, catUntil = 0, rainUntil = 0, partyUntil = 0;
  let deliveryUntil = 0, deliveryStarted = 0, sitUntil = 0, windUntil = 0, strongWindUntil = 0, stormUntil = 0;
  let liveUntil = 0, liveStarted = 0, musicUntil = 0, musicStarted = 0, dogUntil = 0, dogStarted = 0, peePuddleUntil = 0, stoneUntil = 0, stoneStarted = 0, askUntil = 0;
  let dogBarkOnsets=[3.2,3.65,4.6,5.05];
  let waveBlend = 0, teaBlend = 0, nightBlend = 0, lastLevel = 1, lastNeighbour = -10, nextNeighbour = 4;
  let residentSequence=0;
  let frame = 0, night = false, disposed = false, paused = false;
  let quality = 'high';
  const dayColor = new THREE.Color('#e9e0c6'), rainColor = new THREE.Color('#b2b8a2'), nightColor = new THREE.Color('#46596a');
  const currentBackground = new THREE.Color();
  function damp(current, target, speed, dt) { return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * dt)); }
  function showDelivery(name) {
    deliveryUntil = time + 15; deliveryStarted = time; delivery.visible = true;
    for (const [key, prop] of Object.entries(giftProps)) prop.visible = key === name;
    waveUntil = time + 3.4; hearts(4);
  }

  function trigger(action) {
    const effect=action&&typeof action==='object'?action:{};
    if (typeof action === 'object') action = effect.action || effect.type;
    switch (action) {
      case 'wave': case 'follow': case 'hello': waveUntil = time + 4.3; hearts(3); break;
      case 'tea': case 'drink': teaUntil = time + 6; break;
      case 'stock': case 'gift': case 'food': hearts(8); waveUntil = time + 3.4; break;
      case 'vegetables': case 'snack': case 'materials': case 'milk': case 'cake': showDelivery(action); break;
      case 'sit': sitUntil = time + 25; seatedGuest.group.visible = true; teaUntil = time + 6;setGuestAvatar(effect);break;
      case 'weather': rainUntil = time + 22; break;
      case 'wind': windUntil = time + 13;chaos.trigger(action,time);break;
      case 'windstrong': strongWindUntil = time + 16;chaos.trigger(action,time);break;
      case 'storm':
        stormUntil=time+22;rainUntil=time+22;strongWindUntil=time+22;liveUntil=musicUntil=sitUntil=stoneUntil=time;
        dog.visible=delivery.visible=thrower.group.visible=pebble.visible=peeStream.visible=peePuddle.visible=false;peePuddleUntil=0;
        chaos.trigger(action,time);break;
      case 'live': liveStarted=time;liveUntil=time+12;musicUntil=time;teaUntil=time;waveUntil=time;hearts(4);break;
      case 'music': musicStarted=time;musicUntil=time+10;liveUntil=time;teaUntil=time;waveUntil=time;break;
      case 'dog':
        dogUntil=time+16;dogStarted=time;peePuddleUntil=time+22;dog.visible=true;
        dogBarkOnsets=Array.isArray(effect.barkOnsets)&&effect.barkOnsets.length
          ?effect.barkOnsets.filter(value=>Number.isFinite(value)&&value>=3&&value<5.8).slice(0,8)
          :[3.2,3.65,4.6,5.05];
        break;
      case 'stone':
        stoneUntil=time+10;stoneStarted=time;stoneLaunched=false;pebble.visible=false;pebble.scale.copy(pebbleBaseScale);thrower.group.visible=true;
        liveUntil=musicUntil=teaUntil=waveUntil=time;break;
      case 'ask': askUntil = time + 11; waveUntil = time + 2; break;
      case 'cat': catUntil = time + 14; cat.visible = true; break;
      case 'rain': rainUntil = time + 35; break;
      case 'upgrade': case 'fireworks': partyUntil = time + 18; confetti(60); waveUntil = time + 5; break;
      case 'heart': case 'like': hearts(5); break;
      case 'customer': {
        beginResident();break;
      }
      case 'viewer': visitorQueue.enqueue(effect,time);break;
      case 'night': night = !night; break;
    }
  }

  function beginResident() {
    const start=residentSequence%neighbours.length;
    let actor=null;
    for(let i=0;i<neighbours.length;i++){const candidate=neighbours[(start+i)%neighbours.length];if(candidate.progress<0){actor=candidate;break;}}
    if(!actor)return false;
    actor.progress=residentSequence===0?.22:0;actor.direction=residentSequence%2?-1:1;
    actor.duration=12+(residentSequence%4)*1.65;actor.lane=[3.05,3.65,4.15][residentSequence%3];actor.stride=3.7+(residentSequence%3)*.22;
    actor.group.visible=true;residentSequence++;return true;
  }
  function walkPerson(actor,clock,delta) {
    actor.progress+=delta/actor.duration;
    actor.group.position.set(actor.direction*(-7.8+actor.progress*15.6),.11+Math.abs(Math.sin(clock*actor.stride))*.018,actor.lane);
    actor.group.rotation.y=actor.direction>0?Math.PI/2:-Math.PI/2;
    actor.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(clock*actor.stride+i*Math.PI)*.42);
    actor.arms.forEach((arm,i)=>arm.rotation.x=-Math.sin(clock*actor.stride+i*Math.PI)*.25);
  }

  function update(dt = 1 / 60, state = {}) {
    if (disposed) return;
    dt = Math.min(Math.max(dt, 0), .08);
    paused = Boolean(state.paused);
    if (!paused) time += dt;
    const animDt = paused ? 0 : dt;
    const t = time;
    const talking = Boolean(state.talking) || t < musicUntil;
    const level = Number(state.level) || 1;
    const isRaining = state.weather === 'rain' || time < rainUntil;
    const isStorm = t < stormUntil;
    const gust = t < strongWindUntil ? 1 : t < windUntil ? .48 : 0;
    const isNight = typeof state.night === 'boolean' ? state.night : night;
    nightBlend = damp(nightBlend, isNight ? 1 : 0, .6, dt);
    if (level > lastLevel) trigger('upgrade');
    lastLevel = level;
    upgrades.visible = level >= 2 || time < partyUntil;
    levelDecor.forEach((decor, index) => decor.visible = level >= index + 2);
    upgradeLamps.forEach(light => light.intensity = .5 + nightBlend * 4);
    const liveBlend=t<liveUntil?Math.min(1,(t-liveStarted)/.65,(liveUntil-t)/.65):0;
    const musicBlend=t<musicUntil?Math.min(1,(t-musicStarted)/.65,(musicUntil-t)/.65):0;
    const stoneAge=t-stoneStarted,hitBlend=t<stoneUntil&&stoneAge>=5&&stoneAge<7?Math.sin((stoneAge-5)/2*Math.PI):0;
    // Gentle, unmistakably live character animation, with a jaw that follows speech.
    body.position.y = Math.sin(t * 1.65) * .013;
    body.rotation.z = Math.sin(t * .42) * .012 + (t < musicUntil ? Math.sin(t * 3.4) * .035 : 0);
    head.rotation.y = Math.sin(t * .39) * .055 + (talking ? Math.sin(t * 1.8) * .035 : 0) + (t < askUntil ? .14 : 0);
    head.rotation.x = -.02 + Math.sin(t * .71) * .022;
    head.rotation.z = .025 + Math.sin(t * .47) * .028;
    head.rotation.x-=hitBlend*.23;head.rotation.z+=hitBlend*.18;body.rotation.x=-hitBlend*.12;
    jaw.position.y = -.145 - (talking ? .026 + Math.abs(Math.sin(t * 14)) * .036 : 0);
    jaw.rotation.x = talking ? Math.abs(Math.sin(t * 11.1)) * .20 : 0;
    const blink = Math.pow(Math.max(0, Math.sin(t * 1.07)), 44);
    for (const eyelid of eyelids) eyelid.scale.y = .007 + blink * .04;
    waveBlend = damp(waveBlend, t < waveUntil ? 1 : 0, 4.5, animDt);
    teaBlend = damp(teaBlend, t < teaUntil ? 1 : 0, 2.4, animDt);
    for(const limb of [leftArm,rightArm]){limb.shoulder.rotation.set(0,0,0);limb.elbow.rotation.set(0,0,0);limb.hand.rotation.set(0,0,0);}
    rightArm.shoulder.rotation.z = waveBlend * (2.36 + Math.sin(t * 6.2) * .13) - teaBlend * .22;
    rightArm.shoulder.rotation.x = teaBlend * -1.8;
    rightArm.elbow.rotation.z = -waveBlend * .45;
    rightArm.elbow.rotation.x = -teaBlend * .7;
    rightArm.hand.rotation.z = waveBlend * Math.sin(t * 8) * .22;
    handCup.visible = teaBlend > .1;
    leftArm.shoulder.rotation.x = -.03 + Math.sin(t * 1.4) * .05;
    leftArm.elbow.rotation.x = t < askUntil ? -.35 + Math.sin(t * 2.0) * .08 : 0;
    leftArm.hand.rotation.x = .10 + Math.sin(t * 1.5) * .22;
    fan.rotation.y = .1 + Math.sin(t * 1.5) * .25;
    phone.visible=liveBlend>0;guitar.visible=musicBlend>0;fan.visible=musicBlend<=0;handCup.visible=teaBlend>.1&&liveBlend<=0&&musicBlend<=0;
    if(liveBlend>0){
      poseArm(rightArm,1,rightPoseTarget.set(.68,1.69,.44),liveBlend);
      rightArm.hand.getWorldQuaternion(cameraLocalQ);cameraLocalQ.invert().multiply(camera.quaternion);phone.quaternion.copy(cameraLocalQ);
      head.rotation.y+=liveBlend*.13;
    }
    if(musicBlend>0){
      poseArm(rightArm,1,rightPoseTarget.set(.19,.81+Math.sin(t*19)*.067,.46),musicBlend);
      poseArm(leftArm,-1,leftPoseTarget.set(-.54+Math.sin(t*1.3)*.035,1.08,.44),musicBlend);
      rightArm.hand.rotation.z=Math.sin(t*19)*.28*musicBlend;leftArm.hand.rotation.x=-.4*musicBlend;
      guitar.rotation.z=-.10+Math.sin(t*2.4)*.018;
    }
    if(hitBlend>0)poseArm(rightArm,1,rightPoseTarget.set(.10,1.68,.45),hitBlend);
    for (let i = 0; i < bambooGroups.length - 2; i++) bambooGroups[i].rotation.z = bambooGroups[i].userData.restAngle + Math.sin(t * (.5 + gust * 1.1) + i) * (.005 + gust * .075);
    for (let i = bambooGroups.length - 2; i < bambooGroups.length; i++) bambooGroups[i].rotation.z = Math.sin(t * 1.2 + i) * gust * .018;
    bird.rotation.y = Math.sin(t * .35) > .6 ? .25 : -.3;
    if (delivery.visible) {
      const age = t - deliveryStarted, remaining = deliveryUntil - t;
      const pop = Math.min(1, age * 2.8) * Math.min(1, Math.max(0, remaining) * 2);
      delivery.scale.setScalar(Math.max(.01, pop));
      delivery.position.y = .16 + Math.sin(age * 2) * .025;
      delivery.rotation.y = Math.sin(age * .8) * .08;
      if (t > deliveryUntil) delivery.visible = false;
    }
    seatedGuest.group.visible = t < sitUntil;
    if (seatedGuest.group.visible) {
      seatedGuest.group.rotation.y = .65 + Math.sin(t * .7) * .07;
      seatedGuest.arms.forEach((arm, i) => arm.rotation.x = -.28 + Math.sin(t * 1.4 + i) * .06);
      seatedGuest.group.getWorldQuaternion(cameraLocalQ);cameraLocalQ.invert().multiply(camera.quaternion);
      avatarHead.quaternion.copy(cameraLocalQ);guestName.quaternion.copy(cameraLocalQ);
    }
    livePlaque.visible = t < liveUntil;
    if (livePlaque.visible) { livePlaque.quaternion.copy(camera.quaternion); livePlaque.scale.setScalar(1 + Math.sin(t * 2.8) * .035); }
    musicNotes.visible = t < musicUntil;
    if (musicNotes.visible) for (let i = 0; i < notes.length; i++) {
      const p = (t * .32 + i / notes.length) % 1;
      notes[i].position.set(-.7 + Math.sin(t + i * 1.4) * .62, 2.0 + p * 1.6, .55);
      notes[i].quaternion.copy(camera.quaternion); notes[i].scale.setScalar(Math.sin(p * Math.PI) * .7);
    }
    windStreaks.visible = gust > 0;
    if (windStreaks.visible) for (const streak of windStreaks.children) streak.position.x = ((t * (2 + gust * 4) + streak.userData.phase) % 8) - 1;
    clouds.visible = isRaining;
    lightning.visible = isStorm && (t % 5.4 < .30);
    peeStream.visible=false;
    if (dog.visible) {
      const age=t-dogStarted;
      const smooth=value=>{const p=THREE.MathUtils.clamp(value,0,1);return p*p*(3-2*p);};
      const entry=smooth(age/3),exit=smooth((age-11)/5),walking=age<3||age>=11;
      const lift=smooth((age-5.9)/.65)*(1-smooth((age-10.25)/.65));
      const peeing=age>=6.7&&age<10.25;
      const walkEnvelope=age<3?Math.sin(Math.PI*THREE.MathUtils.clamp(age/3,0,1)):Math.sin(Math.PI*THREE.MathUtils.clamp((age-11)/5,0,1));
      dog.position.set(-5+entry*3.40+exit*7,.045+(walking?Math.abs(Math.sin(age*11))*.018*walkEnvelope:0),2.16);
      // Keep the root and all supporting feet fixed while he balances on three legs.
      dog.rotation.set(0,-.15,0);
      dogBody.position.set(-.012*lift,0,-.022*lift);dogBody.rotation.set(-.065*lift,0,-.018*lift);
      dogTail.rotation.x=Math.sin(age*11)*(lift>.1?.12:.40);
      for(const leg of dogLegs){
        leg.hip.position.copy(leg.home);leg.hip.rotation.set(0,0,0);leg.knee.rotation.set(0,0,0);leg.ankle.rotation.set(0,0,0);
        if(walking){const stride=Math.sin(age*11+leg.phase);leg.hip.rotation.z=stride*.48*walkEnvelope;leg.knee.rotation.z=Math.max(0,-stride)*.60*walkEnvelope;leg.ankle.rotation.z=-Math.max(0,-stride)*.18*walkEnvelope;}
        if(leg.rear&&leg.side>0&&lift>0){leg.hip.rotation.x=-1.25*lift;leg.hip.rotation.z=-.16*lift;leg.knee.rotation.z=1.12*lift;leg.ankle.rotation.x=.36*lift;leg.ankle.rotation.z=-.32*lift;}
      }
      const barkPulse=age>=3&&age<5.8?dogBarkOnsets.reduce((peak,onset)=>{const p=(age-onset)/.27;return Math.max(peak,p>=0&&p<1?Math.sin(p*Math.PI):0);},0):0;
      dogJaw.rotation.z=-.30*barkPulse;dogHead.rotation.z=.065*barkPulse;
      dogHead.rotation.y=lift>0?-.09*lift:0;
      if(peeing){
        const flow=smooth((age-6.7)/.15)*(1-smooth((age-10.10)/.15));
        peeStream.visible=true;
        for(const segment of peeSegments)segment.mesh.visible=segment.progress<flow;
        peeDrops.forEach((drop,i)=>{const p=.63+(((age-6.7)*1.55+i/3)%1)*.37;drop.position.fromArray(streamPoint(p));drop.visible=p<flow;});
        dog.updateWorldMatrix(true,true);peeTarget.set(-.160,-.025,.925);dog.localToWorld(peeTarget);peePuddle.position.set(peeTarget.x,.032,peeTarget.z);
      }
      if(t>=dogUntil){dog.visible=false;peeStream.visible=false;}
    }
    const peeAge=t-dogStarted;peePuddle.visible=peeAge>=6.85&&t<peePuddleUntil;
    if(peePuddle.visible){const spread=Math.min(1,Math.max(.03,(peeAge-6.85)/3.3));peePuddle.scale.set(1.45*spread,spread,1);peePuddle.material.opacity=.58*Math.min(1,Math.max(0,(peePuddleUntil-t)/3));}
    const stoneActive=t<stoneUntil;thrower.group.visible=stoneActive;impactStars.visible=stoneActive&&stoneAge>=5&&stoneAge<7.2;
    if(stoneActive){
      const entry=Math.min(1,stoneAge/3),exit=THREE.MathUtils.clamp((stoneAge-7)/3,0,1),walking=stoneAge<3||stoneAge>=7;
      thrower.group.position.set(-5.7+entry*3.10+exit*8.6,.10+(walking?Math.abs(Math.sin(t*7))*.025:0),1.65);
      thrower.group.rotation.y=walking?Math.PI/2:2.25;
      thrower.legs.forEach((leg,i)=>leg.rotation.x=walking?Math.sin(t*7+i*Math.PI)*.43:0);
      thrower.arms.forEach((arm,i)=>arm.rotation.set(walking?-Math.sin(t*7+i*Math.PI)*.25:0,0,0));
      if(stoneAge>=3&&stoneAge<5.3){const windup=Math.min(1,(stoneAge-3)/.7),follow=THREE.MathUtils.clamp((stoneAge-4.2)/1.1,0,1);thrower.arms[1].rotation.x=-1.75*windup+follow*1.15;thrower.arms[1].rotation.z=-.17;}
      if(stoneAge>=4.2&&!stoneLaunched){
        thrower.group.updateWorldMatrix(true,true);stoneLaunch.set(.03,-.62,.04);thrower.arms[1].localToWorld(stoneLaunch);
        elder.updateWorldMatrix(true,true);stoneTarget.set(0,.02,.39);head.localToWorld(stoneTarget);stoneGround.set(stoneTarget.x+.55,.14,stoneTarget.z+.8);stoneLaunched=true;
      }
      pebble.visible=stoneAge>=4.2&&stoneAge<8.3;
      if(pebble.visible){
        if(stoneAge<5){const p=(stoneAge-4.2)/.8;pebble.position.copy(stoneLaunch).lerp(stoneTarget,p);pebble.position.y+=Math.sin(p*Math.PI)*.32;}
        else{const p=Math.min(1,(stoneAge-5)/1.2);pebble.position.copy(stoneTarget).lerp(stoneGround,p);pebble.position.y+=Math.sin(p*Math.PI)*.23;}
        pebble.rotation.x+=animDt*9;pebble.scale.copy(pebbleBaseScale).multiplyScalar(stoneAge>8?Math.max(.01,(8.3-stoneAge)/.3):1);
      }
      if(impactStars.visible)for(let i=0;i<impactStars.children.length;i++){const a=i*Math.PI/3+(stoneAge-5)*3.5;impactStars.children[i].position.set(Math.cos(a)*.35,.15+Math.sin(a)*.26,.36);impactStars.children[i].rotation.z=t*3;}
    }else pebble.visible=false;
    // Load the actual photo while hidden, then admit an individual viewer.
    // Quiet arrivals never depend on a gift/chat and never receive NPC faces.
    for(const actor of viewerActors){
      if(actor.state==='idle'){const entry=visitorQueue.take(t);if(entry)loadViewerAvatar(actor,entry);}
      if(actor.state==='ready'&&t-actor.entry.enteredAt>90){clearViewerActor(actor);continue;}
    }
    let activeViewers=viewerActors.filter(actor=>actor.state==='walking').length;
    if(!paused&&!isStorm&&t>=viewerSpawnAt&&activeViewers<3){
      const ready=viewerActors.filter(actor=>actor.state==='ready').sort((a,b)=>a.entry.sequence-b.entry.sequence)[0];
      if(ready){
        ready.state='walking';ready.progress=0;ready.direction=viewerSequence%2?-1:1;
        ready.duration=9.5+(viewerSequence%3)*.9;ready.lane=[3.15,3.75,4.3][viewerSequence%3];ready.stride=4.05+(viewerSequence%2)*.23;
        ready.group.visible=true;viewerSequence++;viewerSpawnAt=t+1.4;activeViewers++;
      }
    }
    for(const actor of viewerActors){
      if(actor.state!=='walking')continue;
      actor.group.visible=!isStorm;
      if(!isStorm)walkPerson(actor,t,animDt);
      if(actor.progress>=1){clearViewerActor(actor);continue;}
      actor.group.updateWorldMatrix(true,false);actor.group.getWorldQuaternion(cameraLocalQ);cameraLocalQ.invert().multiply(camera.quaternion);
      actor.photoHead.quaternion.copy(cameraLocalQ);actor.nameplate.quaternion.copy(cameraLocalQ);
    }
    const residentsEnabled=state.residentsEnabled!==false;
    const residentInterval=THREE.MathUtils.clamp(Number(state.residentInterval)||5,3,15);
    const residentCap=activeViewers>=2?1:activeViewers===1?2:3;
    if(residentsEnabled&&!paused&&!isStorm&&t-lastNeighbour>nextNeighbour&&neighbours.filter(actor=>actor.progress>=0).length<residentCap){
      if(beginResident()){lastNeighbour=t;nextNeighbour=THREE.MathUtils.clamp(residentInterval+rand(-.8,.8),3,15);}
    }
    for(const actor of neighbours){
      if(actor.progress<0)continue;
      if(!residentsEnabled){actor.progress=-1;actor.group.visible=false;continue;}
      actor.group.visible=!isStorm;
      if(!isStorm)walkPerson(actor,t,animDt*(activeViewers>=2?1.25:1));
      if(actor.progress>=1){actor.progress=-1;actor.group.visible=false;}
    }
    if (cat.visible) {
      const p = 1 - Math.max(0, catUntil - t) / 14;
      cat.position.set(-6 + p * 12, .14 + Math.sin(t * 10) * .008, 1.55);
      catTail.rotation.x = Math.sin(t * 2) * .20;
      catLegs.forEach((l, i) => l.rotation.z = Math.sin(t * 10 + i * Math.PI / 2) * .20);
      if (t > catUntil) cat.visible = false;
    }
    for (const leaf of floatingLeaves) {
      if (!paused) {
        leaf.mesh.position.x += animDt * (.18 + gust * 3.2);
        leaf.mesh.position.y -= animDt * leaf.velocity;
        leaf.mesh.rotation.z = Math.sin(t * (1 + gust * 4) + leaf.phase) * (.6 + gust * 2);
        leaf.mesh.rotation.y = t * .4 + leaf.phase;
        if (leaf.mesh.position.y < .06 || leaf.mesh.position.x > 6) leaf.mesh.position.set(-5 + random() * 9, 7 + random() * 2, -3 + random() * 5);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.age += animDt; e.mesh.visible = e.age > 0;
      if (e.age > e.life) { e.mesh.removeFromParent(); effects.splice(i, 1); continue; }
      if (e.age < 0) continue;
      const p = e.age / e.life;
      if (e.kind === 'heart') {
        e.mesh.position.y = e.y + e.age * .82;
        e.mesh.position.x = e.x + Math.sin(e.age * 2 + e.phase) * .2;
        e.mesh.quaternion.copy(camera.quaternion);
        const s = (1 - Math.pow(p, 5)) * (.30 + Math.sin(e.phase) * .08); e.mesh.scale.setScalar(s);
      } else {
        e.mesh.position.y = e.y - e.age * 1.15;
        e.mesh.position.x = e.x + Math.sin(e.age + e.phase) * .7;
        e.mesh.rotation.set(e.age * 3, e.age * 2 + e.phase, e.age * 2.4);
      }
    }
    rain.visible = isRaining; rainPuddles.visible = isRaining;
    if (isRaining && !paused) {
      for (let i = 0; i < rainCount; i++) {
        const o = i * 6, step = animDt * rainSpeeds[i];
        rainPositions[o] -= animDt * (.5 + gust * 3); rainPositions[o + 1] -= step; rainPositions[o + 3] -= animDt * (.5 + gust * 3); rainPositions[o + 4] -= step;
        if (rainPositions[o + 1] < .1) { const yy = 9 + random() * 3, xx = rand(-8, 8); rainPositions[o] = xx; rainPositions[o + 1] = yy; rainPositions[o + 3] = xx + .045; rainPositions[o + 4] = yy - .22; }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    currentBackground.copy(isRaining ? rainColor : dayColor).lerp(nightColor, nightBlend);
    scene.background.copy(currentBackground); scene.fog.color.copy(currentBackground);
    hemi.intensity = THREE.MathUtils.lerp(isRaining ? 1.9 : 2.35, .78, nightBlend);
    sun.intensity = THREE.MathUtils.lerp(isRaining ? 1.2 : 3.0, .18, nightBlend);
    fill.intensity = THREE.MathUtils.lerp(.7, .35, nightBlend);
    lampMaterials.forEach(m => m.emissiveIntensity = .15 + nightBlend * 1.8);
    lamps.forEach(l => l.intensity = nightBlend * 7);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.12, 1.05, nightBlend);
    chaos.update(t,animDt);
    // Render is driven by the owning app, so there is exactly one animation loop.
    renderer.render(scene, camera); frame++;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfH = 7.6, halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  function setQuality(value) {
    value = value === 'low' ? 'low' : 'high';
    if (value === quality) return;
    quality = value;
    renderer.setPixelRatio(value === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.shadowMap.enabled = value !== 'low';
    sun.shadow.mapSize.set(value === 'low' ? 1024 : 2048, value === 'low' ? 1024 : 2048);
    resize();
  }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);
  resize(); update(0);
  return {
    update, trigger, resize, setQuality, camera, renderer, scene,
    getVisitorStatus(){return{...visitorQueue.snapshot(),walking:viewerActors.filter(actor=>actor.state==='walking').length,loading:viewerActors.filter(actor=>actor.state==='loading').length,failedAvatars:viewerFailures};},
    dispose() {
      disposed = true; resizeObserver?.disconnect();
      for(const actor of viewerActors)clearViewerActor(actor);visitorQueue.clear();
      avatarSerial++;avatarRequest?.abort();avatarTexture?.dispose();chaos.dispose();
      const geometrySet = new Set(), materialSet = new Set();
      scene.traverse(o => { if (o.geometry) geometrySet.add(o.geometry); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materialSet.add(m); });
      geometrySet.forEach(g => g.dispose()); materialSet.forEach(m => { m.map?.dispose(); m.dispose(); }); renderer.dispose();
    },
  };
}
