const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const source = fs
  .readFileSync('utils/food-submission.js', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/export /g, '');
let sent;
let reply = { statusCode: 202, data: { ok: true, item: { id: 'food1' } } };
const context = {
  config: { apiBaseUrl: 'https://example.test' },
  requireSession: () => true,
  login: async () => {},
  Uint8Array,
  ArrayBuffer,
  wx: {
    getStorageSync: () => 'token',
    removeStorageSync: () => {},
    getImageInfo: ({ success }) => success({ type: 'png' }),
    getFileSystemManager: () => ({
      readFile: ({ success }) => success({ data: Uint8Array.from([137, 80, 78, 71, 0, 255]).buffer }),
    }),
    request: (o) => {
      sent = o;
      o.success(reply);
    },
  },
};
vm.createContext(context);
vm.runInContext(source + '\nthis.methods = { multipartFood, submitFood, submissionView };', context);
(async () => {
  const { multipartFood, submitFood, submissionView } = context.methods;
  const data = multipartFood(
    { brand_name: '鲜朗', product_name: '猫粮' },
    [
      { type: 'png', data: Uint8Array.from([0, 255, 13, 10]).buffer },
      { type: 'jpg', data: Uint8Array.from([254]).buffer },
    ],
    'testBoundary',
  );
  const body = Buffer.from(data);
  assert.ok(body.includes(Buffer.from('鲜朗')));
  assert.equal((body.toString().match(/name="images"/g) || []).length, 2);
  assert.ok(body.includes(Buffer.from([0, 255, 13, 10])));
  assert.ok(body.toString().endsWith('--testBoundary--\r\n'));
  assert.throws(() => multipartFood({}, [], 'x'), /1~3/);
  assert.throws(() => multipartFood({}, [{ type: 'jpg', data: new ArrayBuffer(10 * 1024 * 1024 + 1) }], 'x'), /10MB/);
  assert.equal(
    (await submitFood({ brand: '鲜朗', product: '猫粮', images: ['/tmp/a.png', '/tmp/b.png'] })).id,
    'food1',
  );
  assert.equal(sent.header.Authorization, 'Bearer token');
  assert.match(sent.header['content-type'], /multipart\/form-data; boundary=/);
  assert.equal(
    (
      Buffer.from(sent.data)
        .toString()
        .match(/name="images"/g) || []
    ).length,
    2,
  );
  reply = { statusCode: 409, data: { ok: false, error: '状态冲突' } };
  await assert.rejects(submitFood({ brand: 'b', product: 'p', images: ['/tmp/a'] }), /状态冲突/);
  assert.equal(submissionView({ recognition_status: 'processing' }).statusText, '识别中');
  const empty = submissionView({ recognition_status: 'success', ingredient_composition: ' ', status: 'active' });
  assert.equal(empty.recognition_status, 'unrecognized');
  assert.equal(empty.canAnalyze, false);
  assert.equal(empty.canReupload, true);
  assert.match(empty.recognitionMessage, /背面/);
  for (const status of ['unrecognized', 'needs_review', 'failed']) {
    const item = submissionView({ recognition_status: status, status: 'active' });
    assert.equal(item.canAnalyze, false);
    assert.equal(item.canReupload, true);
    assert.ok(item.recognitionMessage);
  }
  assert.equal(
    submissionView({ recognition_status: 'success', ingredient_composition: '鸡肉', status: 'active' }).canAnalyze,
    true,
  );
  assert.equal(
    submissionView({ recognition_status: 'success', ingredient_composition: '鸡肉', status: 'cancelled' }).canAnalyze,
    false,
  );
  assert.equal(submissionView({ review_status: 'approved' }).canCancel, false);
  assert.equal(submissionView({ publish_status: 'published' }).canCancel, false);
  assert.equal(submissionView({ status: 'cancelled' }).canCancel, false);
  console.log(
    'PASS: UTF-8 multipart, exact image bytes, multi-file field, size limits, auth, accepted/error responses and status rules',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
