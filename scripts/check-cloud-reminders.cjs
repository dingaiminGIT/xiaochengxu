// Run the real repository and page handlers against delayed/offline API replies.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
let account = 'a', session = true, failure, pending, calls = [], pageDefinition, navigation = 0;
const stores = { a: { reminders: [], reminderHistory: [] }, b: { reminders: [], reminderHistory: [] } };
const loadStore = () => stores[account];
const saveStore = patch => Object.assign(stores[account], patch);
const ctx = { loadStore, saveStore, accountKey: () => account, hasSession: () => session, requireSession() {},
  api: async (path, method, data) => {
    calls.push({ path, method, data });
    if (pending) return pending;
    if (failure) throw failure;
    if (!method) return { items: [{ id: 'cloud', title: '聊天设置的提醒', dueAt: 2000000000000, repeat: 'none', cloud: true }], history: [] };
    if (path.endsWith('/complete')) return { item: null, history: { id: 'completed', cloud: true, completedAt: Date.now() } };
    if (method === 'DELETE') return { ok: true };
    return { item: { id: 'saved', title: data.title, dueAt: data.dueAt, repeat: data.repeat, cloud: true } };
  }, console, Date, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('utils/reminders.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, ''), ctx);
vm.runInContext(fs.readFileSync('utils/reminder-api.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '') + '\nthis.cloud = {refreshCloudReminders,saveCloudReminder,completeCloudReminder,deleteCloudReminder,importLegacyReminders};', ctx);
(async () => {
  const cloud = ctx.cloud;
  stores.a.reminders = [{ id: 'legacy', title: '旧提醒', dueAt: 2000000000000, repeat: 'none', type: 'food' }];
  await cloud.refreshCloudReminders();
  assert.equal(stores.a.reminders.length, 2);
  assert(stores.a.reminders.some(r => r.id === 'legacy'));
  failure = new Error('offline');
  const snapshot = JSON.stringify(stores.a);
  await assert.rejects(cloud.refreshCloudReminders(), /offline/);
  const form = { title: '买粮', type: 'food', date: '2027-01-05', time: '09:00', repeat: 'none', petId: 'p' };
  await assert.rejects(cloud.saveCloudReminder(form, 'retry-key'), /offline/);
  assert.equal(JSON.stringify(stores.a), snapshot);
  failure = null;
  await cloud.saveCloudReminder(form, 'retry-key');
  assert.equal(calls.at(-1).data.idempotency_key, 'retry-key');
  assert.equal(calls.at(-1).data.pet_id, 'p');
  await cloud.completeCloudReminder('saved', stores.a.reminders.find(r => r.id === 'saved').dueAt);
  assert(stores.a.reminderHistory.some(r => r.id === 'completed'));
  assert(!stores.a.reminders.some(r => r.id === 'saved'));
  let release;
  pending = new Promise(resolve => { release = resolve; });
  const request = cloud.refreshCloudReminders();
  account = 'b'; release({ items: [{ id: 'a-secret' }], history: [] });
  await assert.rejects(request, /账号已变化/);
  assert.equal(stores.b.reminders.length, 0);
  pending = null; account = 'a';
  const imported = await cloud.importLegacyReminders();
  assert.equal(imported.imported, 1);
  assert.equal(imported.failed.length, 0);
  assert(!stores.a.reminders.some(r => r.id === 'legacy'));
  session = false;
  await assert.rejects(cloud.saveCloudReminder(form, 'another'), /登录/);
  session = true;

  // A page must keep the form open and must not show success after write failure.
  const pageContext = { ...ctx, Page: p => { pageDefinition = p; },
    reminderTypes: [{ id: 'custom', name: '自定义', icon: 'bell' }], repeatOptions: [{ id: 'none', label: '不重复' }],
    listReminders: () => [], localDate: () => '2027-01-01', localTime: () => '09:00',
    refreshCloudReminders: async () => ({}), saveCloudReminder: async () => { throw new Error('保存失败'); },
    deleteCloudReminder: async () => {}, currentPet: () => ({ id: 'p' }), cachePetList() {}, mapPet: p => p,
    wx: { showToast() {}, navigateBack: () => navigation++ } };
  vm.runInNewContext(fs.readFileSync('pages/pet-space/reminder-edit.js', 'utf8').replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, ''), pageContext);
  const page = { ...pageDefinition, data: { ...pageDefinition.data, title: '买粮', date: '2027-01-05', time: '09:00' }, _account: 'a', _requestKey: 'page-key', setData(patch) { Object.assign(this.data, patch); } };
  await page.save(); assert.equal(navigation, 0); assert.equal(page.data.saving, false);
  console.log('PASS cloud reminder cache/legacy preservation, failed writes, stable keys, completion history, delayed account isolation, explicit import, login and page failure UX');
})().catch(error => { console.error(error); process.exitCode = 1; });
