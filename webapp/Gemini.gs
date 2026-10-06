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
  'BƯỚC 1 - CHÉP LẠI từng dòng học sinh viết vào lines (mỗi dòng trên giấy một phần tử), ĐÚNG TỪNG CHỮ CÁI',
  'như trên giấy, giữ nguyên dấu "=", ":", ngoặc. Đọc kỹ từng chữ cái của từ tiếng Anh, không đoán theo từ đúng',
  '(em viết "laundly", "Recyle", "lesfover" thì chép đúng như vậy).',
  'Chữ bị gạch, gạch chéo, tô đen hoặc viết đè ghi trong lines giữa ~~ ~~ ("Reduce = decrease : ~~tăn~~ giảm").',
  'Chữ viết chèn nhỏ phía trên dòng (thường có mũi tên hoặc dấu ^ chỉ chỗ chèn, hay viết thay cho chữ bị gạch bên',
  'dưới) là một phần của dòng đó: chép vào đúng chỗ chèn ("~~reuse~~ reduce : giảm", "increase : tăng").',
  'Chữ viết ở lề hoặc chỗ trống có mũi tên chỉ vào một dòng thì chép vào CUỐI dòng mũi tên chỉ tới, không phải dòng',
  'nằm ngang với nó. Ký hiệu đầu dòng chép đúng như trên giấy: "=" là "=", "-" là "-" (dòng "= big" nối tiếp dòng trên).',
  'Chữ viết tắt "lm" (làm) hay trông như "ln", "im": chép là "lm".',
  'TUYỆT ĐỐI KHÔNG tự sửa lỗi chính tả: em viết "bellow" thì chép "bellow", không phải "below".',
  'Chữ bị gạch ngang, gạch chéo hoặc tô đen là chữ em đã bỏ: KHÔNG chép, chỉ chép phần còn lại',
  '(ví dụ "bố m̶e̶ chồng/vợ" thì chép "bố chồng/vợ"). Nghĩa có chữ bị gạch hoặc tô rồi viết chữ khác cạnh đó',
  '("t̶ă̶n̶g̶ giảm") thì chỉ chép chữ sau ("giảm"). Chữ viết dở rồi viết lại ngay cạnh cũng là chữ bỏ:',
  '"S\' Sibling", "Si Sibling" thì chép "Sibling".',
  'Chỗ nào có tẩy xóa hoặc khó đọc mà ảnh hưởng tới kết quả thì ghi vào unclear (ví dụ "inside: chữ ngoài có thể bị gạch").',
  '',
  'BƯỚC 2 - GHÉP với đáp án CHỈ dựa trên lines (bỏ chữ trong ~~ ~~), THEO NỘI DUNG, KHÔNG theo thứ tự dòng.',
  'written_en chép đúng chữ cái như trong lines; KHÔNG BAO GIỜ điền chữ không có trong lines (mục em không viết thì',
  'để rỗng, không lấy chữ của đáp án). items: đúng 1 phần tử cho MỖI mã mục của',
  'đáp án (id như "1.3"). Học sinh thường viết khác thứ tự đáp án: dòng "deny + ving : phủ nhận" là mục',
  '"deny + V-ing" dù em viết ở dòng thứ mấy. Không tìm thấy dòng nào của mục đó trên ảnh thì written_en rỗng.',
  'Ghép theo CHỮ TIẾNG ANH em viết, KHÔNG theo nghĩa: dòng "sister in law : con dâu" là mục sister-in-law',
  '(nghĩa sai), không phải mục daughter-in-law. Mỗi dòng em viết chỉ ghép vào một mục.',
  'Các chữ tiếng Anh nối bằng dấu "=" DÙNG CHUNG một nghĩa, dù nghĩa đứng cuối, đứng giữa chuỗi hay chuỗi',
  'xuống dòng: "next to = Besind : bên cạnh" thì next to có written_en "next to", beside có written_en "Besind",',
  'cả hai written_vi "bên cạnh"; "waste : rác = rubbish = trash" thì waste, rubbish, trash đều có written_vi "rác".',
  'Dấu "=" cuối chuỗi không có chữ nào sau nó thì bỏ qua.',
  'Chữ tiếng Anh em viết (kể cả viết sai) KHÔNG BAO GIỜ là nghĩa tiếng Việt.',
  '',
  'BƯỚC 3 - CHẤM:',
  '- Phần loại word (từ, cụm từ, cấu trúc kèm nghĩa): written_en = phần tiếng Anh em viết (nguyên văn, bỏ nhãn',
  '  em tự thêm ở đầu dòng như số thứ tự hay "O :" của OSASCOMP), written_vi = nghĩa em viết (kể cả nghĩa trong ngoặc).',
  '  meaning_ok = true nếu nghĩa tiếng Việt đúng nghĩa của mục (không cần giống chữ đáp án; lỗi dấu, lỗi chính tả tiếng Việt',
  '  như ch/tr, s/x, l/n, d/gi không sao: "tập chung" = tập trung). Thiếu nghĩa hoặc sai nghĩa là false.',
  '  Phần nghĩa chính (chữ dịch động từ/danh từ tiếng Anh) phải đủ và đúng: "buộc" thay cho "buộc tội",',
  '  "chỉ định" thay cho "chỉ trích" là SAI. Phần phụ đi kèm như "làm gì", "ai", "vì", "điều gì" được viết tắt.',
  '  Nghĩa trong đáp án chỉ là MỘT cách dịch: nghĩa khác mà vẫn đúng với từ tiếng Anh là đúng (brother-in-law:',
  '  anh/em rể, anh/em chồng, anh/em vợ; sister-in-law: chị/em dâu, chị/em chồng, chị/em vợ). Sai là khi nghĩa',
  '  thuộc từ khác (sister-in-law : con dâu), thiếu phần chính hoặc hiểu sai từ. Nghĩa nói về một việc khác dù có',
  '  chung chữ cũng là sai: leftover : "lãng phí đồ ăn" là SAI (leftover là đồ ăn thừa, không phải việc lãng phí).',
  '  Chữ viết tắt quen dùng hiểu như chữ đầy đủ: lm (hay bị đọc thành ln) = làm; lmj, lmg, lj = làm gì; j = gì; ko, k, hk = không;',
  '  đc = được; ng = người; vs = với; xl = xin lỗi; cx = cũng; mn = mọi người; ntn = như thế nào; vd = ví dụ;',
  '  ae = anh em; ace = anh chị em; ce = chị em. Đáp án ghi "anh/chị/em" thì em viết "anh em", "chị em", "ae",',
  '  "anhem", "ce" đều đúng (vẫn phải có phần còn lại như "sinh đôi", "ruột").',
  '  KHÔNG chấm chính tả tiếng Anh - chương trình tự làm. other_word = true chỉ khi em thay hẳn bằng một từ',
  '  tiếng Anh có thật mang nghĩa khác, do hiểu sai từ (ví dụ "site" thay "side" trong outside/inside/beside).',
  '  Viết sai chữ cái mà không thành từ có thật ("Besind", "Behinh"), hoặc viết nhầm một chữ do nét chữ',
  '  ("For from" thay "far from") thì là false.',
  '- Phần loại formula (công thức, câu gián tiếp, quy tắc trọng âm): written_en = công thức em viết,',
  '  correct = true nếu PHẦN CÔNG THỨC đúng đủ thành phần, đúng thứ tự, đúng dạng động từ (nghĩa chấm riêng ở meaning_ok).',
  '  Sai một thành phần là sai. Nhưng cách viết khác mà cùng nghĩa ngữ pháp là ĐÚNG:',
  '  * tên thì thay cho dạng động từ: HTĐ = S + V(s/es), TLĐ = will + V nguyên thể, QKĐ = V2/V-ed, QKHT = had + PII',
  '    ("If S V (HTĐ), S V (TLĐ)" đúng với "If HTĐ, will/can + Vngthe");',
  '  * V = Vnt = Vngthe = V nguyên thể; PII = P2 = P3 = V-ed/V3;',
  '  * đáp án có lựa chọn "will/can", "would/could": em viết một lựa chọn, hoặc liệt kê thêm động từ khuyết thiếu cùng loại',
  '    ("would/could/should/might + V", "would/should/... + V") vẫn đúng;',
  '  * thêm "S +", "IF +", thiếu dấu phẩy giữa hai vế không sai.',
  '  Sai là khi dùng nhầm thì (QKĐ thay HTĐ), thiếu hẳn một vế, sai dạng động từ (had + V thay have + PII).',
  '  Cách viết tương đương coi là giống nhau: Ving = V-ing = doing, O = sb = somebody, sth = something; có hay không',
  '  dấu "+", dấu cách (kể cả chữ viết sát nhau như "sbof"), hoa thường đều không quan trọng; phần trong ngoặc của',
  '  đáp án như "(to sb)" không viết vẫn đúng. Mục đáp án có nghĩa thì điền written_vi và meaning_ok đúng như phần word',
  '  (cùng quy tắc nghĩa chính và chữ viết tắt); em không ghi nghĩa thì written_vi rỗng, meaning_ok = false.',
  '  Em hay ghi tên công thức ở ĐẦU DÒNG bằng ký hiệu, đó là nghĩa, chép vào written_vi: S = so sánh, viết "S²",',
  '  "S2", "s^2", "ss"; "S² =" (dấu bằng) = so sánh bằng; "S² hơn", "S² >" = so sánh hơn; "S² nhất" = so sánh nhất.',
  '  Ví dụ dòng "S² = S1 + tobe + as + adj + as + S2" thì written_vi "S² =", meaning_ok = true với mục so sánh bằng.',
  '  Đáp án có lựa chọn ("tobe/V", "adj/adv") mà em tách thành nhiều công thức (một dòng tobe + adj, một dòng V + adv)',
  '  thì vẫn là đúng nếu các dòng gộp lại đủ thành phần; lỗi chép nhỏ một chữ trong công thức ("a" thay "as") không tính.',
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
      lines: {type: 'ARRAY', items: {type: 'STRING'}},  // chép từng dòng trước khi ghép mục: đọc sát chữ hơn
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
    required: ['lines', 'written_name', 'matched_name', 'key_matches', 'items', 'unclear'],
    propertyOrdering: ['lines', 'written_name', 'matched_name', 'key_matches', 'items', 'unclear']
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
  var lines = (data.lines || []).map(function (l) { return String(l || ''); });
  dropInvented_(items, lines, prepared, unclear);
  splitArrows_(items, prepared, unclear);
  shareChainMeanings_(items, lines, prepared, unclear);
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
    unclear: unclear,
    lines: lines
  };
}

