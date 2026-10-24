import { requireSession, api, login, hasSession, errorText } from '../../api/miniprogram';

Page({
  data: {
    signedIn: false,
    feedbackVisible: false,
    feedbackFocused: false,
    feedbackText: '',
    feedbackSubmitting: false,
  },
  onShow() {
    this.setData({ signedIn: hasSession() });
  },
  about() {
    wx.showModal({
      title: '关于宠析',
      content: '一起记录宠物日常，交流养宠经验。管家支持换粮识别和营养分析。',
      showCancel: false,
    });
  },
  storage() {
    wx.showModal({ title: '数据与隐私', content: '猫咪档案和已发布帖子保存在服务器。收藏、草稿、玩具、食物、状态记录与聊天历史保存在当前设备。清除小程序数据会移除本地记录。设备连接另有知情同意与隐私补充说明。', confirmText: '设备隐私', cancelText: '关闭', success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/devices/policy?kind=privacy' }); } });
  },
  openFeedback() {
    this.setData({ feedbackVisible: true, feedbackFocused: true });
  },
  closeFeedback() {
    if (this.data.feedbackSubmitting) return;
    this.setData({ feedbackVisible: false, feedbackFocused: false, feedbackText: '' });
  },
  onFeedbackInput(event) {
    this.setData({ feedbackText: event.detail.value });
  },
  async submitFeedback() {
    if (!requireSession()) return;
    const content = this.data.feedbackText.trim();
    if (!content) {
      wx.showToast({ title: '请描述你遇到的问题或建议', icon: 'none' });
      return;
    }
    if (this.data.feedbackSubmitting) return;
    this.setData({ feedbackSubmitting: true });
    try {
      if (!hasSession()) await login();
      await api('/feedback', 'POST', { content });
      this.setData({
        feedbackVisible: false,
        feedbackFocused: false,
        feedbackText: '',
        feedbackSubmitting: false,
        signedIn: hasSession(),
      });
      wx.showToast({ title: '已提交，感谢反馈' });
    } catch (error) {
      this.setData({ feedbackSubmitting: false });
      wx.showToast({ title: errorText(error), icon: 'none' });
    }
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后可通过微信重新登录。当前账号的本地记录会保留。',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('miniprogram_token');
          wx.removeStorageSync('miniprogram_user');
          wx.removeStorageSync('access_token');
          wx.removeStorageSync('userInfo');
          wx.switchTab({ url: '/pages/my/index' });
        }
      },
    });
  },
});
