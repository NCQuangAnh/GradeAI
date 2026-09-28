/**
 * Gemini request builders and response parsers (pure - the HTTP call itself is in Code.gs).
 * Tested with Node in test/gemini_live.js.
 */

var PART_NAMES = ['TỪ VỰNG', 'CÔNG THỨC', 'CẤU TRÚC', 'CÂU GIÁN TIẾP', 'QUY TẮC TRỌNG ÂM'];

var KEY_PROMPT = [
  'Ảnh là ĐÁP ÁN bài tập tiếng Anh của cô giáo (một hoặc nhiều ảnh). Hãy chép lại đáp án thành danh sách.',
  '- Chép mọi dòng có nội dung đáp án thành mục (bỏ ngày tháng, "NEW WORDS").',
  '  numbered = true nếu dòng đó trên ảnh BẮT ĐẦU bằng số thứ tự ("1.", "2)"...) hoặc gạch đầu dòng/chấm tròn;',
  '  numbered = false nếu dòng không có số thứ tự (thường là tiêu đề, ví dụ "Preposition: giới từ (of place)",',
  '  "Tobe + giới từ"). Nhìn kỹ đầu mỗi dòng trước khi quyết định.',
  '- Chú thích trong ngoặc không phải mục riêng: "bên cạnh ( = by )" thì by KHÔNG phải một mục;',
  '  "(n)", "(v)", phiên âm như "/e/", "/i:/" cũng bỏ.',
  '- Chia theo phần: TỪ VỰNG (từ: nghĩa), CÔNG THỨC / CẤU TRÚC (công thức ngữ pháp, ví dụ HTĐ: S + V(s/es)),',
  '  CÂU GIÁN TIẾP, QUY TẮC TRỌNG ÂM. Đáp án có nhiều khối nội dung khác nhau (mỗi khối một tiêu đề hoặc chủ đề,',
  '  ví dụ các cấu trúc V-ing rồi tới trật tự tính từ OSASCOMP) thì mỗi khối là một phần riêng, tên phần khác nhau.',
  '- TỪ VỰNG: mỗi từ/cụm tiếng Anh là 1 mục, en = từ tiếng Anh (bỏ (n), (v), (adj)), vi = nghĩa tiếng Việt.',
  '  Dòng "A = B : nghĩa" tách thành 2 mục A và B cùng nghĩa, cùng numbered. Ví dụ "Next to = beside : bên cạnh" -> 2 mục.',
  '- Phần khác: mỗi công thức/quy tắc là 1 mục, en = nội dung công thức/quy tắc, vi = tên hoặc nghĩa ghi trên đáp án.',
  '- vi chỉ chép đúng phần nghĩa/tên CÓ GHI trên ảnh đáp án cạnh mục đó. Đáp án không ghi nghĩa thì vi rỗng,',
  '  KHÔNG tự thêm giải thích (học sinh bị chấm theo đúng những gì đáp án ghi).',
  '- kind của mỗi phần: "word" nếu mỗi mục là từ, cụm từ hoặc cấu trúc động từ kèm nghĩa tiếng Việt',
  '  (ví dụ "admit + V-ing : thừa nhận làm gì", "advise O to V : khuyên ai làm gì", "opinion : quan điểm");',
  '  "formula" nếu là công thức ngữ pháp dạng S + V... (thì, câu bị động, câu gián tiếp) hoặc quy tắc trọng âm.',
  '- topic: tóm tắt chủ đề bài trong vài chữ (ví dụ "giới từ chỉ vị trí").'
].join('\n');

