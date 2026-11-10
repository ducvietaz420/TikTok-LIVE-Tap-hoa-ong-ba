import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitorQueue, viewerAvatarPath} from '../public/visitors.js';
const person = (id, extra = {}) => ({userId: id, user: `Người xem ${id}`, avatar: '/api/avatar?url=https%3A%2F%2Fp16-sign-va.tiktokcdn.com%2Favatar.jpg', ...extra});
test('viewer arrivals can queue without a gift or comment and retain their own identity and photo', () => {
  const queue = createVisitorQueue();
  assert.equal(queue.enqueue(person('a'), 10), true); assert.equal(queue.enqueue(person('b'), 11), true);
  assert.deepEqual(queue.take(12), {...person('a'), key: 'a', demo: false, enteredAt: 10, sequence: 0});
  assert.equal(queue.take(12).key, 'b');
});
test('a viewer cannot be queued twice while queued or walking; completion releases the identity', () => {
  const queue = createVisitorQueue(); queue.enqueue(person('a'), 0);
  assert.equal(queue.enqueue(person('a'), 1), false); const current = queue.take(2);
  assert.equal(queue.enqueue(person('a'), 3), false); queue.complete(current.key);
  assert.equal(queue.enqueue(person('a'), 4), true);
});
test('missing or untrusted avatars never create a real viewer; a labelled demo is explicit', () => {
  const queue = createVisitorQueue();
  for (const avatar of ['', '/avatar-placeholder.svg', '/avatar-demo.svg', 'https://example.com/a.jpg', 'data:image/png;base64,AAAA', '/api/avatar?url=http%3A%2F%2F127.0.0.1']) assert.equal(queue.enqueue(person(avatar, {avatar}), 0), false);
  assert.equal(queue.enqueue(person('demo', {avatar: '/avatar-demo.svg', demo: true}), 0), true);
  assert.equal(viewerAvatarPath(person('good')), person('good').avatar);
});
test('the viewer queue stays bounded and expires old arrivals rather than replaying stale people', () => {
  const queue = createVisitorQueue({capacity: 2, maxAge: 10}); queue.enqueue(person('a'), 0); queue.enqueue(person('b'), 1);
  assert.equal(queue.enqueue(person('c'), 2), false); assert.equal(queue.snapshot().overflow, 1);
  assert.equal(queue.take(12), null); assert.equal(queue.snapshot().expired, 2);
  assert.equal(queue.enqueue(person('c'), 13), true);
});
