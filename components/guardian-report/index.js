Component({
  properties: {
    report: { type: Object, value: null, observer(report) {
      const comparisons = (report?.feeding?.comparisons || []).map((pair) => ({
        ...pair,
        dimensions: (pair.dimensions || []).map((dimension) => ({
          ...dimension,
          leftWidth: this.barWidth(dimension.left),
          rightWidth: this.barWidth(dimension.right),
        })),
      }));
      this.setData({ comparisons, activeTab: 'advice', showScores: false });
    } },
  },
  data: { activeTab: 'advice', showScores: false, comparisons: [] },
  methods: {
    barWidth(dimension) {
      const { score, scale_max: maximum } = dimension || {};
      return typeof score === 'number' && Number.isFinite(score) && maximum > 0
        ? Math.max(0, Math.min(100, score / maximum * 100)) : 0;
    },
    selectTab(event) {
      const { tab } = event.currentTarget.dataset;
      if (['advice', 'community'].includes(tab)) this.setData({ activeTab: tab });
    },
    toggleScores() { this.setData({ showScores: !this.data.showScores }); },
  },
});
