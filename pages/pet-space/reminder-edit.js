import {
  reminderTypes,
  repeatOptions,
  listReminders,
  localDate,
  localTime,
} from '../../utils/reminders';
import { refreshCloudReminders, saveCloudReminder, deleteCloudReminder } from '../../utils/reminder-api';
import { loadStore, currentPet, accountKey, cachePetList } from '../../utils/pet-store';
import { api, hasSession, mapPet } from '../../api/miniprogram';
Page({
  data: {
    id: '',
    type: 'custom',
    title: '',
    icon: 'bell',
    date: '',
    time: '',
    today: localDate(),
    repeatIndex: 0,
    repeatLabels: repeatOptions.map((r) => r.label),
    petId: '',
    petName: '',
    pets: [],
    petPicker: false,
    note: '',
    saving: false,
    missing: false,
  },
  onLoad(q) {
    this._account = accountKey('reminders');
    this._requestKey = `reminder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item = q.id ? listReminders().find((r) => r.id === q.id) : null;
    if (q.id && !item) {
      this.setData({ missing: true });
      return;
    }
    const type = reminderTypes.find((t) => t.id === (item?.type || q.type)) || reminderTypes[reminderTypes.length - 1];
    const pets = loadStore().pets || (loadStore().pet ? [loadStore().pet] : []),
      pet = currentPet();
    this.setData({
      id: item?.id || '',
      revision: item?.revision,
      type: type.id,
      title: item?.title || (type.id === 'custom' ? '' : type.name),
      icon: type.icon,
      date: item ? localDate(item.dueAt) : /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : '',
      time: item ? localTime(item.dueAt) : '',
      repeatIndex: Math.max(
        0,
        repeatOptions.findIndex((r) => r.id === item?.repeat),
      ),
      petId: item ? item.petId : pet?.id || '',
      petName: item ? item.petName : pet?.name || '',
      note: item?.note || '',
      pets,
    });
    this.loadPets();
  },
  onShow() {
    refreshCloudReminders().catch(() => { /* Cached edit remains available; writes report failures. */ });
  },
  async loadPets() {
    if (!hasSession()) return;
    try {
      const r = await api('/cat-profiles?limit=100');
      if (this._disposed || this._account !== accountKey('reminders')) return;
      const pets = (r.items || []).map(mapPet);
      cachePetList(pets);
      this.setData({ pets });
    } catch (_) {
      /* Cached profiles remain selectable offline. */
    }
  },
  onUnload() {
    this._disposed = true;
  },
  input(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  repeat(e) {
    this.setData({ repeatIndex: Number(e.detail.value) });
  },
  choosePet() {
    this.setData({ petPicker: true });
  },
  closePets() {
    this.setData({ petPicker: false });
  },
  selectPet(e) {
    const pet = this.data.pets.find((p) => p.id === e.currentTarget.dataset.id);
    this.setData({ petId: pet?.id || '', petName: pet?.name || '', petPicker: false });
  },
  async save() {
    if (this.data.saving) return;
    if (this._account !== accountKey('reminders')) {
      wx.showToast({ title: '账号已变化，请重新打开', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await saveCloudReminder({ ...this.data, repeat: repeatOptions[this.data.repeatIndex].id }, this._requestKey);
      if (this._disposed || this._account !== accountKey('reminders')) return;
      wx.showToast({ title: '提醒已保存' });
      wx.navigateBack();
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
  remove() {
    wx.showModal({
      title: '删除提醒',
      content: '确定删除这条提醒吗？已完成的历史记录会保留。',
      confirmText: '删除',
      success: async (r) => {
        if (!r.confirm || this._account !== accountKey('reminders')) return;
        try {
          await deleteCloudReminder(this.data.id);
          if (this._disposed || this._account !== accountKey('reminders')) return;
          wx.navigateBack();
        } catch (e) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' });
        }
      },
    });
  },
});
