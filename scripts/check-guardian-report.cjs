const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let map, methods, component;
const source = fs.readFileSync('utils/assistant-chat.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(source + '\nexpose(mapChatMessage, chatMethods);', {
  expose: (mapper, m) => { map = mapper; methods = m; }, requireSession: () => true,
});
vm.runInNewContext(fs.readFileSync('components/guardian-report/index.js', 'utf8'), { Component: (value) => { component = value; } });
const report = { schema: 'guardian_report', version: 1, report_id: 'report-a', scene: 'product_comparison',
  pet: { name: '胖胖', breed: '英短', life_stage: '成年期' }, summary: { text: '整体总结' },
  feeding: { products: [], comparisons: [{ status: 'comparable', dimensions: [{
    left: { score: .5, scale_max: 1 }, right: { score: 4, scale_max: 5 },
  }] }] }, community: { items: [] }, next_steps: { prompt: '接下来' },
};
const interaction = { slot: 'food_analysis_usage', analysis_id: 'report-a', options: [{ value: 'current:report-a', label: '已经在吃' }] };
const message = map({ id: 'm1', role: 'assistant', content: '旧正文', result: { guardian_report: report }, interaction });
assert.equal(message.guardianReport.report_id, 'report-a');
assert.equal(message.canInteract, true);
assert.equal(message.interaction.analysis_id, 'report-a');
assert.equal(message.interaction.options[0].value, 'current:report-a');
for (const invalid of [{ ...report, version: 2 }, { ...report, schema: 'other' }, { version: 1 }, null]) {
  const legacy = map({ role: 'assistant', content: '旧正文', result: { guardian_report: invalid } });
  assert.equal(legacy.guardianReport, null);
  assert.equal(legacy.text, '旧正文');
}
assert.equal(map({ role: 'user', result: { guardian_report: report } }).guardianReport, null);
const instance = { ...component.methods, data: { ...component.data }, setData(data) { Object.assign(this.data, data); } };
component.properties.report.observer.call(instance, report);
assert.equal(instance.data.comparisons[0].dimensions[0].leftWidth, 50);
assert.equal(instance.data.comparisons[0].dimensions[0].rightWidth, 80);
instance.selectTab({ currentTarget: { dataset: { tab: 'community' } } });
assert.equal(instance.data.activeTab, 'community');
instance.selectTab({ currentTarget: { dataset: { tab: 'invalid' } } });
assert.equal(instance.data.activeTab, 'community');
instance.toggleScores();
assert.equal(instance.data.showScores, true);
component.properties.report.observer.call(instance, { ...report, report_id: 'new-report' });
assert.equal(instance.data.showScores, false);
assert.equal(instance.data.activeTab, 'advice');
assert.equal(instance.barWidth({ score: null, scale_max: 1 }), 0);
assert.equal(instance.barWidth({ score: Infinity, scale_max: 1 }), 0);
assert.equal(instance.barWidth({ score: 3, scale_max: 1 }), 100);
console.log('PASS unified report live/history mapping, unknown-version fallback, scoped interactions, tabs, score scales and state reset');
