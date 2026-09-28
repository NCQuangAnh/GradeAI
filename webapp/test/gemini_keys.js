// Gọi Gemini khi test trên máy: dùng key miễn phí trước (GEMINI_FREE_KEYS trong .env), key nào hết lượt
// hoặc lỗi thì sang key tiếp, cuối cùng mới dùng key trả phí (GEMINI_API_KEY). Giống cách web xoay key.
const fs = require('fs');
const path = require('path');

// options.freeOnly: không dùng key trả phí (thử nghiệm mô hình mới).
module.exports = function makeGemini(G, model, options) {
  const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
  const get = (name) => ((env.match(new RegExp('^' + name + '=(.+)$', 'm')) || [])[1] || '').trim();
  const keys = get('GEMINI_FREE_KEYS').split(',').map((k) => k.trim()).filter(Boolean)
    .map((key, i) => ({ key, label: 'miễn phí #' + (i + 1), paid: false }));
  if (get('GEMINI_API_KEY') && !(options && options.freeOnly)) keys.push({ key: get('GEMINI_API_KEY'), label: 'trả phí', paid: true });
  const out = new Set();  // key hết lượt hôm nay hoặc bị khóa: bỏ qua ở các lần gọi sau
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return async function gemini(body) {
    // như web: chỉ gặp lỗi tạm thời (503, mạng) thì đợi rồi thử lại cả vòng key, tối đa 2 lần nữa
    for (const wait of [0, 3000, 8000]) {
      if (wait) await sleep(wait);
      let transient = false;
      for (const k of keys) {
        if (out.has(k)) continue;
        let res, json;
        try {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': k.key },
            body: JSON.stringify(body),
          });
          json = await res.json();
        } catch (e) {
          transient = true;
          console.error(`Key ${k.label}: ${e.message}, chuyển key tiếp`);
          continue;
        }
        if (res.ok) {
          const r = G.parseGeminiResponse(json);
          r.keyLabel = k.label;
          r.paid = k.paid;
          r.cost = k.paid ? r.inputTokens * 0.25 / 1e6 + r.outputTokens * 1.5 / 1e6 : 0;  // chỉ tính key trả phí
          return r;
        }
        const c = G.classifyGeminiError(res.status, json);
        if (c.kind === 'fatal') throw new Error(c.reason);
        if (c.kind === 'retry' || c.kind === 'minute') transient = true;
        else out.add(k);
        console.error(`Key ${k.label}: ${c.reason}, chuyển key tiếp`);
      }
      if (!transient) break;
    }
    throw new Error('Không còn key nào dùng được');
  };
};
