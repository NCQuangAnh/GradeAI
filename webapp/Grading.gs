/**
 * Grading rules (pure logic, no Apps Script services) - tested with Node in test/grading.test.js.
 *
 * Gemini only reads the paper (what the student wrote, whether the Vietnamese meaning is right).
 * Spelling, the one-forgiveness rule, name matching and penalties are decided here, because
 * small models miscount letters.
 */

var PART_UNITS = {'TỪ VỰNG': 'từ', 'TỪ MỚI': 'từ', 'QUY TẮC TRỌNG ÂM': 'quy tắc'};
var VOCAB = 'TỪ VỰNG';
var WORD_PARTS = ['TỪ VỰNG', 'TỪ MỚI'];  // phần mặc định chấm như từ vựng
var WRONG_COL = 'TỪ VIẾT SAI';
var PENALTY_COL = 'CHÉP PHẠT';

/** Đơn vị hiện trong bảng: phần chấm như từ vựng thì "từ", còn lại theo tên phần. */
function unitFor(part, kind) {
  if (kind === 'word') return 'từ';
  return PART_UNITS[part] || 'công thức';
}

/** Lowercase letters only: spacing, hyphens and case are not spelling errors ("in side" = "inside"). */
function normLetters(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/**
 * Cách viết tương đương trong cấu trúc động từ không tính là lỗi:
 * O = sb = somebody = someone, sth = something, V-ing = Ving = doing.
 * Chữ V viết tay hay bị đọc thành U hoặc L: "Uing", "ling" đứng riêng cũng là Ving.
 */
function notationNorm_(s) {
  var t = ' ' + String(s || '').toLowerCase().replace(/[()\[\]]/g, ' ') + ' ';
  t = t.replace(/(^|[^a-z])(somebody|someone|smb|sb|o)(?=[^a-z]|$)/g, '$1 sb ')
       .replace(/(^|[^a-z])(something|sth)(?=[^a-z]|$)/g, '$1 sth ')
       .replace(/(^|[^a-z])([vul]\s*[-_.]?\s*ing|doing)(?=[^a-z]|$)/g, '$1 ving ');
  return normLetters(t);
}

/** Thiếu hoặc thừa "s" số nhiều ở cuối từ không tính là lỗi ("Twins" = "Twin"): bỏ một chữ s cuối mỗi từ. */
function singular_(s) {
  return String(s || '').replace(/([A-Za-z]{2,})s\b/g, function (m, w) { return /s$/i.test(w) ? m : w; });
}

/** Bản gốc và bản bỏ "s" số nhiều ở cuối từ. */
function withSingular_(list) {
  var out = list.slice();
  list.forEach(function (s) { var one = singular_(s); if (out.indexOf(one) < 0) out.push(one); });
  return out;
}

/** Phần trong ngoặc của đáp án là tùy chọn: "apologize (to sb) for + V-ing" nhận cả khi không viết "to sb". */
function keyForms_(key) {
  var raw = String(key || ''), forms = [];
  withSingular_([raw, raw.replace(/\([^)]*\)/g, ' ')]).forEach(function (s) {
    var f = notationNorm_(s);
    if (forms.indexOf(f) < 0) forms.push(f);
  });
  return forms;
}

