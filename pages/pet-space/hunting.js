import { fetchFoodCatalog, mapCatalogFood } from '../../utils/food-catalog';
import { api, requireSession, mapPet, errorText } from '../../api/miniprogram';

import { accountKey, cachePetList, currentPet } from '../../utils/pet-store';

Page({
  data: { query: '', items: [], loading: false, error: '', selected: null, savingDiet: false, petName: '' },
  onLoad(query = {}) {
    this.petId = query.petId || '';
    this._account = accountKey('hunting');
    this.search();
  },
  input(e) {
    this.setData({ query: e.detail.value });
  },
  async search() {
    const request = (this._request = (this._request || 0) + 1);
    this.setData({ loading: true, error: '', items: [], selected: null });
    try {
      const result = await fetchFoodCatalog(this.data.query, 20);
      if (request !== this._request) return;
      this.setData({ items: (result.items || []).map(mapCatalogFood) });
    } catch (e) {
      if (request === this._request) this.setData({ error: errorText(e) });
    } finally {
      if (request === this._request) this.setData({ loading: false });
    }
  },
  openItem(e) {
    this.setData({ petName: (this.petId ? '' : currentPet()?.name) || '' });
    this.setData({ selected: this.data.items.find((p) => p.id === e.currentTarget.dataset.id) || null });
  },
  closeDetail() {
    if (this.data.savingDiet) return;
    this.setData({ selected: null });
  },
  async setCurrentDiet() {
    if (this.data.savingDiet || !this.data.selected || !requireSession()) return;
    const food = this.data.selected;
    if (!food.brand || !food.name) {
      wx.showToast({ title: '食品品牌或名称不完整，暂无法设置', icon: 'none' });
      return;
    }
    if (food.product_id == null || food.formula_id == null) {
      wx.showToast({ title: '该产品缺少标准产品或配方编号，暂无法设置', icon: 'none' });
      return;
    }
    const account = accountKey('hunting');
    if (this.petId && this._account && account !== this._account) {
      wx.showToast({ title: '账号已切换，请重新进入口粮清单', icon: 'none' });
      return;
    }
    this.setData({ savingDiet: true });
    try {
      const result = await api('/cat-profiles?limit=100');
      if (this._disposed || account !== accountKey('hunting')) return;
      const store = cachePetList((result.items || []).map(mapPet));
      const pet = this.petId ? store.pets.find((item) => item.id === this.petId) : currentPet(store);
      if (!pet) {
        wx.showToast({ title: this.petId ? '该宠物档案已不存在' : '请先添加爱宠', icon: 'none' });
        wx.navigateTo({ url: '/pages/pet-space/pet-edit' });
        return;
      }
      this.setData({ petName: pet.name });
      const diet = { product_id: food.product_id, formula_id: food.formula_id };
      const saved = await api('/cat-profiles/' + encodeURIComponent(pet.id), 'PATCH', { diet });
      if (this._disposed || account !== accountKey('hunting')) return;
      const updated = mapPet(saved.item);
      cachePetList(store.pets.map((p) => (p.id === pet.id ? updated : p)));
      this.setData({ selected: null });
      wx.showToast({ title: '已设置为当前口粮', icon: 'success' });
    } catch (e) {
      if (!this._disposed && account === accountKey('hunting')) wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ savingDiet: false });
    }
  },
  contribute() {
    wx.navigateTo({ url: '/pages/pet-space/food-submissions?create=1' });
  },
  onUnload() {
    this._disposed = true;
    this._request = (this._request || 0) + 1;
  },
});
