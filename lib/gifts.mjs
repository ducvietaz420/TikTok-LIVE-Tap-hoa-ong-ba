export const GIFT_ACTIONS = Object.freeze(['vegetables', 'snack', 'materials', 'milk', 'cake', 'sit', 'weather', 'wind', 'windstrong', 'live', 'music', 'upgrade', 'storm', 'dog', 'stone', 'ask']);
const VOICES = new Set(['ambient', 'greeting', 'gift', 'follow', 'tea', 'rain', 'upgrade']);
const text = (value, max = 100) => typeof value === 'string' || typeof value === 'number'
  ? String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

export function normalizeGiftId(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return '';
  const id = String(value).trim();
  return /^\d{1,30}$/.test(id) && /[1-9]/.test(id) ? id.replace(/^0+/, '') : '';
}

export function normalizeGiftName(value) {
  return text(value, 150).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Pure validation shared by the bridge and configuration API. No matching by cost. */
export function validateGiftMap(input) {
  if (!Array.isArray(input) || input.length > 64) throw new Error('Danh sách quà phải là một mảng, tối đa 64 dòng.');
  const ids = new Set(), gifts = new Set(), names = new Map();
  return input.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`Dòng quà ${index + 1} không hợp lệ.`);
    const id = text(source.id, 50);
    if (!/^[a-z][a-z0-9_-]*$/.test(id) || ids.has(id)) throw new Error(`Mã dòng quà ${index + 1} thiếu hoặc bị trùng.`);
    ids.add(id);
    if (!GIFT_ACTIONS.includes(source.action)) throw new Error(`Hành động của dòng ${index + 1} không hợp lệ.`);
    const rawGiftId = text(source.giftId, 40), giftId = normalizeGiftId(source.giftId);
    if (rawGiftId && !giftId) throw new Error(`ID quà của dòng ${index + 1} phải là số nguyên dương.`);
    if (giftId && gifts.has(giftId)) throw new Error(`Quà ID ${giftId} đang được gán cho hai hành động.`);
    if (giftId) gifts.add(giftId);
    const label = text(source.label, 45);
    if (!label) throw new Error(`Dòng quà ${index + 1} thiếu tên hành động.`);
    const giftName = text(source.giftName, 100);
    const aliases = Array.isArray(source.aliases) ? source.aliases.slice(0, 20).map(x => text(x, 100)).filter(Boolean) : [];
    // Configured gift names also serve as aliases when older senders omit IDs.
    const allNames = new Set([giftName, ...aliases].map(normalizeGiftName).filter(Boolean));
    for (const name of allNames) {
      if (names.has(name) && names.get(name) !== id) throw new Error(`Tên quà “${name}” đang được gán cho hai hành động.`);
      names.set(name, id);
    }
    const icon = text(source.icon, 160);
    if (icon && !/^\/gifts\/[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g|gif|svg)$/.test(icon)) throw new Error(`Hình quà dòng ${index + 1} phải nằm trong thư mục /gifts/.`);
    const cost = Number(source.diamonds);
    const diamonds = source.diamonds === null || source.diamonds === '' || source.diamonds === undefined ? null
      : Number.isSafeInteger(cost) && cost >= 0 ? cost : null;
    if (source.diamonds !== undefined && source.diamonds !== null && source.diamonds !== '' && diamonds === null) throw new Error(`Giá quà dòng ${index + 1} không hợp lệ.`);
    const color = /^#[0-9a-f]{6}$/i.test(source.color) ? source.color : '#6d7943';
    const voice = source.voice === null ? null : VOICES.has(source.voice) ? source.voice : 'gift';
    return { id, action: source.action, label, giftId, giftName, aliases, icon, diamonds, color,
      description: text(source.description, 160), voice };
  });
}

/** An upstream gift ID is authoritative. Names are fallback only without an ID. */
export function getGiftRule(event, rules = []) {
  const giftId = normalizeGiftId(event?.giftId);
  if (giftId) return rules.find(rule => rule.giftId === giftId) || null;
  const name = normalizeGiftName(event?.giftName);
  if (!name) return null;
  return rules.find(rule => [rule.giftName, ...(rule.aliases || [])].some(alias => normalizeGiftName(alias) === name)) || null;
}
