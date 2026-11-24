// Every word the page shows, in Turkish and English. The language is the address's (?lang=tr|en), else the one
// chosen last time, else the browser's. Changing it rewrites what is on the page at once; nothing is reloaded.
export const LANGS = ['tr', 'en'];

const STRINGS = {
  tr: {
    'scene.aurora': 'Kuzey ışıkları',
    'scene.autumn': 'Sonbahar ormanı',
    loading: 'Boya karılıyor',
    'hint.aurora': 'Tıkla ve bak · WASD yürü · Shift koş · Space zıpla · V birinci şahıs',
    'hint.autumn': 'Tıkla ve bak · WASD yürü · Shift koş · Space zıpla · tekerlek ile uzaklaş',
    'compass.N': 'K', 'compass.E': 'D', 'compass.S': 'G', 'compass.W': 'B',
    'obj.cabin': 'Kulübe',
    'obj.cabin.goal': 'Kuzeydeki kulübeye ulaş',
    'obj.cabin.done': 'Kulübeye ulaştın',
    death: 'Düştün',
    'death.sub': 'Son kayıt noktasından devam ediyorsun',
    checkpoint: 'Kayıt noktası',
  },
  en: {
    'scene.aurora': 'Aurora',
    'scene.autumn': 'Autumn wood',
    loading: 'Mixing paint',
    'hint.aurora': 'Click to look · WASD move · Shift sprint · Space jump · V first person',
    'hint.autumn': 'Click to look · WASD move · Shift sprint · Space jump · wheel to step back',
    'compass.N': 'N', 'compass.E': 'E', 'compass.S': 'S', 'compass.W': 'W',
    'obj.cabin': 'Cabin',
    'obj.cabin.goal': 'Reach the cabin to the north',
    'obj.cabin.done': 'You have reached the cabin',
    death: 'You have fallen',
    'death.sub': 'Back to the last resting point',
    checkpoint: 'Resting point',
  },
};

const KEY = 'oilpaint.lang';
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* private window: it is only forgotten */ } },
};
const valid = (l) => (LANGS.includes(l) ? l : null);
let lang = valid(new URLSearchParams(location.search).get('lang')) ?? valid(store.get())
  ?? (/^tr\b/i.test(navigator.language ?? '') ? 'tr' : 'en');
document.documentElement.lang = lang;

/** The words for `key` in the current language; {name} in them is filled from `vars`. */
export function t(key, vars) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}
export const getLang = () => lang;

const listeners = new Set();
/** Calls `fn` now and whenever the language changes. Returns a function that stops it. */
export function onLang(fn) {
  listeners.add(fn);
  fn(lang);
  return () => listeners.delete(fn);
}
export function setLang(next) {
  if (!valid(next) || next === lang) return;
  lang = next;
  document.documentElement.lang = lang;
  store.set(lang);
  for (const fn of listeners) fn(lang);
}