/**
 * Chữ tiếng Anh AI điền cho một mục phải có trong các dòng nó vừa chép (lines, bỏ chữ bị gạch ~~ ~~).
 * Không có mà một cụm trong lines gần giống (sai ≤ 2 chữ, chưa mục nào dùng) thì AI đã tự sửa chính tả khi điền:
 * lấy cụm trong lines. Không có cụm nào thì AI tự thêm (thường lấy chữ đáp án cho mục em không viết): bỏ đi.
 */
/**
 * "discuss -> discussion : thảo luận -> buổi thảo luận": AI ghép cả hai từ vào một mục. Tách theo mũi tên, mỗi từ về
 * mục của nó (mục đó đang trống), nghĩa ghép theo thứ tự; nghĩa được xét lại sau đó.
 */
function splitArrows_(items, keyParts, unclear) {
  var ARROW = /\s*(?:->|=>|=\)|→|⇒)\s*/;
  var keyById = {}, words = [], byId = {};
  keyParts.forEach(function (p) {
    p.items.forEach(function (k) { keyById[k.id] = k; if (p.kind === 'word') words.push(k.id); });
  });
  items.forEach(function (it) { byId[it.id] = it; });
  items.forEach(function (it) {
    if (words.indexOf(it.id) < 0 || !ARROW.test(it.written_en || '')) return;
    var ens = it.written_en.split(ARROW).filter(function (s) { return s.trim(); });
    var vis = String(it.written_vi || '').split(ARROW).filter(function (s) { return s.trim(); });
    if (ens.length < 2) return;
    var orig = it.written_en;
    var placed = ens.map(function (en, i) {
      var best = null, bestErr = 3;
      words.forEach(function (id) {
        var e = letterErrors(en, keyById[id].en);
        if (e < bestErr && (id === it.id || !byId[id].written_en)) { bestErr = e; best = id; }
      });
      var vi = vis.length === ens.length ? vis[i] : (vis.length === 1 ? vis[0] : '');  // một nghĩa chung cho cả cặp
      return best && {id: best, en: en.trim(), vi: vi.trim()};
    });
    if (placed.some(function (x) { return !x; })) return;
    var ids = placed.map(function (x) { return x.id; });
    if (ids.some(function (id, i) { return ids.indexOf(id) !== i; })) return;
    if (ids.indexOf(it.id) < 0) { it.written_en = ''; it.written_vi = ''; it.meaning_ok = false; }
    placed.forEach(function (x) {
      var t = byId[x.id];
      t.written_en = x.en; t.written_vi = x.vi;
      t.meaning_ok = false; t.correct = false;  // nghĩa xét lại (acceptKnownMeanings_, meaningChecks)
    });
    unclear.push('dòng "' + orig + '" có mũi tên, đã tách thành ' +
                 placed.map(function (x) { return '"' + x.en + '"'; }).join(', '));
  });
}