var GRADE_PROMPT = [
  'Bạn đọc bài làm viết tay của MỘT học sinh Việt Nam (ảnh đính kèm) và so với đáp án bên dưới.',
  'Ảnh có thể chỉ là MỘT MẶT của bài (mặt kia ở ảnh khác): chỉ điền các mục có trên ảnh này, mục không có thì để rỗng.',
  '',
  'BƯỚC 1 - CHÉP LẠI từng dòng học sinh viết, ĐÚNG TỪNG CHỮ CÁI như trên giấy.',
  'TUYỆT ĐỐI KHÔNG tự sửa lỗi chính tả: em viết "bellow" thì chép "bellow", không phải "below".',
  'Chữ bị gạch ngang, gạch chéo hoặc tô đen là chữ em đã bỏ: KHÔNG chép, chỉ chép phần còn lại',
  '(ví dụ "bố m̶e̶ chồng/vợ" thì chép "bố chồng/vợ"). Chữ viết dở rồi viết lại ngay cạnh cũng là chữ bỏ:',
  '"S\' Sibling", "Si Sibling" thì chép "Sibling".',
  'Chỗ nào có tẩy xóa hoặc khó đọc mà ảnh hưởng tới kết quả thì ghi vào unclear (ví dụ "inside: chữ ngoài có thể bị gạch").',
  '',
  'BƯỚC 2 - GHÉP với đáp án THEO NỘI DUNG, KHÔNG theo thứ tự dòng. items: đúng 1 phần tử cho MỖI mã mục của',
  'đáp án (id như "1.3"). Học sinh thường viết khác thứ tự đáp án: dòng "deny + ving : phủ nhận" là mục',
  '"deny + V-ing" dù em viết ở dòng thứ mấy. Không tìm thấy dòng nào của mục đó trên ảnh thì written_en rỗng.',
  'Ghép theo CHỮ TIẾNG ANH em viết, KHÔNG theo nghĩa: dòng "sister in law : con dâu" là mục sister-in-law',
  '(nghĩa sai), không phải mục daughter-in-law. Mỗi dòng em viết chỉ ghép vào một mục.',
  'Dòng dạng "A = B : nghĩa" nghĩa là A và B DÙNG CHUNG nghĩa cuối dòng: "next to = Besind : bên cạnh"',
  'thì next to có written_en "next to", beside có written_en "Besind", cả hai written_vi "bên cạnh".',
  'Chữ tiếng Anh em viết (kể cả viết sai) KHÔNG BAO GIỜ là nghĩa tiếng Việt.',
  '',
  'BƯỚC 3 - CHẤM:',
  '- Phần loại word (từ, cụm từ, cấu trúc kèm nghĩa): written_en = phần tiếng Anh em viết (nguyên văn, bỏ nhãn',
  '  em tự thêm ở đầu dòng như số thứ tự hay "O :" của OSASCOMP), written_vi = nghĩa em viết (kể cả nghĩa trong ngoặc).',
  '  meaning_ok = true nếu nghĩa tiếng Việt đúng nghĩa của mục (không cần giống chữ đáp án, lỗi dấu nhỏ không sao). Thiếu nghĩa hoặc sai nghĩa là false.',
  '  Phần nghĩa chính (chữ dịch động từ/danh từ tiếng Anh) phải đủ và đúng: "buộc" thay cho "buộc tội",',
  '  "chỉ định" thay cho "chỉ trích" là SAI. Phần phụ đi kèm như "làm gì", "ai", "vì", "điều gì" được viết tắt.',
  '  Nghĩa trong đáp án chỉ là MỘT cách dịch: nghĩa khác mà vẫn đúng với từ tiếng Anh là đúng (brother-in-law:',
  '  anh/em rể, anh/em chồng, anh/em vợ; sister-in-law: chị/em dâu, chị/em chồng, chị/em vợ). Sai là khi nghĩa',
  '  thuộc từ khác (sister-in-law : con dâu), thiếu phần chính hoặc hiểu sai từ.',
  '  Chữ viết tắt quen dùng hiểu như chữ đầy đủ: lm = làm; lmj, lmg, lj = làm gì; j = gì; ko, k, hk = không;',
  '  đc = được; ng = người; vs = với; xl = xin lỗi; cx = cũng; mn = mọi người; ntn = như thế nào; vd = ví dụ;',
  '  ae = anh em; ace = anh chị em; ce = chị em. Đáp án ghi "anh/chị/em" thì em viết "anh em", "chị em", "ae",',
  '  "anhem", "ce" đều đúng (vẫn phải có phần còn lại như "sinh đôi", "ruột").',
  '  KHÔNG chấm chính tả tiếng Anh - chương trình tự làm. other_word = true chỉ khi em thay hẳn bằng một từ',
  '  tiếng Anh có thật mang nghĩa khác, do hiểu sai từ (ví dụ "site" thay "side" trong outside/inside/beside).',
  '  Viết sai chữ cái mà không thành từ có thật ("Besind", "Behinh"), hoặc viết nhầm một chữ do nét chữ',
  '  ("For from" thay "far from") thì là false.',
  '- Phần loại formula (công thức, câu gián tiếp, quy tắc trọng âm): written_en = công thức em viết,',
  '  correct = true nếu PHẦN CÔNG THỨC đúng đủ thành phần, đúng thứ tự, đúng dạng động từ (nghĩa chấm riêng ở meaning_ok).',
  '  Sai một thành phần là sai.',
  '  Cách viết tương đương coi là giống nhau: Ving = V-ing = doing, O = sb = somebody, sth = something; có hay không',
  '  dấu "+", dấu cách (kể cả chữ viết sát nhau như "sbof"), hoa thường đều không quan trọng; phần trong ngoặc của',
  '  đáp án như "(to sb)" không viết vẫn đúng. Mục đáp án có nghĩa thì điền written_vi và meaning_ok đúng như phần word',
  '  (cùng quy tắc nghĩa chính và chữ viết tắt); em không ghi nghĩa thì written_vi rỗng, meaning_ok = false.',
  '',
  'TÊN: written_name = tên ghi trên giấy, nguyên văn; giấy không có tên (thường là mặt sau) thì để rỗng, KHÔNG đoán.',
  'matched_name = tên trong DANH SÁCH LỚP ứng với tên đó (tên viết tắt như "K.Vy", "LQMai", chỉ tên cuối vẫn',
  'ghép được); không chắc hoặc giấy không có tên thì để rỗng.',
  'key_matches = false nếu bài làm rõ ràng là chủ đề khác đáp án (bài của buổi hoặc lớp khác).'
].join('\n');

