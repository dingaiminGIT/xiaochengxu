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
      const switchPairs = (report?.feeding?.task_nutrition?.pairs || []).map((pair) => {
        const changes = pair.top_changes || [];
        const groups = [
          { key: 'positive', title: '好的方向', items: changes.filter((change) => change.right_better === true) },
          { key: 'attention', title: '留心的方向', items: changes.filter((change) => change.right_better === false) },
        ].map((group) => {
          const items = group.items.slice().sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));
          const uniqueCopy = (field) => {
            const seen = new Set();
            return items.flatMap((change) => change.rules || []).reduce((texts, rule) => {
              const text = String(rule[field] || '').trim();
              const key = text.replace(/[\s，,。；;、]/g, '');
              if (key && !seen.has(key)) { seen.add(key); texts.push(text); }
              return texts;
            }, []);
          };
          return { ...group, items, explanations: uniqueCopy('recommendation_text'), observations: uniqueCopy('owner_observation') };
        });
        return { ...pair, change_groups: groups };
      });
      const questions = Array.isArray(report?.next_steps?.questions) ? report.next_steps.questions : [];
      this.setData({ comparisons, switchPairs, activeTab: report?.scene === 'switch_impact' ? 'switch' : 'advice', showScores: false,
        questions, questionPage: 0, visibleQuestions: questions.slice(0, 3) });
    } },
  },
  data: { activeTab: 'advice', showScores: false, comparisons: [], switchPairs: [], questions: [], questionPage: 0, visibleQuestions: [] },
  methods: {
    barWidth(dimension) {
      const { score, scale_max: maximum } = dimension || {};
      return typeof score === 'number' && Number.isFinite(score) && maximum > 0
        ? Math.max(0, Math.min(100, score / maximum * 100)) : 0;
    },
    selectTab(event) {
      const { tab } = event.currentTarget.dataset;
      if (['advice', 'community', 'switch'].includes(tab)) this.setData({ activeTab: tab });
    },
    nextQuestions() {
      const count = Math.ceil(this.data.questions.length / 3);
      if (count < 2) return;
      const questionPage = (this.data.questionPage + 1) % count;
      this.setData({ questionPage, visibleQuestions: this.data.questions.slice(questionPage * 3, questionPage * 3 + 3) });
    },
    ask(event) {
      const question = this.data.visibleQuestions[Number(event.currentTarget.dataset.index)];
      if (question) this.triggerEvent('question', { question });
    },
    toggleScores() { this.setData({ showScores: !this.data.showScores }); },
  },
});
