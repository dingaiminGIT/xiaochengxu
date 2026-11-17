const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let map, methods;
const source = fs.readFileSync('utils/assistant-chat.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(source + '\nexpose(mapChatMessage, chatMethods);', { expose: (f, m) => { map = f; methods = m; }, wx: { showToast() {} } });
const packet = {version: 1, pet_id: 'cat', refresh_token: 'latest', has_more: true, note: '待核验', items: [
  {product_key: 'a', brand: '品牌', product_name: '粮', function_summary: '原文功能', cautions: ['配料待核验']},
  {product_key: 'b', brand: '另一个品牌', product_name: '未明确', entity_level: 'brand'},
]};
const original = {id: 'm', role: 'assistant', content: '旧版完整正文', result: {intent: 'food_switch', product_recommendations: packet}};
const msg = map(JSON.parse(JSON.stringify(original)));
assert.equal(msg.productRecommendations.length, 2);
assert.equal(msg.productRecommendations[1].productLabel, '具体产品未明确');
assert.equal(msg.productRecommendations[0].function_summary, '原文功能');
assert.equal(msg.text, '旧版完整正文'); assert.equal(msg.candidates.length, 0);
assert.equal(map({...original, role: 'user'}).productRecommendations.length, 0);
assert.equal(map({...original, result: {product_recommendations: {...packet, version: 9}}}).productRecommendations.length, 0);
assert.equal(map({...original, result: {product_recommendations: {...packet, items: null}}}).productRecommendations.length, 0);
assert.equal(map({role: 'assistant', content: '旧记录'}).productRecommendations.length, 0);
const sent=[];
const page={data:{sending:false,boundPet:{id:'cat'},chatMessages:[msg]},_cloudPetId:'cat',sendCloudMessage:p=>sent.push(p)};
const event={currentTarget:{dataset:{id:'m'}}};
methods.refreshProductRecommendations.call(page,event);
assert.equal(sent[0].interaction.slot,'product_recommendation_refresh');
assert.equal(sent[0].interaction.value,'latest');
page.data.sending=true;methods.refreshProductRecommendations.call(page,event);assert.equal(sent.length,1);
page.data.sending=false;page._cloudPetId='dog';methods.refreshProductRecommendations.call(page,event);assert.equal(sent.length,1);
page._cloudPetId='cat';page.data.boundPet.id='dog';methods.refreshProductRecommendations.call(page,event);assert.equal(sent.length,1);
page.data.boundPet.id='cat';msg.canRefreshProducts=false;methods.refreshProductRecommendations.call(page,event);assert.equal(sent.length,1);
console.log('PASS recommendation mapping, source copy, brand-only, history/unknown versions, refresh token, pet boundary and sending guard');
