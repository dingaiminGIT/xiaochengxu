import { login } from '../api/miniprogram';
import config from '../config';

function utf8(text) {
  const encoded = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return Uint8Array.from(encoded, (c) => c.charCodeAt(0));
}
export function multipartFood(fields, files, boundary) {
  if (!files.length || files.length > 3) throw new Error('请选择 1~3 张包装照片');
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(utf8(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  files.forEach((file, index) => {
    if (!file.data.byteLength || file.data.byteLength > 10 * 1024 * 1024) throw new Error('单张图片须在 10MB 以内');
    parts.push(
      utf8(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="image-${index}.${
          file.type
        }"\r\nContent-Type: image/${file.type === 'jpg' ? 'jpeg' : file.type}\r\n\r\n`,
      ),
    );
    parts.push(new Uint8Array(file.data), utf8('\r\n'));
  });
  parts.push(utf8(`--${boundary}--\r\n`));
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  parts.forEach((p) => {
    result.set(p, offset);
    offset += p.length;
  });
  return result.buffer;
}
export async function submitFood({ brand, product, remark = '', images = [] }) {
  if (!brand.trim() || !product.trim()) throw new Error('请填写品牌和产品名称');
  if (!images.length || images.length > 3) throw new Error('请选择 1~3 张包装照片');
  await login();
  const token = wx.getStorageSync('miniprogram_token');
  const fs = wx.getFileSystemManager();
  const files = [];
  for (const path of images) {
    const info = await new Promise((resolve, reject) => wx.getImageInfo({ src: path, success: resolve, fail: reject }));
    const type = (info.type || '').toLowerCase().replace('jpeg', 'jpg');
    if (!['jpg', 'png', 'webp'].includes(type)) throw new Error('请选择 JPG、PNG 或 WEBP 图片');
    const data = await new Promise((resolve, reject) =>
      fs.readFile({
        filePath: path,
        success: (r) => resolve(r.data),
        fail: () => reject(new Error('图片读取失败，请重新选择')),
      }),
    );
    files.push({ type, data });
  }
  const boundary = `petFood${Date.now()}${Math.random().toString(36).slice(2)}`;
  const data = multipartFood(
    { brand_name: brand.trim(), product_name: product.trim(), remark: remark.trim() },
    files,
    boundary,
  );
  if (wx.getStorageSync('miniprogram_token') !== token) throw new Error('登录状态已改变，请重试');
  return new Promise((resolve, reject) =>
    wx.request({
      url: `${config.apiBaseUrl.replace(/\/$/, '')}/api/miniprogram/food-submissions`,
      method: 'POST',
      data,
      timeout: 120000,
      header: { 'content-type': `multipart/form-data; boundary=${boundary}`, Authorization: `Bearer ${token}` },
      success(res) {
        if (res.statusCode === 401) wx.removeStorageSync('miniprogram_token');
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok && res.data.item)
          resolve(res.data.item);
        else reject(new Error((res.data && res.data.error) || '投稿失败，请重试'));
      },
      fail: () => reject(new Error('网络异常，请先刷新投稿记录确认是否已提交')),
    }),
  );
}
export function submissionView(item) {
  const status =
    item.recognition_status === 'success' && !(item.ingredient_composition || '').trim()
      ? 'unrecognized'
      : item.recognition_status;
  const messages = {
    pending: '照片已收到，正在排队识别，请稍后刷新。',
    processing: '正在识别配料表，请稍后刷新查看结果。',
    unrecognized: '没有读到完整配料表，请拍包装背面的配料表近照，让文字完整、清晰、不反光。',
    needs_review: '识别内容尚需核对，请重新拍摄清晰完整的配料表和营养成分保证值。',
    failed: '识别服务暂时失败，请稍后重新上传。',
    success: '配料表已识别，可交给管家分析；产品收录还需审核。',
  };
  return {
    ...item,
    recognition_status: status,
    recognitionMessage: item.recognition_message || messages[status] || '请刷新查看识别状态。',
    canAnalyze: item.status !== 'cancelled' && status === 'success' && !!(item.ingredient_composition || '').trim(),
    canReupload: item.status !== 'cancelled' && ['unrecognized', 'needs_review', 'failed'].includes(status),
    title: `${item.claimed_brand || ''} ${item.claimed_product_name || ''}`.trim(),
    statusText:
      (status !== item.recognition_status ? '未识别到配料表' : item.status_label) ||
      (['pending', 'processing'].includes(status)
        ? '识别中'
        : status === 'failed'
        ? '识别服务暂时失败'
        : status === 'unrecognized'
        ? '未识别到配料表'
        : status === 'needs_review'
        ? '识别结果待核对'
        : '等待审核'),
    canCancel:
      item.status !== 'cancelled' &&
      !['approved', 'rejected'].includes(item.review_status) &&
      item.publish_status !== 'published',
    guaranteeText: Object.entries(item.guarantee || {})
      .map(([k, v]) => `${k}：${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n'),
  };
}
