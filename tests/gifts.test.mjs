import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GIFT_ACTIONS, normalizeGiftId, normalizeGiftName, validateGiftMap, getGiftRule } from '../lib/gifts.mjs';
import { normalizeTikfinityMessage, createEventNormalizer } from '../lib/events.mjs';
import { createWorld, snapshot, setGiftRules, applyEvent } from '../lib/world.mjs';

const sourceRows = JSON.parse(await readFile(new URL('../public/gift-map.json', import.meta.url), 'utf8'));
const fixtureRules = validateGiftMap(sourceRows.map((row, i) => ({ ...row, giftId: String(900001 + i),
  giftName: `Test Gift ${i + 1}`, icon: `/gifts/test-${i + 1}.png`, diamonds: i + 1, aliases: [`Quà thử ${i + 1}`] })));
const gift = (overrides = {}) => ({type:'gift',user:'Khách test',userId:'tester',giftName:'Test Gift 1',giftId:'900001',coins:1,count:1,...overrides});

test('the gift board contains all sixteen configured interaction actions', () => {
  const rows = validateGiftMap(sourceRows);
  assert.equal(rows.length, 16);
  assert.deepEqual(rows.map(row => row.action), GIFT_ACTIONS);
  assert.equal(new Set(rows.map(row => row.id)).size,16);
});

test('all sixteen gifts route by ID to their distinct action and local icon', () => {
  for (const [i, rule] of fixtureRules.entries()) {
    const world = createWorld({}, {giftRules: fixtureRules});
    const effect = applyEvent(world,gift({giftId:rule.giftId,giftName:`Renamed upstream ${i}`,coins:250}));
    assert.equal(effect.action,rule.action);
    assert.equal(effect.ruleId,rule.id);
    assert.equal(effect.giftIcon,rule.icon);
    assert.equal(effect.giftId,rule.giftId);
    assert.equal(effect.voice,rule.voice);
    assert.equal(world.points,250);
  }
});

test('gift IDs take precedence and unknown IDs never match a misleading name or equal price', () => {
  assert.equal(getGiftRule(gift({giftName:'Test Gift 2'}),fixtureRules).id,fixtureRules[0].id);
  assert.equal(getGiftRule(gift({giftId:'999999',giftName:'Test Gift 1'}),fixtureRules),null);
  const world=createWorld({}, {giftRules:fixtureRules});
  const effect=applyEvent(world,gift({giftId:'999999',giftName:'Not configured',coins:1}));
  assert.equal(effect.action,'stock');
  assert.equal(effect.ruleId,null);
  assert.equal(effect.giftIcon,'');
});

test('missing upstream IDs can match exact normalized Vietnamese or English aliases', () => {
  const wanted=fixtureRules[3];
  assert.equal(getGiftRule(gift({giftId:'',giftName:'  QUÀ   THỬ 4  '}),fixtureRules).id,wanted.id);
  assert.equal(getGiftRule(gift({giftId:undefined,giftName:'test gift 4'}),fixtureRules).id,wanted.id);
  assert.equal(getGiftRule(gift({giftId:'',giftName:'test gift 4 extra'}),fixtureRules),null);
  assert.equal(normalizeGiftName(' ĐÀN  CÀ! '),'dan ca');
  assert.equal(normalizeGiftId('0005655'),'5655');
  assert.equal(normalizeGiftId('7283215532487924459'),'7283215532487924459');
});

test('configuration rejects duplicate gift IDs, ambiguous aliases, unsafe icons and unknown actions', () => {
  const clone=()=>structuredClone(fixtureRules);
  let rows=clone();rows[1].giftId=rows[0].giftId;assert.throws(()=>validateGiftMap(rows),/hai hành động/);
  rows=clone();rows[1].aliases=['Quà thử 1'];assert.throws(()=>validateGiftMap(rows),/hai hành động/);
  rows=clone();rows[0].icon='/gifts/../private.png';assert.throws(()=>validateGiftMap(rows),/thư mục/);
  rows=clone();rows[0].action='unknown';assert.throws(()=>validateGiftMap(rows),/Hành động/);
  rows=clone();rows[0].giftId='NaN';assert.throws(()=>validateGiftMap(rows),/số nguyên dương/);
  assert.throws(()=>validateGiftMap({}),/mảng/);
});