function editDistance_(a, b) {
  var d = [];
  for (var i = 0; i <= a.length; i++) {
    d.push([]);
    for (var j = 0; j <= b.length; j++) d[i].push(i === 0 ? j : (j === 0 ? i : 0));
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Nhãn em tự ghi đầu dòng không tính là chữ của từ: "O : opinion" (OSASCOMP), "1. above", "a) below".
 * Chữ viết dở rồi viết lại ngay ("S' Sibling", "SiSibling") cũng không tính: bỏ 1-3 chữ cái đầu lặp lại phần sau.
 */
function writtenForms_(written) {
  var s = String(written || ''), bare = s.replace(/^\s*([a-z]{1,2}|\d{1,2})\s*[:.)]\s*(?=\S)/i, '');
  var forms = withSingular_(bare === s ? [s] : [s, bare]).map(notationNorm_);
  forms.slice().forEach(function (f) {
    for (var n = 1; n <= 3 && n * 2 < f.length; n++) {
      if (f.slice(n, 2 * n) === f.slice(0, n)) forms.push(f.slice(n));
    }
  });
  return forms;
}

function bestForm_(written, key) {
  var best = null, bestW = null, dist = Infinity;
  writtenForms_(written).forEach(function (w) {
    keyForms_(key).forEach(function (f) {
      var e = editDistance_(w, f);
      if (e < dist) { dist = e; best = f; bestW = w; }
    });
  });
  return {written: bestW, key: best, errors: dist};
}

/** Letters to add, remove, change or swap to turn `written` into `key` (swap of 2 neighbours = 1). */
function letterErrors(written, key) {
  return bestForm_(written, key).errors;
}

/** Same slip in several items counts once ('ceilling' in both 'ceiling' and 'ceiling fan'). */
function errorSignature(written, key) {
  var f = bestForm_(written, key), a = f.written, b = f.key, n = Math.min(a.length, b.length), i = 0;
  while (i < n && a[i] === b[i]) i++;
  return a.slice(Math.max(0, i - 3), i + 2) + '|' + b.slice(Math.max(0, i - 3), i + 2);
}

/**
 * items: [{key_en, written_en, written_vi, meaning_ok, other_word}] for ONE student (all pages merged).
 * Returns [{key_en, written_en, written_vi, verdict: 'correct'|'forgiven'|'wrong', reason}].
 */
function decideVocab(items) {
  var first = items.map(function (it) {
    var w = String(it.written_en || '').trim();
    if (!w) return {it: it, v: 'wrong', reason: 'không viết'};
    var errs = letterErrors(w, it.key_en);
    if (it.other_word && errs) return {it: it, v: 'wrong', reason: 'viết thành từ khác'};
    if (errs >= 2) return {it: it, v: 'wrong', reason: 'sai ' + errs + ' chữ cái'};
    if (errs === 1) return {it: it, v: 'light', reason: 'sai 1 chữ cái'};
    return {it: it, v: 'correct', reason: ''};
  });

  // Forgive one light error (every item sharing it), only where the meaning is right.
  var counts = {}, best = null;
  first.forEach(function (f) {
    if (f.v !== 'light' || !f.it.meaning_ok) return;
    var s = errorSignature(f.it.written_en, f.it.key_en);
    counts[s] = (counts[s] || 0) + 1;
    if (best === null || counts[s] > counts[best]) best = s;
  });

  return first.map(function (f) {
    var v = f.v, reason = f.reason;
    if (v === 'light') {
      if (!f.it.meaning_ok) {
        v = 'wrong'; reason = 'sai 1 chữ cái; sai hoặc thiếu nghĩa';
      } else if (errorSignature(f.it.written_en, f.it.key_en) === best) {
        v = 'forgiven'; reason = 'sai 1 chữ cái, được châm chước';
      } else {
        v = 'wrong'; reason = 'sai 1 chữ cái (đã dùng lượt châm chước)';
      }
    } else if (v === 'correct' && !f.it.meaning_ok) {
      v = 'wrong'; reason = 'sai hoặc thiếu nghĩa';
    }
    return {key_en: f.it.key_en, written_en: f.it.written_en || '', written_vi: f.it.written_vi || '',
            verdict: v, reason: reason};
  });
}

/** Forms a roster name can be written in: full, initials + last word, last word. */
function nameForms_(name) {
  var words = stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(function (w) { return w && !/^a\d+$/.test(w); });  // drop class tags like "a5"
  if (!words.length) return [];
  var last = words[words.length - 1];
  var initials = words.slice(0, -1).map(function (w) { return w[0]; }).join('') + last;
  return [{form: words.join(''), score: 3}, {form: initials, score: 2}, {form: last, score: 1}];
}

/**
 * Match the name written on the paper to the class roster. Returns '' when unsure.
 * Tên viết lại lần hai cạnh tên cũ (viết xấu nên viết lại): "Bách Bách" được đọc như "Bách".
 */
function matchName(written, roster) {
  var hit = matchNameExact_(written, roster);
  if (hit) return hit;
  var toks = String(written || '').trim().split(/\s+/);
  var once = toks.filter(function (t, i) {
    return i === 0 || stripAccents(t).toLowerCase() !== stripAccents(toks[i - 1]).toLowerCase();
  });
  return once.length < toks.length ? matchNameExact_(once.join(' '), roster) : '';
}

function matchNameExact_(written, roster) {
  var w = stripAccents(written).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return '';
  var best = 0, hits = [];
  roster.forEach(function (name) {
    var score = 0;
    nameForms_(name).forEach(function (f) { if (f.form === w) score = Math.max(score, f.score); });
    if (score > best) { best = score; hits = [name]; }
    else if (score && score === best) hits.push(name);
  });
  return hits.length === 1 ? hits[0] : '';
}

/** Chữ viết tắt tiếng Việt học sinh hay dùng (viết không dấu), đổi ra chữ đầy đủ trước khi so nghĩa. */
var VI_ABBR = {ae: 'anh em', ace: 'anh chi em', ce: 'chi em', ac: 'anh chi', lm: 'lam', lmj: 'lam gi', lmg: 'lam gi',
               lj: 'lam gi', j: 'gi', ko: 'khong', k: 'khong', hk: 'khong', dc: 'duoc', ng: 'nguoi', vs: 'voi',
               xl: 'xin loi', cx: 'cung', mn: 'moi nguoi', ntn: 'nhu the nao', vd: 'vi du'};

var KIN_ = /^(anh|chi|em)+$/;  // anh, chị, em (kể cả viết liền "anhem", "chiem")

/** Nối các chữ lại, mỗi cụm chữ anh/chị/em liền nhau thành một dấu "#" (anh/chị/em = anh em = chị em = ce). */
function kinJoin_(tokens) {
  var out = '';
  tokens.forEach(function (t) {
    if (t === '#' || KIN_.test(t)) { if (out.slice(-1) !== '#') out += '#'; }
    else out += t;
  });
  return out;
}

function viLetters_(s) {
  var words = [];
  stripAccents(String(s || '').toLowerCase()).replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).forEach(function (w) {
    (VI_ABBR[w] || w).split(' ').forEach(function (x) { if (x) words.push(x); });
  });
  return kinJoin_(words);
}

