/* Temporary: cross-language consistency check of the data files. */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(import.meta.dirname, '..', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

let problems = 0;
const fail = (...args) => { problems++; console.log('PROBLEM', ...args); };

/* A recording lives in the folder of its own language and repeats that code
   in its name — "…/assets/audio/be/<id>.be.mp3" versus
   "…/assets/audio/ru/<id>.ru.mp3" — so a Belarusian file can never quietly
   serve the ru/en locales, and stays recognisable away from its folder. MP3 is
   the only shipped format, so an OGG reference would not play and is
   rejected. */
const audioPath = (lang, id) => `../assets/audio/${lang}/${id}.${lang}.mp3`;

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
         recording, and a language without a translated recording simply omits
         the field so the object page shows no player at all. The path is
         checked exactly — both folder and language code — because a copy-paste
         slip once handed one sight the narration of another and nothing caught
         it. */
      if (p.audio && p.audio !== audioPath(lang, p.id)) {
        fail(source, lang, o.id, 'audio path is not ' + audioPath(lang, p.id), p.audio);
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

  /* The Belarusian original is checked as well: it is the file the
     translations must not borrow, so a typo in its own path would otherwise
     never be noticed. */
  be.forEach((o) => {
    if (o.audio && o.audio !== audioPath('be', o.id)) {
      fail(source, 'be', o.id, 'audio path is not ' + audioPath('be', o.id), o.audio);
    }
  });

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
