// Run: node --test webapp/test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('./load')();

// data/ (ảnh, kết quả đã duyệt của học sinh) không có trên GitHub: các test dùng nó tự bỏ qua khi thiếu.
const DATA = path.join(__dirname, '..', '..', 'data', 'TA6', '22-9');
const HAS_DATA = fs.existsSync(path.join(DATA, 'result.json'));
// Danh sách lớp giả (không dùng tên học sinh thật), giữ đủ các kiểu tên dễ nhầm khi ghép.
const ROSTER = ['Khánh Vy', 'Vân Anh', 'Đức Minh', 'Ngọc Hà', 'Hải Nam', 'Hà My', 'Phương Linh',
  'Trâm Oanh', 'Quỳnh Như', 'Ng Quỳnh Mai', 'Gia Bách', 'Lê Q.Mai', 'Tú Linh', 'Mạnh Quân', 'Khánh Mai',
  'Phương Nhi', 'Minh Hằng', 'Quốc Việt', 'Minh Khôi'];
const PENALTY = {
  default: {
    counted_columns: ['TỪ VỰNG', 'TỪ MỚI', 'CÔNG THỨC', 'CẤU TRÚC', 'CÂU GIÁN TIẾP'],
    levels: [{ min_wrong: 2, penalty: 'từ viết sai x10 lần' }, { min_wrong: 5, penalty: 'từ mới x15 lần' }],
    separate_columns: { 'QUY TẮC TRỌNG ÂM': [{ min_wrong: 3, penalty: 'quy tắc trọng âm x7 lần' }] },
  },
  classes: { 'TA8.1': { levels: [{ min_wrong: 2, penalty: 'từ viết sai x10 lần' },
                                 { min_wrong: 5, penalty: 'toàn bộ x10 lần' }] } },
};
const plain = (x) => JSON.parse(JSON.stringify(x));  // objects from the vm context -> plain objects
const wrongOf = (verdicts) => verdicts.filter((v) => v.verdict === 'wrong').map((v) => v.key_en).sort();
const item = (key_en, written_en, meaning_ok = true, other_word = false) =>
  ({ key_en, written_en, written_vi: 'x', meaning_ok, other_word });

test('letterErrors counts letters, ignores spaces/case/hyphens', () => {
  assert.equal(G.letterErrors('basind', 'beside'), 3);
  assert.equal(G.letterErrors('Besind', 'beside'), 2);
  assert.equal(G.letterErrors('Be hinh', 'behind'), 1);
  assert.equal(G.letterErrors('For from', 'far from'), 1);
  assert.equal(G.letterErrors('in side', 'inside'), 0);
  assert.equal(G.letterErrors('well-known For', 'well-known for'), 0);
  assert.equal(G.letterErrors('opposiet', 'opposite'), 1);  // swapped neighbours
});

for (const photo of ['IMG_7451', 'IMG_7466']) {
  test(`decideVocab matches the teacher-verified result for ${photo}`, { skip: !HAS_DATA && 'không có data/' }, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(DATA, 'gemini', photo + '.json'), 'utf8'));
    const truth = JSON.parse(fs.readFileSync(path.join(DATA, 'result.json'), 'utf8'))
      .students.find((s) => (s.photos || []).includes(photo)).parts['TỪ VỰNG'];
    assert.deepEqual(wrongOf(G.decideVocab(fixture.items)), [...truth.wrong].sort());
  });
}

test('one light error is forgiven, a second one is not', () => {
  const v = plain(G.decideVocab([item('far from', 'For from'), item('below', 'Belove'), item('behind', 'behind')]));
  assert.equal(v[0].verdict, 'forgiven');
  assert.equal(v[1].verdict, 'wrong');  // 2 letters
  const two = plain(G.decideVocab([item('in front of', 'in fron of'), item('opposite', 'Opposide')]));
  assert.deepEqual(two.map((x) => x.verdict), ['forgiven', 'wrong']);
});

test('the same slip repeated in several items is forgiven everywhere', () => {
  const v = plain(G.decideVocab([item('ceiling', 'ceilling'), item('ceiling fan', 'ceilling fan')]));
  assert.deepEqual(v.map((x) => x.verdict), ['forgiven', 'forgiven']);
});

test('forgiveness goes to an item whose meaning is right', () => {
  const v = plain(G.decideVocab([item('opposite', 'Opposide', false), item('in front of', 'In fron of')]));
  assert.deepEqual(v.map((x) => x.verdict), ['wrong', 'forgiven']);
});

test('a different real word (site for side) is never forgiven', () => {
  const v = plain(G.decideVocab([item('outside', 'Out Site', true, true), item('inside', 'IN Site', true, true),
    item('in front of', 'in fron of')]));
  assert.deepEqual(v.map((x) => x.verdict), ['wrong', 'wrong', 'forgiven']);
});