/**
 * Nghĩa em viết khớp nghĩa đáp án khi bỏ dấu, bỏ phần trong ngoặc, đổi chữ viết tắt (ae, ce, lmj...), coi cụm
 * anh/chị/em là như nhau ("anh/chị/em sinh đôi" = "anh em sinh đôi" = "ace sinh đôi"; "chị em dâu" = "chị/em dâu"
 * = "ce dâu") và coi các chữ khác nối bằng "/" là một nhóm được viết một hoặc vài chữ trong đó
 * ("bố chồng/bố vợ" nhận "bố chồng/vợ"). Chỉ dùng để công nhận thêm, không chê.
 */
function viMatches_(written, key) {
  var w = viLetters_(written);
  if (!w) return false;
  var units = stripAccents(String(key || '').toLowerCase()).replace(/\([^)]*\)/g, ' ')
    .replace(/\s*\/\s*/g, '/').split(/[^a-z\/]+/).filter(String);
  if (!units.length) return false;
  var parts = units.map(function (u) {
    var alts = u.split('/').filter(String);
    if (alts.every(function (a) { return KIN_.test(a); })) return '#';
    return alts.length > 1 ? '(?:' + alts.join('|') + ')+' : alts.join('');
  });
  var pattern = '';
  parts.forEach(function (p) { if (!(p === '#' && pattern.slice(-1) === '#')) pattern += p; });
  return new RegExp('^' + pattern + '$').test(w);
}

/** Nghĩa Gemini chê nhưng khớp đáp án theo viMatches_ thì công nhận (không cần hỏi lại). */
function acceptKnownMeanings_(items, keyParts) {
  var keyById = {};
  keyParts.forEach(function (p) { p.items.forEach(function (k) { keyById[k.id] = k; }); });
  items.forEach(function (it) {
    var k = keyById[it.id];
    if (k && !it.meaning_ok && String(it.written_vi || '').trim() && viMatches_(it.written_vi, k.vi)) it.meaning_ok = true;
  });
}

/**
 * Tên AI đoán chỉ được nhận khi khớp với tên ghi trên giấy: có chung ít nhất một chữ ("Hường" ~ "Thu Hương"),
 * hoặc chữ cái đầu các chữ giống nhau ("Q Viel" ~ "Quốc Việt").
 */
