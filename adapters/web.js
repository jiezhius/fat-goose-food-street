/* =========================================================================
   Web 平台适配层：给 core/game-core.js 提供它要的 Platform 接口，
   外加 Web 独有的 DOM 版 UI（标题页/HUD/弹框都是真实的 DOM 元素，不是画布画的）。
   这个文件只服务 Web 版，微信/抖音/TikTok 各自有自己的 adapters/*.js。
   ========================================================================= */

// ==================== 音效：WebAudio 现场合成（原样保留） ====================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, startTime, duration, type = 'sine', volume = 0.14, endFreq = null) {
  if (state.muted) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime + startTime;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + duration + 0.02);
  } catch (e) { /* 音频不可用就静默跳过 */ }
}
// 事件名 -> 具体怎么合成。core 里的 sfx 只发事件名，这里才是真正发声的地方。
const WEB_SOUNDS = {
  shoot: () => playTone(300, 0, 0.09, 'triangle', 0.10, 620),
  stick: () => playTone(220, 0, 0.07, 'square', 0.07),
  pop: (opt = {}) => {
    const base = 660 * Math.pow(1.12, Math.min(opt.chain || 0, 6));
    [0, 0.07, 0.14].forEach((d, i) => playTone(base * (1 + i * 0.25), d, 0.14, 'triangle', 0.11));
  },
  drop: () => playTone(500, 0, 0.35, 'sine', 0.09, 120),
  push: () => playTone(160, 0, 0.22, 'sawtooth', 0.07, 110),
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, i * 0.12, 0.2, 'triangle', 0.13)),
  lose: () => [392, 330, 262].forEach((f, i) => playTone(f, i * 0.16, 0.3, 'sine', 0.12)),
};

// ==================== DOM 版 UI ====================
const $ = id => document.getElementById(id);
const el = {
  hud: $('hud'), score: $('uiScore'), level: $('uiLevel'), best: $('uiBest'), push: $('uiPush'),
  title: $('screenTitle'), dialog: $('screenDialog'),
  dlgTitle: $('dlgTitle'), dlgBody: $('dlgBody'), btnMain: $('btnMain'), btnRetry: $('btnRetry'), btnHome: $('btnHome'),
  btnSound: $('btnSound'), btnLang: $('btnLang'), btnPause: $('btnPause'),
};

function updateHud() {
  el.score.textContent = state.score;
  el.level.textContent = state.level;
  el.best.textContent = state.best;
  const soon = state.shotsLeft <= 1;
  el.push.textContent = state.screen === 'playing' ? (soon ? t('pushSoon') : t('push')(state.shotsLeft)) : '';
  el.push.classList.toggle('warn', soon);
}

function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(n => {
    const v = I18N[state.lang][n.dataset.i18n];
    if (typeof v === 'string') n.innerHTML = v;
  });
  el.btnLang.textContent = state.lang === 'zh' ? 'EN' : '中';
  document.title = t('title');
  updateHud();
}

function showScreen(name) {
  state.screen = name;
  el.title.classList.toggle('hidden', name !== 'title');
  el.dialog.classList.toggle('hidden', name !== 'dialog');
  el.hud.style.display = name === 'title' ? 'none' : '';
  updateHud();
}

// core 的 levelClear()/gameOver() 已经把 state 改好了（分数、lastResult、isBest），
// 这里只管把 DOM 弹框的文字填上、显示出来——对应 Platform.onDialog 这个钩子。
function renderDialog(result) {
  if (result === 'win') {
    el.dlgTitle.textContent = t('clear');
    el.dlgBody.innerHTML = `${t('lvScore')} <span class="big">${state.levelScore}</span><br>${t('total')} ${state.score}`;
    el.btnMain.textContent = t('next');
    el.btnRetry.textContent = t('retry');
    el.btnRetry.style.display = '';
    el.btnHome.parentElement.style.display = 'none';
  } else {
    el.dlgTitle.textContent = t('over');
    el.dlgBody.innerHTML = `${t('total')} <span class="big">${state.score}</span><br>${state.isBest ? t('newBest') : t('best') + ' ' + state.best}`;
    el.btnMain.textContent = t('again');
    el.btnRetry.style.display = 'none';
    el.btnHome.parentElement.style.display = '';
  }
  showScreen('dialog');
}

