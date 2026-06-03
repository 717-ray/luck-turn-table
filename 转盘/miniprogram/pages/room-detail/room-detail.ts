// pages/room-detail/room-detail.ts
import { loadTheme } from '../../utils/theme';

interface RoomData {
  _id: string;
  code: string;
  name: string;
  ownerId: string;
  status: 'waiting' | 'spinning' | 'finished';
  options: { text: string; userId: string; nickname: string }[];
  createdAt: number;
  spinData?: {
    startedAt: number;
    duration: number;
    resultIndex: number;
    finalAngle: number;
  };
  result?: string;
}

interface SpinState {
  resultIndex: number;
  finalAngle: number;
  isSpinning: boolean;
  result: string;
  showResult: boolean;
  rotateDeg: number;
}

const COLOR_PALETTES = [
  ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#845ef7', '#ff6b6b', '#ffd93d'],
  ['#feca57', '#ff9f43', '#ee5a24', '#ff4757', '#ff6b6b', '#feca57'],
  ['#00d2d3', '#54a0ff', '#5f27cd', '#c23616', '#e84393', '#00d2d3'],
  ['#10ac84', '#1dd1a1', '#ffeaa7', '#fab1a0', '#e17055', '#10ac84'],
];

const EMOJI_POOL = ['🍕', '🍔', '🌮', '🍜', '🍣', '🥩', '🍲', '🥟', '🍰', '🍩'];

const _private: Record<string, any> = {
  pollTimer: null,
  spinTimer: null,
  canvas: null,
  canvasCtx: null,
  canvasReady: false,
};

