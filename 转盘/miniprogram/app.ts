// app.ts
App<IAppOption>({
  globalData: {
    cloudReady: false,
    userId: '',
    nickname: '',
  },
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-3gkbh0gv4d2317e2',  // 替换为你的云环境 ID
        traceUser: true,
      });
      this.globalData.cloudReady = true;
    }

    // 读取本地昵称
    const nickname = wx.getStorageSync('userNickname') || '';
    if (nickname) this.globalData.nickname = nickname;

    // 登录
    wx.login({
      success: res => {
        console.log(res.code)
      },
    });
  },
})