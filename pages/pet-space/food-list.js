import { api, hasSession, requireSession, errorText } from '../../api/miniprogram';
import { accountKey, loadStore, saveStore } from '../../utils/pet-store';
import { petDiet, dietHistory } from '../../utils/diet-history';
Page({
  data: {
    history: false,
    pet: null,
    items: [],
    loading: false,
    error: '',
    editing: false,
    saving: false,
    form: { brand: '', product: '', started_on: '', ended_on: '', note: '' },
    associationNote: '',
    hasMore: false,
    catalogChoices: [],
    searchingCatalog: false,
    legacyItems: [],
    today: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
  },
  onLoad(q) {
    this.petId = q.petId || '';
    this.setData({ history: q.mode === 'history' });
  },
  switchMode(e) {
    const history = e.currentTarget.dataset.mode === 'history';
    if (this.data.saving || history === this.data.history) return;
    this.setData({ history, editing: false, items: [], legacyItems: [], associationNote: '', hasMore: false });
    this.load();
  },
  onShow() {
    this._active = true;
    this.load();
  },
  onHide() {
    this._catalogVersion = (this._catalogVersion || 0) + 1;
    this._active = false;
    this._version = (this._version || 0) + 1;
  },
  onUnload() {
    this.onHide();
  },
  async load() {
    if (!hasSession()) {
      this.setData({
        error: '请登录后查看清单',
        pet: null,
        items: [],
        legacyItems: [],
        associationNote: '',
        editing: false,
      });
      return;
    }
    const version = (this._version = (this._version || 0) + 1),
      account = accountKey('food-list');
    if (this._account && this._account !== account)
      this.setData({ pet: null, items: [], legacyItems: [], editing: false });
    this._account = account;
    this.setData({ loading: true, error: '', legacyItems: [] });
    try {
      const response = await api('/cat-profiles?limit=100');
      if (!this._active || version !== this._version || account !== accountKey('food-list')) return;
      const pet = (response.items || []).find((p) => p.id === this.petId);
      if (!pet) throw new Error('该宠物档案已不存在');
      const responseHistory = await api('/cat-profiles/' + encodeURIComponent(pet.id) + '/diet-history?limit=100');
      if (!this._active || version !== this._version || account !== accountKey('food-list')) return;
      const items = (responseHistory.items || [])
        .filter((item) => (this.data.history ? !item.is_current : item.is_current))
        .map((item) => ({
          ...item,
          periodText: item.started_on
            ? item.started_on + ' 至 ' + (item.ended_on || (item.is_current ? '现在' : '结束日期未填写'))
            : item.source === 'profile_confirmed'
            ? item.observed_on + ' 记录起 至 ' + (item.ended_on || '现在')
            : '吃粮日期未完整记录',
          healthText: (item.health_topics || [])
            .map((t) => t.label + '（' + t.conversation_count + '次咨询）')
            .join('、'),
        }));
      const imported = (loadStore().legacyDietImports || {})[pet.id] || [];
      const legacyItems = this.data.history ? dietHistory(pet.id).filter((item) => !imported.includes(item.id)) : [];
      this.setData({
        pet,
        items,
        legacyItems,
        hasMore: responseHistory.has_more,
        associationNote: responseHistory.association_note,
      });
    } catch (e) {
      if (version === this._version) this.setData({ error: errorText(e), pet: null, items: [], legacyItems: [] });
    } finally {
      if (version === this._version) this.setData({ loading: false });
    }
  },
  addFood() {
    if (!requireSession() || !this.data.pet || this.data.loading || this.data.saving) return;
    wx.navigateTo({ url: '/pages/pet-space/hunting?petId=' + encodeURIComponent(this.data.pet.id) });
  },
  edit() {
    if (!requireSession() || !this.data.pet || this.data.loading) return;
    this._catalogVersion = (this._catalogVersion || 0) + 1;
    this.setData({
      editing: true,
      catalogChoices: [],
      form: this.data.history
        ? { brand: '', product: '', started_on: '', ended_on: '', note: '' }
        : petDiet(this.data.pet),
    });
  },
  importLegacy(e) {
    if (this.data.saving || !requireSession()) return;
    const item = this.data.legacyItems.find((i) => i.id === e.currentTarget.dataset.id);
    if (!item) return;
    this._catalogVersion = (this._catalogVersion || 0) + 1;
    this.setData({
      editing: true,
      catalogChoices: [],
      form: {
        brand: item.brand,
        product: item.product,
        started_on: '',
        ended_on: '',
        legacy_record_id: item.id,
        note: '本机旧记录，吃粮日期待确认',
      },
    });
  },
  close() {
    if (!this.data.saving) {
      this._catalogVersion = (this._catalogVersion || 0) + 1;
      this.setData({ editing: false, catalogChoices: [] });
    }
  },
  input(e) {
    const key = e.currentTarget.dataset.key;
    const patch = { ['form.' + key]: e.detail.value };
    if (key === 'brand' || key === 'product') {
      patch['form.product_id'] = null;
      patch['form.formula_id'] = null;
      patch.catalogChoices = [];
      this._catalogVersion = (this._catalogVersion || 0) + 1;
    }
    this.setData(patch);
  },
  async searchCatalog() {
    if (this.data.saving || this.data.searchingCatalog) return;
    const q = [this.data.form.brand, this.data.form.product].filter(Boolean).join(' ').trim();
    if (!q) { wx.showToast({ title: '先填写品牌或粮名再查找', icon: 'none' }); return; }
    const version = (this._catalogVersion = (this._catalogVersion || 0) + 1);
    const account = accountKey('food-list');
    this.setData({ searchingCatalog: true, catalogChoices: [] });
    try {
      const response = await api('/products/search?q=' + encodeURIComponent(q) + '&limit=10');
      if (!this._active || !this.data.editing || version !== this._catalogVersion || account !== accountKey('food-list')) return;
      const choices = (response.suggestions || []).filter((item) => item.product_id && item.formula_id);
      this.setData({ catalogChoices: choices });
      if (!choices.length) wx.showToast({ title: '暂无匹配配方，可保留手工记录', icon: 'none' });
    } catch (error) {
      if (account === accountKey('food-list')) wx.showToast({ title: errorText(error), icon: 'none' });
    } finally {
      if (account === accountKey('food-list')) this.setData({ searchingCatalog: false });
    }
  },
  selectCatalogFood(event) {
    if (this.data.saving) return;
    const item = this.data.catalogChoices.find((row) => String(row.formula_id) === String(event.currentTarget.dataset.id));
    if (!item) return;
    this._catalogVersion = (this._catalogVersion || 0) + 1;
    this.setData({ form: { ...this.data.form, brand: item.brand, product: item.product_name,
      product_id: Number(item.product_id), formula_id: Number(item.formula_id) }, catalogChoices: [] });
  },
  dateChange(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value });
  },
  removeHistory(e) {
    if (this.data.saving || !requireSession()) return;
    const item = this.data.items.find((i) => i.id === e.currentTarget.dataset.id);
    if (!item || item.is_current) return;
    const account = accountKey('food-list');
    wx.showModal({
      title: '删除这条吃粮记录？',
      content: item.brand + ' ' + item.product,
      success: async (r) => {
        if (!r.confirm || account !== accountKey('food-list')) return;
        this.setData({ saving: true });
        try {
          await api(
            '/cat-profiles/' + encodeURIComponent(this.petId) + '/diet-history/' + encodeURIComponent(item.id),
            'DELETE',
          );
          if (account === accountKey('food-list') && this._active) await this.load();
        } catch (e) {
          wx.showToast({ title: errorText(e), icon: 'none' });
        } finally {
          if (account === accountKey('food-list')) this.setData({ saving: false });
        }
      },
    });
  },
  async save() {
    if (!requireSession() || this.data.saving) return;
    const diet = { brand: this.data.form.brand.trim(), product: this.data.form.product.trim() };
    if (this.data.form.product_id && this.data.form.formula_id) {
      diet.product_id = Number(this.data.form.product_id);
      diet.formula_id = Number(this.data.form.formula_id);
    }
    if (!diet.brand || !diet.product) {
      wx.showToast({ title: '请填写品牌和系列', icon: 'none' });
      return;
    }
    const account = accountKey('food-list'),
      pet = this.data.pet;
    if (!pet) return;
    this.setData({ saving: true });
    try {
      if (this.data.history) {
        await api('/cat-profiles/' + encodeURIComponent(pet.id) + '/diet-history', 'POST', {
          ...this.data.form,
          ...diet,
        });
      } else {
        await api('/cat-profiles/' + encodeURIComponent(pet.id), 'PATCH', { diet });
      }
      if (account !== accountKey('food-list')) return;
      if (this.data.form.legacy_record_id) {
        const legacyDietImports = { ...(loadStore().legacyDietImports || {}) };
        legacyDietImports[pet.id] = [
          ...new Set([...(legacyDietImports[pet.id] || []), this.data.form.legacy_record_id]),
        ];
        saveStore({ legacyDietImports });
      }
      this.setData({ editing: false });
      if (this._active) await this.load();
    } catch (e) {
      wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (account === accountKey('food-list')) this.setData({ saving: false });
    }
  },
});
