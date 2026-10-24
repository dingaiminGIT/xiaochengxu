import config from '../../config';
Page({
  data: { title: '设备连接与隐私', sections: [], version: '', loading: true, error: '' },
  onLoad(options) {
    this.kind = options.kind === 'privacy' ? 'privacy' : 'notice';
    this.load();
  },
  load() {
    this.setData({ loading: true, error: '' });
    wx.request({
      url: `${config.apiBaseUrl.replace(/\/$/, '')}/api/miniprogram/device-policy?kind=${this.kind}`,
      timeout: 15000,
      success: ({ statusCode, data }) => {
        if (statusCode === 200 && data.ok)
          this.setData({ title: data.title, sections: data.sections, version: data.version });
        else this.setData({ error: '隐私说明暂不可用，暂时无法进行设备绑定。' });
      },
      fail: () => this.setData({ error: '网络异常，请重试' }),
      complete: () => this.setData({ loading: false }),
    });
  },
});
