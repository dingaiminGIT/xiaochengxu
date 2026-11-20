import { createGeneration, DEFAULT_PROMPT, DEMO_IMAGE, MAX_PHOTO_BYTES, PROMPT_LIMIT, normalizePrompt } from './generation';
import { accountKey } from '../../utils/pet-store';
import { shareCard } from '../../utils/share';
import { requireSession, api } from '../../api/miniprogram';

Page({
  data: {
    state: 'editing', photoPath: '', originalPath: '', prompt: DEFAULT_PROMPT,
    promptValid: true, promptCount: Array.from(DEFAULT_PROMPT).length, promptLimit: PROMPT_LIMIT,
    promptStyles: [], selectedStyle: '', stylesLoading: false, stylesError: false,
    demoImage: DEMO_IMAGE, resultPath: '', resultSaved: false, isDemo: false, preview: 'badge',
    choosing: false, saving: false, sharing: false, inputFocused: false, error: '', generationLabel: '正在生成卡通头像…',
  },
  onLoad() { this._alive = true; this.loadPromptStyles(); },
  onShow() { this.updateLeaveAlert(); },
  updateLeaveAlert() {
    if (this.data.resultPath && !this.data.resultSaved) {
      if (wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({
        message: '头像还未保存，离开后将无法再次下载。确定离开吗？',
      });
    } else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
  },
  async leavePage() {
    if (this._leaving) return;
    this._leaving = true;
    try {
      if (this.data.resultPath && !this.data.resultSaved) {
        const confirmed = await new Promise(resolve => wx.showModal({
          title: '头像还未保存', content: '离开后将无法再次下载本次生成的头像，确定离开吗？',
          confirmText: '仍然离开', cancelText: '留下保存',
          success: result => resolve(result.confirm), fail: () => resolve(false),
        }));
        if (!confirmed || !this._alive) return;
      }
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
      const options = { fail: () => this.updateLeaveAlert() };
      if (getCurrentPages().length > 1) wx.navigateBack(options);
      else wx.switchTab({ ...options, url: '/pages/home/index' });
    } finally { this._leaving = false; }
  },
  async loadPromptStyles() {
    if (this.data.stylesLoading) return;
    this.setData({ stylesLoading: true, stylesError: false });
    try {
      const result = await api('/image-generations/prompts');
      if (!Array.isArray(result.items) || !result.items.length || result.items.some(item =>
        !item || typeof item.id !== 'string' || typeof item.name !== 'string' ||
        typeof item.prompt !== 'string' || !item.prompt.trim() || Array.from(item.prompt).length > PROMPT_LIMIT)) {
        throw new Error('Invalid prompt list');
      }
      if (this._alive) {
        const first = result.items[0];
        const defaults = !this._promptTouched && this.data.state === 'editing'
          ? { prompt: first.prompt, promptCount: Array.from(first.prompt).length, promptValid: true, selectedStyle: first.id }
          : {};
        this.setData({ promptStyles: result.items, ...defaults });
      }
    } catch (_) {
      if (this._alive) this.setData({ stylesError: true });
    } finally {
      if (this._alive) this.setData({ stylesLoading: false });
    }
  },
  selectPromptStyle(event) {
    const style = this.data.promptStyles.find(item => item.id === event.currentTarget.dataset.id);
    if (!style || this.data.state !== 'editing') return;
    this._promptTouched = true;
    this.setData({ prompt: style.prompt, promptCount: Array.from(style.prompt).length,
      promptValid: true, selectedStyle: style.id, error: '' });
  },
  onUnload() {
    this._alive = false;
    if (this._task) this._task.cancel();
  },
  onShareAppMessage() { return shareCard('给毛孩子生成专属谷子', '/pages/guzi/index'); },
  onPromptInput(event) {
    const prompt = normalizePrompt(event.detail.value);
    this._promptTouched = true;
    this.setData({ selectedStyle: '', prompt, promptValid: !!prompt.trim(), promptCount: Array.from(prompt).length, error: '' });
    return prompt;
  },
  onPromptFocus() { this.setData({ inputFocused: true }); },
  onPromptBlur() { this.setData({ inputFocused: false }); },
  choosePhoto() {
    if (this.data.choosing || this.data.state === 'generating') return;
    this.setData({ choosing: true });
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'],
      success: async ({ tempFiles }) => {
        try {
          const file = tempFiles && tempFiles[0];
          if (!file || !file.tempFilePath) throw new Error('未能读取照片，请重试');
          const size = file.size || await new Promise((resolve, reject) => {
            wx.getFileSystemManager().getFileInfo({ filePath: file.tempFilePath, success: r => resolve(r.size), fail: reject });
          });
          if (size > MAX_PHOTO_BYTES) throw new Error('请选择 10MB 以内的照片');
          const info = await new Promise((resolve, reject) => wx.getImageInfo({ src: file.tempFilePath, success: resolve, fail: reject }));
          if (!['jpeg', 'jpg', 'png'].includes(String(info.type).toLowerCase())) throw new Error('请选择 JPG 或 PNG 照片');
          if (info.width < 15 || info.height < 15 || info.width * info.height > 36000000) throw new Error('照片尺寸不支持，请换一张');
          if (this._alive) this.openCrop(file.tempFilePath);
        } catch (error) {
          if (this._alive) wx.showToast({ title: error.message || '照片读取失败', icon: 'none' });
        } finally {
          if (this._alive) this.setData({ choosing: false });
        }
      },
      fail: error => {
        if (!this._alive) return;
        this.setData({ choosing: false });
        if (!/cancel/.test(error.errMsg || '')) wx.showToast({ title: '无法选择照片，请检查相册权限', icon: 'none' });
      },
    });
  },
  recropPhoto() { if (this.data.originalPath) this.openCrop(this.data.originalPath); },
  openCrop(source) {
    wx.navigateTo({
      url: '/pages/guzi/crop',
      events: {
        photoCropped: ({ path }) => {
          if (this._alive && path) this.setData({ photoPath: path, originalPath: source, state: 'editing', error: '' });
        },
      },
      success: result => result.eventChannel.emit('cropSource', { path: source }),
      fail: () => wx.showToast({ title: '裁剪页面打开失败', icon: 'none' }),
    });
  },
  async generate() {
    if (this._task || this.data.state === 'generating' || this.data.choosing) return;
    if (!this.data.photoPath) return this.choosePhoto();
    if (!this.data.prompt.trim()) {
      this.setData({ error: '请填写头像描述' });
      return;
    }
    if (!requireSession()) return;
    wx.hideKeyboard();
    this.setData({ state: 'generating', inputFocused: false, error: '', generationLabel: '正在生成卡通头像…' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    let task;
    try {
      task = createGeneration({
        photoPath: this.data.photoPath, prompt: this.data.prompt.trim(),
        onStage: stage => {
          if (this._alive && this.data.state === 'generating' && stage === 'preparing') {
            this.setData({ generationLabel: '图片已生成，正在准备完整预览…' });
          }
        },
      });
      this._task = task;
      const result = await task.promise;
      if (!this._alive || this._task !== task) return;
      if (!result || !result.imagePath) throw new Error('未能获取生成结果，请重试');
      this.setData({ state: 'success', resultPath: result.imagePath, isDemo: !!result.isDemo, preview: 'badge', resultSaved: false });
      this.updateLeaveAlert();
    } catch (error) {
      if (this._alive && !error.cancelled) this.setData({ state: 'failed', error: error.message || '暂时无法生成，请稍后重试。' });
    } finally {
      if (this._task === task) this._task = null;
    }
  },
  recreate() {
    this.setData({ state: 'editing', error: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  setPreview(event) { this.setData({ preview: event.currentTarget.dataset.mode }); },
  async showOff() {
    if (this.data.sharing || this.data.state !== 'success' || !this.data.resultPath) return;
    if (!requireSession()) return;
    const source = this.data.resultPath;
    const account = accountKey('guzi-share');
    this.setData({ sharing: true });
    try {
      // Copy rather than move the temporary result: returning must preserve the preview.
      if (!this._shareImage || this._shareImage.source !== source || this._shareImage.account !== account) {
        const path = `${wx.env.USER_DATA_PATH}/guzi-post-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        await new Promise((resolve, reject) => wx.getFileSystemManager().copyFile({ srcPath: source, destPath: path, success: resolve, fail: reject }));
        this._shareImage = { source, account, path };
      }
      if (!this._alive || account !== accountKey('guzi-share')) return;
      const imagePath = this._shareImage.path;
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
      await new Promise((resolve, reject) => wx.navigateTo({
        url: '/pages/release/index?source=guzi',
        success: result => {
          result.eventChannel.emit('guziResult', { imagePath, account, resultSaved: this.data.resultSaved });
          resolve();
        },
        fail: reject,
      }));
    } catch (_) {
      if (this._alive) {
        this.updateLeaveAlert();
        wx.showToast({ title: '暂时无法带入图片，请重试', icon: 'none' });
      }
    } finally {
      if (this._alive) this.setData({ sharing: false });
    }
  },
  async saveImage() {
    if (this.data.saving || !this.data.resultPath) return;
    this.setData({ saving: true });
    try {
      const source = this.data.resultPath;
      let filePath = source;
      if (/^https:\/\//.test(filePath)) {
        filePath = await new Promise((resolve, reject) => wx.downloadFile({
          url: filePath,
          success: r => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('图片下载失败')),
          fail: reject,
        }));
      } else if (filePath === DEMO_IMAGE) {
        // Album APIs require a writable local file, not a packaged resource path.
        const target = `${wx.env.USER_DATA_PATH}/guzi-example.jpg`;
        await new Promise((resolve, reject) => wx.getFileSystemManager().copyFile({ srcPath: filePath, destPath: target, success: resolve, fail: reject }));
        filePath = target;
      }
      if (!this._alive) return;
      await new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject }));
      if (this._alive && this.data.resultPath === source) {
        this.setData({ resultSaved: true });
        this.updateLeaveAlert();
      }
      if (this._alive) wx.showToast({ title: this.data.isDemo ? '示例已保存' : '已保存到相册', icon: 'success' });
    } catch (error) {
      if (!this._alive || /cancel/.test(error.errMsg || '')) return;
      if (/auth|deny|denied|authorize/.test(error.errMsg || '')) {
        wx.showModal({ title: '允许保存到相册', content: '请在设置中开启相册权限。', confirmText: '去设置', success: r => { if (r.confirm) wx.openSetting({}); } });
      } else wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      if (this._alive) this.setData({ saving: false });
    }
  },
});
