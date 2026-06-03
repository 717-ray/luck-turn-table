// pages/list/list.ts
import { loadTheme, saveTheme } from '../../utils/theme';

interface PresetItem {
  type: string;
  name: string;
  emoji: string;
  options: string[];
  favorited: boolean;
  isCustom: boolean;
}

const LIST_PRESETS: Record<string, { name: string; emoji: string; options: string[] }> = {
  lunch: { name: '午饭', emoji: '🍜', options: ['麻辣烫', '炸鸡', '寿司', '火锅', '螺蛳粉', '烤肉', '饺子', '盖饭', '米线', '烧烤'] },
  milk: { name: '奶茶', emoji: '🧋', options: ['珍珠奶茶', '杨枝甘露', '芝芝莓莓', '生椰拿铁', '柠檬水', '抹茶星冰乐'] },
  yesno: { name: '是否', emoji: '✅', options: ['Yes！冲！', 'No！算了', '再想想...', '必须搞！', '躺平吧'] },
  movie: { name: '电影', emoji: '🎬', options: ['科幻片', '喜剧片', '恐怖片', '动画片', '爱情片', '不看，睡觉'] },
  game: { name: '游戏', emoji: '🎮', options: ['原神', '光遇', '猫和老鼠', '王者荣耀', '鸣潮', '我的世界', '三角洲','鬼魂','和平精英'] },
};

/** 4个免费视觉主题 */
const FREE_THEMES: Record<string, { name: string; emoji: string }> = {
  sakura: { name: '樱花模式', emoji: '🌸' },
  cyberpunk: { name: '赛博朋克', emoji: '🌃' },
  neon: { name: '霓虹灯光', emoji: '✨' },
  sunset: { name: '落日余晖', emoji: '🌅' },
};

/** 随机emoji池（自定义转盘默认） */
const EMOJI_POOL = ['📝', '🎯', '🌟', '💎', '🔥', '🎪', '🎨', '🛠️', '🍀', '🏆'];

function randomEmoji(): string {
  return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
}

