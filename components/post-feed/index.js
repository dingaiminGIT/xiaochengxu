Component({
  properties: {
    appearance: { type: String, value: '' },
    allowSave: { type: Boolean, value: true },
    posts: {
      type: Array,
      value: [],
      observer() {
        this.arrange();
      },
    },
  },
  data: { columns: [[], []] },
  methods: {
    arrange() {
      const posts = this.properties.posts || [];
      const heights = [0, 0];
        const columns = [[], []];
      const width = (wx.getWindowInfo().windowWidth - 46) / 2;
      posts.forEach((p) => {
        const ratio = (this._ratios || {})[p.image] || p.imageRatio || 1.05;
        const col = heights[0] <= heights[1] ? 0 : 1;
        columns[col].push(p);
        heights[col] += (p.image ? width * ratio : 0) + Math.ceil((p.title || '').length / 12) * 21 + 78;
      });
      this.setData({ columns });
    },
    imageLoaded(e) {
      const { width, height } = e.detail;
      const {src} = e.currentTarget.dataset;
      if (!width || !height) return;
      this._ratios = this._ratios || {};
      const ratio = height / width;
      if (Math.abs((this._ratios[src] || 0) - ratio) < 0.01) return;
      this._ratios[src] = ratio;
      this.arrange();
    },
    open(e) {
      this.triggerEvent('open', { id: e.currentTarget.dataset.id });
    },
    save(e) {
      this.triggerEvent('save', { id: e.currentTarget.dataset.id });
    },
  },
});
