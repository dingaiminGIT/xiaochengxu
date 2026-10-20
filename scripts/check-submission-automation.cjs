const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
let methods, mapper;
const common = { console, Date, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync('utils/assistant-chat.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '') + '\nexpose(chatMethods,mapChatMessage);', {
  ...common, expose: (m, f) => { methods = m; mapper = f; },
});
assert.equal(mapper({role:'user',content:'**保留用户原话**'}).blocks.length,0);
const old=mapper({role:'assistant',content:'❗ **资料不足**：不能确认效果。'});
assert.equal(old.blocks[0].marker,'❗');
assert.equal(old.blocks[0].segments[0].strong,true);
assert.equal(old.blocks[0].segments[0].text,'资料不足');
let definition, prompt, requested=[], account='u1', signedIn=true, loginPrompts=0, expireNext=false, entry=null;
const ctx={...common, Page: d=>definition=d, previewIngredientExample(){}, requireSession:()=>{loginPrompts++;return signedIn;},
  errorText:e=>e.message,
  hasSession:()=>signedIn, login:async()=>({}), accountKey:()=>account, api:async (...args)=>{
    if(expireNext){expireNext=false;signedIn=false;throw new Error('请重新登录');}
    requested.push(args);return {ok:true};},
  wx:{getEnterOptionsSync:()=>entry,requestSubscribeMessage:o=>{prompt=o;}, showToast(){}}
};
vm.runInNewContext(fs.readFileSync('pages/pet-space/food-submissions.js','utf8').replace(/^import .*;$/gm,''),ctx);
const item={id:'s1',result_notification:{enabled:true,template_id:'template'}};
const page={...definition,data:{selected:item,subscribing:false},setData(p){Object.assign(this.data,p);}};
(async()=>{
  const direct={...definition,data:{},getOpenerEventChannel:()=>({}),setData(p){Object.assign(this.data,p);}};
  direct.onLoad({id:'notification-submission'});
  signedIn=false;direct.onShow();
  assert.equal(loginPrompts,1,'notification deep link must open login when signed out');
  assert.equal(direct._initialId,'notification-submission','keep destination until login completes');
  let resumed=false;direct.load=()=>{resumed=true;};signedIn=true;direct.onShow();assert(resumed);
  const warm={...definition,data:{creating:true,selected:{id:'previous'}},getOpenerEventChannel:()=>({}),setData(p){Object.assign(this.data,p);},load(){}};
  warm.onLoad({});signedIn=false;loginPrompts=0;
  entry={path:'pages/assistant/index',query:{id:'unrelated'}};warm.onShow();assert.equal(warm._initialId,'');
  entry={path:'pages/pet-space/food-submissions',query:{id:'hot-notification'}};warm.onShow();
  assert.equal(warm._initialId,'hot-notification');assert.equal(warm.data.creating,false);assert.equal(loginPrompts,1);
  warm._initialId='';warm.onShow();assert.equal(warm._initialId,'','do not reopen a consumed entry on ordinary page show');
  warm.signIn();assert.equal(loginPrompts,2,'signed-out list offers a working login action');
  entry=null;signedIn=true;
  const expired={...definition,_active:true,_initialId:'expired-session-submission',data:{items:[]},setData(p){Object.assign(this.data,p);}};
  expireNext=true;loginPrompts=0;await expired.load();
  assert.equal(loginPrompts,1,'expired session must reopen login for notification links');
  assert.equal(expired._initialId,'expired-session-submission');
  assert.equal(expired._loading,false);signedIn=true;
  page.subscribeResult();assert(prompt);assert.equal(requested.length,0,'authorization must run inside click before network');
  await prompt.success({template:'accept'});assert.equal(requested[0][0],'/food-submissions/s1/result-subscription');
  assert.equal(requested[0][2].decision,'accept');assert.equal(page.data.subscribing,false);
  requested=[];page.subscribeResult();account='u2';await prompt.success({template:'accept'});
  assert.equal(requested.length,0,'switching accounts must discard the old authorization binding');
  account='u1';page.data.subscribing=false;page.subscribeResult();await prompt.success({template:'reject'});
  assert.equal(requested[0][2].decision,'reject');
  assert(fs.readFileSync('pages/assistant/index.wxml','utf8').includes('segment.strong'));
  assert(fs.readFileSync('pages/pet-space/food-submissions.js','utf8').includes('i.isProcessing'));
  console.log('PASS: emphasis, legacy messages, user text, notification deep link/login recovery, click-time subscription, refusal, account isolation, pipeline polling');
})().catch(e=>{console.error(e);process.exit(1);});
