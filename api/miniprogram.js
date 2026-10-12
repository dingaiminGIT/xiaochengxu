import config from '../config';
const origin = config.apiBaseUrl.replace(/\/$/, '');
export const mediaUrl = (url) => (url && url.startsWith('/') ? origin + url : url || '');
export const hasSession = () => Boolean(wx.getStorageSync('miniprogram_token'));
export const errorText = (error) => error.message || '连接失败，请检查网络后重试';
export function api(path, method = 'GET', data = {}) {
  if (method !== 'GET' && path !== '/auth/wechat-login' && !hasSession()) {
    requireSession();
    return Promise.reject(new Error('请先登录／注册后继续'));
  }
  const requestToken = wx.getStorageSync('miniprogram_token') || '';
  return new Promise((resolve, reject) =>
    wx.request({
      url: `${origin}/api/miniprogram${path}`,
      method,
      data,
      timeout: 30000,
      header: {
        'content-type': 'application/json',
        Authorization: `Bearer ${requestToken}`,
      },
      success(res) {
        if (res.statusCode === 401 && wx.getStorageSync('miniprogram_token') === requestToken) wx.removeStorageSync('miniprogram_token');
        const body = res.data && typeof res.data === 'object' ? res.data : {};
        if (method === 'DELETE' && res.statusCode === 204) {
          resolve({ ok: true });
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok === true) resolve(body);
        else reject(new Error(body.error || body.message || '服务暂时不可用，请重试'));
      },
      fail: () => reject(new Error('连接失败，请检查网络后重试')),
    }),
  );
}
// One explicit account entry; never manufacture an account during another action.
export function requireSession() {
  if (hasSession()) return true;
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  if (current && current.route === 'pages/my/info-edit/index') return false;
  if (current && current._openingLogin) return false;
  if (current) current._openingLogin = true;
  wx.navigateTo({
    url: '/pages/my/info-edit/index?auth=1',
    events: {
      authenticated: () => {
        if (current) current._returningFromLogin = true;
      },
    },
    complete: () => {
      if (current) current._openingLogin = false;
    },
  });
  return false;
}
let signingIn;
export async function login(profile = null) {
  if (!profile && hasSession()) return wx.getStorageSync('miniprogram_user');
  if (!profile) {
    requireSession();
    throw new Error('请先登录／注册后继续');
  }
  if (signingIn) return signingIn;
  const work = (async () => {
    const code = await new Promise((resolve, reject) =>
      wx.login({
        success: (res) => (res.code ? resolve(res.code) : reject(new Error('微信登录失败'))),
        fail: () => reject(new Error('微信登录失败，请重试')),
      }),
    );
    const result = await api('/auth/wechat-login', 'POST', { code, ...(profile || {}) });
    wx.setStorageSync('miniprogram_token', result.token);
    wx.setStorageSync('miniprogram_user', result.user);
    return result.user;
  })();
  signingIn = work;
  try {
    return await work;
  } finally {
    signingIn = null;
  }
}
export async function uploadImage(path) {
  await login();
  return new Promise((resolve, reject) =>
    wx.uploadFile({
      url: `${origin}/api/miniprogram/moment-images`,
      filePath: path,
      name: 'image',
      header: { Authorization: `Bearer ${wx.getStorageSync('miniprogram_token')}` },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode === 401) wx.removeStorageSync('miniprogram_token');
          if (res.statusCode >= 200 && res.statusCode < 300 && data.ok) resolve(mediaUrl(data.item.url));
          else reject(new Error(data.error || '图片上传失败'));
        } catch (e) {
          reject(new Error('图片上传失败'));
        }
      },
      fail: () => reject(new Error('图片上传失败，请重试')),
    }),
  );
}
export function mapPet(p) {
  return {
    ...p,
    type: p.animal_type === 'dog' ? '狗狗' : p.animal_type === 'unknown' ? '未知' : '猫咪',
    age: p.age_months == null ? p.age_text : Math.round((p.age_months / 12) * 10) / 10,
    weight: p.weight_kg || '',
    image: mediaUrl(p.avatar_url),
  };
}

// Pet photos are private resources: never put the token in the image URL.
export const isPrivatePetImage = (url) => {
  const prefix = `${origin}/api/miniprogram/pet-images/`;
  const full = mediaUrl(url);
  return (
    (full.startsWith(prefix) && /^[a-zA-Z0-9_-]+$/.test(full.slice(prefix.length))) ||
    (full.startsWith(`${origin}/api/miniprogram/food-submissions/`) &&
      /^[a-zA-Z0-9_-]+\/images\/[a-zA-Z0-9_-]+$/.test(full.slice(`${origin}/api/miniprogram/food-submissions/`.length)))
  );
};
export async function recognizePetImage(path) {
  await login();
  return new Promise((resolve, reject) =>
    wx.uploadFile({
      url: `${origin}/api/miniprogram/pet-images/recognize`,
      filePath: path,
      name: 'image',
      timeout: 120000,
      header: { Authorization: `Bearer ${wx.getStorageSync('miniprogram_token')}` },
      success(res) {
        if (res.statusCode === 401) wx.removeStorageSync('miniprogram_token');
        let body;
        try {
          body = JSON.parse(res.data);
        } catch (_) {
          reject(new Error('识别服务返回异常，请重试'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok && body.image && body.image.id) resolve(body);
        else reject(new Error(body.error || '照片识别失败，请重试'));
      },
      fail: () => reject(new Error('上传或识别超时，请检查网络后重试')),
    }),
  );
}
export function downloadPetImage(url) {
  if (!isPrivatePetImage(url)) return Promise.resolve(url);
  const token = wx.getStorageSync('miniprogram_token');
  if (!token) return Promise.reject(new Error('请登录后查看宠物照片'));
  return new Promise((resolve, reject) =>
    wx.downloadFile({
      url: mediaUrl(url),
      header: { Authorization: `Bearer ${token}` },
      success(res) {
        if (res.statusCode === 200 && wx.getStorageSync('miniprogram_token') === token) resolve(res.tempFilePath);
        else reject(new Error('宠物照片加载失败'));
      },
      fail: () => reject(new Error('宠物照片加载失败')),
    }),
  );
}
