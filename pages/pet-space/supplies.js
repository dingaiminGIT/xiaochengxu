import { supplyShare, timelineCard } from '../../utils/share';
import { previewIngredientExample } from '../../utils/preview-ingredient-example';
import { rememberDiet } from '../../utils/diet-history';
import { fetchFoodCatalog } from '../../utils/food-catalog';
import { requireSession, api, mediaUrl, errorText, hasSession, mapPet, login } from '../../api/miniprogram';
import { loadStore, saveStore, persistImage, accountKey, cachePetList, currentPet } from '../../utils/pet-store';

const covers = [
  {
    id: 'play',
    title: '把快乐，留给每一天',
    subtitle: '发现创意玩具，记录它的心头好',
    image: '/pages/pet-space/static/cat-3.webp',
  },
  {
    id: 'company',
    title: '一起玩，就是好时光',
    subtitle: '从一件小玩具开始，认识它的偏好',
    image: '/pages/pet-space/static/cat-1.webp',
  },
];

function mapFoodItem(p) {
  return {
    id: p.catalog_key || p.id,
    name: p.product_name || p.name || '',
    brand: p.brand || '',
    tag: p.brand || '',
    displayText: p.display_text || p.displayText || '',
    originType: p.origin_type || p.originType || '',
    image: mediaUrl(p.main_image_url || p.image_url || p.cover_url || p.image || ''),
    images: p.images || [],
    source: p.source || 'catalog',
  };
}

function mapLocalFood(p) {
  return {
    id: p.id,
    name: p.name || p.series || '',
    brand: p.brand || '',
    tag: p.brand || '',
    displayText: p.displayText || '',
    originType: p.originType || '用户补充',
    image: p.image || (p.images && p.images[0]) || '',
    images: p.images || [],
    source: 'local',
  };
}

