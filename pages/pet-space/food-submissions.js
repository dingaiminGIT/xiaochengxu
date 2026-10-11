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
    error: '',
    form: { brand: '', product: '', remark: '', images: [] },
    forChat: false,
  },
  onLoad(q) {
    this._initialId = q.id || '';
    this.setData({ creating: q.create === '1', forChat: q.chat === '1' });
    this.getOpenerEventChannel().on('prefill', (form) => this.setData({ form: { ...this.data.form, ...form } }));
  },
  onShow() {
    this._active = true;
    const account = accountKey('food-submissions');
    if (this._account && this._account !== account) this.setData({ items: [], selected: null });
    this._account = account;
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
      this.setData({ items: [], error: '登录后查看食品投稿' });
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
      if (this._active) this.setData({ error: errorText(e) });
    } finally {
      this._loading = false;
      if (this._active) {
        this.setData({ loading: false });
        clearTimeout(this._poll);
        if (
          this.data.items.some(
            (i) => ['pending', 'processing'].includes(i.recognition_status) && i.status !== 'cancelled',
          )
        )
          this._poll = setTimeout(() => this.load(), 5000);
      }
    }
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
