// Generates all app icons from one SVG design: node scripts/make-icons.mjs
// Outputs Expo icons (mobile/assets/images) and PWA icons (server/public/icons).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const images = path.resolve(here, '../assets/images');
const pwa = path.resolve(here, '../../server/public/icons');
fs.mkdirSync(pwa, { recursive: true });

const GREEN = '#0F6B4A';
const GREEN_LIGHT = '#16946A';

// Shield with a check mark, drawn in a 100×100 box. `scale` shrinks it around the centre
// (Android adaptive icons and maskable PWA icons need the artwork inside a safe zone).
function mark({ scale = 1, shield = '#FFFFFF', check = GREEN }) {
  const t = `translate(50 50) scale(${scale}) translate(-50 -50)`;
  return `
    <g transform="${t}">
      <path d="M50 10 L81 22.5 V46 C81 66 67.5 81 50 89 C32.5 81 19 66 19 46 V22.5 Z" fill="${shield}"/>
      <path d="M35.5 49.5 L45.5 59.5 L65.5 38.5" fill="none" stroke="${check}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
}

const background = (rounded) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GREEN_LIGHT}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient></defs>
  <rect width="100" height="100" ${rounded ? 'rx="22"' : ''} fill="url(#g)"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

function png(file, body, size) {
  const out = new Resvg(svg(body), { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(file, out);
  console.log(`${path.relative(path.resolve(here, '../..'), file)} (${size}px)`);
}

// Expo / native
png(path.join(images, 'icon.png'), background(false) + mark({ scale: 0.78 }), 1024);
png(path.join(images, 'android-icon-background.png'), `<rect width="100" height="100" fill="${GREEN}"/>`, 1024);
png(path.join(images, 'android-icon-foreground.png'), mark({ scale: 0.56 }), 1024);
png(path.join(images, 'android-icon-monochrome.png'), mark({ scale: 0.56, check: 'transparent' }), 1024);
png(path.join(images, 'splash-icon.png'), mark({ scale: 0.9 }), 512);
png(path.join(images, 'favicon.png'), background(true) + mark({ scale: 0.8 }), 64);

// PWA (Add to Home Screen)
png(path.join(pwa, 'icon-192.png'), background(true) + mark({ scale: 0.78 }), 192);
png(path.join(pwa, 'icon-512.png'), background(true) + mark({ scale: 0.78 }), 512);
png(path.join(pwa, 'maskable-512.png'), background(false) + mark({ scale: 0.6 }), 512);
png(path.join(pwa, 'apple-touch-icon.png'), background(false) + mark({ scale: 0.75 }), 180);
