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
    /* "gallery" holds the extra carousel photos — they are image references
       like any other, so they must be checked and counted too. */
    const refs = {
      image: [item.image, ...(Array.isArray(item.gallery) ? item.gallery : [])].filter(Boolean),
      audio: [item.audio].filter(Boolean),
    };
    for (const [key, paths] of Object.entries(refs)) {
      for (const p of paths) {
        referenced[key].add(p);
        if (!fs.existsSync(toLocal(p))) {
          perLang[key + ' missing'] = perLang[key + ' missing'] || [];
          if (!perLang[key + ' missing'].some((e) => e.ref === p && e.file === file)) {
            perLang[key + ' missing'].push({ file, id: item.id, ref: p });
          }
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
/* the recordings sit one folder deeper, under the name of their language, so
   the comparison has to walk the whole tree instead of listing one directory */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const unused = (dir, kind) => walk(dir)
  .map((file) => '../' + path.relative(ROOT, file).split(path.sep).join('/'))
  .filter((ref) => !referenced[kind].has(ref));
console.log('== files on disk not referenced by any data file');
console.log('   images: ' + (unused(imgDir, 'image').join(', ') || '-'));
console.log('   audio:  ' + (unused(audDir, 'audio').join(', ') || '-'));
console.log('== referenced assets total: ' + referenced.image.size + ' images, ' + referenced.audio.size + ' audio');