test('names written on the paper match the roster', () => {
  const cases = { KVY: 'Khánh Vy', 'V.Anh': 'Vân Anh', HMy: 'Hà My', 'PLinh': 'Phương Linh',
    'QNhư': 'Quỳnh Như', LQMai: 'Lê Q.Mai', 'K.Mai': 'Khánh Mai', 'Nhi': 'Phương Nhi', 'M.Hằng': 'Minh Hằng',
    'Q.Việt': 'Quốc Việt', 'M.Khôi': 'Minh Khôi', 'Ng Quỳnh Mai': 'Ng Quỳnh Mai', 'Tú Linh': 'Tú Linh',
    'Đức Minh': 'Đức Minh', 'M.Hà': '' };
  for (const [written, expected] of Object.entries(cases)) {
    assert.equal(G.matchName(written, ROSTER), expected, written);
  }
  assert.equal(G.matchName('Mai', ROSTER), '');  // ambiguous: Khánh Mai, Ng Quỳnh Mai, Lê Q.Mai
  assert.equal(G.matchName('Bách Bách', ROSTER), 'Gia Bách');  // name written twice (first one was messy)
  // onset of the first word + last word: "PhLan" = Phúc Lan, "Th.Hà" = Thanh Hà
  const more = ['Phúc Lan', 'Thanh Hà', 'Bích Hà', 'Lê Nhật Vy', 'Phong Lan'];
  assert.equal(G.matchName('Phlan', ['Phúc Lan', 'Thanh Hà', 'Bích Hà']), 'Phúc Lan');
  assert.equal(G.matchName('Th.Hà', more), 'Thanh Hà');
  assert.equal(G.matchName('Nhvy', more), 'Lê Nhật Vy');   // 3-word name: onset of the word before the last
  assert.equal(G.matchName('Phlan', more), '');            // Phúc Lan and Phong Lan both fit: the teacher picks
});

test('penalties follow the agreed rules', () => {
  const p = (wrong, total = 13, cls = 'TA6') => G.penaltyFor({ 'TỪ VỰNG': { correct: total - wrong, total, wrongCount: wrong } }, cls, PENALTY);
  assert.equal(p(1), '');
  assert.equal(p(2), 'từ viết sai x10 lần');
  assert.equal(p(5), 'từ mới x15 lần');
  assert.equal(p(5, 12, 'TA8.1'), 'toàn bộ x10 lần');
  assert.equal(G.penaltyFor({ 'TỪ VỰNG': { correct: 11, total: 11, wrongCount: 0 },
    'QUY TẮC TRỌNG ÂM': { correct: 2, total: 5, wrongCount: 3 } }, 'TA7.2', PENALTY), 'quy tắc trọng âm x7 lần');
});

test('assembleSession builds rows in roster order with missing and unmatched rows', { skip: !HAS_DATA && 'không có data/' }, () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(DATA, 'gemini', 'IMG_7451.json'), 'utf8'));
  const truth = JSON.parse(fs.readFileSync(path.join(DATA, 'result.json'), 'utf8'));
  const keyParts = plain(G.prepareKey([{ part: 'TỪ VỰNG', items: truth.parts[0].key.map((k) => ({ en: k.en, vi: k.vi })) }]));
  const idOf = (en) => keyParts[0].items.find((k) => k.en.toLowerCase() === en.toLowerCase()).id;
  const bao = G.normalizeGrade({ written_name: 'Q.Việt', matched_name: '', key_matches: true,
    items: fixture.items.map((it) => Object.assign({ id: idOf(it.key_en) }, it)), unclear: [] }, keyParts, ROSTER);
  const stray = G.normalizeGrade({ written_name: 'Chi', matched_name: '', key_matches: false,
    items: [], unclear: [] }, keyParts, ROSTER);
  const t = plain(G.assembleSession(keyParts, ROSTER,
    [Object.assign(bao, { fileName: 'a.jpg', url: 'u1' }), Object.assign(stray, { fileName: 'b.jpg', url: 'u2' })],
    'TA6', PENALTY));
  assert.deepEqual(t.columns, ['TỪ VỰNG', 'TỪ VIẾT SAI', 'CHÉP PHẠT']);
  const row = t.rows.find((r) => r.name === 'Quốc Việt');
  assert.equal(row.values['TỪ VỰNG'], '8/13 từ');
  assert.equal(row.values['CHÉP PHẠT'], 'từ mới x15 lần');
  assert.equal(t.rows[0].name, 'Khánh Vy');
  assert.equal(t.rows[0].status, 'missing');
  assert.equal(row.flag, false);  // wrong words alone do not need the teacher's attention
  assert.deepEqual(row.ai, row.values);  // AI's original suggestion is kept next to what the teacher edits
  assert.deepEqual(t.rows[0].notes, []);  // no-photo row: teacher picks Vắng / Không có bài
  const last = t.rows[t.rows.length - 1];
  assert.equal(last.status, 'unmatched');
  assert.equal(last.flag, true);
  assert.ok(last.notes.some((n) => n.includes('không khớp đáp án')));
});

test('normalizeGrade maps answers by item id, whatever order Gemini returns them in', () => {
  const keyParts = G.prepareKey([{ part: 'CÔNG THỨC', items: [{ en: 'S + V(s/es)', vi: 'HTĐ' }, { en: 'S + am/is/are + V-ing', vi: 'HTTD' }] }]);
  const g = plain(G.normalizeGrade({ written_name: 'Tú Linh', matched_name: '', key_matches: true,
    items: [{ id: '1.2', written_en: 'S + is + Ving', correct: true }, { id: '1.1', written_en: 'S + V', correct: false }],
    unclear: [] }, keyParts, ROSTER));
  assert.deepEqual(g.items.map((o) => [o.id, o.correct]), [['1.1', false], ['1.2', true]]);
  assert.equal(g.matchedName, 'Tú Linh');
  assert.equal(g.keyMatches, true);
  const blank = plain(G.normalizeGrade({ written_name: '', matched_name: '', key_matches: true, items: [], unclear: [] },
    keyParts, ROSTER));
  assert.equal(blank.keyMatches, false);  // nothing on the paper matches the key
});

test('the name Gemini guesses is accepted only if it shares a word with the paper', () => {
  const keyParts = G.prepareKey([{ part: 'TỪ VỰNG', items: [{ en: 'above', vi: 'trên' }] }]);
  const name = (written, guess) => G.normalizeGrade({ written_name: written, matched_name: guess, key_matches: true,
    items: [{ id: '1.1', written_en: 'above' }], unclear: [] }, keyParts, ROSTER).matchedName;
  assert.equal(name('Việt Q', 'Quốc Việt'), 'Quốc Việt');
  assert.equal(name('Q Viel', 'Quốc Việt'), 'Quốc Việt');  // same initials, misread letters
  assert.equal(name('T.Vy', 'Minh Khôi'), '');
  assert.equal(name('', 'Minh Khôi'), '');  // back side without a name: never guess
  assert.equal(name('Việt Q', 'Người Lạ'), '');  // not in the roster
});

