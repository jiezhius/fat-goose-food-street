/* =========================================================================
   抖音小游戏适配层：给 core/game-core.js + core/ui-canvas.js 提供 Platform 接口。
   跟 adapters/wechat.js 是同一套结构，全部换成 tt.* API。写之前把官方文档
   （developer.open-douyin.com）逐条核实过一遍，下面几处是跟微信不一样、
   容易想当然抄错的地方：

   1. 系统信息只有一个 tt.getSystemInfoSync()，不像微信拆成了
      getWindowInfo + getAppBaseInfo 两个新 API——一次调用就够。
   2. 触摸点字段是 screenX / screenY，不是微信那套 clientX / clientY。
   3. 没有 tt.onWindowResize 这个 API（翻遍官方"生命周期"文档确认过，
      只有 onShow/onHide/offShow/offHide）。resize 兜底只能靠 onShow。
   4. tt.getSystemInfoSync() 和 tt.getEnvInfoSync() 返回值里都没有语言
      字段，官方没有暴露"宿主语言"这个概念——systemLang() 直接给 'zh'
      当默认值，真要切换语言靠游戏自己右下角那个按钮手动切，不影响。
   5. tt.createCanvas() 官方原文："首次调用创建的是显示在屏幕上的画布，
      之后调用创建的都是离屏画布"——跟微信 wx.createCanvas() 的规则
      一字不差，这块直接照搬微信那份的写法。
   6. tt.createInnerAudioContext() 不接受参数，没有微信那个
      useWebAudioImplement 选项。
   ========================================================================= */

// ==================== 全局错误兜底：出错直接画在屏幕上 ====================
// 跟微信那份一样的思路：抖音这边目前也没找到能远程读控制台的
// 官方自动化能力（tt-minigame-ide-cli 只有 open/login/preview/upload 这几个
// 命令，没有截图、没有读日志），出问题只能靠人截图。tt.onError 官方确认
// 回调参数是 { message, stack }，跟微信 wx.onError 的 res.message 对得上。
const bootErrors = [];
let errCanvas = null;
function showBootError(msg) {
  msg = String(msg);
  if (bootErrors.includes(msg)) return;
  bootErrors.push(msg);
  if (bootErrors.length > 8) bootErrors.shift();
  try {
    const c = (typeof canvas !== 'undefined' && canvas) ? canvas : (errCanvas || (errCanvas = tt.createCanvas()));
    const g = c.getContext('2d');
    const w = c.width || 720, h = c.height || 1280;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#2a1414';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb4b4';
    g.font = '24px monospace';
    g.textBaseline = 'top';
    let y = 30;
    g.fillText('运行时报错（请截图反馈给开发者）：', 24, y); y += 40;
    bootErrors.forEach(m => {
      (m.match(/.{1,32}/g) || [m]).forEach(line => { g.fillText(line, 24, y); y += 30; });
      y += 16;
    });
  } catch (e) { /* 连错误提示都画不出来，只能认了 */ }
}
tt.onError(({ message }) => showBootError(message));

function safeCall(fn, fallback) {
  try { return (typeof fn === 'function' ? fn() : null) || fallback; }
  catch (e) { return fallback; }
}
// 每次现查，不缓存——理由跟微信那份一样：真机上系统信息中途可能变
// （比如展开调试工具栏），缓存住旧数据会导致缩放/居中跟实际画布对不上。
function computeSys() {
  const sys = safeCall(tt.getSystemInfoSync, {});
  const safeArea = sys.safeArea || null;
  return {
    windowWidth: sys.windowWidth || 375,
    windowHeight: sys.windowHeight || 667,
    safeLeft: safeArea ? safeArea.left : 0,
    safeTop: safeArea ? safeArea.top : 0,
    safeWidth: safeArea ? safeArea.width : (sys.windowWidth || 375),
    safeHeight: safeArea ? safeArea.height : (sys.windowHeight || 667),
    pixelRatio: sys.pixelRatio || 2,
  };
}

// changedTouches 里的坐标字段是 screenX/screenY（官方 tt.onTouchStart 文档
// 里 Touch 类型说明只列了这两个，没有 clientX/clientY）。
function touchToXY(touch) {
  return screenToLogical(touch.screenX, touch.screenY);
}

// ==================== 音效：预生成的 WAV 文件，跟微信共用同一批文件 ====================
// 抖音小游戏文件类型白名单里明确包含 .wav（官方开发指南"代码包限制"一节列过），
// 44.1kHz 也在 tt.createInnerAudioContext 文档写的支持采样率范围内，
// scripts/gen-audio.mjs 生成的文件两边直接原样复用，不用重新做一份。
const audioPool = {};
function getAudioInstance(key) {
  if (!audioPool[key]) {
    const ctx = tt.createInnerAudioContext();
    ctx.src = 'audio/' + key + '.wav';
    audioPool[key] = ctx;
  }
  return audioPool[key];
}
function playSfx(key) {
  if (state.muted) return;
  try {
    const ctx = getAudioInstance(key);
    ctx.stop();
    ctx.play();
  } catch (e) { /* 音频初始化失败不能卡住主链路 */ }
}

const DouyinPlatform = {
  createCanvas() {
    return tt.createCanvas();
  },
  createOffscreenCanvas(w, h) {
    // tt.createCanvas() 第二次调用起返回离屏画布——官方文档原文确认过，
    // 见文件顶部注释第 5 条。
    const c = tt.createCanvas();
    c.width = w; c.height = h;
    return c;
  },
  getViewport() {
    const sys = computeSys();
    return {
      width: sys.windowWidth, height: sys.windowHeight,
      safeWidth: sys.safeWidth, safeHeight: sys.safeHeight, safeLeft: sys.safeLeft, safeTop: sys.safeTop,
      pixelRatio: sys.pixelRatio || 1,
    };
  },
  // 没有 tt.onWindowResize 这个 API（见文件顶部注释第 3 条），只能靠
  // onShow 兜底：从后台切回前台时强制重新算一次安全区。
  onResize(fn) {
    if (tt.onShow) tt.onShow(fn);
  },
  reduceMotion() { return false; },
  // 官方没有暴露宿主语言字段，见文件顶部注释第 4 条，默认中文。
  systemLang() { return 'zh'; },
  storage: {
    get(key) { try { return tt.getStorageSync(key); } catch (e) { return null; } },
    set(key, val) { try { tt.setStorageSync(key, val); } catch (e) {} },
  },
  audio: {
    play(name, opt) {
      if (name === 'pop') playSfx('pop_' + Math.min((opt && opt.chain) || 0, 6));
      else playSfx(name);
    },
    unlock() {},
  },
  ui: UICanvas,
};

// ==================== 触摸 ====================
tt.onTouchStart(e => {
  const { x, y } = touchToXY(e.touches[0]);
  const hit = UICanvas.hitTest(x, y);
  if (hit) { handleUIAction(hit); return; }
  onPointerDown(x, y);
});
tt.onTouchMove(e => {
  const { x, y } = touchToXY(e.touches[0]);
  onPointerMove(x, y, false);
});
tt.onTouchEnd(e => {
  const { x, y } = touchToXY(e.changedTouches[0]);
  onPointerUp(x, y);
});
tt.onTouchCancel(() => onPointerCancel());

// ==================== 按钮命中之后具体做什么，跟 adapters/wechat.js 一模一样 ====================
function handleUIAction(id) {
  if (id === 'start') { DouyinPlatform.audio.unlock(); startLevel(1); state.score = 0; state.screen = 'playing'; return; }
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
boot(DouyinPlatform);
