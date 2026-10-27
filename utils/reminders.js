// Local repository boundary: replace these methods when reminder APIs are available.
import { loadStore, saveStore } from './pet-store';
export const reminderTypes = [
  { id: 'birthday', name: '宠物生日', icon: 'gift' },
  { id: 'pump', name: '水泵清洁', icon: 'device' },
  { id: 'litter', name: '清理猫砂盆', icon: 'litter' },
  { id: 'bath', name: '洗澡清洁', icon: 'bath' },
  { id: 'checkup', name: '体检', icon: 'health' },
  { id: 'food', name: '买宠物粮', icon: 'food' },
  { id: 'internal', name: '体内驱虫', icon: 'medicine' },
  { id: 'external', name: '体外驱虫', icon: 'medicine' },
  { id: 'vaccine', name: '疫苗注射', icon: 'vaccine' },
  { id: 'groom', name: '美容护理', icon: 'groom' },
  { id: 'drum', name: '清洗滚筒', icon: 'device' },
  { id: 'waste', name: '清理集便仓', icon: 'litter' },
  { id: 'fountain', name: '饮水机清洁', icon: 'water' },
  { id: 'refill', name: '饮水机添水', icon: 'water' },
  { id: 'custom', name: '自定义', icon: 'plus' },
];
export const repeatOptions = [
  { id: 'none', label: '不重复' },
  { id: 'daily', label: '每天' },
  { id: 'weekly', label: '每周' },
  { id: 'biweekly', label: '每两周' },
  { id: 'monthly', label: '每月' },
  { id: 'yearly', label: '每年' },
];
export function localDate(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function localTime(value = new Date()) {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function parseReminderTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw Error('请选择提醒日期和时间');
  const [y, m, d] = date.split('-').map(Number),
    [h, n] = time.split(':').map(Number);
  const value = new Date(y, m - 1, d, h, n);
  if (localDate(value) !== date || localTime(value) !== time) throw Error('提醒时间无效');
  return value.getTime();
}
export function listReminders() {
  return loadStore().reminders || [];
}
// Recurring forms select a time/weekday; the API still receives a concrete dueAt.
export function resolveReminderTime(form, now = Date.now(), previous = null) {
  if (!['daily', 'weekly'].includes(form.repeat)) return parseReminderTime(form.date, form.time);
  const next = new Date(parseReminderTime(localDate(now), form.time));
  let weekday;
  if (form.repeat === 'weekly') {
    // Older callers may still provide an anchor date rather than a weekday.
    weekday =
      form.weekday === undefined && form.date
        ? new Date(parseReminderTime(form.date, form.time)).getDay()
        : form.weekday;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw Error('请选择每周提醒的星期');
    next.setDate(next.getDate() + ((weekday - next.getDay() + 7) % 7));
  }
  if (
    previous &&
    previous.repeat === form.repeat &&
    localTime(previous.dueAt) === form.time &&
    (form.repeat === 'daily' || new Date(previous.dueAt).getDay() === weekday)
  )
    return previous.dueAt;
  if (next.getTime() <= now) next.setDate(next.getDate() + (form.repeat === 'daily' ? 1 : 7));
  return next.getTime();
}
export function listReminderHistory() {
  return loadStore().reminderHistory || [];
}
export function saveReminder(form, now = Date.now()) {
  const type = reminderTypes.find((t) => t.id === form.type);
  if (!type) throw Error('请选择提醒类型');
  const title = String(form.title || '').trim();
  if (!title || title.length > 40) throw Error('请填写 1～40 字的提醒名称');
  if (!repeatOptions.some((r) => r.id === form.repeat)) throw Error('请选择重复方式');
  const items = listReminders(),
    previous = items.find((r) => r.id === form.id);
  const dueAt = resolveReminderTime(form, now, previous);
  if (form.id && !previous) throw Error('这条提醒已不存在');
  if (dueAt <= now && (!previous || previous.dueAt !== dueAt)) throw Error('请选择未来的提醒时间');
  const item = {
    id: previous?.id || `reminder-${now}-${Math.random().toString(36).slice(2, 8)}`,
    source: previous?.source || '',
    birthday: previous?.birthday || '',
    type: type.id,
    title,
    dueAt,
    repeat: form.repeat,
    petId: form.petId || '',
    petName: form.petName || '',
    note: String(form.note || '')
      .trim()
      .slice(0, 500),
    anchorDay: previous && previous.dueAt === dueAt ? previous.anchorDay : new Date(dueAt).getDate(),
    anchorMonth: previous && previous.dueAt === dueAt ? previous.anchorMonth : new Date(dueAt).getMonth(),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  saveStore({ reminders: previous ? items.map((r) => (r.id === item.id ? item : r)) : [...items, item] });
  return item;
}
export function nextReminderTime(item, now) {
  if (item.repeat === 'none') return null;
  const next = new Date(item.dueAt);
  do {
    if (item.repeat === 'monthly' || item.repeat === 'yearly') {
      const year = next.getFullYear() + (item.repeat === 'yearly' ? 1 : 0);
      const month = item.repeat === 'yearly' ? item.anchorMonth ?? next.getMonth() : next.getMonth() + 1;
      next.setDate(1);
      next.setFullYear(year, month, 1);
      next.setDate(
        Math.min(
          item.anchorDay || new Date(item.dueAt).getDate(),
          new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
        ),
      );
    } else {
      const days = { daily: 1, weekly: 7, biweekly: 14 }[item.repeat];
      if (!days) throw Error('不支持的重复方式');
      next.setDate(next.getDate() + days);
    }
  } while (next.getTime() <= now);
  return next.getTime();
}
export function completeReminder(id, expectedDueAt, now = Date.now()) {
  const items = listReminders(),
    item = items.find((r) => r.id === id);
  if (!item || item.dueAt !== expectedDueAt) return false;
  const next = nextReminderTime(item, now);
  const history = { ...item, reminderId: id, id: `${id}-${item.dueAt}`, completedAt: now };
  saveStore({
    reminders:
      next == null
        ? items.filter((r) => r.id !== id)
        : items.map((r) => (r.id === id ? { ...r, dueAt: next, updatedAt: now } : r)),
    reminderHistory: [history, ...listReminderHistory()],
  });
  return true;
}
export function deleteReminder(id) {
  saveStore({ reminders: listReminders().filter((r) => r.id !== id) });
}
export function reminderView(item, now = Date.now()) {
  const type = reminderTypes.find((t) => t.id === item.type);
  const overdue = item.dueAt < now;
  return {
    ...item,
    icon: type?.icon || 'bell',
    dueText: `${localDate(item.dueAt)} ${localTime(item.dueAt)}`,
    completedText: item.completedAt ? `${localDate(item.completedAt)} ${localTime(item.completedAt)}` : '',
    repeatText: repeatOptions.find((r) => r.id === item.repeat)?.label || '不重复',
    overdue,
    overdueText: overdue ? `逾期${Math.max(1, Math.ceil((now - item.dueAt) / 86400000))}天` : '待完成',
  };
}

// One auto-created annual reminder per pet. Preserve completion history and manual edits.
export function syncBirthdayReminder(pet, now = Date.now()) {
  if (!pet?.id) return;
  const items = listReminders();
  const previous = items.find((r) => r.source === 'pet-birthday' && r.petId === pet.id);
  const birthday = String(pet.birthday || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    if (previous) deleteReminder(previous.id);
    return;
  }
  const [, month, day] = birthday.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(2000, month, 0).getDate()) return;
  if (previous?.birthday === birthday) {
    saveStore({
      reminders: items.map((r) => (r.id === previous.id ? { ...r, petName: pet.name, title: pet.name + '的生日' } : r)),
    });
    return;
  }
  const year = new Date(now).getFullYear();
  let dueAt = new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()), 9).getTime();
  if (dueAt <= now) dueAt = nextReminderTime({ dueAt, repeat: 'yearly', anchorDay: day, anchorMonth: month - 1 }, now);
  const item = {
    id: previous?.id || `birthday-${pet.id}`,
    source: 'pet-birthday',
    birthday,
    type: 'birthday',
    title: pet.name + '的生日',
    dueAt,
    repeat: 'yearly',
    petId: pet.id,
    petName: pet.name,
    note: '生日当天 09:00，每年提醒',
    anchorDay: day,
    anchorMonth: month - 1,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  saveStore({ reminders: previous ? items.map((r) => (r.id === previous.id ? item : r)) : [...items, item] });
}
