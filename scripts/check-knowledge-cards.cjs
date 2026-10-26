const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
let map, markdown, methods;
const code = fs.readFileSync('utils/assistant-chat.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(code + '\nexpose(mapChatMessage, knowledgeMarkdown, chatMethods);', {
  expose: (a, b, c) => { map = a; markdown = b; methods = c; }, requireSession: () => true,
});
const reply = { id: 'm1', role: 'assistant', content: '先看结论\n可以提供猫抓板。', result: {
  pipeline: 'knowledge_qa', knowledge_qa: { review_note: '资料尚未专业验证。' }, data: [
    { type: 'actions', title: '不信任这个标题', content: '- 提供**猫抓板**。\n- 引导磨爪。' },
    { type: 'conclusion', content: '可以提供猫抓板。' },
    { type: 'related_questions', content: '- 放哪里？', questions: ['猫抓板放在哪里？'] },
  ],
} };
const restored = map(JSON.parse(JSON.stringify(reply)));
assert.equal(restored.knowledgeCards[0].type, 'conclusion');
assert.equal(restored.knowledgeCards[1].title, '怎么做');
assert.equal(restored.knowledgeCards[1].nodes[0].name, 'ul');
assert.equal(restored.knowledgeCards[1].nodes[0].children[0].children[1].name, 'strong');
assert.equal(restored.knowledgeNote, '资料尚未专业验证。');
assert.equal(map({ role: 'assistant', content: '旧版回复' }).knowledgeCards.length, 0);
assert.equal(map({ ...reply, result: { ...reply.result, pipeline: 'food_analysis' } }).knowledgeCards.length, 0);
const unsafe = JSON.stringify(markdown('<script>alert(1)</script>\n![追踪](https://evil.test/image)\n[链接](javascript:alert)'));
assert(!unsafe.includes('"name":"script"'));
assert(!unsafe.includes('"name":"img"'));
assert(!unsafe.includes('"href"'));
const sent = [];
const page = { data: { chatMessages: [restored], boundPet: { id: 'cat' }, sending: false },
  _cloudPetId: 'cat', sendCloudMessage: (payload, text) => sent.push({ payload, text }) };
const event = { currentTarget: { dataset: { id: 'm1', cardIndex: 2, questionIndex: 0, question: '伪造文字' } } };
methods.askKnowledgeQuestion.call(page, event);
assert.equal(sent[0].payload.message, '猫抓板放在哪里？');
page.data.sending = true;
methods.askKnowledgeQuestion.call(page, event);
assert.equal(sent.length, 1);
page.data.sending = false;
page._cloudPetId = 'dog';
methods.askKnowledgeQuestion.call(page, event);
assert.equal(sent.length, 1);
console.log('PASS knowledge cards: live/history, Markdown, old replies, safe followup and pet scope');