function keySchema_() {
  return {
    type: 'OBJECT',
    properties: {
      topic: {type: 'STRING'},
      parts: {type: 'ARRAY', items: {
        type: 'OBJECT',
        properties: {
          part: {type: 'STRING', format: 'enum', 'enum': PART_NAMES},
          kind: {type: 'STRING', format: 'enum', 'enum': ['word', 'formula']},
          items: {type: 'ARRAY', items: {
            type: 'OBJECT',
            properties: {en: {type: 'STRING'}, vi: {type: 'STRING'}, numbered: {type: 'BOOLEAN'}},
            required: ['en', 'vi', 'numbered']
          }}
        },
        required: ['part', 'kind', 'items']
      }}
    },
    required: ['topic', 'parts']
  };
}

function gradeSchema_() {
  return {
    type: 'OBJECT',
    properties: {
      written_name: {type: 'STRING'},
      matched_name: {type: 'STRING'},
      key_matches: {type: 'BOOLEAN'},
      items: {type: 'ARRAY', items: {
        type: 'OBJECT',
        properties: {
          id: {type: 'STRING'}, written_en: {type: 'STRING'}, written_vi: {type: 'STRING'},
          meaning_ok: {type: 'BOOLEAN'}, other_word: {type: 'BOOLEAN'}, correct: {type: 'BOOLEAN'},
          note: {type: 'STRING'}
        },
        required: ['id', 'written_en', 'written_vi', 'meaning_ok', 'other_word', 'correct']
      }},
      unclear: {type: 'ARRAY', items: {type: 'STRING'}}
    },
    required: ['written_name', 'matched_name', 'key_matches', 'items', 'unclear']
  };
}

function imagePart_(img) {
  return {inlineData: {mimeType: img.mime, data: img.b64}};
}

