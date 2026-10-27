const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let page, navigation, toasts = 0, count = 0;
vm.runInNewContext(fs.readFileSync('pages/home/index.js', 'utf8').replace(/^import .*;$/gm, ''), {
  Page: (value) => { page = value; }, categories: [],
  setModalData: (target, patch) => Object.assign(target.data, patch),
  wx: { navigateTo: (args) => { navigation = args; count++; }, showToast: () => { toasts++; } },
});
page.openDevices();
assert.equal(navigation.url, '/pages/devices/index', 'open standalone device page');
page.openDevices();
assert.equal(count, 1, 'ignore repeated taps while opening');
navigation.fail(); navigation.complete();
assert.equal(toasts, 1);
page.openDevices();
assert.equal(count, 2, 'retry is available after failure');
navigation.complete();
page.openDevices();
assert.equal(count, 3, 'entry remains available after returning');
assert.ok(!('showDevices' in page.data), 'no obsolete device sheet state');
const home = fs.readFileSync('pages/home/index.wxml', 'utf8');
assert.ok(!home.includes('showDevices') && !home.includes('devices-sheet'), 'device entry has no bottom sheet');
assert.ok(!home.includes('device-supported'), 'no type previews before binding');
const device = fs.readFileSync('pages/devices/index.wxml', 'utf8');
for (const expression of device.matchAll(/{{([\s\S]*?)}}/g)) {
  assert.ok(!/&(?:lt|gt);/.test(expression[1]), 'WXML expressions cannot contain HTML operator entities');
}
console.log('PASS device entry navigation, failure feedback, retry, duplicate taps and empty state');
