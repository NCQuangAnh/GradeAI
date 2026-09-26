/**
 * Grading rules (pure logic, no Apps Script services) - tested with Node in test/grading.test.js.
 *
 * Gemini only reads the paper (what the student wrote, whether the Vietnamese meaning is right).
 * Spelling, the one-forgiveness rule, name matching and penalties are decided here, because
 * small models miscount letters.
 */

var PART_UNITS = {'TỪ VỰNG': 'từ', 'QUY TẮC TRỌNG ÂM': 'quy tắc'};
var VOCAB = 'TỪ VỰNG';
var WRONG_COL = 'TỪ VIẾT SAI';
var PENALTY_COL = 'CHÉP PHẠT';

function unitFor(part) {
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

/** Letters to add, remove, change or swap to turn `written` into `key` (swap of 2 neighbours = 1). */
function letterErrors(written, key) {
  var a = normLetters(written), b = normLetters(key);
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

/** Same slip in several items counts once ('ceilling' in both 'ceiling' and 'ceiling fan'). */
function errorSignature(written, key) {
  var a = normLetters(written), b = normLetters(key), n = Math.min(a.length, b.length), i = 0;
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

/** Match the name written on the paper to the class roster. Returns '' when unsure. */
function matchName(written, roster) {
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

/** Merge several photos of one student: for each key item keep the version that was actually written. */
function mergeStudent_(photos) {
  var vocab = {}, others = {};
  photos.forEach(function (ph) {
    (ph.vocab || []).forEach(function (it) {
      var k = normKey_(it.key_en), cur = vocab[k];
      if (!cur || (!String(cur.written_en || '').trim() && String(it.written_en || '').trim())) vocab[k] = it;
    });
    (ph.others || []).forEach(function (it) {
      var k = it.part + '|' + normKey_(it.key_text), cur = others[k];
      if (!cur || (!cur.correct && it.correct) || (!String(cur.written || '').trim() && String(it.written || '').trim())) {
        others[k] = it;
      }
    });
  });
  return {vocab: vocab, others: others};
}

/**
 * Build the review table.
 * keyParts: [{part, unit, items: [{en, vi}]}]
 * photoResults: [{fileId, fileName, url, writtenName, matchedName, keyMatches, vocab: [...], others: [...], unclear: [...]}]
 * Returns {columns, rows: [{name, values: {col: text}, notes: [..], photos: [{name, url}], status}]}
 */
function assembleSession(keyParts, roster, photoResults, className, penaltyConfig) {
  var partNames = keyParts.map(function (p) { return p.part; });
  var hasVocab = partNames.indexOf(VOCAB) >= 0;
  var columns = hasVocab
    ? [VOCAB, WRONG_COL].concat(partNames.filter(function (p) { return p !== VOCAB; }))
    : partNames.concat([WRONG_COL]);
  columns.push(PENALTY_COL);

  var byName = {}, unmatched = [];
  photoResults.forEach(function (ph) {
    if (ph.matchedName) (byName[ph.matchedName] = byName[ph.matchedName] || []).push(ph);
    else unmatched.push(ph);
  });

  function gradeRow(name, photos) {
    var merged = mergeStudent_(photos), values = {}, notes = [], parts = {}, wrongWords = [];
    keyParts.forEach(function (kp) {
      if (kp.part === VOCAB) {
        var items = kp.items.map(function (k) {
          return merged.vocab[normKey_(k.en)] ||
            {key_en: k.en, written_en: '', written_vi: '', meaning_ok: false, other_word: false};
        });
        var verdicts = decideVocab(items);
        var wrong = verdicts.filter(function (v) { return v.verdict === 'wrong'; });
        verdicts.forEach(function (v) {
          if (v.verdict === 'correct') return;
          var shown = v.written_en ? "'" + v.written_en + "'" + (v.written_vi ? ": '" + v.written_vi + "'" : '') : '';
          notes.push(v.key_en + (shown ? ' - em viết ' + shown : '') + ' - ' + v.reason);
        });
        wrongWords = wrong.map(function (v) { return v.key_en; });
        parts[kp.part] = {correct: items.length - wrong.length, total: items.length, wrongCount: wrong.length};
      } else {
        var its = kp.items.map(function (k) {
          return merged.others[kp.part + '|' + normKey_(k.en)] || {part: kp.part, key_text: k.en, written: '', correct: false};
        });
        var bad = its.filter(function (it) { return !it.correct; });
        bad.forEach(function (it) {
          notes.push(kp.part.toLowerCase() + ' "' + it.key_text + '" - ' +
            (String(it.written || '').trim() ? "em viết '" + it.written + "'" : 'không viết') + (it.note ? ' (' + it.note + ')' : ''));
        });
        parts[kp.part] = {correct: its.length - bad.length, total: its.length, wrongCount: bad.length};
      }
      values[kp.part] = parts[kp.part].correct + '/' + parts[kp.part].total + ' ' + unitFor(kp.part);
    });
    values[WRONG_COL] = wrongWords.join(', ');
    values[PENALTY_COL] = penaltyFor(parts, className, penaltyConfig);

    // flag = dòng cần cô xem lại (tô cam). Ghi chú thường (từ sai, châm chước) không tô.
    var flag = photos.length > 1;
    photos.forEach(function (ph) {
      (ph.unclear || []).forEach(function (u) { notes.push('Cô xem lại: ' + u); flag = true; });
      if (ph.keyMatches === false) {
        notes.push('Ảnh ' + ph.fileName + ' có vẻ không khớp đáp án (bài lớp/buổi khác?)');
        flag = true;
      }
    });
    if (photos.length > 1) notes.push('Gộp ' + photos.length + ' ảnh cùng tên - cô kiểm tra có đúng một em không');
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
  unmatched.forEach(function (ph) {
    var row = gradeRow('', [ph]);
    row.status = 'unmatched';
    row.flag = true;
    row.notes.unshift('Chưa ghép được tên (giấy ghi "' + (ph.writtenName || '?') + '") - cô chọn tên');
    rows.push(row);
  });
  return {columns: columns, rows: rows};
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
function resultsForTable(resultsById, overrides, ignored) {
  return Object.keys(resultsById || {}).filter(function (id) {
    return (ignored || []).indexOf(id) < 0;
  }).map(function (id) {
    var r = JSON.parse(JSON.stringify(resultsById[id]));
    if (overrides && overrides[id]) r.matchedName = overrides[id];
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
