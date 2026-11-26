const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let account = 'alice', storage = new Map([['miniprogram_token', 'token-a']]);
let uploads = [], polls = [], downloads = [], imageInfo = [], timers = [], aborted = 0;
const wx = {
  getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, { ...value }),
  removeStorageSync: key => storage.delete(key),
  uploadFile: args => { uploads.push(args); return { abort: () => aborted++ }; },
  request: args => { polls.push(args); return { abort: () => aborted++ }; },
  downloadFile: args => { downloads.push(args); return { abort: () => aborted++ }; },
  getImageInfo: args => { imageInfo.push(args); },
};
const ctx = vm.createContext({ wx, config: { apiBaseUrl: 'https://test.invalid' },
  mediaUrl: url => url.startsWith('/') ? `https://test.invalid${url}` : url,
  accountKey: key => `${account}:${key}`,
  setTimeout: fn => { timers.push(fn); return fn; }, clearTimeout: fn => { timers = timers.filter(f => f !== fn); },
});
vm.runInContext(fs.readFileSync('pages/guzi/generation.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, ''), ctx);
const create = () => ctx.createGeneration({ photoPath: 'crop.jpg', prompt: '卡通猫' });
const id = 'a'.repeat(32);
const respond = (transport, status, extra = {}) => transport.success({ statusCode: 200, data: { ok: true, item: { id, status, ...extra } } });
async function run() {
  const first = create();
  assert.equal(uploads[0].name, 'image');
  assert.equal(uploads[0].header.Authorization, 'Bearer token-a');
  assert.equal(uploads[0].formData.prompt, '卡通猫');
  const requestId = uploads[0].formData.request_id;
  uploads[0].fail();
  await assert.rejects(first.promise, /提交失败/);
  const retry = create();
  assert.equal(uploads[1].formData.request_id, requestId, 'ambiguous upload retries preserve idempotency');
  respond(uploads[1], 'pending');
  timers.shift()();
  assert.ok(polls[0].url.endsWith(`/image-generations/${id}`));
  respond(polls[0], 'generating');
  retry.cancel();
  await assert.rejects(retry.promise, e => e.cancelled);
  assert.equal(timers.length, 0);
  assert.equal(aborted, 1);
  const resumed = create();
  assert.equal(uploads.length, 2, 'cancelled polling resumes accepted server task without uploading again');
  respond(polls.at(-1), 'succeeded', { image_url: '/api/miniprogram/moment-images/example' });
  assert.equal(storage.has('alice:guzi-generation'), true, 'retain task until full preview is ready');
  assert.equal(downloads.at(-1).url, 'https://test.invalid/api/miniprogram/moment-images/example');
  downloads.at(-1).success({ statusCode: 200, tempFilePath: '/tmp/complete.jpg' });
  imageInfo.at(-1).success({ width: 2048, height: 2048 });
  const result = await resumed.promise;
  assert.equal(result.isDemo, false);
  assert.equal(result.imagePath, '/tmp/complete.jpg');
  assert.equal(storage.has('alice:guzi-generation'), false);
  const badDownload = create();
  respond(uploads.at(-1), 'succeeded', { image_url: '/api/miniprogram/moment-images/example' });
  downloads.at(-1).success({ statusCode: 503 });
  await assert.rejects(badDownload.promise, /图片已生成/);
  assert.equal(storage.has('alice:guzi-generation'), true);
  const uploadCount = uploads.length;
  const corruptImage = create();
  respond(polls.at(-1), 'succeeded', { image_url: '/api/miniprogram/moment-images/example' });
  downloads.at(-1).success({ statusCode: 200, tempFilePath: '/tmp/broken.jpg' });
  imageInfo.at(-1).fail();
  await assert.rejects(corruptImage.promise, /预览加载失败/);
  const timedOutImage = create();
  respond(polls.at(-1), 'succeeded', { image_url: '/api/miniprogram/moment-images/example' });
  downloads.at(-1).success({ statusCode: 200, tempFilePath: '/tmp/stalled.jpg' });
  timers.shift()();
  await assert.rejects(timedOutImage.promise, /预览加载失败/);
  imageInfo.at(-1).success({ width: 2048, height: 2048 });
  assert.equal(storage.has('alice:guzi-generation'), true, 'late image callbacks do not discard resumable task');
  const cancelDownload = create();
  respond(polls.at(-1), 'succeeded', { image_url: '/api/miniprogram/moment-images/example' });
  cancelDownload.cancel();
  await assert.rejects(cancelDownload.promise, e => e.cancelled);
  downloads.at(-1).success({ statusCode: 200, tempFilePath: '/tmp/late.jpg' });
  assert.equal(storage.has('alice:guzi-generation'), true);
  const completeDownload = create();
  respond(polls.at(-1), 'succeeded', { image_url: '/api/miniprogram/moment-images/example' });
  downloads.at(-1).success({ statusCode: 200, tempFilePath: '/tmp/recovered.jpg' });
  imageInfo.at(-1).success({ width: 2048, height: 2048 });
  assert.equal((await completeDownload.promise).imagePath, '/tmp/recovered.jpg');
  assert.equal(uploads.length, uploadCount, 'preview retries never create another paid generation');
  const failure = create();
  respond(uploads.at(-1), 'failed', { error: '生成失败' });
  await assert.rejects(failure.promise, /生成失败/);
  assert.equal(storage.has('alice:guzi-generation'), false);
  const badge = style => ctx.createGeneration({ photoPath: 'crop.jpg', prompt: '', style });
  const firstBadge = badge('felt-relief');
  const firstForm = uploads.at(-1).formData;
  assert.equal(firstForm.style, 'felt-relief');
  assert.ok(!('prompt' in firstForm));
  uploads.at(-1).fail();
  await assert.rejects(firstBadge.promise);
  const sameBadge = badge('felt-relief');
  assert.equal(uploads.at(-1).formData.request_id, firstForm.request_id);
  uploads.at(-1).fail();
  await assert.rejects(sameBadge.promise);
  const otherBadge = badge('washi-collage');
  assert.notEqual(uploads.at(-1).formData.request_id, firstForm.request_id);
  respond(uploads.at(-1), 'failed', { error: '徽章转绘失败' });
  await assert.rejects(otherBadge.promise, /徽章转绘失败/);
  const switched = create();
  account = 'bob'; storage.set('miniprogram_token', 'token-b');
  uploads.at(-1).success({ statusCode: 401, data: {} });
  await assert.rejects(switched.promise, /登录状态/);
  assert.equal(storage.get('miniprogram_token'), 'token-b');
  const unauthorized = create();
  uploads.at(-1).success({ statusCode: 401, data: JSON.stringify({ ok: false, error: '请先登录' }) });
  await assert.rejects(unauthorized.promise, /登录/);
  assert.equal(storage.has('miniprogram_token'), false);
  const count = uploads.length;
  await assert.rejects(create().promise, /登录/);
  assert.equal(uploads.length, count);
  console.log('PASS real generation adapter: multipart auth, idempotency, polling, cancellation/resume, complete local preview, download/decode failures, retry without regeneration, cancellation, failure and account isolation');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
