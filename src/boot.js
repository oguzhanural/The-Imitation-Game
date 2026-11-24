// Starts the picture the address asks for (src/scenes.js) and wires the buttons in the corner: the two that change
// the picture and the two that change the language (src/game/i18n.js).
import { SCENE, showScene } from './scenes.js';
import { t, onLang, setLang } from './game/i18n.js';

document.documentElement.dataset.scene = SCENE;
const q = new URLSearchParams(location.search);
const corners = ['scenes', 'langs'].map((id) => document.getElementById(id));
if (q.has('capture') || q.has('clean')) for (const c of corners) c?.remove();
const buttons = corners.flatMap((c) => [...(c?.querySelectorAll('button') ?? [])]);
for (const button of buttons) {
  // Space is jump: a button must never be left holding the keyboard
  button.addEventListener('keydown', (e) => e.preventDefault());
  button.addEventListener('focus', () => button.blur());
  const { scene, lang } = button.dataset;
  button.addEventListener('click', () => (scene ? showScene(scene) : setLang(lang)));
}
onLang((lang) => {
  for (const button of buttons) {
    const { scene } = button.dataset;
    if (scene) { button.textContent = t(`scene.${scene}`); button.classList.toggle('on', scene === SCENE); }
    else button.classList.toggle('on', button.dataset.lang === lang);
  }
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = t('loading');
  // the wood's hint is the page's own; the aurora writes its own once it is ready
  const hint = document.getElementById('hint');
  if (hint && SCENE === 'autumn') hint.textContent = t('hint.autumn');
});
if (SCENE === 'autumn') await import('./main.js');
else await import('./night/main.js');
