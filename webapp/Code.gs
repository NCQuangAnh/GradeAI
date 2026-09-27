/**
 * Web app chấm bài - server side (Google Apps Script).
 * Logic chấm ở Grading.gs, lời dặn Gemini ở Gemini.gs, giao diện ở Index.html.
 * Cài đặt trong Project Settings > Script Properties (không để trong code vì repo công khai):
 *   ALLOWED_EMAILS   = email được dùng web, cách nhau bằng dấu phẩy (sửa lúc nào cũng được, có hiệu lực ngay)
 *   GEMINI_FREE_KEYS = các key miễn phí, cách nhau bằng dấu phẩy (dùng trước)
 *   GEMINI_API_KEY   = key trả phí (dùng khi các key miễn phí hết hạn mức)
 */

var CONFIG = {
  ROOT_FOLDER_ID: '1x-tIEoZAp5RdGpA_MCenUJ1iZXUxwGbB',       // folder gốc chứa các folder lớp (chế độ Bị hạn chế)
  OLD_SHEET_ID: '1ecvzosXzZonldGXlsd1TI_Ux1TnbpF_7ZV6lvkqPgNk',  // "Lưu chấm bài tại đây" - chỉ để lấy danh sách lớp lần đầu
  MODEL: 'gemini-3.1-flash-lite',
  PRICE_USD_PER_M: {input: 0.25, output: 1.50},  // giá Gemini 3.1 Flash-Lite, xem ngày 27/09/2026
  SHEET_PREFIX: 'Chấm bài',
  IMAGE_NAME: 'cham_bai.png',
  // Luật chép phạt. min_wrong: sai từ bao nhiêu mục trở lên. {total} = tổng số mục.
  PENALTY: {
    'default': {
      counted_columns: ['TỪ VỰNG', 'CÔNG THỨC', 'CẤU TRÚC', 'CÂU GIÁN TIẾP'],
      levels: [
        {min_wrong: 2, penalty: 'từ viết sai x10 lần'},
        {min_wrong: 5, penalty: 'từ mới x15 lần'}
      ],
      separate_columns: {
        'QUY TẮC TRỌNG ÂM': [{min_wrong: 3, penalty: 'quy tắc trọng âm x7 lần'}]
      }
    },
    classes: {
      'TA8.1': {levels: [
        {min_wrong: 2, penalty: 'từ viết sai x10 lần'},
        {min_wrong: 5, penalty: 'toàn bộ x10 lần'}
      ]}
    }
  }
};

// ---------- truy cập ----------

/** Email được phép dùng web, lấy từ Script Properties ALLOWED_EMAILS (chưa cài thì không ai vào được). */
function allowedEmails_() {
  return String(PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .toLowerCase().split(/[\s,;]+/).filter(String);
}

function doGet() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (allowedEmails_().indexOf(email) < 0) {
    return HtmlService.createHtmlOutput(
      '<p style="font:16px sans-serif;padding:24px">Tài khoản <b>' + (email || '(không rõ)') +
      '</b> chưa được phép dùng web này. Hãy đăng nhập bằng tài khoản đã được cô cho phép' +
      ' (danh sách ở Script Properties > ALLOWED_EMAILS).</p>');
  }
  var t = HtmlService.createTemplateFromFile('Index');
  t.email = email;
  // *-web-app-capable: thêm ra màn hình chính thì mở như ứng dụng riêng. Trên iPhone, ứng dụng đó có
  // đăng nhập riêng (tách khỏi Safari), nên chỉ cần đăng nhập 1 tài khoản dùng web trong đó.
  return t.evaluate()
    .setTitle('Chấm bài')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

function requireUser_() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (allowedEmails_().indexOf(email) < 0) {
    throw new Error('Tài khoản ' + (email || '(không rõ)') + ' không có quyền dùng web này.');
  }
  return email;
}

// ---------- folder lớp / buổi ----------

/** Folder gốc; báo lỗi dễ hiểu khi tài khoản đang dùng chưa được chia sẻ folder. */
function rootFolder_() {
  try {
    return DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  } catch (e) {
    throw new Error('Tài khoản ' + Session.getActiveUser().getEmail() + ' chưa được chia sẻ folder chấm bài ' +
      '(hoặc ROOT_FOLDER_ID trong Code.gs sai). Nhờ chủ folder chia sẻ quyền Người chỉnh sửa cho tài khoản này.');
  }
}