test('verb patterns are spelled with the usual notations (Ving, doing, O, sb, optional parts)', () => {
  assert.equal(G.letterErrors('deny + ving', 'deny + V-ing'), 0);
  assert.equal(G.letterErrors('deny doing', 'deny + V-ing'), 0);
  assert.equal(G.letterErrors('congratulate sb on + ling', 'congratulate sb on + V-ing'), 0);  // handwritten V read as l
  assert.equal(G.letterErrors('accuse O of Ving', 'accuse sb of V-ing'), 0);
  assert.equal(G.letterErrors('apologize for Ving', 'apologize (to sb) for + V-ing'), 0);
  assert.equal(G.letterErrors('object on + ving', 'object to + V-ing'), 2);
  assert.equal(G.letterErrors('admit + V', 'admit + V-ing'), 3);
  assert.equal(G.letterErrors('O : Opinion', 'opinion'), 0);  // label the student adds (OSASCOMP)
  assert.equal(G.letterErrors('P: Porpuse', 'purpose'), 2);
  assert.equal(G.letterErrors('1. above', 'above'), 0);
});

test('a two-sided paper (back side without a name) is one student, word-style parts graded by code', () => {
  const keyParts = G.prepareKey([
    { part: 'CÔNG THỨC', kind: 'word', items: [{ en: 'admit + V-ing', vi: 'thừa nhận' }, { en: 'deny + V-ing', vi: 'phủ nhận' },
                                               { en: 'advise O to V', vi: 'khuyên' }] },
    { part: 'CẤU TRÚC', kind: 'formula', items: [{ en: 'opinion', vi: 'quan điểm' }, { en: 'size', vi: 'kích cỡ' }] }]);
  const w = (id, en, extra) => Object.assign({ id, written_en: en, written_vi: 'x', meaning_ok: true }, extra || {});
  const photo = (file, name, items) => Object.assign(G.normalizeGrade({ written_name: name, matched_name: '', key_matches: true,
    items, unclear: [] }, keyParts, ROSTER), { fileId: file, fileName: file + '.jpg', url: 'u/' + file });
  const t = plain(G.assembleSession(keyParts, ROSTER, [
    photo('bai_2', '', [w('1.3', 'advise sb to V'), w('2.1', 'opinion', { correct: true }), w('2.2', 'size', { correct: true })]),
    photo('bai_1', 'M.Khôi', [w('1.2', 'deny doing'), w('1.1', 'admit + Ving')]),  // written in a different order
    photo('bai_3', 'Q.Việt', [w('1.1', 'admit + ving'), w('1.2', 'deny + ving'), w('1.3', 'advise O to V')]),
    photo('bai_4', '', [w('1.1', 'admit ving'), w('1.2', 'deny ving'), w('1.3', 'advise o to v')]),  // another full paper
  ], 'TA9', PENALTY));
  assert.deepEqual(t.columns, ['CÔNG THỨC', 'TỪ VIẾT SAI', 'CẤU TRÚC', 'CHÉP PHẠT']);
  const khoi = t.rows.find((r) => r.name === 'Minh Khôi');
  assert.equal(khoi.values['CÔNG THỨC'], '3/3 từ');
  assert.equal(khoi.values['CẤU TRÚC'], '2/2 công thức');
  assert.deepEqual(khoi.photos.map((p) => p.id).sort(), ['bai_1', 'bai_2']);
  assert.equal(khoi.flag, true);  // auto-paired back side: the teacher checks it
  const stray = t.rows.filter((r) => r.status === 'unmatched');
  assert.deepEqual(stray.map((r) => r.photos[0].id), ['bai_4']);  // overlaps Việt's paper: not a back side

  // names not in the roster: every photo is its own row (two different pupils may both be unreadable),
  // the teacher assigns each photo; photos given the same name become one row
  const unnamed = [
    photo('bai_5', 'Duy', [w('1.1', 'admit + Ving'), w('1.2', 'deny + Ving')]),
    photo('bai_6', 'Duy', [w('1.3', 'advise O to V'), w('2.1', 'opinion', { correct: true })]),
    photo('bai_7', 'Zed', [w('1.1', 'admit + Ving')]),
    photo('bai_8', '', [w('2.2', 'size', { correct: true })])];
  const t2 = plain(G.assembleSession(keyParts, ROSTER, unnamed, 'TA9', PENALTY));
  assert.deepEqual(t2.rows.filter((r) => r.status === 'unmatched').map((r) => r.photos.map((p) => p.id)),
    [['bai_5'], ['bai_6'], ['bai_7'], ['bai_8']]);
  const byId = Object.fromEntries(unnamed.map((ph) => [ph.fileId, ph]));
  const t3 = plain(G.assembleSession(keyParts, ROSTER,
    G.resultsForTable(byId, { bai_5: 'Minh Khôi', bai_6: 'Minh Khôi', bai_1: 'Minh Khôi' }, []), 'TA9', PENALTY));
  assert.deepEqual(t3.rows.find((r) => r.name === 'Minh Khôi').photos.map((p) => p.id).sort(), ['bai_5', 'bai_6']);
});