/** keyImages: [{mime, b64}] */
function buildKeyRequest(keyImages) {
  return {
    contents: [{role: 'user', parts: [{text: KEY_PROMPT}].concat(keyImages.map(imagePart_))}],
    generationConfig: {responseMimeType: 'application/json', responseSchema: keySchema_(), temperature: 0}
  };
}

function buildGradeRequest(keyParts, roster, photo) {
  var key = prepareKey(keyParts).map(function (p) {
    return '[' + p.part + ' - loại ' + p.kind + ']\n' + p.items.map(function (it) {
      return it.id + '  ' + it.en + ' : ' + it.vi;
    }).join('\n');
  }).join('\n\n');
  var text = GRADE_PROMPT + '\n\nĐÁP ÁN (mã mục, nội dung):\n' + key + '\n\nDANH SÁCH LỚP:\n' + roster.join(', ');
  return {
    contents: [{role: 'user', parts: [{text: text}, imagePart_(photo)]}],
    generationConfig: {responseMimeType: 'application/json', responseSchema: gradeSchema_(), temperature: 0}
  };
}

/**
 * Decide what to do with a key after a failed call.
 *  daily   - out of today's quota (or billing/model unavailable): skip until quotas reset (midnight Pacific)
 *  minute  - per-minute limit: rest for retrySec, try the next key now
 *  bad_key - key invalid/revoked: skip for today
 *  retry   - Google-side hiccup: try the next key, keep this one
 *  fatal   - the request itself is wrong: stop, other keys would fail the same way
 */
function classifyGeminiError(status, json) {
  var err = (json && json.error) || {}, text = JSON.stringify(err), details = err.details || [];
  var reason = details.map(function (d) { return d.reason || ''; }).join(' ');
  var quotaIds = [];
  details.forEach(function (d) { (d.violations || []).forEach(function (v) { quotaIds.push(v.quotaId || ''); }); });
  var retry = details.filter(function (d) { return d.retryDelay; })[0];
  var retrySec = retry ? Math.ceil(parseFloat(retry.retryDelay)) : 60;

  if (status === 429) {
    return quotaIds.some(function (q) { return /PerDay/i.test(q); })
      ? {kind: 'daily', reason: 'hết hạn mức hôm nay'}
      : {kind: 'minute', reason: 'quá số lượt mỗi phút', retrySec: retrySec};
  }
  if (status === 402) return {kind: 'daily', reason: 'hết tiền trả trước'};
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|API key expired/i.test(reason + text)) {
    return {kind: 'bad_key', reason: 'key không hợp lệ hoặc bị khóa'};
  }
  if (status === 404) return {kind: 'daily', reason: 'key không dùng được mô hình này'};
  if (status === 503) return {kind: 'retry', reason: 'Google đang quá tải (503), thường hết sau vài phút'};
  if (status >= 500) return {kind: 'retry', reason: 'Google đang lỗi (' + status + ')'};
  return {kind: 'fatal', reason: 'Gemini lỗi ' + status + ': ' + (err.message || '')};
}

/** Returns {data, inputTokens, outputTokens}. Throws a readable error if Gemini refused. */
function parseGeminiResponse(json) {
  if (json.error) throw new Error('Gemini lỗi ' + json.error.code + ': ' + json.error.message);
  var c = (json.candidates || [])[0];
  if (!c || !c.content) {
    var why = (json.promptFeedback && json.promptFeedback.blockReason) || (c && c.finishReason) || 'không có kết quả';
    throw new Error('Gemini không trả kết quả (' + why + ')');
  }
  var text = c.content.parts.map(function (p) { return p.text || ''; }).join('');
  var u = json.usageMetadata || {}, data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Gemini trả kết quả bị cắt hoặc sai định dạng (' + (c.finishReason || '?') + '), thử chấm lại ảnh này');
  }
  return {
    data: data,
    inputTokens: u.promptTokenCount || 0,
    outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)
  };
}

/**
 * Clean up the key Gemini read: merge repeated parts, drop empty items, add kind/unit/ids.
 * If the key has a numbered list, lines without a number are headings and are dropped
 * (done here, not by the prompt, because the model does not follow that rule reliably).
 */
