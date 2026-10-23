const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = file => fs.readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
const plain = value => JSON.parse(JSON.stringify(value));
const page = definition => ({ ...definition, data: plain(definition.data || {}), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); } });
const turn = () => new Promise(resolve => setImmediate(resolve));
let definition, chat, community, captured, store = { favorites: [], posts: [], records: [] }, calls = [];
const storage = new Map();
const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), showToast() {} };
const sandbox = { wx, loadStore: () => store, saveStore: patch => Object.assign(store, patch), mediaUrl: s => s || '', formatEdited: () => '',
  api: async (path, method = 'GET', data) => { calls.push({ path, method, data }); return { items: [{ id: path, images: [], created_at: '', view_count: 4 }] }; } };
vm.runInNewContext(source('utils/community.js') + '\nexpose({fetchPosts,getFeedPosts,mapPost,reportMomentView})', { ...sandbox, expose: value => community = value });
vm.runInNewContext(source('utils/assistant-chat.js') + '\nexpose(chatMethods)', { ...sandbox, expose: value => chat = value,
  requireSession: () => true, login: async () => {}, config: { apiBaseUrl: 'http://local' },
  request: async (url, method, body) => { captured = body; return { data: { ok: true, messages: [{ id: 'm', role: 'assistant', content: 'ok' }] } }; },
});
vm.runInNewContext(source('pages/assistant/index.js'), { Page: value => definition = value, chatMethods: chat, foodMethods: {}, dailyMethods: {} });

(async () => {
  const assistant = page(definition);
  const sent = [];
  assistant.sendMessage = options => sent.push(options);
  assistant.useWelcomeShortcut({ currentTarget: { dataset: { id: 'diet' } } });
  assert.equal(sent[0].entryPoint, 'diet_advice');
  assistant.useWelcomeShortcut({ currentTarget: { dataset: { id: 'health' } } });
  assert.notEqual(sent[1].entryPoint, 'diet_advice');
  const composer = page({ ...chat, data: { inputMessage: '饮食建议', composerImages: [], boundPet: { id: 'pet' } } });
  composer.refreshChatPet = async () => {};
  composer.sendCloudMessage = async payload => { captured = payload; };
  await composer.sendMessage({ entryPoint: 'diet_advice' });
  assert.equal(captured.client_context.entry_point, 'diet_advice');
  await composer.sendMessage();
  assert.equal(captured.client_context, undefined, 'plain text must not inherit shortcut metadata');
  const cloud = page({ ...chat, data: { boundPet: { id: 'pet' }, chatMessages: [], inputMessage: '' } });
  cloud._cloudConversationId = 'conversation'; cloud.scrollChat = () => {};
  await cloud.sendCloudMessage({ message: '饮食建议', client_context: { entry_point: 'diet_advice' } }, '饮食建议');
  assert.equal(captured.client_context.entry_point, 'diet_advice');
  assert.equal(captured.client_context.capabilities.cloud_reminders_v1, true);
  assert.ok(Array.isArray(captured.client_context.recent_daily_records));

  await community.fetchPosts(false, { sort: 'popular' });
  assert.ok(calls.at(-1).path.includes('sort=popular'));
  assert.equal(community.getFeedPosts()[0].viewCount, 4);
  const before = plain(store);
  await community.fetchPosts(false, { sort: 'latest', categoryCode: 'CHIN', isCurrent: () => false });
  assert.deepEqual(plain(store), before, 'stale category responses must not overwrite cached order');
  await community.fetchPosts(true);
  assert.ok(calls.at(-1).path.includes('include_private=true'));
  assert.ok(!calls.at(-1).path.includes('popular'));
  await community.reportMomentView('p1'); const first = calls.at(-1).data.visitor_id;
  await community.reportMomentView('p2'); assert.equal(calls.at(-1).data.visitor_id, first);
  assert.match(first, /^[a-f0-9]{32}$/);

  vm.runInNewContext(source('pages/home/index.js'), { Page: value => definition = value, categories: [],
    getFeedPosts: () => [{ id: 'b', category: 'CHIN' }, { id: 'a', category: 'FUNNY' }],
    fetchPosts: async (mine, options) => { calls.push(options); }, errorText: error => error.message });
  const home = page(definition);
  await home.loadFeed(); assert.equal(calls.at(-1).sort, 'popular');
  assert.deepEqual(plain(home.data.posts.map(p => p.id)), ['b', 'a']);
  home.selectCategory({ currentTarget: { dataset: { id: 'CHIN' } } }); await turn();
  assert.equal(calls.at(-1).sort, 'latest'); assert.equal(calls.at(-1).categoryCode, 'CHIN');
  assert.deepEqual(plain(home.data.posts.map(p => p.id)), ['b']);
  let resolveOld;
  const pending = new Promise(resolve => resolveOld = resolve);
  // Exercise the real home race guard with a slow first request.
  const requests = [];
  vm.runInNewContext(source('pages/home/index.js'), { Page: value => definition = value, categories: [],
    getFeedPosts: () => [], fetchPosts: async (mine, options) => { requests.push(options); if (requests.length === 1) await pending; }, errorText: e => e.message });
  const race = page(definition);
  const old = race.loadFeed(); race.data.category = 'STOOL'; await race.loadFeed(); resolveOld(); await old;
  assert.equal(requests[0].isCurrent(), false); assert.equal(requests[1].isCurrent(), true);

  let fail = false, views = 0;
  store = { favorites: [], postCache: [], posts: [] };
  vm.runInNewContext(source('pages/pet-space/post-detail.js'), { ...sandbox, Page: value => definition = value,
    hasSession: () => false, mapPost: community.mapPost, displayPostBody: (title, body) => body,
    api: async () => { if (fail) throw Error('offline'); return { item: { id: 'p1', images: [], content: '正文' } }; },
    errorText: e => e.message, reportMomentView: async () => { views++; throw Error('statistics unavailable'); } });
  const detail = page(definition); detail.postId = 'p1'; detail.loadComments = () => {};
  fail = true; await detail.loadPost(); await turn(); assert.equal(views, 0);
  fail = false; await detail.loadPost(); await turn(); await detail.loadPost(); await turn();
  assert.equal(views, 1); assert.equal(detail.data.error, ''); assert.equal(detail.data.post.id, 'p1');

  let loginPrompts = 0, requestsSent = 0, apiClient;
  vm.runInNewContext(source('api/miniprogram.js') + '\nexpose(api)', { config: { apiBaseUrl: 'http://local' }, expose: value => apiClient = value,
    getCurrentPages: () => [], wx: { ...wx, navigateTo: () => loginPrompts++, request: options => { requestsSent++; options.success({ statusCode: 200, data: { ok: true } }); } } });
  await apiClient('/moments/p1/view', 'POST', { visitor_id: first });
  assert.equal(loginPrompts, 0); assert.equal(requestsSent, 1);
  await assert.rejects(apiClient('/moments/p1/like', 'POST'));
  assert.equal(loginPrompts, 1); assert.equal(requestsSent, 1);
  console.log('PASS diet shortcut and real cloud payload; server feed order, category isolation and racing requests; stable guest identity; detail success-only/once-per-open statistics, failure isolation and login gate');
})().catch(error => { console.error(error); process.exitCode = 1; });