test('names typed in another case join the roster name (vinh = Vinh)', () => {
  assert.equal(G.canonicalName('  minh   KHÔI ', ROSTER), 'Minh Khôi');
  assert.equal(G.canonicalName('Người Mới', ROSTER), 'Người Mới');
  const keyParts = G.prepareKey([{ part: 'TỪ VỰNG', kind: 'word', items: [{ en: 'above', vi: 'trên' }] }]);
  const ph = (id) => ({ fileId: id, fileName: id + '.jpg', url: '', writtenName: '', matchedName: '', keyMatches: true,
    unclear: [], items: [{ id: '1.1', written_en: 'above', written_vi: 'trên', meaning_ok: true }] });
  const t = plain(G.assembleSession(keyParts, ROSTER,
    G.resultsForTable({ a: ph('a'), b: ph('b') }, { a: 'minh khôi', b: 'Minh Khôi' }, []), 'TA6', PENALTY));
  const rows = t.rows.filter((r) => G.nameKey(r.name) === 'minh khôi');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Minh Khôi');
  assert.deepEqual(rows[0].photos.map((p) => p.id).sort(), ['a', 'b']);
});

test('a photo the teacher took out of a row stays unassigned and is not paired again', () => {
  const keyParts = G.prepareKey([{ part: 'TỪ VỰNG', kind: 'word', items: [{ en: 'above', vi: 'trên' }, { en: 'below', vi: 'dưới' }] }]);
  const ph = (id, name, en) => ({ fileId: id, fileName: id + '.jpg', url: '', writtenName: name, matchedName: name ? 'Tú Linh' : '',
    keyMatches: true, unclear: [], items: [{ id: en === 'above' ? '1.1' : '1.2', written_en: en, written_vi: 'x', meaning_ok: true }] });
  const results = { a: ph('a', 'Tú Linh', 'above'), b: ph('b', '', 'below') };
  const paired = plain(G.assembleSession(keyParts, ROSTER, G.resultsForTable(results, {}, []), 'TA6', PENALTY));
  assert.deepEqual(paired.rows.find((r) => r.name === 'Tú Linh').photos.map((p) => p.id), ['a', 'b']);  // back side paired
  const split = plain(G.assembleSession(keyParts, ROSTER, G.resultsForTable(results, { b: G.UNASSIGNED }, []), 'TA6', PENALTY));
  assert.deepEqual(split.rows.find((r) => r.name === 'Tú Linh').photos.map((p) => p.id), ['a']);
  assert.deepEqual(split.rows.filter((r) => r.status === 'unmatched').map((r) => r.photos[0].id), ['b']);
});

test('grading more photos later keeps what the teacher already reviewed', () => {
  const roster = ['An', 'Bình', 'Chi', 'Dũng', 'Em'];
  const keyParts = [{ part: 'TỪ VỰNG', unit: 'từ', items: [{ en: 'above', vi: 'trên' }, { en: 'below', vi: 'dưới' }] }];
  const res = (id, name, above, below) => ({ fileId: id, fileName: id + '.jpg', url: 'u/' + id, writtenName: name || '?',
    matchedName: name, keyMatches: true, others: [], unclear: [],
    vocab: [{ key_en: 'above', written_en: above, written_vi: 'trên', meaning_ok: true, other_word: false },
            { key_en: 'below', written_en: below, written_vi: 'dưới', meaning_ok: true, other_word: false }] });
  const build = (results, prev) => {
    const t = G.assembleSession(keyParts, roster, G.resultsForTable(results, prev ? G.overridesFromTable(prev) : {}, []),
                                'TA6', PENALTY);
    t.rows.forEach((r) => (r.notes = r.notes.join('\n')));
    return plain(G.mergeTables(prev, t));
  };

  // day 1: 3 photos, one name not recognised
  const day1 = { p1: res('p1', 'An', 'above', 'bellow'), p2: res('p2', 'Bình', 'abov', ''), p3: res('p3', '', 'above', 'below') };
  const t1 = build(day1, null);
  const row = (t, name) => t.rows.find((r) => r.name === name);
  // teacher reviews: edits An, names the unknown photo "Chi", writes "đi muộn" for Em
  row(t1, 'An').values['CHÉP PHẠT'] = 'cô miễn phạt';
  t1.rows.find((r) => r.status === 'unmatched').name = 'Chi';
  row(t1, 'Em').values['TỪ VỰNG'] = 'đi muộn';

  // day 2: Dũng's photo and a second page for Bình
  const day2 = Object.assign({}, day1, { p4: res('p4', 'Dũng', 'above', 'below'), p5: res('p5', 'Bình', 'above', 'below') });
  const t2 = build(day2, JSON.parse(JSON.stringify(t1)));
  assert.equal(row(t2, 'An').values['CHÉP PHẠT'], 'cô miễn phạt');          // edit kept
  assert.equal(row(t2, 'Chi').photos[0].id, 'p3');                          // chosen name kept
  assert.equal(t2.rows.filter((r) => r.status === 'unmatched').length, 0);
  assert.equal(row(t2, 'Em').values['TỪ VỰNG'], 'đi muộn');                 // no-photo row kept
  assert.equal(row(t2, 'Dũng').values['TỪ VỰNG'], '2/2 từ');                // new photo graded
  assert.equal(row(t2, 'Bình').values['TỪ VỰNG'], '2/2 từ');                // re-graded with both pages

  // the teacher picks An to regrade: An's row takes the new result, other edits stay
  const day2b = Object.assign({}, day2, { p1: res('p1', 'An', 'above', 'below') });
  const t3prev = JSON.parse(JSON.stringify(t2));
  row(t3prev, 'Dũng').values['CHÉP PHẠT'] = 'cô sửa';
  const t2b = (() => {
    const t = G.assembleSession(keyParts, roster, G.resultsForTable(day2b, G.overridesFromTable(t3prev), []), 'TA6', PENALTY);
    t.rows.forEach((r) => (r.notes = r.notes.join('\n')));
    return plain(G.mergeTables(t3prev, t, ['p1']));
  })();
  assert.equal(row(t2b, 'An').values['TỪ VỰNG'], '2/2 từ');
  assert.equal(row(t2b, 'An').values['CHÉP PHẠT'], '');
  assert.match(row(t2b, 'An').notes, /Đã chấm lại/);
  assert.equal(row(t2b, 'Dũng').values['CHÉP PHẠT'], 'cô sửa');
  assert.equal(t2b.rows.filter((r) => r.name === 'An').length, 1);
  assert.ok(row(t2, 'Bình').notes.startsWith('Ảnh của em thay đổi'));
  assert.equal(row(t2, 'Bình').flag, true);
  assert.equal(row(t2, 'Chi').status, 'graded');                            // named photo is a normal row now

  // day 3: the teacher deletes An's photo and Bình's second page on the web
  row(t2, 'Dũng').values['CHÉP PHẠT'] = 'đã sửa';
  const day3 = Object.assign({}, day2); delete day3.p1; delete day3.p5;
  const t3 = build(day3, JSON.parse(JSON.stringify(t2)));
  assert.equal(row(t3, 'An').status, 'missing');                            // no photo left
  assert.equal(row(t3, 'An').values['CHÉP PHẠT'], undefined);
  assert.equal(row(t3, 'Bình').photos.length, 1);                            // re-graded from the remaining page
  assert.equal(row(t3, 'Bình').values['TỪ VỰNG'], '1/2 từ');                   // 'abov' forgiven, below blank
  assert.equal(row(t3, 'Dũng').values['CHÉP PHẠT'], 'đã sửa');               // untouched rows keep edits
  assert.equal(t3.rows.length, 5);
  assert.equal(t2.rows.length, 5);
});

