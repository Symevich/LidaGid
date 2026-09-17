/* Temporary: compare asset references in data/*.json with the files on disk. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const toLocal = (p) => (p ? path.join(ROOT, p.replace(/^\.\.\//, '')) : '');

const referenced = { image: new Set(), audio: new Set() };
const perLang = {};

for (const file of fs.readdirSync(DATA).filter((f) => f.endsWith('.json'))) {
  const items = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
  for (const item of items) {
    for (const key of ['image', 'audio']) {
      if (item[key]) {
        referenced[key].add(item[key]);
        if (!fs.existsSync(toLocal(item[key]))) {
          perLang[key + ' missing'] = perLang[key + ' missing'] || [];
          if (!perLang[key + ' missing'].some((e) => e.ref === item[key] && e.file === file)) {
            perLang[key + ' missing'].push({ file, id: item.id, ref: item[key] });
          }
        }
      }
    }
    /* the MP3 fallback is built from the OGG path by app.js */
    if (item.audio && /\.ogg$/i.test(item.audio)) {
      const mp3 = toLocal(item.audio.replace(/\.ogg$/i, '.mp3'));
      if (!fs.existsSync(mp3)) {
        perLang['mp3 missing'] = perLang['mp3 missing'] || [];
        if (!perLang['mp3 missing'].some((e) => e.ref === item.audio)) {
          perLang['mp3 missing'].push({ file, id: item.id, ref: item.audio.replace(/\.ogg$/i, '.mp3') });
        }
      }
    }
  }
}

for (const [label, rows] of Object.entries(perLang)) {
  console.log('== ' + label + ' (' + rows.length + ')');
  for (const r of rows) console.log('   ' + r.id + '  ' + r.ref + '   <- ' + r.file);
}

const imgDir = path.join(ROOT, 'assets', 'images');
const audDir = path.join(ROOT, 'assets', 'audio');
/* the folder name is used as-is, so "audio" does not become "audios" */
const unused = (dir, kind) => {
  const prefix = '../assets/' + path.basename(dir) + '/';
  return fs.readdirSync(dir).filter((f) => !referenced[kind].has(prefix + f));
};
console.log('== files on disk not referenced by any data file');
console.log('   images: ' + (unused(imgDir, 'image').join(', ') || '-'));
console.log('   audio:  ' + (unused(audDir, 'audio').join(', ') || '-'));
console.log('== referenced assets total: ' + referenced.image.size + ' images, ' + referenced.audio.size + ' audio');
