import { extractAvatarURL } from './avatar.mjs';

/**
 * TikFinity Event API: ws://localhost:21213/ -> {event, data}.
 * Supports the flattened connector payload used by TikFinity and the newer
 * nested TikTok-Live-Connector payload. Coins are gift metadata, not cash.
 */
const SUPPORTED = new Set(['gift', 'chat', 'like', 'follow', 'share', 'member', 'subscribe', 'roomUser']);
const MAX = Number.MAX_SAFE_INTEGER;
const clean = (value, limit = 240) => typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
  ? String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const integer = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(MAX, Math.floor(number)) : fallback;
};
const first = (...values) => values.find(value => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== ''));
const positiveId = value => {
  const result = clean(value, 150);
  return result && result !== '0' ? result : '';
};
const finished = value => value === true || value === 1 || value === '1' || value === 'true';

function parse(input) {
  try {
    if (typeof input === 'string') return input.length <= 1_000_000 ? JSON.parse(input) : null;
    if (input instanceof Uint8Array) return input.byteLength <= 1_000_000 ? JSON.parse(new TextDecoder().decode(input)) : null;
    return input;
  } catch { return null; }
}

function normalizeOne(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const type = message.event;
  if (!SUPPORTED.has(type)) return null;
  const data = message.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const nestedUser = data.user && typeof data.user === 'object' ? data.user : {};
  const userId = clean(first(data.userId, nestedUser.userId, nestedUser.id, data.uniqueId, nestedUser.uniqueId, nestedUser.displayId), 150);
  const user = clean(first(data.nickname, nestedUser.nickname, data.uniqueId, nestedUser.uniqueId, nestedUser.displayId), 70) || 'Khách ghé quán';
  const messageId = positiveId(first(data.msgId, data.common?.msgId, data.messageId));
  const roomId = positiveId(first(data.roomId, data.common?.roomId));
  const created = integer(first(data.createTime, data.common?.createTime), 0);
  const timestamp = created ? (created < 1e12 ? created * 1000 : created) : undefined;
  const event = { id: messageId ? `${type}:${roomId}:${messageId}` : '', type, user, userId, giftName: '', coins: 0, count: 1, text: '', likes: 0 };
  if (timestamp) event.timestamp = timestamp;
  const avatar = extractAvatarURL(data);
  if (avatar) event.avatar = avatar;

  if (type === 'gift') {
    const gift = data.gift && typeof data.gift === 'object' ? data.gift : {};
    const details = data.giftDetails && typeof data.giftDetails === 'object' ? data.giftDetails : {};
    const extended = data.extendedGiftInfo && typeof data.extendedGiftInfo === 'object' ? data.extendedGiftInfo : {};
    const giftType = integer(first(data.giftType, gift.type, details.giftType), -1);
    // A repeatable gift is emitted repeatedly with cumulative counts. Wait for
    // the final message, including a one-gift streak's second/final message.
    if (giftType === 1 && !finished(data.repeatEnd)) return null;
    // If metadata is absent, an explicit nonfinal flag still identifies an
    // unfinished streak. Do not count it just because giftType is missing.
    if (giftType === -1 && data.repeatEnd !== undefined && !finished(data.repeatEnd)) return null;
    event.count = Math.max(1, integer(data.repeatCount, 1));
    const perGift = integer(first(data.diamondCount, gift.diamondCount, details.diamondCount, extended.diamond_count, extended.diamondCount), 0);
    event.coins = Math.min(MAX, perGift * event.count);
    event.giftName = clean(first(data.giftName, gift.name, details.giftName, extended.name), 100) || 'Quà tặng';
    const groupId = positiveId(data.groupId);
    const giftId = positiveId(first(data.giftId, gift.id, details.giftId, extended.id));
    event.giftId = giftId;
    const giftImages = first(data.giftPictureUrl, data.giftImageUrl, gift.image?.urlList, gift.image?.url_list, gift.image?.url, details.image?.urlList, details.image?.url_list);
    const image = Array.isArray(giftImages) ? giftImages[0] : giftImages;
    if (typeof image === 'string' && /^https:\/\//i.test(image)) event.giftImage = clean(image, 1200);
    // groupId identifies a streak; giftId alone never identifies a transaction.
    if (groupId) event.id = `gift-group:${roomId}:${userId || user}:${giftId}:${groupId}`;
  } else if (type === 'chat') {
    event.text = clean(first(data.comment, data.content), 300);
    if (!event.text) return null;
  } else if (type === 'like') {
    event.likes = integer(first(data.likeCount, data.count), 0);
    event.totalLikes = integer(first(data.totalLikeCount, data.total), 0);
    if (!event.likes && !event.totalLikes) return null;
  } else if (type === 'roomUser') {
    event.viewers = integer(first(data.viewerCount, data.total), 0);
  } else if (type === 'member') {
    // Protobuf MemberMessageAction.JOINED=1; SUBSCRIBED=3 is a different
    // interaction. Older TikFinity payloads expose actionId or omit it.
    const memberAction = first(data.action, data.actionId);
    if (memberAction !== undefined && memberAction !== 1 && memberAction !== '1' && memberAction !== 'JOINED') return null;
    const candidates = [data.userId, nestedUser.userId, nestedUser.id, data.uniqueId, nestedUser.uniqueId, nestedUser.displayId];
    event.userId = candidates.map(value => typeof value === 'number' && !Number.isSafeInteger(value) ? '' : positiveId(value)).find(Boolean) || '';
    // A nickname/count-only notice cannot identify which person's avatar to use.
    if (!event.userId) return null;
    event.user = clean(first(data.nickname, nestedUser.nickname, data.uniqueId, nestedUser.uniqueId, nestedUser.displayId), 70) || event.userId;
    event.roomId = roomId;
    event.memberAction = 1;
  }
  return event;
}

/** Stateless payload normalization. Intermediate gift streaks return []. */
export function normalizeTikfinityMessage(input) {
  const parsed = parse(input);
  // The documented protocol is one event per message; accepting arrays helps
  // local playback/testing without interpreting unknown wrapper protocols.
  const messages = Array.isArray(parsed) ? parsed.slice(0, 1000) : [parsed];
  return messages.map(normalizeOne).filter(Boolean);
}

/**
 * One instance per running bridge; keep it through websocket reconnects.
 * Only stable platform IDs are deduplicated. Equal-looking messages with no
 * ID can be independent gifts/likes and must not be silently dropped.
 */
export function createEventNormalizer({ maxSeen = 10000, ttlMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const seen = new Map();
  const capacity = Math.max(1, integer(maxSeen, 10000));
  const ttl = Math.max(1, integer(ttlMs, 15 * 60 * 1000));
  const normalize = input => {
    const time = now();
    for (const [key, record] of seen) {
      if (record.expires <= time) seen.delete(key);
      else break;
    }
    return normalizeTikfinityMessage(input).filter(event => {
      if (!event.id) return true;
      const record = seen.get(event.id);
      if (record && record.expires > time) {
        // Some entry metadata arrives in a second, more complete copy. Allow
        // only the first safe photo upgrade; gift receipts stay strictly once.
        if (event.type === 'member' && event.avatar && !record.hasAvatar) { record.hasAvatar = true; return true; }
        return false;
      }
      // Reinsert expired entries so expiration order remains insertion order.
      seen.delete(event.id);
      seen.set(event.id, { expires: time + ttl, hasAvatar: Boolean(event.avatar) });
      while (seen.size > capacity) seen.delete(seen.keys().next().value);
      return true;
    });
  };
  normalize.clear = () => seen.clear();
  return normalize;
}
