// Exercise real mini-program handlers against an offline API; no live account writes.
const fs = require('fs'),
  vm = require('vm'),
  assert = require('node:assert/strict');
let definition,
  methods,
  mapper,
  calls = [],
  account = 'u1',
  modal,
  navigated;
let pet = { id: 'p1', name: '团团', diet: { brand: '当前牌', product: 'A' } };
let history = [
  {
    id: 'current',
    brand: '当前牌',
    product: 'A',
    is_current: true,
    source: 'profile_confirmed',
    observed_on: '2026-10-11',
    health_topics: [],
  },
  {
    id: 'old',
    brand: '历史牌',
    product: 'H',
    is_current: false,
    started_on: '2026-09-01',
    ended_on: '2026-09-30',
    health_topics: [{ label: '排便与肠胃', conversation_count: 2 }],
    association_available: true,
  },
];
const api = async (...args) => {
  calls.push(args);
  if (args[0] === '/cat-profiles?limit=100' || args[0] === '/cat-profiles') return { items: [pet] };
  if (args[1]) return { ok: true };
  return { items: history, association_note: '仅表示同期咨询，不代表因果', has_more: false };
};
const wx = {
  showToast() {},
  showModal: (o) => {
    modal = o;
  },
  navigateTo: (o) => {
    navigated = o.url;
  },
  getStorageSync: () => [],
  setStorageSync() {},
};
const ctx = {
  Page: (p) => {
    definition = p;
  },
  api,
  wx,
  accountKey: () => account,
  requireSession: () => true,
  hasSession: () => true,
  errorText: (e) => e.message,
  petDiet: (p) => p.diet,
  dietHistory: () => [],
  loadStore: () => ({}),
  saveStore: () => {},
  console,
  Date,
};
vm.runInNewContext(fs.readFileSync('pages/pet-space/food-list.js', 'utf8').replace(/^import .*;$/gm, ''), ctx);
function page(def) {
  return {
    ...def,
    data: JSON.parse(JSON.stringify(def.data || {})),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const [a, b] = key.split('.');
        if (b) this.data[a][b] = value;
        else this.data[a] = value;
      }
    },
  };
}
(async () => {
  const list = page(definition);
  list.petId = 'p1';
  list._active = true;
  list.data.history = true;
  await list.load();
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].id, 'old');
  assert.match(list.data.items[0].healthText, /2次咨询/);
  list.edit();
  list.data.form = {
    brand: '补录牌',
    product: 'B',
    started_on: '2026-09-01',
    ended_on: '2026-09-30',
    note: '适应良好',
  };
  await list.save();
  const saved = calls.find((c) => c[1] === 'POST');
  assert.equal(saved[0], '/cat-profiles/p1/diet-history');
  assert.equal(saved[2].started_on, '2026-09-01');
  assert(!calls.some((c) => c[1] === 'PATCH'));
  list.removeHistory({ currentTarget: { dataset: { id: 'old' } } });
  await modal.success({ confirm: false });
  assert(!calls.some((c) => c[1] === 'DELETE'));
  await modal.success({ confirm: true });
  assert(calls.some((c) => c[0] === '/cat-profiles/p1/diet-history/old' && c[1] === 'DELETE'));
  list.data.history = false;
  await list.load();
  assert.equal(list.data.items[0].id, 'current');
  list.edit();
  list.data.form = { brand: '新牌', product: 'C' };
  await list.save();
  assert(calls.some((c) => c[0] === '/cat-profiles/p1' && c[1] === 'PATCH'));

  vm.runInNewContext(
    fs
      .readFileSync('utils/assistant-chat.js', 'utf8')
      .replace(/^import .*;$/gm, '')
      .replace(/export /g, '') + '\nexpose(chatMethods, mapChatMessage);',
    {
      ...ctx,
      expose: (m, fn) => {
        methods = m;
        mapper = fn;
      },
      login: async () => {},
      mapPet: (p) => p,
      loadStore: () => ({ pet }),
      saveStore: () => {},
      setModalData: (p, v) => p.setData(v),
      config: { apiBaseUrl: 'https://example.test' },
      request: async () => ({ data: {} }),
    },
  );
  const msg = mapper({
    id: 'm1',
    result: {
      recommendation: { status: 'ready', note: '测试候选' },
      food_candidates: [{ formula_id: 10, product_id: 11, brand: '候选牌', product_name: 'X' }],
      actions: [
        { type: 'flow_handoff', label: '继续选粮', target_flow: 'food_switch' },
        { type: 'diet_history', label: '历史口粮' },
      ],
    },
  });
  const chat = page(methods);
  chat.data = { boundPet: pet, chatMessages: [msg], sending: false };
  chat.sendCloudMessage = (...args) => {
    chat.sent = args;
  };
  chat.useGuardianAction({ currentTarget: { dataset: { id: 'm1', index: 0 } } });
  assert.equal(chat.sent[0].message, '帮我推荐一款主粮');
  chat.useGuardianAction({ currentTarget: { dataset: { id: 'm1', index: 1 } } });
  assert.equal(navigated, '/pages/pet-space/food-list?mode=history&petId=p1');
  calls = [];
  chat.confirmCandidateDiet({ currentTarget: { dataset: { id: 'm1', index: 0 } } });
  assert.equal(modal.confirmText, '已开始吃');
  await modal.success({ confirm: false });
  assert.equal(calls.length, 0);
  await modal.success({ confirm: true });
  assert.equal(calls[0][0], '/cat-profiles/p1');
  assert.equal(calls[0][1], 'PATCH');
  assert.equal(calls[0][2].diet.formula_id, 10);
  assert.equal(chat.data.sending, false);
  calls = [];
  chat.confirmCandidateDiet({ currentTarget: { dataset: { id: 'm1', index: 0 } } });
  account = 'u2';
  await modal.success({ confirm: true });
  assert.equal(calls.length, 0);
  account = 'u1';
  chat.confirmCandidateDiet({ currentTarget: { dataset: { id: 'm1', index: 0 } } });
  chat.data.boundPet = { id: 'p2' };
  await modal.success({ confirm: true });
  assert.equal(calls.length, 0);
  console.log(
    'PASS: cloud history and topic mapping, backfill/delete/current save, flow actions, explicit feeding confirmation, account/pet isolation',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
