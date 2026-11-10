import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTikfinityMessage, createEventNormalizer } from '../lib/events.mjs';

test('legacy gift streak only counts final cumulative total', () => {
  const normalize = createEventNormalizer();
  const gift = { event: 'gift', data: { msgId: 'receipt-1', nickname: 'Bé Na', userId: 'u1', giftId: 5655, giftType: 1, giftName: 'Rose', diamondCount: 1, repeatCount: 1, repeatEnd: false } };
  assert.deepEqual(normalize(gift), []);
  gift.data.repeatCount = 6;
  assert.deepEqual(normalize(gift), []);
  gift.data.repeatEnd = true;
  assert.equal(normalize(gift)[0].coins, 6);
  assert.deepEqual(normalize(gift), []);
});

test('modern nested gift metadata and numeric final flag', () => {
  const [event] = normalizeTikfinityMessage({ event: 'gift', data: { common: { msgId: 'abc', roomId: 'room' }, user: { id: '23', displayId: 'banmai', nickname: 'Ban Mai' }, giftId: 17, gift: { type: 1, name: 'Tea', diamondCount: 5 }, repeatCount: 3, repeatEnd: 1 } });
  assert.deepEqual(event, { id: 'gift:room:abc', type: 'gift', user: 'Ban Mai', userId: '23', giftName: 'Tea', coins: 15, count: 3, text: '', likes: 0, giftId: '17' });
});

test('streak group dedup across different final message IDs and distinct users', () => {
  const normalize = createEventNormalizer();
  const gift = { event: 'gift', data: { groupId: 'streak-1', roomId: 'r', msgId: 'a', userId: 'a', giftId: 1, giftType: 1, diamondCount: 2, repeatEnd: true, repeatCount: 4 } };
  assert.equal(normalize(gift)[0].coins, 8);
  gift.data.msgId = 'b';
  assert.deepEqual(normalize(gift), []);
  gift.data.userId = 'b';
  assert.equal(normalize(gift).length, 1);
});

test('unknown gift cost is not invented; no-ID independent gifts survive', () => {
  const normalize = createEventNormalizer();
  const gift = { event: 'gift', data: { userId: 'a', giftId: 1, giftType: 0 } };
  assert.equal(normalize(gift)[0].coins, 0);
  assert.equal(normalize(gift).length, 1);
  gift.data.repeatEnd = false;
  delete gift.data.giftType;
  assert.deepEqual(normalize(gift), []);
});

test('chat, likes and viewer snapshots support legacy and modern fields', () => {
  const [oldChat, modernChat, oldLike, modernLike, room] = normalizeTikfinityMessage([
    { event: 'chat', data: { uniqueId: 'x', comment: 'Chào ông!' } },
    { event: 'chat', data: { user: { displayId: 'y' }, content: 'Ông ơi!' } },
    { event: 'like', data: { likeCount: 10, totalLikeCount: 100 } },
    { event: 'like', data: { count: 5, total: 105 } },
    { event: 'roomUser', data: { total: 9 } },
  ]);
  assert.equal(oldChat.text, 'Chào ông!');
  assert.equal(modernChat.user, 'y');
  assert.equal(oldLike.likes, 10);
  assert.equal(modernLike.totalLikes, 105);
  assert.equal(room.viewers, 9);
});

test('LIVE shares preserve flat and nested sharers and deduplicate stable receipt IDs', () => {
  const normalize = createEventNormalizer();
  const flat = { event: 'share', data: { msgId: 'share-a', roomId: 'room', nickname: 'Bé Mai', userId: 'mai' } };
  const nested = { event: 'share', data: { common: { msgId: 'share-b', roomId: 'room' }, user: { id: 'an', nickname: 'Bạn An' } } };
  const [first] = normalize(flat);
  assert.equal(first.type, 'share');
  assert.equal(first.user, 'Bé Mai');
  assert.equal(first.userId, 'mai');
  assert.equal(first.id, 'share:room:share-a');
  assert.deepEqual(normalize(flat), [], 'duplicate share receipts do not repeat the thank-you');
  const [second] = normalize(nested);
  assert.equal(second.type, 'share');
  assert.equal(second.user, 'Bạn An');
  assert.equal(second.userId, 'an');
  assert.deepEqual(normalize(nested), []);
  assert.equal(normalize({ ...flat, data: { ...flat.data, msgId: 'share-c' } }).length, 1, 'a new share by the same person is a separate event');
});

test('dedup cache expires and remains bounded', () => {
  let clock = 100;
  const normalize = createEventNormalizer({ maxSeen: 2, ttlMs: 10, now: () => clock });
  const follow = id => ({ event: 'follow', data: { msgId: id } });
  assert.equal(normalize(follow('a')).length, 1);
  assert.equal(normalize(follow('a')).length, 0);
  normalize(follow('b'));
  normalize(follow('c'));
  assert.equal(normalize(follow('a')).length, 1);
  clock = 111;
  assert.equal(normalize(follow('a')).length, 1);
  normalize.clear();
  assert.equal(normalize(follow('a')).length, 1);
});

test('malformed data and unsupported protocol never become events', () => {
  for (const input of [null, 'bad json', '{', {}, { event: 'gift' }, { event: 'gift', data: null }, { event: 'error', data: {} }, { event: 'chat', data: { comment: {} } }]) {
    assert.deepEqual(normalizeTikfinityMessage(input), []);
  }
  const [event] = normalizeTikfinityMessage(new TextEncoder().encode(JSON.stringify({ event: 'like', data: { likeCount: '8' } })));
  assert.equal(event.likes, 8);
});

test('untrusted numbers cannot yield NaN, negative or infinite totals', () => {
  const [event] = normalizeTikfinityMessage({ event: 'gift', data: { diamondCount: 'Infinity', repeatCount: -1, nickname: 'A\u0000B' } });
  assert.equal(event.coins, 0);
  assert.equal(event.count, 1);
  assert.equal(event.user, 'AB');
});

test('message IDs keep original 64-bit string precision and separate rooms', () => {
  const normalize = createEventNormalizer();
  const payload = { event: 'follow', data: { common: { msgId: '7283215532487924459', roomId: 'one', createTime: '1700000000' } } };
  const [event] = normalize(payload);
  assert.ok(event.id.includes('7283215532487924459'));
  assert.equal(event.timestamp, 1700000000000);
  payload.data.common.roomId = 'two';
  assert.equal(normalize(payload).length, 1);
});
