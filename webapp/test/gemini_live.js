// Live check of the exact REST requests the web app sends (~2 Gemini calls, free keys first).
// Run: node webapp/test/gemini_live.js
const fs = require('fs');
const path = require('path');
const G = require('./load')();

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'data', 'TA6', '22-9');
const MODEL = 'gemini-3.1-flash-lite';
const HEIC_ID = '15XcOMpNq1IFxl1q3abC57v2xSe3k1RD5';  // IMG_7451.HEIC, ảnh bài mẫu gốc trên Drive
// Danh sách lớp lấy từ data/ trên máy (không đưa tên học sinh vào code).
const ROSTER = JSON.parse(fs.readFileSync(path.join(DIR, 'result.json'), 'utf8')).students.map((s) => s.name);

const gemini = require('./gemini_keys')(G, MODEL);  // key miễn phí trước, hết lượt mới dùng key trả phí

(async () => {
  const keyImg = { mime: 'image/jpeg', b64: fs.readFileSync(path.join(DIR, 'key.jpg')).toString('base64') };
  const k = await gemini(G.buildKeyRequest([keyImg]));
  const key = JSON.parse(JSON.stringify(G.normalizeKey(k.data)));
  console.log('KEY:', key.topic, '|', key.parts.map((p) => `${p.part}: ${p.items.length} ${p.unit}`).join(', '));
  key.parts.forEach((p) => p.items.forEach((it, i) => console.log(`  ${i + 1}. ${it.en} : ${it.vi}`)));

  if (process.argv.includes('--key-only')) {
    console.log(`Key ${k.keyLabel}. Chi phí key trả phí ~$${k.cost.toFixed(5)}`);
    return;
  }
  const heicPath = path.join(DIR, 'IMG_7451.heic');
  if (!fs.existsSync(heicPath)) {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${HEIC_ID}`);
    fs.writeFileSync(heicPath, Buffer.from(await res.arrayBuffer()));
  }
  const photo = { mime: 'image/heif', b64: fs.readFileSync(heicPath).toString('base64') };
  const g = await gemini(G.buildGradeRequest(key.parts, ROSTER, photo));
  const result = Object.assign(G.normalizeGrade(g.data, key.parts, ROSTER), { fileName: 'IMG_7451.HEIC', url: '' });
  const penalty = JSON.parse(fs.readFileSync(path.join(__dirname, 'penalty.json'), 'utf8'));
  const table = JSON.parse(JSON.stringify(G.assembleSession(key.parts, ROSTER, [result], 'TA6', penalty)));
  const row = table.rows.find((r) => r.photos.length);
  console.log(`\nGRADE: giấy ghi "${result.writtenName}" -> ${row.name || '(chưa ghép)'} | key_matches=${result.keyMatches}`);
  console.log('  ', JSON.stringify(row.values));
  row.notes.forEach((n) => console.log('   -', n));
  console.log(`\nToken: key ${k.inputTokens}/${k.outputTokens}, bài ${g.inputTokens}/${g.outputTokens}. ` +
              `Chi phí ~$${(k.cost + g.cost).toFixed(5)}`);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
