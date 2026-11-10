// Individual viewer arrivals only. A room's aggregate count is never a person.
export function viewerAvatarPath(effect = {}) {
  const path = typeof effect.avatar === 'string' ? effect.avatar : '';
  if (effect.demo === true && path === '/avatar-demo.svg') return path;
  if (!path.startsWith('/api/avatar?') || path.length > 6000) return '';
  try {
    const parsed = new URL(path, 'http://local');
    const remote = new URL(parsed.searchParams.get('url'));
    return parsed.pathname === '/api/avatar' && remote.protocol === 'https:' ? path : '';
  } catch { return ''; }
}

export function createVisitorQueue({capacity = 64, maxAge = 90} = {}) {
  const waiting = [], occupied = new Map();
  const stats = {accepted: 0, expired: 0, overflow: 0, missingAvatar: 0};
  let sequence = 0;
  function prune(now) {
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (now - waiting[i].enteredAt > maxAge) { waiting.splice(i, 1); stats.expired++; }
    }
  }
  function enqueue(effect, now = 0) {
    prune(now);
    const avatar = viewerAvatarPath(effect);
    if (!avatar) { stats.missingAvatar++; return false; }
    const user = String(effect.user || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 70);
    const key = String(effect.viewerKey || effect.userId || user).trim().slice(0, 180);
    if (!user || !key || occupied.has(key) || waiting.some(entry => entry.key === key)) return false;
    if (waiting.length >= capacity) { stats.overflow++; return false; }
    waiting.push({key, user, userId: String(effect.userId || '').slice(0, 150), avatar, demo: effect.demo === true, enteredAt: now, sequence: sequence++});
    stats.accepted++; return true;
  }
  function take(now = 0) {
    prune(now); const entry = waiting.shift();
    if (entry) occupied.set(entry.key, entry);
    return entry || null;
  }
  return {enqueue, take, complete(key) { occupied.delete(key); },
    snapshot() { return {...stats, queued: waiting.length, occupied: occupied.size}; },
    clear() { waiting.length = 0; occupied.clear(); }};
}
