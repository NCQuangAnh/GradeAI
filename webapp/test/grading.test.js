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

  // a name not in the roster: both sides still end up in one row, the teacher picks the name once
  const t2 = plain(G.assembleSession(keyParts, ROSTER, [
    photo('bai_5', 'Duy', [w('1.1', 'admit + Ving'), w('1.2', 'deny + Ving')]),
    photo('bai_6', 'Duy', [w('1.3', 'advise O to V'), w('2.1', 'opinion', { correct: true })]),
    photo('bai_7', 'Zed', [w('1.1', 'admit + Ving')]),
    photo('bai_8', '', [w('2.2', 'size', { correct: true })]),  // back side of Zed's paper
  ], 'TA9', PENALTY));
  const groups = t2.rows.filter((r) => r.status === 'unmatched').map((r) => r.photos.map((p) => p.id));
  assert.deepEqual(groups, [['bai_5', 'bai_6'], ['bai_7', 'bai_8']]);
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
