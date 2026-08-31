/* =========================================================================
   给"没有 DOM 的平台"用的画布版 UI —— 微信/抖音/TikTok 小游戏都用这份。
   Web 版不引入这个文件：它的标题页/HUD/弹框是真实的 DOM 元素，样式在
   platforms/web/template.html 的 <style> 里，不在这。

   跟 core/game-core.js 共享同一个顶层作用域（build.py 直接拼在一起），
   可以直接用 state / t / I18N / pencil / roughPath / circlePts / W / H /
   PENCIL 这些 core 里已经定义好的东西，不用再 import 一遍。

   核心思路：state.screen 是 'title' | 'playing' | 'dialog' | 'paused'，
   每帧照着这个字段把该画的东西画在游戏画面上面；点击命中检测用同一套
   按钮描述表，画哪几个按钮、点哪算点中，两边共用一份数据，不会画歪。
   ========================================================================= */

const UI_PAPER = 'rgba(246,243,236,.94)';
const UI_INK = PENCIL;          // '#3a3a3a'，跟游戏画风统一
const UI_INK_SOFT = '#6f6a60';
const UI_ACCENT = '#c9603f';
const UI_BTN_PRIMARY = '#f7d9a8';
const UI_BTN_PLAIN = 'rgba(255,255,255,.75)';
const UI_FONT = '"Kaiti SC","STKaiti","KaiTi","Xingkai SC",sans-serif';

// ---- 一块手绘感的圆角卡片：矩形四角轻微抖动，别画成正儿八经的电脑矩形 ----
function cardPts(x, y, w, h, seed) {
  const rnd = mulberry32(seed);
  const j = () => (rnd() - 0.5) * 5;
  return [
    [x + j(), y + j()], [x + w + j(), y + j()],
    [x + w + j(), y + h + j()], [x + j(), y + h + j()],
  ];
}
function drawCard(ctx, x, y, w, h, seed) {
  const pts = cardPts(x, y, w, h, seed);
  ctx.save();
  ctx.fillStyle = UI_PAPER;
  ctx.beginPath();
  pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
  ctx.closePath(); ctx.fill();
  ctx.restore();
  roughPath(ctx, pts, seed + 1, { closed: true, width: 2.6, passes: 2 });
}