/**
 * Chuỗi từ nối bằng "=" dùng chung một nghĩa, kể cả khi chuỗi trải nhiều dòng: dòng bắt đầu bằng "=" (hoặc dòng trên
 * kết thúc bằng "=") nối tiếp dòng trên ("focus on : tập trung" / "= pay attention to :"). Mục có chữ tiếng Anh mà
 * AI để trống nghĩa thì lấy nghĩa của chuỗi; nghĩa đó vẫn được xét lại (acceptKnownMeanings_, meaningChecks).
 */
function shareChainMeanings_(items, lines, keyParts, unclear) {
  if (!lines.length) return;
  var flat = function (s) { return normLetters(stripAccents(s)); };
  var keyById = {}, isWord = {}, keyEns = [];
  keyParts.forEach(function (p) {
    p.items.forEach(function (k) { keyById[k.id] = k; isWord[k.id] = p.kind === 'word'; keyEns.push(k.en); });
  });
  var looksEnglish = function (s) {  // chữ sau ":" mà là một mục tiếng Anh của đáp án ("Focus on : pay attention to")
    return !VI_MARKS_.test(s) && keyEns.some(function (en) { return letterErrors(s, en) <= 1; });
  };
  var parse = function (g) {
    g.en = []; g.vi = [];
    g.text.split('=').forEach(function (chunk) {
      var bits = chunk.split(':');
      if (bits[0].trim()) g.en.push(bits[0].trim());
      bits.slice(1).forEach(function (b) {
        b = b.trim();
        if (!b) return;
        if (looksEnglish(b)) g.en.push(b); else g.vi.push(b);
      });
    });
  };
  var groups = [];
  lines.forEach(function (raw) {
    var l = raw.replace(/~~[^~]*~~/g, ' ').replace(/^\s*(\d+\s*[.)]|[-•+*])\s*/, '').trim();
    if (!l) return;
    var prev = groups[groups.length - 1];
    // nghĩa viết tràn xuống dòng dưới ("tập" / "trung"): dòng chỉ có chữ tiếng Việt, không có ":" hay "="
    if (prev && !/[:=]/.test(l) && !looksEnglish(l) &&
        (VI_MARKS_.test(l) || (prev.vi.length && l.split(/\s+/).length <= 2))) {
      prev.text += ' ' + l;
      parse(prev);
      return;
    }
    // nối dòng trên: dòng bắt đầu bằng "=" (không phải mũi tên "=>", "=)"), dòng trên kết thúc bằng "=", hoặc dòng trên
    // chỉ có các chữ tiếng Anh nối nhau chưa có nghĩa và dòng này có nghĩa ("Focus on = pay attention to" rồi
    // "concentrate on : tập trung")
    // hoặc dòng chỉ có một mục tiếng Anh, không nghĩa, ngay dưới dòng có nghĩa (các từ cùng nghĩa viết chồng nhau,
    // nghĩa viết giữa hai dòng: "there's no point : vô ích" / "there's no use"); nghĩa vẫn được xét lại cho mục này
    if (prev && (/^=(?![>)])/.test(l) || /=\s*$/.test(prev.text) ||
        (!prev.vi.length && prev.en.length > 1 && /:/.test(l)) ||
        (prev.vi.length && !/[:=]/.test(l) && looksEnglish(l) && !/^\s*(\d+\s*[.,)>]|[-•+*])/.test(raw)))) {
      prev.text = prev.text.replace(/\s*=\s*$/, '') + ' = ' + l.replace(/^=\s*/, '');
    } else {
      groups.push({text: l, crossed: []});
    }
    var g = groups[groups.length - 1];
    parse(g);
    // chữ tiếng Anh bị gạch trong chuỗi (em gạch rồi viết lại chỗ khác) vẫn dùng nghĩa của chuỗi
    (raw.match(/~~[^~]*~~/g) || []).forEach(function (x) {
      x = x.replace(/~/g, '').trim();
      if (looksEnglish(x)) g.crossed.push(x);
    });
  });
  items.forEach(function (it) {
    if (!isWord[it.id] || !it.written_en) return;
    // "Focus on : pay attention to": AI lấy chữ tiếng Anh cùng chuỗi làm nghĩa, coi như chưa có nghĩa
    if (looksEnglish(String(it.written_vi || '').trim())) { it.written_vi = ''; it.meaning_ok = false; }
    if (String(it.written_vi || '').trim()) return;
    var w = flat(it.written_en);
    var g = groups.filter(function (x) {
      return x.vi.length && (x.en.length > 1 && x.en.some(function (e) { return flat(e) === w; }) ||
        x.crossed.some(function (e) { return flat(e) === w; }));
    })[0];
    if (!g) return;
    it.written_vi = g.vi.join(', ');
    it.meaning_ok = false;  // xét lại: acceptKnownMeanings_ nhận ngay nếu khớp đáp án, không thì hỏi lại nghĩa
    unclear.push('mục ' + keyById[it.id].en + ': lấy nghĩa chung của chuỗi "=" ("' + it.written_vi + '")');
  });
}