function normalizeKey(data) {
  var byPart = {}, order = [], kinds = {};
  var anyNumbered = (data.parts || []).some(function (p) {
    return (p.items || []).some(function (it) { return it.numbered === true; });
  });
  (data.parts || []).forEach(function (p) {
    var name = PART_NAMES.indexOf(p.part) >= 0 ? p.part : 'CÔNG THỨC';
    if (!byPart[name]) { byPart[name] = []; order.push(name); kinds[name] = p.kind; }
    (p.items || []).forEach(function (it) {
      if (anyNumbered && it.numbered !== true) return;
      if (String(it.en || '').trim()) byPart[name].push({en: String(it.en).trim(), vi: String(it.vi || '').trim()});
    });
  });
  order.sort(function (a, b) { return PART_NAMES.indexOf(a) - PART_NAMES.indexOf(b); });
  return {
    topic: data.topic || '',
    parts: prepareKey(order.filter(function (n) { return byPart[n].length; })
      .map(function (n) { return {part: n, kind: kinds[n], items: byPart[n]}; }))
  };
}

/**
 * Map Gemini's grading to the key by item id (never by position or part name - the model
 * sometimes puts row numbers there) and match the name. Returns the per-photo result used by assembleSession.
 */
function normalizeGrade(data, keyParts, roster) {
  var got = {};
  (data.items || []).forEach(function (it) {
    var id = String(it.id || '').trim().replace(/^m[uụ]c\s*/i, '');
    if (id && !got[id]) got[id] = it;
  });
  var items = [];
  prepareKey(keyParts).forEach(function (p) {
    p.items.forEach(function (k) {
      var it = got[k.id] || {};
      items.push({id: k.id, written_en: String(it.written_en || '').trim(), written_vi: String(it.written_vi || '').trim(),
                  meaning_ok: !!it.meaning_ok, other_word: !!it.other_word, correct: !!it.correct, note: it.note || ''});
    });
  });
  var unclear = (data.unclear || []).slice(), prepared = prepareKey(keyParts);
  realignLines_(items, prepared, unclear);
  acceptKnownMeanings_(items, prepared);
  var written = String(data.written_name || '').trim();
  var matched = matchName(written, roster);
  // tên AI đoán chỉ nhận khi giấy có tên và có chung ít nhất một chữ (tránh "T.Vy" thành "Minh Khôi")
  if (!matched && written && roster.indexOf(data.matched_name) >= 0 && namesOverlap(written, data.matched_name)) {
    matched = data.matched_name;
  }
  var any = items.some(function (it) { return it.written_en; });
  return {
    writtenName: written,
    matchedName: matched,
    aiName: String(data.matched_name || '').trim(),  // tên AI đoán, để ghép lại khi cô sửa danh sách lớp
    keyMatches: data.key_matches !== false && (any || !items.length),
    items: items,
    unclear: unclear
  };
}

/**
 * Gemini đôi khi ghép một dòng vào nhầm mục theo nghĩa ("sister in law : con dâu" vào mục daughter-in-law).
 * Dòng nào chữ tiếng Anh trùng hẳn (sai tối đa 1 chữ cái) với một mục khác đang trống, còn với mục hiện tại
 * thì khác xa, được chuyển về đúng mục. Nghĩa của nó phải chấm lại (meaning_ok = false, để hỏi lại ở meaningChecks).
 */
