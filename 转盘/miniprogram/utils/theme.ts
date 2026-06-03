/** 主题定义（所有页面共享） */
export const THEMES = {
  cyberpunk: { name: '🌃 赛博朋克' },
  sakura: { name: '🌸 樱花模式' },
  neon: { name: '✨ 霓虹灯光' },
  sunset: { name: '🌅 落日余晖' }
} as const;

export type ThemeKey = keyof typeof THEMES;

/** 从 Storage 读取当前主题 */
export function loadTheme(): ThemeKey {
  const stored = wx.getStorageSync('appTheme');
  return (stored && ['cyberpunk', 'sakura', 'neon', 'sunset'].includes(stored))
    ? stored as ThemeKey
    : 'sakura';
}

/** 持久化并广播主题变更 */
export function saveTheme(theme: ThemeKey) {
  wx.setStorageSync('appTheme', theme);
}
