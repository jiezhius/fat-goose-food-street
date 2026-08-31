/* =========================================================================
   微信小游戏适配层：给 core/game-core.js + core/ui-canvas.js 提供 Platform 接口。
   全部走 wx.* API，没有 document/window。音效第一版是空函数——WebAudio 那套
   合成写法这个环境不保证支持，先不让它卡住主链路，以后单独补（见 README）。

   触摸坐标换算是这一版里最不确定的地方：canvas 铺满整个屏幕，没有 CSS 那层
   缩放可以借，只能自己用 windowWidth/windowHeight 换算成游戏的逻辑坐标系
   （720x1280）。第一次在真机/模拟器里跑，如果瞄准方向不对，大概率就是这里
   要调——不是玄学，照着实际触点位置改这几行换算就行。
   ========================================================================= */

// ==================== 全局错误兜底：出错直接画在屏幕上 ====================
// 小游戏没有 DOM，也没有官方支持的方式能让我（Claude）远程读到控制台报错——
// 查过官方文档确认了：cli auto / miniprogram-automator 这套自动化是给"小程序"
// 设计的，小游戏这边没有等价能力。折中办法：把 wx.onError 捕获到的报错直接
// 画在屏幕上，出问题时你截一张模拟器/真机的图给我，报错文字就在画面里，
// 不用再切到调试控制台去复制文字。注册得越早越好——放在文件最前面，
// 这样后面任何代码（包括下面这段 safeCall、包括 core 的 boot() 全过程）
// 抛出的未捕获异常都能被兜住。只捕获得到"没被 try/catch 吞掉"的错误，
// 这是唯一的局限。
const bootErrors = [];
let errCanvas = null;
function showBootError(msg) {
  msg = String(msg);
  if (bootErrors.includes(msg)) return;   // 同一条错误每帧反复抛，只记一次，别刷屏
  bootErrors.push(msg);
  if (bootErrors.length > 8) bootErrors.shift();
  try {
    // 优先复用游戏正在用的那块画布（这样报错会直接盖住当前画面，最显眼）；
    // 如果 boot() 还没跑到、canvas 变量还没赋值，就自己建一块——
    // wx.createCanvas() 目前观察下来第一次调用返回的就是那块共享屏幕画布。
    const c = (typeof canvas !== 'undefined' && canvas) ? canvas : (errCanvas || (errCanvas = wx.createCanvas()));
    const g = c.getContext('2d');
    const w = c.width || 720, h = c.height || 1280;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#2a1414';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb4b4';
    g.font = '24px monospace';
    g.textBaseline = 'top';
    let y = 30;
    g.fillText('运行时报错（截图发给 Claude）：', 24, y); y += 40;
    bootErrors.forEach(m => {
      (m.match(/.{1,32}/g) || [m]).forEach(line => { g.fillText(line, 24, y); y += 30; });
      y += 16;
    });
  } catch (e) { /* 连错误提示都画不出来，只能认了 */ }
}
wx.onError(res => showBootError((res && res.message) || res));

// wx.getSystemInfoSync() 这几年被拆成了 getWindowInfo/getDeviceInfo/getAppBaseInfo。
// 不再拿它当兜底——它在 jsbridge 还没就绪的这个时间点同步调用，本身就会往控制台
// 打一条 "jsbridge not ready" 的错误（这是 runtime 自己打的日志，不是能 try/catch
// 住的 JS 异常），新 API 已经够用，没必要为了兜底反而制造一条噪音报错。
function safeCall(fn, fallback) {
  try { return (typeof fn === 'function' ? fn() : null) || fallback; }
  catch (e) { return fallback; }
}
// 每次都重新查，绝不缓存成脚本加载时的常量——真机上出过这样的坑：窗口/安全区
// 中途变了（比如玩着玩着展开了「真机调试」悬浮工具栏），fitCanvas() 虽然会被
// resize 事件重新触发，但如果这里读到的还是脚本启动那一刻的旧快照，算出来的
// 缩放/居中就跟客户端实际分配的新画布尺寸对不上，画面跟着错位、部分内容
// 延伸到安全区外面去了。宁可每次多查两个同步 API，也不要图省事缓存这个。
function computeSys() {
  const winInfo = safeCall(wx.getWindowInfo, {});
  const appInfo = safeCall(wx.getAppBaseInfo, {});
  // windowWidth/windowHeight 不保证排除刘海屏顶部、Home Indicator 底部手势条这些
  // 物理遮挡区域——之前就是拿它们做等比缩放居中，内容延伸到了这些区域，被设备边框/
  // 系统手势条部分盖住，画面底部露出一条"乱七八糟"的缝。真正该用的是 safeArea，
  // 官方就是为这个场景设计的字段。safeArea 缺失时退回整个窗口（等于没有安全区）。
  const safeArea = winInfo.safeArea || null;
  return {
    windowWidth: winInfo.windowWidth || 375,
    windowHeight: winInfo.windowHeight || 667,
    safeLeft: safeArea ? safeArea.left : 0,
    safeTop: safeArea ? safeArea.top : 0,
    safeWidth: safeArea ? safeArea.width : (winInfo.windowWidth || 375),
    safeHeight: safeArea ? safeArea.height : (winInfo.windowHeight || 667),
    pixelRatio: winInfo.pixelRatio || 2,
    language: appInfo.language || 'zh',
  };
}

function touchToXY(touch) {
  return screenToLogical(touch.clientX, touch.clientY);
}

