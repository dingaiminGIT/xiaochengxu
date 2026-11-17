import { fitPhoto, clampPhoto, zoomPhoto, sourceRect } from './crop-math';

function point(touch) { return { x: touch.clientX, y: touch.clientY }; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

Page({
  data: { source: '', size: 300, photo: null, zoom: 1, loading: true, saving: false, error: '' },
  onLoad() {
    this._alive = true;
    const window = wx.getWindowInfo();
    const size = Math.max(160, Math.min(window.windowWidth - 48, window.windowHeight - 300, 400));
    this.setData({ size });
    this.getOpenerEventChannel().on('cropSource', ({ path }) => this.loadPhoto(path));
  },
  onReady() { this.measureStage(); },
  onUnload() { this._alive = false; },
  measureStage() {
    this.createSelectorQuery().select('.crop-stage').boundingClientRect(rect => { this._rect = rect; }).exec();
  },
  loadPhoto(source) {
    this.setData({ source, loading: true, error: '' });
    wx.getImageInfo({
      src: source,
      success: info => {
        if (!this._alive) return;
        this._info = info;
        this._photo = fitPhoto(info.width, info.height, this.data.size);
        this.setData({ photo: this._photo, zoom: 1, loading: false }, () => this.measureStage());
      },
      fail: () => { if (this._alive) this.setData({ loading: false, error: '照片读取失败，请返回重新选择' }); },
    });
  },
  onTouchStart(event) {
    if (!this._photo || this.data.saving) return;
    const points = event.touches.map(point);
    this._gesture = { points, photo: { ...this._photo } };
    if (!this._rect) this.measureStage();
  },
  onTouchMove(event) {
    if (!this._gesture || this.data.saving) return;
    const points = event.touches.map(point);
    const start = this._gesture;
    if (points.length !== start.points.length) { this.onTouchStart(event); return; }
    let photo;
    if (points.length >= 2 && this._rect) {
      const initialDistance = distance(start.points[0], start.points[1]);
      if (initialDistance < 1) return;
      const center = {
        x: (start.points[0].x + start.points[1].x) / 2 - this._rect.left,
        y: (start.points[0].y + start.points[1].y) / 2 - this._rect.top,
      };
      photo = zoomPhoto(start.photo, start.photo.scale * distance(points[0], points[1]) / initialDistance, center, this.data.size);
      photo = clampPhoto({ ...photo,
        x: photo.x + (points[0].x + points[1].x - start.points[0].x - start.points[1].x) / 2,
        y: photo.y + (points[0].y + points[1].y - start.points[0].y - start.points[1].y) / 2,
      }, this.data.size);
    } else if (points.length) {
      photo = clampPhoto({ ...start.photo,
        x: start.photo.x + points[0].x - start.points[0].x,
        y: start.photo.y + points[0].y - start.points[0].y,
      }, this.data.size);
    }
    if (photo) this.updatePhoto(photo);
  },
  onTouchEnd(event) {
    this._gesture = null;
    if (event.touches && event.touches.length) this.onTouchStart(event);
  },
  onZoom(event) {
    if (!this._photo || this.data.saving) return;
    this.updatePhoto(zoomPhoto(this._photo, Number(event.detail.value), { x: this.data.size / 2, y: this.data.size / 2 }, this.data.size));
  },
  updatePhoto(photo) { this._photo = photo; this.setData({ photo, zoom: photo.scale }); },
  async confirmCrop() {
    if (!this._photo || this.data.saving || this.data.loading) return;
    this.setData({ saving: true });
    try {
      const canvas = await new Promise((resolve, reject) => {
        this.createSelectorQuery().select('#crop-canvas').fields({ node: true, size: true }).exec(result => {
          if (result[0] && result[0].node) resolve(result[0].node);
          else reject(new Error('无法打开裁剪画布'));
        });
      });
      const image = canvas.createImage();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = this.data.source; });
      const rect = sourceRect(this._photo, this._info.width, this.data.size);
      const size = Math.max(1, Math.min(2048, Math.round(rect.size)));
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, size, size);
      const path = await new Promise((resolve, reject) => wx.canvasToTempFilePath({
        canvas, width: size, height: size, destWidth: size, destHeight: size,
        fileType: 'jpg', quality: 0.94, success: r => resolve(r.tempFilePath), fail: reject,
      }, this));
      if (!this._alive) return;
      this.getOpenerEventChannel().emit('photoCropped', { path });
      wx.navigateBack();
    } catch (_) {
      if (this._alive) wx.showToast({ title: '裁剪失败，请重试', icon: 'none' });
    } finally {
      if (this._alive) this.setData({ saving: false });
    }
  },
});
