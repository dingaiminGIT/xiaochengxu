// Requirement 23 UI contracts: no network, account changes or model calls.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
let methods, map;
const code = fs
  .readFileSync('utils/assistant-chat.js', 'utf8')
  .replace(/^import .*;$/gm, '')
  .replace(/export /g, '');
vm.runInNewContext(code + '\nexpose(chatMethods, mapChatMessage);', {
  expose(m, fn) {
    methods = m;
    map = fn;
  },
});
const raw = {
  id: 'analysis-message',
  role: 'assistant',
  response_type: 'result_card',
  content: '完整旧版文字回退',
  interaction: {
    slot: 'food_health_recommendation',
    analysis_id: 'analysis-23',
    options: [
      { label: '需要推荐新粮', value: 'yes' },
      { label: '暂时不用', value: 'no' },
    ],
  },
  result: {
    food_candidates: [],
    health_analysis: {
      subjects: [
        {
          label: '完整粮名',
          concerns: [{ title: '便便状态', tag: '重点观察', evidence_text: '纤维支持偏低' }],
          skipped_dimensions: ['脂肪负担'],
          missing_dimensions: ['蛋白质量'],
          unmapped_dimensions: [],
        },
      ],
      comparisons: [{ left: '当前粮', right: '历史粮', text: '有依据的比较' }],
      prompt: '是否需要推荐？',
    },
  },
};
const mapped = map(raw);
assert.equal(mapped.healthSubjects[0].missingText, '蛋白质量');
assert.equal(mapped.healthSubjects[0].skippedText, '脂肪负担');
assert.equal(mapped.healthComparisons[0].text, '有依据的比较');
assert.equal(mapped.healthPrompt, '是否需要推荐？');
assert.equal(mapped.candidates.length, 0);
assert.equal(mapped.text, raw.content);
for (const index of [0, 1]) {
  let sent;
  const page = {
    data: { chatMessages: [mapped] },
    sendCloudMessage(payload) {
      sent = payload;
    },
  };
  methods.chooseChatOption.call(page, { currentTarget: { dataset: { id: raw.id, index } } });
  assert.equal(sent.interaction.analysis_id, 'analysis-23');
  assert.equal(sent.interaction.value, index ? 'no' : 'yes');
  mapped.canInteract = false;
  sent = null;
  methods.chooseChatOption.call(page, { currentTarget: { dataset: { id: raw.id, index } } });
  assert.equal(sent, null);
  mapped.canInteract = true;
}
const legacy = map({ role: 'assistant', content: '旧接口回复', result: {} });
assert.equal(legacy.healthSubjects.length, 0);
assert.equal(legacy.text, '旧接口回复');
console.log(
  'PASS health concern/comparison rendering data, scoped yes/no payload, disabled stale choices and legacy fallback',
);