Page({
  data: {
    activeTab: 'hot' as 'hot' | 'default',
    presets: [] as PresetItem[],
    themePresets: [] as PresetItem[],
    displayPresets: [] as PresetItem[],
    theme: 'sakura' as string,

    // ---- 自定义转盘弹窗 ----
    showModal: false,
    modalMode: 'create' as 'create' | 'edit',
    editingType: '',        // 编辑中的 type
    customName: '',
    customOptions: '',
  },

  onLoad() {
    this.setData({ theme: loadTheme() });
    this.loadPresets();
  },

  onShow() {
    this.setData({ theme: loadTheme() });
    this.loadPresets();
  },

  /** 加载预设列表（内置 + 自定义） */
  loadPresets() {
    const favorites: string[] = wx.getStorageSync('favoritePresets') || [];
    const builtIn = Object.keys(LIST_PRESETS).map(key => ({
      type: key,
      ...LIST_PRESETS[key],
      favorited: favorites.includes(key),
      isCustom: false,
    }));

    // 加载自定义转盘
    const customPresets: PresetItem[] = (wx.getStorageSync('customPresets') || []) as PresetItem[];

    // 内置 + 自定义合并
    const presets = [...builtIn, ...customPresets];

    // 加载4个免费主题
    const themePresets = Object.keys(FREE_THEMES).map(key => ({
      type: key,
      name: FREE_THEMES[key].name,
      emoji: FREE_THEMES[key].emoji,
      options: [] as string[],
      favorited: false,
      isCustom: false,
    }));

    this.setData({ presets, themePresets }, () => this.sortPresets());
  },

  /** 根据当前Tab对预设排序 */
  sortPresets() {
    const { presets, themePresets, activeTab } = this.data;
    let sorted: PresetItem[];

    if (activeTab === 'hot') {
      // 热门转盘：收藏排前 → 内置 → 自定义
      sorted = [...presets].sort((a, b) => {
        // 收藏优先
        if (a.favorited && !b.favorited) return -1;
        if (!a.favorited && b.favorited) return 1;
        // 内置优先于自定义
        if (!a.isCustom && b.isCustom) return -1;
        if (a.isCustom && !b.isCustom) return 1;
        return 0;
      });
    } else {
      sorted = [...themePresets];
    }

    this.setData({ displayPresets: sorted });
  },

  /** 切换Tab */
  switchTab(e: any) {
    const tab = e.currentTarget.dataset.tab as 'hot' | 'default';
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.sortPresets());
  },

  /** 点击预设 → 存入 Storage 并切换到转盘页 */
  onTapPreset(e: any) {
    const type = e.currentTarget.dataset.type as string;

    if (this.data.activeTab === 'default') {
      // 热门主题Tab → 仅切换全局视觉主题
      const themeInfo = FREE_THEMES[type];
      if (!themeInfo) return;
      saveTheme(type as any);
      this.setData({ theme: type });
      wx.showToast({ title: `已切换：${themeInfo.emoji} ${themeInfo.name}`, icon: 'none' });
      return;
    }

    // 热门转盘Tab → 查找预设（内置或自定义）
    const preset = this.data.presets.find(p => p.type === type);
    if (!preset) return;

    wx.setStorageSync('selectedPreset', { type, name: preset.name, emoji: preset.emoji, options: preset.options });
    wx.switchTab({ url: '/pages/index/index' });
  },

  /** ========== 自定义转盘相关 ========== */

  /** 阻止事件冒泡（供 modal-card 的 catchtap 使用） */
  noop() {},

  /** 打开创建弹窗 */
  onTapCustom() {
    this.setData({
      showModal: true,
      modalMode: 'create',
      editingType: '',
      customName: '',
      customOptions: '',
    });
  },

  /** 关闭弹窗 */
  onCloseModal() {
    this.setData({ showModal: false });
  },

  /** 输入名称 */
  onNameInput(e: any) {
    this.setData({ customName: e.detail.value });
  },

  /** 输入选项（用，分隔） */
  onOptionsInput(e: any) {
    this.setData({ customOptions: e.detail.value });
  },

  /** 保存自定义转盘 */
  onSaveCustom() {
    const { modalMode, editingType, customName, customOptions } = this.data;
    const name = customName.trim();
    const raw = customOptions.trim();

    if (!name) {
      wx.showToast({ title: '请输入转盘名称', icon: 'none' });
      return;
    }

    // 解析选项：按"，"分割（兼容中英文逗号），过滤空项
    const options = raw
      .split(/[，,]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (options.length < 2) {
      wx.showToast({ title: '请至少输入2个选项（用逗号分隔）', icon: 'none' });
      return;
    }

    const customPresets: PresetItem[] = (wx.getStorageSync('customPresets') || []) as PresetItem[];

    if (modalMode === 'create') {
      // 新建
      const newItem: PresetItem = {
        type: `custom_${Date.now()}`,
        name,
        emoji: randomEmoji(),
        options,
        favorited: false,
        isCustom: true,
      };
      customPresets.push(newItem);
    } else {
      // 编辑
      const idx = customPresets.findIndex(p => p.type === editingType);
      if (idx > -1) {
        customPresets[idx].name = name;
        customPresets[idx].options = options;
        // 如果用户没有改名，保持原 emoji
      } else {
        wx.showToast({ title: '未找到该转盘', icon: 'none' });
        return;
      }
    }

    wx.setStorageSync('customPresets', customPresets);
    this.setData({ showModal: false });
    wx.showToast({ title: modalMode === 'create' ? '创建成功' : '已保存', icon: 'success' });
    this.loadPresets();
  },

  /** 长按自定义转盘 → 编辑/删除 */
  onLongPressCustom(e: any) {
    const type = e.currentTarget.dataset.type as string;
    const preset = this.data.presets.find(p => p.type === type);
    if (!preset || !preset.isCustom) return;

    wx.showActionSheet({
      itemList: ['重命名 & 修改选项', '删除'],
      itemColor: '#ff3b30',
      success: (res: WechatMiniprogram.ShowActionSheetSuccessCallbackResult) => {
        if (res.tapIndex === 0) {
          // 编辑
          this.setData({
            showModal: true,
            modalMode: 'edit',
            editingType: type,
            customName: preset.name,
            customOptions: preset.options.join('，'),
          });
        } else if (res.tapIndex === 1) {
          // 删除
          this.deleteCustom(type);
        }
      },
    });
  },

  /** 删除自定义转盘 */
  deleteCustom(type: string) {
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      confirmColor: '#ff3b30',
      success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!res.confirm) return;
        const customPresets: PresetItem[] = (wx.getStorageSync('customPresets') || []) as PresetItem[];
        const filtered = customPresets.filter(p => p.type !== type);
        wx.setStorageSync('customPresets', filtered);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.loadPresets();
      },
    });
  },

  /** 收藏/取消收藏（仅内置） */
  toggleFavorite(e: any) {
    const type = e.currentTarget.dataset.type as string;
    const favorites: string[] = wx.getStorageSync('favoritePresets') || [];
    const idx = favorites.indexOf(type);

    if (idx > -1) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(type);
    }

    wx.setStorageSync('favoritePresets', favorites);

    const presets = this.data.presets.map((p: PresetItem) =>
      p.type === type ? { ...p, favorited: !p.favorited } : p
    );
    const displayPresets = this.data.displayPresets.map((p: PresetItem) =>
      p.type === type ? { ...p, favorited: !p.favorited } : p
    );

    this.setData({ presets, displayPresets });
  },
});