var VI_MARKS_ = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

function dropInvented_(items, lines, keyParts, unclear) {
  if (!lines.length) return;
  var flat = function (s) { return normLetters(stripAccents(s)); };
  var clean = lines.map(function (l) { return l.replace(/~~[^~]*~~/g, ' '); });
  var text = flat(clean.join(' '));
  var segs = [];
  clean.forEach(function (l) {
    l.split(/[=:;,]/).forEach(function (s) { if (/[a-z]/i.test(s) && !VI_MARKS_.test(s)) segs.push(s.replace(/^\s*\d+\s*[.)]\s*/, '').trim()); });
  });
  var keyById = {}, isWord = {};
  keyParts.forEach(function (p) { p.items.forEach(function (k) { keyById[k.id] = k; isWord[k.id] = p.kind === 'word'; }); });
  items.forEach(function (it) {
    var w = flat(it.written_en);
    // công thức hay viết nhiều tầng (tobe trên, V dưới), chép thành dòng không khớp từng chữ: chỉ đối chiếu phần từ
    if (!w || !isWord[it.id]) return;
    if (VI_MARKS_.test(it.written_en)) {  // "Recrease = giảm": AI lấy nghĩa tiếng Việt làm chữ tiếng Anh của mục khác
      unclear.push('AI ghi nghĩa "' + it.written_en + '" vào chỗ chữ tiếng Anh của mục ' + (keyById[it.id] || {}).en + ', đã bỏ');
      it.written_en = ''; it.written_vi = ''; it.meaning_ok = false; it.correct = false;
      return;
    }
    // "waste (n) / waste (v)": AI gộp hai dòng vào một mục, mỗi phần có trong bài là được
    if (it.written_en.split(/[\/=]/).every(function (s) { return !flat(s) || text.indexOf(flat(s)) >= 0; })) return;
    var used = items.map(function (o) { return o !== it && flat(o.written_en); });
    var best = null, bestErr = 3;
    segs.forEach(function (s) {
      if (used.indexOf(flat(s)) >= 0) return;
      var e = editDistance_(flat(s), w);
      if (e < bestErr) { bestErr = e; best = s; }
    });
    var en = (keyById[it.id] || {}).en;
    if (best) {
      unclear.push('mục ' + en + ': AI ghi "' + it.written_en + '", trong bài em viết "' + best + '"');
      it.written_en = best;
      return;
    }
    unclear.push('AI ghi "' + it.written_en + '" cho mục ' + en + ' nhưng không thấy chữ này trong bài, đã bỏ');
    it.written_en = ''; it.written_vi = ''; it.meaning_ok = false; it.correct = false;
  });
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
  'Lỗi chính tả tiếng Việt (ch/tr, s/x, l/n, d/gi, thiếu dấu: "tập chung" = tập trung) không tính là sai nghĩa.',
  'Phần phụ như "làm gì", "ai", "vì" được bỏ hoặc viết tắt. Viết tắt: lm (hay bị đọc thành ln) = làm; lmj, lmg = làm gì; j = gì; ko = không;',
  'đc = được; xl = xin lỗi; ng = người; vs = với; ae = anh em; ace = anh chị em; ce = chị em;',
  'S², S2, s^2, ss = so sánh ("S² =" = so sánh bằng, "S² hơn" = so sánh hơn, "S² nhất" = so sánh nhất).',
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

