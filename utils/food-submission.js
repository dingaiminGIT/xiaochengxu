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
  const cancelled = item.status === 'cancelled' || item.processing_status === 'cancelled';
  const needsConfirmation = ['unrecognized', 'needs_review', 'failed'].includes(status) ||
    ['waiting_input', 'need_review', 'failed'].includes(item.processing_status) || item.review_status === 'rejected';
  const completed = cancelled || item.result_available === true ||
    ['done', 'completed', 'success'].includes(item.processing_status) || item.publish_status === 'published' ||
    (!item.processing_status && status === 'success');
  const isProcessing = !needsConfirmation && !completed;
  const bundle = item.calculation_result || {};
  const ready = item.result_available === true && !!bundle.portrait;
  const provisional = ready && item.result_stage === 'provisional';
  const portraitDimensions = (bundle.portrait || {}).dimensions || {};
  const dimensions = ['protein_quality', 'protein', 'fat', 'fiber', 'carbohydrate', 'prebiotic'].filter((key) => portraitDimensions[key]).map((key) => {
    const value = portraitDimensions[key];
    return {
      key, ...value, name: ({ protein_quality: '蛋白质量', protein: '蛋白压力', fat: '脂肪负担', fiber: '纤维缓冲', carbohydrate: '碳水负担', prebiotic: '菌群支持' })[key] || key, scoreText: typeof value.score === 'number' ? `${value.score} / ${value.scale_max}` : '资料不足',
    };
  });
  const messages = {
    unrecognized: '没有读到完整配料表，请拍包装背面的配料表近照，让文字完整、清晰、不反光。',
    needs_review: '请确认包装上的配料表和营养成分保证值，必要时重新上传清晰照片。',
    failed: '暂未完成识别，请重新上传照片。',
  };
  return {
    ...item,
    resultReady: ready, provisional, dimensions,
    resultLabel: ready ? (provisional ? '初算结果 · 待核对' : '正式结果') : '正在分析',
    resultNote: item.result_updating && ready ? '结果更新中，当前显示上一版计算结果。' : provisional ? '基于当前上传资料计算，核对后可能更新。' : ready ? '已核对的计算结果。' : '',
    nutritionRows: Object.values(bundle.nutrition || {}).filter((n) => n.value !== null && n.value !== undefined).map((n) => ({ ...n, display: `${n.operator || ''} ${n.value}${n.unit || ''}` })),
    partialResult: !ready && !!bundle.partial,
    needsRefresh: !cancelled && item.review_status !== 'rejected' && (isProcessing || !!item.result_updating || provisional || item.processing_status === 'need_review'),
    recognition_status: status,
    isProcessing,
    recognitionMessage: ready ? (item.result_updating ? '已有结果可查看，新版本正在计算。' : provisional ? '初算已完成，资料核对中，可先查看结果。' : '正式结果已更新。') : cancelled ? '这次投稿已撤销。' : isProcessing
      ? (status === 'success' ? '正在生成分析结果，完成后会自动更新。' : '正在读取包装资料，结果会自动更新。')
      : needsConfirmation ? messages[status] || '请确认投稿信息，必要时重新上传清晰照片。'
      : '识别已完成，可以查看结果或交给管家分析。',
    canAnalyze: !cancelled && status === 'success' && !!(item.ingredient_composition || '').trim(),
    canReupload: !cancelled && needsConfirmation,
    title: `${item.claimed_brand || ''} ${item.claimed_product_name || ''}`.trim(),
    statusText: ready ? (provisional ? '初算可查看' : '分析完成') : cancelled ? '已撤销' : needsConfirmation ? '需要确认' : isProcessing ? (status === 'success' ? '分析中' : '识别中') : '已完成',
    canCancel:
      !cancelled &&
      !['approved', 'rejected'].includes(item.review_status) &&
      item.publish_status !== 'published',
    guaranteeText: Object.entries(item.guarantee || {})
      .map(([k, v]) => `${k}：${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n'),
  };
}