function listClasses() {
  requireUser_();
  var out = [], it = rootFolder_().searchFolders("trashed = false");
  while (it.hasNext()) { var f = it.next(); out.push({id: f.getId(), name: f.getName()}); }
  return out.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi', {numeric: true}); });
}

/** File trong folder, bỏ qua file đã vào Thùng rác (getFiles() của Drive có thể trả cả file trong Thùng rác). */
function liveFiles_(folder, extraQuery) {
  return folder.searchFiles('trashed = false' + (extraQuery ? ' and ' + extraQuery : ''));
}

function fileByName_(folder, name) {
  var it = liveFiles_(folder, 'title = "' + name + '"');
  return it.hasNext() ? it.next() : null;
}

function isPhoto_(file) {
  var n = file.getName().toLowerCase();
  return file.getMimeType().indexOf('image/') === 0 && n.indexOf('key') !== 0 && n.indexOf('cham_bai') !== 0;
}

function isKey_(file) {
  return file.getMimeType().indexOf('image/') === 0 && file.getName().toLowerCase().indexOf('key') === 0;
}

function findSheet_(folder) {
  var it = liveFiles_(folder, 'mimeType = "' + MimeType.GOOGLE_SHEETS + '"');
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(CONFIG.SHEET_PREFIX) === 0) return f;
  }
  return null;
}

var DETAILED_SESSIONS = 20;  // chỉ đếm ảnh cho 20 buổi gần nhất để danh sách mở nhanh

function listSessions(classId) {
  requireUser_();
  var year = new Date().getFullYear(), folders = [];
  var it = DriveApp.getFolderById(classId).searchFolders("trashed = false");
  while (it.hasNext()) {
    var f = it.next(), date = parseSessionDate(f.getName(), year);
    folders.push({folder: f, date: date, sortKey: date ? date.sortKey : 0});
  }
  folders.sort(function (a, b) { return b.sortKey - a.sortKey; });
  return folders.map(function (x, i) {
    var f = x.folder, s = {id: f.getId(), name: f.getName(), label: x.date ? x.date.label : f.getName(),
                           sortKey: x.sortKey, photos: 0, hasKey: false, sheetUrl: ''};
    if (i >= DETAILED_SESSIONS) return s;
    var files = liveFiles_(f);
    while (files.hasNext()) {
      var file = files.next();
      if (isKey_(file)) s.hasKey = true; else if (isPhoto_(file)) s.photos++;
    }
    var sheet = findSheet_(f);
    s.sheetUrl = sheet ? sheet.getUrl() : '';
    return s;
  });
}

/** dateText: DD/MM/YY. Returns the new (or already existing) session. */
function createSession(classId, dateText) {
  requireUser_();
  var m = String(dateText).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) throw new Error('Ngày phải có dạng DD/MM/YY, ví dụ 27/09/26');
  var date = parseSessionDate(dateText, 2000);
  var existing = listSessions(classId).filter(function (s) { return s.sortKey === date.sortKey; })[0];
  if (existing) return {session: existing, created: false};
  var folder = DriveApp.getFolderById(classId).createFolder('NGÀY ' + date.label);
  return {session: {id: folder.getId(), name: folder.getName(), label: date.label, sortKey: date.sortKey,
                    photos: 0, hasKey: false, sheetUrl: ''}, created: true};
}

/**
 * kind: 'key' hoặc 'photo'. b64: ảnh đã được thu nhỏ trên điện thoại.
 * replaceKey: true = xóa các trang đáp án cũ trước (tải lại đáp án), false = thêm một trang đáp án.
 */
/**
 * takenAt: lúc cô chụp/chọn ảnh (ms, từ điện thoại). Tên file theo thời điểm này để thứ tự ảnh đúng thứ tự chụp
 * (mặt sau không tên được ghép với ảnh ngay trước), dù ảnh nào tải lên xong trước.
 */
function uploadImage(sessionId, b64, mime, kind, replaceKey, takenAt) {
  requireUser_();
  var folder = DriveApp.getFolderById(sessionId);
  var ext = mime === 'image/png' ? 'png' : (mime.indexOf('hei') >= 0 ? 'heic' : 'jpg');
  var d = takenAt ? new Date(Number(takenAt)) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  var stamp = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
    '_' + ('00' + d.getMilliseconds()).slice(-3);
  if (kind === 'key' && replaceKey) keyFiles_(folder).forEach(function (f) { f.setTrashed(true); });
  var name = (kind === 'key' ? 'key_' : 'bai_') + stamp + '.' + ext;
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, name));
  return {id: file.getId(), name: name, url: file.getUrl()};
}

