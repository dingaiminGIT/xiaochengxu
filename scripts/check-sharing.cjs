const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('utils/share.js', 'utf8').replace(/export /g, ''), context);
const { shareCard, timelineCard, supplyShare } = context;
const item = { id: 'formula:1&2', brand: '品牌', name: '鱼 & 鸡', image: 'https://example.com/food.png' };
for (const path of ['/pages/pet-space/hunting', '/pages/pet-space/supplies']) {
  const card = supplyShare('food', item, path);
  assert.equal(card.path.split('?')[0], path);
  const query = new URLSearchParams(timelineCard(card).query);
  assert.equal(query.get('id'), item.id);
  assert.equal(query.get('q'), '品牌 鱼 & 鸡');
  assert.equal(query.has('petId'), false);
  assert.equal(card.imageUrl, item.image);
}
assert.equal(shareCard('入口', '/pages/home/index', {}, 'wxfile://private').imageUrl, '/static/design/home-hero.png');
let definition;
const notices = [];
vm.runInNewContext(fs.readFileSync('pages/pet-space/hunting.js', 'utf8').replace(/^import .*;$/gm, ''), {
  Page: p => definition = p,
  supplyShare, timelineCard,
  accountKey: () => 'guest',
  mapCatalogFood: p => p,
  fetchFoodCatalog: async () => ({ items: [item] }),
  errorText: e => e.message,
  wx: { showToast: p => notices.push(p.title) },
});
const page = { ...definition, data: { ...definition.data }, setData(p) { Object.assign(this.data, p); } };
(async () => {
  const card = supplyShare('food', item, '/pages/pet-space/hunting');
  const query = Object.fromEntries(new URLSearchParams(card.path.split('?')[1]));
  page.onLoad(query);
  await page.search();
  assert.equal(page.data.selected.id, item.id);
  page._sharedItemId = 'deleted';
  await page.search();
  assert.equal(page.data.selected, null);
  assert.equal(notices.length, 1);
  console.log('PASS: share query round-trip, timeline route, private-cover fallback, guest detail restoration and missing item');
})().catch(e => { console.error(e); process.exitCode = 1; });
