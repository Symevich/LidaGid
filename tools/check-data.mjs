/* Temporary: cross-language consistency check of the data files. */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(import.meta.dirname, '..', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

let problems = 0;
const fail = (...args) => { problems++; console.log('PROBLEM', ...args); };

/* A translation's recording must carry its own locale in the file name
   ("…/lidski-zamak.ru.mp3"); the bare "…/lidski-zamak.mp3" is the Belarusian
   original and must not be borrowed by ru/en. MP3 is the only shipped format,
   so an OGG reference would not play and is rejected. */
const isLocalePath = (p, lang) => new RegExp(`\.${lang}\.mp3$`, 'i').test(p);

for (const source of ['sights', 'enterprises', 'people']) {
  const be = load(source + '.json');
  for (const lang of ['ru', 'en']) {
    const other = load(source + '.' + lang + '.json');
    if (be.length !== other.length) fail(source, lang, 'length', be.length, other.length);
    be.forEach((o, i) => {
      const p = other[i];
      if (!p || p.id !== o.id) { fail(source, lang, o.id, 'id mismatch'); return; }
      /* "gallery" holds the extra carousel photos, so it has to stay
         identical across languages exactly like "image" does. */
      for (const key of ['image', 'gallery', 'lat', 'lng']) {
        if (JSON.stringify(o[key]) !== JSON.stringify(p[key])) fail(source, lang, o.id, key, o[key], p[key]);
      }
      /* Audio is locale-specific: each language may point at its own
         recording (…/lidski-zamak.ru.mp3 vs …/lidski-zamak.en.mp3), and a
         language without a translated recording simply omits the field so
         the object page shows no player at all. Sharing one file across
         locales is therefore allowed, but the file must belong to that
         locale — the default (Belarusian) recordings live at
         "…/<id>.mp3", the translations must not fall back to them by
         accident, so a suffixed path is required once one is given. */
      if (p.audio && !isLocalePath(p.audio, lang)) {
        fail(source, lang, o.id, 'audio not locale-specific', p.audio);
      }
      /* The recording must belong to this very object: a copy-paste slip once
         handed one sight the narration of another, and nothing caught it. */
      if (p.audio && !p.audio.endsWith(`/${p.id}${lang === 'be' ? '' : '.' + lang}.mp3`)) {
        fail(source, lang, o.id, 'audio named after another object', p.audio);
      }
      if (!p.quiz) { fail(source, lang, o.id, 'quiz missing'); return; }
      if (o.quiz.correctIndex !== p.quiz.correctIndex) fail(source, lang, o.id, 'correctIndex');
      if (o.quiz.options.length !== p.quiz.options.length) fail(source, lang, o.id, 'option count');
      if (lang !== 'be' && o.quiz.question === p.quiz.question) fail(source, lang, o.id, 'question not translated');
      if (lang !== 'be' && o.quiz.explanation === p.quiz.explanation) fail(source, lang, o.id, 'explanation not translated');
      for (const opt of p.quiz.options) {
        if (typeof opt !== 'string' || !opt.trim()) fail(source, lang, o.id, 'empty option');
      }
    });
  }

  /* extra carousel photos: checked once, they are language-independent */
  be.forEach((o) => {
    if (o.gallery === undefined) return;
    if (!Array.isArray(o.gallery) || !o.gallery.length) {
      fail(source, 'be', o.id, 'gallery must be a non-empty array');
      return;
    }
    o.gallery.forEach((g) => {
      if (typeof g !== 'string' || !g.trim()) fail(source, 'be', o.id, 'bad gallery path', g);
    });
  });
}

console.log(problems ? problems + ' PROBLEMS' : 'CROSS-LANGUAGE DATA CONSISTENT');
process.exit(problems ? 1 : 0);