// ---------- xem / xóa ảnh trong buổi ----------

/** Ảnh bài và ảnh đáp án của buổi, kèm đã chấm hay chưa. */
function listFiles(sessionId) {
  requireUser_();
  var folder = DriveApp.getFolderById(sessionId), results = loadState_(folder).results;
  var photos = [], keys = [], files = liveFiles_(folder);
  while (files.hasNext()) {
    var f = files.next(), item = {id: f.getId(), name: f.getName(), url: f.getUrl()};
    if (isKey_(f)) { item.kind = 'key'; keys.push(item); }
    else if (isPhoto_(f)) { item.kind = 'photo'; item.graded = !!results[item.id]; photos.push(item); }
  }
  var byName = function (a, b) { return a.name.localeCompare(b.name); };
  return keys.sort(byName).concat(photos.sort(byName));
}

/** Ảnh thu nhỏ (Drive tự tạo, cả với HEIC). Có thể null nếu Drive chưa tạo xong. */
function getThumbs(fileIds) {
  requireUser_();
  var cache = CacheService.getScriptCache();
  return fileIds.map(function (id) {
    var hit = cache.get('th:' + id);
    if (hit) return {id: id, src: hit};
    var src = '';
    try {
      var blob = DriveApp.getFileById(id).getThumbnail();
      if (blob) src = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) { src = ''; }
    if (src && src.length < 95000) cache.put('th:' + id, src, 21600);
    return {id: id, src: src};
  });
}

/** Ảnh đầy đủ để xem to. HEIC chỉ hiện được trên iPhone/Safari; máy khác dùng ảnh thu nhỏ. */
function getImage(fileId) {
  requireUser_();
  var file = DriveApp.getFileById(fileId);
  if (file.getSize() > 15 * 1024 * 1024) throw new Error('Ảnh quá lớn để xem trên web, hãy mở trong Drive.');
  var blob = file.getBlob();
  return {src: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()),
          mime: blob.getContentType()};
}

/**
 * Chuyển ảnh chụp nhầm vào Thùng rác Drive (khôi phục được trong 30 ngày).
 * Ảnh đã chấm thì bỏ kết quả của ảnh đó và lập lại bảng chấm.
 */
function deleteFile(sessionId, fileId) {
  requireUser_();
  var folder = DriveApp.getFolderById(sessionId), file = DriveApp.getFileById(fileId);
  var inFolder = false, parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === sessionId) inFolder = true;
  if (!inFolder || !(isPhoto_(file) || isKey_(file))) throw new Error('Chỉ xóa được ảnh bài hoặc ảnh đáp án của buổi này.');
  file.setTrashed(true);
  var hadResult = false, hasKey = false;
  updateState_(folder, function (s) {
    hadResult = !!s.results[fileId];
    hasKey = !!s.key;
    delete s.results[fileId];
    s.ignored = s.ignored.filter(function (id) { return id !== fileId; });
  });
  if (hadResult && hasKey) buildTable(sessionId);  // bảng chấm bỏ ảnh này, dòng của em đó được chấm lại
  return {rebuilt: hadResult && hasKey};
}

function keyFiles_(folder) {
  var out = [], files = liveFiles_(folder);
  while (files.hasNext()) { var f = files.next(); if (isKey_(f)) out.push(f); }
  return out.sort(function (a, b) { return a.getName().localeCompare(b.getName()); });
}

// ---------- danh sách lớp ----------

var ROSTER_FILE = 'danh_sach_lop.json';

/**
 * Tên học sinh: ưu tiên danh sách cô tự sửa (danh_sach_lop.json trong folder lớp); chưa có thì lấy từ
 * file chấm của buổi gần nhất (theo ngày buổi); lớp chưa có buổi nào thì lấy từ file Sheet cũ.
 * Lưu tạm 10 phút cho nhanh; xuất file chấm mới hoặc sửa danh sách thì xóa bản tạm.
 */
