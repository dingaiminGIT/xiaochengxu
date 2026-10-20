const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function source(file) { return fs.readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, ''); }
let view, map, chat;
vm.runInNewContext(source('utils/food-submission.js') + '\nexpose(submissionView)', { expose: fn => view = fn });
vm.runInNewContext(source('utils/assistant-chat.js') + '\nexpose(mapChatMessage, chatMethods)', { expose: (fn, m) => { map = fn; chat = m; }, requireSession: () => true, wx: { navigateTo: o => routes.push(o.url) } });
const routes = [];
const base = { id: 's', recognition_status: 'success', ingredient_composition: '鸡肉' };
assert.equal(view({ ...base, processing_status: 'processing', processing_stage: 'internal' }).statusText, '识别中');
assert.equal(view({ ...base, processing_status: 'completed', result_available: true }).statusText, '已完成');
for (const processing_status of ['waiting_input', 'need_review', 'failed']) {
  const result = view({ ...base, processing_status });
  assert.equal(result.statusText, '需要确认'); assert.equal(result.isProcessing, false); assert.equal(result.canReupload, true);
}
assert.equal(view({ ...base, status: 'cancelled', processing_status: 'processing' }).isProcessing, false);
assert.equal(view({ recognition_status: 'processing', recognition_message: 'internal node', status_label: 'internal' }).recognitionMessage, '正在识别，结果会自动更新。');
assert.equal(view({ ...base, processing_status: 'done' }).statusText, '已完成');
assert.equal(view({ ...base, processing_status: 'cancelled' }).canAnalyze, false);
for (const [slot, value, count] of [['food_analysis_usage', 'current:a1', 1], ['food_analysis_recommendation', 'yes:a1', 2]]) {
  const message = map({ id: 'backend', response_type: 'result_card', interaction: { slot, analysis_id: 'a1', options: [{ label: '确认', value }] }, result: { health_analysis: { subjects: Array.from({ length: count }, () => ({ label: '粮' })) } } });
  let sent;
  chat.chooseChatOption.call({ data: { chatMessages: [message] }, sendCloudMessage: payload => { sent = payload; } }, { currentTarget: { dataset: { id: 'backend', index: 0 } } });
  assert.equal(sent.interaction.slot, slot); assert.equal(sent.interaction.value, value); assert.equal(sent.interaction.analysis_id, 'a1');
}
const subject = { label: '粮A', presentation: { advantages: [{ title: '肌肉维持', summary: '依据' }], attentions: [] } };
const single = map({ result: { health_analysis: { subjects: [subject], overview: { title: '不应显示' } } } });
assert.equal(single.healthOverview, null); assert.equal(single.healthPrompt, '你家猫已经在吃这款粮了吗？');
const multi = map({ result: { health_analysis: { subjects: [subject, { ...subject, label: '粮B' }], overview: { advantages: ['整体依据'], attentions: [{ title: '排便', text: '观察状态' }] } } } });
assert.equal(multi.healthOverview.advantages[0].summary, '整体依据');
assert.equal(multi.healthOverview.attentions[0].summary, '观察状态');
assert.equal(multi.healthPrompt, '是否需要推荐？');
chat.openDietHistory.call({ data: { boundPet: { id: 'cat/a' } } });
assert.equal(routes[0], '/pages/pet-space/food-list?mode=history&petId=cat%2Fa');
let definition, scheduled, fail = false, completed = false;
vm.runInNewContext(source('pages/pet-space/food-submissions.js'), {
  Page: d => definition = d, hasSession: () => true, login: async () => {}, accountKey: () => 'user',
  submissionView: view, errorText: e => e.message,
  setTimeout: (fn, delay) => { scheduled = { fn, delay }; return 1; }, clearTimeout: () => { scheduled = null; },
  api: async path => { if (fail) throw new Error('offline'); return path.includes('?') ? { items: [] } : { item: { ...base, processing_status: completed ? 'done' : 'processing' } }; },
});
const page = { ...definition, _active: true, data: { items: [], selected: view({ ...base, processing_status: 'processing' }) }, setData(p) { Object.assign(this.data, p); } };
(async () => {
  await page.load(); assert.equal(scheduled.delay, 5000, 'selected item outside list must continue polling');
  fail = true; await scheduled.fn(); assert.equal(scheduled.delay, 10000, 'transient error retries automatically');
  fail = false; completed = true; await scheduled.fn(); assert.equal(scheduled, null, 'terminal state stops polling');
  assert.equal(page.data.selected.statusText, '已完成');
  completed = false; await page.load(); assert.ok(scheduled); page.onHide(); assert.equal(scheduled, null);
  vm.runInNewContext(source('pages/pet-space/food-list.js'), { Page: d => definition = d, requireSession: () => true, wx: { navigateTo: o => routes.push(o.url) } });
  definition.addFood.call({ data: { pet: { id: 'cat/a' } } });
  assert.equal(routes[1], '/pages/pet-space/hunting?petId=cat%2Fa');
  const wxml = fs.readFileSync('pages/pet-space/food-submissions.wxml', 'utf8');
  assert.ok(!/processing_stage|processing_message|刷新状态/.test(wxml));
  console.log('PASS three states, automatic detail polling/retry/stop, normalized single/multiple cards, and pet-scoped navigation');
})().catch(e => { console.error(e); process.exitCode = 1; });
