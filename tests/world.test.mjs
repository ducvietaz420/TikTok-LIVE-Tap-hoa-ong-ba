import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, snapshot, updateSettings, applyEvent } from '../lib/world.mjs';

const gift = (overrides = {}) => ({
  type: 'gift', user: 'Bé An', userId: 'an-1', coins: 25,
  giftName: 'Hoa hồng', count: 5, ...overrides,
});

test('fresh worlds have independent settings and empty real-event counters', () => {
  const first = createWorld();
  const second = createWorld();
  updateSettings(first, { shopName: 'Tiệm của An', volume: 0.2 });
  assert.equal(second.settings.shopName, 'TẠP HOÁ ÔNG BA');
  assert.equal(second.settings.volume, 0.8);
  assert.equal(second.settings.musicEnabled, true);
  assert.equal(second.settings.musicVolume, 0.28);
  const olderSavedWorld = createWorld({ settings: { volume: 0.4 } });
  assert.equal(olderSavedWorld.settings.musicEnabled, true);
  assert.equal(olderSavedWorld.settings.musicVolume, 0.28);
  assert.equal(second.points, 0);
  assert.equal(second.likes, 0);
  assert.equal(second.followers, 0);
  assert.deepEqual(second.supporters, []);
  assert.equal(second.connection, 'disconnected');
});

test('snapshot advances levels exactly at each threshold and caps final progress', () => {
  for (const [points, level, target, progress] of [
    [0, 1, 500, 0], [250, 1, 500, 0.5], [499, 1, 500, 0.998],
    [500, 2, 1500, 0], [1000, 2, 1500, 0.5], [1500, 3, 3500, 0],
    [3500, 4, 7500, 0], [7500, 5, 15000, 0], [15000, 5, 15000, 1],
    [20000, 5, 15000, 1],
  ]) {
    const current = snapshot(createWorld({ points }));
    assert.equal(current.level, level, `level at ${points}`);
    assert.equal(current.target, target, `target at ${points}`);
    assert.equal(current.progress, progress, `progress at ${points}`);
  }
});

test('real gifts accumulate normalized diamond totals once and combine by user ID', () => {
  const world = createWorld();
  applyEvent(world, gift());
  applyEvent(world, gift({ coins: 40, count: 8, user: 'An đổi tên' }));
  assert.equal(world.points, 65, 'coins already includes repeat count from normalizer');
  assert.deepEqual(world.supporters, [{ id: 'an-1', user: 'An đổi tên', points: 65 }]);
});

test('supporter board orders real totals and retains the top thirty', () => {
  const world = createWorld();
  for (let n = 1; n <= 35; n++) {
    applyEvent(world, gift({ userId: `u${n}`, user: `Khách ${n}`, coins: n }));
  }
  assert.equal(world.points, 630);
  assert.equal(world.supporters.length, 30);
  assert.equal(world.supporters[0].id, 'u35');
  assert.equal(world.supporters.at(-1).id, 'u6');
});

test('demo gifts produce a preview effect without changing points or supporters', () => {
  const world = createWorld({ points: 490 });
  applyEvent(world, gift({ coins: 5 }));
  const ledger = structuredClone({ points: world.points, supporters: world.supporters });
  const effect = applyEvent(world, gift({ userId: 'demo-user', coins: 5000, demo: true }));
  assert.deepEqual({ points: world.points, supporters: world.supporters }, ledger);
  assert.equal(snapshot(world).level, 1);
  assert.equal(effect.demo, true);
  assert.equal(effect.action, 'fireworks');
  assert.equal(effect.voice, 'gift');
  assert.equal(world.lastEvent.demo, true);
});

test('demo likes and follows leave real metrics unchanged', () => {
  const world = createWorld();
  applyEvent(world, { type: 'like', user: 'A', likes: 20 });
  applyEvent(world, { type: 'follow', user: 'A' });
  applyEvent(world, { type: 'like', user: 'B', likes: 100, demo: true });
  applyEvent(world, { type: 'follow', user: 'B', demo: true });
  assert.equal(world.likes, 20);
  assert.equal(world.followers, 1);
});

test('LIVE shares thank the sharer without changing gifts or engagement ledgers', () => {
  const world = createWorld({ points: 37, supporters: [{ id: 'supporter', user: 'Bạn cũ', points: 37 }] });
  world.likes = 12;
  world.followers = 3;
  const before = structuredClone({ points: world.points, supporters: world.supporters, likes: world.likes, followers: world.followers });
  const effect = applyEvent(world, { type: 'share', user: 'Bé Mai', userId: 'mai' }, 1234);
  assert.equal(effect.action, 'wave');
  assert.equal(effect.voice, 'share');
  assert.equal(effect.text, 'Cảm ơn Bé Mai đã chia sẻ LIVE!');
  assert.equal(effect.user, 'Bé Mai');
  assert.equal(world.lastEvent.type, 'share');
  assert.equal(world.lastEvent.at, 1234);
  assert.deepEqual({ points: world.points, supporters: world.supporters, likes: world.likes, followers: world.followers }, before);
  updateSettings(world, { paused: true });
  assert.equal(applyEvent(world, { type: 'share', user: 'Bé Mai' }), null, 'paused scenes do not play share thanks');
  updateSettings(world, { paused: false });
  assert.equal(applyEvent(world, { type: 'share', user: 'Bé Mai' }).voice, 'share');
});