function namesOverlap(written, rosterName) {
  var toks = function (s) { return stripAccents(s).toLowerCase().split(/[^a-z0-9]+/).filter(String); };
  var w = toks(written), r = toks(rosterName);
  var initials = function (t) { return t.map(function (x) { return x[0]; }).join(''); };
  if (w.length >= 2 && initials(w) === initials(r)) return true;
  return w.some(function (x) { return x.length >= 2 && r.indexOf(x) >= 0; });
}

/** Penalty text for one student. parts: {partName: {correct, total, wrongCount}}. */
function penaltyFor(parts, className, penaltyConfig) {
  var cfg = {};
  var base = penaltyConfig['default'], extra = (penaltyConfig.classes || {})[className] || {};
  Object.keys(base).forEach(function (k) { cfg[k] = base[k]; });
  Object.keys(extra).forEach(function (k) { cfg[k] = extra[k]; });

  function pick(levels, wrong, total) {
    var hit = levels.filter(function (lv) { return wrong >= lv.min_wrong; });
    return hit.length ? hit[hit.length - 1].penalty.replace('{total}', total) : '';
  }
  var wrong = 0, total = 0, out = [];
  Object.keys(parts).forEach(function (p) {
    if (cfg.counted_columns.indexOf(p) >= 0) { wrong += parts[p].wrongCount; total += parts[p].total; }
  });
  out.push(pick(cfg.levels, wrong, total));
  Object.keys(cfg.separate_columns || {}).forEach(function (p) {
    if (parts[p]) out.push(pick(cfg.separate_columns[p], parts[p].wrongCount, parts[p].total));
  });
  return out.filter(String).join('; ');
}

function normKey_(s) {
  return normLetters(s) || stripAccents(s).toLowerCase().replace(/\s+/g, '');
}

/**
 * Đáp án chuẩn hóa: mỗi phần có kind ('word' = từ/cụm từ + nghĩa, chấm chính tả bằng code;
 * 'formula' = công thức/quy tắc, Gemini chấm đúng sai) và mỗi mục có mã riêng (1.1, 1.2, 2.1...)
 * để Gemini trả lời theo mã, không phụ thuộc thứ tự học sinh viết.
 */
function prepareKey(parts) {
  var used = {};
  return (parts || []).map(function (p, pi) {
    var kind = p.kind === 'word' || p.kind === 'formula' ? p.kind : (WORD_PARTS.indexOf(p.part) >= 0 ? 'word' : 'formula');
    var n = 0;
    var items = (p.items || []).map(function (it) {
      var id = String(it.id || '').trim();
      if (!id || used[id]) {
        do { n++; id = (pi + 1) + '.' + n; } while (used[id]);
      }
      used[id] = true;
      return {id: id, en: it.en, vi: it.vi};
    });
    return {part: p.part, kind: kind, unit: unitFor(p.part, kind), items: items};
  });
}

/**
 * Đọc lại ảnh đáp án mà ra đúng các mục như đáp án cô đã xác nhận thì giữ nguyên đáp án đã xác nhận
 * (cách chia phần, tên phần, cách chấm, mã mục và chữ cô đã sửa); mỗi lần đọc Gemini có thể chia phần khác.
 * Trả về null nếu các mục khác nhau.
 */
function reuseKeyLayout_(fresh, saved) {
  var sig = function (key) {
    var list = [];
    ((key && key.parts) || []).forEach(function (p) {
      (p.items || []).forEach(function (it) { list.push(normKey_(it.en)); });
    });
    return list.sort().join('|');
  };
  if (!saved || !(saved.parts || []).length || sig(fresh) !== sig(saved)) return null;
  return {topic: saved.topic || fresh.topic, parts: JSON.parse(JSON.stringify(saved.parts))};
}

/** Kết quả một ảnh -> các mục theo mã đáp án (hỗ trợ cả kết quả cũ dạng vocab/others). */
function photoItems_(ph, keyParts) {
  if (ph.items) return ph.items;
  var out = [];
  keyParts.forEach(function (kp) {
    kp.items.forEach(function (k) {
      var it = kp.part === VOCAB
        ? (ph.vocab || []).filter(function (v) { return normKey_(v.key_en) === normKey_(k.en); })[0]
        : (ph.others || []).filter(function (o) { return o.part === kp.part && normKey_(o.key_text) === normKey_(k.en); })[0];
      it = it || {};
      out.push({id: k.id, written_en: it.written_en || it.written || '', written_vi: it.written_vi || '',
                meaning_ok: !!it.meaning_ok, other_word: !!it.other_word, correct: !!it.correct, note: it.note || ''});
    });
  });
  return out;
}

