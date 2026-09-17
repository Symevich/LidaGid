/* Adds the optional "quiz" field to every object of all data files
   (3 sources x 3 languages) by patching the JSON text in place, so the
   existing formatting of the files is preserved. Run once: node tools/add-quiz.mjs */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data');
const LANGS = ['be', 'ru', 'en'];
const FILES = { be: (s) => `${s}.json`, ru: (s) => `${s}.ru.json`, en: (s) => `${s}.en.json` };
const SOURCES = ['sights', 'enterprises', 'people'];

const QUIZ = {
  'kamandzirovaczny': {
    be: { question: 'У якім годзе ў Лідзе з\u2019явілася скульптура «Камандзіровачны»?', options: ['1993', '2006', '2008', '2011'], correctIndex: 2, explanation: 'Скульптуру ўсталявалі ў 2008 годзе каля гатэля «Ліда». Аўтар — беларускі мастак Уладзімір Жбанаў.' },
    ru: { question: 'В каком году в Лиде появилась скульптура «Командировочный»?', options: ['1993', '2006', '2008', '2011'], correctIndex: 2, explanation: 'Скульптуру установили в 2008 году возле гостиницы «Лида». Автор — белорусский художник Владимир Жбанов.' },
    en: { question: 'In what year did the “Business Traveller” sculpture appear in Lida?', options: ['1993', '2006', '2008', '2011'], correctIndex: 2, explanation: 'The sculpture was installed in 2008 next to the “Lida” hotel. Its author is the Belarusian artist Uladzimir Zhbanau.' },
  },
  'kamien-u-honar-zasnavannia-lidy': {
    be: { question: 'Колькі важыў валун для помніка заснавання Ліды да апрацоўкі?', options: ['10 тон', '20 тон', '30 тон', '50 тон'], correctIndex: 2, explanation: 'Скульптар Рычард Груша знайшоў 30-тонны валун у Воранаўскім раёне; пасля апрацоўкі ён «патаннеў» на 10 тон.' },
    ru: { question: 'Сколько весил валун для памятника основанию Лиды до обработки?', options: ['10 тонн', '20 тонн', '30 тонн', '50 тонн'], correctIndex: 2, explanation: 'Скульптор Ричард Груша нашёл 30-тонный валун в Вороновском районе; после обработки он «потерял» 10 тонн.' },
    en: { question: 'How much did the boulder of the city-foundation monument weigh before it was worked?', options: ['10 tons', '20 tons', '30 tons', '50 tons'], correctIndex: 2, explanation: 'Sculptor Richard Hrusha found a 30-ton boulder in the Voranava district; after working it shed 10 tons.' },
  },
  'kasciol-uzvyszennia-sviatoha-kryzha': {
    be: { question: 'У якім годзе ў Лідзе пачалі будаваць касцёл Узвышэння Святога Крыжа?', options: ['1388', '1674', '1770', '1797'], correctIndex: 2, explanation: 'Храм узвялі ў 1770 годзе па праекце Іагана Крыстафа Глаўбіца; будаўніцтва цягнулася пяць гадоў.' },
    ru: { question: 'В каком году в Лиде начали строить костёл Воздвижения Святого Креста?', options: ['1388', '1674', '1770', '1797'], correctIndex: 2, explanation: 'Храм возвели в 1770 году по проекту Иоганна Кристофа Глаубица; строительство длилось пять лет.' },
    en: { question: 'In what year did the construction of the Exaltation of the Holy Cross church in Lida begin?', options: ['1388', '1674', '1770', '1797'], correctIndex: 2, explanation: 'The church was built in 1770 to a design by Johann Christoph Glaubitz; construction took five years.' },
  },
  'kurhan-neumiruczasci': {
    be: { question: 'Калі пачалі насыпаць Курган неўміручасці?', options: ['1945', '1966', '1967', '1973'], correctIndex: 1, explanation: 'Насыпанне пачалося 9 мая 1966 года, а ў 1973 годзе курган дапоўнілі 14-метровымі пілонамі.' },
    ru: { question: 'Когда начали насыпать Курган бессмертия?', options: ['1945', '1966', '1967', '1973'], correctIndex: 1, explanation: 'Насыпь начали 9 мая 1966 года, а в 1973 году курган дополнили 14-метровыми пилонами.' },
    en: { question: 'When did the Mound of Immortality start to be built up?', options: ['1945', '1966', '1967', '1973'], correctIndex: 1, explanation: 'The mound was begun on 9 May 1966, and in 1973 it was complemented with 14-metre pylons.' },
  },
  'lidski-zamak': {
    be: { question: 'У якім годзе быў узведзены Лідскі замак?', options: ['1180', '1323', '1569', '1795'], correctIndex: 1, explanation: 'Замак пабудавалі ў 1323 годзе па загадзе вялікага князя Гедыміна на зліцці Лідзеі і Каменкі.' },
    ru: { question: 'В каком году был возведён Лидский замок?', options: ['1180', '1323', '1569', '1795'], correctIndex: 1, explanation: 'Замок построили в 1323 году по приказу великого князя Гедимина на слиянии Лидеи и Каменки.' },
    en: { question: 'In what year was Lida Castle built?', options: ['1180', '1323', '1569', '1795'], correctIndex: 1, explanation: 'The castle was built in 1323 by order of Grand Duke Gediminas at the confluence of the Lidzieja and Kamienka rivers.' },
  },
  'pomnik-francysku-skarynu': {
    be: { question: 'У якім годзе ў Лідзе адкрылі помнік Францыску Скарыну?', options: ['1989', '1993', '2001', '2006'], correctIndex: 1, explanation: 'Манумент адкрылі 25 ліпеня 1993 года; фігуру першадрукара ў бронзе стварыў Валяр\u2019ян Янушкевіч.' },
    ru: { question: 'В каком году в Лиде открыли памятник Франциску Скорине?', options: ['1989', '1993', '2001', '2006'], correctIndex: 1, explanation: 'Монумент открыли 25 июля 1993 года; бронзовую фигуру первопечатника создал Валериан Янушкевич.' },
    en: { question: 'In what year was the monument to Francysk Skaryna unveiled in Lida?', options: ['1989', '1993', '2001', '2006'], correctIndex: 1, explanation: 'The monument was unveiled on 25 July 1993; the bronze figure was made by Valeryjan Januškievič.' },
  },
  'sviata-michajlauski-kafedralny-sabor': {
    be: { question: 'Якім храмам першапачаткова быў Свята-Міхайлаўскі кафедральны сабор?', options: ['Касцёлам Святога Іосіфа', 'Царквой Усіх Святых', 'Касцёлам Узвышэння Святога Крыжа', 'Сінагогай'], correctIndex: 0, explanation: 'Касцёл Святога Іосіфа пры кляштары піяраў пабудавалі ў 1797—1825 гадах, а ў 1863 годзе ён стаў праваслаўнай царквой.' },
    ru: { question: 'Каким храмом изначально был Свято-Михайловский кафедральный собор?', options: ['Костёлом Святого Иосифа', 'Церковью Всех Святых', 'Костёлом Воздвижения Святого Креста', 'Синагогой'], correctIndex: 0, explanation: 'Костёл Святого Иосифа при пиарском монастыре построили в 1797—1825 годах, а в 1863 году он стал православной церковью.' },
    en: { question: 'What was St Michael’s Cathedral originally?', options: ['St Joseph’s church', 'The All Saints church', 'The Exaltation of the Holy Cross church', 'A synagogue'], correctIndex: 0, explanation: 'St Joseph’s church at the Piarist monastery was built in 1797—1825 and converted into an Orthodox church in 1863.' },
  },
  'carkva-usich-sviatych': {
    be: { question: 'У якім годзе была ўзведзена царква Усіх Святых?', options: ['1990', '1997', '2006', '2011'], correctIndex: 2, explanation: 'Будаўніцтва цягнулася 16 гадоў і завяршылася ў 2006 годзе; праект выканаў архітэктар Леанід Макарэвіч.' },
    ru: { question: 'В каком году была возведена церковь Всех Святых?', options: ['1990', '1997', '2006', '2011'], correctIndex: 2, explanation: 'Строительство длилось 16 лет и завершилось в 2006 году; проект выполнил архитектор Леонид Макаревич.' },
    en: { question: 'In what year was the All Saints church built?', options: ['1990', '1997', '2006', '2011'], correctIndex: 2, explanation: 'Construction lasted 16 years and was completed in 2006; the design was made by architect Leanid Makarevič.' },
  },
  'hedymin': {
    be: { question: 'Каму Гедымін завяшчаў Ліду?', options: ['Кейстуту', 'Ягайлу', 'Вітаўту', 'Міндоўгу'], correctIndex: 0, explanation: 'Паводле падання, Гедымін завяшчаў горад свайму сыну Кейстуту, да якога Ліда перайшла ў 1330 годзе.' },
    ru: { question: 'Кому Гедимин завещал Лиду?', options: ['Кейстуту', 'Ягайло', 'Витовту', 'Миндовгу'], correctIndex: 0, explanation: 'По преданию, Гедимин завещал город своему сыну Кейстуту, к которому Лида перешла в 1330 году.' },
    en: { question: 'To whom did Gediminas bequeath Lida?', options: ['Kęstutis', 'Jogaila', 'Vytautas', 'Mindaugas'], correctIndex: 0, explanation: 'According to legend Gediminas bequeathed the city to his son Kęstutis, who took it over in 1330.' },
  },
  'torfabryketny': {
    be: { question: 'Што выпускае торфабрыкетны завод «Лідскі»?', options: ['Цэглу', 'Паліўныя брыкеты з торфу', 'Мэблю', 'Шкло'], correctIndex: 1, explanation: 'Завод вырабляе паліўныя брыкеты з торфу для ацяплення і энергетыкі.' },
    ru: { question: 'Что выпускает торфобрикетный завод «Лидский»?', options: ['Кирпич', 'Топливные брикеты из торфа', 'Мебель', 'Стекло'], correctIndex: 1, explanation: 'Завод производит топливные брикеты из торфа для отопления и энергетики.' },
    en: { question: 'What does the “Lidski” peat-briquette plant produce?', options: ['Bricks', 'Fuel briquettes made of peat', 'Furniture', 'Glass'], correctIndex: 1, explanation: 'The plant makes peat fuel briquettes used for heating and in the energy sector.' },
  },
  'maloczny-zavod': {
    be: { question: 'Пад якой назвай вядомы Лідскі малочны завод?', options: ['MiLida', 'Lidselmash', 'Konus', 'Liplast'], correctIndex: 0, explanation: 'Малочны завод «MiLida» — адно з найбуйнейшых харчовых прадпрыемстваў горада, яго прадукцыя ідзе і на экспарт.' },
    ru: { question: 'Под каким названием известен Лидский молочный завод?', options: ['MiLida', 'Lidselmash', 'Konus', 'Liplast'], correctIndex: 0, explanation: 'Молочный завод «MiLida» — одно из крупнейших пищевых предприятий города, его продукция идёт и на экспорт.' },
    en: { question: 'Under what name is the Lida dairy plant known?', options: ['MiLida', 'Lidselmash', 'Konus', 'Liplast'], correctIndex: 0, explanation: 'The “MiLida” dairy is one of the city’s largest food enterprises, and part of its output is exported.' },
  },
  'lidselmash': {
    be: { question: 'На чым спецыялізуецца «Лідсельмаш»?', options: ['На лакафарбавых матэрыялах', 'На сельгастэхніцы і абсталяванні для жывёлагадоўлі', 'На гарачым цынкаванні', 'На пластыкавай упакоўцы'], correctIndex: 1, explanation: '«Лідсельмаш» — машынабудаўнічы завод, які выпускае сельскагаспадарчую тэхніку і абсталяванне для жывёлагадоўлі і раслінаводства.' },
    ru: { question: 'На чём специализируется «Лидсельмаш»?', options: ['На лакокрасочных материалах', 'На сельхозтехнике и оборудовании для животноводства', 'На горячем цинковании', 'На пластиковой упаковке'], correctIndex: 1, explanation: '«Лидсельмаш» — машиностроительный завод, выпускающий сельхозтехнику и оборудование для животноводства и растениеводства.' },
    en: { question: 'What does “Lidselmash” specialise in?', options: ['Paint and varnish materials', 'Farm machinery and livestock equipment', 'Hot-dip galvanising', 'Plastic packaging'], correctIndex: 1, explanation: '“Lidselmash” is a machine-building plant producing farm machinery and equipment for livestock and crop farming.' },
  },
  'konus': {
    be: { question: 'Якую паслугу аказвае завод «Конус»?', options: ['Друкарскую', 'Гарачае цынкаванне металаканструкцый', 'Перапрацоўку малака', 'Вытворчасць паперы'], correctIndex: 1, explanation: 'Завод займаецца гарачым цынкаваннем металаканструкцый, што абараняе метал ад карозіі.' },
    ru: { question: 'Какую услугу оказывает завод «Конус»?', options: ['Полиграфическую', 'Горячее цинкование металлоконструкций', 'Переработку молока', 'Производство бумаги'], correctIndex: 1, explanation: 'Завод занимается горячим цинкованием металлоконструкций, что защищает металл от коррозии.' },
    en: { question: 'What service does the “Konus” plant provide?', options: ['Printing', 'Hot-dip galvanising of steel structures', 'Milk processing', 'Paper production'], correctIndex: 1, explanation: 'The plant hot-dip galvanises steel structures, which protects metal from corrosion.' },
  },
  'liplast': {
    be: { question: 'Што выпускае «Ліпласт»?', options: ['Пластыкавыя вырабы і ўпакоўку', 'Паліўныя брыкеты', 'Сельгастэхніку', 'Фарбы і лакі'], correctIndex: 0, explanation: '«Ліпласт» спецыялізуецца на пластыкавых і палімерных вырабах: упакоўцы, тэхнічных дэталях і іншым.' },
    ru: { question: 'Что выпускает «Липласт»?', options: ['Пластиковые изделия и упаковку', 'Топливные брикеты', 'Сельхозтехнику', 'Краски и лаки'], correctIndex: 0, explanation: '«Липласт» специализируется на пластиковых и полимерных изделиях: упаковке, технических деталях и другом.' },
    en: { question: 'What does “Liplast” produce?', options: ['Plastic goods and packaging', 'Fuel briquettes', 'Farm machinery', 'Paints and varnishes'], correctIndex: 0, explanation: '“Liplast” specialises in plastic and polymer products: packaging, technical parts and more.' },
  },
  'lakafarba': {
    be: { question: 'Што выпускае прадпрыемства «Лакафарба»?', options: ['Фарбы і лакі', 'Малако і масла', 'Цэглу', 'Аўтамабілі'], correctIndex: 0, explanation: '«Лакафарба» — адно з найбуйнейшых у Беларусі прадпрыемстваў па выпуску фарбаў, лакаў і іншых пакрыццяў.' },
    ru: { question: 'Что выпускает предприятие «Лакокраска»?', options: ['Краски и лаки', 'Молоко и масло', 'Кирпич', 'Автомобили'], correctIndex: 0, explanation: '«Лакокраска» — одно из крупнейших в Беларуси предприятий по выпуску красок, лаков и других покрытий.' },
    en: { question: 'What does the “Lakafarba” enterprise produce?', options: ['Paints and varnishes', 'Milk and butter', 'Bricks', 'Cars'], correctIndex: 0, explanation: '“Lakafarba” is one of Belarus’s largest makers of paints, varnishes and other coatings.' },
  },
};

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
}

