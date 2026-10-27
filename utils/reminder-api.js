// Cloud writes and account-safe cache. The local repository remains for old records.
import { api, hasSession, requireSession } from '../api/miniprogram';
import { accountKey, loadStore, saveStore } from './pet-store';
import { resolveReminderTime, listReminders, listReminderHistory, completeReminder, deleteReminder } from './reminders';

function sameAccount(account) {
  if (account !== accountKey('reminders')) throw new Error('账号已变化，请重新打开提醒');
}
function accountForWrite() {
  if (!hasSession()) {
    requireSession();
    throw new Error('请先登录后保存云端提醒');
  }
  return accountKey('reminders');
}
function cacheItem(item, replacedId = '') {
  if (!item) return;
  const items = listReminders().filter((r) => r.id !== item.id && r.id !== replacedId);
  saveStore({ reminders: [...items, { ...item, cloud: true }] });
}
export function legacyReminders() {
  return listReminders().filter((r) => !r.cloud);
}
export async function refreshCloudReminders() {
  if (!hasSession()) return { items: listReminders(), localOnly: true };
  const account = accountKey('reminders');
  const result = await api('/reminders');
  sameAccount(account);
  saveStore({
    reminders: [...legacyReminders(), ...(result.items || []).map((r) => ({ ...r, cloud: true }))],
    reminderHistory: [...listReminderHistory().filter((r) => !r.cloud), ...(result.history || []).map((r) => ({ ...r, cloud: true }))],
  });
  return result;
}
export async function saveCloudReminder(form, requestKey) {
  const account = accountForWrite();
  const existing = listReminders().find((r) => r.id === form.id);
  const payload = { title: form.title, type: form.type, dueAt: resolveReminderTime(form, Date.now(), existing),
    repeat: form.repeat, pet_id: form.petId || '', note: form.note || '', idempotency_key: requestKey };
  if (existing && !existing.cloud) payload.legacy_id = existing.id;
  if (existing?.cloud && form.revision != null) payload.expected_revision = form.revision;
  const result = await api(existing?.cloud ? '/reminders/' + encodeURIComponent(existing.id) : '/reminders', existing?.cloud ? 'PATCH' : 'POST', payload);
  sameAccount(account);
  cacheItem(result.item, form.id);
  return result.item;
}
export async function deleteCloudReminder(id) {
  const account = accountForWrite();
  const item = listReminders().find((r) => r.id === id);
  if (!item?.cloud) { deleteReminder(id); return; }
  await api('/reminders/' + encodeURIComponent(id), 'DELETE');
  sameAccount(account);
  saveStore({ reminders: listReminders().filter((r) => r.id !== id) });
}
export async function completeCloudReminder(id, dueAt) {
  const account = accountForWrite();
  const item = listReminders().find((r) => r.id === id);
  if (!item?.cloud) return completeReminder(id, dueAt);
  const result = await api('/reminders/' + encodeURIComponent(id) + '/complete', 'POST', { expected_due_at: dueAt });
  sameAccount(account);
  if (result.replayed) { await refreshCloudReminders(); return true; }
  const items = listReminders().filter((r) => r.id !== id);
  const history = result.history ? [result.history, ...listReminderHistory().filter((r) => r.id !== result.history.id)] : listReminderHistory();
  saveStore({ reminders: result.item ? [...items, result.item] : items, reminderHistory: history });
  return true;
}
export async function syncCloudBirthday(petId) {
  const account = accountForWrite();
  const result = await api('/cat-profiles/' + encodeURIComponent(petId) + '/birthday-reminder', 'PUT');
  sameAccount(account);
  saveStore({ reminders: listReminders().filter((r) => r.source !== 'pet-birthday' || r.petId !== petId) });
  cacheItem(result.item);
  return result.item;
}
export async function importLegacyReminders() {
  const account = accountForWrite();
  const items = [...legacyReminders()];
  let imported = 0;
  const failed = [];
  for (const item of items) {
    sameAccount(account);
    try {
      if (item.source === 'pet-birthday' && item.petId) {
        await syncCloudBirthday(item.petId);
      } else {
        const result = await api('/reminders', 'POST', { ...item, pet_id: item.petId || '', legacy_id: item.id });
        sameAccount(account);
        cacheItem(result.item, item.id);
      }
      imported += 1;
    } catch (error) {
      sameAccount(account);
      failed.push({ title: item.title, error: error.message });
    }
  }
  return { imported, failed };
}