function writtenIds_(ph) {
  return (ph.items || []).filter(function (it) { return String(it.written_en || '').trim(); })
    .map(function (it) { return it.id; });
}

/**
 * Mặt sau tờ bài thường không ghi tên: ảnh không có tên được ghép với ảnh chụp ngay trước nó
 * (tên file theo thứ tự chụp), nếu ảnh trước đã có tên và hai ảnh gần như không trùng mục nào (2 mặt của một bài).
 * Ảnh cô đã tách ra ("chưa có tên") thì không ghép lại.
 */
function pairBackSides_(photos) {
  var sorted = photos.slice().sort(function (a, b) { return String(a.fileName).localeCompare(String(b.fileName)); });
  sorted.forEach(function (ph, i) {
    if (ph.matchedName || ph.forceUnmatched || String(ph.writtenName || '').trim() || i === 0) return;
    var prev = sorted[i - 1];
    if (!prev.matchedName) return;
    var mine = writtenIds_(ph), theirs = writtenIds_(prev);
    var overlap = mine.filter(function (id) { return theirs.indexOf(id) >= 0; }).length;
    if (mine.length && overlap <= 2) {
      ph.matchedName = prev.matchedName;
      ph.pairedWith = prev.fileName;
    }
  });
  return sorted;
}

/**
 * Chấm theo đáp án: mục đáp án có nghĩa ("admit + V-ing : thừa nhận làm gì") thì em phải viết đúng cả nghĩa;
 * mục chỉ có công thức thì chỉ chấm công thức.
 */
function needsMeaning_(k) {
  return !!String(k.vi || '').trim();
}

/**
 * Phần công thức: Gemini chấm, nhưng em viết trùng đáp án khi bỏ qua cách viết (Ving = V-ing = doing, O = sb,
 * dấu cách, dấu +, hoa thường, phần trong ngoặc như "(to sb)") thì tính đúng dù Gemini chấm sai ("accuse sbof Ving").
 */
function formulaOk_(it, k) {
  var written = String(it.written_en || '').trim();
  return !!written && (!!it.correct || letterErrors(written, k.en) === 0);
}

/** Gộp các ảnh của một em: mỗi mục lấy bản em thực sự viết (ưu tiên bản đúng). */
function mergeStudent_(photos) {
  var byId = {};
  photos.forEach(function (ph) {
    (ph.items || []).forEach(function (it) {
      var cur = byId[it.id], w = String(it.written_en || '').trim();
      if (!cur) { byId[it.id] = it; return; }
      var cw = String(cur.written_en || '').trim();
      if ((!cw && w) || (w && ((!cur.correct && it.correct) || (!cur.meaning_ok && it.meaning_ok)))) byId[it.id] = it;
    });
  });
  return byId;
}

/**
 * Build the review table.
 * keyParts: [{part, kind, unit, items: [{id, en, vi}]}]
 * photoResults: [{fileId, fileName, url, writtenName, matchedName, keyMatches, items: [...], unclear: [...]}]
 * Returns {columns, rows: [{name, values: {col: text}, notes: [..], photos: [{id, name, url}], status, flag, ai}]}
 */
