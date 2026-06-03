interface AnnualRecord {
  date: string;
  result: string;
  choices: string;
}

Page({
  data: {
    currentYear: new Date().getFullYear(),
    annualStats: {
      totalSpins: 0,
      mostChosen: '',
      choiceCount: {} as Record<string, number>,
    },
    monthlyData: [] as { month: string; count: number }[],
    yearlyRecords: [] as AnnualRecord[],
    topChoices: [] as { choice: string; count: number }[],
  },

  onLoad() {
    this.setData({ currentYear: new Date().getFullYear() });
    this.calculateAnnualStats();
  },

  calculateAnnualStats() {
    const history = (wx.getStorageSync('wheelHistory') || []) as AnnualRecord[];
    const currentYear = new Date().getFullYear();
    
    // 筛选今年记录
    const yearlyRecords = history.filter(record => {
      return record.date && record.date.includes(String(currentYear));
    });

    // 统计每个选项被选中的次数
    const choiceCount: Record<string, number> = {};
    yearlyRecords.forEach(record => {
      const result = record.result;
      if (result) {
        choiceCount[result] = (choiceCount[result] || 0) + 1;
      }
    });

    // 找出最常被选中的选项
    let mostChosen = '';
    let maxCount = 0;
    Object.entries(choiceCount).forEach(([choice, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostChosen = choice;
      }
    });

    // 按月统计
    const monthlyMap: Record<string, number> = {};
    yearlyRecords.forEach(record => {
      if (record.date) {
        const month = record.date.substring(0, 7); // YYYY-MM
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
      }
    });

    const monthlyData = Object.entries(monthlyMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 排行前10的选择
    const topChoices = Object.entries(choiceCount)
      .map(([choice, count]) => ({ choice, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    this.setData({
      annualStats: {
        totalSpins: yearlyRecords.length,
        mostChosen,
        choiceCount,
      },
      monthlyData,
      yearlyRecords: yearlyRecords.slice(0, 50),
      topChoices,
    });
  },
});
