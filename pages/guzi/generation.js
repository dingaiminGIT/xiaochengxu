import config from '../../config';
import { mediaUrl } from '../../api/miniprogram';
import { accountKey } from '../../utils/pet-store';

export const PROMPT_LIMIT = 300;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const DEMO_IMAGE = '/pages/guzi/assets/avatar-demo.jpg';
export const DEFAULT_PROMPT = '把照片里的宠物画成可爱的 Q 版卡通头像，保留毛色、花纹和眼睛特征。正面居中，完整露出耳朵，浅紫色背景，线条干净，不要文字。';
const endpoint = `${config.apiBaseUrl.replace(/\/$/, '')}/api/miniprogram/image-generations`;

export function normalizePrompt(value) {
  return Array.from(String(value || '')).slice(0, PROMPT_LIMIT).join('');
}

// Cancel stops local upload/polling only. An accepted server task may still finish;
// keep its identity so retries resume it instead of charging for a second image.
export function createGeneration({ photoPath, prompt, onStage = () => {} }) {
  const token = wx.getStorageSync('miniprogram_token') || '';
  const key = accountKey('guzi-generation');
  let stopped = false, timer, transport, rejectTask, settled = false;
  const activeAccount = () => token && wx.getStorageSync('miniprogram_token') === token && accountKey('guzi-generation') === key;
  let record;
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const ensureActive = () => {
      if (stopped || settled) return false;
      if (!activeAccount()) {
        finish(Object.assign(new Error('登录状态已变化，请重新登录'), { statusCode: 401 }));
        return false;
      }
      return true;
    };
    const persist = () => {
      if (activeAccount()) { try { wx.setStorageSync(key, record); } catch (_) { /* In-memory polling remains usable. */ } }
    };
    const forget = () => {
      if (activeAccount()) { try { wx.removeStorageSync(key); } catch (_) { /* A completed task can safely be queried again. */ } }
    };
    const failure = res => {
      let body = res.data;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      if (res.statusCode === 401 && activeAccount()) wx.removeStorageSync('miniprogram_token');
      return Object.assign(new Error((body && body.error) || '生图服务暂时不可用，请重试'), { statusCode: res.statusCode });
    };
    const read = res => {
      let body = res.data;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { throw new Error('生图服务返回异常'); } }
      if (res.statusCode < 200 || res.statusCode >= 300 || !body || !body.ok || !body.item) throw failure(res);
      return body.item;
    };
    let retries = 0;
    const deadline = Date.now() + 10 * 60 * 1000;
    const handle = item => {
      if (!ensureActive()) return;
      if (!item.id || !/^[a-f0-9]{32}$/.test(item.id)) { finish(new Error('生图任务返回异常')); return; }
      record.taskId = item.id;
      persist();
      if (item.status === 'succeeded') {
        if (!item.image_url) { finish(new Error('未能获取生成结果，请重试')); return; }
        // Render a complete local file, rather than a partially loaded remote image.
        // Keep the task identity until preview preparation succeeds: retrying a
        // failed download must not create another paid model request.
        onStage('preparing');
        const downloadError = () => new Error('图片已生成，但预览加载失败，点击重试取回图片');
        transport = wx.downloadFile({
          url: mediaUrl(item.image_url), timeout: 60000,
          success(res) {
            if (!ensureActive()) return;
            if (res.statusCode !== 200 || !res.tempFilePath) { finish(downloadError()); return; }
            timer = setTimeout(() => { if (ensureActive()) finish(downloadError()); }, 30000);
            wx.getImageInfo({
              src: res.tempFilePath,
              success(info) {
                if (!ensureActive()) return;
                if (!(info.width > 0 && info.height > 0)) { finish(downloadError()); return; }
                forget();
                finish(null, { imagePath: res.tempFilePath, isDemo: false, taskId: item.id });
              },
              fail() { if (ensureActive()) finish(downloadError()); },
            });
          },
          fail() { if (ensureActive()) finish(downloadError()); },
        });
      } else if (item.status === 'failed') {
        forget();
        finish(new Error(item.error || '暂时无法生成，请稍后重试'));
      } else if (['pending', 'generating'].includes(item.status)) {
        if (Date.now() > deadline) { finish(new Error('等待超时，点击重试继续查看结果')); return; }
        timer = setTimeout(poll, 1500);
      } else finish(new Error('无法识别生成状态，请重试'));
    };
    const poll = () => {
      if (!ensureActive()) return;
      transport = wx.request({
        url: `${endpoint}/${record.taskId}`, method: 'GET', timeout: 30000,
        header: { Authorization: `Bearer ${token}` },
        success(res) {
          if (!ensureActive()) return;
          try { const item = read(res); retries = 0; handle(item); }
          catch (error) {
            if (error.statusCode === 404) forget();
            if (error.statusCode >= 500 && ++retries <= 3) timer = setTimeout(poll, 2500);
            else finish(error);
          }
        },
        fail() {
          if (!ensureActive()) return;
          if (++retries <= 3) timer = setTimeout(poll, 2500);
          else finish(new Error('连接中断，点击重试继续查看结果'));
        },
      });
    };
    if (!token) { finish(Object.assign(new Error('请先登录'), { statusCode: 401 })); return; }
    if (!photoPath || !String(prompt || '').trim() || Array.from(prompt).length > PROMPT_LIMIT) {
      finish(new Error('请选择照片，并填写 1–300 字描述')); return;
    }
    try { record = wx.getStorageSync(key); } catch (_) { record = null; }
    if (!record || record.photoPath !== photoPath || record.prompt !== prompt) {
      record = { photoPath, prompt, requestId: `guzi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}` };
    }
    persist();
    if (record.taskId) { poll(); return; }
    transport = wx.uploadFile({
      url: endpoint, filePath: photoPath, name: 'image', timeout: 60000,
      formData: { prompt, request_id: record.requestId },
      header: { Authorization: `Bearer ${token}` },
      success(res) {
        if (!ensureActive()) return;
        try { handle(read(res)); } catch (error) { finish(error); }
      },
      fail() { if (ensureActive()) finish(new Error('照片提交失败，请重试')); },
    });
  });
  return {
    promise,
    cancel() {
      stopped = true;
      clearTimeout(timer);
      if (transport && transport.abort) transport.abort();
      if (!settled) { settled = true; rejectTask(Object.assign(new Error('已取消'), { cancelled: true })); }
    },
  };
}
