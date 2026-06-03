// pages/index/index.ts
interface HistoryRecord {
  choices: string;
  result: string;
  time: string;
  date: string;
  timestamp: number;
  optionsCount: number;
  isCustom: boolean;
}

interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

const PRESETS: Record<string, { name: string; emoji: string; options: string[] }> = {
  lunch: { name: '午饭', emoji: '🍜', options: ['麻辣烫', '炸鸡', '寿司', '火锅', '螺蛳粉', '烤肉', '饺子', '盖饭', '米线', '烧烤'] },
  milk: { name: '奶茶', emoji: '🧋', options: ['珍珠奶茶', '杨枝甘露', '芝芝莓莓', '生椰拿铁', '柠檬水', '抹茶星冰乐'] },
  yesno: { name: '是否', emoji: '✅', options: ['Yes！冲！', 'No！算了', '再想想...', '必须搞！', '躺平吧'] },
  movie: { name: '电影', emoji: '🎬', options: ['科幻片', '喜剧片', '恐怖片', '动画片', '爱情片', '不看，睡觉'] },
  game: { name: '游戏', emoji: '🎮', options: ['原神', '光遇', '猫和老鼠', '王者荣耀', '鸣潮', '我的世界', '三角洲','鬼魂','和平精英'] },
};

const COLOR_PALETTES = [
  ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#845ef7', '#ff6b6b', '#ffd93d'],
  ['#feca57', '#ff9f43', '#ee5a24', '#ff4757', '#ff6b6b', '#feca57'],
  ['#00d2d3', '#54a0ff', '#5f27cd', '#c23616', '#e84393', '#00d2d3'],
  ['#10ac84', '#1dd1a1', '#ffeaa7', '#fab1a0', '#e17055', '#10ac84'],
];

import { THEMES, loadTheme, saveTheme, ThemeKey } from '../../utils/theme';
type ColorPalette = string[];

const _private: Record<string, any> = {
  lastAccel: null,
  accelerometerChange: null,
};

