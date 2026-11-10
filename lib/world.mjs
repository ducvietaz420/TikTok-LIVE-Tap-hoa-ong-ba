import { validateGiftMap, getGiftRule } from './gifts.mjs';
import { toAvatarProxyURL } from './avatar.mjs';
export const LEVELS = [500, 1500, 3500, 7500, 15000];
export const DEFAULT_SETTINGS = { shopName: 'TẠP HOÁ ÔNG BA', speechInterval: 55, volume: 0.8, voiceEnabled: true, ambientEnabled: true, musicEnabled: true, musicVolume: 0.28, autoSpeech: true, residentsEnabled: true, residentInterval: 5, paused: false, night: false, weather: 'sunny', quality: 'high' };
// Entry identities live only in memory, never in saved state or API snapshots.
const viewerEntriesByWorld = new WeakMap();
const VIEWER_REENTRY_MS = 90_000, MAX_ENTRY_IDENTITIES = 2048;

export function createWorld(saved = {}, { giftRules = [] } = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  if (typeof settings.musicEnabled !== 'boolean') settings.musicEnabled = DEFAULT_SETTINGS.musicEnabled;
  settings.musicVolume = Number.isFinite(settings.musicVolume) ? Math.min(1, Math.max(0, settings.musicVolume)) : DEFAULT_SETTINGS.musicVolume;
  if (typeof settings.residentsEnabled !== 'boolean') settings.residentsEnabled = DEFAULT_SETTINGS.residentsEnabled;
  settings.residentInterval = Number.isFinite(settings.residentInterval) ? Math.min(15, Math.max(3, settings.residentInterval)) : DEFAULT_SETTINGS.residentInterval;
  return { settings, points: Math.max(0, Number(saved.points) || 0), likes: 0, followers: 0, visitorsEntered: 0,
    supporters: Array.isArray(saved.supporters) ? saved.supporters.slice(0, 30) : [],
    giftRules: validateGiftMap(Array.isArray(saved.giftRules) ? saved.giftRules : giftRules),
    shopLevelOverride: Math.min(5, Math.max(1, Math.floor(Number(saved.shopLevelOverride) || 1))),
    connection: 'disconnected', lastEvent: null, startedAt: Date.now() };
}

export function snapshot(world) {
  const level = Math.min(5, Math.max(world.shopLevelOverride || 1, 1 + LEVELS.slice(0, 4).filter(n => world.points >= n).length));
  const previous = level === 1 ? 0 : LEVELS[level - 2];
  const target = LEVELS[level - 1];
  return { ...world, level, target, progress: Math.min(1, Math.max(0, (world.points - previous) / (target - previous))) };
}

export function setGiftRules(world, input) {
  const rules = validateGiftMap(input);
  world.giftRules = rules;
  return rules;
}

export function updateSettings(world, input = {}) {
  for (const key of ['voiceEnabled', 'ambientEnabled', 'musicEnabled', 'autoSpeech', 'residentsEnabled', 'paused', 'night']) {
    if (typeof input[key] === 'boolean') world.settings[key] = input[key];
  }
  if (typeof input.shopName === 'string') world.settings.shopName = input.shopName.trim().slice(0, 42) || DEFAULT_SETTINGS.shopName;
  if (Number.isFinite(input.volume)) world.settings.volume = Math.min(1, Math.max(0, input.volume));
  if (Number.isFinite(input.musicVolume)) world.settings.musicVolume = Math.min(1, Math.max(0, input.musicVolume));
  if (Number.isFinite(input.speechInterval)) world.settings.speechInterval = Math.min(300, Math.max(20, input.speechInterval));
  if (Number.isFinite(input.residentInterval)) world.settings.residentInterval = Math.min(15, Math.max(3, input.residentInterval));
  if (['sunny', 'rain'].includes(input.weather)) world.settings.weather = input.weather;
  if (['high', 'low'].includes(input.quality)) world.settings.quality = input.quality;
}

