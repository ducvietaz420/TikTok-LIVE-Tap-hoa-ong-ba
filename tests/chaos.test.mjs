import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { initChaos } from '../public/chaos.js';

function pose(object) {
  return { position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray() };
}

function fixture() {
  const scene = new THREE.Scene();
  const staticRoot = new THREE.Group(), animatedRoot = new THREE.Group();
  staticRoot.position.set(.3, 0, -.4); staticRoot.rotation.y = .13;
  scene.add(staticRoot, animatedRoot);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(20, .1, 20), new THREE.MeshBasicMaterial());
  ground.position.y = -.1; staticRoot.add(ground);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.1, .12, .4), new THREE.MeshBasicMaterial());
  bottle.position.set(-1.2, .7, .8); bottle.rotation.set(.05, .3, -.1); bottle.scale.set(.8, 1.1, .7); staticRoot.add(bottle);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(.6, .5, .4), new THREE.MeshBasicMaterial());
  crate.position.set(.9, .4, -.3); crate.rotation.y = -.25; staticRoot.add(crate);
  const house = new THREE.Group(); house.position.set(2, 1.1, -1); house.rotation.y = .2; staticRoot.add(house);
  const sign = new THREE.Group(); sign.position.set(0, 1.5, .3); house.add(sign);
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(1, .4, .1), new THREE.MeshBasicMaterial()));
  const elder = new THREE.Group(); elder.position.set(-.6, .15, .3); elder.rotation.set(0, .2, .03); elder.scale.setScalar(.9); animatedRoot.add(elder);
  elder.add(new THREE.Mesh(new THREE.BoxGeometry(.5, 1.3, .3), new THREE.MeshBasicMaterial()));
  const chaos = initChaos(THREE, { scene, staticRoot, animatedRoot, elder,
    objects: [bottle, crate, bottle], stormObjects: [house, sign, house] });
  return { scene, staticRoot, animatedRoot, elder, bottle, crate, house, sign, ground, chaos };
}

test('both wind gifts send actual merchandise airborne, then restore its exact home transform', () => {
  for (const [action, duration] of [['wind', 13], ['windstrong', 16]]) {
    const f = fixture(), bottleHome = pose(f.bottle), crateHome = pose(f.crate), shopHome = pose(f.house), groundHome = pose(f.ground);
    f.chaos.trigger(action, 100); f.chaos.update(104, .033);
    assert.notDeepEqual(f.bottle.position.toArray(), bottleHome.position, `${action}: bottle should fly`);
    assert.ok(f.bottle.position.y > bottleHome.position[1], `${action}: bottle must lift off its shelf`);
    assert.notDeepEqual(f.crate.quaternion.toArray(), crateHome.quaternion, `${action}: crate should tumble`);
    assert.deepEqual(pose(f.house), shopHome, `${action}: ordinary wind should not lift the whole shop`);
    assert.deepEqual(pose(f.ground), groundHome);
    f.chaos.update(100 + duration, .033);
    assert.deepEqual(pose(f.bottle), bottleHome); assert.deepEqual(pose(f.crate), crateHome);
    f.chaos.dispose();
  }
});

test('storm lifts the shop and elder into a visible vortex and restores them after twenty-two seconds', () => {
  const f = fixture(), bottleHome = pose(f.bottle), shopHome = pose(f.house), elderHome = pose(f.elder), groundHome = pose(f.ground);
  const vortex = f.scene.getObjectByName('storm-vortex');
  assert.equal(vortex.visible, false);
  f.chaos.trigger('storm', 10); f.chaos.update(16, .033);
  assert.equal(f.chaos.activeStorm(16), true); assert.equal(vortex.visible, true);
  assert.ok(f.elder.position.y > elderHome.position[1] + 2, 'elder must visibly leave the mat');
  assert.ok(f.house.position.y > shopHome.position[1] + 2, 'large shop props must also lift');
  assert.notDeepEqual(f.elder.quaternion.toArray(), elderHome.quaternion);
  assert.notDeepEqual(f.bottle.position.toArray(), bottleHome.position);
  assert.deepEqual(pose(f.ground), groundHome, 'street must remain fixed during the storm');
  f.chaos.update(32, .033);
  assert.equal(f.chaos.activeStorm(32), false); assert.equal(vortex.visible, false);
  assert.deepEqual(pose(f.bottle), bottleHome); assert.deepEqual(pose(f.house), shopHome); assert.deepEqual(pose(f.elder), elderHome);
  f.chaos.dispose();
});

test('a heavy prop and its descendant are moved once without dismantling their hierarchy', () => {
  const f = fixture();
  const heavyRoot = f.scene.getObjectByName('flying-shop'), looseRoot = f.scene.getObjectByName('flying-merchandise');
  assert.equal(heavyRoot.children.length, 1); assert.equal(heavyRoot.children[0], f.house);
  assert.equal(f.sign.parent, f.house); assert.equal(looseRoot.children.length, 2, 'duplicate loose props must be ignored');
  const signLocalHome = pose(f.sign);
  f.scene.updateMatrixWorld(true); const signWorldHome = f.sign.getWorldPosition(new THREE.Vector3()).toArray();
  f.chaos.trigger('storm', 0); f.chaos.update(5, .033); f.scene.updateMatrixWorld(true);
  assert.notDeepEqual(f.sign.getWorldPosition(new THREE.Vector3()).toArray(), signWorldHome);
  assert.deepEqual(pose(f.sign), signLocalHome, 'descendant must follow its parent rather than get an independent flight');
  f.chaos.update(22, .033); f.scene.updateMatrixWorld(true);
  assert.deepEqual(f.sign.getWorldPosition(new THREE.Vector3()).toArray(), signWorldHome);
  f.chaos.dispose();
});

test('repeated storm gifts reuse a bounded set of scene objects and always return to the original set', () => {
  const f = fixture(), homes = [f.bottle, f.crate, f.house, f.elder, f.ground].map(pose);
  const count = () => { let total = 0; f.scene.traverse(() => total++); return total; };
  const childCount = f.scene.children.length, objectCount = count();
  for (let cycle = 0; cycle < 30; cycle++) {
    const time = cycle * 30;
    f.chaos.trigger('storm', time); f.chaos.trigger('storm', time + .3); f.chaos.update(time + 6, .033);
    assert.equal(f.scene.children.length, childCount); assert.equal(count(), objectCount);
    f.chaos.update(time + 22.4, .033);
    [f.bottle, f.crate, f.house, f.elder, f.ground].forEach((object, index) => assert.deepEqual(pose(object), homes[index]));
  }
  f.chaos.dispose();
});

test('overlapping wind and storm recover without pose drift and keep permanent street objects unchanged', () => {
  const f = fixture(), objects = [f.bottle, f.crate, f.house, f.elder, f.ground], homes = objects.map(pose);
  f.chaos.trigger('windstrong', 0); f.chaos.update(4, .033);
  f.chaos.trigger('storm', 5); f.chaos.update(10, .033);
  f.chaos.trigger('wind', 25); f.chaos.update(28, .033);
  assert.deepEqual(pose(f.house), homes[2], 'the ended storm should restore large props even while wind continues');
  assert.deepEqual(pose(f.elder), homes[3]); assert.deepEqual(pose(f.ground), homes[4]);
  assert.notDeepEqual(pose(f.bottle), homes[0]);
  f.chaos.update(38, .033);
  objects.forEach((object, index) => assert.deepEqual(pose(object), homes[index]));
  f.chaos.dispose();
});