function getRoster_(classFolder) {
  var cache = CacheService.getScriptCache(), cacheKey = 'roster:' + classFolder.getId();
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  var saved = savedRoster_(classFolder);
  if (saved) {
    cache.put(cacheKey, JSON.stringify(saved), 600);
    return saved;
  }
  var year = new Date().getFullYear(), best = null, bestKey = -1, sub = classFolder.searchFolders("trashed = false");
  while (sub.hasNext()) {
    var folder = sub.next(), d = parseSessionDate(folder.getName(), year), key = d ? d.sortKey : 0;
    if (key <= bestKey) continue;
    var s = findSheet_(folder);
    if (s) { best = s; bestKey = key; }
  }
  var names = [];
  if (best) {
    names = SpreadsheetApp.openById(best.getId()).getSheets()[0].getRange('A3:A').getValues()
      .map(function (r) { return String(r[0]).trim(); }).filter(String);
  }
  if (!names.length) names = rosterFromOldSheet_(classFolder.getName());
  cache.put(cacheKey, JSON.stringify(names), 600);
  return names;
}

function savedRoster_(classFolder) {
  var f = fileByName_(classFolder, ROSTER_FILE);
  if (!f) return null;
  try {
    var names = JSON.parse(f.getBlob().getDataAsString('UTF-8')).names;
    return names && names.length ? names : null;
  } catch (e) {
    return null;
  }
}

/** Danh sách lớp để cô sửa trên web. saved = true nếu đang dùng danh sách cô đã lưu. */
function getClassRoster(classId) {
  requireUser_();
  var folder = DriveApp.getFolderById(classId);
  return {names: getRoster_(folder), saved: !!savedRoster_(folder)};
}

/** Lưu danh sách lớp (mỗi phần tử một tên, bỏ trùng và dòng trống). */
function saveClassRoster(classId, names) {
  requireUser_();
  var folder = DriveApp.getFolderById(classId), seen = {}, clean = [];
  (names || []).forEach(function (n) {
    n = String(n || '').replace(/\s+/g, ' ').trim();
    if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = true; clean.push(n); }
  });
  if (!clean.length) throw new Error('Danh sách lớp trống.');
  var text = JSON.stringify({names: clean, updatedAt: new Date().toISOString()}, null, 1);
  var f = fileByName_(folder, ROSTER_FILE);
  if (f) f.setContent(text);
  else folder.createFile(ROSTER_FILE, text, MimeType.PLAIN_TEXT);
  CacheService.getScriptCache().remove('roster:' + classId);
  return clean;
}

function rosterFromOldSheet_(className) {
  var code = className.toUpperCase().replace(/^TA/, '');
  var ss = SpreadsheetApp.openById(CONFIG.OLD_SHEET_ID);
  var sheet = ss.getSheets().filter(function (sh) {
    return sh.getName().toLowerCase().replace('tiếng anh', '').trim() === code.toLowerCase();
  })[0];
  if (!sheet) return [];
  var seen = {}, names = [];
  sheet.getRange('A1:A' + Math.max(1, sheet.getLastRow())).getValues().forEach(function (r) {
    var v = r[0];
    if (typeof v !== 'string') return;
    v = v.trim();
    if (v && !seen[v]) { seen[v] = true; names.push(v); }
  });
  return names;
}

function getSessionInfo(sessionId) {
  requireUser_();
  var folder = DriveApp.getFolderById(sessionId), classFolder = folder.getParents().next();
  var photos = [], keys = [], files = liveFiles_(folder);
  while (files.hasNext()) {
    var f = files.next();
    if (isKey_(f)) keys.push({id: f.getId(), name: f.getName()});
    else if (isPhoto_(f)) photos.push({id: f.getId(), name: f.getName(), url: f.getUrl()});
  }
  photos.sort(function (a, b) { return a.name.localeCompare(b.name); });
  keys.sort(function (a, b) { return a.name.localeCompare(b.name); });
  var sheet = findSheet_(folder), date = parseSessionDate(folder.getName(), new Date().getFullYear());
  return {id: sessionId, name: folder.getName(), label: date ? date.label : folder.getName(),
          className: classFolder.getName(), photos: photos, keys: keys,
          roster: getRoster_(classFolder), sheetUrl: sheet ? sheet.getUrl() : '',
          state: loadState_(folder)};
}

// ---------- kết quả đã chấm của buổi (lưu trong folder buổi, dùng chung cho mọi máy) ----------

var STATE_FILE = 'ket_qua_cham.json';

