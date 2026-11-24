// What is laid over the picture: a compass strip at the top with the way to the objective and how far it is, and
// a line of words that comes and goes in the upper middle. It is plain page, not paint, kept quiet: Georgia, the
// cream of the hint, the lantern's warm colour for the one thing it points at.
import { t, onLang } from './i18n.js';

const SPAN = 75 * (Math.PI / 180); // the strip shows this far either side of where the eye looks
const STEP = 15 * (Math.PI / 180);
const CREAM = '243, 227, 195';
const WARM = '#f2b562';
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Compass bearing of a direction on the ground: 0 north (-z), east (+x) clockwise. */
export const bearingOf = (dx, dz) => Math.atan2(dx, -dz);

export function createHud({ hidden = false } = {}) {
  const root = document.getElementById('hud');
  const canvas = document.getElementById('compass');
  const label = document.getElementById('compass-label');
  const banner = document.getElementById('banner');
  const life = document.getElementById('life');
  const lifeFill = life?.querySelector('.fill');
  const lifeLoss = life?.querySelector('.loss');
  const hurtWash = document.getElementById('hurt');
  const veil = document.getElementById('veil');
  const foe = document.getElementById('foe');
  const foeFill = foe?.querySelector('.fill');
  if (hidden || !root) {
    for (const el of [root, banner, life, hurtWash, veil, foe]) el?.remove();
    return { compass() {}, say() {}, hide() {}, life() {}, hurt() {}, veil() {}, foe() {} };
  }
  root.hidden = false;
  life.hidden = false;
  const g = canvas.getContext('2d');
  let width = 0, ratio = 1;
  const fit = () => {
    ratio = Math.min(devicePixelRatio || 1, 2);
    width = Math.round(Math.min(520, innerWidth - 32));
    canvas.style.width = `${width}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(30 * ratio);
    last = null;
  };
  addEventListener('resize', fit);

  let letters = {};
  let last = null; // what was drawn, to draw again only when it changes
  let target = null; // { bearing, dist, label } or null
  onLang(() => {
    letters = { 0: t('compass.N'), 90: t('compass.E'), 180: t('compass.S'), 270: t('compass.W') };
    last = null;
    if (target) label.textContent = text(target);
  });
  fit();

  const text = (tg) => `${t(tg.label)} · ${Math.max(0, Math.round(tg.dist))} m`;

  function draw(heading) {
    const H = 30, mid = width / 2;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const x = (rel) => mid + (rel / SPAN) * mid;
    // ticks every 15 degrees, the four quarters lettered
    const first = Math.ceil((heading - SPAN) / STEP);
    for (let k = first; k * STEP <= heading + SPAN; k++) {
      const rel = wrap(k * STEP - heading), px = x(rel);
      const fade = 1 - Math.abs(rel) / SPAN;
      const deg = ((Math.round(k * 15) % 360) + 360) % 360;
      if (letters[deg]) {
        g.font = `${deg === 0 ? 'bold ' : ''}14px Georgia, serif`;
        g.fillStyle = `rgba(${CREAM}, ${0.25 + 0.7 * fade})`;
        g.fillText(letters[deg], px, 16);
      } else {
        g.strokeStyle = `rgba(${CREAM}, ${0.3 + 0.55 * fade})`;
        g.lineWidth = 1;
        const tall = deg % 45 === 0 ? 8 : 5;
        g.beginPath(); g.moveTo(px, 16 - tall / 2); g.lineTo(px, 16 + tall / 2); g.stroke();
      }
    }
    // where the eye looks: a small notch at the top
    g.fillStyle = `rgba(${CREAM}, 0.8)`;
    g.beginPath(); g.moveTo(mid - 4, 0); g.lineTo(mid + 4, 0); g.lineTo(mid, 5); g.closePath(); g.fill();
    if (!target) return;
    // the objective: a warm diamond, held at the edge with a chevron when it is behind the strip's reach
    const rel = wrap(target.bearing - heading);
    const off = Math.abs(rel) > SPAN * 0.94;
    const px = off ? mid + Math.sign(rel) * (mid - 10) : x(rel);
    g.fillStyle = WARM;
    g.shadowColor = 'rgba(242, 181, 98, 0.7)';
    g.shadowBlur = 8;
    g.beginPath();
    if (off) {
      const s = Math.sign(rel);
      g.moveTo(px - 4 * s, 9); g.lineTo(px + 4 * s, 16); g.lineTo(px - 4 * s, 23);
      g.closePath();
    } else {
      g.moveTo(px, 9); g.lineTo(px + 6, 16); g.lineTo(px, 23); g.lineTo(px - 6, 16); g.closePath();
    }
    g.fill();
    g.shadowBlur = 0;
  }

  let sayTimer = 0, sayStop = () => {};
  return {
    /** heading: where the eye looks (a bearing). tg: { bearing, dist, label: i18n key } or null for none. */
    compass(heading, tg) {
      target = tg;
      const shown = tg ? Math.round(tg.dist) : -1;
      if (last && Math.abs(wrap(heading - last.heading)) < 0.002 && last.shown === shown && last.bearing === (tg?.bearing ?? null)) return;
      if (tg) label.textContent = text(tg);
      label.hidden = !tg;
      draw(heading);
      last = { heading, shown, bearing: tg?.bearing ?? null };
    },
    /** A line of words in the upper middle for `seconds`, fading in and out. `key` is an i18n key. */
    say(key, seconds = 4) {
      sayStop();
      clearTimeout(sayTimer);
      sayStop = onLang(() => { banner.textContent = t(key); });
      banner.classList.add('on');
      sayTimer = setTimeout(() => { banner.classList.remove('on'); sayStop(); sayStop = () => {}; }, seconds * 1000);
    },
    hide(on = true) { root.hidden = on; life.hidden = on; },
    /** A small bar over a wolf: at (x, y) in the page's pixels, its health 0..1; null hides it. */
    foe(x, y, share) {
      if (x == null) { if (!foe.hidden) foe.hidden = true; return; }
      foe.hidden = false;
      foe.style.transform = `translate(${Math.round(x - 32)}px, ${Math.round(y - 14)}px)`;
      const pct = `${(Math.max(0, share) * 100).toFixed(1)}%`;
      if (foeFill.style.width !== pct) foeFill.style.width = pct;
    },
    /** His health, 0..1. What was just lost lingers a moment in a paler colour before it goes. */
    life(share) {
      const pct = `${(Math.max(0, Math.min(1, share)) * 100).toFixed(1)}%`;
      if (lifeFill.style.width === pct) return;
      lifeFill.style.width = pct;
      lifeLoss.style.width = pct;
      life.classList.toggle('low', share < 0.3);
    },
    /** A wash of colour from the edges: he has been bitten. */
    hurt() {
      hurtWash.classList.remove('on');
      void hurtWash.offsetWidth; // start the fade again
      hurtWash.classList.add('on');
    },
    /** The dark that comes down when he falls, with words in it (i18n keys), or lifts again (on = false). */
    veil(on, title = 'death', sub = 'death.sub') {
      if (on) {
        veil.querySelector('.title').textContent = t(title);
        veil.querySelector('.sub').textContent = t(sub);
      }
      veil.classList.toggle('on', on);
    },
  };
}
