// Frontend-only adapter. Replace this function when the generation service is ready.
// Keep the cancellable { promise, cancel } contract and return { imagePath, isDemo }.
export const PROMPT_LIMIT = 300;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const DEMO_IMAGE = '/pages/guzi/assets/avatar-demo.jpg';
export const DEFAULT_PROMPT = '把照片里的宠物画成可爱的 Q 版卡通头像，保留毛色、花纹和眼睛特征。正面居中，完整露出耳朵，浅紫色背景，线条干净，不要文字。';

export function normalizePrompt(value) {
  return Array.from(String(value || '')).slice(0, PROMPT_LIMIT).join('');
}

export function createGeneration({ photoPath, prompt }) {
  let timer;
  let rejectTask;
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    if (!photoPath || !String(prompt || '').trim()) {
      reject(new Error('请选择照片并填写描述'));
      return;
    }
    timer = setTimeout(() => resolve({ imagePath: DEMO_IMAGE, isDemo: true }), 2400);
  });
  return {
    promise,
    cancel() {
      clearTimeout(timer);
      rejectTask(Object.assign(new Error('已取消'), { cancelled: true }));
    },
  };
}
