const fs = require('fs'),
  vm = require('vm'),
  assert = require('node:assert/strict');
let calls = [];
const ctx = {
  loadStore: () => ({ pets: [{ food_brand: '鲜朗' }] }),
  mediaUrl: (x) => x,
  api: async (path) => {
    calls.push(path);
    return {
      [path.includes('/search?') ? 'suggestions' : 'items']: [
        { catalog_key: 'formula:34', product_id: 12, formula_id: 34, brand: '皇家', product_name: 'BK34' },
      ],
    };
  },
};
vm.createContext(ctx);
vm.runInContext(
  fs
    .readFileSync('utils/food-catalog.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/export /g, '') + '\nthis.fetch=fetchFoodCatalog;this.mapFood=mapCatalogFood;',
  ctx,
);
(async () => {
  await ctx.fetch('', 4);
  assert.match(calls[0], /products\?brand=.*limit=4$/);
  calls = [];
  const result = await ctx.fetch(' 皇家肠胃舒适 ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], '/products/search?q=' + encodeURIComponent('皇家肠胃舒适') + '&limit=20');
  assert.equal(result.items.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.mapFood(result.items[0]))), {
    id: 'formula:34',
    catalog_key: 'formula:34',
    product_id: 12,
    formula_id: 34,
    name: 'BK34',
    brand: '皇家',
    displayText: '',
    image: '',
  });
  ctx.api = async () => {
    throw Error('offline');
  };
  await assert.rejects(ctx.fetch('品牌'), /offline/);
  let definition,
    savedPets,
    write;
  vm.runInNewContext(fs.readFileSync('pages/pet-space/hunting.js', 'utf8').replace(/^import .*;\n/gm, ''), {
    Page: (p) => (definition = p),
    fetchFoodCatalog: (q) => new Promise((resolve) => pending.push({ q, resolve })),
    mapCatalogFood: (x) => x,
    errorText: (e) => e.message,
    requireSession: () => true,
    accountKey: () => 'u1',
    cachePetList: (pets) => {
      savedPets = pets;
      return { pets, selectedPetId: 'pet-1' };
    },
    currentPet: (store) => (store?.pets || [{ id: 'pet-1', name: '胖胖' }]).find((p) => p.id === 'pet-1'),
    mapPet: (pet) => ({ ...pet, mapped: true }),
    api: async (path, method, data) => {
      if (method === 'PATCH') {
        write = { path, method, data };
        return {
          ok: true,
          item: {
            id: 'pet-1',
            name: '胖胖',
            food_brand: '蓝氏',
            food_product: '猎鸟乳鸽2.0',
            food_product_id: 144,
            food_formula_id: 290,
            diet: { brand: '蓝氏', product: '猎鸟乳鸽2.0', product_id: 144, formula_id: 290 },
          },
        };
      }
      return { ok: true, items: [{ id: 'pet-1', name: '胖胖' }] };
    },
    wx: { showToast: () => {}, navigateTo: () => {} },
  });
  const pending = [];
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(p) {
      Object.assign(this.data, p);
    },
  };
  page.data.query = 'old';
  const old = page.search();
  page.data.query = 'new';
  const latest = page.search();
  pending[1].resolve({ items: [{ id: 'new' }] });
  await latest;
  pending[0].resolve({ items: [{ id: 'old' }] });
  await old;
  assert.equal(page.data.items[0].id, 'new');
  page.data.selected = {
    id: 'formula:290',
    catalog_key: 'formula:290',
    product_id: 144,
    formula_id: 290,
    brand: '蓝氏',
    name: '猎鸟乳鸽2.0',
  };
  await page.setCurrentDiet();
  assert.deepEqual(JSON.parse(JSON.stringify(write)), {
    path: '/cat-profiles/pet-1',
    method: 'PATCH',
    data: { diet: { product_id: 144, formula_id: 290 } },
  });
  assert.equal(savedPets[0].food_formula_id, 290);
  assert.equal(savedPets[0].mapped, true);
  console.log('PASS: catalog IDs, combined search, failure/stale responses and formula-linked current-diet save');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
