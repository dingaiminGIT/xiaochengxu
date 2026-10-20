const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let definition,calls=[];
vm.runInNewContext(fs.readFileSync('pages/pet-space/food-list.js','utf8').replace(/^import .*;$/gm,''),{
 Page:d=>{definition=d},accountKey:()=> 'a',requireSession:()=>true,errorText:e=>e.message,
 wx:{showToast(){}},api:async(path,method,body)=>{calls.push({path,method,body:JSON.parse(JSON.stringify(body||{}))});return {ok:true,suggestions:[{brand:'牌',product_name:'粮',product_id:10,formula_id:20}]}}
});
const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),_active:true,load:async()=>{},
 setData(patch){for(const[key,value]of Object.entries(patch)){const parts=key.split('.');let node=this.data;for(const part of parts.slice(0,-1))node=node[part];node[parts.at(-1)]=value;}}};
(async()=>{
 page.data.pet={id:'pet'};page.data.history=true;page.data.editing=true;page.data.form={brand:'牌',product:'粮',started_on:'',ended_on:'',note:''};
 await page.searchCatalog();assert.equal(page.data.catalogChoices.length,1);
 page.selectCatalogFood({currentTarget:{dataset:{id:'20'}}});assert.equal(page.data.form.formula_id,20);
 await page.save();assert.equal(calls.at(-1).method,'POST');assert.equal(calls.at(-1).body.formula_id,20);assert.equal(calls.at(-1).body.product_id,10);
 page.data.history=false;page.data.editing=true;await page.save();assert.equal(calls.at(-1).method,'PATCH');assert.equal(calls.at(-1).body.diet.formula_id,20);
 page.input({currentTarget:{dataset:{key:'product'}},detail:{value:'手工改名'}});assert.equal(page.data.form.formula_id,null);assert.equal(page.data.form.product_id,null);
 console.log('PASS explicit catalogue selection, numeric product/formula IDs in history/current payloads and invalidation on manual edits');
})().catch(e=>{console.error(e);process.exitCode=1});
