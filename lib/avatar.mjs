// TikTok profile images are delivered by its image CDNs. Keep this list narrow:
// an avatar URL is untrusted event data, never an arbitrary server-side URL.
const AVATAR_DOMAINS = Object.freeze([
  'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com',
  'byteoversea.com', 'ibytedtos.com', 'ibyteimg.com',
]);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export function validateAvatarURL(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    const host = url.hostname.toLowerCase();
    if (!AVATAR_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

function imageURLs(value, depth = 0) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || depth > 3) return [];
  if (Array.isArray(value)) return value.slice(0, 20).flatMap(item => imageURLs(item, depth + 1));
  return ['urlList', 'url_list', 'urls', 'url'].flatMap(key => imageURLs(value[key], depth + 1));
}

/** Legacy TikFinity fields and nested protobuf User image fields. */
export function extractAvatarURL(data = {}) {
  if (!data || typeof data !== 'object') return '';
  const user = data.user && typeof data.user === 'object' ? data.user : {};
  const sources = [
    data.profilePictureUrl, data.profilePictureUrls, user.profilePictureUrl, user.profilePictureUrls,
    user.avatarThumb, user.avatar_thumb, user.avatarMedium, user.avatar_medium, user.avatarLarger, user.avatar_larger,
    data.avatarThumb, data.avatar_thumb, data.avatarMedium, data.avatar_medium, data.avatarLarger, data.avatar_larger,
    user.avatarUrl, user.avatar_url, data.avatarUrl, data.avatar_url, user.avatar, data.avatar,
    data.userDetails?.profilePictureUrls,
  ];
  for (const source of sources) {
    for (const candidate of imageURLs(source)) {
      const safe = validateAvatarURL(candidate);
      if (safe) return safe;
    }
  }
  return '';
}

export function toAvatarProxyURL(value) {
  const url = validateAvatarURL(value);
  return url ? `/api/avatar?url=${encodeURIComponent(url)}` : '';
}

function hasImageSignature(bytes, mimeType) {
  if (mimeType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (mimeType === 'image/gif') return bytes.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6)));
  return false;
}

async function imageBody(response, maxBytes, signal) {
  const statedLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(statedLength) && statedLength > maxBytes) throw new Error('Ảnh đại diện vượt quá giới hạn 1 MB.');
  if (!response.body?.getReader) throw new Error('Không nhận được ảnh đại diện.');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Ảnh đại diện vượt quá giới hạn 1 MB.');
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Factory permits fast, deterministic network-boundary tests without real requests. */
export function createAvatarFetcher({ fetchImpl = globalThis.fetch, now = Date.now,
  timeoutMs = 4000, maxBytes = 1024 * 1024, maxEntries = 32, ttlMs = 5 * 60 * 1000 } = {}) {
  const cache = new Map(), inFlight = new Map();
  const clone = value => ({ body: value.body.slice(), mimeType: value.mimeType });
  const fetchOne = async source => {
    const safe = validateAvatarURL(source);
    if (!safe) throw new Error('URL ảnh đại diện không thuộc CDN TikTok được cho phép.');
    const clock = now();
    for (const [key, item] of cache) if (item.expires <= clock) cache.delete(key);
    const cached = cache.get(safe);
    if (cached) return clone(cached.value);
    if (inFlight.has(safe)) return clone(await inFlight.get(safe));
    if (inFlight.size >= 8) throw new Error('Đang tải nhiều ảnh đại diện, vui lòng thử lại.');
    const request = (async () => {
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Tải ảnh đại diện quá thời gian.')); }, timeoutMs);
      });
      const download = (async () => {
        let current = safe;
        for (let redirects = 0; redirects <= 2; redirects++) {
          const response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal,
            headers: { Accept: 'image/avif;q=0,image/webp,image/png,image/jpeg,image/gif' } });
          if (REDIRECT_CODES.has(response.status)) {
            if (redirects === 2) throw new Error('Ảnh đại diện chuyển hướng quá nhiều lần.');
            const location = response.headers.get('location');
            const next = location ? validateAvatarURL(new URL(location, current).href) : '';
            void response.body?.cancel().catch(() => {});
            if (!next) throw new Error('Ảnh đại diện chuyển hướng ra ngoài CDN TikTok.');
            current = next;
            continue;
          }
          if (!response.ok) throw new Error(`Không tải được ảnh đại diện (${response.status}).`);
          const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!IMAGE_TYPES.has(mimeType)) { void response.body?.cancel().catch(() => {}); throw new Error('Định dạng ảnh đại diện không được hỗ trợ.'); }
          const bytes = await imageBody(response, maxBytes, controller.signal);
          if (!hasImageSignature(bytes, mimeType)) throw new Error('Nội dung ảnh đại diện không hợp lệ.');
          return { body: bytes, mimeType };
        }
      })();
      try { return await Promise.race([download, timeout]); }
      finally { clearTimeout(timer); controller.abort(); }
    })();
    inFlight.set(safe, request);
    try {
      const value = await request;
      cache.set(safe, { value, expires: now() + ttlMs });
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      return clone(value);
    } finally { inFlight.delete(safe); }
  };
  fetchOne.clear = () => cache.clear();
  return fetchOne;
}

export const fetchAvatar = createAvatarFetcher();
