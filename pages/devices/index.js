import { api, hasSession, requireSession } from '../../api/miniprogram';
import { currentPet } from '../../utils/pet-store';
import { deviceRequest, presentDevice, deviceTime, NOTICE_VERSION, PRIVACY_VERSION } from '../../utils/device-api';

const titles = {
  list: '我的设备',
  brand: '绑定智能设备',
  login: '连接小佩账号',
  choose: '选择设备',
  confirm: '确认绑定',
  success: '绑定成功',
  detail: '设备详情',
  account: '小佩账号连接',
  events: '设备记录',
};
Page({
  data: {
    stage: 'list',
    title: titles.list,
    busy: false,
    loading: false,
    error: '',
    errorCode: '',
    visibleItems: [],
    items: [],
    connections: [],
    candidates: [],
    pets: [],
    petIndex: 0,
    allPets: false,
    currentPetId: '',
    currentPetName: '',
    username: '',
    password: '',
    showPassword: false,
    accepted: false,
    attribution: 'unknown',
    selected: null,
    device: null,
    connection: null,
    events: [],
    kind: 'eat',
    deleteHistory: false,
    job: null,
    ready: false,
    policyAvailable: false,
  },
  onLoad(options) {
    this._epoch = 0;
    this._history = [];
    const pet = currentPet();
    this.setData({ currentPetId: pet?.id || '', currentPetName: pet?.name || '当前宠物' });
    if (options.add === '1') this.go('brand');
  },
  onShow() {
    this._visible = true;
    const token = wx.getStorageSync('miniprogram_token') || '';
    const pet = currentPet();
    this.setData({ currentPetId: pet?.id || '', currentPetName: pet?.name || '当前宠物' });
    if (this._token !== undefined && this._token !== token) {
      this._epoch += 1;
      this._history = [];
      this.setData({
        busy: false,
        items: [],
        visibleItems: [],
        connections: [],
        candidates: [],
        device: null,
        selected: null,
        connection: null,
        job: null,
      });
      this.go('list');
    }
    this._token = token;
    if (!hasSession()) {
      this.setData({ error: '登录后查看自己的设备', errorCode: 'LOGIN_REQUIRED' });
      return;
    }
    if (this.data.stage === 'list') this.loadList();
    if (this.data.stage === 'login') this.loadReadiness();
    if (this.data.stage === 'confirm') this.loadPets();
    if (this.data.job) this.pollJob();
  },
  onHide() {
    this._visible = false;
    clearTimeout(this._poll);
    this.setData({ username: '', password: '', accepted: false, showPassword: false });
  },
  onUnload() {
    this._epoch += 1;
    this._visible = false;
    clearTimeout(this._poll);
  },
  go(stage, remember = true) {
    if (remember && this.data.stage !== stage) this._history.push(this.data.stage);
    this.setData({ stage, title: titles[stage], error: '', errorCode: '' });
  },
  back() {
    if (this.data.busy) return;
    this.setData({ username: '', password: '', accepted: false, showPassword: false });
    const stage = this._history.pop();
    if (stage) {
      this.go(stage, false);
      if (stage === 'list') this.loadList();
    } else wx.navigateBack();
  },
  async run(work) {
    if (this.data.busy) return;
    if (!requireSession()) return;
    const epoch = this._epoch;
    this.setData({ busy: true, error: '', errorCode: '' });
    try {
      await work(() => epoch === this._epoch && this._token === wx.getStorageSync('miniprogram_token'));
    } catch (e) {
      if (epoch === this._epoch) this.setData({ error: e.message || '操作失败，请重试', errorCode: e.code || '' });
    } finally {
      if (epoch === this._epoch) this.setData({ busy: false });
    }
  },
  loginApp() {
    requireSession();
  },
  async loadList() {
    return this.run(async (valid) => {
      const [list, connections] = await Promise.all([
        deviceRequest('/device-bindings'),
        deviceRequest('/device-connections'),
      ]);
      if (valid()) {
        this.setData({ items: (list.items || []).map(presentDevice), connections: connections.items || [] });
        this.filterItems();
      }
    });
  },
  filterItems() {
    this.setData({
      visibleItems: this.data.items.filter(
        (d) => this.data.allPets || !this.data.currentPetId || String(d.pet_id) === String(this.data.currentPetId),
      ),
    });
  },
  toggleFilter() {
    this.setData({ allPets: !this.data.allPets });
    this.filterItems();
  },
  add() {
    this.go('brand');
  },
  async selectBrand() {
    if (!requireSession()) return;
    return this.run(async (valid) => {
      const r = await deviceRequest('/device-connections');
      if (!valid()) return;
      const active = (r.items || []).find((c) => c.auth_status === 'connected');
      this.setData({ connections: r.items || [], connection: active || null });
      if (active) {
        const devices = await deviceRequest(`/device-connections/${active.id}/devices`);
        if (valid()) {
          this.setData({ candidates: devices.items || [] });
          this.go('choose');
        }
      } else {
        this.go('login');
        await this.loadReadiness();
      }
    });
  },
  async loadReadiness() {
    try {
      const epoch = this._epoch;
      const r = await deviceRequest('/device-capabilities');
      if (epoch !== this._epoch) return;
      this.setData({ ready: !!r.enabled, policyAvailable: !!r.policy_available });
      if (!r.enabled) this.setData({ error: r.message || '设备服务尚未开放，请稍后再试', errorCode: 'UNAVAILABLE' });
    } catch (e) {
      this.setData({ ready: false, error: e.message });
    }
  },
  inputUsername(e) {
    this.setData({ username: e.detail.value });
  },
  inputPassword(e) {
    this.setData({ password: e.detail.value });
  },
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },
  consent(e) {
    this.setData({ accepted: e.detail.value.includes('accepted') });
  },
  openPolicy(e) {
    wx.navigateTo({ url: `/pages/devices/policy?kind=${e.currentTarget.dataset.kind || 'notice'}` });
  },
  async connect() {
    if (!this.data.ready || !this.data.accepted || !this.data.username.trim() || !this.data.password) return;
    await this.run(async (valid) => {
      const data = {
        username: this.data.username.trim(),
        password: this.data.password,
        consent: { accepted: true, notice_version: NOTICE_VERSION, privacy_version: PRIVACY_VERSION },
      };
      // Keep credentials only in the request lifetime, never local storage or logs.
      this.setData({ username: '', password: '', accepted: false, showPassword: false });
      let result;
      try {
        result = await deviceRequest('/device-connections/petkit', 'POST', data);
      } finally {
        data.username = '';
        data.password = '';
      }
      if (!valid()) return;
      this.setData({ connection: result.item, candidates: result.devices || [] });
      this.go('choose');
    });
  },
  refreshCandidates() {
    return this.run(async (valid) => {
      const r = await deviceRequest(`/device-connections/${this.data.connection.id}/devices/refresh`, 'POST');
      if (valid()) {
        this.setData({ candidates: r.items || [] });
        this.go('choose', false);
      }
    });
  },
  reauthenticate() {
    this.go('login');
    this.loadReadiness();
  },
  async choose(e) {
    const item = this.data.candidates.find((c) => c.device_id === e.currentTarget.dataset.id);
    if (!item || !item.supported) return;
    if (item.binding_id) {
      this.openDetailById(item.binding_id);
      return;
    }
    this.setData({ selected: item, attribution: 'unknown' });
    this.go('confirm');
    await this.loadPets();
  },
  async loadPets() {
    try {
      const token = this._token;
      const r = await api('/cat-profiles');
      if (token !== wx.getStorageSync('miniprogram_token')) return;
      const pets = r.items || [];
      const index = pets.findIndex((p) => p.id === this.data.currentPetId);
      this.setData({ pets, petIndex: Math.max(0, index) });
    } catch (_) {
      this.setData({ pets: [], error: '宠物档案读取失败，请重试' });
    }
  },
  selectPet(e) {
    this.setData({ petIndex: Number(e.detail.value) });
  },
  createPet() {
    wx.navigateTo({ url: '/pages/pet-space/pet-edit' });
  },
  selectAttribution(e) {
    this.setData({ attribution: e.detail.value });
  },
  bind() {
    const pet = this.data.pets[this.data.petIndex];
    if (!pet || !this.data.selected) return;
    return this.run(async (valid) => {
      const r = await deviceRequest('/device-bindings', 'POST', {
        connection_id: this.data.connection.id,
        vendor_device_id: this.data.selected.device_id,
        pet_id: pet.id,
        attribution_status: this.data.attribution,
      });
      if (!valid()) return;
      this.setData({ device: presentDevice(r.item), job: r.job || null });
      this._history = ['list'];
      this.go('success', false);
      if (r.job) this.pollJob();
      else if (this._visible) this._poll = setTimeout(() => this.sync(), 0);
    });
  },
  openDetail(e) {
    this.openDetailById(e.currentTarget.dataset.id);
  },
  openDetailById(id) {
    return this.run(async (valid) => {
      const r = await deviceRequest(`/device-bindings/${encodeURIComponent(id)}`);
      if (valid()) {
        this.setData({ device: presentDevice(r.item), job: r.job || null });
        this.go('detail');
        if (r.job) this.pollJob();
      }
    });
  },
  viewBound() {
    this.go('detail');
  },
  viewList() {
    this._history = [];
    this.go('list', false);
    this.loadList();
  },
  sync() {
    return this.run(async (valid) => {
      const r = await deviceRequest(`/device-bindings/${this.data.device.id}/sync`, 'POST');
      if (valid()) {
        this.setData({ job: r.item });
        this.pollJob();
      }
    });
  },
  async pollJob() {
    clearTimeout(this._poll);
    if (!this._visible || !this.data.job || !hasSession()) return;
    const id = this.data.job.id;
    const epoch = this._epoch;
    try {
      const r = await deviceRequest(`/device-sync-jobs/${id}`);
      if (epoch !== this._epoch || this.data.job?.id !== id) return;
      if (r.item.status === 'succeeded' || r.item.status === 'failed') {
        this.setData({ job: null });
        const detail = await deviceRequest(`/device-bindings/${this.data.device.id}`);
        if (epoch !== this._epoch) return;
        this.setData({
          device: presentDevice(detail.item),
          error: r.item.status === 'failed' ? r.item.error || '同步失败，请重试' : '',
          errorCode: r.item.code || '',
        });
        return;
      }
    } catch (e) {
      if (epoch === this._epoch) this.setData({ error: e.message });
    }
    if (this._visible && epoch === this._epoch) this._poll = setTimeout(() => this.pollJob(), 5000);
  },
  showEvents(e) {
    const kind = e.currentTarget.dataset.kind;
    return this.run(async (valid) => {
      const r = await deviceRequest(`/device-bindings/${this.data.device.id}/events?kind=${kind}`);
      if (valid()) {
        this.setData({
          kind,
          events: (r.items || []).map((row) => ({
            ...row,
            time_text: deviceTime(row.at),
            end_text: deviceTime(row.end),
          })),
          eventsAvailable: r.available,
        });
        this.go('events');
      }
    });
  },
  manage() {
    return this.run(async (valid) => {
      const r = await deviceRequest('/device-connections');
      if (valid()) {
        this.setData({
          connections: r.items || [],
          connection: (r.items || []).find((c) => c.auth_status !== 'disconnected') || (r.items || [])[0] || null,
        });
        this.go('account');
      }
    });
  },
  selectConnection(e) {
    const connection = this.data.connections.find((c) => c.id === e.currentTarget.dataset.id);
    if (connection) this.setData({ connection, deleteHistory: false });
  },
  deleteToggle(e) {
    this.setData({ deleteHistory: e.detail.value.includes('delete') });
  },
  disconnect() {
    if (!this.data.connection || this.data.busy) return;
    wx.showModal({
      title: '断开小佩连接？',
      content: `停止此连接的全部设备同步并清除会话。${
        this.data.deleteHistory ? '同时删除已同步的设备历史。' : '历史数据会保留供你查看。'
      }不会删除小佩 App 中的设备。`,
      success: (r) => {
        if (r.confirm)
          this.run(async (valid) => {
            await deviceRequest(`/device-connections/${this.data.connection.id}`, 'DELETE', {
              delete_history: this.data.deleteHistory || this.data.connection.auth_status === 'disconnected',
            });
            if (valid()) {
              const list = await deviceRequest('/device-bindings');
              if (!valid()) return;
              this.setData({
                connection: null,
                job: null,
                items: list.items.map(presentDevice),
                candidates: [],
                connections: [],
              });
              this.filterItems();
              this._history = [];
              this.go('list', false);
            }
          });
      },
    });
  },
  unlink() {
    if (this.data.busy) return;
    wx.showModal({
      title: '解除设备绑定？',
      content: '停止同步这台设备，其他设备不受影响。不会删除小佩 App 中的设备。',
      success: (r) => {
        if (r.confirm)
          this.run(async (valid) => {
            await deviceRequest(`/device-bindings/${this.data.device.id}`, 'DELETE');
            if (valid()) {
              this.setData({ job: null });
              const list = await deviceRequest('/device-bindings');
              if (valid()) {
                this.setData({ items: list.items.map(presentDevice) });
                this.filterItems();
                this._history = [];
                this.go('list', false);
              }
            }
          });
      },
    });
  },
});
