import config from '../config';
import { hasSession, requireSession } from '../api/miniprogram';

export const NOTICE_VERSION = 'petkit-connect-2026-10-23-v1';
export const PRIVACY_VERSION = 'privacy-device-2026-10-23-v1';
// Private device responses never enter persistent storage or shared page caches.
export function deviceRequest(path, method = 'GET', data = {}) {
  if (!hasSession()) {
    requireSession();
    return Promise.reject(Object.assign(new Error('请先登录后继续'), { code: 'LOGIN_REQUIRED' }));
  }
  const token = wx.getStorageSync('miniprogram_token');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl.replace(/\/$/, '')}/api/miniprogram${path}`,
      method,
      data,
      timeout: 30000,
      header: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      success(res) {
        if (wx.getStorageSync('miniprogram_token') !== token) {
          reject(Object.assign(new Error('账号已切换，请重新打开设备页面'), { code: 'ACCOUNT_CHANGED' }));
          return;
        }
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok) resolve(body);
        else {
          if (res.statusCode === 401) wx.removeStorageSync('miniprogram_token');
          const message = body.code ? body.error : '设备服务暂不可用，请稍后重试';
          reject(Object.assign(new Error(message || '设备服务暂不可用'), { code: body.code || 'UNAVAILABLE' }));
        }
      },
      fail() {
        reject(Object.assign(new Error('连接超时或网络异常，请稍后重试'), { code: 'NETWORK_ERROR' }));
      },
    });
  });
}
export const deviceTime = (value) => {
  if (!value) return '暂未同步';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  // Device timestamps are always displayed in China time, independent of phone timezone.
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
};
export function presentDevice(item) {
  const attrs = { confirmed: '单宠使用', shared: '多宠共用', unknown: '使用方式不确定' };
  return {
    ...item,
    icon: item.type === 'water' ? 'water' : 'food',
    attribution_text: attrs[item.attribution_status] || attrs.unknown,
    last_sync_text: deviceTime(item.last_success_at),
    source_time_text: deviceTime(item.source_time),
    status_text: item.archived
      ? '已断开 · 保留的历史'
      : item.auth_status === 'expired'
      ? '请重新连接'
      : item.sync_status === 'failed'
      ? '同步失败'
      : item.sync_status === 'running'
      ? '正在同步'
      : item.last_success_at
      ? '已同步'
      : '暂未同步',
  };
}
