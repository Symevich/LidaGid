/* Verifies js/vendor/qrcode.js output with an independent decoder (ZXing).
   Run: node tools/verify-qr.js */
const qrcode = require('../js/vendor/qrcode.js');
const {
  QRCodeReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
} = require('@zxing/library');

function toLuminance(qr, scale, quiet) {
  const n = qr.getModuleCount();
  const size = (n + quiet * 2) * scale;
  const lum = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.isDark(my, mx);
      lum[y * size + x] = dark ? 0 : 255;
    }
  }
  return { lum, size };
}

const urls = [
  'https://lidagid.by/#/object/sights/lidski-zamak',
  'http://192.168.1.10:8080/index.html#/object/enterprises/maloczny-zavod',
  'https://example.org/#/object/people/hedymin',
];

let failures = 0;
for (const url of urls) {
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const { lum, size } = toLuminance(qr, 4, 4);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, size, size)));
  const decoded = new QRCodeReader().decode(bitmap).getText();
  const ok = decoded === url;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} v${qr.getModuleCount()} ${decoded}`);
}
console.log(failures ? `${failures} FAILURES` : 'ALL QR DECODED CORRECTLY');
process.exit(failures ? 1 : 0);