test('classifyGeminiError decides how to rotate keys', () => {
  const quota = (quotaId, retryDelay) => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] } });
  assert.equal(G.classifyGeminiError(429, quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '30s')).kind, 'daily');
  const m = plain(G.classifyGeminiError(429, quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '37.5s')));
  assert.deepEqual([m.kind, m.retrySec], ['minute', 38]);
  assert.equal(G.classifyGeminiError(402, { error: { code: 402, message: 'Your prepayment credits are depleted.' } }).kind, 'daily');
  assert.equal(G.classifyGeminiError(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.',
    details: [{ reason: 'API_KEY_INVALID' }] } }).kind, 'bad_key');
  assert.equal(G.classifyGeminiError(404, { error: { code: 404, message: 'no longer available to new users' } }).kind, 'daily');
  assert.equal(G.classifyGeminiError(503, { error: { code: 503, message: 'overloaded' } }).kind, 'retry');
  assert.equal(G.classifyGeminiError(400, { error: { code: 400, message: 'Invalid JSON payload' } }).kind, 'fatal');
});

test('a formula written like the key (other notation, no spaces) counts as right even if Gemini said wrong', () => {
  const keyParts = G.prepareKey([{ part: 'CÔNG THỨC', kind: 'formula', items: [
    { en: 'accuse sb of + V-ing', vi: 'buộc tội ai vì làm gì' }, { en: 'apologize (to sb) for + V-ing', vi: 'xin lỗi' },
    { en: 'deny + V-ing', vi: 'phủ nhận' }, { en: 'admit + V-ing', vi: 'thừa nhận' }, { en: 'S + V(s/es)', vi: '' }] }]);
  const it = (id, en, meaning_ok) => ({ id, written_en: en, written_vi: 'x', meaning_ok, correct: false });
  const ph = Object.assign(G.normalizeGrade({ written_name: 'Tú Linh', matched_name: '', key_matches: true, unclear: [], items: [
    it('1.1', 'accuse sbof Ving', true), it('1.2', 'apologize for + Ving', true),
    it('1.3', 'deny V-ing', false),        // wrong meaning: still wrong
    it('1.4', 'admit + Vng', true),        // a letter missing: Gemini decides
    it('1.5', 's + v(s/es)', false)] }, keyParts, ROSTER), { fileName: 'a.jpg', url: '' });
  const row = plain(G.assembleSession(keyParts, ROSTER, [ph], 'TA9', PENALTY)).rows.find((r) => r.name === 'Tú Linh');
  assert.equal(row.values['CÔNG THỨC'], '3/5 công thức');
  assert.ok(row.notes.some((n) => n.includes('deny')) && row.notes.some((n) => n.includes('admit')));
});

test('the key decides whether the meaning is graded: "formula : meaning" needs both, a bare formula only the formula', () => {
  const keyParts = G.prepareKey([
    { part: 'CÔNG THỨC', kind: 'formula', items: [{ en: 'criticize sb for V-ing', vi: 'chỉ trích ai vì làm gì' },
                                                  { en: 'warn sb against + V-ing', vi: 'cảnh báo ai không nên làm gì' },
                                                  { en: 'S + V(s/es)', vi: '' }] },
    { part: 'TỪ MỚI', kind: 'word', items: [{ en: 'opinion', vi: '' }] }]);
  const ph = Object.assign(G.normalizeGrade({ written_name: 'Tú Linh', matched_name: '', key_matches: true, unclear: [], items: [
    { id: '1.1', written_en: 'criticize sb for + Ving', written_vi: '', meaning_ok: false, correct: true },  // no meaning
    { id: '1.2', written_en: 'warn sb against + Ving', written_vi: 'cảnh báo ai ko nên lmj', meaning_ok: true, correct: true },
    { id: '1.3', written_en: 'S + V(s/es)', written_vi: '', meaning_ok: false, correct: true },
    { id: '2.1', written_en: 'opinion', written_vi: '', meaning_ok: false }] }, keyParts, ROSTER), { fileName: 'a.jpg', url: '' });
  const row = plain(G.assembleSession(keyParts, ROSTER, [ph], 'TA9', PENALTY)).rows.find((r) => r.name === 'Tú Linh');
  assert.equal(row.values['CÔNG THỨC'], '2/3 công thức');
  assert.equal(row.values['TỪ MỚI'], '1/1 từ');  // the key has no meaning for it
  assert.ok(row.notes.some((n) => n.includes('criticize') && n.includes('thiếu nghĩa')));
});

