import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateAvatarURL, extractAvatarURL, toAvatarProxyURL, createAvatarFetcher } from '../lib/avatar.mjs';
import { normalizeTikfinityMessage, createEventNormalizer } from '../lib/events.mjs';
import { createWorld, applyEvent } from '../lib/world.mjs';

const avatar = 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt/example.webp?x-expires=99&x-signature=photo';
const alternative = 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-avt/example.webp';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH3sAAAAASUVORK5CYII=', 'base64');
const imageResponse = (data = png, headers = {}) => new Response(data, { headers: { 'content-type': 'image/png', ...headers } });

test('avatar URLs allow only HTTPS TikTok CDN hosts, without credentials or alternate ports', () => {
  assert.equal(validateAvatarURL(avatar), avatar);
  assert.equal(validateAvatarURL(alternative + '#ignored'), alternative);
  for (const value of [
    'http://p16-sign-va.tiktokcdn.com/avatar.png', 'https://127.0.0.1/avatar.png',
    'https://[::1]/avatar.png', 'https://169.254.169.254/latest/meta-data',
    'https://tiktokcdn.com.attacker.test/avatar.png', 'https://fake-tiktokcdn.com/avatar.png',
    'https://p16-sign-va.tiktokcdn.com:444/avatar.png', 'https://name:secret@p16-sign-va.tiktokcdn.com/avatar.png',
    'file:///C:/private.png', 'data:image/png;base64,abc', avatar + '\n', null,
  ]) assert.equal(validateAvatarURL(value), '', String(value));
});

test('avatar extraction supports legacy and nested image fields, skipping invalid candidates', () => {
  assert.equal(extractAvatarURL({ profilePictureUrl: avatar }), avatar);
  assert.equal(extractAvatarURL({ user: { avatarThumb: { urlList: ['http://invalid.test/x', alternative] } } }), alternative);
  assert.equal(extractAvatarURL({ user: { avatar_thumb: { url_list: [avatar] } } }), avatar);
  assert.equal(extractAvatarURL({ user: { avatarMedium: { urlList: [avatar] } } }), avatar);
  assert.equal(extractAvatarURL({ userDetails: { profilePictureUrls: [avatar] } }), avatar);
  assert.equal(extractAvatarURL({ profilePictureUrl: 'https://example.com/face.png', user: { avatarLarger: { urlList: [alternative] } } }), alternative);
  assert.equal(extractAvatarURL({ user: { avatarThumb: { urlList: ['https://localhost/face.png'] } } }), '');
});

test('normalized events retain valid donor avatars while preserving gift IDs and deduplication', () => {
  const normalize = createEventNormalizer();
  const input = { event: 'gift', data: { msgId: 'avatar-gift', userId: '42', nickname: 'Lan', giftId: 5487,
    giftType: 1, repeatEnd: true, repeatCount: 2, diamondCount: 5, profilePictureUrl: avatar } };
  const [gift] = normalize(input);
  assert.equal(gift.avatar, avatar); assert.equal(gift.giftId, '5487'); assert.equal(gift.coins, 10);
  assert.deepEqual(normalize(input), []);
  const [chat] = normalizeTikfinityMessage({ event: 'chat', data: { content: 'Chào ông', user: { avatarThumb: { urlList: [alternative] } } } });
  assert.equal(chat.avatar, alternative);
  const [unsafe] = normalizeTikfinityMessage({ event: 'gift', data: { giftId: 5487, profilePictureUrl: 'https://localhost/private.png' } });
  assert.equal(unsafe.avatar, undefined);
});

test('sitting gift forwards the actual donor avatar through a local proxy, without persisting it in supporters', async () => {
  const rules = JSON.parse(await readFile(new URL('../public/gift-map.json', import.meta.url), 'utf8'));
  const sit = rules.find(rule => rule.action === 'sit');
  const world = createWorld({}, { giftRules: rules });
  const effect = applyEvent(world, { type: 'gift', giftId: sit.giftId, giftName: sit.giftName,
    coins: 5, count: 1, user: 'Bạn Lan', userId: 'lan', avatar });
  assert.equal(effect.action, 'sit'); assert.equal(effect.user, 'Bạn Lan');
  assert.equal(effect.avatar, `/api/avatar?url=${encodeURIComponent(avatar)}`);
  assert.equal(toAvatarProxyURL('https://example.com/private.png'), '');
  assert.equal(world.supporters[0].avatar, undefined);
  const unsafeEffect = applyEvent(world, { type: 'gift', giftId: sit.giftId, coins: 5, user: 'Khách', avatar: 'https://localhost/private.png' });
  assert.equal(unsafeEffect.avatar, undefined);
});