Page({
  data: {
    theme: 'sakura',
    roomId: '',
    room: null,
    code: '',
    roomName: '',
    status: 'waiting',

    // 用户
    userId: '',
    nickname: '',
    isOwner: false,
    showNameModal: true,

    // 选项提交
    myVote: '',
    myVoteSubmitted: false,

    // 选项emoji
    optionEmojis: <string[]>[],

    // 转盘
    options: <string[]>[],
    optionUsers: <{ text: string; nickname: string }[]>[],  // 每个选项的提交者信息
    colors: COLOR_PALETTES[0],
    colorPaletteIndex: 0,
    canvasSize: 300,

    // 转动状态
    isSpinning: false,
    result: '',
    showResult: false,
    rotateDeg: 0,

    // 成员
    members: <string[]>[],
  },

  async onLoad(query: any) {
    const theme = loadTheme();
    const roomId = query.roomId || '';
    const code = query.code || '';
    const sharedName = query.name ? decodeURIComponent(query.name) : '';

    if (!roomId && !code) {
      wx.showToast({ title: '缺少组队参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 生成用户ID
    let userId = wx.getStorageSync('userId');
    if (!userId) {
      userId = `u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      wx.setStorageSync('userId', userId);
    }
    const nickname = wx.getStorageSync('userNickname') || '';

    this.setData({
      theme,
      roomId,
      code,
      // 分享链接带来的房间名，作为加载失败时的兜底
      roomName: sharedName,
      userId,
      nickname,
      showNameModal: !nickname,
    });

    // 获取 canvas 尺寸
    const sysInfo = wx.getSystemInfoSync();
    const canvasSize = Math.min(sysInfo.windowWidth - 60, 280);
    this.setData({ canvasSize });

    if (code) {
      await this.loadRoomByCode(code);
    }
    // code 没找到则尝试 roomId
    if (!this.data.room && roomId) {
      this.setData({ roomId });
      await this.loadRoomById(roomId);
    }
    // 都找不到 — 不立即报错，等用户在昵称弹窗确认后再重试
  },

  onReady() {
    this.initCanvas();
  },

  onShow() {
    this.setData({ theme: loadTheme() });
  },

  onUnload() {
    this.stopPolling();
    this.stopSpinAnimation();
    _private.canvas = null;
    _private.canvasCtx = null;
    _private.canvasReady = false;
  },

  // ==================== 组队加载 ====================

  /** 通过 _id 加载组队 */
  async loadRoomById(roomId: string) {
    try {
      // 等待云端初始化
      if (!this.isCloudReady()) {
        await this.waitForCloud(3000);
      }

      if (!this.isCloudReady()) return this.fallbackLoadRoom(roomId);

      const db = wx.cloud.database();
      const res = await db.collection('rooms').doc(roomId).get();
      const room: RoomData = res.data;
      this.onRoomLoaded(room);
      this.startPolling(roomId);
    } catch (e) {
      console.error('加载组队失败', e);
      this.fallbackLoadRoom(roomId);
    }
  },

  /** 通过组队码加载组队 */
  async loadRoomByCode(code: string) {
    let room: RoomData | undefined;
    let fromCloud = false;

    // 1. 等待云端初始化（最多等 3 秒）
    if (!this.isCloudReady()) {
      await this.waitForCloud(3000);
    }

    // 2. 查云端
    if (this.isCloudReady()) {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('rooms').where({ code }).get();
        if (res.data.length > 0) {
          room = res.data[0];
          fromCloud = true;
        }
      } catch (e) {
        console.warn('云端查询失败，尝试本地', e);
      }
    }

    // 3. 云端没找到则查本地
    if (!room) {
      const localRooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
      room = localRooms.find(r => r.code === code);
    }

    if (!room) {
      // 不立即报错，让 onLoad 尝试 roomId 加载
      return;
    }

    this.setData({ roomId: room._id });
    this.onRoomLoaded(room);
    if (fromCloud) {
      this.startPolling(room._id);
    } else {
      this.startLocalPolling(room._id);
    }
  },

  /** 等待云端初始化 */
  waitForCloud(timeout: number): Promise<void> {
    if (this.isCloudReady()) return Promise.resolve();
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (this.isCloudReady() || Date.now() - start >= timeout) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  },

  /** 本地兜底 */
  fallbackLoadRoom(roomId: string) {
    const rooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
    const room = rooms.find(r => r._id === roomId);
    if (room) {
      this.onRoomLoaded(room);
      this.startLocalPolling(roomId);
    }
  },

  // ==================== 组队加载回调 ====================

  onRoomLoaded(room: RoomData) {
    // 深拷贝防止与 local_rooms 共享引用，避免误判"已提交"
    const safeRoom: RoomData = JSON.parse(JSON.stringify(room));
    const optionTexts = safeRoom.options.map(o => o.text);
    const optionUsers = safeRoom.options.map(o => ({ text: o.text, nickname: o.nickname }));
    const isOwner = safeRoom.ownerId === this.data.userId;
    const members = [...new Set(safeRoom.options.map(o => o.nickname))];
    const optionEmojis = optionTexts.map(() => EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]);

    // 检查当前用户是否已提交过
    const myVoteSubmitted = safeRoom.options.some(o => o.userId === this.data.userId);

    this.setData({
      room: safeRoom,
      code: safeRoom.code,
      roomName: safeRoom.name,
      status: safeRoom.status,
      options: optionTexts,
      optionUsers,
      isOwner,
      members,
      optionEmojis,
      myVoteSubmitted,
    }, () => this.drawWheelStatic());

    // 如果已经在转动中，加入同步动画
    if (safeRoom.status === 'spinning' && safeRoom.spinData) {
      this.joinOngoingSpin(safeRoom.spinData);
    }
    // 如果已完成，显示结果
    if (safeRoom.status === 'finished' && safeRoom.spinData) {
      this.showFinalResult(safeRoom.spinData);
    }
  },

  // ==================== 轮询同步 ====================

  isCloudReady(): boolean {
    const app = getApp<IAppOption>();
    return !!(app.globalData && app.globalData.cloudReady);
  },

  startPolling(roomId: string) {
    this.stopPolling();
    _private.pollTimer = setInterval(async () => {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('rooms').doc(roomId).get();
        const room: RoomData = res.data;
        this.syncRoomState(room);
      } catch (e) {
        // 忽略轮询错误
      }
    }, 1500);
  },

  startLocalPolling(roomId: string) {
    this.stopPolling();
    _private.pollTimer = setInterval(() => {
      const rooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
      const room = rooms.find(r => r._id === roomId);
      if (room) this.syncRoomState(room);
    }, 1500);
  },

  stopPolling() {
    if (_private.pollTimer) {
      clearInterval(_private.pollTimer);
      _private.pollTimer = null;
    }
  },

  syncRoomState(room: RoomData) {
    // 深拷贝防止引用污染
    const safeRoom: RoomData = JSON.parse(JSON.stringify(room));
    const options = safeRoom.options;
    const status = safeRoom.status;
    const spinData = safeRoom.spinData;
    const optionTexts = options.map(o => o.text);
    const optionUsers = options.map(o => ({ text: o.text, nickname: o.nickname }));
    const members = [...new Set(options.map(o => o.nickname))];
    const optionEmojis = optionTexts.map(
      (_, i) => this.data.optionEmojis[i] || EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]
    );

    // 选项变化时重绘
    const prevLen = this.data.options.length;
    const newLen = optionTexts.length;
    const myVoteSubmitted = safeRoom.options.some(o => o.userId === this.data.userId);

    this.setData({
      room: safeRoom,
      options: optionTexts,
      optionUsers,
      status,
      members,
      optionEmojis,
      myVoteSubmitted,
    });

    if (newLen !== prevLen && status === 'waiting') {
      this.drawWheelStatic();
    }

    // 检测到开始转动
    if (status === 'spinning' && spinData && !this.data.isSpinning) {
      this.joinOngoingSpin(spinData);
    }

    // 检测到已完成
    if (status === 'finished' && spinData && this.data.isSpinning) {
      this.stopSpinAnimation();
      this.showFinalResult(spinData);
    }
  },

  // ==================== 轮盘绘制 ====================

  /** 初始化 Canvas 2D 上下文 */
  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#roomWheelCanvas')
      .fields({ node: true, size: true })
      .exec((res: any) => {
        if (!res || !res[0] || !res[0].node) {
          // 组件尚未渲染，稍后重试
          setTimeout(() => this.initCanvas(), 200);
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const canvasSize = this.data.canvasSize;
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = canvasSize * dpr;
        canvas.height = canvasSize * dpr;
        ctx.scale(dpr, dpr);

        _private.canvas = canvas;
        _private.canvasCtx = ctx;
        _private.canvasReady = true;

        // 如果已有选项数据，立即绘制
        if (this.data.options.length > 0) {
          this.drawWheelStatic();
        }
      });
  },

  /** 静态绘制转盘（Canvas 2D API） */
  drawWheelStatic(rotateDeg: number = 0) {
    const options = this.data.options;
    const colors = this.data.colors;
    const canvasSize = this.data.canvasSize;
    if (!options || options.length === 0 || !canvasSize) return;

    // 等 canvas 就绪
    if (!_private.canvasReady || !_private.canvasCtx) {
      setTimeout(() => this.drawWheelStatic(rotateDeg), 100);
      return;
    }

    const ctx = _private.canvasCtx;
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    const radius = canvasSize / 2 - 2;
    const anglePerSegment = 360 / options.length;
    const fontSize = Math.max(13, Math.floor(canvasSize / 12));
    const rotateRad = rotateDeg * Math.PI / 180;

    // 清空画布
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    options.forEach((option: string, index: number) => {
      const startAngle = (index * anglePerSegment - 90) * Math.PI / 180 + rotateRad;
      const endAngle = ((index + 1) * anglePerSegment - 90) * Math.PI / 180 + rotateRad;

      // 扇形色块
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();

      // 分割线
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + radius * Math.cos(startAngle),
        centerY + radius * Math.sin(startAngle)
      );
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 文字
      ctx.save();
      const textAngle = startAngle + (anglePerSegment * Math.PI) / 180 / 2;
      const textRadius = radius * 0.62;
      const textX = centerX + textRadius * Math.cos(textAngle);
      const textY = centerY + textRadius * Math.sin(textAngle);

      ctx.translate(textX, textY);
      ctx.rotate(textAngle + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 描边增强可读性
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = fontSize / 8;
      const displayText = option.length > 6 ? option.substring(0, 5) + '…' : option;
      ctx.strokeText(displayText, 0, 0);
      ctx.fillText(displayText, 0, 0);
      ctx.restore();
    });

    // 中心圆
    const centerR = Math.max(20, canvasSize / 12);
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerR, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 外圈描边
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
  },

  // ==================== 换色 ====================

  changeColors() {
    const nextIndex = (this.data.colorPaletteIndex + 1) % COLOR_PALETTES.length;
    this.setData(
      { colors: COLOR_PALETTES[nextIndex], colorPaletteIndex: nextIndex },
      () => this.drawWheelStatic()
    );
  },

  // ==================== 同步转动动画 ====================

  joinOngoingSpin(spinData: { startedAt: number; duration: number; resultIndex: number; finalAngle: number }) {
    const now = Date.now();
    const elapsed = now - spinData.startedAt;
    const remaining = spinData.duration - elapsed;

    if (remaining <= 0) {
      // 已经转完了，直接显示结果
      this.showFinalResult(spinData);
      return;
    }

    // 总旋转角度（5圈 + 指定角度）
    const totalDeg = 360 * 5 + spinData.finalAngle;
    const startDeg = (totalDeg * (elapsed / spinData.duration)) % 360;
    const targetDeg = startDeg + totalDeg * (remaining / spinData.duration);

    this.setData({ isSpinning: true, showResult: false, result: '' });

    const startTime = now;
    const animStart = startDeg;

    this.stopSpinAnimation();
    _private.spinTimer = setInterval(() => {
      const now2 = Date.now();
      const e = now2 - startTime;
      if (e >= remaining) {
        if (_private.spinTimer) {
          clearInterval(_private.spinTimer);
          _private.spinTimer = null;
        }
        this.showFinalResult(spinData);
        return;
      }
      const progress = e / remaining;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const curDeg = animStart + (targetDeg - animStart) * easeOut;
      this.drawWheelStatic(curDeg % 360);
      this.data.rotateDeg = curDeg;
    }, 1000 / 60);
  },

  showFinalResult(spinData: { resultIndex: number; finalAngle: number }) {
    const options = this.data.options;
    const result = options[spinData.resultIndex] || '?';
    this.setData({
      isSpinning: false,
      result,
      showResult: true,
    });
    this.drawWheelStatic(spinData.finalAngle % 360);
  },

  stopSpinAnimation() {
    if (_private.spinTimer) {
      clearInterval(_private.spinTimer);
      _private.spinTimer = null;
    }
  },

  // ==================== 用户操作 ====================

  /** 设置昵称 */
  onNameConfirm() {
    const name = this.data.nickname.trim();
    if (!name) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    wx.setStorageSync('userNickname', name);
    // 先关闭键盘，再隐藏弹窗
    wx.hideKeyboard();
    this.setData({ showNameModal: false });
    // 加入组队 — 如果房间没有加载成功，重试加载
    this.addMeToRoom();
  },

  onNameInput(e: any) {
    this.setData({ nickname: e.detail.value });
  },

  /** 加入到组队的成员列表 */
  async addMeToRoom() {
    // 如果房间已在 onLoad 期间加载成功，无需重试
    if (this.data.room) return;

    // 否则重试加载（可能是数据库权限问题导致 onLoad 阶段失败）
    wx.showLoading({ title: '加载组队…' });
    const { roomId, code } = this.data;

    if (code) {
      await this.loadRoomByCode(code);
    }
    if (!this.data.room && roomId) {
      this.setData({ roomId });
      await this.loadRoomById(roomId);
    }

    wx.hideLoading();

    if (!this.data.room) {
      wx.showToast({ title: '组队加载失败，请房主检查网络', icon: 'none', duration: 3000 });
    }
  },

  /** 输入我的选项 */
  onVoteInput(e: any) {
    this.setData({ myVote: e.detail.value });
  },

  /** 提交我的选项 */
  async submitVote() {
    const text = this.data.myVote.trim();
    if (!text) {
      wx.showToast({ title: '请输入你的选项', icon: 'none' });
      return;
    }

    // 如果房间数据未加载，提示重试
    if (!this.data.room) {
      wx.showToast({ title: '组队数据未加载，请稍后重试', icon: 'none' });
      return;
    }

    if (this.data.status !== 'waiting') {
      wx.showToast({ title: '组队已开始转动', icon: 'none' });
      return;
    }

    // 检查是否已经提交过（本地标记 + 房间数据双重校验）
    if (this.data.myVoteSubmitted) {
      wx.showToast({ title: '你已经提交过了', icon: 'none' });
      return;
    }
    const room = this.data.room;
    const options = (room && room.options) || [];
    const alreadyVoted = options.some(o => o.userId === this.data.userId);
    if (alreadyVoted) {
      this.setData({ myVoteSubmitted: true });
      wx.showToast({ title: '你已经提交过了', icon: 'none' });
      return;
    }

    const newOption = {
      text,
      userId: this.data.userId,
      nickname: this.data.nickname,
    };

    try {
      if (this.isCloudReady()) {
        try {
          const db = wx.cloud.database();
          await db.collection('rooms').doc(this.data.roomId).update({
            data: {
              options: db.command.push([newOption]),
            },
          });
        } catch (cloudErr) {
          console.warn('云端提交失败，使用本地存储', cloudErr);
          this.saveVoteToLocal(newOption);
        }
      } else {
        this.saveVoteToLocal(newOption);
      }

      // 立即更新本地状态
      const newOptions = [...this.data.options, text];
      const newOptionUsers = [...this.data.optionUsers, { text, nickname: this.data.nickname }];
      const newMembers = [...new Set([...this.data.members, this.data.nickname])];
      const newEmoji = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
      this.setData({
        options: newOptions,
        optionUsers: newOptionUsers,
        members: newMembers,
        optionEmojis: [...this.data.optionEmojis, newEmoji],
        myVote: '',
        myVoteSubmitted: true,
      }, () => this.drawWheelStatic());

      wx.showToast({ title: '提交成功！', icon: 'success' });
      wx.vibrateShort({ type: 'light' });
    } catch (e) {
      console.error('提交失败', e);
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },

  /** 房主：开转！ */
  async startRoomSpin() {
    if (this.data.status !== 'waiting') return;
    const options = this.data.options;
    if (options.length < 2) {
      wx.showToast({ title: '至少需要2个选项', icon: 'none' });
      return;
    }

    // 计算转动数据
    const len = options.length;
    const sectorDeg = 360 / len;
    const randomIndex = Math.floor(Math.random() * len);
    const offsetFactor = 0.52;
    const remainder = (360 - (randomIndex * sectorDeg + sectorDeg * offsetFactor)) % 360;
    const duration = Math.max(3000, Math.min(5000, 3000 + len * 200));

    const spinData = {
      startedAt: Date.now(),
      duration,
      resultIndex: randomIndex,
      finalAngle: remainder,
    };

    wx.vibrateShort({ type: 'heavy' });

    // 写入存储（云端优先，失败回退本地）
    if (this.isCloudReady()) {
      try {
        const db = wx.cloud.database();
        await db.collection('rooms').doc(this.data.roomId).update({
          data: { status: 'spinning', spinData },
        });
      } catch (cloudErr) {
        console.warn('云端更新失败，回退本地存储', cloudErr);
        this.saveSpinToLocal(spinData);
      }
    } else {
      this.saveSpinToLocal(spinData);
    }

    // 启动本地动画
    this.setData({ status: 'spinning' });
    this.executeLocalSpin(spinData);

    // 延迟标记完成
    setTimeout(() => this.markAsFinished(spinData), duration + 500);
  },

  /** 本地执行转动动画 */
  executeLocalSpin(spinData: { startedAt: number; duration: number; resultIndex: number; finalAngle: number }) {
    const totalDeg = 360 * 5 + spinData.finalAngle;
    const startTime = Date.now();
    const startDeg = this.data.rotateDeg;

    this.setData({ isSpinning: true, showResult: false, result: '' });
    this.stopSpinAnimation();

    _private.spinTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= spinData.duration) {
        if (_private.spinTimer) {
          clearInterval(_private.spinTimer);
          _private.spinTimer = null;
        }
        this.showFinalResult(spinData);
        return;
      }
      const progress = elapsed / spinData.duration;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const curDeg = startDeg + totalDeg * easeOut;
      this.drawWheelStatic(curDeg % 360);
      this.data.rotateDeg = curDeg;
    }, 1000 / 60);
  },

  /** 选项写入本地存储（兜底） */
  saveVoteToLocal(newOption: { text: string; userId: string; nickname: string }) {
    const rooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
    const idx = rooms.findIndex(r => r._id === this.data.roomId);
    if (idx > -1) {
      rooms[idx].options.push(newOption);
      wx.setStorageSync('local_rooms', rooms);
    }
  },

  /** 开转数据写入本地存储（兜底） */
  saveSpinToLocal(spinData: any) {
    const rooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
    const idx = rooms.findIndex(r => r._id === this.data.roomId);
    if (idx > -1) {
      rooms[idx].status = 'spinning';
      rooms[idx].spinData = spinData;
      wx.setStorageSync('local_rooms', rooms);
    }
  },

  /** 标记转动完成 */
  async markAsFinished(spinData: any) {
    const result = this.data.options[spinData.resultIndex] || '?';
    if (this.isCloudReady()) {
      try {
        const db = wx.cloud.database();
        await db.collection('rooms').doc(this.data.roomId).update({
          data: { status: 'finished', result, spinData },
        });
      } catch (cloudErr) {
        console.warn('云端标记完成失败，使用本地', cloudErr);
        this.saveFinishedToLocal(spinData, result);
      }
    } else {
      this.saveFinishedToLocal(spinData, result);
    }
  },

  /** 完成结果写入本地存储（兜底） */
  saveFinishedToLocal(spinData: any, result: string) {
    const rooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
    const idx = rooms.findIndex(r => r._id === this.data.roomId);
    if (idx > -1) {
      rooms[idx].status = 'finished';
      rooms[idx].result = result;
      rooms[idx].spinData = spinData;
      wx.setStorageSync('local_rooms', rooms);
    }
  },

  // ==================== 分享 ====================

  onShareAppMessage() {
    const { code, roomName, roomId } = this.data;
    const encodedName = encodeURIComponent(roomName);
    return {
      title: `🎯 ${roomName} - 来一起决定吃什么！`,
      path: `/pages/room-detail/room-detail?code=${code}&roomId=${roomId}&name=${encodedName}`,
      imageUrl: '',
    };
  },

  /** 再来一局：重置状态 */
  async resetRoomSpin() {
    wx.showModal({
      title: '再来一局',
      content: '确定重新开始吗？之前的选项将被清空。',
      confirmText: '开始',
      success: async (res) => {
        if (!res.confirm) return;
        wx.vibrateShort({ type: 'medium' });

        // 写入存储
        const resetData = { status: 'waiting', result: '', spinData: null };
        if (this.isCloudReady()) {
          try {
            const db = wx.cloud.database();
            await db.collection('rooms').doc(this.data.roomId).update({ data: resetData });
          } catch (e) {
            this.saveResetToLocal();
          }
        } else {
          this.saveResetToLocal();
        }

        // 更新本地状态
        this.setData({
          status: 'waiting',
          options: <string[]>[],
          optionUsers: <{ text: string; nickname: string }[]>[],
          optionEmojis: <string[]>[],
          members: <string[]>[],
          isSpinning: false,
          showResult: false,
          result: '',
          rotateDeg: 0,
          myVoteSubmitted: false,
        }, () => this.drawWheelStatic());

        // 重新开始本地轮询
        if (!this.isCloudReady() || !this.data.roomId) {
          this.startLocalPolling(this.data.roomId);
        }
      },
    });
  },

  /** 重置写入本地存储 */
  saveResetToLocal() {
    const rooms: RoomData[] = wx.getStorageSync('local_rooms') || [];
    const idx = rooms.findIndex(r => r._id === this.data.roomId);
    if (idx > -1) {
      rooms[idx].status = 'waiting';
      rooms[idx].result = '';
      delete rooms[idx].spinData;
      rooms[idx].options = [];
      wx.setStorageSync('local_rooms', rooms);
    }
  },

  /** 离开组队 */
  leaveRoom() {
    wx.showModal({
      title: '离开组队',
      content: '确定要离开当前组队吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      },
    });
  },
});