/** {key, keyFileIds, results: {fileId: kết quả từng ảnh}, nameOverrides, ignored, table, exportedAt} */
function loadState_(folder) {
  var file = fileByName_(folder, STATE_FILE);
  if (!file) return {results: {}, nameOverrides: {}, ignored: []};
  var s = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  s.results = s.results || {}; s.nameOverrides = s.nameOverrides || {}; s.ignored = s.ignored || [];
  return s;
}

/** Đọc - sửa - ghi có khóa, để 2 người chấm cùng lúc không ghi đè nhau. */
function updateState_(folder, change) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var state = loadState_(folder);
    change(state);
    var json = JSON.stringify(state), file = fileByName_(folder, STATE_FILE);
    if (file) file.setContent(json);
    else folder.createFile(STATE_FILE, json, 'application/json');
    return state;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Gemini ----------

/**
 * Thứ tự dùng key: các key miễn phí (GEMINI_FREE_KEYS, cách nhau bằng dấu phẩy) trước,
 * key trả phí (GEMINI_API_KEY) sau cùng. Key hết hạn mức ngày được bỏ qua đến khi Google reset
 * (0h giờ Thái Bình Dương, khoảng 14-15h giờ Việt Nam).
 */
function geminiKeys_() {
  var props = PropertiesService.getScriptProperties();
  var free = String(props.getProperty('GEMINI_FREE_KEYS') || '').split(/[\s,]+/).filter(String);
  var keys = free.map(function (k, i) { return {key: k, label: 'miễn phí #' + (i + 1), paid: false}; });
  var paid = props.getProperty('GEMINI_API_KEY');
  if (paid) keys.push({key: paid, label: 'trả phí', paid: true});
  if (!keys.length) throw new Error('Chưa cài GEMINI_FREE_KEYS hoặc GEMINI_API_KEY trong Script Properties.');
  return keys;
}

function keyId_(key) { return key.slice(-6); }  // lưu trạng thái theo đuôi key, không lưu cả key
function pacificDay_() { return Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd'); }

function loadKeyState_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('KEY_STATE') || '{}'); }
  catch (e) { return {}; }
}

function saveKeyState_(state) {
  PropertiesService.getScriptProperties().setProperty('KEY_STATE', JSON.stringify(state));
}

function keyResting_(st, today, now) {
  return st && ((st.day && st.day === today) || (st.until && st.until > now));
}

function callGemini_(body) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.MODEL + ':generateContent';
  var keys = geminiKeys_(), state = loadKeyState_(), today = pacificDay_(), problems = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], id = keyId_(k.key);
    if (keyResting_(state[id], today, Date.now())) continue;
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: {'x-goog-api-key': k.key}, muteHttpExceptions: true
    });
    var code = res.getResponseCode(), json;
    try { json = JSON.parse(res.getContentText()); } catch (e) { json = {}; }
    if (code === 200) {
      var parsed = parseGeminiResponse(json);
      parsed.keyLabel = k.label;
      parsed.paid = k.paid;
      parsed.costUsd = k.paid ? parsed.inputTokens * CONFIG.PRICE_USD_PER_M.input / 1e6 +
        parsed.outputTokens * CONFIG.PRICE_USD_PER_M.output / 1e6 : 0;
      return parsed;
    }
    var c = classifyGeminiError(code, json);
    if (c.kind === 'fatal') throw new Error(c.reason);
    if (c.kind === 'daily' || c.kind === 'bad_key') state[id] = {day: today, reason: c.reason, label: k.label};
    if (c.kind === 'minute') state[id] = {until: Date.now() + c.retrySec * 1000, reason: c.reason, label: k.label};
    if (c.kind !== 'retry') saveKeyState_(state);
    problems.push('key ' + k.label + ': ' + c.reason);
  }
  throw new Error('Không còn key nào dùng được lúc này. ' +
    (problems.length ? problems.join('; ') : 'Tất cả key đang nghỉ hoặc hết hạn mức hôm nay.'));
}

/** Trạng thái các key cho giao diện (không trả về key). */
function keyStatus() {
  requireUser_();
  var state = loadKeyState_(), today = pacificDay_(), now = Date.now();
  return geminiKeys_().map(function (k) {
    var st = state[keyId_(k.key)];
    var resting = keyResting_(st, today, now);
    return {label: k.label, paid: k.paid, ok: !resting,
            note: !resting ? 'sẵn sàng' : (st.day ? st.reason + ' (mở lại khoảng 14-15h)' :
                  st.reason + ' (nghỉ ' + Math.ceil((st.until - now) / 1000) + ' giây)')};
  });
}

