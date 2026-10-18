import { api, hasSession, mapPet, errorText } from '../../api/miniprogram';
import { loadStore, saveStore, accountKey, cachePetList, currentPet } from '../../utils/pet-store';

Page({
  data: {
    pet: null,
    pets: [],
    parent: {},
    favoriteCount: 0,
    postCount: 0,
    toysCount: 0,
    foodCount: 0,
  },
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ value: 'my', modalHidden: false });
    this.setData({ foodCount: 0 });
    this.refreshData();
    if (hasSession()) {
      this.syncProfile();
    }
  },
  async syncProfile(strict = false) {
    try {
      const account = accountKey('my');
      const res = await api('/cat-profiles?limit=100');
      if (account !== accountKey('my')) return;
      cachePetList((res.items || []).map(mapPet));
      saveStore({ parent: wx.getStorageSync('miniprogram_user') });
      this.refreshData();
    } catch (e) {
      if (strict) throw e;
      wx.showToast({ title: errorText(e), icon: 'none' });
    }
  },
  refreshData() {
    const s = loadStore();
    const pet = currentPet(s);
    const diet = pet && (pet.food_brand || pet.food_product || pet.diet?.brand || pet.diet?.product);
    const parent = s.parent || wx.getStorageSync('miniprogram_user') || {};
    this.setData({
      pet,
      foodCount: diet ? 1 : 0,
      pets: (s.pets || (s.pet ? [s.pet] : [])).map((p) => ({
        ...p,
        meta: [p.breed || p.type, p.age_text || (p.age !== '' && p.age != null ? `${p.age  } 岁` : '')]
          .filter(Boolean)
          .join(' · '),
      })),
      parent: {
        ...parent,
        name: hasSession() ? parent.name || parent.nickName || '完善家长资料' : '登录／注册',
        signedIn: hasSession(),
        image: parent.image || parent.avatarUrl || '',
      },
      reminderCount: (s.reminders || []).length,
      favoriteCount: s.favorites.length,
      postCount: s.posts.length,
      toysCount: s.supplies.toys.length,
    });
  },
  editPet() {
    const {pet} = this.data;
    wx.navigateTo({
      url: pet ? `/pages/pet-space/pet-edit?id=${encodeURIComponent(pet.id)}` : '/pages/pet-space/pet-edit?mode=create',
    });
  },
  addPet() {
    wx.navigateTo({ url: '/pages/pet-space/pet-edit?mode=create' });
  },
  selectPet(e) {
    const pet = this.data.pets.find((p) => p.id === e.currentTarget.dataset.id);
    if (!pet) return;
    saveStore({ pet, selectedPetId: pet.id });
    this.refreshData();
  },
  switchPet() {
    const { pets, pet } = this.data;
    if (pets.length < 2) return;
    const next = pets[(pets.findIndex((item) => item.id === pet?.id) + 1) % pets.length];
    this.selectPet({ currentTarget: { dataset: { id: next.id } } });
  },
  editPetCard(e) {
    wx.navigateTo({ url: `/pages/pet-space/pet-edit?id=${encodeURIComponent(e.currentTarget.dataset.id)}` });
  },
  editParent() {
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },
  openSupplies(e) {
    wx.navigateTo({ url: `/pages/pet-space/supplies?kind=${e.currentTarget.dataset.kind}` });
  },
  openReminders() {
    wx.navigateTo({ url: '/pages/pet-space/reminders' });
  },
  openFavorites() {
    wx.navigateTo({ url: '/pages/pet-space/library?mode=favorites' });
  },
  openPosts() {
    wx.navigateTo({ url: '/pages/pet-space/library?mode=posts' });
  },
  goSettings() {
    wx.navigateTo({ url: '/pages/setting/index' });
  },
});
