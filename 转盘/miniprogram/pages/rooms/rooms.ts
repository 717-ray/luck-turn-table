// pages/rooms/rooms.ts — 年度/月度命运报告
import { loadTheme } from '../../utils/theme';

interface HistoryRecord {
  choices: string;
  result: string;
  time: string;
  date: string;
  timestamp: number;
  optionsCount: number;
  isCustom: boolean;
}

interface MonthlySummary {
  month: number;
  label: string;
  total: number;
  topResult: string;
  topCount: number;
  avgOptions: number;
  barWidth: number;
  barHeight: number;
}

interface ReportData {
  year: number;
  month?: number;
  isAnnual: boolean;
  totalSpins: number;
  mostActiveDay: { date: string; count: number };
  mostChosenResult: { text: string; count: number };
  leastChosenResult: { text: string; count: number };
  giveUpRate: number;
  giveUpRatePercent: string;
  giveUpCount: number;
  avgOptionsPerSpin: number;
  avgOptionsPerSpinStr: string;
  totalDays: number;
  firstSpinDate: string;
  lastSpinDate: string;
  title: string;
  subtitle: string;
  monthlySummary: MonthlySummary[];
  // 纠结指数
  mostIndecisiveDay: { date: string; count: number };
  // 热门选项排行
  topResults: { text: string; count: number; percentWidth: number }[];
}

/** 放弃类关键词 */
const GIVE_UP_KEYWORDS = ['算了', '躺平', '放弃', '不看', '睡觉', '不要', 'No', 'NO', 'pass', 'Pass', '跳过', '不了'];

/** 称号系统 */
function getTitle(data: ReportData): { title: string; subtitle: string } {
  const { totalSpins, giveUpRate, mostChosenResult, avgOptionsPerSpin } = data;

  // 纠结之王：多次转盘 + 高放弃率
  if (totalSpins >= 30 && giveUpRate >= 0.3) {
    return { title: '👑 纠结之王', subtitle: `你放弃了 ${(giveUpRate * 100).toFixed(0)}% 的选择，堪称天选纠结人` };
  }

  // 选择困难症：频繁转盘
  if (totalSpins >= 50) {
    return { title: '🤯 选择困难症晚期', subtitle: `平均每转 ${avgOptionsPerSpin.toFixed(0)} 个选项，什么都想选` };
  }

  // 天意信徒：高频率
  if (totalSpins >= 20) {
    return { title: '🙏 天意信徒', subtitle: `把人生交给命运，也是一种智慧` };
  }

  // 专一狂魔：某个结果占比极高
  if (mostChosenResult.count / totalSpins >= 0.4) {
    return { title: '💘 专一狂魔', subtitle: `你对「${mostChosenResult.text}」情有独钟` };
  }

  // 佛系选手
  if (giveUpRate >= 0.25) {
    return { title: '😌 佛系选手', subtitle: '随缘吧，反正天意自有安排' };
  }

  // 吃货/玩家
  if (mostChosenResult.text.length <= 4) {
    return { title: '🍽️ 资深美食家', subtitle: `最爱「${mostChosenResult.text}」，味蕾从不骗人` };
  }

  // 默认
  return { title: '🎯 命运玩家', subtitle: '每一次转动，都是与命运的一次握手' };
}