test('a missing or extra plural "s" and a restarted word are not spelling errors', () => {
  assert.equal(G.letterErrors('Twins', 'Twin'), 0);
  assert.equal(G.letterErrors('Sibling', 'Siblings'), 0);
  assert.equal(G.letterErrors("S' Sibling", 'Sibling'), 0);
  assert.equal(G.letterErrors('Libling', 'Sibling'), 1);   // a real slip still counts
  // part-of-speech tags and "=" chains copied into one item are not letters of the word
  assert.equal(G.letterErrors('waste (n)', 'waste'), 0);
  assert.equal(G.letterErrors('Waste(V)', 'waste'), 0);
  assert.equal(G.letterErrors('Wast (n)', 'waste'), 1);
  assert.equal(G.letterErrors('waste (n) = waste (v)', 'waste'), 0);
  assert.equal(G.letterErrors('wase = wate', 'waste'), 1);
  assert.equal(G.letterErrors('waste cn', 'waste'), 0);
  assert.equal(G.letterErrors('Do the lunc laundry', 'do the laundry'), 0);   // half-written word, restarted
  assert.equal(G.letterErrors('do the laundry', 'do the laundry'), 0);
  assert.equal(G.letterErrors('wash the close', 'wash the clothes'), 2);   // "(n)" read as "cn"
  assert.equal(G.letterErrors('cn', 'can'), 1);
  assert.equal(G.letterErrors('glass', 'glass'), 0);
});

test('meanings with "/" groups and common abbreviations match the key', () => {
  const ok = (w, k) => G.viMatches_(w, k);
  assert.ok(ok('anh em sinh đôi', 'anh/chị/em sinh đôi'));
  assert.ok(ok('ace sinh đôi', 'anh/chị/em sinh đôi'));
  assert.ok(ok('anhem ruột', 'anh/chị/em ruột'));
  assert.ok(ok('ce dâu', 'chị em dâu'));
  assert.ok(ok('chịem dâu', 'chị em dâu'));
  assert.ok(ok('chị/em dâu', 'chị em dâu'));
  assert.ok(ok('thừa nhận lmj', 'thừa nhận làm gì'));
  assert.ok(ok('cháu trai', 'cháu trai ( con của anh/chị/em )'));
  assert.ok(ok('bố chồng/vợ', 'bố chồng/bố vợ'));
  assert.ok(ok('anh/chị/em dâu', 'chị em dâu'));   // anh/chị/em written together count as one group
  assert.ok(ok('chị dâu', 'chị em dâu'));
  assert.ok(ok('anh/chị em rể', 'anh em rể'));
  assert.ok(!ok('anh em', 'anh/chị/em sinh đôi'));   // "sinh đôi" is the main part
  assert.ok(!ok('con dâu', 'chị em dâu'));
  assert.ok(!ok('buộc ai lmj', 'buộc tội ai vì làm gì'));
});

test('a line Gemini filed under the wrong item (by meaning) goes back to the item it spells', () => {
  const keyParts = G.prepareKey([{ part: 'TỪ VỰNG', kind: 'word', items: [
    { en: 'daughter-in-law', vi: 'con dâu' }, { en: 'sister-in-law', vi: 'chị em dâu' }, { en: 'brother-in-law', vi: 'anh em rể' }] }]);
  const g = plain(G.normalizeGrade({ written_name: 'Tú Linh', matched_name: '', key_matches: true, unclear: [], items: [
    { id: '1.1', written_en: 'sister in law', written_vi: 'con dâu', meaning_ok: true },
    { id: '1.3', written_en: 'brother in low', written_vi: 'anh rể', meaning_ok: true }] }, keyParts, ROSTER));
  const byId = Object.fromEntries(g.items.map((i) => [i.id, i]));
  assert.equal(byId['1.1'].written_en, '');                 // daughter-in-law: not written
  assert.equal(byId['1.2'].written_en, 'sister in law');
  assert.equal(byId['1.2'].meaning_ok, false);              // judged again against sister-in-law
  assert.equal(byId['1.3'].written_en, 'brother in low');   // a 1-letter slip stays where it is
  assert.ok(g.unclear.some((u) => u.includes('sister in law')));
  // the moved line is sent for a meaning re-check, then the answer is applied
  const checks = plain(G.meaningChecks(g, keyParts));
  assert.deepEqual(checks.map((c) => [c.id, c.en, c.written]), [['1.2', 'sister-in-law', 'con dâu']]);
  G.applyMeaningChecks(g, [{ id: '1.2', ok: false }]);
  assert.equal(g.items.find((i) => i.id === '1.2').meaning_ok, false);
});

test('two lines Gemini swapped (brother-in-law / sister-in-law) are swapped back', () => {
  const keyParts = G.prepareKey([{ part: 'TỪ VỰNG', kind: 'word', items: [
    { en: 'brother-in-law', vi: 'anh em rể' }, { en: 'sister-in-law', vi: 'chị em dâu' }] }]);
  const g = plain(G.normalizeGrade({ written_name: 'Tú Linh', matched_name: '', key_matches: true, unclear: [], items: [
    { id: '1.1', written_en: 'Sister in-law', written_vi: 'anh/chị/em dâu', meaning_ok: false },
    { id: '1.2', written_en: 'Brother in-law', written_vi: 'anh/chị/em rể', meaning_ok: false }] }, keyParts, ROSTER));
  assert.deepEqual(g.items.map((i) => [i.id, i.written_en, i.meaning_ok]),
    [['1.1', 'Brother in-law', true], ['1.2', 'Sister in-law', true]]);  // meanings accepted by viMatches_
});