function imageOf_(fileId) {
  var blob = DriveApp.getFileById(fileId).getBlob();
  return {mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes())};
}

function readKey(sessionId) {
  requireUser_();
  var keys = keyFiles_(DriveApp.getFolderById(sessionId));
  if (!keys.length) throw new Error('Buổi này chưa có ảnh đáp án (key). Hãy tải key lên trước.');
  var r = callGemini_(buildKeyRequest(keys.map(function (k) { return imageOf_(k.getId()); })));
  var key = normalizeKey(r.data);
  key.costUsd = r.costUsd;
  key.paid = r.paid;
  key.keyLabel = r.keyLabel;
  return key;
}

/** Cô xác nhận đáp án. restart = true: đáp án mới, xóa kết quả cũ để chấm lại tất cả. */
function saveKey(sessionId, key, restart) {
  requireUser_();
  var folder = DriveApp.getFolderById(sessionId);
  var keyIds = keyFiles_(folder).map(function (f) { return f.getId(); });
  var parts = prepareKey(key.parts);
  var roster = restart ? getRoster_(folder.getParents().next()) : [];
  updateState_(folder, function (s) {
    s.key = {topic: key.topic, parts: parts};
    s.keyFileIds = keyIds;
    if (restart) {
      s.results = {};
      s.table = null;
      // chấm lại từ đầu: bỏ các tên tạm cô đặt cho ảnh (không có trong danh sách lớp), giữ tên thật
      Object.keys(s.nameOverrides).forEach(function (id) {
        if (roster.indexOf(s.nameOverrides[id]) < 0) delete s.nameOverrides[id];
      });
    }
  });
  return {topic: key.topic, parts: parts};
}

/** Chấm một ảnh và lưu kết quả ngay vào folder buổi. */
function gradePhoto(sessionId, fileId, keyParts, roster) {
  requireUser_();
  var file = DriveApp.getFileById(fileId);
  keyParts = prepareKey(keyParts);
  var r = callGemini_(buildGradeRequest(keyParts, roster, imageOf_(fileId)));
  var out = normalizeGrade(r.data, keyParts, roster);
  out.fileId = fileId;
  out.fileName = file.getName();
  out.url = file.getUrl();
  updateState_(DriveApp.getFolderById(sessionId), function (s) { s.results[fileId] = out; });
  return {fileId: fileId, keyMatches: out.keyMatches, costUsd: r.costUsd, paid: r.paid, keyLabel: r.keyLabel};
}

/** Lập bảng từ tất cả ảnh đã chấm, giữ lại các dòng cô đã duyệt ở lần trước. */
function buildTable(sessionId) {
  requireUser_();
  var folder = DriveApp.getFolderById(sessionId), classFolder = folder.getParents().next();
  var roster = getRoster_(classFolder), state = loadState_(folder);
  if (!state.key) throw new Error('Chưa có đáp án đã xác nhận cho buổi này.');
  // ảnh đã bị xóa khỏi folder thì bỏ kết quả của ảnh đó
  var present = {}, files = liveFiles_(folder);
  while (files.hasNext()) present[files.next().getId()] = true;
  Object.keys(state.results).forEach(function (id) { if (!present[id]) delete state.results[id]; });

  var t = assembleSession(state.key.parts, roster,
    resultsForTable(state.results, state.nameOverrides, state.ignored), classFolder.getName(), CONFIG.PENALTY);
  t.title = t.columns.indexOf(VOCAB) >= 0 ? VOCAB : state.key.parts.map(function (p) { return p.part; }).join(' + ');
  t.rows.forEach(function (r) { r.notes = r.notes.join('\n'); });
  var merged = mergeTables(state.table, t);
  updateState_(folder, function (s) {
    Object.keys(s.results).forEach(function (id) { if (!present[id]) delete s.results[id]; });
    s.table = merged;
    s.tableUpdatedAt = Date.now();
  });
  return merged;
}

