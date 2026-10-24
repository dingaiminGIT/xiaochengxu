const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
let page,
  token = 'account-a',
  requests = [],
  timers = [],
  next = {},
  stores = [];
const wx = {
  getStorageSync: () => token,
  setStorageSync: (...args) => stores.push(args),
  navigateTo() {},
  navigateBack() {},
  showModal() {},
};
vm.runInNewContext(fs.readFileSync('pages/devices/index.js', 'utf8').replace(/^import .*;\n/gm, ''), {
  Page: (p) => {
    page = p;
  },
  wx,
  hasSession: () => !!token,
  requireSession: () => !!token,
  currentPet: () => ({ id: 'pet-a', name: '猫' }),
  api: async () => ({ items: [] }),
  deviceRequest: async (path, method, data) => {
    requests.push({ path, method, data: JSON.parse(JSON.stringify(data || {})) });
    return typeof next === 'function' ? next(path) : next;
  },
  presentDevice: (x) => x,
  deviceTime: (x) => x,
  NOTICE_VERSION: 'notice',
  PRIVACY_VERSION: 'privacy',
  setTimeout: (fn) => {
    timers.push(fn);
    return timers.length;
  },
  clearTimeout() {},
});
page.data = JSON.parse(JSON.stringify(page.data));
page.setData = (patch) => Object.assign(page.data, patch);
(async () => {
  page.onLoad({ add: '1' });
  page._visible = true;
  page._token = token;
  page.setData({ ready: true, username: 'account', password: 'secret', accepted: false });
  await page.connect();
  assert.equal(requests.length, 0, 'explicit consent required');
  page.setData({ accepted: true });
  next = { item: { id: 'c' }, devices: [] };
  await page.connect();
  assert.equal(requests[0].data.password, 'secret');
  assert.equal(requests[0].data.consent.accepted, true);
  assert.equal(page.data.password, '');
  assert.equal(page.data.username, '');
  assert.equal(page.data.accepted, false);
  assert.equal(page.data.stage, 'choose');
  assert.equal(stores.length, 0);
  page.setData({ username: 'x', password: 'y', accepted: true });
  page.onHide();
  assert.equal(page.data.password, '');
  assert.equal(page.data.accepted, false);
  page.setData({ items: [{ pet_id: 'pet-a' }, { pet_id: 'pet-b' }] });
  page.filterItems();
  assert.equal(page.data.visibleItems.length, 1);
  page.toggleFilter();
  assert.equal(page.data.visibleItems.length, 2);
  let finish;
  next = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  page.setData({ ready: true, username: 'x', password: 'y', accepted: true });
  const pending = page.connect();
  token = 'account-b';
  finish({ item: { id: 'old' }, devices: [] });
  await pending;
  assert.notEqual(page.data.connection?.id, 'old', 'discard another account response');
  assert.equal(stores.length, 0);
  console.log('PASS: explicit consent, transient credentials, hide cleanup, pet filter, stale account response');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
