import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTikfinityMessage, createEventNormalizer } from '../lib/events.mjs';
import { createWorld, snapshot, applyEvent, updateSettings } from '../lib/world.mjs';

const avatar = 'https://p16-sign-va.tiktokcdn.com/example-viewer.webp?x-expires=9999999999';
const member = (overrides = {}) => ({ event: 'member', data: { userId: '7283215532487924459', uniqueId: 'banmai', nickname: 'Ban Mai', profilePictureUrl: avatar, roomId: 'room-a', actionId: 1, ...overrides } });

test('an individual entry produces an avatar walker without any comment, like, follow or gift', () => {
  const world = createWorld(), [event] = normalizeTikfinityMessage(member());
  const effect = applyEvent(world, event, 1000);
  assert.equal(effect.action, 'viewer');assert.equal(effect.user, 'Ban Mai');assert.equal(effect.userId, '7283215532487924459');
  assert.equal(effect.avatar, '/api/avatar?url=' + encodeURIComponent(avatar));assert.equal(effect.voice, null);
  assert.equal(world.visitorsEntered, 1);assert.equal(world.points, 0);assert.equal(world.followers, 0);assert.equal(world.likes, 0);
  assert.deepEqual(world.supporters, []);assert.equal(world.lastEvent, null);
});

test('modern nested member identity and avatar retain the real user rather than a nickname-only guess', () => {
  const [event] = normalizeTikfinityMessage({event:'member',data:{action:1,common:{roomId:'r'},user:{id:'100',displayId:'hoa',nickname:'Hoa',avatarThumb:{urlList:[avatar]}}}});
  assert.equal(event.userId,'100');assert.equal(event.user,'Hoa');assert.equal(event.avatar,avatar);assert.equal(event.roomId,'r');assert.equal(event.memberAction,1);
  assert.equal(normalizeTikfinityMessage(member({userId:undefined,uniqueId:'legacy.viewer',actionId:undefined}))[0].userId,'legacy.viewer');
});

test('aggregate room counts, anonymous names and subscription/admin notices never invent an arriving person', () => {
  for (const payload of [
    {event:'member',data:{nickname:'Anonymous',profilePictureUrl:avatar}},
    {event:'member',data:{userId:'0',memberCount:100}},
    {event:'member',data:{userId:true,nickname:'Boolean identity'}},
    {event:'member',data:{userId:9007199254740992,nickname:'Imprecise identity'}},
    member({actionId:3}),member({actionId:0}),member({actionId:false}),
    {event:'join',data:{userId:'1',profilePictureUrl:avatar}},
  ]) assert.deepEqual(normalizeTikfinityMessage(payload),[]);
  const [room] = normalizeTikfinityMessage({event:'roomUser',data:{total:100}}),world=createWorld();
  assert.equal(room.viewers,100);assert.equal(applyEvent(world,room),null);assert.equal(world.visitorsEntered,0);
});

test('same-viewer reconnect spam is suppressed for ninety seconds without suppressing different viewers or rooms', () => {
  const world=createWorld(),[first]=normalizeTikfinityMessage(member());
  assert.ok(applyEvent(world,first,1000));assert.equal(applyEvent(world,first,2000),null);
  assert.ok(applyEvent(world,{...first,userId:'different'},2001));
  assert.ok(applyEvent(world,{...first,roomId:'room-b'},2002));
  assert.equal(applyEvent(world,first,90999),null);assert.ok(applyEvent(world,first,91000));
  assert.equal(world.visitorsEntered,4);
});

test('a later real avatar upgrades a pending visitor without double-counting or substituting an unrelated photo', () => {
  const world=createWorld(),[entry]=normalizeTikfinityMessage(member({profilePictureUrl:undefined}));
  const missing=applyEvent(world,entry,1000);assert.equal(missing.avatar,'');
  assert.equal(applyEvent(world,{...entry,avatar:'https://example.com/wrong-person.jpg'},1001),null);
  const refreshed=applyEvent(world,{...entry,avatar},1002);assert.equal(refreshed.viewerKey,missing.viewerKey);
  assert.equal(refreshed.avatar,'/api/avatar?url='+encodeURIComponent(avatar));assert.equal(world.visitorsEntered,1);
  assert.equal(applyEvent(world,{...entry,avatar},1003),null);
});

test('paused scenes still receive viewer entries to queue, while demo entries never change real counts', () => {
  const world=createWorld();world.settings.paused=true;
  const [entry]=normalizeTikfinityMessage(member());
  assert.equal(applyEvent(world,entry,1000).action,'viewer');assert.equal(world.visitorsEntered,1);
  assert.equal(applyEvent(world,{...entry,demo:true},1001).demo,true);assert.equal(world.visitorsEntered,1);
  assert.equal(createWorld({visitorsEntered:1000}).visitorsEntered,0);
  assert.ok(!JSON.stringify(snapshot(world)).includes(avatar));
});

test('entry state is isolated between running worlds and resident timing is bounded', () => {
  const [entry]=normalizeTikfinityMessage(member()),first=createWorld(),second=createWorld();
  assert.ok(applyEvent(first,entry,1000));assert.ok(applyEvent(second,entry,1000));
  assert.equal(first.settings.residentsEnabled,true);assert.equal(first.settings.residentInterval,5);
  updateSettings(first,{residentsEnabled:false,residentInterval:1});assert.equal(first.settings.residentInterval,3);
  updateSettings(first,{residentsEnabled:'true',residentInterval:100});assert.equal(first.settings.residentsEnabled,false);assert.equal(first.settings.residentInterval,15);
  assert.equal(second.settings.residentsEnabled,true);
});

test('platform message IDs still deduplicate entries before the independent per-viewer gate', () => {
  const normalize=createEventNormalizer(),payload=member({msgId:'join-1'});
  assert.equal(normalize(payload).length,1);assert.equal(normalize(payload).length,0);
  payload.data.msgId='join-2';assert.equal(normalize(payload).length,1);
});

test('a more complete copy of the same entry receipt can supply its first real avatar exactly once', () => {
  const normalize=createEventNormalizer(),world=createWorld(),payload=member({msgId:'join-photo',profilePictureUrl:undefined});
  assert.equal(applyEvent(world,normalize(payload)[0],1000).avatar,'');
  payload.data.profilePictureUrl=avatar;
  const [updated]=normalize(payload);assert.ok(updated);assert.equal(applyEvent(world,updated,1001).avatar,'/api/avatar?url='+encodeURIComponent(avatar));
  assert.deepEqual(normalize(payload),[]);assert.equal(world.visitorsEntered,1);
});

test('saved crowd settings cannot create an unbounded or invalid resident spawn interval',()=>{
  const fast=createWorld({settings:{residentInterval:0,residentsEnabled:'yes'}}),slow=createWorld({settings:{residentInterval:999}});
  assert.equal(fast.settings.residentInterval,3);assert.equal(fast.settings.residentsEnabled,true);assert.equal(slow.settings.residentInterval,15);
});