function assembleSession(keyParts, roster, photoResults, className, penaltyConfig) {
  keyParts = prepareKey(keyParts);
  var columns = keyParts.map(function (p) { return p.part; });
  var lastWord = -1;
  keyParts.forEach(function (p, i) { if (p.kind === 'word') lastWord = i; });
  if (lastWord >= 0) columns.splice(lastWord + 1, 0, WRONG_COL); else columns.push(WRONG_COL);
  columns.push(PENALTY_COL);

  var photos = pairBackSides_(photoResults.map(function (ph) {
    var copy = {};
    Object.keys(ph).forEach(function (k) { copy[k] = ph[k]; });
    copy.items = photoItems_(ph, keyParts);
    return copy;
  }));
  // ảnh chưa nhận ra tên: mỗi ảnh một dòng riêng (không gom), cô gán từng ảnh cho đúng em
  var byName = {}, unmatched = [];
  photos.forEach(function (ph) {
    if (ph.matchedName) {
      ph.matchedName = canonicalName(ph.matchedName, roster);  // "vinh" cô gõ = "Vinh" trong danh sách lớp
      (byName[ph.matchedName] = byName[ph.matchedName] || []).push(ph);
    } else unmatched.push([ph]);
  });

  function gradeRow(name, photos) {
    var merged = mergeStudent_(photos), values = {}, notes = [], parts = {}, wrongWords = [];
    // các phần chấm như từ vựng được xét chung: châm chước 1 lỗi cho cả bài
    var wordItems = [];
    keyParts.forEach(function (kp) {
      if (kp.kind !== 'word') return;
      kp.items.forEach(function (k) {
        var it = merged[k.id] || {};
        wordItems.push({id: k.id, key_en: k.en, written_en: it.written_en || '', written_vi: it.written_vi || '',
                        meaning_ok: needsMeaning_(k) ? !!it.meaning_ok : true, other_word: !!it.other_word});
      });
    });
    var verdictById = {};
    decideVocab(wordItems).forEach(function (v, i) { verdictById[wordItems[i].id] = v; });

    keyParts.forEach(function (kp) {
      var wrongCount = 0;
      kp.items.forEach(function (k) {
        if (kp.kind === 'word') {
          var v = verdictById[k.id];
          if (v.verdict === 'correct') return;
          var shown = v.written_en ? "'" + v.written_en + "'" + (v.written_vi ? ": '" + v.written_vi + "'" : '') : '';
          notes.push(k.en + (shown ? ' - em viết ' + shown : '') + ' - ' + v.reason);
          if (v.verdict === 'wrong') { wrongCount++; wrongWords.push(k.en); }
        } else {
          var it = merged[k.id] || {}, written = String(it.written_en || '').trim();
          var okFormula = formulaOk_(it, k), okMeaning = !needsMeaning_(k) || !!it.meaning_ok;
          if (okFormula && okMeaning) return;
          wrongCount++;
          var why = [];
          if (!written) why.push('không viết');
          else if (!okFormula) why.push("em viết '" + written + "'");
          if (written && !okMeaning) {
            why.push(String(it.written_vi || '').trim() ? "nghĩa '" + it.written_vi + "' chưa đúng (đáp án: " + k.vi + ')'
                                                         : 'thiếu nghĩa (đáp án: ' + k.vi + ')');
          }
          notes.push(kp.part.toLowerCase() + ' "' + k.en + '" - ' + why.join(', ') + (it.note ? ' (' + it.note + ')' : ''));
        }
      });
      parts[kp.part] = {correct: kp.items.length - wrongCount, total: kp.items.length, wrongCount: wrongCount};
      values[kp.part] = parts[kp.part].correct + '/' + parts[kp.part].total + ' ' + kp.unit;
    });
    values[WRONG_COL] = wrongWords.join(', ');
    values[PENALTY_COL] = penaltyFor(parts, className, penaltyConfig);

    // flag = dòng cần cô xem lại (tô vàng). Ghi chú thường (từ sai, châm chước) không tô.
    var flag = false;
    photos.forEach(function (ph) {
      (ph.unclear || []).forEach(function (u) { notes.push('Cô xem lại: ' + u); flag = true; });
      if (ph.keyMatches === false) {
        notes.push('Ảnh ' + ph.fileName + ' có vẻ không khớp đáp án (bài lớp/buổi khác?)');
        flag = true;
      }
      if (ph.pairedWith) {
        notes.push('Ảnh ' + ph.fileName + ' không ghi tên, AI ghép với ảnh chụp ngay trước (mặt sau của bài) - cô kiểm tra');
        flag = true;
      }
    });
    if (photos.length > 1) {
      // 2 mặt của cùng một bài thì ít mục trùng; trùng nhiều thì có thể là 2 em khác nhau
      var seen = {}, dup = 0;
      photos.forEach(function (ph) { writtenIds_(ph).forEach(function (id) { if (seen[id]) dup++; seen[id] = true; }); });
      if (dup > 2) {
        notes.push('Gộp ' + photos.length + ' ảnh cùng tên nhưng trùng ' + dup + ' mục - có thể là 2 em khác nhau, cô kiểm tra');
        flag = true;
      } else {
        notes.push('Gộp ' + photos.length + ' ảnh (các mặt của cùng một bài)');
      }
    }
    // ai: bản AI đề xuất, giữ nguyên dù cô sửa bảng - dữ liệu để sau này làm gợi ý chép phạt theo từng em
    var ai = {};
    Object.keys(values).forEach(function (k) { ai[k] = values[k]; });
    return {name: name, values: values, notes: notes, status: 'graded', flag: flag, ai: ai,
            photos: photos.map(function (ph) {
              return {id: ph.fileId, name: ph.fileName, url: ph.url, writtenName: ph.writtenName};
            })};
  }

  var rows = [];
  roster.forEach(function (name) {
    if (byName[name]) rows.push(gradeRow(name, byName[name]));
    else rows.push({name: name, values: {}, notes: [], photos: [], status: 'missing'});  // cô chọn Vắng / Không có bài
  });
  Object.keys(byName).forEach(function (name) {
    if (roster.indexOf(name) < 0) rows.push(gradeRow(name, byName[name]));
  });
  unmatched.forEach(function (list) {
    var row = gradeRow('', list);
    row.status = 'unmatched';
    row.flag = true;
    row.notes.unshift('Chưa ghép được tên (giấy ghi "' + (list[0].writtenName || '?') + '") - cô chọn tên');
    rows.push(row);
  });
  return {columns: columns, rows: rows};
}