function realignLines_(items, keyParts, unclear) {
  var keyById = {}, fields = ['written_en', 'written_vi', 'meaning_ok', 'other_word', 'correct', 'note'];
  keyParts.forEach(function (p) { p.items.forEach(function (k) { keyById[k.id] = k; }); });
  var fits = function (text, id) { return letterErrors(text, keyById[id].en); };
  items.forEach(function (it) {
    if (!it.written_en || fits(it.written_en, it.id) < 3) return;
    // mục đích: đang trống, hoặc đang chứa đúng dòng của mục này (hai dòng bị tráo chỗ cho nhau)
    var best = null, bestErr = 2;
    items.forEach(function (o) {
      if (o === it || (o.written_en && fits(o.written_en, it.id) > 1)) return;
      var e = fits(it.written_en, o.id);
      if (e < bestErr) { bestErr = e; best = o; }
    });
    if (!best) return;
    var mine = {}, theirs = {};
    fields.forEach(function (f) { mine[f] = it[f]; theirs[f] = best[f]; });
    fields.forEach(function (f) { best[f] = mine[f]; it[f] = theirs[f]; });
    best.meaning_ok = false;  // nghĩa chấm theo mục cũ, phải chấm lại theo mục mới
    best.moved = true;
    if (it.written_en) { it.meaning_ok = false; it.moved = true; }
    unclear.push('dòng "' + best.written_en + '" AI ghép vào mục ' + keyById[it.id].en + ', đã chuyển về mục ' +
                 keyById[best.id].en);
  });
}

var MEANING_PROMPT = [
  'Kiểm tra nghĩa tiếng Việt học sinh viết cho từng từ/cụm tiếng Anh.',
  'ok = true nếu nghĩa em viết là MỘT nghĩa đúng của từ tiếng Anh, dù khác cách dịch mẫu (cách dịch mẫu chỉ để tham khảo).',
  'ok = false nếu nghĩa thuộc từ khác hoặc hiểu sai, hoặc thiếu một chữ làm đổi nghĩa: từ ghép phải đủ,',
  '"buộc tội" (accuse) khác "buộc" (ép, trói); "chỉ trích" khác "chỉ". Xét chữ dịch chính trước, rồi mới bỏ qua phần phụ.',
  'Phần phụ như "làm gì", "ai", "vì" được bỏ hoặc viết tắt. Viết tắt: lm = làm; lmj, lmg = làm gì; j = gì; ko = không;',
  'đc = được; xl = xin lỗi; ng = người; vs = với; ae = anh em; ace = anh chị em; ce = chị em.',
  'Mẫu ghi "anh/chị/em" thì "anh em", "chị em", "ae", "ce" đều đúng (vẫn phải có phần còn lại như "sinh đôi").'
].join('\n');

/**
 * Lần đọc ảnh chấm nghĩa chưa ổn định (có lúc chê "chị em vợ" cho sister-in-law). Những mục bị chê nghĩa mà em có
 * viết nghĩa được hỏi lại bằng một câu chỉ có chữ, mô hình mạnh hơn trả lời chắc hơn nhiều.
 */
function meaningChecks(result, keyParts) {
  var keyById = {};
  prepareKey(keyParts).forEach(function (p) { p.items.forEach(function (k) { keyById[k.id] = k; }); });
  return (result.items || []).filter(function (it) {
    var k = keyById[it.id];
    return k && String(k.vi || '').trim() && it.written_en && String(it.written_vi || '').trim() && !it.meaning_ok;
  }).map(function (it) {
    var k = keyById[it.id];
    return {id: it.id, en: k.en, key: k.vi, written: it.written_vi};
  });
}

function buildMeaningRequest(checks) {
  var list = checks.map(function (c) { return c.id + '. ' + c.en + ' | mẫu: ' + c.key + ' | em viết: ' + c.written; });
  return {
    contents: [{role: 'user', parts: [{text: MEANING_PROMPT + '\n\n' + list.join('\n')}]}],
    generationConfig: {responseMimeType: 'application/json', temperature: 0, responseSchema: {
      type: 'ARRAY', items: {type: 'OBJECT', properties: {id: {type: 'STRING'}, ok: {type: 'BOOLEAN'}}, required: ['id', 'ok']}
    }}
  };
}

/** Nhận câu trả lời kiểm tra nghĩa: mục được xác nhận đúng nghĩa thì sửa meaning_ok. */
function applyMeaningChecks(result, answers) {
  var ok = {};
  (answers || []).forEach(function (a) { if (a && a.ok === true) ok[String(a.id).trim()] = true; });
  (result.items || []).forEach(function (it) {
    if (ok[it.id]) { it.meaning_ok = true; it.meaningRechecked = true; }
  });
  result.meaningCheck = 'done';
}