// ---- 按钮：一份数据同时喂给"怎么画"和"点哪算点中" ----
function drawButton(ctx, btn) {
  const pts = cardPts(btn.x, btn.y, btn.w, btn.h, btn.seed || 500);
  ctx.save();
  ctx.fillStyle = btn.primary ? UI_BTN_PRIMARY : UI_BTN_PLAIN;
  ctx.beginPath();
  pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
  ctx.closePath(); ctx.fill();
  ctx.restore();
  roughPath(ctx, pts, (btn.seed || 500) + 1, { closed: true, width: 2.2, passes: 1 });
  ctx.save();
  ctx.font = `${btn.fontSize || 30}px ${UI_FONT}`;
  ctx.fillStyle = UI_INK;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 2);
  ctx.restore();
}
function hitButton(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

// ---- 右下角那一排：暂停/语言/声音。照抄 H5 版 .hud-btns 的位置算法——
// #stage 那套响应式字号换算下来 1em = 24px（720 宽 / 30），H5 里是
// right:.8em / bottom:1em / 2.2em 见方 / 按钮间距 .4em，HTML 顺序是
// 声音、语言、暂停，flex 从左排到右，所以最靠右边的是暂停。
// 除了标题页，跟 HUD 数字一样哪个屏幕都在——声音/语言随时能点，
// 暂停图标常驻但只有 state.screen==='playing' 时点了才有效
// （跟 Web 版 el.btnPause 的判断逻辑一致，见 adapters/web.js）。
function hudButtons() {
  if (state.screen === 'title') return [];
  const w = 53, gap = 10, right = 19, bottom = 24;
  const y = H - bottom - w;
  return [
    { id: 'sound', x: W - right - w * 3 - gap * 2, y, w, h: w, label: state.muted ? '🔇' : '🔊', fontSize: 24, seed: 40 },
    { id: 'lang', x: W - right - w * 2 - gap, y, w, h: w, label: state.lang === 'zh' ? 'EN' : '中', fontSize: 20, seed: 41 },
    { id: 'pause', x: W - right - w, y, w, h: w, label: '❚❚', fontSize: 20, seed: 42 },
  ];
}

// ---- 每个屏幕状态下，当前应该有哪些按钮（画和点共用这一份） ----
function currentButtons() {
  if (state.screen === 'title') {
    return [{ id: 'start', x: 210, y: 700, w: 300, h: 84, label: t('start'), primary: true, fontSize: 34, seed: 10 }];
  }
  if (state.screen === 'playing') {
    return hudButtons();
  }
  if (state.screen === 'dialog' || state.screen === 'paused') {
    const btns = [];
    if (state.lastResult === 'pause') {
      btns.push({ id: 'main', x: 210, y: 660, w: 300, h: 76, label: t('resume'), primary: true, fontSize: 28, seed: 30 });
      btns.push({ id: 'retry', x: 210, y: 748, w: 300, h: 68, label: t('retry'), primary: false, fontSize: 26, seed: 31 });
      btns.push({ id: 'home', x: 260, y: 826, w: 200, h: 56, label: t('home'), primary: false, fontSize: 22, seed: 32 });
    } else if (state.lastResult === 'win') {
      btns.push({ id: 'main', x: 210, y: 700, w: 300, h: 76, label: t('next'), primary: true, fontSize: 28, seed: 30 });
      btns.push({ id: 'retry', x: 210, y: 788, w: 300, h: 68, label: t('retry'), primary: false, fontSize: 26, seed: 31 });
    } else {
      btns.push({ id: 'main', x: 210, y: 700, w: 300, h: 76, label: t('again'), primary: true, fontSize: 28, seed: 30 });
      btns.push({ id: 'home', x: 260, y: 788, w: 200, h: 56, label: t('home'), primary: false, fontSize: 22, seed: 32 });
    }
    return btns.concat(hudButtons());
  }
  return [];
}

// ---- HUD：分数/关卡/最高分 + 还有几发上新菜。
// 食物网格从 GRID_Y=92 开始，H5 版这块区域实测也是卡在 92px 左右
// （#hud 的 padding-top + 数字行 + push 提示行，按 1em=24px 换算出来），
// 这里三行文字全部收进 88px 以内，留 4px 安全间隙，别再跟第一排食物打架。
function drawHud(ctx) {
  ctx.save();
  ctx.textBaseline = 'top';
  const row = [['score', t('score'), state.score, 60, 'left'], ['level', t('level'), state.level, 360, 'center'], ['best', t('best'), state.best, 660, 'right']];
  row.forEach(([, label, val, x, align]) => {
    ctx.textAlign = align;
    ctx.fillStyle = UI_INK_SOFT; ctx.font = `15px ${UI_FONT}`;
    ctx.fillText(label, x, 14);
    ctx.fillStyle = UI_INK; ctx.font = `26px ${UI_FONT}`;
    ctx.fillText(String(val), x, 32);
  });
  if (state.screen === 'playing') {
    const soon = state.shotsLeft <= 1;
    ctx.textAlign = 'center'; ctx.font = `17px ${UI_FONT}`;
    ctx.fillStyle = soon ? UI_ACCENT : UI_INK_SOFT;
    ctx.fillText(soon ? t('pushSoon') : t('push')(state.shotsLeft), 360, 66);
  }
  ctx.restore();
}

// ---- 标题页：卡片 + 大标题 + 副标题 + 操作提示（开始按钮走 currentButtons()）----
function drawTitleScreen(ctx) {
  drawCard(ctx, 100, 480, 520, 380, 1);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = UI_INK;
  ctx.font = `52px ${UI_FONT}`;
  ctx.fillText(t('title'), 360, 570);
  ctx.fillStyle = UI_INK_SOFT;
  ctx.font = `22px ${UI_FONT}`;
  ctx.fillText(t('tagline'), 360, 620);
  ctx.font = `18px ${UI_FONT}`;
  wrapText(ctx, t('howto'), 360, 812, 440, 26);
  ctx.restore();
}

// ---- 弹框：半透明遮罩 + 卡片 + 标题 + 正文（按钮走 currentButtons()）----
function dialogText() {
  if (state.lastResult === 'pause') return { title: t('paused'), body: [`${t('total')} ${state.score}`] };
  if (state.lastResult === 'win') return { title: t('clear'), body: [`${t('lvScore')} ${state.levelScore}`, `${t('total')} ${state.score}`] };
  return { title: t('over'), body: [`${t('total')} ${state.score}`, state.isBest ? t('newBest') : `${t('best')} ${state.best}`] };
}
function drawDialog(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(70,64,54,.35)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  drawCard(ctx, 110, 420, 500, 460, 2);
  const { title, body } = dialogText();
  ctx.save();
  ctx.textAlign = 'center'; ctx.fillStyle = UI_INK;
  ctx.font = `34px ${UI_FONT}`;
  ctx.fillText(title, 360, 480);
  ctx.font = `24px ${UI_FONT}`;
  body.forEach((line, i) => ctx.fillText(line, 360, 560 + i * 40));
  ctx.restore();
}

// 简单的按空格自动换行——够用就行，不追求排版精细
function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split('');
  let line = '', lines = [];
  words.forEach(ch => {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; }
    else line = test;
  });
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

const UICanvas = {
  draw(ctx) {
    if (state.screen === 'title') drawTitleScreen(ctx);
    if (state.screen === 'playing') drawHud(ctx);
    if (state.screen === 'dialog' || state.screen === 'paused') { drawHud(ctx); drawDialog(ctx); }
    currentButtons().forEach(b => drawButton(ctx, b));
  },
  // 命中检测：返回按钮 id（'start'/'main'/'retry'/'home'/'pause'）或 null
  hitTest(x, y) {
    const hit = currentButtons().find(b => hitButton(b, x, y));
    return hit ? hit.id : null;
  },
};
