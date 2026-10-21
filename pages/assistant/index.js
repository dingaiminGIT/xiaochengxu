import { previewIngredientExample } from '../../utils/preview-ingredient-example';
import { setModalData, syncModalTabBar } from '../../utils/modal-layout';
import { chatMethods } from '../../utils/assistant-chat';
import { accountKey } from '../../utils/pet-store';
import config from '../../config';
import request from '../../api/request';

const FOODS = {
  current: [
    { id: 'royal-k36', brand: '皇家', name: 'K36', emoji: '🐱' },
    { id: 'now', brand: 'NOW FRESH', name: '成猫粮', emoji: '🥣' },
    { id: 'orijen', brand: '渴望', name: '原味猫粮', emoji: '🐟' },
  ],
  target: [
    { id: 'guardian', brand: '渴望', name: '八重守护', emoji: '🐟' },
    { id: 'pacifica', brand: '爱肯拿', name: '海洋盛宴', emoji: '🌊' },
    { id: 'lamb', brand: '巅峰', name: '羊肉配方', emoji: '🥩' },
  ],
};

const SYMPTOMS = ['软便敏感', '偶尔黑下巴', '下巴出油', '挑食', '泪痕', '无明显异常'];

const INGREDIENT_META = {
  animal_protein: { tone: 'coral', icon: '🥩', desc: '决定蛋白质质量和适口性' },
  plant_protein: { tone: 'green', icon: '🫛', desc: '补充植物蛋白，也参与碳水结构' },
  fat: { tone: 'yellow', icon: '💧', desc: '影响能量密度、皮肤和毛发状态' },
  carbohydrate: { tone: 'orange', icon: '🌾', desc: '用于颗粒成型和能量补充' },
  fiber: { tone: 'green', icon: '🍃', desc: '帮助便便成形和肠道过渡' },
  botanical: { tone: 'purple', icon: '🫐', desc: '低占比，不主导宏观判断' },
};

function mapIngredientGroups(analysis) {
  return ((analysis && analysis.groups) || []).map((group) => {
    const meta = INGREDIENT_META[group.category] || { tone: 'orange', icon: '◉', desc: '标准配料分类' };
    const ingredients = group.ingredients || [];
    return {
      id: group.category,
      title: group.title,
      ...meta,
      tags: ingredients.slice(0, 3),
    };
  });
}

const RADAR_DIMENSIONS = [
  { key: 'protein_quality', label: '蛋白质量', position: 'metric-top' },
  { key: 'protein_pressure', label: '蛋白压力', position: 'metric-right-top' },
  { key: 'fat_burden', label: '脂肪负担', position: 'metric-right-bottom' },
  { key: 'carb_burden', label: '碳水负担', position: 'metric-bottom' },
  { key: 'fiber_buffer', label: '纤维缓冲', position: 'metric-left-bottom' },
  { key: 'microbiome_support', label: '菌群支持', position: 'metric-left-top' },
];

const ROLE_DEFINITIONS = [
  { key: 'protein', title: '蛋白来源', icon: '🫧', tone: 'blue' },
  { key: 'starch', title: '碳水和淀粉来源', icon: '🌾', tone: 'yellow' },
  { key: 'fat', title: '脂肪来源', icon: '🟠', tone: 'orange' },
  { key: 'fiber', title: '肠道支持和纤维缓冲', icon: '🌿', tone: 'green' },
  { key: 'protection', title: '抗氧化与皮肤屏障支持', icon: '🧪', tone: 'blue' },
];

