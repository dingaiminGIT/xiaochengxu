const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let definition;
let grant, system, confirm, allow, calls, page, authError, lastModal, lastToast;
const scope = 'scope.writePhotosAlbum';
const wx = {
  getAppAuthorizeSetting: () => ({ albumAuthorized: system }),
  getSetting(o) { calls.push('getSetting'); o.success({ authSetting: { [scope]: grant } }); },
  authorize(o) { calls.push('authorize'); if (authError) { o.fail(authError); return; } assert.equal(o.scope, scope); if (allow) { grant = true; o.success(); } else o.fail({ errMsg: 'authorize:fail auth deny' }); },
  showModal(o) { lastModal = o; calls.push('modal'); o.success?.({ confirm }); },
  openSetting(o) { calls.push('openSetting'); grant = allow; o.success({ authSetting: { [scope]: grant } }); },
  openAppAuthorizeSetting(o) { calls.push('systemSettings'); o.success?.(); Promise.resolve().then(() => { assert.equal(calls.includes('save'), false, 'opening settings does not grant permission'); if (allow) system = 'authorized'; page.onShow(); }); },
  getImageInfo(o) { calls.push('image'); o.success({ path: o.src, type: 'jpeg' }); },
  env: { USER_DATA_PATH: '/user' },
  getFileSystemManager: () => ({ copyFile(o) { o.success(); }, unlink() {} }),
  saveImageToPhotosAlbum(o) { calls.push('save'); o.success(); },
  showToast(o) { lastToast = o.title; },
};
vm.runInNewContext(fs.readFileSync('pages/guzi/index.js', 'utf8').replace(/^import .*;$/gm, ''), {
  wx, Page: v => { definition = v; }, DEFAULT_PROMPT: '', DEMO_IMAGE: '/demo.jpg', PROMPT_LIMIT: 2000,
});
async function check(initial, expected) {
  ({ grant, system = 'authorized', confirm = true, allow = true } = initial);
  calls = []; lastModal = null; lastToast = ''; authError = initial.authError;
  page = { ...definition, _alive: true, data: { ...definition.data, resultPath: 'wxfile://result' }, setData(v) { Object.assign(this.data, v); } };
  await page.saveImage();
  assert.deepEqual(calls, expected);
  assert.equal(page.data.resultSaved, expected.includes('save'));
  assert.equal(page.data.saving, false);
  if (initial.errorPattern) assert.match(lastModal.content, initial.errorPattern);
  if (initial.toastPattern) assert.match(lastToast, initial.toastPattern);
}
(async () => {
  await check({}, ['getSetting', 'authorize', 'image', 'save']);
  await check({ allow: false }, ['getSetting', 'authorize']);
  await check({ grant: false }, ['getSetting', 'modal', 'openSetting', 'image', 'save']);
  await check({ grant: false, confirm: false }, ['getSetting', 'modal']);
  await check({ grant: false, allow: false }, ['getSetting', 'modal', 'openSetting']);
  await check({ grant: true }, ['getSetting', 'image', 'save']);
  await check({ grant: true, system: 'denied' }, ['modal', 'systemSettings', 'getSetting', 'image', 'save']);
  await check({ grant: true, system: 'denied', allow: false }, ['modal', 'systemSettings']);
  await check({ system: 'denied', confirm: false }, ['modal']);
  await check({ authError: { errMsg: 'authorize:fail api scope is not declared in the privacy agreement', errno: 112 }, errorPattern: /隐私配置/ }, ['getSetting', 'authorize', 'modal']);
  await check({ authError: { errMsg: 'authorize:fail appid privacy api banned' }, errorPattern: /隐私配置/ }, ['getSetting', 'authorize', 'modal']);
  await check({ authError: { errMsg: 'authorize:fail internal error' }, errorPattern: /internal error/ }, ['getSetting', 'authorize', 'modal']);
  await check({ authError: { errMsg: 'authorize:fail privacy permission is not authorized', errno: 104 }, toastPattern: /未获得/ }, ['getSetting', 'authorize']);
  console.log('PASS album permissions: first authorization, refusal, settings recovery, system permission and automatic save');
})().catch(error => { console.error(error); process.exitCode = 1; });