test('crossing a real level threshold replaces the gift effect with an upgrade', () => {
  const world = createWorld({ points: 490 });
  const effect = applyEvent(world, gift({ coins: 30 }), 1234);
  assert.equal(world.points, 520);
  assert.equal(snapshot(world).level, 2);
  assert.equal(effect.action, 'upgrade');
  assert.equal(effect.voice, 'upgrade');
  assert.equal(effect.at, 1234);
  assert.equal(world.lastEvent.at, 1234);
});

test('gifts at maximum level keep accumulating without replaying upgrade', () => {
  const world = createWorld({ points: 15000 });
  const effect = applyEvent(world, gift({ coins: 100 }));
  assert.equal(world.points, 15100);
  assert.equal(snapshot(world).level, 5);
  assert.equal(snapshot(world).progress, 1);
  assert.equal(effect.action, 'fireworks');
  assert.equal(effect.voice, 'gift');
});

test('tea chat commands accept Vietnamese, unaccented text and terminal punctuation', () => {
  for (const text of ['Trà', '  TRÀ! ', 'tra', 'chè?', 'che.', 'uống trà', 'uong tra']) {
    const world = createWorld();
    const effect = applyEvent(world, { type: 'chat', user: 'Khách', text });
    assert.equal(effect?.action, 'tea', text);
    assert.equal(effect?.voice, 'tea', text);
    assert.equal(world.points, 0);
  }
});

test('cat chat commands trigger the cat without a voice clip', () => {
  for (const text of ['Mèo', 'meo!!!']) {
    const effect = applyEvent(createWorld(), { type: 'chat', user: 'Khách', text });
    assert.equal(effect?.action, 'cat');
    assert.equal(effect?.voice, null);
  }
});

test('ordinary chat and unknown events leave the last visible event intact', () => {
  const world = createWorld();
  applyEvent(world, { type: 'follow', user: 'Bạn cũ' }, 100);
  const previous = structuredClone(world.lastEvent);
  for (const event of [
    { type: 'chat', text: 'Cho tôi trà với nhé' },
    { type: 'chat', text: 'mèo con' },
    { type: 'chat', text: '' },
    { type: 'member', user: 'Khách mới' },
    { type: 'unexpected' },
  ]) assert.equal(applyEvent(world, event, 200), null);
  assert.deepEqual(world.lastEvent, previous);
});

test('pause suppresses live event effects and resume accepts them again', () => {
  const world = createWorld();
  updateSettings(world, { paused: true });
  assert.equal(applyEvent(world, gift()), null);
  assert.equal(applyEvent(world, { type: 'chat', user: 'A', text: 'trà' }), null);
  updateSettings(world, { paused: false });
  assert.equal(applyEvent(world, gift())?.voice, 'gift');
});

test('settings clamp finite values and reject unsupported types or enum values', () => {
  const world = createWorld();
  updateSettings(world, { volume: 5, musicEnabled: false, musicVolume: 4, speechInterval: 1, weather: 'rain', quality: 'low', night: true });
  assert.equal(world.settings.volume, 1);
  assert.equal(world.settings.musicEnabled, false);
  assert.equal(world.settings.musicVolume, 1);
  assert.equal(world.settings.speechInterval, 20);
  assert.equal(world.settings.weather, 'rain');
  assert.equal(world.settings.quality, 'low');
  assert.equal(world.settings.night, true);
  updateSettings(world, { volume: -4, musicVolume: -3, speechInterval: 900 });
  assert.equal(world.settings.volume, 0);
  assert.equal(world.settings.musicVolume, 0);
  assert.equal(world.settings.speechInterval, 300);
  updateSettings(world, { volume: NaN, musicEnabled: 'true', musicVolume: Infinity, speechInterval: Infinity, weather: 'snow', quality: 'ultra', night: 'false', autoSpeech: 0 });
  assert.equal(world.settings.volume, 0);
  assert.equal(world.settings.musicEnabled, false);
  assert.equal(world.settings.musicVolume, 0);
  assert.equal(world.settings.speechInterval, 300);
  assert.equal(world.settings.weather, 'rain');
  assert.equal(world.settings.quality, 'low');
  assert.equal(world.settings.night, true);
  assert.equal(world.settings.autoSpeech, true);
  const restored = createWorld({ settings: { musicEnabled: 'false', musicVolume: NaN } });
  assert.equal(restored.settings.musicEnabled, true);
  assert.equal(restored.settings.musicVolume, 0.28);
  assert.equal(createWorld({ settings: { musicVolume: 3 } }).settings.musicVolume, 1);
  assert.equal(createWorld({ settings: { musicVolume: -2 } }).settings.musicVolume, 0);
});

test('shop name trims surrounding whitespace, limits length and restores default when empty', () => {
  const world = createWorld();
  updateSettings(world, { shopName: '  Tiệm ông Ba  ' });
  assert.equal(world.settings.shopName, 'Tiệm ông Ba');
  updateSettings(world, { shopName: 'a'.repeat(80) });
  assert.equal(world.settings.shopName.length, 42);
  updateSettings(world, { shopName: '    ' });
  assert.equal(world.settings.shopName, 'TẠP HOÁ ÔNG BA');
});
