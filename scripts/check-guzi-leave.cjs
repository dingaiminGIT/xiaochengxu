const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8').replace(/^import .*;$/gm, '');
function makePage(def) {
  return { ...def, data: { ...def.data }, _alive: true, setData(patch) { Object.assign(this.data, patch); } };
}
async function run() {
  let def, confirm = false, modalCount = 0, back = 0, home = 0, alerts = 0, saveFails = false;
  const wx = {
    getSetting: args => args.success({ authSetting: { 'scope.writePhotosAlbum': true } }),
    showModal(o) { modalCount++; if (o.success) o.success({ confirm }); },
    navigateBack() { back++; }, switchTab(o) { assert.equal(o.url, '/pages/home/index'); home++; },
    enableAlertBeforeUnload() { alerts++; }, disableAlertBeforeUnload() { alerts--; },
    saveImageToPhotosAlbum(o) { if (saveFails) o.fail({ errMsg: 'failed' }); else o.success(); },
    showToast() {},
    env: { USER_DATA_PATH: '/user' },
    getImageInfo(o) { o.success({ path: o.src, type: 'jpeg' }); },
    getFileSystemManager() { return { copyFile(o) { o.success(); }, unlink() {} }; },
  };
  vm.runInNewContext(read('pages/guzi/index.js'), {
    Page: v => { def = v; }, wx, getCurrentPages: () => [1, 2], DEFAULT_PROMPT: '', PROMPT_LIMIT: 2000,
    DEMO_IMAGE: '/demo.jpg', normalizePrompt: v => v,
  });
  const page = makePage(def);
  page.data.resultPath = 'wxfile://result.jpg';
  page.updateLeaveAlert();
  assert.equal(alerts, 1);
  await page.leavePage();
  assert.equal(back, 0, 'cancel preserves result page');
  confirm = true;
  await page.leavePage();
  assert.equal(back, 1);
  saveFails = true;
  await page.saveImage();
  assert.equal(page.data.resultSaved, false, 'failed album save cannot suppress warning');
  saveFails = false;
  await page.saveImage();
  assert.equal(page.data.resultSaved, true);
  const count = modalCount;
  await page.leavePage();
  assert.equal(modalCount, count, 'successful album save skips leave confirmation');

  let postFails = false;
  vm.runInNewContext(read('pages/release/index.js'), {
    Page: v => { def = v; }, wx, categories: [], requireSession: () => true,
    login: async () => ({ name: 'user', avatarUrl: '' }), accountKey: () => 'user',
    loadStore: () => ({ posts: [] }), saveStore() {}, saveActivityPost() {}, queueHalloweenTaskPrompt() {},
    mapPost: item => item, errorText: e => e.message,
    api: async () => { if (postFails) throw new Error('offline'); return { item: { id: 'post', status: 'published' } }; },
  });
  const release = makePage(def);
  release.loadPets = async () => {};
  release.data.body = '秀一下'; release.data.images = ['https://example.com/image.jpg'];
  release._fromGuzi = true;
  release._guziResultSaved = true;
  await release.release();
  assert.equal(home, 1, 'successful guzi post returns home');
  release._guziResultSaved = false;
  confirm = false;
  const previousBack = back;
  await release.release();
  assert.equal(back, previousBack + 1, 'unsaved result can return to save after publishing');
  assert.equal(home, 1);
  confirm = true;
  await release.release();
  assert.equal(home, 2, 'confirmed unsaved result returns home');
  postFails = true;
  await release.release();
  assert.equal(home, 2, 'failed publication stays in composer');
  postFails = false;
  release._fromGuzi = false;
  const previousModalCount = modalCount;
  await release.release();
  assert.equal(modalCount, previousModalCount, 'ordinary posts retain existing back navigation');
  console.log('PASS guzi leave: saved/unsaved result, cancelled exit, failed save, successful/failed post and ordinary composer routing');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