/** Lưu bảng cô đang sửa (tự động khi gõ). ignoredIds: ảnh của các dòng cô đã xóa. */
function saveTable(sessionId, table, ignoredIds) {
  requireUser_();
  updateState_(DriveApp.getFolderById(sessionId), function (s) {
    s.table = table;
    s.tableUpdatedAt = Date.now();
    var o = overridesFromTable(table);
    Object.keys(o).forEach(function (id) { s.nameOverrides[id] = o[id]; });
    (ignoredIds || []).forEach(function (id) { if (s.ignored.indexOf(id) < 0) s.ignored.push(id); });
  });
  return true;
}

// ---------- xuất kết quả ----------

/**
 * table: {title, columns, rows: [{name, values: {col: text}, notes: text, photos}]} - bảng cô đã duyệt.
 * pngB64: ảnh bảng chấm do trình duyệt vẽ. File Sheet cũ được ghi đè, ảnh bảng chấm cũ bị xóa.
 */
function exportSession(sessionId, table, pngB64, ignoredIds) {
  requireUser_();
  saveTable(sessionId, table, ignoredIds);
  var folder = DriveApp.getFolderById(sessionId), classFolder = folder.getParents().next();
  var date = parseSessionDate(folder.getName(), new Date().getFullYear());
  var label = date ? date.label : folder.getName();
  var name = CONFIG.SHEET_PREFIX + ' ' + classFolder.getName() + ' - ' + label;

  var file = findSheet_(folder), ss;
  if (file) {
    ss = SpreadsheetApp.openById(file.getId());
    ss.rename(name);
  } else {
    ss = SpreadsheetApp.create(name);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
  }
  writeSheet_(ss.getSheets()[0], table, label);

  var old = liveFiles_(folder, 'title = "' + CONFIG.IMAGE_NAME + '"');
  while (old.hasNext()) old.next().setTrashed(true);
  var img = folder.createFile(Utilities.newBlob(Utilities.base64Decode(pngB64), 'image/png', CONFIG.IMAGE_NAME));
  var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm dd/MM/yyyy');
  updateState_(folder, function (s) { s.exportedAt = when; s.exportedAtMs = Date.now(); });
  CacheService.getScriptCache().remove('roster:' + classFolder.getId());  // danh sách lớp có thể vừa đổi
  return {sheetUrl: ss.getUrl(), imageUrl: img.getUrl(), exportedAt: when, exportedAtMs: Date.now()};
}

function writeSheet_(sheet, table, label) {
  var cols = table.columns, width = cols.length + 2;
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();  // xuất lại: gỡ ô gộp cũ
  sheet.clear();
  sheet.setName(label.replace(/\//g, '-'));
  var header = [label].concat(cols).concat(['GHI CHÚ']);
  var body = table.rows.map(function (r) {
    return [r.name].concat(cols.map(function (c) { return (r.values || {})[c] || ''; })).concat([r.notes || '']);
  });

  sheet.getRange(1, 2, 1, cols.length).merge().setValue(table.title || 'TỪ VỰNG');
  sheet.getRange(2, 1, 1, width).setValues([header]);
  if (body.length) sheet.getRange(3, 1, body.length, width).setValues(body);

  var all = sheet.getRange(1, 1, body.length + 2, width);
  all.setFontFamily('Times New Roman').setFontSize(13).setVerticalAlignment('middle').setWrap(true);
  sheet.getRange(1, 2, 2, cols.length).setBackground('#f0c8f8').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, 1).setBackground('#ffff00').setFontWeight('bold').setHorizontalAlignment('right');
  var pen = cols.indexOf('CHÉP PHẠT') + 2;
  sheet.getRange(2, pen).setBackground('#ffff00');
  sheet.getRange(2, width).setBackground('#ffe5cc').setFontWeight('bold');
  sheet.getRange(2, 1, body.length + 1, width).setBorder(true, true, true, true, true, true, '#bbbbbb', SpreadsheetApp.BorderStyle.SOLID);
  if (body.length) {
    sheet.getRange(3, 1, body.length, 1).setFontWeight('bold');
    sheet.getRange(3, 2, body.length, width - 2).setHorizontalAlignment('center');
    var wrongCol = cols.indexOf('TỪ VIẾT SAI') + 2;
    if (wrongCol > 1) sheet.getRange(3, wrongCol, body.length, 1).setFontColor('#e02020');
    sheet.getRange(3, width, body.length, 1).setFontSize(11);
  }
  sheet.setColumnWidth(1, 170);
  for (var c = 2; c < width; c++) sheet.setColumnWidth(c, 190);
  sheet.setColumnWidth(width, 420);
  sheet.setFrozenRows(2);
}
