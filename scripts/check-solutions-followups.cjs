const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let map, methods;
vm.runInNewContext(fs.readFileSync('utils/assistant-chat.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '') + '\nexpose(mapChatMessage, chatMethods);', {
  expose: (f, m) => { map = f; methods = m; }, requireSession: () => true, wx: {showToast() {}},
});
const original = {id: 'old-card', role: 'assistant', content: '推荐', result: {product_recommendations: {
  version: 1, status: 'ready', pet_id: 'cat', items: [{product_key: 'old', brand: '品牌', product_name: '产品'}],
  questions: ['功能描述有什么区别？', '蛋白质脂肪怎么看？', '还缺哪些信息？'],
}}};
const msg = map(original);
assert.equal(msg.productQuestions.length, 3);
assert.equal(map({role: 'assistant', content: '历史普通回答'}).productQuestions.length, 0);
assert.equal(map({...original, result: {product_recommendations: {...original.result.product_recommendations, status:'no_match'}}}).productQuestions.length, 0);
const sent=[];
const page={data:{sending:false,boundPet:{id:'cat'},chatMessages:[msg]},_cloudPetId:'cat',sendCloudMessage:p=>sent.push(p)};
page.askTaskQuestion=e=>methods.askTaskQuestion.call(page,e);
const event={currentTarget:{dataset:{id:'old-card',index:1}}};
methods.askProductQuestion.call(page,event);
assert.equal(sent[0].source_message_id,'old-card'); assert.equal(sent[0].message,msg.productQuestions[1]);
page.data.sending=true;methods.askProductQuestion.call(page,event);assert.equal(sent.length,1);
page.data.sending=false;page._cloudPetId='another';methods.askProductQuestion.call(page,event);assert.equal(sent.length,1);
page._cloudPetId='cat';methods.askTaskQuestion.call(page,{currentTarget:event.currentTarget,detail:{question:'伪造'}});assert.equal(sent.length,1);
let component;
vm.runInNewContext(fs.readFileSync('components/health-knowledge/index.js','utf8'),{Component:c=>{component=c;}});
const health={data:{},setData(values,cb){Object.assign(this.data,values);if(cb)cb();},triggerEvent(){}};
const groups=Array.from({length:4},(_,i)=>({cause:'原因'+i,solution:{version:1,status:'matched',source_id:100+i,steps:['观察'+i]}}));
component.properties.knowledge.observer.call(health,{groups,questions:[]});
assert.equal(health.data.visibleGroups[0].solution.source_id,100);
component.methods.nextGroup.call(health);assert.equal(health.data.visibleGroups[0].solution.source_id,103);
component.methods.nextGroup.call(health);assert.equal(health.data.visibleGroups[0].solution.source_id,100);
console.log('PASS fixed follow-up mapping, source binding, sending/pet guards, health pagination keeps cause-solution association');