test('avatar downloads return valid image bytes and cache them without exposing mutable cache contents', async () => {
  let calls = 0;
  const fetchAvatar = createAvatarFetcher({ fetchImpl: async (url, options) => {
    calls++; assert.equal(url, avatar); assert.equal(options.redirect, 'manual');
    return imageResponse();
  } });
  const first = await fetchAvatar(avatar);
  assert.equal(first.mimeType, 'image/png'); assert.deepEqual(first.body, new Uint8Array(png));
  first.body[0] = 0;
  const second = await fetchAvatar(avatar);
  assert.equal(second.body[0], 137); assert.equal(calls, 1);
});

test('blocked URLs and redirects are rejected before a request can reach private or unrelated hosts', async () => {
  const calls = [];
  const fetchAvatar = createAvatarFetcher({ fetchImpl: async url => {
    calls.push(url); return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  } });
  await assert.rejects(fetchAvatar('https://127.0.0.1/private'), /CDN TikTok/);
  assert.equal(calls.length, 0);
  await assert.rejects(fetchAvatar(avatar), /chuyển hướng/);
  assert.deepEqual(calls, [avatar]);
});

test('same-provider redirects are revalidated and limited to two hops', async () => {
  let calls = 0;
  const fetchAvatar = createAvatarFetcher({ fetchImpl: async url => {
    calls++;
    return url === avatar ? new Response(null, { status: 302, headers: { location: alternative } }) : imageResponse();
  } });
  assert.equal((await fetchAvatar(avatar)).mimeType, 'image/png'); assert.equal(calls, 2);
  let redirects = 0;
  const loop = createAvatarFetcher({ fetchImpl: async () => {
    redirects++; return new Response(null, { status: 302, headers: { location: avatar } });
  } });
  await assert.rejects(loop(avatar), /quá nhiều/); assert.equal(redirects, 3);
});

test('oversized headers, oversized streaming bodies and non-image payloads are rejected', async () => {
  const overHeader = createAvatarFetcher({ maxBytes: 8, fetchImpl: async () => imageResponse(png, { 'content-length': '99' }) });
  await assert.rejects(overHeader(avatar), /giới hạn/);
  const overBody = createAvatarFetcher({ maxBytes: 8, fetchImpl: async () => imageResponse() });
  await assert.rejects(overBody(avatar), /giới hạn/);
  const svg = createAvatarFetcher({ fetchImpl: async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) });
  await assert.rejects(svg(avatar), /Định dạng/);
  const disguised = createAvatarFetcher({ fetchImpl: async () => imageResponse('<html>not a photo</html>') });
  await assert.rejects(disguised(avatar), /Nội dung/);
});

test('avatar fetching has a hard time limit and aborts a slow upstream request', async () => {
  let aborted = false;
  const fetchAvatar = createAvatarFetcher({ timeoutMs: 30, fetchImpl: async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }) });
  const start = Date.now();
  await assert.rejects(fetchAvatar(avatar), /thời gian/);
  assert.equal(aborted, true); assert.ok(Date.now() - start < 1000);
});

test('avatar cache expires, stays bounded and shares concurrent downloads', async () => {
  let clock = 0, calls = 0;
  const fetchAvatar = createAvatarFetcher({ now: () => clock, ttlMs: 10, maxEntries: 2, fetchImpl: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 5)); return imageResponse();
  } });
  await Promise.all([fetchAvatar(avatar), fetchAvatar(avatar)]); assert.equal(calls, 1);
  clock = 11; await fetchAvatar(avatar); assert.equal(calls, 2);
  await fetchAvatar(alternative); await fetchAvatar(avatar + '&photo=3');
  await fetchAvatar(avatar); assert.equal(calls, 5);
});
