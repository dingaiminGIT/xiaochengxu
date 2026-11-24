const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = file => fs.readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/export function /g, 'function ');
function session(storage, options = {}) {
  let definition, hidden, destination;
  const wx = {
    getStorageSync(key) { if (options.readError) throw Error('storage'); return storage.get(key); },
    setStorageSync(key, value) { if (options.writeError) throw Error('storage'); storage.set(key, value); },
    navigateTo(args) { destination = args.url; if (options.navigateError) args.fail(); },
    showToast() {},
  };
  const context = vm.createContext({ wx, categories: [], Page: value => { definition = value; } });
  vm.runInContext(source('utils/guzi-intro.js') + '\n' + source('utils/modal-layout.js') + '\n' + source('pages/home/index.js'), context);
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); }, getTabBar() { return { setData(patch) { hidden = patch.modalHidden; } }; } };
  return { page, hidden: () => hidden, destination: () => destination };
}
for (const action of ['closeGuziIntro', 'openGuzi']) {
  const storage = new Map();
  const current = session(storage, { navigateError: true });
  current.page.showGuziIntroIfNeeded();
  assert.equal(current.page.data.showGuziIntro, true);
  assert.equal(current.hidden(), true);
  assert.equal(storage.size, 0, 'display alone must not consume the campaign');
  current.page[action]();
  assert.equal(current.page.data.showGuziIntro, false);
  assert.equal(current.hidden(), false);
  if (action === 'openGuzi') assert.equal(current.destination(), '/pages/guzi/index');
  current.page.showGuziIntroIfNeeded();
  assert.equal(current.page.data.showGuziIntro, false);
  const restarted = session(storage);
  restarted.page.showGuziIntroIfNeeded();
  assert.equal(restarted.page.data.showGuziIntro, false, 'dismissal survives app restart');
}
const unavailable = session(new Map(), { writeError: true });
unavailable.page.closeGuziIntro();
unavailable.page.showGuziIntroIfNeeded();
assert.equal(unavailable.page.data.showGuziIntro, false);
const unreadable = session(new Map(), { readError: true });
unreadable.page.showGuziIntroIfNeeded();
assert.equal(unreadable.page.data.showGuziIntro, false);
console.log('PASS activity intro: close/entry persistence, restart, navigation failure, tab bar and storage fallback');
