import { calendarDays, remindersOnDate, weekStart, shiftDate, monthLabel } from '../../utils/reminder-calendar';
import { localDate } from '../../utils/reminders';
import { refreshCloudReminders, completeCloudReminder, legacyReminders, importLegacyReminders } from '../../utils/reminder-api';
import { accountKey } from '../../utils/pet-store';
import {
  listReminders,
  listReminderHistory,
  reminderView,
  reminderTypes,
} from '../../utils/reminders';
Page({
  data: { history: false, overdue: [], upcoming: [], records: [], filters: [], filter: 'all', selected: null },
  onLoad(q) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : localDate();
    this.setData({
      history: q.mode === 'history',
      calendarDate: date,
      calendarStart: weekStart(date),
      showAll: !q.date,
      types: reminderTypes,
      weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    });
  },
  onShow() {
    this._active = true;
    this._account = accountKey('reminders');
    clearInterval(this._timer);
    this.refresh();
    this.sync();
    this._timer = setInterval(() => { this.refresh(); this.sync(); }, 60000);
  },
  onHide() {
    this._active = false;
    clearInterval(this._timer);
  },
  onUnload() {
    this._active = false;
    clearInterval(this._timer);
  },
  refresh() {
    const items = listReminders()
      .map((r) => reminderView(r))
      .sort((a, b) => a.dueAt - b.dueAt);
    const history = listReminderHistory()
      .map((r) => reminderView(r))
      .sort((a, b) => b.completedAt - a.completedAt);
    const filters = [{ id: 'all', name: '全部' }, ...reminderTypes.filter((t) => history.some((r) => r.type === t.id))];
    const filter = filters.some((t) => t.id === this.data.filter) ? this.data.filter : 'all';
    const shown = this.data.showAll ? items : remindersOnDate(items, this.data.calendarDate);
    this.setData({
      calendarDays: calendarDays(this.data.calendarStart, 14, this.data.calendarDate, items),
      calendarMonth: monthLabel(this.data.calendarStart),
      overdue: shown.filter((r) => r.overdue),
      upcoming: shown.filter((r) => !r.overdue),
      filters,
      filter,
      records: history.filter((r) => filter === 'all' || r.type === filter),
      legacyCount: legacyReminders().length,
    });
  },
  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    const account = this._account;
    try {
      await refreshCloudReminders();
      if (!this._active || account !== accountKey('reminders')) return;
      this.setData({ syncError: '' });
      this.refresh();
    } catch (error) {
      if (this._active && account === accountKey('reminders')) this.setData({ syncError: error.message || '同步失败，当前显示上次保存的提醒' });
    } finally { this._syncing = false; }
  },
  importLegacy() {
    const account = accountKey('reminders');
    wx.showModal({ title: '同步本机旧提醒', content: '核对列表中的本机旧提醒后，可将它们同步到当前账号。原时间和重复周期会保留，不会发送系统推送。', confirmText: '确认同步',
      success: async (result) => {
        if (!result.confirm || account !== accountKey('reminders') || this._importing) return;
        this._importing = true;
        try {
          const saved = await importLegacyReminders();
          if (account !== accountKey('reminders') || !this._active) return;
          this.refresh();
          wx.showModal({ title: '同步结果', content: `已同步${saved.imported}条${saved.failed.length ? `，${saved.failed.length}条未同步，请核对宠物和内容后重试` : ''}。`, showCancel: false });
        } catch (error) { if (this._active) wx.showToast({ title: error.message || '同步失败', icon: 'none' }); }
        finally { this._importing = false; }
      },
    });
  },
  chooseDate(e) {
    this.setData({ calendarDate: e.currentTarget.dataset.date, showAll: false });
    this.refresh();
  },
  allDates() {
    this.setData({ showAll: true });
    this.refresh();
  },
  moveCalendar(e) {
    this.setData({ calendarStart: shiftDate(this.data.calendarStart, Number(e.currentTarget.dataset.days)) });
    this.refresh();
  },
  calendarTouchStart(e) {
    this._touchX = e.touches[0].clientX;
  },
  calendarTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this._touchX;
    if (Math.abs(dx) > 45) {
      this.setData({ calendarStart: shiftDate(this.data.calendarStart, dx < 0 ? 14 : -14) });
      this.refresh();
    }
  },
  createType(e) {
    wx.navigateTo({
      url:
        '/pages/pet-space/reminder-edit?type=' +
        e.currentTarget.dataset.id +
        '&date=' +
        (this.data.calendarDate < localDate() ? localDate() : this.data.calendarDate),
    });
  },
  chooseFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id });
    this.refresh();
  },
  create() {
    wx.navigateTo({ url: '/pages/pet-space/reminder-types' });
  },
  history() {
    wx.navigateTo({ url: '/pages/pet-space/reminders?mode=history' });
  },
  edit(e) {
    wx.navigateTo({ url: '/pages/pet-space/reminder-edit?id=' + encodeURIComponent(e.currentTarget.dataset.id) });
  },
  async complete(e) {
    if (this._completing) return;
    this._completing = true;
    const account = accountKey('reminders');
    try {
      if (await completeCloudReminder(e.currentTarget.dataset.id, Number(e.currentTarget.dataset.due)))
        wx.showToast({ title: '已完成' });
      if (this._active && account === accountKey('reminders')) this.refresh();
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败，请重试', icon: 'none' });
    } finally { this._completing = false; }
  },
  detail(e) {
    this.setData({ selected: this.data.records.find((r) => r.id === e.currentTarget.dataset.id) });
  },
  close() {
    this.setData({ selected: null });
  },
});
