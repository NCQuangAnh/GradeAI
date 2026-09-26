// Load the Apps Script .gs files into one Node context (they share globals in Apps Script too).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function loadGs() {
  const ctx = vm.createContext({});
  for (const f of ['Grading.gs', 'Gemini.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
};
