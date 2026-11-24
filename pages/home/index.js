import { shouldShowGuziIntro, dismissGuziIntro } from '../../utils/guzi-intro';
import { getMerchantIdentity } from '../../utils/merchant';
import { listCommunityGoods, askAboutGoods } from '../../utils/goods';
import { deviceRequest } from '../../utils/device-api';
import { shareCard, timelineCard } from '../../utils/share';
import { calendarDays, remindersOnDate, weekStart } from '../../utils/reminder-calendar';
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
    homeTab: 'community',
    isMerchant: false,
    headerHeight: 84,
    showNavSearch: false,
    headerCollapsed: false,
    searchFocused: false,
    feedScrollTop: 0,
    feedRefreshing: false,
    goodsQuery: '',
    goods: [],
    goodsColumns: [[], []],
    goodsLoading: false,
    goodsError: '',
    goodsSort: 'latest',
    categories,
    category: 'all',
    feedSort: 'popular',
    feedModes: ['全部', '热门', '最新'],
    feedModeIndex: 0,
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
    showGuziIntro: false,
    deviceCount: 0, deviceLoading: false, deviceError: '',
    form: { water: '', food: '', litter: '', litterShape: '' },
  },
  onLoad() {
    const info = wx.getWindowInfo();
    this._headerExpandThreshold = info.windowHeight / 2;
    const capsule = wx.getMenuButtonBoundingClientRect();
    const top = info.statusBarHeight || 20;
    this.setData({ headerHeight: top + ((capsule.top - top) * 2 + capsule.height || 44) });
    this.restoreFeedPreference();
    this.loadFeed();
  },
  onShow() {
    this.showGuziIntroIfNeeded();
    syncModalTabBar(this);
    this.loadMerchantIdentity();
    const publishedKey = accountKey('goods-published');
    if (wx.getStorageSync(publishedKey)) {
      wx.removeStorageSync(publishedKey);
      this.setData({ homeTab: 'goods', goodsSort: 'latest', goodsQuery: '' });
      this.loadGoods();
      this._reloadFeedOnShow = true;
    }
    this.loadDeviceSummary();
    if (this.getTabBar()) this.getTabBar().setData({ value: 'home' });
    if (this._feedPreferenceAccount !== accountKey('home-feed')) {
      this.restoreFeedPreference();
      this._reloadFeedOnShow = true;
    }
    this.applyPublishedFeed();
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
        sort: category === 'all' ? this.data.feedSort : 'latest',
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
  async loadMerchantIdentity() {
    const version = this._merchantVersion = (this._merchantVersion || 0) + 1;
    const account = accountKey('merchant-identity');
    this.setData({ isMerchant: false });
    try {
      const identity = await getMerchantIdentity();
      if (version === this._merchantVersion && account === accountKey('merchant-identity')) {
        this.setData({ isMerchant: identity.is_merchant === true });
      }
    } catch (_) { /* Recheck on the next visit; the publish page also verifies identity. */ }
  },
  openGoodsPublish() {
    wx.navigateTo({ url: '/pages/goods/publish' });
  },
  selectHomeTab(e) {
    const homeTab = e.currentTarget.dataset.tab;
    if (!['community', 'goods'].includes(homeTab) || homeTab === this.data.homeTab) return;
    this.setData({ homeTab });
    this.resetFeedScroll();
    if (homeTab === 'goods' && !this._goodsLoaded && !this.data.goodsLoading) this.loadGoods();
  },
  async onPullDownRefresh() {
    if (this._pullRefreshing) return;
    this._pullRefreshing = true;
    this.setData({ feedRefreshing: true });
    try {
      if (this.data.homeTab === 'goods') await this.loadGoods({ silent: this.data.goods.length > 0 });
      else await this.loadFeed();
    } finally {
      this._pullRefreshing = false;
      this.setData({ feedRefreshing: false });
    }
  },
  onFeedScroll(e) {
    const previousTop = this._feedScrollTop || 0;
    this._feedScrollTop = Math.max(0, e.detail.scrollTop || 0);
    const showNavSearch = this._feedScrollTop > 0;
    if (showNavSearch !== this.data.showNavSearch) this.setData({ showNavSearch });
    // Resizing the list can clamp scrollTop; wait for the layout to settle.
    if (Date.now() < (this._headerTransitionUntil || 0)) return;
    if (!this.data.headerCollapsed && this._feedScrollTop > 24 && this._feedScrollTop > previousTop) {
      this.setHeaderCollapsed(true);
    } else if (this.data.headerCollapsed && this._feedScrollTop < previousTop
      && this._feedScrollTop <= (this._headerExpandThreshold || 400)) {
      this.setHeaderCollapsed(false);
    }
  },
  setHeaderCollapsed(headerCollapsed) {
    if (headerCollapsed === this.data.headerCollapsed) return;
    this._headerTransitionUntil = Date.now() + 240;
    this.setData({ headerCollapsed });
  },
  expandHomeHeader() {
    this.setHeaderCollapsed(false);
  },
  onResize(e) {
    this._headerExpandThreshold = e.size.windowHeight / 2;
  },
  resetFeedScroll() {
    // Synchronize the native position before requesting zero again.
    this.setData({ feedScrollTop: this._feedScrollTop || 0 }, () => {
      this._feedScrollTop = 0;
      this._headerTransitionUntil = Date.now() + 240;
      this.setData({ feedScrollTop: 0, showNavSearch: false, searchFocused: false, headerCollapsed: false });
    });
  },
  focusHomeSearch() { this.setData({ searchFocused: true }); },
  blurHomeSearch() { this.setData({ searchFocused: false }); },
  async loadGoods({ silent = false } = {}) {
    const version = this._goodsLoadVersion = (this._goodsLoadVersion || 0) + 1;
    this.setData({ goodsLoading: !silent, goodsError: '' });
    try {
      const goods = await listCommunityGoods(this.data.goodsSort);
      if (version !== this._goodsLoadVersion) return;
      this._goodsLoaded = true;
      this.setData({ goods });
      this.filterGoods();
    } catch (e) {
      if (version === this._goodsLoadVersion) {
        if (silent) wx.showToast({ title: '刷新失败，请稍后下拉重试', icon: 'none' });
        else this.setData({ goodsError: errorText(e) });
      }
    } finally {
      if (version === this._goodsLoadVersion) this.setData({ goodsLoading: false });
    }
  },
  filterGoods() {
    const query = this.data.goodsQuery.trim().toLocaleLowerCase();
    const goods = this.data.goods.filter((item) => !query || `${item.name} ${item.merchantType}`.toLocaleLowerCase().includes(query));
    this.setData({ goodsColumns: [goods.filter((_, i) => i % 2 === 0), goods.filter((_, i) => i % 2 === 1)], goodsCount: goods.length });
  },
  selectGoodsSort(e) {
    const goodsSort = e.currentTarget.dataset.sort;
    if (!['latest', 'popular'].includes(goodsSort) || goodsSort === this.data.goodsSort) return;
    this.setData({ goodsSort, goods: [], goodsColumns: [[], []], goodsCount: 0 });
    this.resetFeedScroll();
    this.loadGoods();
  },
  searchHome(e) {
    if (this.data.homeTab === 'goods') {
      this.setData({ goodsQuery: e.detail.value });
      this.scheduleSearch();
    } else this.onSearch(e);
  },
  clearHomeSearch() { this.searchHome({ detail: { value: '' } }); },
  openGoods(e) {
    wx.navigateTo({ url: `/pages/goods/detail?id=${encodeURIComponent(e.detail.id)}` });
  },
  askGoods(e) {
    const item = this.data.goods.find((goods) => goods.id === e.detail.id);
    if (item) askAboutGoods(item);
  },
  onUnload() {
    clearTimeout(this._searchTimer);
    this._merchantVersion = (this._merchantVersion || 0) + 1;
    this._goodsLoadVersion = (this._goodsLoadVersion || 0) + 1;
    this._feedLoadVersion = (this._feedLoadVersion || 0) + 1;
  },
  openReminders() {
    const hasReminders = (loadStore().reminders || []).length > 0;
    this.setData({ hasReminders });
    wx.navigateTo({ url: hasReminders ? '/pages/pet-space/reminders' : '/pages/pet-space/reminder-types' });
  },
  openReminderAction() {
    if (this.data.calendarCount) this.openCalendar();
    else wx.navigateTo({ url: '/pages/pet-space/reminder-types' });
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
    const calendarDate = localDate();
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
      calendarMonth: Number(calendarDate.slice(5, 7)),
      calendarDays: calendarDays(weekStart(calendarDate), 7, calendarDate, reminders)
        .map((item) => ({ ...item, day: Number(item.key.slice(8, 10)) })),
      hasDailyRecords: ['water', 'food', 'litter'].some((key) => record && record[key] !== undefined && record[key] !== null && record[key] !== ''),
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
    const posts = getFeedPosts().filter(
      (p) => (category === 'all' || p.category === category) && (!q || `${p.title}${p.body}`.includes(q)),
    );
    // Pet/reminder refreshes should not resubmit an unchanged feed to the view layer.
    if (JSON.stringify(posts) !== JSON.stringify(this.data.posts)) this.setData({ posts });
  },
  restoreFeedPreference() {
    const preference = loadStore().homeFeedPreference || {};
    const feedModeIndex = [0, 1, 2].includes(preference.feedModeIndex) ? preference.feedModeIndex : 0;
    const category = categories.some((item) => item.id === preference.category) ? preference.category : 'all';
    this._feedPreferenceAccount = accountKey('home-feed');
    this.setData({ category, feedModeIndex, feedSort: feedModeIndex === 2 ? 'latest' : 'popular', posts: [], query: '', feedError: '' });
  },
  saveFeedPreference() {
    const { category, feedModeIndex } = this.data;
    saveStore({ homeFeedPreference: { category, feedModeIndex } });
  },
  applyPublishedFeed() {
    if (!loadStore().showLatestFeedAfterPublish) return;
    this.setData({ category: 'all', feedModeIndex: 2, feedSort: 'latest', query: '', posts: [], feedError: '' });
    saveStore({ showLatestFeedAfterPublish: false, homeFeedPreference: { category: 'all', feedModeIndex: 2 } });
    this._reloadFeedOnShow = true;
  },
  selectFeedMode(e) {
    const feedModeIndex = Number(e.detail.value);
    if (![0, 1, 2].includes(feedModeIndex)) return;
    if (this.data.category === 'all' && feedModeIndex === this.data.feedModeIndex) return;
    this.setData({ category: 'all', feedModeIndex, feedSort: feedModeIndex === 2 ? 'latest' : 'popular', posts: [], feedError: '' });
    this.saveFeedPreference();
    this.resetFeedScroll();
    this.loadFeed();
  },
  selectCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (!categories.some((item) => item.id === category) || category === this.data.category) return;
    this.setData({ category, posts: [], feedError: '' });
    this.saveFeedPreference();
    this.resetFeedScroll();
    this.loadFeed();
  },
  onSearch(e) {
    this.setData({ query: e.detail.value });
    this.scheduleSearch();
  },
  scheduleSearch() {
    clearTimeout(this._searchTimer);
    const tab = this.data.homeTab;
    const apply = () => {
      if (tab === 'goods') this.filterGoods();
      else this.filterPosts();
    };
    if (!(tab === 'goods' ? this.data.goodsQuery : this.data.query).trim()) apply();
    else this._searchTimer = setTimeout(apply, 200);
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
  showGuziIntroIfNeeded() {
    setModalData(this, { showGuziIntro: shouldShowGuziIntro() });
  },
  closeGuziIntro() {
    dismissGuziIntro();
    setModalData(this, { showGuziIntro: false });
  },
  stopIntroTouchMove() {},
  openGuzi() {
    this.closeGuziIntro();
    wx.navigateTo({ url: '/pages/guzi/index', fail: () => wx.showToast({ title: '活动页面打开失败，请重试', icon: 'none' }) });
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
