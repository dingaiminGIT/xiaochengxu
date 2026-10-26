import { api, hasSession, requireSession } from '../../api/miniprogram';
import { currentPet } from '../../utils/pet-store';

Page({
  data: { pet: null, items: [], loading: false, error: '', notice: '' },
  onShow() {
    const pet = currentPet();
    this.setData({ pet });
    if (!pet || !pet.id) {
      this.setData({ error: '请先添加并选择宠物档案' });
      return;
    }
    if (!hasSession()) {
      requireSession();
      return;
    }
    this.load();
  },
  async load() {
    if (this.data.loading || !this.data.pet || !this.data.pet.id) return;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api(`/cat-profiles/${encodeURIComponent(this.data.pet.id)}/health-attention`);
      this.setData({
        items: result.directions || [],
        notice: result.notice || '健康关注仅用于日常观察，不作为医疗诊断。',
      });
    } catch (error) {
      this.setData({ error: error.message || '健康关注暂时无法读取' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
