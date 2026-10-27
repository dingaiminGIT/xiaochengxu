import { deviceRequest } from '../../utils/device-api';
import { shareCard, timelineCard } from '../../utils/share';
import { calendarDays, remindersOnDate, shiftDate, birthdayCountdown } from '../../utils/reminder-calendar';
import { localDate, listReminders } from '../../utils/reminders';
import { refreshCloudReminders } from '../../utils/reminder-api';
import { getReminderPrompt } from '../../utils/reminder-prompts';
import { setModalData, syncModalTabBar } from '../../utils/modal-layout';
import { categories, getFeedPosts, fetchPosts } from '../../utils/community';
import { errorText, api, hasSession, mapPet } from '../../api/miniprogram';
import { loadStore, saveStore, dayKey, currentPet, cachePetList, accountKey } from '../../utils/pet-store';

Page({
  onShareAppMessage() {
    return shareCard('宠析 · 记录宠物日常，分享养宠经验', '/pages/home/index');
  },
  onShareTimeline() {
    return timelineCard(this.onShareAppMessage());
  },
  data: {
    categories,
    category: 'all',
    query: '',
    posts: [],
    loading: false,
    feedError: '',
    metrics: [],
    pet: null,
    hasReminders: false,
    reminderPrompt: '',
    recordFields: [],
    recordTitle: '记一下',
    showRecord: false,
    deviceCount: 0, deviceLoading: false, deviceError: '',
    form: { water: '', food: '', litter: '', litterShape: '' },
  },
  onLoad() {
    this.loadFeed();
  },
  onShow() {
    syncModalTabBar(this);
    this.loadDeviceSummary();
    if (this.getTabBar()) this.getTabBar().setData({ value: 'home' });
    const store = loadStore();
    cachePetList(store.pets || (store.pet ? [store.pet] : []));
    this.refreshData();
    this.syncPets();
    const reminderAccount = accountKey('reminders');
    refreshCloudReminders()
      .then(() => {
        if (reminderAccount === accountKey('reminders')) this.refreshData();
      })
      .catch(() => {
        /* Cached reminders stay visible until the next refresh. */
      });
    // 从发帖返回时刷新；热更新/空列表时补拉，避免样式区空白
    if (this._reloadFeedOnShow || (!this.data.posts.length && !this.data.loading)) {
      this._reloadFeedOnShow = false;
      this.loadFeed();
    }
  },
  async syncPets() {
    if (!hasSession()) return;
    const account = accountKey('home');
    try {
      const r = await api('/cat-profiles');
      if (account !== accountKey('home')) return;
      cachePetList((r.items || []).map(mapPet));
      this.refreshData();
    } catch (_) {
      /* Keep cached selection while offline. */
    }
  },
  openPetPage() {
    wx.switchTab({ url: '/pages/my/index' });
  },
  async loadFeed() {
    const version = (this._feedLoadVersion || 0) + 1;
    this._feedLoadVersion = version;
    const category = this.data.category;
    const isCurrent = () => this._feedLoadVersion === version;
    const silent = this.data.posts.length > 0;
    if (!silent) this.setData({ loading: true, feedError: '' });
    try {
      await fetchPosts(false, {
        sort: category === 'all' ? 'popular' : 'latest',
        categoryCode: category === 'all' ? '' : category, isCurrent,
      });
      if (!isCurrent()) return;
      this.filterPosts();
      this.setData({ feedError: '' });
    } catch (e) {
      if (!isCurrent()) return;
      if (!silent) this.setData({ feedError: errorText(e) });
      else wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (isCurrent()) this.setData({ loading: false });
    }
  },
  openReminders() {
    const hasReminders = (loadStore().reminders || []).length > 0;
    this.setData({ hasReminders });
    wx.navigateTo({ url: hasReminders ? '/pages/pet-space/reminders' : '/pages/pet-space/reminder-types' });
  },
  chooseCalendarDay(e) {
    this.setData({ calendarDate: e.currentTarget.dataset.date });
    this.refreshData();
  },
  openAllReminders() {
    wx.navigateTo({ url: '/pages/pet-space/reminders' });
  },
  openCalendar() {
    wx.navigateTo({ url: `/pages/pet-space/reminders?date=${  this.data.calendarDate || localDate()}` });
  },
  refreshData() {
    const calendarDate = this.data.calendarDate || localDate();
    const pet = currentPet();
    const reminders = listReminders().filter((r) => !r.petId || r.petId === pet?.id);
    const calendarItems = remindersOnDate(reminders, calendarDate);

    const record = loadStore().records.find((r) => r.day === dayKey() && (r.petId || '') === (currentPet()?.id || ''));
    const notes = (record && record.litterNotes) || [];
    const litterStatus = notes.length ? notes[notes.length - 1].shape : '';
    this.setData({
      recordUpdated: record?.time ? `${record.time} 更新 · 手动记录` : '今天还没有记录',
      pet: currentPet(),
      calendarDate,
      calendarDays: calendarDays(shiftDate(localDate(), -1), 7, calendarDate, reminders),
      calendarSummary: calendarItems.length
        ? calendarItems.map((r) => r.title).join(' · ')
        : ['当天暂无提醒', birthdayCountdown(pet?.birthday)].filter(Boolean).join(' · '),
      calendarCount: calendarItems.length,
      hasReminders: (loadStore().reminders || []).length > 0,
      reminderPrompt: getReminderPrompt(),
      metrics: [
        ['water', '饮水', 'ml'],
        ['food', '进食', 'g'],
        ['litter', '排便', '次'],
      ].map(([key, label, unit]) => ({
        key,
        label,
        unit,
        hasValue: !!record && record[key] !== undefined && record[key] !== null && record[key] !== '',
        value: record && record[key] !== undefined && record[key] !== null && record[key] !== '' ? record[key] : '—',
        status: key === 'litter' ? litterStatus : '',
      })),
    });
    this.filterPosts();
  },
  filterPosts() {
    const { category, query } = this.data;
    const q = query.trim();
    this.setData({
      posts: getFeedPosts().filter(
        (p) => (category === 'all' || p.category === category) && (!q || `${p.title}${p.body}`.includes(q)),
      ),
    });
  },
  selectCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (category === this.data.category) return;
    this.setData({ category, posts: [] });
    this.loadFeed();
  },
  onSearch(e) {
    this.setData({ query: e.detail.value });
    this.filterPosts();
  },
  openPost(e) {
    this._reloadFeedOnShow = true;
    wx.navigateTo({ url: `/pages/pet-space/post-detail?id=${encodeURIComponent(e.detail.id)}` });
  },
  toggleSave(e) {
    const id = e.detail.id || e.currentTarget.dataset.id;
    const {favorites} = loadStore();
    saveStore({ favorites: favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id] });
    this.filterPosts();
  },
  goRelease() {
    this._reloadFeedOnShow = true;
    wx.navigateTo({ url: '/pages/release/index' });
  },
  goHistory() {
    wx.navigateTo({ url: '/pages/history/index' });
  },
  goHealthAttention() {
    wx.navigateTo({ url: '/pages/pet-space/health-attention' });
  },
  async loadDeviceSummary() {
    this.setData({ deviceCount: 0, deviceError: '', deviceLoading: hasSession() });
    if (!hasSession()) return;
    try { const r = await deviceRequest('/device-bindings'); this.setData({ deviceCount: (r.items || []).filter(d => !d.archived).length }); }
    catch (_) { this.setData({ deviceError: '设备暂时无法查询，请进入设备页重试' }); }
    finally { this.setData({ deviceLoading: false }); }
  },
  openDevices() {
    if (this._openingDevices) return;
    this._openingDevices = true;
    wx.navigateTo({
      url: '/pages/devices/index',
      fail: () => {
        wx.showToast({ title: '设备页面打开失败，请重试', icon: 'none' });
      },
      complete: () => { this._openingDevices = false; },
    });
  },
  openRecord(e) {
    const key = e && e.currentTarget && e.currentTarget.dataset.key;
    const fields = this.data.metrics.filter((item) => !key || item.key === key);
    const record = loadStore().records.find((r) => r.day === dayKey() && (r.petId || '') === (currentPet()?.id || ''));
    setModalData(this, {
      showRecord: true,
      recordTitle: key ? `记录${fields[0].label}` : '记一下',
      recordFields: fields.map((item) => ({ ...item, total: Number(record && record[item.key]) || 0 })),
      form: { water: '', food: '', litter: '', litterShape: '' },
    });
  },
  onRecordInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value });
  },
  saveRecord() {
    if (!this.data.showRecord) return;
    const entries = this.data.recordFields
      .filter(({ key }) => String(this.data.form[key]).trim() !== '')
      .map(({ key }) => ({ key, value: Number(this.data.form[key]) }));
    if (
      !entries.length ||
      entries.some(
        ({ key, value }) =>
          !Number.isFinite(value) ||
          value <= 0 ||
          (key === 'litter' ? !Number.isInteger(value) || value > 99 : value > 9999),
      )
    ) {
      wx.showToast({ title: '请填写有效的本次记录值', icon: 'none' });
      return;
    }
    const shape = (this.data.form.litterShape || '').trim();
    if (shape && !entries.some(({ key }) => key === 'litter')) {
      wx.showToast({ title: '请同时填写排便次数', icon: 'none' });
      return;
    }
    const now = new Date();
    const store = loadStore();
    const today = dayKey(now);
    const petId = currentPet(store)?.id || '';
    const previous = store.records.find((r) => r.day === today && (r.petId || '') === petId) || {};
    const record = {
      ...previous,
      day: today,
      petId,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
    entries.forEach(({ key, value }) => {
      record[key] = Math.round(((Number(record[key]) || 0) + value) * 100) / 100;
    });
    if (entries.some(({ key }) => key === 'litter')) {
      record.litterNotes = [
        ...(previous.litterNotes || []),
        {
          time: record.time,
          count: entries.find(({ key }) => key === 'litter').value,
          shape: shape || '正常',
        },
      ];
    }
    try {
      saveStore({ records: [record, ...store.records.filter((r) => r.day !== today || (r.petId || '') !== petId)] });
      this.closeSheet();
      this.refreshData();
      wx.showToast({ title: '已计入今日累计', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },
  closeSheet() {
    setModalData(this, { showRecord: false });
  },
  onHide() {
    this.closeSheet();
  },
});