let patched = 0;
let skipped = 0;
const problems = [];

for (const source of SOURCES) {
  const perLang = {};
  for (const lang of LANGS) {
    const file = FILES[lang](source);
    const full = path.join(DATA_DIR, file);
    const text = fs.readFileSync(full, 'utf8');
    const ids = [...text.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
    perLang[lang] = { file, full, text, ids };
  }

  const beIds = perLang.be.ids;
  for (const lang of LANGS) {
    const missing = beIds.filter((id) => !perLang[lang].ids.includes(id));
    if (missing.length) problems.push(`${perLang[lang].file}: missing ids ${missing.join(', ')}`);
  }

  for (const lang of LANGS) {
    const { file, full, text } = perLang[lang];
    let out = text;
    for (const id of beIds) {
      const quiz = QUIZ[id] && QUIZ[id][lang];
      if (!quiz) { problems.push(`${file}: no quiz defined for "${id}" (${lang})`); continue; }
      const re = new RegExp(
        `("id":\\s*"${id}"[\\s\\S]*?"lng":\\s*-?[0-9.]+)(\\r?\\n(\\s*)\\})`
      );
      const m = out.match(re);
      if (!m) { problems.push(`${file}: anchor for "${id}" not found`); continue; }
      if (/\\?"quiz\\?"/.test(m[1])) { skipped++; continue; }
      const block = indent('"quiz": ' + JSON.stringify(quiz, null, 2), 4);
      out = out.replace(re, `$1,\n${block}$2`);
      patched++;
    }
    fs.writeFileSync(full, out);
    /* validate the result is still parseable */
    try {
      const parsed = JSON.parse(out);
      const withQuiz = parsed.filter((o) => o.quiz).length;
      console.log(`${file}: ${parsed.length} objects, ${withQuiz} with quiz`);
    } catch (e) {
      problems.push(`${file}: INVALID JSON after patch — ${e.message}`);
    }
  }
}

console.log(`\npatched ${patched} quiz fields, skipped ${skipped} already present`);
if (problems.length) {
  console.error('\nPROBLEMS:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('ALL OK');
