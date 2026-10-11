import { hasOpenModal } from '../utils/modal-layout';
Component({
  data: {
    modalHidden: false,
    value: 'home',
    list: [
      { value: 'home', label: '首页', icon: 'home' },
      { value: 'assistant', label: '管家', icon: 'ai-search' },
      { value: 'my', label: '宠物', icon: 'cat' },
    ],
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page) this.setData({ value: page.route.split('/')[1], modalHidden: hasOpenModal(page.data) });
    },
  },
  methods: {
    handleChange(e) {
      wx.switchTab({ url: `/pages/${e.currentTarget.dataset.value}/index` });
    },
  },
});
