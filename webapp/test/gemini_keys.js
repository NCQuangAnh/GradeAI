// Gọi Gemini khi test trên máy: dùng key miễn phí trước (GEMINI_FREE_KEYS trong .env), key nào hết lượt
// hoặc lỗi thì sang key tiếp, cuối cùng mới dùng key trả phí (GEMINI_API_KEY). Giống cách web xoay key.
const fs = require('fs');
const path = require('path');

module.exports = function makeGemini(G, model) {
  const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
  const get = (name) => ((env.match(new RegExp('^' + name + '=(.+)$', 'm')) || [])[1] || '').trim();
  const keys = get('GEMINI_FREE_KEYS').split(',').map((k) => k.trim()).filter(Boolean)
    .map((key, i) => ({ key, label: 'miễn phí #' + (i + 1), paid: false }));
  if (get('GEMINI_API_KEY')) keys.push({ key: get('GEMINI_API_KEY'), label: 'trả phí', paid: true });
  let current = 0;

  return async function gemini(body) {
    for (; current < keys.length; current++) {
      const k = keys[current];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': k.key },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        const r = G.parseGeminiResponse(json);
        r.keyLabel = k.label;
        r.paid = k.paid;
        r.cost = k.paid ? r.inputTokens * 0.25 / 1e6 + r.outputTokens * 1.5 / 1e6 : 0;  // chỉ tính key trả phí
        return r;
      }
      const c = G.classifyGeminiError(res.status, json);
      if (c.kind === 'fatal') throw new Error(c.reason);
      console.error(`Key ${k.label}: ${c.reason}, chuyển key tiếp`);
    }
    throw new Error('Không còn key nào dùng được');
  };
};