function profileValue(profile, label) {
  const point = (profile || []).find((item) => item.dimension === label);
  const value = Number(point && point.score);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function mapRadarMetrics(currentProfile, targetProfile) {
  return RADAR_DIMENSIONS.map((item) => ({
    ...item,
    current: profileValue(currentProfile, item.label),
    target: profileValue(targetProfile, item.label),
  }));
}

function mapMaterialRoles(evidence, fallbackGroups = []) {
  const buckets = { protein: [], starch: [], fat: [], fiber: [], protection: [] };
  const add = (key, name) => {
    const value = String(name || '').trim();
    if (value && !buckets[key].includes(value)) buckets[key].push(value);
  };
  const items = (evidence && evidence.ingredient_items) || [];
  items.forEach((item) => {
    const role = String(item.primary_nutrition_role || '');
    const family = String(item.ingredient_family || '');
    const name = item.raw_name || item.standard_name;
    if (item.is_protein || role.includes('蛋白')) add('protein', name);
    if (role.includes('碳水') || family.includes('淀粉') || family.includes('谷物') || family.includes('根茎'))
      add('starch', name);
    if (role.includes('脂肪') || family.includes('油脂')) add('fat', name);
    if (role.includes('纤维') || role.includes('益生元') || family.includes('纤维')) add('fiber', name);
    if (role.includes('抗氧化') || role.includes('微量') || role.includes('皮肤')) add('protection', name);
  });
  const mapped = ROLE_DEFINITIONS.map((definition) => ({
    ...definition,
    tags: buckets[definition.key].slice(0, 8),
  })).filter((item) => item.tags.length);
  if (mapped.length) return mapped;
  return (fallbackGroups || []).map((item) => ({
    key: item.id,
    title: item.title,
    icon: item.icon,
    tone: item.tone,
    tags: item.tags || [],
  }));
}

Page({
  data: {
    statusBarHeight: 20,
    compactWelcome: false,
    welcomeShortcuts: [
      { id: 'diet', label: '饮食建议', iconWidth: 39.74, iconHeight: 41.76, prompt: '想了解适合我家宠物的日常饮食建议。' },
      { id: 'health', label: '状态解读', iconWidth: 44.04, iconHeight: 40.24, prompt: '想聊聊我家宠物最近的状态，需要补充哪些信息？' },
      { id: 'food', label: '选粮避坑', iconWidth: 35.70, iconHeight: 39.74, prompt: '怎样给我家宠物选粮，有哪些需要注意的地方？' },
      { id: 'toy', label: '玩具推荐', iconWidth: 39.74, iconHeight: 39.74, prompt: '想给我家宠物选合适的玩具，有什么建议？' },
      { id: 'photo', label: '拍照问问', iconWidth: 39.74, iconHeight: 35.70 },
      { id: 'guide', label: '养宠攻略', iconWidth: 35.70, iconHeight: 39.74, prompt: '日常养宠有哪些饮食、清洁和陪伴方面的注意事项？' },
    ],
    chatMessages: [],
    keyboardHeight: 0,
    currentFood: FOODS.current[0],
    targetFood: FOODS.target[0],
    symptomText: '软便敏感 / 偶尔黑下巴',
    selectedSymptoms: ['软便敏感', '偶尔黑下巴'],
    symptomOptions: SYMPTOMS.map((label) => ({ label, selected: ['软便敏感', '偶尔黑下巴'].includes(label) })),
    showFoodSheet: false,
    showDailyRecord: false,
    dailyRecordLoading: false,
    dailyRecordSaving: false,
    dailyRecordError: '',
    dailyRecordForm: {},
    dailyRecordFields: [],
    dailyRecordSources: ['手动记录', '设备统计（手工填写）'],
    foodOptions: [],
    foodTitle: '',
    foodType: 'current',
    loadingFoods: false,
    showSymptomSheet: false,
    testing: false,
    recognized: false,
    showPetGate: false,
    boundPet: null,
    inputMessage: '',
    userMessage: '',
    assistantMessage: '',
    sending: false,
    activeFoodTab: 'current',
    activeFoodTitle: '',
    activeFoodMatched: false,
    currentFoodMatched: false,
    targetFoodMatched: false,
    ingredientGroups: [],
    currentIngredientGroups: [],
    targetIngredientGroups: [],
    compareLoading: false,
    showExitModal: false,
    showIngredientSheet: false,
    chatPets: [],
    composerPet: null,
    showChatPetPicker: false,
    petsLoading: false,
    chatScrollTop: 0,
    composerImages: [],
    savedMode: false,
    savedDraft: {},
  },

  onLoad() {
    const { statusBarHeight = 20, windowHeight, windowWidth } = wx.getWindowInfo();
    const savedDraft = wx.getStorageSync(accountKey('food_change_draft')) || {};
    this.setData({
      statusBarHeight,
      compactWelcome: windowHeight / windowWidth < 2.25,
      savedDraft,
      savedMode: !!savedDraft.savedAt,
      chatMessages: [],
    });
  },

  onShow() {
    syncModalTabBar(this);
    const account = accountKey('assistant');
    if (this._account && this._account !== account) {
      this._cloudConversationId = '';
      this._cloudPetId = '';
      this._selectedChatPetId = '';
      this._pendingStatusGuide = false;
      this.setData({ composerPet: null, boundPet: null, chatPets: [] });
      if (!this._bindingPet && !this._returningFromLogin) this.setData({ inputMessage: '', composerImages: [] });
      if (this.data.sending) {
        this._sendVersion = (this._sendVersion || 0) + 1;
        if (this._sendRequest) this._sendRequest.abort();
      }
      this.setData({
        sending: false,
        dailyRecordSaving: false,
        dailyRecordLoading: false,
        showDailyRecord: false,
        chatMessages: [],
        recognized: false,
        savedMode: false,
        userMessage: '',
      });
    }
    this._returningFromLogin = false;
    this._account = account;
    this._bindingPet = false;
    this.refreshChatPet().then(() => {
      if (this._pendingStatusGuide && this.data.boundPet?.id) {
        this._pendingStatusGuide = false;
        this.openStatusGuide();
      }
    });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'assistant' });
    }
  },

  goBack() {
    if (this.data.userMessage || this.data.recognized) {
      setModalData(this, { showExitModal: true });
      return;
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/home/index' });
  },

  directLeave() {
    const savedDraft = {
      currentFood: this.data.currentFood,
      targetFood: this.data.targetFood,
      symptomText: this.data.symptomText,
      selectedSymptoms: this.data.selectedSymptoms,
      userMessage: this.data.userMessage,
      chatMessages: this.data.chatMessages,
      assistantMessage: this.data.assistantMessage,
      currentIngredientGroups: this.data.currentIngredientGroups,
      targetIngredientGroups: this.data.targetIngredientGroups,
      currentFoodMatched: this.data.currentFoodMatched,
      targetFoodMatched: this.data.targetFoodMatched,
      savedAt: Date.now(),
    };
    wx.setStorageSync(accountKey('food_change_draft'), savedDraft);
    setModalData(this, {
      showExitModal: false,
      savedMode: true,
      savedDraft,
      recognized: false,
      testing: false,
      inputMessage: '',
      userMessage: '',
      chatMessages: [],
      assistantMessage: '',
      currentIngredientGroups: [],
      targetIngredientGroups: [],
      ingredientGroups: [],
    });
    this.setData({ chatScrollTop: 0 });
  },

  continueConversation(event) {
    if (this.data.showExitModal) {
      setModalData(this, { showExitModal: false });
      return;
    }
    if (!event || event.currentTarget.dataset.action !== 'resume') return;
    const draft = this.data.savedDraft;
    this.setData({
      savedMode: false,
      currentFood: draft.currentFood || FOODS.current[0],
      targetFood: draft.targetFood || FOODS.target[0],
      symptomText: draft.symptomText || '暂无明显状态',
      selectedSymptoms: draft.selectedSymptoms || [],
      symptomOptions: SYMPTOMS.map((label) => ({ label, selected: (draft.selectedSymptoms || []).includes(label) })),
      userMessage: draft.userMessage || '',
      chatMessages: draft.chatMessages || [],
      assistantMessage: draft.assistantMessage || '',
      currentIngredientGroups: draft.currentIngredientGroups || [],
      targetIngredientGroups: draft.targetIngredientGroups || [],
      currentFoodMatched: !!draft.currentFoodMatched,
      targetFoodMatched: !!draft.targetFoodMatched,
      activeFoodTab: 'current',
      ingredientGroups: draft.currentIngredientGroups || [],
      recognized: true,
    });
    this.setData({ chatScrollTop: 0 });
  },

  deleteSavedConversation() {
    wx.removeStorageSync(accountKey('food_change_draft'));
    wx.removeStorageSync(accountKey('food_change_session_id'));
    setModalData(this, {
      savedMode: false,
      savedDraft: {},
      currentFood: FOODS.current[0],
      targetFood: FOODS.target[0],
      symptomText: '暂无明显状态',
      selectedSymptoms: [],
      symptomOptions: SYMPTOMS.map((label) => ({ label, selected: false })),
      inputMessage: '',
      userMessage: '',
      chatMessages: [],
      assistantMessage: '',
      recognized: false,
      testing: false,
      sending: false,
      composerImages: [],
      showIngredientSheet: false,
      currentIngredientGroups: [],
      targetIngredientGroups: [],
      ingredientGroups: [],
      currentFoodMatched: false,
      targetFoodMatched: false,
    });
    this.setData({ chatScrollTop: 0 });
  },

  useWelcomeShortcut(event) {
    const shortcut = this.data.welcomeShortcuts.find((item) => item.id === event.currentTarget.dataset.id);
    if (!shortcut || this.data.sending) return;
    if (shortcut.id === 'photo') {
      this.onIngredientFound();
      return;
    }
    this.usePrompt({ currentTarget: { dataset: { message: shortcut.prompt } } });
  },

  useKeyboardVoice() {
    this.focusComposer();
    wx.showToast({ title: '请使用系统键盘的语音输入', icon: 'none' });
  },

  usePrompt(event) {
    const message = event.currentTarget.dataset.message || '';
    this.setData({ inputMessage: message }, () => this.sendMessage());
  },

  openIngredientSheet() {
    this.openFoodSubmission();
  },

  previewIngredientExample() {
    previewIngredientExample();
  },

  onIngredientFound() {
    if (this.data.sending) return;
    this.setData({ composerFocused: false });
    wx.hideKeyboard();
    wx.showActionSheet({
      itemList: ['拍摄', '从相册选择'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album'];
        this.pickIngredientImages(sourceType);
      },
    });
  },

  pickIngredientImages(sourceType) {
    const remain = 3 - this.data.composerImages.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 3 张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType,
      sizeType: ['compressed'],
      success: (res) => {
        const files = (res.tempFiles || []).filter((file) => {
          if (file.size > 10 * 1024 * 1024) {
            wx.showToast({ title: '单张图片不能超过 10MB', icon: 'none' });
            return false;
          }
          return true;
        });
        if (!files.length) return;
        const next = [...this.data.composerImages, ...files.map((file) => file.tempFilePath)].slice(0, 3);
        setModalData(this, {
          showIngredientSheet: false,
          composerImages: next,
          inputMessage: this.data.inputMessage || '请帮我分析配料表',
        });
      },
      fail: (error) => {
        if (!/cancel/i.test(error.errMsg || '')) {
          wx.showToast({ title: '无法获取图片，请检查相机或相册权限后重试', icon: 'none' });
        }
      },
    });
  },

  previewComposerImage(event) {
    const current = event.currentTarget.dataset.current;
    if (!current) return;
    const fromMessage = this.data.chatMessages.find((item) => (item.images || []).includes(current));
    const urls = (fromMessage && fromMessage.images) || this.data.composerImages;
    wx.previewImage({ current, urls: urls.length ? urls : [current] });
  },

  removeComposerImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      composerImages: this.data.composerImages.filter((_, i) => i !== index),
    });
  },

  cyclePrompts() {
    wx.showToast({ title: '已为你换一组表达示例', icon: 'none' });
  },

  blurComposer() {
    this.setData({ composerFocused: false });
  },
  focusComposer() {
    this.setData({ composerFocused: true });
    this.setData({ chatScrollTop: 0 });
  },

  async openFoodSheet(event) {
    const foodType = event.currentTarget.dataset.type;
    const selectedFood = this.data[`${foodType}Food`];
    setModalData(this, {
      showFoodSheet: true,
      foodType,
      foodTitle: foodType === 'current' ? '选择当前粮' : '选择目标粮',
      foodOptions: [],
      loadingFoods: true,
    });
    try {
      const response = await request(
        `${config.apiBaseUrl}/api/miniprogram/products?brand=${encodeURIComponent(selectedFood.brand)}&limit=50`,
      );
      const items = (response.data && response.data.items) || [];
      this.setData({
        loadingFoods: false,
        foodOptions: items.map((item) => ({
          id: item.catalog_key,
          productKey: item.product_key,
          brand: item.brand,
          name: item.product_name,
          emoji: foodType === 'current' ? '🐱' : '🥣',
          selected: item.catalog_key === selectedFood.id,
        })),
      });
    } catch (error) {
      this.setData({ loadingFoods: false });
      wx.showToast({ title: (error.data && error.data.error) || '产品加载失败', icon: 'none' });
    }
  },

  async chooseFood(event) {
    const food = this.data.foodOptions.find((item) => item.id === event.currentTarget.dataset.id);
    if (!food) return;
    const foodType = this.data.foodType;
    setModalData(this, { [`${foodType}Food`]: food, showFoodSheet: false });
    try {
      const response = await request(`${config.apiBaseUrl}/api/miniprogram/products/ingredients`, 'POST', {
        catalog_key: food.id,
      });
      const groups = mapIngredientGroups(response.data && response.data.ingredient_analysis);
      const groupKey = foodType === 'current' ? 'currentIngredientGroups' : 'targetIngredientGroups';
      const matchedKey = foodType === 'current' ? 'currentFoodMatched' : 'targetFoodMatched';
      const updates = { [groupKey]: groups, [matchedKey]: !!(response.data && response.data.ingredient_analysis) };
      if (this.data.activeFoodTab === foodType) {
        updates.ingredientGroups = groups;
        updates.activeFoodTitle = `${food.brand} ${food.name}`;
        updates.activeFoodMatched = updates[matchedKey];
      }
      this.setData(updates);
    } catch (error) {
      wx.showToast({ title: (error.data && error.data.error) || '配料加载失败', icon: 'none' });
    }
  },

  openSymptoms() {
    setModalData(this, { showSymptomSheet: true });
  },
  closeSheet() {
    setModalData(this, { showFoodSheet: false, showSymptomSheet: false, showIngredientSheet: false });
  },

  toggleSymptom(event) {
    const label = event.currentTarget.dataset.label;
    let selected = [...this.data.selectedSymptoms];
    if (label === '无明显异常') {
      selected = selected.includes(label) ? [] : [label];
    } else {
      selected = selected.filter((item) => item !== '无明显异常');
      selected = selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label];
    }
    this.setData({
      selectedSymptoms: selected,
      symptomOptions: SYMPTOMS.map((item) => ({ label: item, selected: selected.includes(item) })),
    });
  },

  confirmSymptoms() {
    if (!this.data.selectedSymptoms.length) {
      wx.showToast({ title: '请至少选择一项', icon: 'none' });
      return;
    }
    setModalData(this, { symptomText: this.data.selectedSymptoms.join(' / '), showSymptomSheet: false });
  },

  onMessageInput(event) {
    this.setData({ inputMessage: event.detail.value });
  },

  async sendLegacyMessage() {
    const images = [...this.data.composerImages];
    const message = this.data.inputMessage.trim() || (images.length ? '请帮我分析配料表' : '');
    if ((!message && !images.length) || this.data.sending) return;
    const version = (this._sendVersion || 0) + 1;
    this._sendVersion = version;
    this._lastPrompt = message;
    this.setData({
      chatMessages: [...this.data.chatMessages, { id: `user-${Date.now()}`, role: 'user', text: message, images }],
    });
    this.setData({
      sending: true,
      inputMessage: '',
      composerImages: [],
      userMessage: message,
      assistantMessage: '正在识别换粮意图和猫咪状态…',
      recognized: false,
    });
    try {
      const userInfo = wx.getStorageSync('miniprogram_user') || {};
      const sessionId =
        wx.getStorageSync(accountKey('food_change_session_id')) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      wx.setStorageSync(accountKey('food_change_session_id'), sessionId);
      this._sendRequest = request(`${config.apiBaseUrl}/api/miniprogram/food-change/intent`, 'POST', {
        user_id: userInfo.openid || userInfo.id || '',
        session_id: sessionId,
        message,
      });
      const response = await this._sendRequest;
      if (version !== this._sendVersion) return;
      const data = response.data || {};
      const intent = data.intent || {};
      const current = intent.current_food || {};
      const target = intent.target_food || {};
      const symptoms = (intent.cat_status && intent.cat_status.symptoms) || [];
      const currentMatch = data.product_match || {};
      const targetMatch = data.target_product_match || {};
      const currentIngredientGroups = mapIngredientGroups(data.ingredient_analysis);
      const targetIngredientGroups = mapIngredientGroups(data.target_ingredient_analysis);
      const missingProductNames = [];
      if (!current.product_name && !intent.product_name) missingProductNames.push('当前粮');
      if (!target.product_name) missingProductNames.push('目标粮');
      this.setData({
        currentFood: {
          id: currentMatch.catalog_key || 'recognized-current',
          productKey: currentMatch.product_key || '',
          brand: currentMatch.brand || current.brand || intent.brand || '未识别',
          name: currentMatch.product_name || current.product_name || intent.product_name || '具体产品未识别',
          emoji: '🐱',
        },
        targetFood: {
          id: targetMatch.catalog_key || 'recognized-target',
          productKey: targetMatch.product_key || '',
          brand: targetMatch.brand || target.brand || '未识别',
          name: targetMatch.product_name || target.product_name || '具体产品未识别',
          emoji: '🥣',
        },
        selectedSymptoms: symptoms,
        symptomText: symptoms.length ? symptoms.join(' / ') : '暂无明显状态',
        assistantMessage: intent.is_food_change_intent
          ? missingProductNames.length
            ? `已识别品牌，请补充${missingProductNames.join('和')}的具体产品或系列。`
            : '已识别换粮信息，请确认后开始检测。'
          : '暂未识别到明确的换粮意图，请补充当前粮、目标粮和猫咪状态。',
        recognized: !!intent.is_food_change_intent,
        activeFoodTab: 'current',
        currentIngredientGroups,
        targetIngredientGroups,
        ingredientGroups: currentIngredientGroups,
        activeFoodTitle: `${currentMatch.brand || current.brand || intent.brand || '未识别'} ${
          currentMatch.product_name || current.product_name || intent.product_name || '未识别'
        }`,
        activeFoodMatched: !!data.ingredient_analysis,
        currentFoodMatched: !!data.ingredient_analysis,
        targetFoodMatched: !!data.target_ingredient_analysis,
        sending: false,
      });
      this.appendAssistant(this.data.assistantMessage);
    } catch (error) {
      if (version !== this._sendVersion) return;
      const apiError = error && error.data && error.data.error;
      const networkError = error && error.errMsg;
      const messageText = apiError || networkError || '接口连接失败，请确认后端服务已启动。';
      this.setData({ assistantMessage: messageText, sending: false });
      this.appendAssistant('暂时连接不上，请稍后重试。你的问题已保留。', true);
    }
  },
  onKeyboardChange(e) {
    const keyboardHeight = e.detail.height || 0;
    this.setData({ keyboardHeight }, () => {
      if (keyboardHeight) this.scrollChat();
    });
  },
  scrollChat() {
    this.setData({ chatScrollTop: (this.data.chatScrollTop || 0) + 100000 });
  },
  appendAssistant(text, error = false) {
    this.setData({
      chatMessages: [...this.data.chatMessages, { id: `assistant-${Date.now()}`, role: 'assistant', text, error }],
    });
    this.saveConversation();
    this.scrollChat();
  },
  stopSending() {
    this._sendVersion = (this._sendVersion || 0) + 1;
    if (this._sendRequest && this._sendRequest.abort) this._sendRequest.abort();
    this.setData({ sending: false });
    this.appendAssistant('已停止生成。你可以补充信息后继续。');
  },
  retryMessage() {
    this.setData({ inputMessage: this._lastPrompt || this.data.userMessage });
    this.sendMessage();
  },
  saveConversation() {
    if (this._cloudConversationId || !this.data.chatMessages.some((m) => m.role === 'user')) return;
    const id = wx.getStorageSync(accountKey('food_change_session_id')) || `chat-${Date.now()}`;
    wx.setStorageSync(accountKey('food_change_session_id'), id);
    const entry = {
      id,
      title: this.data.chatMessages.find((m) => m.role === 'user').text.slice(0, 40),
      messages: this.data.chatMessages,
      state: {
        currentFood: this.data.currentFood,
        targetFood: this.data.targetFood,
        recognized: this.data.recognized,
        selectedSymptoms: this.data.selectedSymptoms,
        symptomText: this.data.symptomText,
        userMessage: this.data.userMessage,
        assistantMessage: this.data.assistantMessage,
        currentIngredientGroups: this.data.currentIngredientGroups,
        targetIngredientGroups: this.data.targetIngredientGroups,
        currentFoodMatched: this.data.currentFoodMatched,
        targetFoodMatched: this.data.targetFoodMatched,
      },
    };
    try {
      const list = wx.getStorageSync(accountKey('assistant_conversations_v1')) || [];
      wx.setStorageSync(
        accountKey('assistant_conversations_v1'),
        [entry, ...list.filter((v) => v.id !== id)].slice(0, 30),
      );
    } catch (e) {
      wx.showToast({ title: '对话未能保存到本机', icon: 'none' });
    }
  },
  newConversation() {
    if (this.data.sending) this.stopSending();
    this.saveConversation();
    this._cloudConversationId = '';
    this._cloudPetId = '';
    this._lastCloudPayload = null;
    wx.removeStorageSync(accountKey('food_change_session_id'));
    this.setData({
      chatMessages: [],
      inputMessage: '',
      composerImages: [],
      userMessage: '',
      assistantMessage: '',
      recognized: false,
      savedMode: false,
    });
  },
  onHide() {
    this._dailyRecordVersion = (this._dailyRecordVersion || 0) + 1;
    if (this.data.showPetGate) this.resolvePetGate();
    if (this.data.sending) this.stopSending();
    this.saveConversation();
    setModalData(this, {
      keyboardHeight: 0,
      showFoodSheet: false,
      showSymptomSheet: false,
      showIngredientSheet: false,
      showExitModal: false,
      showChatPetPicker: false,
      showDailyRecord: false,
    });
  },
  onUnload() {
    if (this._resolvePetGate) this.resolvePetGate();
    this._sendVersion = (this._sendVersion || 0) + 1;
    if (this._sendRequest && this._sendRequest.abort) this._sendRequest.abort();
  },

  async startTest() {
    if (this.data.testing) return;
    this.setData({ testing: true });
    try {
      const currentFood = this.data.currentFood;
      const targetFood = this.data.targetFood;
      const response = await request(`${config.apiBaseUrl}/api/cat-food-compare/compare`, 'POST', {
        current_food: `${currentFood.brand} ${currentFood.name}`,
        target_food: `${targetFood.brand} ${targetFood.name}`,
        current_product_key: currentFood.productKey || '',
        target_product_key: targetFood.productKey || '',
        current_display_brand: currentFood.brand,
        current_display_name: currentFood.name,
        target_display_brand: targetFood.brand,
        target_display_name: targetFood.name,
      });
      const comparison = response.data || {};
      const currentResult = comparison.current_food || {};
      const targetResult = comparison.target_food || {};
      const radarMetrics = mapRadarMetrics(currentResult.profile, targetResult.profile);
      const currentRoleGroups = mapMaterialRoles(
        currentResult.material_role_evidence,
        this.data.currentIngredientGroups,
      );
      const targetRoleGroups = mapMaterialRoles(targetResult.material_role_evidence, this.data.targetIngredientGroups);
      wx.setStorageSync('food_change_analysis_result', {
        currentFood,
        targetFood,
        radarMetrics,
        currentRoleGroups,
        targetRoleGroups,
        roleGroups: targetRoleGroups,
        activeFoodTab: 'target',
      });
      this.setData({ testing: false });
      wx.navigateTo({ url: '/pages/analysis/index' });
    } catch (error) {
      const message = (error.data && error.data.error) || error.errMsg || '营养对比数据加载失败';
      this.setData({ testing: false });
      wx.showToast({ title: message, icon: 'none', duration: 3000 });
    }
  },
  ...chatMethods,
});
