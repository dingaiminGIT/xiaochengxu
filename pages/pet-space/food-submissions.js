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
    subscribing: false,
    error: '',
    signedOut: false,
    form: { brand: '', product: '', remark: '', images: [] },
    forChat: false,
  },
  onLoad(q) {
    this._initialId = q.id || '';
    this._entryId = this._initialId;
    this.setData({ creating: q.create === '1', forChat: q.chat === '1' });
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
    clearTimeout(this._poll);
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
        clearTimeout(this._poll);
        if (
          this.data.items.some(
            (i) => (['pending', 'processing'].includes(i.recognition_status) ||
              ['created', 'processing', 'waiting_input'].includes(i.processing_status)) && i.status !== 'cancelled',
          )
        )
          this._poll = setTimeout(() => this.load(), 5000);
      }
    }
  },
  signIn() {
    requireSession();
  },
  input(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value });
  },
  create() {
    this.setData({ creating: true, selected: null, error: '' });
  },
  reupload() {
    const item = this.data.selected;
    if (!item || !item.canReupload || this.data.saving) return;
    this.setData({
      creating: true,
      selected: null,
      error: '',
      form: { brand: item.claimed_brand, product: item.claimed_product_name, remark: item.remark || '', images: [] },
    });
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
        this.setData({ 'form.images': [...this.data.form.images, ...r.tempFiles.map((f) => f.tempFilePath)] });
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
      const url = e.currentTarget.dataset.url;
      const local = await downloadPetImage(url);
      wx.previewImage({ current: local, urls: [local] });
    } catch (e) {
      wx.showToast({ title: errorText(e), icon: 'none' });
    }
  },
  async submit() {
    if (!requireSession()) return;
    if (this.data.saving) return;
    this.setData({ saving: true, error: '' });
    try {
      const item = await submitFood(this.data.form);
      if (this._disposed) return;
      this.setData({
        creating: false,
        selected: submissionView(item),
        form: { brand: '', product: '', remark: '', images: [] },
      });
      this.load();
    } catch (e) {
      if (this._active) this.setData({ error: errorText(e) });
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
    if (this._active && account === accountKey('food-submissions'))
      this.setData({ selected: submissionView(r.item), creating: false });
  },
  closeDetail() {
    this.setData({ selected: null, creating: false });
  },
  subscribeResult() {
    const item = this.data.selected;
    const notification = item && item.result_notification;
    if (!notification || !notification.enabled || this.data.subscribing || !requireSession()) return;
    if (!wx.requestSubscribeMessage) {
      wx.showToast({ title: '当前微信版本不支持订阅，请在投稿页查看结果', icon: 'none' });
      return;
    }
    const account = accountKey('food-submissions');
    this.setData({ subscribing: true });
    // Invoke inside the user gesture, before any async login/network operation.
    wx.requestSubscribeMessage({
      tmplIds: [notification.template_id],
      success: async (result) => {
        try {
          if (account !== accountKey('food-submissions')) return;
          const decision = result[notification.template_id];
          if (!['accept', 'reject', 'ban', 'filter'].includes(decision)) throw new Error('未能获取订阅结果，请重试');
          await api(`/food-submissions/${encodeURIComponent(item.id)}/result-subscription`, 'POST', { decision });
          if (account !== accountKey('food-submissions') || this._disposed) return;
          wx.showToast({ title: decision === 'accept' ? '已订阅结果通知' : '未订阅，可在投稿页查看', icon: 'none' });
        } catch (e) {
          if (!this._disposed) wx.showToast({ title: errorText(e), icon: 'none' });
        } finally {
          if (!this._disposed) this.setData({ subscribing: false });
        }
      },
      fail: () => {
        if (!this._disposed) {
          this.setData({ subscribing: false });
          wx.showToast({ title: '未订阅，可在投稿页查看进度', icon: 'none' });
        }
      },
    });
  },
  cancel() {
    const item = this.data.selected;
    if (!item || !item.canCancel || this.data.saving) return;
    wx.showModal({
      title: '撤销这次投稿？',
      content: '撤销后将停止识别和审核。',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ saving: true });
        try {
          await api(`/food-submissions/${encodeURIComponent(item.id)}`, 'DELETE');
          this.setData({ selected: null });
          await this.load();
        } catch (e) {
          this.setData({ error: errorText(e) });
        } finally {
          this.setData({ saving: false });
        }
      },
    });
  },
  useInChat() {
    const item = this.data.selected;
    if (!item || !item.canAnalyze) return;
    this.getOpenerEventChannel().emit('foodSelected', item);
    wx.navigateBack();
  },
});
