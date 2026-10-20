const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let methods, map, observation, account = 'a', calls = [], failRead = false;
const copy = (value) => JSON.parse(JSON.stringify(value));
const source = fs.readFileSync('utils/assistant-chat.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
const row = { day: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10), food_count: 3, water_count: 5, stool_count: 0, source: 'reported_device' };
vm.runInNewContext(source + '\nexpose(chatMethods,mapChatMessage,observationNumber);', {
  expose: (m, mapper, number) => { methods = m; map = mapper; observation = number; },
  accountKey: () => account, requireSession: () => true,
  setModalData: (page, data) => page.setData(data),
  api: async (path, method = 'GET', body) => {
    calls.push({ path, method, body: copy(body || {}) });
    if (method === 'GET' && failRead) throw new Error('读取失败');
    return method === 'GET' ? { items: [row] } : { ok: true, record: body };
  },
  errorText: (e) => e.message,
  wx: { showToast() {} },
});
const fields = ['food_count', 'water_count', 'stool_count'].map((key) => ({ key, label: key, unit: '次' }));
const message = map({ id: 'm', role: 'assistant', content: '状态', result: {
  daily_status: { pet_profile: { id: 'pet' }, input_fields: fields },
  health_analysis: { is_multiple: true, overview: { title: '整体总结' }, subjects: [
    { label: 'A', roles: ['current'], presentation: { advantages: [{ title: '优势', summary: '依据' }], attentions: [] } },
    { label: 'B', roles: ['history'], presentation: { advantages: [], attentions: [{ title: '注意', summary: '依据' }] } },
  ], prompt: '是否需要推荐？' },
  food_candidates: [{ catalog_key: 'formula:1', brand: 'A', product_name: 'B',
    recommendation_card: { reasons: ['推荐依据'], cautions: ['待核对'], life_stage_label: '成猫' } }],
} });
assert.equal(message.healthOverview.title, '整体总结');
assert.equal(message.healthSubjects[0].roleText, '当前口粮');
assert.equal(message.healthSubjects[1].attentions.length, 1);
assert.equal(message.candidates[0].stageLabel, '成猫');
assert.equal(message.canRecordDaily, true);
for (const value of [null, undefined, '', true, 'NaN']) assert.equal(observation(value), null);
assert.equal(observation(0), 0);
const page = { ...methods, data: { chatMessages: [message], boundPet: { id: 'pet' }, sending: false },
  setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let node = this.data;
      for (const part of parts.slice(0, -1)) node = node[part];
      node[parts.at(-1)] = value;
    }
  },
  async sendCloudMessage(payload) { calls.push({ chat: payload }); },
};
(async () => {
  await page.openDailyRecord({ currentTarget: { dataset: { id: 'm' } } });
  assert.equal(page.data.dailyRecordForm.stool_count, '0');
  assert.equal(page.data.dailyRecordForm.source, 'reported_device');
  page.data.dailyRecordForm.water_count = '';
  await page.saveDailyRecord();
  const saved = calls.find((r) => r.method === 'PUT');
  assert.equal(saved.path, '/cat-profiles/pet/daily-records/' + row.day);
  assert.equal(saved.body.stool_count, 0);
  assert.equal(saved.body.water_count, null);
  assert.equal(saved.body.complete_day, false);
  assert.equal(saved.body.source, 'reported_device');
  assert.ok(calls.some((r) => r.chat?.message === '状态解读'));
  assert.equal(page.data.showDailyRecord, false);
  failRead = true;
  await page.openDailyRecord({ currentTarget: { dataset: { id: 'm' } } });
  assert.equal(page.data.dailyRecordError, '读取失败');
  const before = calls.length;
  await page.saveDailyRecord();
  assert.equal(calls.length, before);
  failRead = false;
  await page.retryDailyRecord();
  page.data.dailyRecordForm.food_count = '-1';
  await page.saveDailyRecord();
  assert.equal(calls.filter((r) => r.method === 'PUT').length, 1);
  page.data.dailyRecordForm.food_count = '3';
  account = 'other-account';
  await page.saveDailyRecord();
  assert.equal(calls.filter((r) => r.method === 'PUT').length, 1);
  account = 'a';
  page.data.boundPet.id = 'other-pet';
  await page.saveDailyRecord();
  assert.equal(calls.filter((r) => r.method === 'PUT').length, 1);
  page.data.boundPet.id = 'pet';
  await page.viewCandidate({ currentTarget: { dataset: { id: 'm', index: 0 } } });
  assert.equal(calls.at(-1).chat.interaction.slot, 'target_food');
  assert.equal(calls.at(-1).chat.interaction.value, 'formula:1');
  page.requestOtherCandidates();
  assert.equal(calls.at(-1).chat.message, '换一组');
  const wxml = fs.readFileSync('pages/assistant/index.wxml', 'utf8');
  assert.ok(wxml.indexOf('item.healthOverview') < wxml.indexOf('item.healthSubjects}}'));
  for (const binding of ['openDailyRecord', 'saveDailyRecord', 'viewCandidate', 'requestOtherCandidates']) assert.ok(wxml.includes('bindtap="' + binding + '"'));
  console.log('PASS overall/subject mapping, recommendation fields, real daily PUT payload, zero/null, failed reads, validation, account/pet guards and existing detail/alternatives actions');
})().catch((error) => { console.error(error); process.exitCode = 1; });