/**
 * Chữ bị gạch mà AI không thấy ("community ~~service~~ activities" chép thành "community service activities"):
 * mục loại word mà bỏ đúng một chữ thì khớp đáp án (sai tối đa 1 chữ cái), còn giữ nguyên thì sai từ 2 chữ cái.
 * Những mục này được hỏi lại riêng kèm ảnh: chữ đó trên giấy có bị gạch không (hỏi thẳng một chữ thì AI nhìn kỹ hơn).
 */
function crossedChecks(result, keyParts) {
  var keyById = {};
  prepareKey(keyParts).forEach(function (p) {
    if (p.kind === 'word') p.items.forEach(function (k) { keyById[k.id] = k; });
  });
  var out = [];
  (result.items || []).forEach(function (it) {
    var k = keyById[it.id], w = String(it.written_en || '').trim();
    if (!k || !w || letterErrors(w, k.en) < 2) return;
    var toks = w.replace(/[:=]/g, ' ').split(/\s+/).filter(String), best = null, bestErr = 2;
    toks.forEach(function (t, i) {
      if (normLetters(t).length < 2) return;
      var rest = toks.slice(0, i).concat(toks.slice(i + 1)).join(' '), e = letterErrors(rest, k.en);
      if (e < bestErr) { bestErr = e; best = {id: it.id, line: w, word: t, rest: rest, vi: String(it.written_vi || '')}; }
    });
    if (best) out.push(best);
  });
  return out;
}