Page({
  data: {
    theme: 'sakura',
    report: null,
    viewMode: 'annual',
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    hasData: false,
    loading: true,
  },

  onLoad() {
    this.setData({ theme: loadTheme() });
  },

  onShow() {
    this.setData({ theme: loadTheme() });
    this.generateReport();
  },

  /** 生成报告 */
  generateReport() {
    this.setData({ loading: true });

    const raw: HistoryRecord[] = wx.getStorageSync('wheelHistory') || [];
    const allRecords = raw.filter(r => r.timestamp);

    if (allRecords.length === 0) {
      this.setData({ hasData: false, loading: false });
      return;
    }

    const isAnnual = this.data.viewMode === 'annual';
    const year = this.data.selectedYear;
    const month = this.data.selectedMonth;

    // 按年/月筛选
    let records = allRecords.filter(r => {
      const d = new Date(r.timestamp);
      if (d.getFullYear() !== year) return false;
      if (!isAnnual && d.getMonth() + 1 !== month) return false;
      return true;
    });

    if (records.length === 0) {
      this.setData({ hasData: false, loading: false });
      return;
    }

    // 统计数据
    const totalSpins = records.length;

    // 按日期统计（找最活跃日和最纠结日）
    const dayMap: Record<string, number> = {};
    records.forEach(r => {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayMap[key] = (dayMap[key] || 0) + 1;
    });
    const dayEntries = Object.entries(dayMap);
    dayEntries.sort((a, b) => b[1] - a[1]);
    const mostActiveDay = {
      date: (dayEntries[0] && dayEntries[0][0]) || '',
      count: (dayEntries[0] && dayEntries[0][1]) || 0
    };
    const mostIndecisiveDay = { date: mostActiveDay.date, count: mostActiveDay.count };

    // 结果统计
    const resultMap: Record<string, number> = {};
    records.forEach(r => {
      const key = r.result;
      resultMap[key] = (resultMap[key] || 0) + 1;
    });
    const resultEntries = Object.entries(resultMap);
    resultEntries.sort((a, b) => b[1] - a[1]);
    const firstEntry = resultEntries[0];
    const lastEntry = resultEntries[resultEntries.length - 1];
    const mostChosenResult = { text: (firstEntry && firstEntry[0]) || '—', count: (firstEntry && firstEntry[1]) || 0 };
    const leastChosenResult = { text: (lastEntry && lastEntry[0]) || '—', count: (lastEntry && lastEntry[1]) || 0 };
    const topResults = resultEntries.slice(0, 5).map(([text, count]) => ({ text, count }));

    // 放弃统计
    const giveUpRecords = records.filter(r =>
      GIVE_UP_KEYWORDS.some(kw => r.result.includes(kw))
    );
    const giveUpCount = giveUpRecords.length;
    const giveUpRate = totalSpins > 0 ? giveUpCount / totalSpins : 0;

    // 平均选项数
    const avgOptionsPerSpin = totalSpins > 0
      ? records.reduce((sum, r) => sum + (r.optionsCount || 0), 0) / totalSpins
      : 0;

    // 日期范围
    const timestamps = records.map(r => r.timestamp).sort((a, b) => a - b);
    const firstSpinDate = new Date(timestamps[0]).toLocaleDateString('zh-CN');
    const lastSpinDate = new Date(timestamps[timestamps.length - 1]).toLocaleDateString('zh-CN');
    const totalDays = timestamps.length > 1
      ? Math.ceil((timestamps[timestamps.length - 1] - timestamps[0]) / 86400000) + 1
      : 1;

    // 月度汇总（仅年度报告需要）
    let monthlySummary: MonthlySummary[] = [];
    if (isAnnual) {
      const monthMap: Record<number, HistoryRecord[]> = {};
      records.forEach(r => {
        const m = new Date(r.timestamp).getMonth() + 1;
        if (!monthMap[m]) monthMap[m] = [];
        monthMap[m].push(r);
      });
      monthlySummary = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const mRecords = monthMap[m] || [];
        const mTotal = mRecords.length;
        // 当月最热门结果
        const mResultMap: Record<string, number> = {};
        mRecords.forEach(r => { mResultMap[r.result] = (mResultMap[r.result] || 0) + 1; });
        const mTop = Object.entries(mResultMap).sort((a, b) => b[1] - a[1])[0];
        const barWidth = totalSpins > 0 && mTotal > 0 ? Math.max(4, Math.round((mTotal / totalSpins) * 100)) : 0;
        const barHeight = Math.max(4, mTotal * 3);
        return {
          month: m,
          label: m + '月',
          total: mTotal,
          topResult: (mTop && mTop[0]) || '—',
          topCount: (mTop && mTop[1]) || 0,
          avgOptions: mTotal > 0 ? mRecords.reduce((s, r) => s + (r.optionsCount || 0), 0) / mTotal : 0,
          barWidth: barWidth,
          barHeight: barHeight,
        };
      });
    }

    // 预计算 WXML 渲染所需的值
    const topResultsWithWidth = topResults.map(item => ({
      ...item,
      percentWidth: totalSpins > 0 ? Math.round((item.count / totalSpins) * 100) : 0,
    }));

    const report: ReportData = {
      year,
      month: isAnnual ? undefined : month,
      isAnnual,
      totalSpins,
      mostActiveDay,
      mostChosenResult,
      leastChosenResult,
      giveUpRate,
      giveUpRatePercent: Math.round(giveUpRate * 100) + '%',
      giveUpCount,
      avgOptionsPerSpin,
      avgOptionsPerSpinStr: avgOptionsPerSpin.toFixed(0),
      totalDays,
      firstSpinDate,
      lastSpinDate,
      title: '',
      subtitle: '',
      monthlySummary,
      mostIndecisiveDay,
      topResults: topResultsWithWidth,
    };

    const titleData = getTitle(report);
    report.title = titleData.title;
    report.subtitle = titleData.subtitle;

    this.setData({ report, hasData: true, loading: false });
  },

  /** 切换年度/月度 */
  switchViewMode(e: any) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.viewMode) return;
    this.setData({ viewMode: mode }, () => this.generateReport());
  },

  /** 年份减 */
  prevYear() {
    if (this.data.selectedYear <= 2020) return;
    this.setData({ selectedYear: this.data.selectedYear - 1 }, () => this.generateReport());
  },

  /** 年份加 */
  nextYear() {
    if (this.data.selectedYear >= new Date().getFullYear()) return;
    this.setData({ selectedYear: this.data.selectedYear + 1 }, () => this.generateReport());
  },

  /** 月份切换 */
  selectMonth(e: any) {
    const m = Number(e.currentTarget.dataset.month);
    this.setData({ selectedMonth: m }, () => this.generateReport());
  },
});
