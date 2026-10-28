import { previewIngredientExample } from '../../utils/preview-ingredient-example';
import { requireSession, hasSession, api, login, errorText, downloadPetImage } from '../../api/miniprogram';
import { accountKey } from '../../utils/pet-store';
import { submitFood, submissionView } from '../../utils/food-submission';

Page({
  data: {
    items: [],
    selected: null,
    creating: false,
    loading: false,
    saving: false,
    invalid: {},
    error: '',
    signedOut: false,
    form: { brand: '', product: '', remark: '', images: [] },
  },
  onLoad(q) {
    this._initialId = q.id || '';
    this._entryId = this._initialId;
    this._directCreate = q.create === '1';
    this._chatEntry = q.chat === '1';
    this.setData({ creating: this._directCreate });
    // A notification can open this page directly, without a navigateTo opener.
    const channel = this.getOpenerEventChannel();
    if (channel && typeof channel.on === 'function')
      channel.on('prefill', (form) => this.setData({ form: { ...this.data.form, ...form } }));
  },
  onShow() {
    this._active = true;
    // Notification entry may reuse a page already in memory, without onLoad.
    const entry = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : null;
    const entryId = entry && entry.path === 'pages/pet-space/food-submissions' && entry.query && entry.query.id;
    if (entryId && entryId !== this._entryId) {
      this._entryId = entryId;
      this._initialId = entryId;
      this.setData({ creating: false, selected: null });
    }
    this.setData({ signedOut: !hasSession() });
    const account = accountKey('food-submissions');
    if (this._account && this._account !== account) this.setData({ items: [], selected: null });
    this._account = account;
    if (this._initialId && !hasSession()) {
      this.setData({ error: '登录后查看食品投稿' });
      requireSession();
      return;
    }
    if (!this.data.creating) this.load();
  },
  onHide() {
    this._active = false;
    this.stopRefresh();
  },
  stopRefresh() {
    clearTimeout(this._resultTimer);
    this._resultTimer = null;
    this._refreshGeneration = (this._refreshGeneration || 0) + 1;
  },
  scheduleRefresh() {
    clearTimeout(this._resultTimer);
    this._resultTimer = null;
    if (!this._active || this._disposed || !hasSession() || this.data.creating) return;
    const candidates = this.data.selected ? [this.data.selected] : (this.data.items || []);
    const pending = candidates.filter((item) => item.needsRefresh);
    if (!pending.length) return;
    const item = pending[(this._refreshCursor || 0) % pending.length];
    this._refreshCursor = (this._refreshCursor || 0) + 1;
    const delay = Math.min(30000, this._refreshDelay || 1000);
    const generation = this._refreshGeneration || 0;
    const account = accountKey('food-submissions');
    this._resultTimer = setTimeout(async () => {
      try {
        const current = () => this._active && generation === (this._refreshGeneration || 0) && account === accountKey('food-submissions');
        const r = await api(`/food-submissions/${encodeURIComponent(item.id)}/status`);
        if (!current()) return;
        const status = r.item;
        let updated = item;
        if (status.revision !== item.statusRevision) {
          const detail = await api(`/food-submissions/${encodeURIComponent(item.id)}`);
          if (!current()) return;
          updated = submissionView(detail.item);
        }
        updated = { ...updated, statusRevision: status.revision, processing_stage: status.processing_stage,
          needsRefresh: status.needs_refresh || updated.needsRefresh };
        const patch = { items: (this.data.items || []).map((old) => old.id === item.id ? updated : old) };
        if (this.data.selected && this.data.selected.id === item.id) patch.selected = updated;
        this.setData(patch);
        this._refreshDelay = status.is_processing || updated.isProcessing ? 1000 : Math.min(Math.max(delay, 2000) * 1.5, 30000);
      } catch (e) {
        this._refreshDelay = Math.min(delay * 2, 30000);
      } finally {
        if (generation === (this._refreshGeneration || 0) && account === accountKey('food-submissions')) this.scheduleRefresh();
      }
    }, delay);
  },
  onUnload() {
    this._disposed = true;
    this.onHide();
  },
  async load() {
    if (!hasSession()) {
      this.setData({ items: [], signedOut: true, error: '登录后查看食品投稿' });
      return;
    }
    if (this._loading) return;
    this._loading = true;
    this.setData({ loading: true, error: '' });
    try {
      await login();
      const account = accountKey('food-submissions');
      const r = await api('/food-submissions?limit=100');
      if (!this._active || account !== accountKey('food-submissions')) return;
      this.setData({ items: (r.items || []).map(submissionView) });
      if (this._initialId) {
        const id = this._initialId;
        await this.readDetail(id);
        this._initialId = '';
      } else if (this.data.selected) await this.readDetail(this.data.selected.id);
    } catch (e) {
      if (this._active) {
        this.setData({ error: errorText(e), signedOut: !hasSession() });
        // An expired session is cleared by api(); retain the notification
        // destination while the user signs in again.
        if (this._initialId && !hasSession()) requireSession();
      }
    } finally {
      this._loading = false;
      if (this._active) {
        this.setData({ loading: false });
        this.scheduleRefresh();
      }
    }
  },
  signIn() {
    requireSession();
  },
  input(e) {
    const {key} = e.currentTarget.dataset;
    const {value} = e.detail;
    this.setData({
      [`form.${key}`]: value,
      ...(value.trim() ? { [`invalid.${key}`]: false } : {}),
    });
  },
  create() {
    this.stopRefresh();
    this.setData({ creating: true, selected: null, error: '', invalid: {} });
  },
  previewIngredientExample() {
    previewIngredientExample('pages/pet-space/static/ingredient-example.jpg');
  },
  chooseImages() {
    if (this.data.saving || this.data.form.images.length >= 3) return;
    wx.chooseMedia({
      count: 3 - this.data.form.images.length,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (r) => {
        if (r.tempFiles.some((f) => f.size > 10 * 1024 * 1024)) {
          wx.showToast({ title: '单张图片不能超过 10MB', icon: 'none' });
          return;
        }
        if (this._disposed) return;
        this.setData({
          'form.images': [...this.data.form.images, ...r.tempFiles.map((f) => f.tempFilePath)],
          'invalid.images': false,
        });
      },
    });
  },
  removeImage(e) {
    if (!this.data.saving)
      this.setData({
        'form.images': this.data.form.images.filter((_, i) => i !== Number(e.currentTarget.dataset.index)),
      });
  },
  async preview(e) {
    try {
      const {url} = e.currentTarget.dataset;
      const local = await downloadPetImage(url);
      wx.previewImage({ current: local, urls: [local] });
    } catch (e) {
      wx.showToast({ title: errorText(e), icon: 'none' });
    }
  },
  validate() {
    const { brand, product, images } = this.data.form;
    const invalid = { brand: !brand.trim(), product: !product.trim(), images: !images.length };
    this.setData({ invalid });
    const first = ['brand', 'product', 'images'].find((key) => invalid[key]);
    if (!first) return true;
    let title = '请上传配料表照片';
    if (invalid.brand && invalid.product) title = '请填写品牌和系列 / 产品名称';
    else if (invalid.brand) title = '请填写品牌';
    else if (invalid.product) title = '请填写系列 / 产品名称';
    wx.showToast({ title, icon: 'none' });
    wx.pageScrollTo({ selector: `#field-${first}`, duration: 200 });
    return false;
  },
  back() {
    if (!this._directCreate && (this.data.creating || this.data.selected) && !this._entryId) {
      this.closeDetail();
    } else if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/index' });
  },
  async submit() {
    if (this.data.saving || !this.validate() || !requireSession()) return;
    const account = accountKey('food-submissions');
    this.setData({ saving: true, error: '' });
    try {
      const item = await submitFood(this.data.form);
      if (this._disposed || account !== accountKey('food-submissions')) return;
      this.setData({
        creating: false,
        selected: submissionView(item),
        items: [submissionView(item), ...this.data.items.filter((i) => i.id !== item.id)],
        invalid: {},
        form: { brand: '', product: '', remark: '', images: [] },
      });
      const notify = () => wx.showToast({ title: '投稿成功', icon: 'success' });
      if (this._active) notify();
      this._refreshDelay = 1000;
      this.scheduleRefresh();
    } catch (e) {
      if (this._active && account === accountKey('food-submissions'))
        wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ saving: false });
    }
  },
  async open(e) {
    try {
      await this.readDetail(e.currentTarget.dataset.id);
    } catch (e) {
      this.setData({ error: errorText(e) });
    }
  },
  async readDetail(id) {
    const account = accountKey('food-submissions');
    const r = await api(`/food-submissions/${encodeURIComponent(id)}`);
    if (this._active && account === accountKey('food-submissions')) {
      this.stopRefresh();
      this._refreshDelay = 1000;
      this.setData({ selected: submissionView(r.item), creating: false });
      this.scheduleRefresh();
    }
  },
  analyzeResult() {
    const item = this.data.selected;
    if (!item || !item.resultReady) return;
    if (this._chatEntry) {
      const channel = this.getOpenerEventChannel();
      if (channel && channel.emit) channel.emit('foodSelected', item);
      wx.navigateBack();
    } else {
      wx.setStorageSync(accountKey('pending-food-submission'), item.id);
      wx.switchTab({ url: '/pages/assistant/index' });
    }
  },
  closeDetail() {
    this.stopRefresh();
    this.setData({ selected: null, creating: false });
    this.load();
  },
});