test('a meaning the photo pass rejected is accepted when the re-check says it is right', () => {
  const keyParts = G.prepareKey([{ part: 'TỪ VỰNG', kind: 'word', items: [{ en: 'sister-in-law', vi: 'chị em dâu' },
                                                                          { en: 'Twin', vi: 'anh/chị/em sinh đôi' }] }]);
  const g = G.normalizeGrade({ written_name: 'Tú Linh', matched_name: '', key_matches: true, unclear: [], items: [
    { id: '1.1', written_en: 'Sister in Law', written_vi: 'chị em vợ', meaning_ok: false },
    { id: '1.2', written_en: 'Twin', written_vi: '', meaning_ok: false }] }, keyParts, ROSTER);
  assert.deepEqual(plain(G.meaningChecks(g, keyParts)).map((c) => c.id), ['1.1']);  // blank meaning is not re-checked
  const req = plain(G.buildMeaningRequest(G.meaningChecks(g, keyParts)));
  assert.ok(req.contents[0].parts[0].text.includes('1.1. sister-in-law | mẫu: chị em dâu | em viết: chị em vợ'));
  G.applyMeaningChecks(g, [{ id: '1.1', ok: true }]);
  assert.equal(g.items[0].meaning_ok, true);
  assert.equal(g.items[1].meaning_ok, false);
});

test('saving a new class roster re-matches names without regrading', () => {
  const r = (writtenName, matchedName, aiName) => ({ writtenName, matchedName, aiName, items: [] });
  const state = {
    results: { p1: r('Việt', 'Việt'), p2: r('', ''), p3: r('Q Viel', '', 'Quốc Việt'), p4: r('M.Khôi', 'Minh Khôi') },
    nameOverrides: { p1: 'Việt', p2: 'B', p4: 'Minh Khôi' },  // placeholder names from a wrong roster
  };
  G.rematchNames_(state, ROSTER);
  assert.deepEqual(plain(state.nameOverrides), { p4: 'Minh Khôi' });  // only names still in the roster stay
  assert.equal(state.results.p1.matchedName, 'Quốc Việt');  // "Việt" now matches the full name
  assert.equal(state.results.p2.matchedName, '');          // back side: paired again when the table is built
  assert.equal(state.results.p3.matchedName, 'Quốc Việt');  // Gemini's guess, shares a word with the paper
});

test('renaming a key part renames its column and keeps the teacher edits and ids', () => {
  const key = { topic: 't', parts: plain(G.prepareKey([
    { part: 'CÔNG THỨC', kind: 'word', items: [{ en: 'admit + V-ing', vi: 'thừa nhận' }] },
    { part: 'CẤU TRÚC', kind: 'word', items: [{ en: 'opinion', vi: 'quan điểm' }, { en: 'size', vi: 'kích cỡ' }] }])) };
  const table = { title: 'CÔNG THỨC + CẤU TRÚC', columns: ['CÔNG THỨC', 'CẤU TRÚC', 'TỪ VIẾT SAI', 'CHÉP PHẠT'],
    rows: [{ name: 'An', values: { 'CÔNG THỨC': '1/1 từ', 'CẤU TRÚC': 'cô sửa 2/2', 'CHÉP PHẠT': '' },
             ai: { 'CẤU TRÚC': '1/2 từ' } }] };
  G.renamePartIn_(key, table, 'CẤU TRÚC', 'TỪ MỚI');
  assert.deepEqual(key.parts.map((p) => [p.part, p.items.map((i) => i.id)]), [['CÔNG THỨC', ['1.1']], ['TỪ MỚI', ['2.1', '2.2']]]);
  assert.deepEqual(table.columns, ['CÔNG THỨC', 'TỪ MỚI', 'TỪ VIẾT SAI', 'CHÉP PHẠT']);
  assert.equal(table.title, 'CÔNG THỨC + TỪ MỚI');
  assert.equal(table.rows[0].values['TỪ MỚI'], 'cô sửa 2/2');
  assert.equal(table.rows[0].values['CẤU TRÚC'], undefined);
  assert.equal(table.rows[0].ai['TỪ MỚI'], '1/2 từ');
  assert.throws(() => G.renamePartIn_(key, table, 'TỪ MỚI', 'CÔNG THỨC'), /Đã có cột/);
  // TỪ MỚI still counts towards the penalty
  assert.equal(G.penaltyFor({ 'CÔNG THỨC': { correct: 12, total: 13, wrongCount: 1 },
    'TỪ MỚI': { correct: 7, total: 8, wrongCount: 1 } }, 'TA9', PENALTY), 'từ viết sai x10 lần');
});