export function applyEvent(world, event, now = Date.now()) {
  if (event.type === 'member') {
    const identityValue = event.userId;
    const userId = (typeof identityValue === 'string' || typeof identityValue === 'bigint' || typeof identityValue === 'number' && Number.isSafeInteger(identityValue))
      ? String(identityValue).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 150) : '';
    if (!userId || userId === '0' || event.memberAction !== undefined && event.memberAction !== 1) return null;
    const roomId = typeof event.roomId === 'string' || typeof event.roomId === 'number' ? String(event.roomId).slice(0, 150) : '';
    const viewerKey = JSON.stringify([roomId, userId]);
    const avatar = toAvatarProxyURL(event.avatar);
    if (!event.demo) {
      let entries = viewerEntriesByWorld.get(world);
      if (!entries) { entries = new Map(); viewerEntriesByWorld.set(world, entries); }
      for (const [key, record] of entries) if (record.expires <= now) entries.delete(key);
      const previous = entries.get(viewerKey);
      if (previous) {
        // A later event may finally provide the missing photo. Upgrade the same
        // pending visitor, while keeping the original entry count/cooldown.
        if (previous.hasAvatar || !avatar) return null;
        previous.hasAvatar = true;
      } else {
        entries.set(viewerKey, { expires: now + VIEWER_REENTRY_MS, hasAvatar: Boolean(avatar) });
        while (entries.size > MAX_ENTRY_IDENTITIES) entries.delete(entries.keys().next().value);
        world.visitorsEntered = (Number(world.visitorsEntered) || 0) + 1;
      }
    }
    const user = String(event.user || userId).normalize('NFC').slice(0, 60);
    // Even while paused, forward entries so the scene can queue them. A missing
    // avatar remains empty: renderers must wait/skip instead of inventing a face.
    return { action: 'viewer', user, userId, viewerKey, avatar, voice: null, text: `${user} vừa ghé tiệm`, demo: Boolean(event.demo), at: now };
  }
  if (world.settings.paused && event.demo) return null;
  const beforeLevel = snapshot(world).level;
  const user = String(event.user || 'Một người bạn').slice(0, 60);
  const effect = { action: 'wave', voice: null, user, text: '', demo: Boolean(event.demo), at: now };
  if (event.type === 'gift') {
    const coins = Math.min(1e8, Math.max(0, Math.floor(Number(event.coins) || 0)));
    if (!event.demo) {
      world.points += coins;
      const key = String(event.userId || user);
      let supporter = world.supporters.find(p => p.id === key);
      if (!supporter) { supporter = { id: key, user, points: 0 }; world.supporters.push(supporter); }
      supporter.user = user; supporter.points += coins;
      world.supporters.sort((a,b) => b.points - a.points);
      world.supporters = world.supporters.slice(0, 30);
    }
    const rule = getGiftRule(event, world.giftRules);
    const count = Math.max(1, Math.floor(Number(event.count) || 1));
    effect.giftId = String(event.giftId || '');
    effect.giftName = String(event.giftName || rule?.giftName || 'Quà tặng').slice(0, 100);
    effect.giftIcon = rule?.icon || '';
    const avatar = toAvatarProxyURL(event.avatar);
    if (avatar) effect.avatar = avatar;
    effect.ruleId = rule?.id || null;
    effect.action = rule?.action || (coins >= 100 ? 'fireworks' : 'stock');
    effect.voice = rule ? rule.voice : 'gift';
    effect.text = `${user} · ${rule ? rule.label : 'Ghé tiếp hàng'} · ${effect.giftName} ×${count}`;
    if (rule?.action === 'upgrade' && !event.demo) world.shopLevelOverride = Math.min(5, beforeLevel + count);
  } else if (event.type === 'like') {
    if (!event.demo) world.likes += Math.max(0, Number(event.likes) || 0);
    effect.action = 'heart'; effect.text = `${user} gửi một chút yêu thương`;
  } else if (event.type === 'follow' || event.type === 'subscribe') {
    if (!event.demo && event.type === 'follow') world.followers++;
    effect.voice = 'follow'; effect.text = `Chào ${user}, ghé tiệm chơi nha!`;
  } else if (event.type === 'share') {
    effect.voice = 'share'; effect.text = `Cảm ơn ${user} đã chia sẻ LIVE!`;
  } else if (event.type === 'chat') {
    const text = String(event.text || '').trim().toLocaleLowerCase('vi');
    if (/^(trà|tra|chè|che|uống trà|uong tra)[!?.\s]*$/u.test(text)) {
      effect.action = 'tea'; effect.voice = 'tea'; effect.text = `${user}, ngồi uống chén trà với ông nhé!`;
    } else if (/^(mèo|meo)[!?.\s]*$/u.test(text)) {
      effect.action = 'cat'; effect.text = `${user} gọi bé Mướp ra chơi`;
    } else return null;
  } else return null;
  effect.levelUp = snapshot(world).level > beforeLevel;
  if (effect.levelUp && !effect.ruleId) { effect.action = 'upgrade'; effect.voice = 'upgrade'; }
  world.lastEvent = { type: event.type, user, text: effect.text, at: now, demo: effect.demo };
  return world.settings.paused ? null : effect;
}
