/* Temporary: cross-language consistency check of the data files. */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(import.meta.dirname, '..', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

let problems = 0;
const fail = (...args) => { problems++; console.log('PROBLEM', ...args); };

for (const source of ['sights', 'enterprises', 'people']) {
  const be = load(source + '.json');
  for (const lang of ['ru', 'en']) {
    const other = load(source + '.' + lang + '.json');
    if (be.length !== other.length) fail(source, lang, 'length', be.length, other.length);
    be.forEach((o, i) => {
      const p = other[i];
      if (!p || p.id !== o.id) { fail(source, lang, o.id, 'id mismatch'); return; }
      for (const key of ['image', 'audio', 'lat', 'lng']) {
        if (JSON.stringify(o[key]) !== JSON.stringify(p[key])) fail(source, lang, o.id, key, o[key], p[key]);
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
}

console.log(problems ? problems + ' PROBLEMS' : 'CROSS-LANGUAGE DATA CONSISTENT');
process.exit(problems ? 1 : 0);