/**
 * Đổi tên một phần đáp án (ví dụ CẤU TRÚC thành TỪ MỚI) ngay trong đáp án đã lưu và bảng đang duyệt:
 * mã mục không đổi nên không cần chấm lại, các ô cô đã sửa được giữ nguyên.
 */
function renamePartIn_(key, table, oldName, newName) {
  newName = String(newName || '').trim();
  var parts = (key && key.parts) || [];
  if (!newName || newName === oldName) return;
  if (!parts.some(function (p) { return p.part === oldName; })) throw new Error('Đáp án không có phần ' + oldName);
  if (newName === WRONG_COL || newName === PENALTY_COL || parts.some(function (p) { return p.part === newName; })) {
    throw new Error('Đã có cột ' + newName);
  }
  parts.forEach(function (p) {
    if (p.part === oldName) { p.part = newName; p.unit = unitFor(newName, p.kind); }
  });
  if (!table || !table.columns) return;
  table.columns = table.columns.map(function (c) { return c === oldName ? newName : c; });
  table.title = String(table.title || '').split(' + ').map(function (t) { return t === oldName ? newName : t; }).join(' + ');
  (table.rows || []).forEach(function (r) {
    [r.values, r.ai].forEach(function (v) {
      if (v && Object.prototype.hasOwnProperty.call(v, oldName)) { v[newName] = v[oldName]; delete v[oldName]; }
    });
  });
}

/**
 * Danh sách lớp vừa sửa: ghép lại tên từng ảnh theo danh sách mới (không gọi Gemini, không chấm lại).
 * Tên cô đã chọn mà không còn trong danh sách (tên tạm như A, B hay tên cũ bị sai) bị bỏ để ghép lại.
 */
function rematchNames_(state, roster) {
  var overrides = state.nameOverrides || {};
  Object.keys(overrides).forEach(function (id) {
    if (overrides[id] !== UNASSIGNED && roster.indexOf(overrides[id]) < 0) delete overrides[id];
  });
  Object.keys(state.results || {}).forEach(function (id) {
    var r = state.results[id], written = String(r.writtenName || '').trim();
    var m = matchName(written, roster);
    if (!m && written && roster.indexOf(r.aiName) >= 0 && namesOverlap(written, r.aiName)) m = r.aiName;
    if (!m && roster.indexOf(r.matchedName) >= 0) m = r.matchedName;  // kết quả cũ chưa lưu tên AI đoán
    r.matchedName = m;
  });
}

// ---------- chấm nhiều lần trong một buổi ----------

/** Photo ids -> name the teacher chose in the review table (rows that have photos). */
function overridesFromTable(table) {
  var out = {};
  ((table && table.rows) || []).forEach(function (r) {
    var name = String(r.name || '').trim();
    if (name) (r.photos || []).forEach(function (p) { if (p.id) out[p.id] = name; });
  });
  return out;
}