var CROSSED_PROMPT = [
  'Ảnh là bài làm viết tay của học sinh. Mỗi mục dưới đây là một dòng em viết và một chữ trong dòng đó.',
  'Tìm dòng đó trên ảnh, nhìn thật kỹ chữ được hỏi: chữ đó có bị gạch ngang, gạch chéo, tô đen, khoanh xóa hay viết đè',
  '(tức là em đã bỏ chữ đó) không? crossed = true nếu chữ đó bị gạch/xóa, false nếu chữ đó vẫn là một phần bài làm.',
  'Trước khi trả lời, ghi vào look nét bút đi qua chữ đó thế nào (có đường kẻ ngang/chéo xuyên qua chữ, nét chồng lên',
  'chữ, hay chữ sạch như các chữ khác cùng dòng). Một đường kẻ ngang mảnh xuyên qua giữa chữ cũng là gạch.',
  'Cùng một chữ có thể xuất hiện ở nhiều dòng: chỉ xét đúng dòng được tả (có cả nghĩa em viết ở dòng đó).',
  'Chỉ trả lời theo những gì thấy trên ảnh.'
].join('\n');

function buildCrossedRequest(checks, photo) {
  var list = checks.map(function (c) {
    return 'mã ' + c.id + ': dòng "' + c.line + (c.vi ? ' : ' + c.vi : '') + '" - chữ "' + c.word + '"';
  });
  return {
    contents: [{role: 'user', parts: [{text: CROSSED_PROMPT + '\n\n' + list.join('\n')}, imagePart_(photo)]}],
    generationConfig: {responseMimeType: 'application/json', temperature: 0, responseSchema: {
      type: 'ARRAY', items: {type: 'OBJECT',
        properties: {id: {type: 'STRING'}, look: {type: 'STRING'}, crossed: {type: 'BOOLEAN'}},
        required: ['id', 'look', 'crossed'], propertyOrdering: ['id', 'look', 'crossed']}
    }}
  };
}

/** Chữ được xác nhận bị gạch thì bỏ khỏi chữ em viết (chính tả và nghĩa chấm lại theo phần còn lại). */
function applyCrossedChecks(result, checks, answers) {
  var crossed = {};
  (answers || []).forEach(function (a, i) {
    if (!a || a.crossed !== true) return;
    var id = (/(\d+\.\d+)/.exec(String(a.id)) || [])[1];  // AI có khi chép cả dòng vào id
    crossed[id && checks.some(function (c) { return c.id === id; }) ? id : (checks[i] || {}).id] = true;
  });
  (checks || []).forEach(function (c) {
    if (!crossed[c.id]) return;
    (result.items || []).forEach(function (it) {
      if (it.id !== c.id) return;
      it.written_en = c.rest;
      (result.unclear = result.unclear || []).push('dòng "' + c.line + '": chữ "' + c.word + '" bị gạch, đã bỏ');
    });
  });
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