test('re-reading the same key keeps the confirmed parts, names, kinds and ids', () => {
  const saved = { topic: 'V-ing', parts: plain(G.prepareKey([
    { part: 'CÔNG THỨC', kind: 'formula', items: [{ en: 'admit + V-ing', vi: 'thừa nhận làm gì' }, { en: 'deny + V-ing', vi: 'phủ nhận' }] },
    { part: 'TỪ MỚI', kind: 'word', items: [{ en: 'opinion', vi: 'quan điểm' }] }])) };
  const merged = { topic: 'x', parts: plain(G.prepareKey([{ part: 'CẤU TRÚC', kind: 'word', items: [
    { en: 'Admit + V-ing', vi: 'thừa nhận' }, { en: 'deny + V-ing', vi: 'phủ nhận' }, { en: 'opinion', vi: 'quan điểm' }] }])) };
  const kept = plain(G.reuseKeyLayout_(merged, saved));
  assert.deepEqual(kept.parts.map((p) => [p.part, p.kind, p.items.map((i) => i.id)]),
    [['CÔNG THỨC', 'formula', ['1.1', '1.2']], ['TỪ MỚI', 'word', ['2.1']]]);
  assert.equal(kept.parts[0].items[0].vi, 'thừa nhận làm gì');  // the teacher's confirmed text wins
  const changed = plain(merged); changed.parts[0].items.pop();
  assert.equal(G.reuseKeyLayout_(changed, saved), null);  // different items: show the new reading
  assert.equal(G.reuseKeyLayout_(merged, null), null);
});

test('normalizeKey keeps each part kind and gives every item an id', () => {
  const k = plain(G.normalizeKey({ topic: 't', parts: [
    { part: 'CÔNG THỨC', kind: 'word', items: [{ en: 'admit + V-ing', vi: 'thừa nhận', numbered: true }] },
    { part: 'CẤU TRÚC', kind: 'formula', items: [{ en: 'opinion', vi: 'quan điểm', numbered: true },
                                                 { en: 'size', vi: 'kích cỡ', numbered: true }] }] }));
  assert.deepEqual(k.parts.map((p) => [p.part, p.kind, p.unit, p.items.map((i) => i.id)]),
    [['CÔNG THỨC', 'word', 'từ', ['1.1']], ['CẤU TRÚC', 'formula', 'công thức', ['2.1', '2.2']]]);
  // ids stay the same when the teacher deletes an item and saves again
  const again = plain(G.prepareKey([{ part: k.parts[1].part, kind: 'formula', items: [k.parts[1].items[1]] }]));
  assert.equal(again[0].items[0].id, '2.2');
});

test('normalizeKey drops unnumbered heading lines only when the key is numbered', () => {
  const numbered = plain(G.normalizeKey({ topic: 't', parts: [
    { part: 'TỪ VỰNG', items: [{ en: 'Preposition', vi: 'giới từ', numbered: false }, { en: 'Behind', vi: 'đằng sau', numbered: true }] },
    { part: 'CẤU TRÚC', items: [{ en: 'Tobe + giới từ', vi: '', numbered: false }] }] }));
  assert.deepEqual(numbered.parts.map((p) => [p.part, p.items.map((i) => i.en)]), [['TỪ VỰNG', ['Behind']]]);
  const plainKey = plain(G.normalizeKey({ topic: 't', parts: [
    { part: 'TỪ VỰNG', items: [{ en: 'cozy', vi: 'ấm cúng', numbered: false }] }] }));
  assert.equal(plainKey.parts[0].items.length, 1);  // no numbered list at all: keep every line
});

test('parseGeminiResponse explains a cut-off answer', () => {
  assert.throws(() => G.parseGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a": [1,' }] } }] }),
    /bị cắt/);
});

test('parseSessionDate reads old and new folder names', () => {
  assert.equal(G.parseSessionDate('NGÀY 19/9', 2026).label, '19/09/26');
  assert.equal(G.parseSessionDate('ngày 13/9', 2026).sortKey, 20260913);
  assert.equal(G.parseSessionDate('NGÀY 27/09/26', 2000).sortKey, 20260927);
  assert.equal(G.parseSessionDate('abc', 2026), null);
});

test('normalizeGrade trusts the transcribed lines over what Gemini filed per item', () => {
  const parts = [{ part: 'TỪ VỰNG', kind: 'word', items: [
    { en: 'reduce', vi: 'giảm' }, { en: 'decrease', vi: 'giảm' }, { en: 'increase', vi: 'tăng' }, { en: 'do the laundry', vi: 'giặt giũ' }] }];
  const r = plain(G.normalizeGrade({ written_name: '', matched_name: '', key_matches: true, unclear: [],
    lines: ['1. do the laundly : giặt giũ', '2. Recrease = ~~tăn~~ giảm X increase : tăng'],
    items: [
      { id: '1.1', written_en: 'Recrease', written_vi: 'giảm', meaning_ok: true },
      { id: '1.2', written_en: 'giảm', written_vi: '', meaning_ok: false },   // the meaning, filed as English
      { id: '1.3', written_en: 'increase', written_vi: 'tăng', meaning_ok: true },
      { id: '1.4', written_en: 'do the laundry', written_vi: 'giặt giũ', meaning_ok: true }] }, parts, []));
  const by = Object.fromEntries(r.items.map((it) => [it.id, it.written_en]));
  assert.equal(by['1.4'], 'do the laundly');   // spelling as copied in lines, not auto-corrected
  assert.equal(by['1.2'], 'Recrease');         // "giảm" dropped, then the line moved to its item
  const two = plain(G.normalizeGrade({ written_name: '', matched_name: '', key_matches: true, unclear: [],
    lines: ['waste (n) : rác', 'waste (v) : lãng phí'],
    items: [{ id: '1.1', written_en: 'waste (n) / waste (v)', written_vi: 'rác, lãng phí', meaning_ok: true },
            { id: '1.2', written_en: 'decrease', written_vi: 'giảm', meaning_ok: true }] }, parts, []));
  assert.equal(two.items[0].written_en, 'waste (n) / waste (v)');   // two lines filed together: kept
  assert.equal(two.items[1].written_en, '');                        // not on the paper: dropped
  assert.equal(G.letterErrors('waste (n) / waste (v)', 'waste'), 0);
  assert.equal(by['1.1'], '');
  assert.equal(by['1.3'], 'increase');
});
