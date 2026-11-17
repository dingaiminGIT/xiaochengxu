const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let account = 'alice', storage = new Map([['miniprogram_token', 'token-a']]);
let uploads = [], polls = [], timers = [], aborted = 0;
const wx = {
  getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, { ...value }),
  removeStorageSync: key => storage.delete(key),
  uploadFile: args => { uploads.push(args); return { abort: () => aborted++ }; },
  request: args => { polls.push(args); return { abort: () => aborted++ }; },
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
  const result = await resumed.promise;
  assert.equal(result.isDemo, false);
  assert.equal(result.imagePath, 'https://test.invalid/api/miniprogram/moment-images/example');
  assert.equal(storage.has('alice:guzi-generation'), false);
  const failure = create();
  respond(uploads.at(-1), 'failed', { error: '生成失败' });
  await assert.rejects(failure.promise, /生成失败/);
  assert.equal(storage.has('alice:guzi-generation'), false);
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
  console.log('PASS real generation adapter: multipart auth, idempotency, polling, cancellation/resume, true results, failure and account isolation');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