Page({
  onShareAppMessage() {
    return supplyShare(this.data.kind, this.data.selected);
  },
  onShareTimeline() {
    return timelineCard(this.onShareAppMessage());
  },
  data: {
    hasPet: false,
    pets: [],
    selectedPetId: '',
    selectedPetName: '',
    listPetPickerVisible: false,
    dietSaving: false,
    dietPetId: '',
    dietForm: { brand: '', product: '' },
    kind: 'toys',
    title: '我的玩具',
    slides: [],
    slide: 0,
    items: [],
    mine: [],
    mineLoading: false,
    mineError: '',
    mineLimit: 2,
    loading: false,
    error: '',
    brand: '皇家',
    query: '',
    selected: null,
    editing: false,
    form: { name: '', note: '', images: [] },
    editingId: '',
    editorMode: 'form',
    catalogAdding: false,
    catalogForm: { brand: '', series: '', images: [] },
    catalogEditorMode: 'form',
  },

  onLoad(q = {}) {
    this._sharedItemId = q.id || '';
    this._sharedQuery = q.q || '';
    const kind = q.kind === 'food' ? 'food' : 'toys';
    this.setData({
      kind,
      title: kind === 'food' ? '我的食物' : '我的玩具',
      slides:
        kind === 'food'
          ? [
              {
                id: 'meal',
                title: '每一餐，都值得认真对待',
                subtitle: '逛逛狩猎广场，记录正在吃的粮',
                image: '/pages/pet-space/static/cat-4.webp',
              },
              {
                id: 'taste',
                title: '记住它喜欢的味道',
                subtitle: '品牌、口味与食用感受，一起收好',
                image: '/pages/pet-space/static/cat-2.webp',
              },
            ]
          : covers,
    });
    this.loadCatalog();
  },

  onShow() {
    this._visible = true;
    this.refreshMine();
    if (this.data.kind !== 'food') this.syncPet();
  },

  async syncPet() {
    this.setData({ hasPet: !!(loadStore().pet && loadStore().pet.id) });
    if (!hasSession()) return;
    const account = accountKey('supplies');
    const version = (this._petRequestId || 0) + 1;
    this._petRequestId = version;
    try {
      const response = await api('/cat-profiles');
      if (version !== this._petRequestId || account !== accountKey('supplies')) return;
      const pets = response.items || [];
      pets.forEach(rememberDiet);
      cachePetList(pets.map(mapPet));
      const pet = currentPet();
      this.setData({ hasPet: !!pet });
    } catch (_) {
      // Preserve the last known binding when the network is unavailable.
    }
  },

  addPet() {
    wx.navigateTo({ url: '/pages/pet-space/pet-edit?mode=create' });
  },

  onHide() {
    this._visible = false;
    clearTimeout(this._minePoll);
    this._mineRequest = (this._mineRequest || 0) + 1;
    this._petRequestId = (this._petRequestId || 0) + 1;
  },

  openHunting() {
    wx.navigateTo({ url: '/pages/pet-space/hunting' });
  },
  async refreshMine() {
    if (this.data.kind !== 'food') {
      this.setData({ mine: loadStore().supplies.toys });
      return;
    }
    if (!hasSession()) {
      this.setData({
        mine: [],
        pets: [],
        selectedPetId: '',
        selectedPetName: '',
        listPetPickerVisible: false,
        mineLoading: false,
        hasPet: false,
      });
      return;
    }
    const version = (this._mineRequest = (this._mineRequest || 0) + 1);
    this.setData({ mineLoading: true, mineError: '', mine: [] });
    try {
      await login();
      const account = accountKey('supplies');
      const response = await api('/cat-profiles?limit=100');
      if (version !== this._mineRequest || !this._visible || account !== accountKey('supplies')) return;
      const pets = response.items || [];
      pets.forEach(rememberDiet);
      cachePetList(pets.map(mapPet));
      const selectedPetId = currentPet()?.id || pets[0]?.id || '';
      const mine = pets
        .filter((pet) => pet.id === selectedPetId)
        .map((pet) => {
          const brand = pet.food_brand || (pet.diet && pet.diet.brand) || '';
          const product = pet.food_product || (pet.diet && pet.diet.product) || '';
          return {
            id: pet.id,
            brand,
            product,
            name: [brand, product].filter(Boolean).join(' · '),
            note: pet.name + '的口粮',
          };
        })
        .filter((item) => item.name);
      this.setData({
        pets: pets.map(mapPet),
        mine,
        selectedPetId,
        selectedPetName: pets.find((p) => p.id === selectedPetId)?.name || '',
        hasPet: pets.length > 0,
      });
    } catch (e) {
      if (version === this._mineRequest && this._visible) this.setData({ mineError: errorText(e) });
    } finally {
      if (version === this._mineRequest && this._visible) this.setData({ mineLoading: false });
    }
  },

  changeSlide(e) {
    this.setData({ slide: e.detail.current });
  },

  inputSearch(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },

  localCatalogItems() {
    return (loadStore().catalogFood || []).map(mapLocalFood);
  },

  mergeFoodItems(remote = []) {
    const brand = (this.data.brand || '').trim();
    const query = (this.data.query || '').trim();
    const local = this.localCatalogItems().filter((item) => {
      if (brand && !(item.brand || '').includes(brand)) return false;
      if (
        query &&
        !(item.name || '').includes(query) &&
        !(item.displayText || '').includes(query) &&
        !(item.brand || '').includes(query)
      ) {
        return false;
      }
      return true;
    });
    const seen = new Set(local.map((item) => item.id));
    return [...local, ...remote.filter((item) => !seen.has(item.id))];
  },

  async loadCatalog() {
    const requestId = (this._requestId || 0) + 1;
    this._requestId = requestId;
    this.setData({ loading: true, error: '', items: [] });
    try {
      const food = this.data.kind === 'food';
      const r = food ? await fetchFoodCatalog(this._sharedItemId ? this._sharedQuery : '', this._sharedItemId ? 100 : 4) : await api('/ideas?limit=100');
      if (requestId !== this._requestId) return;
      const items = food
        ? (r.items || []).map(mapFoodItem)
        : (r.items || [])
            .filter((p) => ['PET_TOY', 'OWNER_TOY', 'SMART_DEVICE', 'DAILY_USE'].includes(p.category))
            .map((p) => ({
              id: p.id,
              name: p.title,
              brand: '',
              tag: p.category_name,
              displayText: p.description || '',
              originType: '',
              note: p.description,
              image: mediaUrl(p.cover_url),
              source: 'idea',
            }));
      this.setData({ items });
      if (this._sharedItemId) {
        const selected = items.find((item) => String(item.id) === String(this._sharedItemId));
        this._sharedItemId = '';
        this.setData({ selected: selected || null });
        if (!selected) wx.showToast({ title: '分享的好物已下架或暂不可用', icon: 'none' });
      }
      if (!food) {
        const featured = items
          .filter((p) => p.image)
          .slice(0, 5)
          .map((p) => ({
            id: p.id,
            title: p.name,
            subtitle: `${p.tag} · ${p.displayText || p.note || ''}`,
            image: p.image,
          }));
        if (featured.length) this.setData({ slides: [...featured, ...covers].slice(0, 5) });
      }
    } catch (e) {
      if (requestId === this._requestId) {
        if (this.data.kind === 'food') {
          this.setData({ items: [], error: errorText(e) });
        } else {
          this.setData({ error: errorText(e) });
        }
      }
    } finally {
      if (requestId === this._requestId) this.setData({ loading: false });
    }
  },

  openItem(e) {
    this.setData({ selected: this.data.items.find((p) => p.id === e.currentTarget.dataset.id) || null });
  },

  closeDetail() {
    this.setData({ selected: null });
  },

  addToMine() {
    const p = this.data.selected;
    if (!p) return;
    if (this.data.kind === 'food') {
      this.closeDetail();
      this.editMine({ currentTarget: { dataset: {} } });
      this.setData({ dietForm: { brand: p.brand || '', product: p.name || '' } });
      return;
    }
    const supplies = loadStore().supplies;
    if (supplies[this.data.kind].some((i) => i.sourceId === p.id)) {
      wx.showToast({ title: '已经在你的清单里了', icon: 'none' });
      return;
    }
    try {
      supplies[this.data.kind].push({
        id: `item-${Date.now()}`,
        sourceId: p.id,
        name: p.name,
        note: p.displayText || p.note || '',
        images: p.images || (p.image ? [p.image] : []),
        brand: p.brand || '',
      });
      saveStore({ supplies });
      this.refreshMine();
      this.closeDetail();
      wx.showToast({ title: '已加入清单' });
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  openFoodSubmissions(create = false, form = {}) {
    wx.navigateTo({
      url: `/pages/pet-space/food-submissions${create ? '?create=1' : ''}`,
      success: (r) => r.eventChannel.emit('prefill', form),
    });
  },
  openCatalogAdd() {
    if (this.data.kind !== 'food') return;
    this.openFoodSubmissions(true, { brand: this.data.brand.trim(), product: this.data.query.trim() });
  },
  closeCatalogAdd() {
    this.setData({ catalogAdding: false, catalogEditorMode: 'form' });
  },

  inputCatalog(e) {
    this.setData({ [`catalogForm.${e.currentTarget.dataset.key}`]: e.detail.value });
  },

  openCatalogIngredient() {
    this.setData({ catalogEditorMode: 'ingredient' });
  },

  closeCatalogIngredient() {
    this.setData({ catalogEditorMode: 'form' });
  },

  onCatalogIngredientFound() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album'];
        this.pickCatalogImages(sourceType);
      },
    });
  },

  pickCatalogImages(sourceType) {
    const remain = 3 - (this.data.catalogForm.images || []).length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 3 张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType,
      sizeType: ['compressed'],
      success: (res) => {
        const files = (res.tempFiles || []).filter((file) => {
          if (file.size > 10 * 1024 * 1024) {
            wx.showToast({ title: '单张图片不能超过 10MB', icon: 'none' });
            return false;
          }
          return true;
        });
        if (!files.length) return;
        const next = [...(this.data.catalogForm.images || []), ...files.map((file) => file.tempFilePath)].slice(0, 3);
        this.setData({
          catalogEditorMode: 'form',
          'catalogForm.images': next,
        });
      },
    });
  },

  previewCatalogImage(e) {
    const current = e.currentTarget.dataset.current;
    const urls = this.data.catalogForm.images || [];
    if (!current || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  removeCatalogImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({
      'catalogForm.images': (this.data.catalogForm.images || []).filter((_, i) => i !== index),
    });
  },

  saveCatalogFood() {
    this.openFoodSubmissions(true, {
      brand: this.data.catalogForm.brand,
      product: this.data.catalogForm.series,
      images: this.data.catalogForm.images,
    });
    this.closeCatalogAdd();
  },

  editMine(e) {
    if (this.data.kind === 'food') {
      if (this.data.mineLoading || this.data.mineError) return;
      if (!this.data.pets.length) {
        this.addPet();
        return;
      }
      const pet =
        this.data.pets.find((p) => p.id === e.currentTarget.dataset.id) ||
        this.data.pets.find((p) => p.id === currentPet()?.id) ||
        this.data.pets[0];
      this.setData({
        editing: true,
        dietPetId: pet.id,
        dietForm: {
          brand: pet.food_brand || pet.diet?.brand || '',
          product: pet.food_product || pet.diet?.product || '',
        },
      });
      return;
    }
    const item = this.data.mine.find((i) => i.id === e.currentTarget.dataset.id);
    this.setData({
      editing: true,
      editingId: item ? item.id : '',
      form: item
        ? { name: item.name || '', note: item.note || '', images: item.images || [] }
        : { name: '', note: '', images: [] },
      editorMode: 'form',
    });
  },

  closeEditor() {
    if (this.data.dietSaving) return;
    this.setData({ editing: false, editorMode: 'form' });
  },

  input(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value });
  },

  openIngredientSheet() {
    if (this.data.kind !== 'food') return;
    this.openFoodSubmissions(true, { product: this.data.form.name, images: [] });
  },
  closeIngredientSheet() {
    this.setData({ editorMode: 'form' });
  },

  previewIngredientExample() {
    previewIngredientExample('pages/pet-space/static/ingredient-example.jpg');
  },

  onIngredientFound() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album'];
        this.pickIngredientImages(sourceType);
      },
    });
  },

  pickIngredientImages(sourceType) {
    const remain = 3 - (this.data.form.images || []).length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 3 张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType,
      sizeType: ['compressed'],
      success: (res) => {
        const files = (res.tempFiles || []).filter((file) => {
          if (file.size > 10 * 1024 * 1024) {
            wx.showToast({ title: '单张图片不能超过 10MB', icon: 'none' });
            return false;
          }
          return true;
        });
        if (!files.length) return;
        const next = [...(this.data.form.images || []), ...files.map((file) => file.tempFilePath)].slice(0, 3);
        this.setData({
          editorMode: 'form',
          'form.images': next,
          'form.note': this.data.form.note || '已上传配料表，待补充食用感受',
        });
      },
    });
  },

  previewFormImage(e) {
    const current = e.currentTarget.dataset.current;
    const urls = this.data.form.images || [];
    if (!current || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  removeFormImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({
      'form.images': (this.data.form.images || []).filter((_, i) => i !== index),
    });
  },

  async saveMine() {
    if (this.data.kind === 'food') {
      await this.saveDiet();
      return;
    }
    if (!this.data.form.name.trim()) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    try {
      const images = [];
      for (const path of this.data.form.images || []) {
        if (!path) continue;
        const needPersist = /tmp/i.test(path) || (!/^wxfile:\/\//.test(path) && !/^https?:\/\//.test(path));
        images.push(needPersist ? await persistImage(path) : path);
      }
      const supplies = loadStore().supplies;
      const item = {
        ...this.data.form,
        name: this.data.form.name.trim(),
        note: (this.data.form.note || '').trim(),
        images,
        id: this.data.editingId || `item-${Date.now()}`,
      };
      supplies[this.data.kind] = this.data.editingId
        ? supplies[this.data.kind].map((p) => (p.id === item.id ? { ...p, ...item } : p))
        : [item, ...supplies[this.data.kind]];
      saveStore({ supplies });
      this.refreshMine();
      this.closeEditor();
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  openFoodList() {
    if (!this.data.selectedPetId) {
      this.editMine({ currentTarget: { dataset: {} } });
      return;
    }
    wx.navigateTo({ url: '/pages/pet-space/food-list?petId=' + encodeURIComponent(this.data.selectedPetId) });
  },
  openDietHistory() {
    if (!this.data.selectedPetId) {
      this.addPet();
      return;
    }
    wx.navigateTo({
      url: '/pages/pet-space/food-list?mode=history&petId=' + encodeURIComponent(this.data.selectedPetId),
    });
  },
  openListPetPicker() {
    if (this.data.pets.length > 1) this.setData({ listPetPickerVisible: true });
  },
  closeListPetPicker() {
    this.setData({ listPetPickerVisible: false });
  },
  async selectListPet(e) {
    const pet = this.data.pets.find((p) => p.id === e.currentTarget.dataset.id);
    if (!pet) return;
    this.closeListPetPicker();
    if (pet.id === this.data.selectedPetId) return;
    saveStore({ pet: mapPet(pet), selectedPetId: pet.id });
    this.setData({ selectedPetId: pet.id, selectedPetName: pet.name, mine: [] });
    await this.refreshMine();
  },

  selectDietPet(e) {
    if (this.data.dietSaving) return;
    this.setData({ dietPetId: e.currentTarget.dataset.id });
  },
  inputDiet(e) {
    this.setData({ ['dietForm.' + e.currentTarget.dataset.key]: e.detail.value });
  },
  async saveDiet() {
    if (!requireSession()) return;
    if (this.data.dietSaving) return;
    const id = this.data.dietPetId;
    if (!this.data.pets.some((p) => p.id === id)) return;
    const diet = { brand: this.data.dietForm.brand.trim(), product: this.data.dietForm.product.trim() };
    if (!diet.brand || !diet.product) {
      wx.showToast({ title: '请填写口粮品牌和系列', icon: 'none' });
      return;
    }
    const account = accountKey('supplies');
    this.setData({ dietSaving: true });
    try {
      const previous = this.data.pets.find((p) => p.id === id);
      // POST creates a new animal; PATCH updates only this animal's current diet.
      await api('/cat-profiles/' + encodeURIComponent(id), 'PATCH', { diet });
      if (account !== accountKey('supplies')) return;
      rememberDiet(previous);
      rememberDiet({ id, diet });
      if (!this._visible) return;
      this.setData({ editing: false });
      await this.refreshMine();
      wx.showToast({ title: '口粮已保存' });
    } catch (e) {
      if (this._visible) wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (this._visible) this.setData({ dietSaving: false });
    }
  },

  onUnload() {
    this.onHide();
    this._petRequestId = (this._petRequestId || 0) + 1;
    this._requestId = (this._requestId || 0) + 1;
  },
});
