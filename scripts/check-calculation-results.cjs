const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let view, definition, timer, pending, account = 'alice';
const calls = [];
const timers = { setTimeout: (fn, ms) => { timer = { fn, ms }; return 1; }, clearTimeout: () => { timer = null; } };
vm.runInNewContext(fs.readFileSync('utils/food-submission.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '') + '\nexpose(submissionView);', { expose: f => { view = f; } });
const initial = { id: 'upload', recognition_status: 'success', ingredient_composition: '鸡肉、鱼油', processing_status: 'processing' };
const provisional = { ...initial, result_available: true, result_stage: 'provisional', result_id: 'v1', calculation_result: { portrait: { dimensions: { protein_quality: { score: 0.9, scale_max: 1 } } } } };
const official = { ...provisional, processing_status: 'done', result_stage: 'official' };
assert.equal(view(provisional).statusText, '初算可查看');
assert.equal(view(provisional).dimensions[0].name, '蛋白质量');
assert.equal(view(official).needsRefresh, false);
assert.equal(view({ ...initial, status: 'cancelled' }).needsRefresh, false);
const context = { ...timers, Page: d => { definition = d; }, hasSession: () => true, accountKey: () => account,
  submissionView: view, api: url => { calls.push(url); return new Promise((resolve, reject) => { pending = { url, resolve, reject }; }); }, wx: {}, errorText: e => e.message };
vm.runInNewContext(fs.readFileSync('pages/pet-space/food-submissions.js', 'utf8').replace(/^import .*;$/gm, ''), context);
function page() { return { ...definition, _active: true, data: { selected: view(initial), items: [view(initial)] }, setData(p) { Object.assign(this.data, p); } }; }
function fire() { const t = timer; timer = null; return t.fn(); }
function reply(item) { const p = pending; pending = null; p.resolve({ item }); }
const processing = { revision: 'running', processing_stage: '生成分析结果', is_processing: true, needs_refresh: true };
async function poll(status, detail) {
  const done = fire(); assert(pending.url.endsWith('/status')); reply(status); await new Promise(setImmediate);
  if (detail) { assert.equal(pending.url, '/food-submissions/upload'); reply(detail); }
  else assert.equal(pending, null, 'unchanged status must not load full detail');
  await done;
}
(async () => {
  const p = page(); p.scheduleRefresh(); assert.equal(timer.ms, 1000);
  await poll(processing, initial);
  const fullReads = () => calls.filter(url => !url.endsWith('/status')).length;
  const before = fullReads();
  for (let i = 0; i < 30; i++) { await poll(processing); assert.equal(timer.ms, 1000, 'active calculation never backs off'); }
  assert.equal(fullReads(), before);
  await poll({ ...processing, revision: 'initial-result', is_processing: false }, { ...provisional, processing_status: 'done' });
  assert.equal(p.data.selected.result_id, 'v1'); assert.equal(timer.ms, 3000, 'review waiting backs off');
  await poll({ revision: 'promoted', processing_stage: '分析完成', is_processing: false, needs_refresh: false }, official);
  assert.equal(p.data.selected.resultLabel, '正式结果'); assert.equal(timer, null, 'same-id promotion refreshes and stops');
  const hidden = page(); hidden.scheduleRefresh(); let done = fire(); hidden.onHide(); reply(processing); await done;
  assert.equal(hidden.data.selected.result_id, undefined); assert.equal(timer, null); assert.equal(pending, null);
  const switched = page(); switched.scheduleRefresh(); done = fire(); reply(processing); await new Promise(setImmediate);
  account = 'bob'; reply(official); await done;
  assert.equal(switched.data.selected.result_id, undefined, 'old account response is ignored'); assert.equal(timer, null);
  account = 'alice'; const retry = page(); retry.scheduleRefresh(); done = fire(); pending.reject(new Error('network')); pending = null; await done;
  assert.equal(timer.ms, 2000); await poll(processing, initial); assert.equal(timer.ms, 1000); retry.onHide();
  const raced = page(); raced.scheduleRefresh();
  await poll({ revision: 'previous-official', processing_stage: '分析完成', is_processing: false, needs_refresh: false }, initial);
  assert(raced.data.selected.needsRefresh, 'newer detail keeps refreshing despite older status'); assert.equal(timer.ms, 1000); raced.onHide();
  console.log('PASS: 1s lightweight polling, unchanged detail suppression, review backoff, same-id promotion, hidden/account isolation, error recovery, status/detail race');
})().catch(e => { console.error(e); process.exitCode = 1; });