// ==================== Platform 接口实现 ====================
const WebPlatform = {
  createCanvas() { return document.getElementById('game'); },
  createOffscreenCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },
  getViewport() { return { width: canvas.clientWidth, height: canvas.clientHeight, pixelRatio: window.devicePixelRatio || 1 }; },   // 没有安全区概念，不传 safeWidth 等字段，fitCanvas() 里会自动退化成安全区=整个窗口
  onResize(fn) { window.addEventListener('resize', fn); },
  reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  systemLang() { return navigator.language || 'zh'; },
  storage: {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) {} },
  },
  audio: {
    play(name, opt) { const fn = WEB_SOUNDS[name]; if (fn) fn(opt); },
    unlock() { getAudioCtx(); },
  },
  onDialog: renderDialog,
  onStateChange: updateHud,   // 分数/关卡/剩余发数变化时，core 用这个钩子通知 DOM 刷新
  // 没有 ui 字段：Web 版的标题/HUD/弹框是独立的 DOM 元素，core 的渲染循环
  // 用不着在画布上再画一遍。
};

// ==================== 输入：鼠标/触摸走 pointer 事件，键盘只有 Web 有 ====================
// 包成函数、在 boot() 之后再调用——core 的 `canvas` 变量要等 boot() 里
// Platform.createCanvas() 跑完才有值，这里在文件顶层就直接用 canvas.addEventListener
// 会拿到 undefined。
function eventToXY(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * W,
    y: (e.clientY - rect.top) / rect.height * H,
  };
}
function wireInput() {
  canvas.addEventListener('pointerdown', e => {
    if (state.screen !== 'playing') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const { x, y } = eventToXY(e);
    onPointerDown(x, y);
  });
  canvas.addEventListener('pointermove', e => {
    if (state.screen !== 'playing') return;
    const { x, y } = eventToXY(e);
    onPointerMove(x, y, e.pointerType === 'mouse');
  });
  canvas.addEventListener('pointerup', e => {
    const { x, y } = eventToXY(e);
    onPointerUp(x, y);
  });
  canvas.addEventListener('pointercancel', () => onPointerCancel());
  window.addEventListener('keydown', e => {
    if (state.screen !== 'playing') return;
    if (e.key === 'ArrowLeft') state.aim = Math.max(-MAX_ANGLE, state.aim - 0.06);
    else if (e.key === 'ArrowRight') state.aim = Math.min(MAX_ANGLE, state.aim + 0.06);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shoot(); }
  });
}

// ==================== 按钮 ====================
$('btnStart').addEventListener('click', () => { WebPlatform.audio.unlock(); startLevel(1); state.score = 0; showScreen('playing'); });
el.btnMain.addEventListener('click', () => {
  if (state.lastResult === 'pause') showScreen('playing');                                    // 继续玩
  else if (state.lastResult === 'win') { startLevel(state.level + 1); showScreen('playing'); } // 下一关
  else { state.score = 0; startLevel(1); showScreen('playing'); }                              // 再试一次
});
el.btnRetry.addEventListener('click', () => {          // 重玩本关（输了的时候这个键是藏起来的）
  if (state.lastResult === 'win') state.score -= state.levelScore;
  startLevel(state.level);
  showScreen('playing');
});
el.btnHome.addEventListener('click', () => { startLevel(1); state.score = 0; showScreen('title'); });
el.btnPause.addEventListener('click', () => {
  if (state.screen !== 'playing') return;
  state.lastResult = 'pause';
  el.dlgTitle.textContent = t('paused');
  el.dlgBody.innerHTML = `${t('total')} <span class="big">${state.score}</span>`;
  el.btnMain.textContent = t('resume');
  el.btnRetry.textContent = t('retry');
  el.btnRetry.style.display = '';
  el.btnHome.parentElement.style.display = '';
  el.dialog.classList.remove('hidden');
  el.hud.style.display = '';
  state.screen = 'paused';        // update() 里会停住，render 继续
});
el.btnSound.addEventListener('click', () => {
  state.muted = !state.muted;
  el.btnSound.textContent = state.muted ? '🔇' : '🔊';
  save('muted', state.muted ? 1 : 0);
});
el.btnLang.addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  save('lang', state.lang);
  applyLang();
});

// ==================== 启动 ====================
boot(WebPlatform);
wireInput();
el.btnSound.textContent = state.muted ? '🔇' : '🔊';
applyLang();
showScreen('title');