/** Saved per-photo results -> list for assembleSession, with the teacher's name choices applied. */
/** Tên so sánh không phân biệt hoa thường và khoảng trắng thừa ("vinh" = "Vinh"). */
function nameKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tên cô gõ trùng một tên trong danh sách lớp (không kể hoa thường) thì dùng đúng tên trong danh sách. */
function canonicalName(name, roster) {
  var k = nameKey(name);
  for (var i = 0; i < (roster || []).length; i++) if (nameKey(roster[i]) === k) return roster[i];
  return String(name || '').trim();
}

/** Tên cô chọn cho một ảnh khi tách ảnh ra khỏi dòng của một em: ảnh về mục "chưa có tên", AI không tự ghép lại. */
var UNASSIGNED = '__chua_co_ten__';

function resultsForTable(resultsById, overrides, ignored) {
  return Object.keys(resultsById || {}).filter(function (id) {
    return (ignored || []).indexOf(id) < 0;
  }).map(function (id) {
    var r = JSON.parse(JSON.stringify(resultsById[id]));
    if (overrides && overrides[id] === UNASSIGNED) { r.matchedName = ''; r.forceUnmatched = true; }
    else if (overrides && overrides[id]) r.matchedName = overrides[id];
    return r;
  });
}

function photoSet_(row) {
  return (row.photos || []).map(function (p) { return p.id; }).sort().join(',');
}

/**
 * Keep what the teacher already reviewed when new photos are graded later.
 * A row is kept from `prev` when it has exactly the same photos (or is still a no-photo row);
 * rows that got new photos are re-graded and marked. Manually added rows are kept.
 */
function mergeTables(prev, next) {
  if (!prev || !prev.rows || prev.columns.join('|') !== next.columns.join('|')) return next;
  var prevBySet = {}, prevByName = {};
  prev.rows.forEach(function (r) {
    if ((r.photos || []).length) prevBySet[photoSet_(r)] = r;
    if (String(r.name || '').trim()) prevByName[String(r.name).trim()] = r;
  });
  var used = {};
  var rows = next.rows.map(function (r) {
    var old = (r.photos || []).length ? prevBySet[photoSet_(r)] : null;
    if (!old && !(r.photos || []).length) {
      var byName = prevByName[String(r.name || '').trim()];
      if (byName && !(byName.photos || []).length) old = byName;
    }
    if (old) {
      used[prev.rows.indexOf(old)] = true;
      old.status = r.status;  // e.g. an unmatched photo the teacher has named is now a normal row
      if (String(r.name || '').trim()) old.name = r.name;  // tên ghép lại theo danh sách lớp mới ("Việt" -> "Quốc Việt")
      return old;
    }
    var byNameOld = prevByName[String(r.name || '').trim()];
    if (byNameOld && (byNameOld.photos || []).length) {
      used[prev.rows.indexOf(byNameOld)] = true;
      r.notes = 'Ảnh của em thay đổi (thêm hoặc xóa ảnh) nên AI chấm lại dòng này\n' +
        (Array.isArray(r.notes) ? r.notes.join('\n') : (r.notes || ''));
      r.flag = true;
    }
    return r;
  });
  prev.rows.forEach(function (r, i) {
    var name = String(r.name || '').trim();
    if (!used[i] && r.status === 'added' && !rows.some(function (x) { return String(x.name || '').trim() === name; })) {
      rows.push(r);
    }
  });
  return {columns: next.columns, title: next.title, rows: rows};
}

/** 'NGÀY 19/9', 'ngày 13/9', 'NGÀY 27/09/26' -> {d, m, y, label}. y defaults to `defaultYear`. */
function parseSessionDate(folderName, defaultYear) {
  var m = String(folderName).match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?/);
  if (!m) return null;
  var d = +m[1], mo = +m[2], y = m[3] ? +m[3] : defaultYear;
  if (y < 100) y += 2000;
  function two(n) { return (n < 10 ? '0' : '') + n; }
  return {d: d, m: mo, y: y, sortKey: y * 10000 + mo * 100 + d,
          label: two(d) + '/' + two(mo) + '/' + two(y % 100)};
}