// ==================== 音效：预生成的 WAV 文件，见 scripts/gen-audio.mjs ====================
// Web 版是现场用 WebAudio 振荡器合成的，小游戏这边环境不保证支持那套写法，
// 干脆把每个音效离线渲染成 WAV（官方文档确认 mp3/aac/wav 三种格式两个平台都
// 完全支持），运行时就是简单地播放文件。useWebAudioImplement: true 是官方
// 给"短促、频繁触发的音效"的建议配置，比默认的 InnerAudio 驱动性能更好。
// 实例按需创建、创建后复用——官方文档明确建议复用，不要每次播放都新建。
const audioPool = {};
function getAudioInstance(key) {
  if (!audioPool[key]) {
    const ctx = wx.createInnerAudioContext({ useWebAudioImplement: true });
    ctx.src = 'audio/' + key + '.wav';
    audioPool[key] = ctx;
  }
  return audioPool[key];
}
function playSfx(key) {
  if (state.muted) return;
  try {
    const ctx = getAudioInstance(key);
    ctx.stop();   // 先停再放：同一个音效被快速连续触发（比如连发）时，
                   // 不能因为上一次还没播完就把这次触发吞掉。
    ctx.play();
  } catch (e) { /* 音频初始化失败也不能卡住主链路，静默跳过 */ }
}

const WeChatPlatform = {
  createCanvas() {
    const c = wx.createCanvas();
    return c;
  },
  createOffscreenCanvas(w, h) {
    // 查过官方文档确认了：wx.createOffscreenCanvas 是小程序（miniprogram）的 API，
    // 小游戏（minigame）环境里没有这个函数。小游戏这边的规则是 wx.createCanvas()——
    // 第一次调用返回的是显示在屏幕上的主画布，boot() 里已经调过一次了；
    // 这里是第二次调用，官方规则下会返回一块独立的离屏画布，互不干扰。
    const c = wx.createCanvas();
    c.width = w; c.height = h;
    return c;
  },
  getViewport() {
    const sys = computeSys();   // 每次现查，理由见 computeSys() 上面那段注释
    return {
      width: sys.windowWidth, height: sys.windowHeight,
      safeWidth: sys.safeWidth, safeHeight: sys.safeHeight, safeLeft: sys.safeLeft, safeTop: sys.safeTop,
      pixelRatio: sys.pixelRatio || 1,
    };
  },
  // 微信自己的 onWindowResize 不保证覆盖所有会让安全区变化的情况（比如真机调试
  // 悬浮工具栏展开这类"客户端自己叠加 UI"的场景，未必算作一次 resize）——onShow
  // 兜一层：从后台切回前台时也强制重新算一次，成本很低，覆盖了 resize 事件本身
  // 就没触发的那些场景。
  onResize(fn) {
    if (wx.onWindowResize) wx.onWindowResize(fn);
    if (wx.onShow) wx.onShow(fn);
  },
  reduceMotion() { return false; },   // 小游戏动效本来就轻，第一版不做这个开关
  systemLang() { return computeSys().language || 'zh'; },
  storage: {
    get(key) { try { return wx.getStorageSync(key); } catch (e) { return null; } },
    set(key, val) { try { wx.setStorageSync(key, val); } catch (e) {} },
  },
  audio: {
    // pop 的音高随连击数变调（Web 版是现场改振荡器频率），静态文件是按 chain
    // 分档预渲染好的 pop_0.wav ~ pop_6.wav，这里只需要选对文件名。
    play(name, opt) {
      if (name === 'pop') playSfx('pop_' + Math.min((opt && opt.chain) || 0, 6));
      else playSfx(name);
    },
    unlock() {},   // 小游戏没有浏览器那种"用户交互前不能播放音频"的限制，不用做解锁
  },
  ui: UICanvas,     // 没有 DOM，标题/HUD/弹框都在画布上画，见 core/ui-canvas.js
};

// ==================== 触摸：先问 UI 层有没有点中按钮，没有再当瞄准手势处理 ====================
wx.onTouchStart(e => {
  const { x, y } = touchToXY(e.touches[0]);
  const hit = UICanvas.hitTest(x, y);
  if (hit) { handleUIAction(hit); return; }
  onPointerDown(x, y);
});
wx.onTouchMove(e => {
  const { x, y } = touchToXY(e.touches[0]);
  onPointerMove(x, y, false);
});
wx.onTouchEnd(e => {
  // touchend 的 touches 是空的，坐标要从 changedTouches 拿
  const { x, y } = touchToXY(e.changedTouches[0]);
  onPointerUp(x, y);
});
wx.onTouchCancel(() => onPointerCancel());

// ==================== 按钮命中之后具体做什么，跟 adapters/web.js 里那几个
// click handler 是同一套业务逻辑，只是这边没有 DOM 元素可以操作 ====================
function handleUIAction(id) {
  if (id === 'start') { WeChatPlatform.audio.unlock(); startLevel(1); state.score = 0; state.screen = 'playing'; return; }
  if (id === 'pause') {
    if (state.screen !== 'playing') return;
    state.lastResult = 'pause';
    state.screen = 'paused';
    return;
  }
  if (id === 'main') {
    if (state.lastResult === 'pause') { state.screen = 'playing'; }
    else if (state.lastResult === 'win') { startLevel(state.level + 1); state.screen = 'playing'; }
    else { state.score = 0; startLevel(1); state.screen = 'playing'; }
    return;
  }
  if (id === 'retry') {
    if (state.lastResult === 'win') state.score -= state.levelScore;
    startLevel(state.level);
    state.screen = 'playing';
    return;
  }
  if (id === 'home') { startLevel(1); state.score = 0; state.screen = 'title'; return; }
  if (id === 'sound') { state.muted = !state.muted; save('muted', state.muted ? 1 : 0); return; }
  if (id === 'lang') { state.lang = state.lang === 'zh' ? 'en' : 'zh'; save('lang', state.lang); return; }
}

// ==================== 启动 ====================
boot(WeChatPlatform);