Page({
  data: {
    options: ['麻辣烫', '炸鸡', '寿司', '火锅', '螺蛳粉', '烤肉'],
    colors: COLOR_PALETTES[0],
    colorPaletteIndex: 0,
    rotateDeg: 0,
    isSpinning: false,
    result: '',
    showResult: false,
    inputText: '',
    theme: 'sakura',
    lastTapTime: 0,
    showHistory: false,
    history: <any[]>[],
    shakeEnabled: true,
    shakeTip: '📱 摇一摇手机也能触发转盘哦～',
    showGuide: true,
    soundEnabled: true,
    canvasSize: 300,
  },

  onLoad() {
    this.setData({ theme: loadTheme() });  // 从 Storage 恢复主题
    this.loadHistory();
    this.startAccelerometer();
    const hasUsed = wx.getStorageSync('hasUsedWheel');
    if (hasUsed) this.setData({ showGuide: false });
    setTimeout(() => this.setData({ showGuide: false }), 5000);
    this.setData({ canvasSize: 300, rotateDeg: 0 }, () => {
      setTimeout(() => this.drawWheelAtAngle(0), 200);
    });
  },

  onShow() {
    // 从列表页传来的预设选择
    const selected = wx.getStorageSync('selectedPreset');
    if (selected && selected.options) {
      wx.removeStorageSync('selectedPreset');
      const paletteIndex = Math.floor(Math.random() * COLOR_PALETTES.length);
      this.setData({
        options: selected.options,
        result: '',
        showResult: false,
        inputText: '',
        colors: COLOR_PALETTES[paletteIndex],
        colorPaletteIndex: paletteIndex,
      }, () => this.drawWheelAtAngle(0));
    }
  },

  drawWheelAtAngle(rotateDeg: number = 0) {
    const options = this.data.options;
    const colors = this.data.colors;
    const canvasSize = this.data.canvasSize;
    if (!options || options.length === 0 || !canvasSize) return;

    let ctx: any;
    try {
      ctx = wx.createCanvasContext('wheelCanvas', this);
    } catch (e) {
      setTimeout(() => this.drawWheelAtAngle(rotateDeg), 100);
      return;
    }

    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    const radius = canvasSize / 2 - 2;   // 留 2px 给外圈白色描边，视觉上完全贴边
    const anglePerSegment = 360 / options.length;
    const fontSize = Math.max(14, Math.floor(canvasSize / 10));
    const rotateRad = rotateDeg * Math.PI / 180;

    options.forEach((option: string, index: number) => {
      const startAngle = (index * anglePerSegment - 90) * Math.PI / 180 + rotateRad;
      const endAngle = ((index + 1) * anglePerSegment - 90) * Math.PI / 180 + rotateRad;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.setFillStyle(colors[index % colors.length]);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + radius * Math.cos(startAngle), centerY + radius * Math.sin(startAngle));
      ctx.setStrokeStyle('rgba(255,255,255,0.5)');
      ctx.setLineWidth(3);
      ctx.stroke();

      const textAngle = startAngle + anglePerSegment * Math.PI / 180 / 2;
      const textRadius = radius * 0.65;
      const textX = centerX + textRadius * Math.cos(textAngle);
      const textY = centerY + textRadius * Math.sin(textAngle);

      ctx.save();
      ctx.translate(textX, textY);
      ctx.rotate(textAngle + Math.PI / 2);
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(fontSize);
      ctx.setTextAlign('center');
      ctx.setTextBaseline('middle');
      ctx.fillText(option, 0, 0, radius * 0.4);
      ctx.restore();
    });

    const centerRadius = Math.max(25, canvasSize / 10);
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI);
    ctx.setFillStyle('#ffffff');
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.setStrokeStyle('rgba(255,255,255,0.4)');
    ctx.setLineWidth(4);
    ctx.stroke();

    ctx.draw();
  },

  onUnload() {
    this.stopAccelerometer();
    // 清理转动定时器，防止页面销毁后仍调用 setData
    const self: any = this;
    if (self._spinTimer) {
      clearInterval(self._spinTimer);
      self._spinTimer = null;
    }
  },

  loadHistory() {
    const stored: any = wx.getStorageSync('wheelHistory');
    if (stored && Array.isArray(stored)) this.setData({ history: stored.slice(0, 20) });
  },

  saveHistory(record: HistoryRecord) {
    const newHistory = [record, ...this.data.history].slice(0, 20);
    this.setData({ history: newHistory });
    wx.setStorageSync('wheelHistory', newHistory);
  },

  toggleSound() {
    this.setData({ soundEnabled: !this.data.soundEnabled });
    wx.showToast({ title: this.data.soundEnabled ? '🔊 音效已开启' : '🔇 音效已关闭', icon: 'none' });
  },

  startAccelerometer() {
    this.stopAccelerometer();
    _private.accelerometerChange = (res: any) => {
      const { x, y, z } = res;
      if (!_private.lastAccel) { _private.lastAccel = { x, y, z }; return; }
      const delta = Math.abs(x - _private.lastAccel.x) + Math.abs(y - _private.lastAccel.y) + Math.abs(z - _private.lastAccel.z);
      if (delta > 2.0 && this.data.shakeEnabled && !this.data.isSpinning) {
        this.startSpin();
        this.setData({ shakeEnabled: false });
        setTimeout(() => this.setData({ shakeEnabled: true }), 5000);
      }
      _private.lastAccel = { x, y, z };
    };
    wx.onAccelerometerChange(_private.accelerometerChange);
    wx.startAccelerometer({ interval: 'ui' });
  },

  stopAccelerometer() {
    if (_private.accelerometerChange) {
      wx.offAccelerometerChange(_private.accelerometerChange);
      wx.stopAccelerometer();
      _private.accelerometerChange = null;
    }
  },

  onInput(e: any) {
    const text = e.detail.value;
    this.setData({ inputText: text });
    if (text.trim()) {
      const options = text.split(/[,，、]/).filter((item: string) => item.trim());
      if (options.length >= 1) {
        this.setData({ options }, () => this.drawWheelAtAngle(this.data.rotateDeg));
      }
    }
  },

  startSpin() {
    if (this.data.isSpinning) return;

    let options = [...this.data.options];

    if (this.data.inputText.trim()) {
      const parsed = this.data.inputText.split(/[,，、]/).filter(item => item.trim());
      if (parsed.length < 2) {
        wx.showToast({ title: '至少需要2个选项哦～', icon: 'none' });
        return;
      }
      this.setData({ inputText: '', options: parsed }, () => {
        this.drawWheelAtAngle(this.data.rotateDeg);
        this.executeSpin(parsed);
      });
      return;
    }

    if (options.length === 0) {
      wx.showToast({ title: '请先输入选项', icon: 'none' });
      return;
    }

    this.executeSpin(options);
  },

  executeSpin(options: string[]) {
    // ✅ 仅有“转”操作振动
    wx.vibrateShort({ type: 'heavy' });

    const len = options.length;
    const sectorDeg = 360 / len;
    const randomIndex = Math.floor(Math.random() * len);

    // 🔧 核心修正：让指针落到扇区中心偏后 2% 的位置，彻底告别交界处
    const offsetFactor = 0.52; // 比中心 0.5 稍大，避开边界线
    const remainder = (360 - (randomIndex * sectorDeg + sectorDeg * offsetFactor)) % 360;

    const curDeg = this.data.rotateDeg;
    const minTarget = curDeg + 360 * 5;
    let targetDeg = minTarget - (minTarget % 360) + remainder;
    if (targetDeg < minTarget) targetDeg += 360;

    const duration = Math.max(3, Math.min(5, 3 + options.length * 0.2)) * 1000;
    const startTime = Date.now();
    const startDeg = curDeg;
    const totalDeg = targetDeg - startDeg;

    const self: any = this;
    if (self._spinTimer) clearInterval(self._spinTimer);

    self._spinTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        clearInterval(self._spinTimer);
        self._spinTimer = null;

        // 最终帧锁定在目标余角
        this.drawWheelAtAngle(targetDeg % 360);
        this.setData({ rotateDeg: targetDeg, isSpinning: false }, () => {
          this.showResultAndSave(options[randomIndex], options, targetDeg);
        });
        return;
      }

      const progress = elapsed / duration;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentDeg = startDeg + totalDeg * easeOut;
      this.drawWheelAtAngle(currentDeg % 360);
      this.data.rotateDeg = currentDeg;
    }, 1000 / 60);

    this.setData({ isSpinning: true, showResult: false, result: '' });
  },

  showResultAndSave(resultText: string, options: string[], finalAngle: number) {
    wx.vibrateShort({ type: 'medium' });

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    // 检测是否为自定义输入（非预设模板）
    const presetAllOptions = Object.values(PRESETS).flatMap(p => p.options);
    const isCustom = !options.every(o => presetAllOptions.includes(o)) || options.length !== 6;
    const record: HistoryRecord = {
      choices: options.join('、'),
      result: resultText,
      time: timeStr,
      date: now.toLocaleDateString(),
      timestamp: now.getTime(),
      optionsCount: options.length,
      isCustom,
    };
    this.saveHistory(record);

    this.setData({ result: resultText, showResult: true }, () => {
      // 最终永远停在目标角度，绝不跳回初始
      this.drawWheelAtAngle(finalAngle % 360);
    });

    const messages = ['天意如此！', '就决定是它了！', '命运的选择！', '别纠结了，冲！', '听天由命吧～'];
    wx.showToast({ title: messages[Math.floor(Math.random() * messages.length)], icon: 'none', duration: 2000 });
  },

  resetAll() {
    this.setData({
      options: PRESETS.lunch.options.slice(0, 6),
      result: '',
      showResult: false,
      inputText: '',
      rotateDeg: 0,
    }, () => this.drawWheelAtAngle(0));
    wx.showToast({ title: '已重置为默认选项', icon: 'none' });
  },

  usePreset(e: any) {
    const type = e.currentTarget.dataset.type;
    const preset = PRESETS[type];
    if (preset) {
      const paletteIndex = Math.floor(Math.random() * COLOR_PALETTES.length);
      this.setData({
        options: preset.options,
        result: '',
        showResult: false,
        inputText: '',
        colors: COLOR_PALETTES[paletteIndex],
        colorPaletteIndex: paletteIndex,
      }, () => this.drawWheelAtAngle(this.data.rotateDeg));
      wx.showToast({ title: `已切换：${preset.emoji} ${preset.name}`, icon: 'none' });
    }
  },

  onTitleTap() {
    const now = Date.now();
    if (now - this.data.lastTapTime < 300) {
      const themeKeys: any[] = Object.keys(THEMES);
      const currentIndex = themeKeys.indexOf(this.data.theme);
      const nextIndex = (currentIndex + 1) % themeKeys.length;
      const nextTheme = themeKeys[nextIndex];
      this.setData({ theme: nextTheme, lastTapTime: 0 });
      saveTheme(nextTheme);  // 持久化，同步到所有页面
      wx.showToast({ title: THEMES[nextTheme].name, icon: 'none' });
    } else {
      this.setData({ lastTapTime: now });
    }
  },

  copyResult() {
    if (this.data.result) {
      wx.setClipboardData({ data: this.data.result, success: () => wx.showToast({ title: '已复制结果～', icon: 'success' }) });
    }
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

  useHistory(e: any) {
    const record: HistoryRecord = e.currentTarget.dataset.record;
    const options = record.choices.split('、');
    this.setData({ options, result: '', showResult: false, inputText: '' }, () => this.drawWheelAtAngle(this.data.rotateDeg));
    wx.showToast({ title: '已恢复选项，点转！', icon: 'none' });
    this.toggleHistory();
  },

  deleteHistory(e: any) {
    if (e.stopPropagation) e.stopPropagation();
    const index = e.currentTarget.dataset.index;
    const newHistory = [...this.data.history];
    newHistory.splice(index, 1);
    this.setData({ history: newHistory });
    wx.setStorageSync('wheelHistory', newHistory);
  },

  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [], showHistory: false });
          wx.removeStorageSync('wheelHistory');
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  closeGuide() {
    this.setData({ showGuide: false });
    wx.setStorageSync('hasUsedWheel', true);
  },

  changeColors() {
    const nextIndex = (this.data.colorPaletteIndex + 1) % COLOR_PALETTES.length;
    this.setData({ colors: COLOR_PALETTES[nextIndex], colorPaletteIndex: nextIndex }, () => this.drawWheelAtAngle(this.data.rotateDeg));
  },
});