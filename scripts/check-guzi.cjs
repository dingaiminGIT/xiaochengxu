const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
const generation = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(`${read('pages/guzi/generation.js')}\nthis.exports={createGeneration,normalizePrompt,DEFAULT_PROMPT,DEMO_IMAGE,MAX_PHOTO_BYTES,PROMPT_LIMIT};`, generation);
const g = generation.exports;
const math = {};
vm.runInNewContext(`${read('pages/guzi/crop-math.js')}\nthis.exports={fitPhoto,clampPhoto,zoomPhoto,sourceRect};`, math);
const m = math.exports;

async function run() {
  assert.equal(Array.from(g.normalizePrompt('猫'.repeat(400))).length, 300);
  assert.equal(Array.from(g.normalizePrompt('🐈'.repeat(301))).length, 300);
  await assert.rejects(g.createGeneration({ photoPath: '', prompt: 'cat' }).promise);
  const cancelled = g.createGeneration({ photoPath: 'photo.jpg', prompt: 'cat' });
  cancelled.cancel();
  await assert.rejects(cancelled.promise, e => e.cancelled);
  const demo = await g.createGeneration({ photoPath: 'photo.jpg', prompt: 'cat' }).promise;
  assert.equal(demo.isDemo, true, 'mock output must never masquerade as generated user content');
  assert.equal(demo.imagePath, g.DEMO_IMAGE);

  for (const [width, height] of [[1200, 600], [600, 1200], [800, 800], [8000, 500]]) {
    const photo = m.fitPhoto(width, height, 300);
    assert.ok(photo.width >= 300 && photo.height >= 300);
    for (const scale of [1, 2, 4, 12, 0.5]) {
      const zoom = m.zoomPhoto(photo, scale, { x: 10, y: 290 }, 300);
      const pan = m.clampPhoto({ ...zoom, x: -99999, y: 99999 }, 300);
      const rect = m.sourceRect(pan, width, 300);
      assert.ok(pan.scale >= 1 && pan.scale <= 4);
      assert.ok(rect.x >= -1e-6 && rect.y >= -1e-6);
      assert.ok(rect.x + rect.size <= width + 1e-6 && rect.y + rect.size <= height + 1e-6, 'crop never samples outside the source image');
    }
  }

  let definition, resolveTask, rejectTask, calls = 0, navigations = [], toasts = [], albumPath, cancelCalls = 0;
  const wx = {
    hideKeyboard() {}, pageScrollTo() {}, showToast: args => toasts.push(args.title),
    navigateTo: args => navigations.push(args),
    chooseMedia: args => args.fail({ errMsg: 'chooseMedia:fail cancel' }),
    env: { USER_DATA_PATH: '/user' },
    getFileSystemManager: () => ({ copyFile: args => args.success({}) }),
    saveImageToPhotosAlbum: args => { albumPath = args.filePath; args.success({}); },
  };
  vm.runInNewContext(read('pages/guzi/index.js'), {
    ...g, wx, shareCard() {}, Page: value => { definition = value; },
    createGeneration: () => {
      calls++;
      return { promise: new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; }),
        cancel() { cancelCalls++; rejectTask({ cancelled: true }); } };
    },
  });
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  page.onLoad();
  page.choosePhoto();
  assert.equal(page.data.choosing, false);
  assert.equal(toasts.length, 0, 'cancelled photo picker stays silent');
  page.data.photoPath = 'cropped.jpg';
  page.data.originalPath = 'original.jpg';
  page.onPromptInput({ detail: { value: '   ' } });
  await page.generate();
  assert.equal(calls, 0);
  assert.equal(page.data.promptValid, false);
  page.onPromptInput({ detail: { value: '画一只猫' } });
  const first = page.generate();
  await page.generate();
  assert.equal(calls, 1, 'double tap creates a single task');
  assert.equal(page.data.state, 'generating');
  resolveTask({ imagePath: g.DEMO_IMAGE, isDemo: true });
  await first;
  assert.equal(page.data.state, 'success');
  await page.saveImage();
  assert.equal(albumPath, '/user/guzi-example.jpg');
  assert.ok(toasts.includes('示例已保存'));
  page.recreate();
  assert.equal(page.data.photoPath, 'cropped.jpg');
  assert.equal(page.data.prompt, '画一只猫');
  assert.equal(page.data.resultPath, g.DEMO_IMAGE, 'previous result retained until a successful replacement');
  const failed = page.generate();
  rejectTask(new Error('offline'));
  await failed;
  assert.equal(page.data.state, 'failed');
  assert.equal(page.data.photoPath, 'cropped.jpg');
  const retry = page.generate();
  resolveTask({ imagePath: 'new.jpg', isDemo: false });
  await retry;
  assert.equal(page.data.resultPath, 'new.jpg');
  page.recreate();
  page.recropPhoto();
  assert.equal(navigations.at(-1).url, '/pages/guzi/crop');
  assert.equal(page.data.photoPath, 'cropped.jpg', 'opening/cancelling recrop does not discard the old photo');
  navigations.at(-1).events.photoCropped({ path: 'new-crop.jpg' });
  assert.equal(page.data.photoPath, 'new-crop.jpg');
  const abandoned = page.generate();
  page.onUnload();
  await abandoned;
  assert.equal(cancelCalls, 1);
  assert.notEqual(page.data.state, 'failed', 'unload cancellation cannot surface an error on the dead page');

  const config = JSON.parse(fs.readFileSync('app.json'));
  assert.ok(config.subpackages.some(p => p.root === 'pages/guzi' && p.pages.includes('crop')));
  const home = fs.readFileSync('pages/home/index.wxml', 'utf8');
  assert.ok(home.includes('openGuzi') && !home.includes('openHalloween'));
  assert.ok(!fs.readFileSync('pages/home/index.js', 'utf8').includes('showHalloweenTaskPrompt'));
  assert.ok(fs.existsSync(`.${g.DEMO_IMAGE}`));
  console.log('PASS guzi: prompt limits, cancellable demo, crop boundaries, duplicate submission, retry, recreation, crop cancellation, album save, unload and entry routing');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
