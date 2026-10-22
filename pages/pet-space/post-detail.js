import { shareCard, timelineCard } from '../../utils/share';
import { displayPostBody } from '../../utils/post-content';
import { api, mediaUrl, errorText, hasSession, requireSession } from '../../api/miniprogram';
import { mapPost } from '../../utils/community';
import { loadStore, saveStore, formatEdited, accountKey } from '../../utils/pet-store';
Page({
  onShareAppMessage() {
    const post = this.data.post;
    return shareCard(post ? post.title : '来看看这篇养宠记录', '/pages/pet-space/post-detail',
      { id: this.postId }, post && post.images && post.images[0]);
  },
  onShareTimeline() {
    return timelineCard(this.onShareAppMessage());
  },
  data: {
    post: null,
    liking: false,
    commentsVisible: false,
    comments: [],
    commentsLoading: false,
    commentsError: '',
    commentDraft: '',
    commentSending: false,
    commentDeleting: '',
    viewerId: '',
    commentAnchor: '',
    photoIndex: 0,
    loading: true,
    error: '',
    saved: false,
    isOwner: false,
    deleting: false,
    reportVisible: false,
    reasons: [],
    reason: '',
    detail: '',
    reasonsLoading: false,
    reportError: '',
    reporting: false,
  },
  onLoad(query) {
    this.postId = query.id || '';
    this.loadPost();
  },
  onShow() {
    this.setData({ saved: loadStore().favorites.includes(this.postId) });
    this.updateOwnership();
    if (this._returningFromLogin) {
      this._returningFromLogin = false;
      this.loadPost();
      if (this.data.commentsVisible) this.openComments();
    }
  },
  async loadPost() {
    if (!this.postId) {
      this.setData({ loading: false, error: '未找到帖子，请返回后重新打开。' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const result = await api(`/moments/${encodeURIComponent(this.postId)}`);
      if (this._disposed) return;
      const post = { ...mapPost(result.item), avatar: mediaUrl(result.item.author && result.item.author.avatar) };
      this.setData({
        post: { ...post, displayBody: displayPostBody(post.title, post.body), editedText: formatEdited(post.editedAt) },
        saved: loadStore().favorites.includes(post.id),
        photoIndex: 0,
      });
      this.updateOwnership();
      this.setData({ viewerId: hasSession() ? (wx.getStorageSync('miniprogram_user') || {}).id : '' });
      this.loadComments();
      // Keep the latest snapshot for locally saved favorites without changing feed order.
      try {
        const s = loadStore();
        const list = [...(s.postCache || [])];
        const index = list.findIndex((p) => p.id === post.id);
        if (index >= 0) list[index] = { ...list[index], ...post };
        else list.push(post);
        saveStore({ postCache: list });
      } catch (e) {
        /* Reading a post remains available if local storage is full. */
      }
    } catch (e) {
      if (!this._disposed) this.setData({ post: null, error: errorText(e) });
    } finally {
      if (!this._disposed) this.setData({ loading: false });
    }
  },
  onPhotoChange(e) {
    this.setData({ photoIndex: e.detail.current });
  },
  updateOwnership() {
    const user = wx.getStorageSync('miniprogram_user');
    const isOwner = !!(hasSession() && user?.id && this.data.post?.userId === user.id);
    this.setData({ isOwner });
  },
  async openReport() {
    if (!requireSession() || !this.data.post || this.data.isOwner || this.data.reporting) return;
    this.setData({ reportVisible: true, reportError: '', reasonsLoading: true });
    try {
      const result = await api('/moment-report-reasons');
      if (this._disposed) return;
      const reasons = result.items || [];
      this.setData({
        reasons,
        reason: reasons.some((r) => r.code === this.data.reason) ? this.data.reason : '',
        reportError: reasons.length ? '' : '暂时没有可用的举报原因，请重试',
      });
    } catch (e) {
      if (!this._disposed) this.setData({ reportError: errorText(e) });
    } finally {
      if (!this._disposed) this.setData({ reasonsLoading: false });
    }
  },
  closeReport() {
    if (!this.data.reporting) this.setData({ reportVisible: false });
  },
  chooseReason(e) {
    if (!this.data.reporting) this.setData({ reason: e.currentTarget.dataset.code });
  },
  inputReport(e) {
    this.setData({ detail: e.detail.value });
  },
  async submitReport() {
    if (!requireSession() || this.data.reporting || this.data.isOwner) return;
    if (!this.data.reasons.some((r) => r.code === this.data.reason)) {
      wx.showToast({ title: '请选择举报原因', icon: 'none' });
      return;
    }
    const account = accountKey('post-detail');
    this.setData({ reporting: true, reportError: '' });
    try {
      await api(`/moments/${encodeURIComponent(this.postId)}/reports`, 'POST', {
        reason_code: this.data.reason,
        detail: this.data.detail.trim(),
      });
      if (this._disposed || account !== accountKey('post-detail')) return;
      this.setData({ reportVisible: false, reason: '', detail: '' });
      wx.showToast({ title: '举报已提交', icon: 'success' });
    } catch (e) {
      if (!this._disposed) this.setData({ reportError: errorText(e) });
    } finally {
      if (!this._disposed) this.setData({ reporting: false });
    }
  },
  async deletePost() {
    if (!requireSession() || !this.data.isOwner || this.data.deleting || !this.data.post) return;
    const account = accountKey('post-detail');
    this.setData({ deleting: true });
    try {
      const choice = await new Promise((resolve) =>
        wx.showModal({
          title: '删除帖子',
          content: '确定删除这篇帖子吗？删除后将不再展示。',
          confirmText: '删除',
          cancelText: '保留',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        }),
      );
      if (!choice.confirm || this._disposed || account !== accountKey('post-detail')) return;
      await api(`/moments/${encodeURIComponent(this.postId)}`, 'DELETE');
      if (account !== accountKey('post-detail')) return;
      const s = loadStore();
      saveStore({
        posts: s.posts.filter((p) => p.id !== this.postId),
        postCache: (s.postCache || []).filter((p) => p.id !== this.postId),
        feedIds: (s.feedIds || []).filter((id) => id !== this.postId),
        favorites: s.favorites.filter((id) => id !== this.postId),
      });
      wx.showToast({ title: '帖子已删除' });
      if (!this._disposed) wx.navigateBack();
    } catch (e) {
      if (!this._disposed) wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ deleting: false });
    }
  },
  cacheSocial(patch) {
    this.setData({ post: { ...this.data.post, ...patch } });
    try {
      const store = loadStore();
      saveStore({ postCache: (store.postCache || []).map((p) => (p.id === this.postId ? { ...p, ...patch } : p)) });
    } catch (_) {
      /* The server remains the source of truth. */
    }
  },
  async toggleLike() {
    if (!requireSession() || !this.data.post || this.data.liking) return;
    const account = accountKey('post-detail');
    this.setData({ liking: true });
    try {
      const result = await api(
        `/moments/${encodeURIComponent(this.postId)}/like`,
        this.data.post.liked ? 'DELETE' : 'POST',
      );
      if (this._disposed || account !== accountKey('post-detail')) return;
      this.cacheSocial({ liked: !!result.liked, likes: Number(result.likes) || 0 });
    } catch (e) {
      if (!this._disposed) wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ liking: false });
    }
  },
  scrollToComments() {
    this.setData({ commentAnchor: '' }, () => this.setData({ commentAnchor: 'post-comments' }));
  },
  openComments() {
    this.setData({
      commentsVisible: true,
      viewerId: hasSession() ? (wx.getStorageSync('miniprogram_user') || {}).id : '',
    });
  },
  closeComments() {
    if (!this.data.commentSending && !this.data.commentDeleting) this.setData({ commentsVisible: false });
  },
  async loadComments() {
    const version = (this._commentsVersion = (this._commentsVersion || 0) + 1);
    const account = accountKey('post-detail');
    this.setData({ commentsLoading: true, commentsError: '' });
    try {
      const result = await api(`/moments/${encodeURIComponent(this.postId)}/comments?limit=100`);
      if (this._disposed || version !== this._commentsVersion || account !== accountKey('post-detail')) return;
      this.setData({ comments: (result.items || []).map((c) => ({ ...c, avatar: mediaUrl(c.avatar) })) });
    } catch (e) {
      if (!this._disposed && version === this._commentsVersion) this.setData({ commentsError: errorText(e) });
    } finally {
      if (!this._disposed && version === this._commentsVersion) this.setData({ commentsLoading: false });
    }
  },
  inputComment(e) {
    this.setData({ commentDraft: e.detail.value });
  },
  async sendComment() {
    if (this.data.commentSending || this.data.commentDeleting || this.data.commentsLoading || !requireSession()) return;
    const content = this.data.commentDraft.trim();
    if (!content) return;
    const account = accountKey('post-detail');
    const user = wx.getStorageSync('miniprogram_user') || {};
    this.setData({ commentSending: true });
    try {
      const result = await api(`/moments/${encodeURIComponent(this.postId)}/comments`, 'POST', {
        content,
        author_name: user.name || '',
        author_avatar: user.avatarUrl || '',
      });
      if (this._disposed || account !== accountKey('post-detail')) return;
      const item = result.item;
      this.setData({
        commentDraft: '',
        commentsVisible: false,
        viewerId: user.id,
        commentsError: '',
        comments: [...this.data.comments.filter((c) => c.id !== item.id), { ...item, avatar: mediaUrl(item.avatar) }],
      });
      this.cacheSocial({ commentCount: (this.data.post.commentCount || 0) + 1 });
      this.scrollToComments();
      wx.showToast({ title: '评论已发布' });
    } catch (e) {
      if (!this._disposed) wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ commentSending: false });
    }
  },
  async deleteComment(e) {
    if (!requireSession() || this.data.commentDeleting || this.data.commentSending) return;
    const id = e.currentTarget.dataset.id;
    const user = wx.getStorageSync('miniprogram_user') || {};
    if (!this.data.comments.some((c) => c.id === id && c.user_id === user.id)) return;
    const account = accountKey('post-detail');
    this.setData({ commentDeleting: id });
    try {
      const choice = await new Promise((resolve) =>
        wx.showModal({
          title: '删除评论',
          content: '确定删除这条评论吗？',
          confirmText: '删除',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        }),
      );
      if (!choice.confirm || this._disposed || account !== accountKey('post-detail')) return;
      await api(`/moment-comments/${encodeURIComponent(id)}`, 'DELETE');
      if (this._disposed || account !== accountKey('post-detail')) return;
      this._commentsVersion = (this._commentsVersion || 0) + 1;
      this.setData({ comments: this.data.comments.filter((c) => c.id !== id), commentsLoading: false });
      this.cacheSocial({ commentCount: Math.max(0, (this.data.post.commentCount || 0) - 1) });
    } catch (e) {
      if (!this._disposed) wx.showToast({ title: errorText(e), icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ commentDeleting: '' });
    }
  },
  previewImage(e) {
    const urls = this.data.post ? this.data.post.images : [];
    if (urls.length) wx.previewImage({ current: urls[Number(e.currentTarget.dataset.index)] || urls[0], urls });
  },
  toggleSave() {
    if (!this.data.post) return;
    try {
      const s = loadStore();
      const saved = !s.favorites.includes(this.postId);
      saveStore({
        favorites: saved ? [...s.favorites, this.postId] : s.favorites.filter((id) => id !== this.postId),
        postCache: (() => {
          const list = [...(s.postCache || [])];
          const index = list.findIndex((p) => p.id === this.postId);
          if (index >= 0) list[index] = { ...list[index], ...this.data.post };
          else list.push(this.data.post);
          return list;
        })(),
      });
      this.setData({ saved });
      wx.showToast({ title: saved ? '已收藏' : '已取消收藏', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },
  onUnload() {
    this._disposed = true;
  },
});
