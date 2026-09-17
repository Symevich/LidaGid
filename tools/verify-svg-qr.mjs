/* Decodes the exact SVG the app renders (cellSize 4, margin 8).
   Run: node tools/verify-svg-qr.mjs */
import qrcode from '../js/vendor/qrcode.js';
import { QRCodeReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';

const CELL = 4;
const MARGIN = 8;

function modulesFromSvg(svg) {
  const points = [...svg.matchAll(/M(\d+),(\d+)/g)].map((m) => [+m[1], +m[2]]);
  const maxX = Math.max(...points.map((p) => p[0]));
  const maxY = Math.max(...points.map((p) => p[1]));
  const n = (maxX + CELL - MARGIN) / CELL;
  const grid = Array.from({ length: n }, () => new Array(n).fill(false));
  for (const [x, y] of points) {
    const col = (x - MARGIN) / CELL;
    const row = (y - MARGIN) / CELL;
    grid[row][col] = true;
  }
  return { grid, n };
}

function decode(grid, n, scale, quiet) {
  const size = (n + quiet * 2) * scale;
  const lum = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && grid[my][mx];
      lum[y * size + x] = dark ? 0 : 255;
    }
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, size, size)));
  return new QRCodeReader().decode(bitmap).getText();
}

const targets = [
  'https://lidagid.by/#/object/sights/lidski-zamak',
  'http://localhost:8000/index.html#/object/enterprises/maloczny-zavod',
];
let failures = 0;
for (const url of targets) {
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const svg = qr.createSvgTag({ cellSize: CELL, margin: MARGIN, scalable: true, title: 't', alt: 'a' });
  const { grid, n } = modulesFromSvg(svg);
  checkOrBust(svg, n, 'module count', (v) => v >= 21 && v % 4 === 1);
  const decoded = decode(grid, n, 4, 4);
  const ok = decoded === url;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} modules, svg ${svg.length} bytes -> ${decoded}`);
}
console.log(failures ? `${failures} FAILURES` : 'SVG QR DECODES CORRECTLY');

function checkOrBust(svg, n, label, predicate) {
  if (!predicate(n)) {
    failures++;
    console.log(`FAIL ${label}: ${n}`);
  }
}
process.exit(failures ? 1 : 0);
