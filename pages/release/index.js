import { categories, mapPost } from '../../utils/community';
import { saveActivityPost } from '../../utils/halloween-activity';
import { queueHalloweenTaskPrompt } from '../../utils/halloween-task-prompt';
import { loadStore, saveStore, persistImage, accountKey } from '../../utils/pet-store';
import { requireSession, api, login, uploadImage, errorText, hasSession, mediaUrl } from '../../api/miniprogram';
Page({
  data: {
    pets: [],
    selectedPetId: '',
    petsLoading: false,
    petsError: '',
    categories: categories.slice(1),
    category: 'CHIN',
    title: '',
    body: '',
    images: [],
    saving: false,
    draftId: '',
    fromGuzi: false,
  },
  onLoad(query) {
    const fromGuzi = query.source === 'guzi' && !query.id;
    this.setData({
      fromGuzi,
      categories: fromGuzi ? categories.filter(item => item.id === 'FUNNY') : categories.slice(1),
      category: fromGuzi ? 'FUNNY' : 'CHIN',
    });
    if (fromGuzi) {
      this.getOpenerEventChannel().once('guziResult', ({ imagePath, account, resultSaved }) => {
        if (account !== accountKey('guzi-share') || !imagePath || this.data.images.length) return;
        this._fromGuzi = true;
        this._guziResultSaved = !!resultSaved;
        this.setData({ images: [imagePath], category: 'FUNNY' });
      });
    }
    this._activity = query.activity || '';
    this._activityAccount = accountKey('activity-publish');
    const draft = loadStore().posts.find((p) => p.id === query.id && p.status === 'draft');
    if (draft)
      this.setData({
        draftId: draft.id,
        selectedPetId: draft.petId || draft.cat_profile_id || '',
        category: draft.category,
        title: draft.title,
        body: draft.body,
        images: draft.images || [],
      });
  },
  onShow() {
    this.loadPets();
  },
  async loadPets() {
    const version = (this._petsVersion || 0) + 1;
    this._petsVersion = version;
    const account = accountKey('release');
    if (!hasSession()) {
      const pet = loadStore().pet;
      this.applyPets(pet && pet.id ? [pet] : []);
      return;
    }
    this.setData({ petsLoading: true, petsError: '' });
    try {
      const response = await api('/cat-profiles');
      if (version !== this._petsVersion || account !== accountKey('release')) return;
      this.applyPets(response.items || []);
    } catch (error) {
      if (version === this._petsVersion) this.setData({ petsError: errorText(error) });
    } finally {
      if (version === this._petsVersion) this.setData({ petsLoading: false });
    }
  },
  applyPets(items) {
    const pets = items.map((pet) => ({
      ...pet,
      image: mediaUrl(pet.avatar_url || pet.image || ''),
      icon: ['dog', '狗', '狗狗', '犬'].includes(pet.animal_type || pet.species || pet.type) ? 'dog' : 'cat',
    }));
    const selected = pets.find((pet) => pet.id === this.data.selectedPetId) || pets[0];
    this.setData({ pets, selectedPetId: selected ? selected.id : '' });
  },
  selectPet(e) {
    if (!this.data.saving) this.setData({ selectedPetId: e.currentTarget.dataset.id });
  },
  addPet() {
    if (!this.data.saving) wx.navigateTo({ url: '/pages/pet-space/pet-edit' });
  },
  onUnload() {
    this._petsVersion = (this._petsVersion || 0) + 1;
  },
  input(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  selectCategory(e) {
    this.setData({ category: e.currentTarget.dataset.id });
  },
  chooseImages() {
    if (this.data.saving || this.data.images.length >= 9) return;
    wx.chooseMedia({
      count: 9 - this.data.images.length,
      mediaType: ['image'],
      success: async (res) => {
        try {
          const files = await Promise.all(res.tempFiles.map((f) => persistImage(f.tempFilePath)));
          this.setData({ images: [...this.data.images, ...files].slice(0, 9) });
        } catch (e) {
          wx.showToast({ title: '图片保存失败', icon: 'none' });
        }
      },
    });
  },
  previewImage(e) {
    const current = this.data.images[Number(e.currentTarget.dataset.index)];
    if (current) wx.previewImage({ current, urls: this.data.images });
  },
  removeImage(e) {
    if (!this.data.saving)
      this.setData({ images: this.data.images.filter((_, i) => i !== e.currentTarget.dataset.index) });
  },
  saveDraft() {
    if (this.data.saving || this.data.fromGuzi) return;
    const d = this.data;
    if (!d.body.trim() && !d.title.trim() && !d.images.length) {
      wx.showToast({ title: '先记录一点内容吧', icon: 'none' });
      return;
    }
    try {
      const id = d.draftId || `draft-${Date.now()}`;
      saveStore({
        posts: [
          {
            id,
            status: 'draft',
            petId: d.selectedPetId,
            title: d.title,
            body: d.body,
            images: d.images,
            category: d.category,
            editedAt: new Date().toISOString(),
          },
          ...loadStore().posts.filter((p) => p.id !== id),
        ],
      });
      this.setData({ draftId: id });
      wx.showToast({ title: '草稿已保存' });
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },
  async finishPublish() {
    if (!this._fromGuzi) { wx.navigateBack(); return; }
    if (!this._guziResultSaved) {
      const leave = await new Promise(resolve => wx.showModal({
        title: '帖子已提交，头像还未保存',
        content: '返回首页后，将无法在活动页再次下载本次头像。确定返回首页吗？',
        confirmText: '返回首页', cancelText: '去保存',
        success: result => resolve(result.confirm), fail: () => resolve(false),
      }));
      if (!leave) { wx.navigateBack(); return; }
    }
    wx.switchTab({ url: '/pages/home/index' });
  },
  async release() {
    if (!requireSession()) return;
    if (this.data.saving) return;
    if (!this.data.body.trim() || !this.data.images.length) {
      wx.showToast({ title: '请填写内容并添加图片', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const user = await login();
      const publishAccount = accountKey('activity-publish');
      await this.loadPets();
      if (this.data.petsError) throw new Error(this.data.petsError);
      const images = [];
      // Keep successful uploads for a retry; never submit temporary WeChat URLs.
      for (let i = 0; i < this.data.images.length; i += 1) {
        const file = this.data.images[i];
        const url = /^https?:\/\//.test(file) && !/^https?:\/\/tmp\//.test(file) ? file : await uploadImage(file);
        images.push(url);
        this.setData({ [`images[${i}]`]: url });
      }
      const result = await api('/moments', 'POST', {
        title: this.data.title.trim(),
        content: this.data.body.trim(),
        category_code: this.data.category,
        images,
        visibility: 'public',
        cat_profile_id: this.data.selectedPetId || '',
        author_name: user.name,
        author_avatar: user.avatarUrl,
      });
      const post = mapPost(result.item);
      if (publishAccount === accountKey('activity-publish')) {
        try { saveActivityPost(post); }
        catch (_) { wx.showToast({ title: '帖子已发布，活动凭据保存失败', icon: 'none' }); }
      }
      const s = loadStore();
      saveStore({
        posts: [post, ...s.posts.filter((p) => p.id !== this.data.draftId && p.id !== post.id)],
        ...(post.status === 'published' && publishAccount === accountKey('activity-publish')
          ? { showLatestFeedAfterPublish: true } : {}),
      });
      if (publishAccount === accountKey('activity-publish')) {
        try { queueHalloweenTaskPrompt(post); } catch (_) { /* Local reminder failure must not fail publication. */ }
      }
      if (this._activity === 'halloween-2026' && this._activityAccount === accountKey('activity-publish')) {
        this.getOpenerEventChannel().emit('activityPostPublished', { id: post.id, status: post.status });
      }
      wx.showToast({ title: post.status === 'published' ? '发布成功' : '已提交审核' });
      await this.finishPublish();
    } catch (e) {
      wx.showModal({ title: '暂未发布', content: errorText(e), showCancel: false });
    } finally {
      this.setData({ saving: false });
    }
  },
});