test('normalizer preserves legacy and nested gift IDs and verified HTTPS gift images', () => {
  const [legacy,nested]=normalizeTikfinityMessage([
    {event:'gift',data:{giftId:'7283215532487924459',giftPictureUrl:'https://example.com/gift.png'}},
    {event:'gift',data:{gift:{id:5827,name:'Ice Cream',image:{urlList:['https://example.com/ice.webp']}}}},
  ]);
  assert.equal(legacy.giftId,'7283215532487924459');assert.equal(legacy.giftImage,'https://example.com/gift.png');
  assert.equal(nested.giftId,'5827');assert.equal(nested.giftImage,'https://example.com/ice.webp');
  const [unsafe]=normalizeTikfinityMessage({event:'gift',data:{giftId:1,giftPictureUrl:'javascript:alert(1)'}});
  assert.equal(unsafe.giftImage,undefined);
});

test('mapped gift action survives a point level threshold and reports the level up separately', () => {
  const world=createWorld({points:490},{giftRules:fixtureRules});
  const effect=applyEvent(world,gift({coins:50}));
  assert.equal(effect.action,'vegetables');assert.equal(effect.voice,'gift');assert.equal(effect.levelUp,true);
  assert.equal(snapshot(world).level,2);
});

test('upgrade gift permanently raises the shop level by final count and survives saving', () => {
  const upgrade=fixtureRules.find(row=>row.action==='upgrade');
  const world=createWorld({}, {giftRules:fixtureRules});
  const effect=applyEvent(world,gift({giftId:upgrade.giftId,count:2}));
  assert.equal(effect.action,'upgrade');assert.equal(effect.levelUp,true);
  assert.equal(world.shopLevelOverride,3);assert.equal(snapshot(world).level,3);
  const restored=createWorld(JSON.parse(JSON.stringify(world)),{giftRules:[]});
  assert.equal(snapshot(restored).level,3);assert.equal(restored.giftRules.length,16);
  applyEvent(restored,gift({giftId:upgrade.giftId,count:99}));
  assert.equal(snapshot(restored).level,5);
});

test('preview upgrade and other demo gifts never change permanent ledger or shop level', () => {
  const world=createWorld({}, {giftRules:fixtureRules});
  for(const rule of fixtureRules){
    const effect=applyEvent(world,gift({giftId:rule.giftId,coins:1000,count:3,demo:true}));
    assert.equal(effect.action,rule.action);assert.equal(effect.demo,true);
    assert.equal(world.points,0);assert.equal(world.shopLevelOverride,1);assert.deepEqual(world.supporters,[]);
  }
});

test('a final gift streak routes once, counts its total once and runs upgrade only once', () => {
  const normalize=createEventNormalizer();
  const upgrade=fixtureRules.find(row=>row.action==='upgrade');
  const world=createWorld({}, {giftRules:fixtureRules});
  const payload={event:'gift',data:{msgId:'a',groupId:'group',userId:'u',giftId:upgrade.giftId,giftType:1,repeatCount:2,repeatEnd:false,diamondCount:10}};
  assert.deepEqual(normalize(payload),[]);
  payload.data.repeatEnd=true;
  const first=normalize(payload);assert.equal(first.length,1);applyEvent(world,first[0]);
  payload.data.msgId='b';assert.deepEqual(normalize(payload),[]);
  assert.equal(world.points,20);assert.equal(world.shopLevelOverride,3);
});

test('saved gift choices override defaults and failed edits leave current choices intact', () => {
  const saved=fixtureRules.slice(0,2);
  const world=createWorld({giftRules:saved},{giftRules:fixtureRules});
  assert.equal(world.giftRules.length,2);
  assert.throws(()=>setGiftRules(world,[{id:'bad'}]));
  assert.equal(world.giftRules.length,2);
  setGiftRules(world,fixtureRules);
  assert.equal(world.giftRules.length,16);
});
