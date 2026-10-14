// Native image preview needs a writable local path instead of a package asset URL.
export function previewIngredientExample(source = 'static/assistant/ingredient-example.jpg') {
  const destination = `${wx.env.USER_DATA_PATH}/ingredient-example-v1.jpg`;
  const showError = () => wx.showToast({ title: '参考图打开失败，请重试', icon: 'none' });
  wx.getFileSystemManager().copyFile({
    srcPath: source.replace(/^\//, ''),
    destPath: destination,
    success: () => wx.previewImage({ current: destination, urls: [destination], fail: showError }),
    fail: showError,
  });
}
