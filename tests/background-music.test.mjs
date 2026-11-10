import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundMusicPlayer } from '../public/background-music.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function recording(play = () => Promise.resolve()) {
  return {
    paused: true, currentTime: 13.5, volume: 0, playCalls: 0,
    play() { this.playCalls++; return play().then(() => { this.paused = false; }); },
    pause() { this.paused = true; },
  };
}

test('muting while a music file is loading prevents late playback and preserves the loop position', async () => {
  const loading = deferred(), audio = recording(() => loading.promise);
  let starts = 0;
  const player = createBackgroundMusicPlayer({ createAudio: () => audio, onPlaying: () => { starts++; } });
  const pending = player.update({ enabled: true });
  await player.update({ muted: true });
  loading.resolve();
  assert.equal(await pending, false);
  assert.equal(audio.paused, true);
  assert.equal(audio.volume, 0);
  assert.equal(audio.currentTime, 13.5);
  assert.equal(player.playing, false);
  assert.equal(starts, 0);
  assert.equal(audio.playCalls, 1);
  await player.update({ muted: false });
  assert.equal(player.playing, true);
  assert.equal(starts, 1);
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.loop, true);
  player.dispose();
});

test('preview never loads or plays music, including when an audio gesture is requested', async () => {
  let created = 0;
  const audio = recording(), player = createBackgroundMusicPlayer({ createAudio: () => { created++; return audio; } });
  await player.update({ preview: true });
  await player.unlock();
  await player.update({ talking: true, masterVolume: 1 });
  assert.equal(created, 0);
  await player.update({ preview: false });
  assert.equal(created, 1);
  assert.equal(audio.playCalls, 1);
  player.dispose();
});

test('a blocked autoplay waits for the next real gesture instead of retrying every state update', async () => {
  let blocks = 0;
  const audio = recording(() => audio.playCalls === 1
    ? Promise.reject(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }))
    : Promise.resolve());
  const player = createBackgroundMusicPlayer({ createAudio: () => audio, onBlocked: () => { blocks++; } });
  assert.equal(await player.update(), false);
  await player.update({ talking: true });
  await player.update({ volume: .3 });
  assert.equal(audio.playCalls, 1);
  assert.equal(blocks, 1);
  assert.equal(await player.unlock(), true);
  assert.equal(audio.playCalls, 2);
  assert.equal(player.playing, true);
  player.dispose();
});

test('speech ducks only the music and both volume controls remain effective across pause and resume', async () => {
  const audio = recording(), player = createBackgroundMusicPlayer({ createAudio: () => audio });
  await player.update({ volume: .4, masterVolume: .5 });
  assert.equal(audio.volume, .2);
  await player.update({ talking: true });
  assert.ok(Math.abs(audio.volume - .044) < 1e-9);
  await player.update({ talking: false });
  assert.equal(audio.volume, .2);
  await player.update({ paused: true });
  assert.equal(audio.paused, true);
  await player.update({ paused: false, volume: 8, masterVolume: .5 });
  assert.equal(audio.volume, .5);
  assert.equal(audio.currentTime, 13.5);
  await player.update({ volume: null, masterVolume: NaN });
  assert.ok(Math.abs(audio.volume - .224) < 1e-9);
  await player.update({ enabled: false });
  assert.equal(audio.paused, true);
  await player.update({ enabled: true, masterVolume: -1 });
  assert.equal(audio.paused, true);
  player.dispose();
});

test('disposing an overlay during load cannot resurrect playback or recreate an audio element', async () => {
  const loading = deferred(), audio = recording(() => loading.promise);
  let created = 0;
  const player = createBackgroundMusicPlayer({ createAudio: () => { created++; return audio; } });
  const pending = player.update();
  player.dispose();
  loading.resolve();
  await pending;
  await player.unlock();
  await player.update({ muted: false });
  assert.equal(audio.paused, true);
  assert.equal(player.playing, false);
  assert.equal(created, 1);
});

test('resuming before an interrupted load settles still starts the latest requested playback once', async () => {
  const loading = deferred();
  const audio = recording(() => audio.playCalls === 1 ? loading.promise : Promise.resolve());
  const player = createBackgroundMusicPlayer({ createAudio: () => audio });
  const first = player.update();
  await player.update({ paused: true });
  const resumed = player.update({ paused: false });
  loading.reject(Object.assign(new Error('Paused during load'), { name: 'AbortError' }));
  await Promise.all([first, resumed]);
  await Promise.resolve();
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.paused, false);
  assert.equal(player.playing, true);
  player.dispose();
});
