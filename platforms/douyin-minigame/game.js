/* 本文件由 scripts/build.py 生成，不要手改——改 core/ 或 adapters/douyin.js 再重新跑脚本。 */
/* =========================================================================
   《大鹅的美食》核心逻辑 —— 平台无关，Web / 微信 / 抖音 / TikTok 共用同一份。
   不直接碰 document/window/localStorage：需要宿主能力的地方都通过 Platform
   （见文件末尾 boot() 的说明）间接调用。此文件由 index.html 拆分而来，不要
   手改 index.html 里的对应逻辑——改这里，然后跑 scripts/build.py 重新生成两边。
   ========================================================================= */



/* =========================================================================
   《大鹅的美食》— 根据一张小朋友的手绘设定图做成的泡泡龙
   单文件、零依赖、离线可玩。逻辑分辨率 720x1280，全部坐标都在这个空间里。
   ========================================================================= */

// ==================== 常量 ====================
const W = 720, H = 1280;
const R = 40;                       // 食物半径
const ROW_H = R * Math.sqrt(3);     // 六边形行距 ≈ 69.28
const GRID_X = 40;                  // 左右留白
const GRID_Y = 92;                  // 网格顶部
const COLS_EVEN = 8, COLS_ODD = 7;
const WALL_L = GRID_X + R, WALL_R = W - GRID_X - R;   // 球心反弹边界 80 / 640
const DANGER_Y = 838;               // 原画里那条横线：越过就输
const ORIGIN = { x: 360, y: 900 };  // 小姑娘手里发射点
const MAX_ANGLE = 78 * Math.PI / 180;
const SHOT_SPEED = 1500;            // px/s
const MAX_ROWS = Math.floor((DANGER_Y - GRID_Y - R) / ROW_H) + 1;

// 六种食物，全部取自原画。轮廓和配色都各不相同——
// 光靠淡彩的深浅根本认不出来，得让形状先说话、颜色再补一刀。
const TYPES = {
  o: { key: 'o', color: '#f79020', zh: '橘子',  en: 'Orange' },
  a: { key: 'a', color: '#e34b3c', zh: '苹果',  en: 'Apple' },
  w: { key: 'w', color: '#3f9c46', zh: '西瓜',  en: 'Melon' },
  m: { key: 'm', color: '#8b5a2b', zh: '咖啡',  en: 'Coffee' },
  j: { key: 'j', color: '#8a54c6', zh: '果汁',  en: 'Juice' },
  e: { key: 'e', color: '#f2c516', zh: '鹅蛋',  en: 'Egg' },
  c: { key: 'c', color: '#f9b21e', zh: '小鸡',  en: 'Chick' },
  f: { key: 'f', color: '#2fb3a8', zh: '小鱼',  en: 'Fish' },
  p: { key: 'p', color: '#f28ab2', zh: '小猪',  en: 'Piglet' },
  b: { key: 'b', color: '#f5c93f', zh: '香蕉',  en: 'Banana' },
  s: { key: 's', color: '#e8394a', zh: '草莓',  en: 'Strawberry' },
  g: { key: 'g', color: '#a8c93a', zh: '青提',  en: 'Grapes' },
  n: { key: 'n', color: '#e0952a', zh: '菠萝',  en: 'Pineapple' },
  d: { key: 'd', color: '#d98c5f', zh: '甜甜圈', en: 'Donut' },
  t: { key: 't', color: '#c9a06a', zh: '花生',  en: 'Peanut' },
  h: { key: 'h', color: '#d4283c', zh: '樱桃',  en: 'Cherries' },
  i: { key: 'i', color: '#d9a066', zh: '冰淇淋', en: 'Ice cream' },
  u: { key: 'u', color: '#e6dcc4', zh: '饺子',  en: 'Dumpling' },
};
// 一共 18 样，但一关最多上 6 样：每关从这个环上取一段，所以每关的阵容都不一样。
// 顺序是拿来穿插的——一关取的是连续 6 个，所以同色系的必须互相隔开：
// 黄有蛋/小鸡/香蕉，红有苹果/草莓/樱桃/西瓜瓤，棕有咖啡/花生/冰淇淋/甜甜圈。
// 任意 6 连（含首尾环绕）都核过，不会出现两个同色系挨着。
const TYPE_ORDER = ['w', 'o', 'j', 'b', 'm', 'g', 'a', 'u', 'c', 'f', 'd', 'n', 'e', 'i', 's', 'p', 't', 'h'];
const LEAF = '#5aa84a';             // 叶子和瓜蒂共用的绿
const PORCELAIN = '#f4eee2';        // 杯子、碟子的白瓷
const SEED_DARK = '#2f2a25';

let reduceMotion = false;   // boot() 里等 Platform 就绪后再赋值真正的值

// ==================== 文案 ====================
const I18N = {
  zh: {
    title: '大鹅的美食', tagline: '瞄准、发射，三个一样的就能吃掉！',
    start: '开 始', home: '回首页',
    howto: '按住拖动瞄准，松手发射',
    score: '分数', level: '关卡', best: '最高分',
    push: n => `还有 ${n} 发就要上新菜了`, pushSoon: '小心！马上要上新菜',
    clear: '这一桌被你吃光啦！', over: '食物压过线啦',
    next: '下一关', retry: '重玩本关', again: '再试一次',
    lvScore: '本关得分', total: '总分', newBest: '新纪录！',
    paused: '暂停中', resume: '继续玩',
  },
  en: {
    title: "Big Goose's Feast", tagline: 'Aim, shoot, match three to eat them up!',
    start: 'Start', home: 'Title',
    howto: 'Hold and drag to aim, release to shoot',
    score: 'Score', level: 'Level', best: 'Best',
    push: n => `${n} shots until new food arrives`, pushSoon: 'Watch out! New food incoming',
    clear: 'You ate the whole spread!', over: 'The food crossed the line',
    next: 'Next level', retry: 'Replay level', again: 'Try again',
    lvScore: 'Level score', total: 'Total', newBest: 'New best!',
    paused: 'Paused', resume: 'Resume',
  },
};

// ==================== 种子随机 + 手绘笔触 ====================
// 每个精灵绑定固定 seed，抖动是静态的，逐帧重画也不会满屏乱颤。
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const PENCIL = '#3a3a3a';

function pencil(ctx, width = 2.2, alpha = 0.85, color = PENCIL) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
}

// 沿路径叠画两遍带扰动的线 —— 铅笔反复描边的感觉
function roughPath(ctx, pts, seed, opt = {}) {
  const { closed = false, passes = 2, amt = 1.6, width = 2.2, alpha = 0.8, color = PENCIL } = opt;
  pencil(ctx, width, alpha, color);
  for (let p = 0; p < passes; p++) {
    const rnd = mulberry32(seed + p * 977);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const jx = x + (rnd() - 0.5) * 2 * amt;
      const jy = y + (rnd() - 0.5) * 2 * amt;
      if (i === 0) ctx.moveTo(jx, jy); else ctx.lineTo(jx, jy);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function circlePts(cx, cy, r, n = 26, squash = 1) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
  }
  return pts;
}

function roughCircle(ctx, cx, cy, r, seed, opt = {}) {
  roughPath(ctx, circlePts(cx, cy, r, 26, opt.squash || 1), seed, { ...opt, closed: true });
}

function roughLine(ctx, x1, y1, x2, y2, seed, opt = {}) {
  const steps = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 18));
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push([x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps]);
  roughPath(ctx, pts, seed, opt);
}

// 淡彩：色块相对轮廓故意偏移 2~4px，小孩涂色出格的感觉——这是风格的灵魂。
// 默认用正片叠底，两层色叠上去会变深而不是变灰，蜡笔反复涂就是这个效果；
// 要盖住底下的颜色（比如瓜瓤盖瓜皮）时传 mode='source-over'。
function washFill(ctx, pts, color, seed, alpha = 0.5, mode = 'multiply', spread = 7) {
  const rnd = mulberry32(seed + 4231);
  const dx = (rnd() - 0.5) * spread, dy = (rnd() - 0.5) * spread;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => { i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy); });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function washCircle(ctx, cx, cy, r, color, seed, alpha = 0.5, mode = 'multiply', spread = 7) {
  washFill(ctx, circlePts(cx, cy, r * 0.98, 20), color, seed, alpha, mode, spread);
}

// 一小片高光，蜡笔画里留白的那一下，东西立刻就"亮"了
function shine(ctx, x, y, r, alpha = 0.6) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fffdf3';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.21, r * 0.13, -0.7, 0, 7);
  ctx.fill();
  ctx.restore();
}

// 一片叶子：橘子、苹果头上那撮绿，也是画面里唯一的第二种绿
function leaf(ctx, x, y, r, seed, ang = -0.4, len = 0.66) {
  const L = r * len, wd = r * 0.24, pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, w = Math.sin(t * Math.PI) * wd;
    pts.push([x + Math.cos(ang) * L * t - Math.sin(ang) * w, y + Math.sin(ang) * L * t + Math.cos(ang) * w]);
  }
  for (let i = 12; i >= 0; i--) {
    const t = i / 12, w = Math.sin(t * Math.PI) * wd;
    pts.push([x + Math.cos(ang) * L * t + Math.sin(ang) * w, y + Math.sin(ang) * L * t - Math.cos(ang) * w]);
  }
  washFill(ctx, pts, LEAF, seed + 61, .62);
  roughPath(ctx, pts, seed + 62, { closed: true, width: 1.5, passes: 1 });
  roughLine(ctx, x, y, x + Math.cos(ang) * L * .9, y + Math.sin(ang) * L * .9, seed + 63, { width: 1.1, passes: 1, alpha: .45 });
}

// 手写字：一个字一个字地摆，各自歪一点、再描一遍毛边，
// 直接 fillText 一整串会太整齐，看着就不像手写的了。
function handwrite(ctx, text, x, y, size, seed, opt = {}) {
  const { rot = 0, color = PENCIL, alpha = .82, gap = 1.06 } = opt;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = size + 'px "Xingkai SC","Kaiti SC","STKaiti","KaiTi",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const rnd = mulberry32(seed), chars = Array.from(text), step = size * gap;
  chars.forEach((ch, i) => {
    ctx.save();
    ctx.translate((i - (chars.length - 1) / 2) * step + (rnd() - .5) * 2.4, (rnd() - .5) * 3.4);
    ctx.rotate((rnd() - .5) * 0.15);
    ctx.globalAlpha = alpha;
    ctx.fillText(ch, 0, 0);
    ctx.globalAlpha = alpha * .4;
    ctx.fillText(ch, (rnd() - .5) * 1.6, (rnd() - .5) * 1.6);
    ctx.restore();
  });
  ctx.restore();
}

// 沿脊线按法线偏移出一条平行曲线。offset 可以是常数，也可以是 t => 偏移量。
// 马尾的轮廓和里面那几绺散发共用这一套法线，所以发绺永远跑不出发束外面。
function offsetSpine(spine, offset) {
  const fn = typeof offset === 'function' ? offset : () => offset;
  return spine.map((p, i) => {
    const t = i / (spine.length - 1), w = fn(t);
    const q = spine[Math.min(i + 1, spine.length - 1)], o = spine[Math.max(i - 1, 0)];
    const dx = q[0] - o[0], dy = q[1] - o[1], d = Math.hypot(dx, dy) || 1;
    return [p[0] - dy / d * w, p[1] + dx / d * w];
  });
}

// 把几个控制点插值成一条平滑曲线（Catmull-Rom）。
// 点少了，ribbon 的外缘会在转弯处支出折角，一束头发就画成了一块板子。
function smoothSpine(pts, n = 26) {
  const at = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out = [];
  for (let s = 0; s < n; s++) {
    const u = s / (n - 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(u)), f = u - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c = (a, b, cc, d) =>
      0.5 * (2 * b + (-a + cc) * f + (2 * a - 5 * b + 4 * cc - d) * f * f + (-a + 3 * b - 3 * cc + d) * f * f * f);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

// 把一条脊线加粗成一条带子——马尾、猫尾巴、兔耳朵都用它。
// 宽度可以给两个数（首尾线性），也可以直接给一条曲线函数。
function ribbon(spine, w0, w1) {
  const w = typeof w0 === 'function' ? w0 : t => w0 + (w1 - w0) * t;
  return offsetSpine(spine, w).concat(offsetSpine(spine, t => -w(t)).reverse());
}

// ==================== 纸张背景（画一次，之后 drawImage） ====================
let paperCanvas = null;
function buildPaper() {
  const c = Platform.createOffscreenCanvas(W, H);
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#f6f3ec';
  x.fillRect(0, 0, W, H);

  // 颗粒
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const rnd = mulberry32(20260827);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8;
  }
  x.putImageData(img, 0, 0);

  // 折痕（原画上有两三道折痕）
  [0.30, 0.60, 0.86].forEach((p, i) => {
    const y = H * p;
    const g = x.createLinearGradient(0, y - 10, 0, y + 10);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, 'rgba(120,110,95,0.10)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, y - 10, W, 20);
    roughLine(x, 0, y, W, y, 700 + i * 31, { width: 1, alpha: 0.06, passes: 1, amt: 2.4 });
  });
  paperCanvas = c;
}

// ==================== 食物精灵（全部来自原画） ====================
function drawOrange(ctx, x, y, r, seed) {
  const pts = circlePts(x, y, r * 0.86, 26);
  washFill(ctx, pts, TYPES.o.color, seed, .62);
  // 底下再叠一层跟着轮廓缩小的暗面，正片叠底一压就有了圆滚滚的体积
  washFill(ctx, pts.map(([px, py]) => [x + (px - x) * .82 + r * .15, y + (py - y) * .82 + r * .17]), '#e2650c', seed + 33, .26);
  roughPath(ctx, pts, seed, { closed: true });
  shine(ctx, x - r * .34, y - r * .4, r);
  // 蒂 + 一片叶子
  roughLine(ctx, x + r * .06, y - r * .82, x + r * .1, y - r * .98, seed + 7, { width: 2, passes: 1 });
  leaf(ctx, x + r * .1, y - r * .96, r, seed, -0.25, .6);
  // 笑脸（原画橘子是有表情的）
  pencil(ctx, 2, .85);
  ctx.beginPath(); ctx.arc(x - r * .28, y - r * .1, 2.6, 0, 7); ctx.fillStyle = PENCIL; ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * .22, y - r * .1, 2.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * .03, y + r * .06, r * .38, 0.35, Math.PI - 0.35); ctx.stroke();
  ctx.globalAlpha = 1;
  // 两团腮红，跟笑脸配套
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .3; ctx.fillStyle = '#e8564a';
  ctx.beginPath(); ctx.ellipse(x - r * .46, y + r * .12, r * .13, r * .09, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + r * .4, y + r * .12, r * .13, r * .09, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function drawApple(ctx, x, y, r, seed) {
  const pts = [];
  const n = 30, base = r * 0.84;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI * 2;
    const dTop = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
    const dip = 0.24 * Math.exp(-Math.pow(dTop / 0.45, 2));
    const bot = 0.07 * Math.exp(-Math.pow((Math.PI - dTop) / 0.7, 2));
    const rr = base * (1 - dip + bot);
    pts.push([x + Math.cos(a) * rr * 1.02, y + Math.sin(a) * rr]);
  }
  washFill(ctx, pts, TYPES.a.color, seed, .72);
  // 暗面 = 缩小并往右下挪的同一个轮廓，这样阴影是跟着苹果形状的
  washFill(ctx, pts.map(([px, py]) => [x + (px - x) * .84 + r * .17, y + (py - y) * .84 + r * .15]), '#a8201a', seed + 31, .24);
  roughPath(ctx, pts, seed, { closed: true });
  shine(ctx, x - r * .32, y - r * .3, r * 1.15);
  roughLine(ctx, x, y - r * .62, x + r * .12, y - r * .98, seed + 3, { width: 2.4, passes: 1, color: '#6b4a2a' });
  leaf(ctx, x + r * .11, y - r * .93, r, seed + 5, -0.15, .55);
}

function drawMelon(ctx, x, y, r, seed) {
  // 原画里西瓜是整个的，但一屋子圆球实在分不出来——改成切开的一角，
  // 绿皮 + 白边 + 红瓤 + 黑籽，四种颜色，隔着半个屏幕也认得出。
  const top = y - r * .36, rr = r * .95;
  const half = rad => {
    const p = [];
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI; p.push([x + Math.cos(a) * rad, top + Math.sin(a) * rad]); }
    return p;
  };
  const rind = half(rr);
  washFill(ctx, rind, TYPES.w.color, seed, .72, 'source-over');            // 绿皮
  washFill(ctx, half(rr * .84), '#f6f1df', seed + 21, .95, 'source-over'); // 白边
  const flesh = half(rr * .76);
  washFill(ctx, flesh, '#e8434f', seed + 22, .82, 'source-over');          // 红瓤
  roughPath(ctx, flesh, seed + 23, { closed: true, width: 1.5, passes: 1, alpha: .5 });
  roughPath(ctx, rind, seed, { closed: true });
  // 皮上的深绿条纹
  for (let s2 = -1; s2 <= 1; s2++) {
    const a = Math.PI / 2 + s2 * 0.62;
    roughLine(ctx, x + Math.cos(a) * rr * .86, top + Math.sin(a) * rr * .86,
              x + Math.cos(a) * rr, top + Math.sin(a) * rr, seed + 30 + s2, { width: 3, passes: 1, alpha: .55, color: '#1f6b2a' });
  }
  // 黑籽
  const rnd = mulberry32(seed + 77);
  ctx.save(); ctx.fillStyle = SEED_DARK; ctx.globalAlpha = .85;
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + rnd() * (Math.PI - 1), d = (0.3 + rnd() * 0.4) * rr;
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, top + Math.sin(a) * d);
    ctx.rotate(a - Math.PI / 2);
    ctx.beginPath(); ctx.ellipse(0, 0, r * .05, r * .085, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawMug(ctx, x, y, r, seed) {
  const bx = x - r * .5, by = y - r * .52, bw = r * .9, bh = r * .9;
  const body = [[bx, by], [bx + bw, by], [bx + bw * .9, by + bh], [bx + bw * .1, by + bh]];
  // 碟子先画，压在杯子底下
  const saucer = [[x - r * .8, y + r * .38], [x + r * .8, y + r * .38], [x + r * .58, y + r * .6], [x - r * .58, y + r * .6]];
  washFill(ctx, saucer, '#cddaea', seed + 27, .7, 'source-over');
  roughPath(ctx, saucer, seed + 28, { closed: true, width: 2 });
  // 白瓷杯身
  washFill(ctx, body, PORCELAIN, seed, .95, 'source-over');
  // 杯口那一圈黑咖啡——整个画面唯一的深棕，一眼就知道是杯子
  const cof = [[bx + 3, by + 3], [bx + bw - 3, by + 3], [bx + bw - 5, by + bh * .3], [bx + 5, by + bh * .3]];
  washFill(ctx, cof, TYPES.m.color, seed + 3, .85, 'source-over');
  roughPath(ctx, body, seed, { closed: true });
  roughLine(ctx, bx + 2, by + bh * .3, bx + bw - 2, by + bh * .3, seed + 13, { width: 1.6, passes: 1, alpha: .7 });
  // 杯身上一道红条纹
  roughLine(ctx, bx + 4, by + bh * .58, bx + bw - 4, by + bh * .58, seed + 14, { width: 3.4, passes: 1, alpha: .5, color: '#d9534a' });
  shine(ctx, bx + bw * .22, by + bh * .72, r * 1.1, .7);
  // 把手
  const handle = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + i / 10 * Math.PI;
    handle.push([bx + bw + Math.cos(a) * r * .28, by + bh * .45 + Math.sin(a) * r * .28]);
  }
  roughPath(ctx, handle, seed + 9, { width: 2.4, passes: 1 });
  // 热气
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    const st = [];
    for (let i = 0; i <= 6; i++) st.push([x + s2 * r * .22 + Math.sin(i * 1.5) * r * .1, by - r * .08 - i * r * .085]);
    roughPath(ctx, st, seed + 17 + s2, { width: 1.5, passes: 1, alpha: .45, color: '#7d8fa3' });
  }
}

function drawJuice(ctx, x, y, r, seed) {
  const tw = r * .72, bw = r * .48, top = y - r * .5, bot = y + r * .6;
  const wAt = yy => tw + (bw - tw) * ((yy - top) / (bot - top));
  const cup = [[x - tw, top], [x + tw, top], [x + bw, bot], [x - bw, bot]];
  washFill(ctx, cup, '#eaf3f8', seed + 1, .8, 'source-over');            // 玻璃杯
  // 葡萄汁：紫色是这张画里独一份的颜色
  const jt = top + r * .18, jw = wAt(jt);
  washFill(ctx, [[x - jw, jt], [x + jw, jt], [x + bw, bot], [x - bw, bot]], TYPES.j.color, seed, .78, 'source-over');
  roughPath(ctx, cup, seed, { closed: true });
  roughLine(ctx, x - jw, jt, x + jw, jt, seed + 2, { width: 1.8, passes: 1, alpha: .6 });
  shine(ctx, x - tw * .62, jt + r * .26, r * 1.15, .55);
  // 红白条纹吸管
  const s0 = [x + r * .26, jt - r * .02], s1 = [x + r * .56, y - r * 1.06];
  roughLine(ctx, s0[0], s0[1], s1[0], s1[1], seed + 8, { width: 5, passes: 1, alpha: .85, color: '#f6f1e4' });
  roughLine(ctx, s0[0], s0[1], s1[0], s1[1], seed + 8, { width: 5, passes: 1, alpha: .9 });
  for (let i = 0; i < 4; i++) {
    const t0 = .1 + i * .24, t1 = t0 + .11;
    roughLine(ctx, s0[0] + (s1[0] - s0[0]) * t0, s0[1] + (s1[1] - s0[1]) * t0,
              s0[0] + (s1[0] - s0[0]) * t1, s0[1] + (s1[1] - s0[1]) * t1, seed + 40 + i, { width: 4.2, passes: 1, alpha: .85, color: '#e0483c' });
  }
  // 杯沿上挂一片橙子
  const lx = x - tw * .92, ly = top + r * .02;
  washCircle(ctx, lx, ly, r * .2, '#f79020', seed + 51, .8, 'source-over');
  roughCircle(ctx, lx, ly, r * .2, seed + 52, { width: 1.6, passes: 1 });
}

function drawEgg(ctx, x, y, r, seed) {
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const a = i / 26 * Math.PI * 2;
    const taper = 1 - 0.13 * Math.cos(a - Math.PI / 2);
    pts.push([x + Math.cos(a) * r * .66 * taper, y + Math.sin(a) * r * .84]);
  }
  washFill(ctx, pts, TYPES.e.color, seed, .58);
  washFill(ctx, pts.map(([px, py]) => [px + r * .12, py + r * .14]), '#d9a013', seed + 31, .26);  // 暗面
  roughPath(ctx, pts, seed, { closed: true });
  shine(ctx, x - r * .2, y - r * .38, r * 1.2);
  // 花斑点：橘、红、棕换着来，比原来一色的铅笔点子活泼
  const rnd = mulberry32(seed + 91);
  const dots = ['#c9622a', '#d84a3e', '#7a4a1f'];
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .65;
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = dots[i % dots.length];
    ctx.beginPath();
    ctx.ellipse(x + (rnd() - .5) * r * .8, y + (rnd() - .5) * r * 1.15, 1.6 + rnd() * 2.2, 1.4 + rnd() * 1.8, rnd() * 3, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// ---- 街上新来的三只小动物，画法跟食物保持一路：铅笔线稿 + 淡彩 ----

function drawChick(ctx, x, y, r, seed) {
  const body = circlePts(x, y + r * .06, r * .74, 24, 1.02);
  washFill(ctx, body, TYPES.c.color, seed, .66);
  washFill(ctx, body.map(([px, py]) => [x + (px - x) * .8 + r * .16, y + (py - y) * .8 + r * .18]), '#e08a0c', seed + 31, .24);
  roughPath(ctx, body, seed, { closed: true });
  shine(ctx, x - r * .28, y - r * .3, r * 1.1);
  // 头顶那撮呆毛
  roughPath(ctx, [[x - r * .1, y - r * .68], [x - r * .04, y - r * .95], [x + r * .12, y - r * .78]], seed + 3, { width: 1.8, passes: 1 });
  // 橘红的尖嘴
  const beak = [[x + r * .5, y - r * .06], [x + r * .86, y + r * .04], [x + r * .5, y + r * .16]];
  washFill(ctx, beak, '#ef7a1a', seed + 5, .85, 'source-over');
  roughPath(ctx, beak, seed + 6, { closed: true, width: 1.6, passes: 1 });
  // 眼睛 + 腮红
  ctx.beginPath(); ctx.arc(x + r * .22, y - r * .16, 3, 0, 7); ctx.fillStyle = PENCIL; ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .3; ctx.fillStyle = '#e8564a';
  ctx.beginPath(); ctx.ellipse(x + r * .06, y + r * .1, r * .12, r * .08, 0, 0, 7); ctx.fill();
  ctx.restore();
  // 翅膀
  roughPath(ctx, [[x - r * .34, y - r * .04], [x - r * .04, y + r * .1], [x - r * .3, y + r * .3]], seed + 8, { width: 1.6, passes: 1, alpha: .8 });
  // 两条细腿
  for (let i = -1; i <= 1; i += 2) {
    roughLine(ctx, x + i * r * .18, y + r * .74, x + i * r * .2, y + r * .94, seed + 12 + i, { width: 1.8, passes: 1, color: '#ef7a1a' });
    roughLine(ctx, x + i * r * .2, y + r * .94, x + i * r * .34, y + r * .98, seed + 14 + i, { width: 1.6, passes: 1, color: '#ef7a1a' });
  }
}

function drawFish(ctx, x, y, r, seed) {
  const body = circlePts(x - r * .08, y, r * .72, 26, 0.74);
  washFill(ctx, body, TYPES.f.color, seed, .66);
  washFill(ctx, body.map(([px, py]) => [x - r * .08 + (px - x + r * .08) * .8, y + (py - y) * .8 + r * .18]), '#127a72', seed + 31, .26);
  // 尾巴
  const tail = [[x + r * .5, y], [x + r * .92, y - r * .38], [x + r * .84, y], [x + r * .92, y + r * .38]];
  washFill(ctx, tail, TYPES.f.color, seed + 2, .7);
  roughPath(ctx, tail, seed + 3, { closed: true, width: 1.8, passes: 1 });
  roughPath(ctx, body, seed, { closed: true });
  shine(ctx, x - r * .34, y - r * .22, r * 1.1);
  // 背鳍
  const fin = [[x - r * .2, y - r * .5], [x + r * .04, y - r * .82], [x + r * .2, y - r * .44]];
  washFill(ctx, fin, '#f7a520', seed + 4, .7, 'source-over');
  roughPath(ctx, fin, seed + 5, { closed: true, width: 1.5, passes: 1 });
  // 眼睛 + 鳃 + 两道鳞纹
  ctx.beginPath(); ctx.arc(x - r * .46, y - r * .1, 3.2, 0, 7); ctx.fillStyle = PENCIL; ctx.fill();
  roughPath(ctx, [[x - r * .24, y - r * .38], [x - r * .34, y], [x - r * .24, y + r * .36]], seed + 7, { width: 1.5, passes: 1, alpha: .7 });
  for (let i = 0; i < 2; i++) {
    roughPath(ctx, [[x + r * .04 + i * r * .2, y - r * .34], [x - r * .04 + i * r * .2, y], [x + r * .04 + i * r * .2, y + r * .34]], seed + 9 + i, { width: 1.3, passes: 1, alpha: .5 });
  }
}

function drawPig(ctx, x, y, r, seed) {
  // 耳朵先画，压在脸底下
  for (let i = -1; i <= 1; i += 2) {
    const ear = [[x + i * r * .3, y - r * .58], [x + i * r * .62, y - r * .9], [x + i * r * .66, y - r * .44]];
    washFill(ctx, ear, '#e2739f', seed + 20 + i, .7);
    roughPath(ctx, ear, seed + 22 + i, { closed: true, width: 1.7, passes: 1 });
  }
  const face = circlePts(x, y, r * .74, 24);
  washFill(ctx, face, TYPES.p.color, seed, .68);
  washFill(ctx, face.map(([px, py]) => [x + (px - x) * .8 + r * .16, y + (py - y) * .8 + r * .18]), '#d15f89', seed + 31, .22);
  roughPath(ctx, face, seed, { closed: true });
  shine(ctx, x - r * .3, y - r * .34, r * 1.1);
  // 猪鼻子：这张脸全靠它认
  const snout = circlePts(x, y + r * .18, r * .3, 20, 0.8);
  washFill(ctx, snout, '#e2739f', seed + 6, .8, 'source-over');
  roughPath(ctx, snout, seed + 7, { closed: true, width: 1.7, passes: 1 });
  ctx.fillStyle = PENCIL; ctx.globalAlpha = .8;
  for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.ellipse(x + i * r * .1, y + r * .18, 1.8, 2.8, 0, 0, 7); ctx.fill(); }
  // 眯眯眼
  pencil(ctx, 2, .85);
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath(); ctx.arc(x + i * r * .3, y - r * .22, r * .13, Math.PI + .5, -0.5); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- 后来添的一批吃的：水果、干果、点心。画法跟前面一路：
// 淡彩打底 -> 跟着轮廓缩小偏移的暗面 -> 铅笔轮廓 -> 一点留白高光。

function drawBanana(ctx, x, y, r, seed) {
  // 弯月：直接把一条弧线用 ribbon 加粗成中间胖两头尖
  const spine = smoothSpine([
    [x - r * .72, y - r * .14], [x - r * .42, y + r * .3], [x, y + r * .46],
    [x + r * .42, y + r * .3], [x + r * .72, y - r * .14],
  ], 18);
  const body = ribbon(spine, t => r * (.055 + .19 * Math.sin(Math.PI * t)));
  washFill(ctx, body, TYPES.b.color, seed, .68);
  washFill(ctx, body.map(([px, py]) => [px + r * .05, py + r * .09]), '#cf9407', seed + 31, .22);
  roughPath(ctx, body, seed, { closed: true });
  shine(ctx, x - r * .2, y + r * .16, r * 1.1);
  // 顺着弧度的一道棱线
  pencil(ctx, 1.3, .4);
  ctx.beginPath();
  offsetSpine(spine, t => -r * .07 * Math.sin(Math.PI * t)).forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 两头的蒂
  roughLine(ctx, x - r * .72, y - r * .14, x - r * .84, y - r * .34, seed + 5, { width: 2.6, passes: 1, color: '#6b4a2a' });
  roughLine(ctx, x + r * .72, y - r * .14, x + r * .8, y - r * .3, seed + 6, { width: 2.2, passes: 1, color: '#6b4a2a' });
}

function drawStrawberry(ctx, x, y, r, seed) {
  const pts = [];
  for (let n = 0; n <= 30; n++) {
    const a = -Math.PI / 2 + n / 30 * Math.PI * 2;
    const down = (Math.sin(a) + 1) / 2;                       // 0 顶 -> 1 底
    const wx = r * .72 * (1 - Math.pow(down, 1.7) * .9);      // 越往下越窄，收成一个尖
    pts.push([x + Math.cos(a) * wx, y - r * .04 + Math.sin(a) * r * .76]);
  }
  washFill(ctx, pts, TYPES.s.color, seed, .7);
  washFill(ctx, pts.map(([px, py]) => [x + (px - x) * .82 + r * .14, y + (py - y) * .82 + r * .12]), '#a81f2c', seed + 31, .22);
  roughPath(ctx, pts, seed, { closed: true });
  shine(ctx, x - r * .28, y - r * .34, r * 1.1);
  // 白籽
  const rnd = mulberry32(seed + 77);
  ctx.save(); ctx.fillStyle = '#fff6e0'; ctx.globalAlpha = .85;
  for (let n = 0; n < 8; n++) {
    const down = rnd() * .78;
    ctx.beginPath();
    ctx.ellipse(x + (rnd() - .5) * r * 1.1 * (1 - down), y - r * .3 + down * r * .9, 1.6, 2.4, 0, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  // 绿叶冠
  for (let n = -1; n <= 1; n++) {
    const lf = [[x, y - r * .5], [x + n * r * .44 - r * .04, y - r * .86], [x + n * r * .2, y - r * .44]];
    washFill(ctx, lf, LEAF, seed + 40 + n, .7);
    roughPath(ctx, lf, seed + 43 + n, { closed: true, width: 1.5, passes: 1 });
  }
}

function drawGrapes(ctx, x, y, r, seed) {
  // 梗 + 叶子
  roughLine(ctx, x, y - r * .5, x + r * .06, y - r * .92, seed + 3, { width: 2.4, passes: 1, color: '#6b4a2a' });
  leaf(ctx, x + r * .06, y - r * .88, r, seed + 4, -0.2, .5);
  // 一串小圆粒，堆成倒三角
  [[-.38, -.3], [0, -.38], [.38, -.3], [-.2, .02], [.2, .02], [0, .38]].forEach(([dx, dy], n) => {
    const gx = x + dx * r, gy = y + dy * r;
    washCircle(ctx, gx, gy, r * .26, TYPES.g.color, seed + 10 + n, .72);
    washCircle(ctx, gx + r * .05, gy + r * .06, r * .18, '#7a9c1c', seed + 20 + n, .22);
    roughCircle(ctx, gx, gy, r * .26, seed + 30 + n, { width: 1.7, passes: 1 });
    shine(ctx, gx - r * .09, gy - r * .1, r * .55);
  });
}

function drawPineapple(ctx, x, y, r, seed) {
  // 绿冠先画，压在果身底下
  for (let n = -2; n <= 2; n++) {
    const lf = [[x + n * r * .14 - r * .13, y - r * .34], [x + n * r * .26, y - r * .86 + Math.abs(n) * r * .13], [x + n * r * .14 + r * .13, y - r * .34]];
    washFill(ctx, lf, LEAF, seed + 40 + n, .68);
    roughPath(ctx, lf, seed + 45 + n, { closed: true, width: 1.5, passes: 1 });
  }
  const body = circlePts(x, y + r * .16, r * .52, 24, 1.32);
  washFill(ctx, body, TYPES.n.color, seed, .7);
  washFill(ctx, body.map(([px, py]) => [x + (px - x) * .82 + r * .12, y + r * .16 + (py - y - r * .16) * .84 + r * .1]), '#b06d10', seed + 31, .22);
  roughPath(ctx, body, seed, { closed: true });
  shine(ctx, x - r * .24, y - r * .18, r * 1.1);
  // 斜网格——菠萝就靠这个认
  ctx.save();
  ctx.beginPath(); body.forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.clip();
  pencil(ctx, 1.3, .45, '#8a5610');
  for (let d = -1; d <= 1; d += 2) {
    for (let n = -4; n <= 4; n++) {
      ctx.beginPath();
      ctx.moveTo(x - r * .6, y + r * .16 + n * r * .22 + d * r * .6);
      ctx.lineTo(x + r * .6, y + r * .16 + n * r * .22 - d * r * .6);
      ctx.stroke();
    }
  }
  ctx.restore(); ctx.globalAlpha = 1;
}

function drawDonut(ctx, x, y, r, seed) {
  const outer = circlePts(x, y, r * .8, 26);
  const inner = circlePts(x, y, r * .27, 20);
  // 中间那个洞是它最好认的地方，用 evenodd 挖出来
  const ring = (o, i2, color, alpha, mode) => {
    ctx.save();
    ctx.globalCompositeOperation = mode || 'multiply';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    o.forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath();
    i2.forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();
  };
  ring(outer, inner, TYPES.d.color, .62);
  // 粉糖霜：外缘做成波浪，像淋下来的
  const icing = [];
  for (let n = 0; n <= 30; n++) {
    const a = n / 30 * Math.PI * 2;
    icing.push([x + Math.cos(a) * (r * .66 + Math.sin(a * 5) * r * .07), y + Math.sin(a) * (r * .66 + Math.sin(a * 5) * r * .07)]);
  }
  ring(icing, inner, '#f2a0c0', .7, 'source-over');
  roughPath(ctx, icing, seed + 3, { closed: true, width: 1.5, passes: 1, alpha: .6 });
  roughPath(ctx, outer, seed, { closed: true });
  roughPath(ctx, inner, seed + 1, { closed: true, width: 2 });
  // 彩针
  const rnd = mulberry32(seed + 91), dots = ['#e0473c', '#f7c948', '#4aa3e0', '#5aa84a'];
  ctx.save(); ctx.lineCap = 'round';
  for (let n = 0; n < 10; n++) {
    const a = rnd() * Math.PI * 2, d = r * (.36 + rnd() * .22), ang = rnd() * Math.PI;
    ctx.strokeStyle = dots[n % dots.length]; ctx.lineWidth = 2.2; ctx.globalAlpha = .9;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d - Math.cos(ang) * 3, y + Math.sin(a) * d - Math.sin(ang) * 3);
    ctx.lineTo(x + Math.cos(a) * d + Math.cos(ang) * 3, y + Math.sin(a) * d + Math.sin(ang) * 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPeanut(ctx, x, y, r, seed) {
  const pts = [];
  for (let n = 0; n <= 32; n++) {
    const a = -Math.PI / 2 + n / 32 * Math.PI * 2;
    const sy = Math.sin(a);
    const waist = 1 - .36 * Math.exp(-Math.pow(sy / .32, 2));   // 中间收一道腰
    pts.push([x + Math.cos(a) * r * .46 * waist, y + sy * r * .8]);
  }
  washFill(ctx, pts, TYPES.t.color, seed, .68);
  washFill(ctx, pts.map(([px, py]) => [x + (px - x) * .82 + r * .1, y + (py - y) * .84 + r * .1]), '#8f6a34', seed + 31, .22);
  roughPath(ctx, pts, seed, { closed: true });
  shine(ctx, x - r * .16, y - r * .42, r * .9);
  // 壳上的网纹
  pencil(ctx, 1.2, .4, '#8f6a34');
  for (let n = -2; n <= 2; n++) {
    ctx.beginPath();
    ctx.moveTo(x - r * .3, y + n * r * .26 + r * .1);
    ctx.quadraticCurveTo(x, y + n * r * .26, x + r * .3, y + n * r * .26 + r * .1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCherries(ctx, x, y, r, seed) {
  // 梗：两根从一点分出去
  const top = [x + r * .06, y - r * .78];
  pencil(ctx, 2.2, .8, '#5a7a2a');
  [[-1, -.36], [1, .34]].forEach(([d, dx]) => {
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.quadraticCurveTo(top[0] + d * r * .3, y - r * .3, x + dx * r, y + r * .14);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  leaf(ctx, top[0], top[1] + 2, r, seed + 4, -0.1, .48);
  // 两颗果，一高一低才不像哑铃
  [[-.36, .3], [.34, .42]].forEach(([dx, dy], n) => {
    const cx = x + dx * r, cy = y + dy * r;
    washCircle(ctx, cx, cy, r * .32, TYPES.h.color, seed + 10 + n, .72);
    washCircle(ctx, cx + r * .07, cy + r * .08, r * .22, '#8f1420', seed + 20 + n, .24);
    roughCircle(ctx, cx, cy, r * .32, seed + 30 + n, { width: 2 });
    shine(ctx, cx - r * .11, cy - r * .12, r * .7);
  });
}

function drawIceCream(ctx, x, y, r, seed) {
  // 蛋筒：倒三角
  const cone = [[x - r * .42, y - r * .02], [x + r * .42, y - r * .02], [x + r * .04, y + r * .88]];
  washFill(ctx, cone, TYPES.i.color, seed, .7);
  roughPath(ctx, cone, seed + 1, { closed: true });
  // 筒上的斜格
  ctx.save();
  ctx.beginPath(); cone.forEach(([px, py], n) => n ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.clip();
  pencil(ctx, 1.2, .45, '#96683a');
  for (let d = -1; d <= 1; d += 2) for (let n = -3; n <= 3; n++) {
    ctx.beginPath();
    ctx.moveTo(x - r * .5, y + n * r * .24 + d * r * .5);
    ctx.lineTo(x + r * .5, y + n * r * .24 - d * r * .5);
    ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  // 奶油球
  const ball = circlePts(x, y - r * .36, r * .44, 22, 0.92);
  washFill(ctx, ball, '#f7e7c4', seed + 5, .85, 'source-over');
  washFill(ctx, ball.map(([px, py]) => [x + (px - x) * .8 + r * .1, y - r * .36 + (py - y + r * .36) * .8 + r * .08]), '#dcbe88', seed + 6, .5, 'source-over');
  roughPath(ctx, ball, seed + 7, { closed: true });
  shine(ctx, x - r * .18, y - r * .5, r * 1.1);
  // 顶上一颗樱桃
  washCircle(ctx, x + r * .04, y - r * .82, r * .14, '#d4283c', seed + 8, .85, 'source-over');
  roughCircle(ctx, x + r * .04, y - r * .82, r * .14, seed + 9, { width: 1.5, passes: 1 });
}

function drawDumpling(ctx, x, y, r, seed) {
  const lw = r * .76, mid = y + r * .04;
  const pts = [];
  for (let n = 0; n <= 20; n++) {                       // 下面鼓出来的肚子
    const a = Math.PI - n / 20 * Math.PI;
    pts.push([x + Math.cos(a) * lw, mid + Math.sin(a) * r * .52]);
  }
  for (let n = 0; n <= 14; n++) {                       // 上面收口那条边，微微拱起
    const t = n / 14;
    pts.push([x + lw - 2 * lw * t, mid - Math.sin(Math.PI * t) * r * .26]);
  }
  washFill(ctx, pts, TYPES.u.color, seed, .95, 'source-over');
  washFill(ctx, pts.map(([px, py]) => [x + (px - x) * .86, mid + (py - mid) * .86 + r * .14]), '#bcab84', seed + 31, .45, 'source-over');
  roughPath(ctx, pts, seed, { closed: true });
  shine(ctx, x - r * .26, mid + r * .1, r * 1.1);
  // 一排褶，饺子全靠它
  pencil(ctx, 2, .75);
  for (let n = -2; n <= 2; n++) {
    const px = x + n * r * .26;
    ctx.beginPath();
    ctx.moveTo(px, mid - Math.sin(Math.PI * (n * r * .26 + lw) / (2 * lw)) * r * .24);
    ctx.quadraticCurveTo(px + r * .05, mid + r * .1, px + r * .02, mid + r * .2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const DRAWERS = {
  o: drawOrange, a: drawApple, w: drawMelon, m: drawMug, j: drawJuice, e: drawEgg,
  c: drawChick, f: drawFish, p: drawPig,
  b: drawBanana, s: drawStrawberry, g: drawGrapes, n: drawPineapple, d: drawDonut,
  t: drawPeanut, h: drawCherries, i: drawIceCream, u: drawDumpling,
};
function drawFood(ctx, type, x, y, r, seed) {
  (DRAWERS[type] || drawOrange)(ctx, x, y, r, seed);
}

// ==================== 小姑娘（背影，举着手） ====================
// 出手那一下的节奏：甩出去 -> 冲过头 -> 弹回来一点 -> 站定。
// 曲线两头都归零，所以不发射的时候她纹丝不动。
function throwCurve(p) {
  if (p <= 0 || p >= 1) return 0;
  return Math.sin(p * Math.PI * 1.6) * Math.pow(1 - p, 1.3) * 1.25;
}

// 全身的位移和倾斜。手里那颗食物也要套同一个变换，才跟得上手。
function girlTransform(ctx, aim, recoil) {
  const p = 1 - Math.min(1, Math.max(0, recoil));
  const k = recoil > 0 ? throwCurve(p) : 0;
  const dir = { x: Math.sin(aim), y: -Math.cos(aim) };
  ctx.translate(dir.x * k * 9, -Math.max(0, k) * 12);         // 顺着出手方向带一点 + 轻轻一颠
  ctx.translate(360, 1250);
  ctx.rotate(k * (0.025 + dir.x * 0.072));                    // 往瞄准那边压肩
  ctx.translate(-360, -1250);
  return k;
}

// 一只小手，就三条线。手在屏幕上不到 20px，画轮廓、填肉色都只会糊成一个团；
// 小孩画手也就是在胳膊末端划拉三下，那三下反而最像手。别再往上加结构了。
function drawHand(ctx, x, y, ang, seed, s = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  [[-0.52, 12], [0, 14], [0.52, 12]].forEach(([a, len], n) =>
    roughLine(ctx, 0, 0, Math.cos(a) * len, Math.sin(a) * len, seed + n * 7, { width: 2.2, passes: 1, amt: 0.5 }));
  ctx.restore();
}

function drawGirl(ctx, aim, recoil) {
  const S = 100;                       // 稳定 seed，别让她每帧抖
  const dir = { x: Math.sin(aim), y: -Math.cos(aim) };
  ctx.save();
  const k = girlTransform(ctx, aim, recoil);
  // 手要托在食物下面一点，离发射点太近会被食物整个盖住
  const hand = { x: ORIGIN.x - dir.x * (40 - k * 26), y: ORIGIN.y - dir.y * (40 - k * 26) };
  // 头偏在中线左边，举起的手臂伸到中线——跟原画的构图一致
  const headX = 282, headY = 1032, headR = 48;
  const shR = { x: 320, y: 1086 }, shL = { x: 244, y: 1086 };
  const sw = k * 13;                   // 甩出去时裙摆和身子往那边带

  // ---- 粉裙子先画，胳膊压在裙子上面，不然手会被裙子盖掉 ----
  const body = [[shL.x - 6, shR.y - 8], [shR.x + 6, shR.y - 8], [344 + sw, 1180], [372 + sw * 1.7, 1256], [190 + sw * 1.7, 1256], [220 + sw, 1180]];
  washFill(ctx, body, '#f4a0bd', S, .5);
  // 裙摆再压一道深粉，裙子就不是一块平板了
  washFill(ctx, [[220 + sw, 1180], [344 + sw, 1180], [372 + sw * 1.7, 1256], [190 + sw * 1.7, 1256]], '#e2739f', S + 30, .22);
  roughPath(ctx, body, S + 5, { closed: true, width: 2.6 });
  roughLine(ctx, 222 + sw, 1178, 342 + sw, 1178, S + 6, { width: 1.8, passes: 1, alpha: .55 });
  // 腿（原画里被纸边切掉了，这里也让它走出画面）
  roughLine(ctx, 258 + sw, 1256, 254 + sw, 1280, S + 11, { width: 2.4, passes: 1 });
  roughLine(ctx, 306 + sw, 1256, 310 + sw, 1280, S + 12, { width: 2.4, passes: 1 });

  // ---- 两条胳膊 ----
  // 举起的右臂：肩 -> 肘（往外撇开，绕过脑袋）-> 手
  const elbow = { x: shR.x + 34 + k * 20, y: (shR.y + hand.y) / 2 + 10 - k * 15 };
  roughPath(ctx, [[shR.x, shR.y], [elbow.x, elbow.y], [hand.x, hand.y]], S + 1, { width: 2.6 });
  drawHand(ctx, hand.x, hand.y, Math.atan2(hand.y - elbow.y, hand.x - elbow.x), S + 2, 1);
  // 垂下的左臂：往反方向摆一下配平，人才不像根木头
  const lw = { x: 206 - k * 24, y: 1188 - k * 9 };
  roughPath(ctx, [[shL.x, shL.y], [218 - k * 15, 1146], [lw.x, lw.y]], S + 3, { width: 2.6 });
  drawHand(ctx, lw.x - 2, lw.y + 13, Math.PI / 2 + k * 0.3, S + 4, 1);

  // ---- 马尾：照着原稿画。原稿里头发是从后脑勺底部正中垂下来的一长束，
  // 直直落到腰线、末端收尖，压在衣服前面——不是扎在头顶的高马尾。
  // 长度约 1.2 个头径、宽度只有头宽的四分之一，几乎等宽到末端才收。
  // 先画马尾再画头，头正好压住发根那一截。
  const root = { x: headX + 2, y: headY + headR - 22 };
  const ctrl = [[0, 0], [-2, 26], [1, 53], [6, 79], [10, 100], [12, 116]]
    .map(([ox, oy], idx) => {
      const t = idx / 5, lag = Math.pow(t, 1.6);      // 发根几乎不动，越靠发梢甩得越开
      return [root.x + ox - k * 18 * lag, root.y + oy - Math.max(0, k) * 5 * lag];
    });
  const spine = smoothSpine(ctrl, 24);
  // 原稿那束头发几乎是等宽的，最后才收成尖，所以别用会中段鼓包的曲线
  const tailW = t => (7 + 6 * Math.min(1, t / 0.25)) * Math.pow(1 - t, 0.35);
  const tail = ribbon(spine, tailW);
  washFill(ctx, tail, '#8a8a8a', S + 13, .2, 'source-over');
  roughPath(ctx, tail, S + 9, { closed: true, width: 2.2 });
  // 束里的竖向发丝——原稿里就是几道顺着垂下来的平行线，跟头上的横线正好对着
  pencil(ctx, 1.5, .5);
  [-0.62, -0.3, 0, 0.3, 0.62].forEach(u => {
    ctx.beginPath();
    offsetSpine(spine, t => tailW(t) * u).forEach(([px, py], idx) => idx ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.stroke();
  });
  // 发梢岔出去的碎发，破掉 ribbon 收口那条平边
  const tip = spine[spine.length - 1], prev = spine[spine.length - 2];
  const tdx = tip[0] - prev[0], tdy = tip[1] - prev[1], td = Math.hypot(tdx, tdy) || 1;
  pencil(ctx, 1.5, .4);
  [-0.3, 0, 0.26].forEach((a, n) => {
    const ca = Math.cos(a), sa = Math.sin(a), len = 9 + n * 3;
    ctx.beginPath();
    ctx.moveTo(tip[0] - tdx / td * 5, tip[1] - tdy / td * 5);
    ctx.lineTo(tip[0] + (tdx * ca - tdy * sa) / td * len, tip[1] + (tdx * sa + tdy * ca) / td * len);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // ---- 头：一道一道横线平涂满，从上排到下。
  // 原稿就是这么涂的，跟马尾的竖发丝形成对比；换成多方向乱涂就不是那张画了。
  const headPts = circlePts(headX, headY, headR, 26);
  roughPath(ctx, headPts, S + 7, { closed: true, width: 2.6 });
  ctx.save();
  ctx.beginPath(); headPts.forEach(([px, py], idx) => idx ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.clip();
  const rnd = mulberry32(S + 8);
  // 每一道的长短、粗细、深浅、间距都不一样：排得一样齐就成了机器画的条纹球。
  // 有的从左边起笔中途收住，有的从右边补一道，叠出来才是手涂的那种不匀。
  for (let row = 0, py = headY - headR + 2; py < headY + headR; row++) {
    pencil(ctx, 3 + rnd() * 2, .3 + rnd() * .22);
    const l = -1.05 + rnd() * .5, r = 1.05 - rnd() * .5;   // 两头各自收进来一点
    ctx.beginPath();
    ctx.moveTo(headX + headR * l, py + (rnd() - .5) * 2);
    ctx.quadraticCurveTo(headX + (rnd() - .5) * 24, py + (rnd() - .5) * 3, headX + headR * r, py + (rnd() - .5) * 2);
    ctx.stroke();
    py += 1.5 + rnd() * 1.9;                                // 间距也不匀
  }
  ctx.restore(); ctx.globalAlpha = 1;
  ctx.restore();
}

// ==================== 小鹅：负责上菜的吉祥物 ====================
function drawGoose(ctx, x, y, scale, flap, step = 0, seed = 55) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  const body = circlePts(0, 0, 26, 24, 0.82);
  washFill(ctx, body, '#ffffff', seed, .5, 'source-over');
  roughPath(ctx, body, seed, { closed: true, width: 2 });
  roughCircle(ctx, -22, -20, 13, seed + 1, { width: 2 });                       // 头
  const beak = [[-34, -20], [-46, -16], [-33, -13]];
  washFill(ctx, beak, '#ef7a1a', seed + 6, .8, 'source-over');                  // 嘴
  roughPath(ctx, beak, seed + 2, { closed: true, width: 1.8, passes: 1 });
  ctx.beginPath(); ctx.arc(-25, -23, 2, 0, 7); ctx.fillStyle = PENCIL; ctx.fill();   // 眼
  const wa = flap * 0.5;
  roughPath(ctx, [[2, -6], [16 + wa * 8, -14 - wa * 12], [22, 2]], seed + 3, { width: 1.8, passes: 1 });    // 翅膀
  // 两只脚丫子，走起来的时候反相前后迈
  const gs = Math.sin(step) * 7;
  roughPath(ctx, [[-8, 21], [-10 + gs, 30], [-18 + gs, 32]], seed + 4, { width: 1.6, passes: 1, color: '#ef7a1a' });
  roughPath(ctx, [[6, 21], [4 - gs, 30], [-4 - gs, 32]], seed + 5, { width: 1.6, passes: 1, color: '#ef7a1a' });
  ctx.restore();
}

// ==================== 街边看热闹的小动物 ====================
// 都跟小鹅一个画法：局部坐标系里画好，外面 translate + scale 摆位置。
// 它们不参与玩法，就是趴在纸角上陪着，会轻轻起伏一下。

function drawCat(ctx, x, y, scale, bob, step = 0, seed = 61) {
  ctx.save();
  ctx.translate(x, y + bob * 2); ctx.scale(scale, scale);
  // 四条腿先画，压在身子底下；走起来前后两条反相
  const cs = Math.sin(step) * 6;
  [[-5 + cs, 24], [13 - cs, 24]].forEach(([lx, ly], n) => {
    const leg = circlePts(lx, ly, 5.5, 12, 0.85);
    washFill(ctx, leg, '#e0a05e', seed + 30 + n, .55);
    roughPath(ctx, leg, seed + 32 + n, { closed: true, width: 1.5, passes: 1 });
  });
  // 尾巴（先画，压在身子底下）
  const tl = ribbon([[16, 10], [30, 6], [36, -8], [28, -18]], 4, 2);
  washFill(ctx, tl, '#e0a05e', seed + 8, .55);
  roughPath(ctx, tl, seed + 9, { closed: true, width: 1.6, passes: 1 });
  const body = circlePts(4, 6, 22, 24, 0.92);
  washFill(ctx, body, '#e0a05e', seed, .55);
  roughPath(ctx, body, seed + 1, { closed: true, width: 2 });
  // 耳朵
  [-1, 1].forEach(i => {
    const ear = [[-6 + i * 12, -18], [-4 + i * 17, -32], [2 + i * 15, -20]];
    washFill(ctx, ear, '#e0a05e', seed + 10 + i, .55);
    roughPath(ctx, ear, seed + 12 + i, { closed: true, width: 1.7, passes: 1 });
  });
  const head = circlePts(-2, -14, 16, 22, 0.95);
  washFill(ctx, head, '#e0a05e', seed + 2, .5);
  roughPath(ctx, head, seed + 3, { closed: true, width: 2 });
  // 眼睛、鼻子、胡子
  ctx.fillStyle = PENCIL; ctx.globalAlpha = .9;
  [-6, 4].forEach(dx => { ctx.beginPath(); ctx.arc(dx, -16, 2.1, 0, 7); ctx.fill(); });
  ctx.beginPath(); ctx.moveTo(-3, -11); ctx.lineTo(0, -11); ctx.lineTo(-1.5, -9); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  pencil(ctx, 1.1, .5);
  [-1, 1].forEach(i => { for (let n = -1; n <= 1; n++) { ctx.beginPath(); ctx.moveTo(i * 5, -11 + n * 2); ctx.lineTo(i * 20, -13 + n * 4); ctx.stroke(); } });
  ctx.globalAlpha = 1;
  // 背上两道虎斑
  [0, 1].forEach(n => roughPath(ctx, [[2 + n * 9, -3], [7 + n * 9, 2], [2 + n * 9, 7]], seed + 20 + n, { width: 1.6, passes: 1, alpha: .5, color: '#a9651f' }));
  ctx.restore();
}

function drawRabbit(ctx, x, y, scale, bob, step = 0, seed = 71) {
  ctx.save();
  ctx.translate(x, y + bob * 2.4); ctx.scale(scale, scale);
  // 兔子不走，是蹦：腾空的时候后脚收起来，落地蹬开
  const tuck = Math.abs(Math.sin(step));
  [[-10, 25 - tuck * 5], [10, 25 - tuck * 5]].forEach(([lx, ly], n) => {
    const foot = circlePts(lx, ly, 6, 12, 0.62);
    washFill(ctx, foot, '#f0e2d4', seed + 30 + n, .75, 'source-over');
    roughPath(ctx, foot, seed + 32 + n, { closed: true, width: 1.5, passes: 1 });
  });
  const body = circlePts(0, 6, 20, 24, 1.02);
  washFill(ctx, body, '#f0e2d4', seed, .7, 'source-over');
  roughPath(ctx, body, seed + 1, { closed: true, width: 2 });
  // 两只长耳朵
  [-1, 1].forEach(i => {
    const ear = ribbon([[i * 7, -12], [i * 10, -28], [i * 9, -44]], 6, 3);
    washFill(ctx, ear, '#f0e2d4', seed + 4 + i, .7, 'source-over');
    washFill(ctx, ribbon([[i * 7, -14], [i * 9, -28], [i * 9, -40]], 3, 1.4), '#eda6bd', seed + 6 + i, .7, 'source-over');
    roughPath(ctx, ear, seed + 8 + i, { closed: true, width: 1.7, passes: 1 });
  });
  const head = circlePts(0, -10, 14, 22);
  washFill(ctx, head, '#f0e2d4', seed + 2, .7, 'source-over');
  roughPath(ctx, head, seed + 3, { closed: true, width: 2 });
  ctx.fillStyle = PENCIL; ctx.globalAlpha = .9;
  [-5, 5].forEach(dx => { ctx.beginPath(); ctx.arc(dx, -12, 2.1, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  washCircle(ctx, 0, -6, 3, '#eda6bd', seed + 11, .9, 'source-over');   // 粉鼻子
  washCircle(ctx, -19, 12, 6, '#f0e2d4', seed + 12, .8, 'source-over'); // 小圆尾巴
  roughCircle(ctx, -19, 12, 6, seed + 13, { width: 1.5, passes: 1 });
  ctx.restore();
}

function drawTurtle(ctx, x, y, scale, bob, step = 0, seed = 81) {
  ctx.save();
  ctx.translate(x, y + bob * 1.6); ctx.scale(scale, scale);
  // 四条腿 + 尾巴。爬起来两条腿反相前后倒，幅度小——它是乌龟
  const ts = Math.sin(step) * 4;
  [[-18 + ts, 12], [16 - ts, 12]].forEach(([lx, ly], n) => {
    const leg = circlePts(lx, ly, 7, 14, 0.8);
    washFill(ctx, leg, '#a8c47a', seed + 20 + n, .7, 'source-over');
    roughPath(ctx, leg, seed + 22 + n, { closed: true, width: 1.5, passes: 1 });
  });
  // 头
  const head = circlePts(26, -2, 9, 18, 0.9);
  washFill(ctx, head, '#a8c47a', seed + 2, .8, 'source-over');
  roughPath(ctx, head, seed + 3, { closed: true, width: 1.8 });
  ctx.beginPath(); ctx.arc(29, -4, 2, 0, 7); ctx.fillStyle = PENCIL; ctx.fill();
  // 龟壳
  const shell = [];
  for (let i = 0; i <= 20; i++) { const a = Math.PI + i / 20 * Math.PI; shell.push([Math.cos(a) * 24, 8 + Math.sin(a) * 22]); }
  washFill(ctx, shell, '#7ea45c', seed, .75, 'source-over');
  roughPath(ctx, shell, seed + 1, { closed: true, width: 2.2 });
  // 壳上的格子
  pencil(ctx, 1.4, .55, '#3f6b34');
  [-12, 0, 12].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx, 8); ctx.lineTo(dx * 1.5, -12); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(-21, -2); ctx.lineTo(21, -2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawLadybug(ctx, x, y, scale, bob, seed = 91) {
  ctx.save();
  ctx.translate(x, y + bob * 3); ctx.scale(scale, scale);
  // 触角
  pencil(ctx, 1.4, .7);
  [-1, 1].forEach(i => { ctx.beginPath(); ctx.moveTo(i * 4, -14); ctx.quadraticCurveTo(i * 12, -24, i * 16, -22); ctx.stroke(); });
  ctx.globalAlpha = 1;
  const shell = circlePts(0, 0, 17, 22, 0.94);
  washFill(ctx, shell, '#e0473c', seed, .78, 'source-over');
  roughPath(ctx, shell, seed + 1, { closed: true, width: 2 });
  // 头 + 中缝
  const head = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI + i / 14 * Math.PI; head.push([Math.cos(a) * 9, -11 + Math.sin(a) * 8]); }
  washFill(ctx, head, '#3a3a3a', seed + 2, .85, 'source-over');
  roughLine(ctx, 0, -12, 0, 16, seed + 3, { width: 1.6, passes: 1 });
  // 黑点
  ctx.fillStyle = '#2f2a25'; ctx.globalAlpha = .9;
  [[-8, -2], [8, -2], [-6, 8], [6, 8]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 3.2, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ==================== 小动物轮流出来溜达 ====================
// 一次只有一只在动：从自己的位置走出去，再原路走回来站好，然后换下一只。
// 每只的速度和走的距离都不一样，出场顺序每轮重新洗牌。
// dir = 往哪边走（+1 右 / -1 左）；face = 这只精灵天生朝哪边（0 表示正面朝观众，不用翻）。
// 路线都是照着躲开粉裙子和右下角那三个按钮量出来的，别随手加长。
const STROLL_GAP = 0.9;              // 上一只站定到下一只出发之间歇多久
// ⚠️ 这个数组的下标跟 render() 里 strollAt(0..3) 的调用一一对应，
// 想换动物的位置就改这里的 x/dir/dist，别整行搬动——搬了就会张冠李戴。
const STROLL = [
  { x: 92,  y: 1150, s: 1,   face: -1, dir:  1, dist: 93,  speed: 30, gait: 'walk' },  // 0 小鹅
  { x: 54,  y: 1232, s: .62, face: -1, dir:  1, dist: 111, speed: 40, gait: 'walk' },  // 1 猫
  { x: 452, y: 1250, s: .56, face:  0, dir:  1, dist: 62,  speed: 55, gait: 'hop'  },  // 2 兔子（右）：裙摆到按钮之间只有 170px，蹦不远
  { x: 156, y: 1248, s: .58, face:  1, dir: -1, dist: 60,  speed: 12, gait: 'walk' },  // 3 乌龟（左）：往右 60px 会撞进裙子，所以往左爬
];
const stroll = { order: [], i: 0, t: 0 };

function shuffleStroll() {
  stroll.order = STROLL.map((_, n) => n);
  for (let n = stroll.order.length - 1; n > 0; n--) {
    const m = Math.floor(Math.random() * (n + 1));
    [stroll.order[n], stroll.order[m]] = [stroll.order[m], stroll.order[n]];
  }
  stroll.i = 0;
}

function updateStroll(dt) {
  if (reduceMotion) return;
  if (!stroll.order.length) shuffleStroll();
  stroll.t += dt;
  const a = STROLL[stroll.order[stroll.i]];
  if (stroll.t > 2 * a.dist / a.speed) {           // 走出去 + 走回来
    stroll.i++;
    if (stroll.i >= stroll.order.length) shuffleStroll();   // 一轮走完，重新洗牌
    stroll.t = -STROLL_GAP;
  }
}

// 这一帧该把第 idx 只画在哪儿：位移、朝向、迈步相位、走路的颠簸/蹦跳的高度
function strollState(idx) {
  const idle = { off: 0, flip: 1, step: 0, lift: 0 };
  if (reduceMotion || !stroll.order.length || stroll.t < 0) return idle;
  if (stroll.order[stroll.i] !== idx) return idle;
  const a = STROLL[idx];
  const u = Math.min(1, stroll.t / (2 * a.dist / a.speed));
  const out = u < 0.5;
  const p = out ? u * 2 : (1 - u) * 2;             // 0 -> 1 -> 0，走出去再走回来
  const step = stroll.t * a.speed / 8;
  const moveDir = out ? a.dir : -a.dir;
  return {
    off: a.dist * p * a.dir,
    flip: (a.face === 0 || moveDir === a.face) ? 1 : -1,   // 掉头要把精灵镜像过来
    step,
    lift: Math.abs(Math.sin(step)) * (a.gait === 'hop' ? 9 : 1.8),
  };
}


// 她自己写在旁边的一句话——每次进游戏随机挑一句。原稿写的是"世界第一漂"，
// 但"世界第一"属于广告法明确限制的绝对化用语，审核大概率按关键词命中打回，
// 换成几句不带绝对化用语、但还是那股得意劲儿的小涂鸦。
const DOODLE_TEXTS = ['今天也要元气满满', '闻香而来', '偷偷馋一口', '美食侦探在此'];
const doodleText = DOODLE_TEXTS[Math.floor(Math.random() * DOODLE_TEXTS.length)];

// ==================== 音效：事件名 -> Platform.audio.play(name) ====================
// 具体怎么发声完全交给平台适配层；core 只负责"这个动作该配哪个音效名"。
const sfx = {
  shoot: () => Platform.audio.play('shoot'),
  stick: () => Platform.audio.play('stick'),
  pop: (chain = 0) => Platform.audio.play('pop', { chain }),
  drop: () => Platform.audio.play('drop'),
  push: () => Platform.audio.play('push'),
  win: () => Platform.audio.play('win'),
  lose: () => Platform.audio.play('lose'),
};

// ==================== 状态 ====================
const state = {
  screen: 'title',        // title | playing | paused | dialog
  lang: 'zh',
  muted: false,
  level: 1,
  score: 0,
  levelScore: 0,
  best: 0,
  grid: [],               // grid[row][col] = {type, seed, pop, shake} | null
  parity: 0,              // 顶行奇偶：下压插行时翻转，保证各行错位关系不乱
  types: [],              // 本关使用的类型
  shotsLeft: 0,
  pushEvery: 6,
  aim: 0,
  current: null,
  next: null,
  ball: null,             // 飞行中的球
  particles: [],
  fallers: [],
  recoil: 0,
  shake: 0,
  swoosh: null,           // 出手时手边划过的那道弧光
  heldPop: 1,             // 下一颗食物落进手里时的弹一下
  time: 0,
  lastResult: null,
};

// ==================== 网格工具 ====================
const colsInRow = row => ((row + state.parity) % 2 === 0 ? COLS_EVEN : COLS_ODD);
const rowShift = row => ((row + state.parity) % 2 === 0 ? 0 : R);
const cellX = (row, col) => GRID_X + R + col * 2 * R + rowShift(row);
const cellY = row => GRID_Y + R + row * ROW_H;

function neighbors(row, col) {
  const odd = (row + state.parity) % 2 !== 0;
  const list = odd
    ? [[row, col - 1], [row, col + 1], [row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]]
    : [[row, col - 1], [row, col + 1], [row - 1, col - 1], [row - 1, col], [row + 1, col - 1], [row + 1, col]];
  return list.filter(([r, c]) => r >= 0 && r < state.grid.length && c >= 0 && c < colsInRow(r));
}

function forEachCell(fn) {
  for (let r = 0; r < state.grid.length; r++)
    for (let c = 0; c < state.grid[r].length; c++)
      if (state.grid[r][c]) fn(state.grid[r][c], r, c);
}

function makeRow(row, types, density = 1) {
  const arr = new Array(colsInRow(row)).fill(null);
  for (let c = 0; c < arr.length; c++) {
    if (Math.random() < density) {
      arr[c] = { type: types[Math.floor(Math.random() * types.length)], seed: Math.floor(Math.random() * 1e6), pop: 0 };
    }
  }
  if (!arr.some(Boolean)) arr[Math.floor(Math.random() * arr.length)] =
    { type: types[Math.floor(Math.random() * types.length)], seed: Math.floor(Math.random() * 1e6), pop: 0 };
  return arr;
}

// 屏幕坐标 -> 最近的空格子（吸附）
function snapCell(x, y) {
  let row = Math.round((y - GRID_Y - R) / ROW_H);
  row = Math.max(0, Math.min(MAX_ROWS + 2, row));
  while (state.grid.length <= row) state.grid.push(new Array(colsInRow(state.grid.length)).fill(null));
  const pick = (r, c) => (r >= 0 && r < state.grid.length && c >= 0 && c < colsInRow(r) && !state.grid[r][c]);
  let bestCell = null, bestD = Infinity;
  for (let r = Math.max(0, row - 1); r <= row + 1; r++) {
    if (r >= state.grid.length) { state.grid.push(new Array(colsInRow(state.grid.length)).fill(null)); }
    for (let c = 0; c < colsInRow(r); c++) {
      if (!pick(r, c)) continue;
      // 第 0 行以外必须挨着已有食物，避免凭空悬在半空
      if (r > 0 && !neighbors(r, c).some(([nr, nc]) => state.grid[nr][nc])) continue;
      const d = Math.hypot(cellX(r, c) - x, cellY(r) - y);
      if (d < bestD) { bestD = d; bestCell = [r, c]; }
    }
  }
  return bestCell;
}

// ==================== 关卡 ====================
// 每关换一批阵容：在 TYPE_ORDER 这个环上按关数往后挪一格再取一段
function levelTypes(n, count) {
  const off = (n - 1) % TYPE_ORDER.length, out = [];
  for (let i = 0; i < count; i++) out.push(TYPE_ORDER[(off + i) % TYPE_ORDER.length]);
  return out;
}

// 隔几发上一次新菜。查表比公式清楚：前几关给足余量，之后逐关收紧，第 7 关起保底 5 发。
const PUSH_EVERY = [15, 12, 10, 9, 7, 6];

function levelConfig(n) {
  return {
    rows: Math.min(8, 5 + Math.floor((n - 1) / 2)),
    typeCount: Math.min(6, 4 + Math.floor((n - 1) / 2)),
    pushEvery: PUSH_EVERY[n - 1] || 5,
    density: n < 3 ? 0.9 : 1,
  };
}

function startLevel(n) {
  const cfg = levelConfig(n);
  state.level = n;
  state.parity = 0;
  state.types = levelTypes(n, cfg.typeCount);
  state.grid = [];
  for (let r = 0; r < cfg.rows; r++) state.grid.push(makeRow(r, state.types, cfg.density));
  state.pushEvery = cfg.pushEvery;
  state.shotsLeft = cfg.pushEvery;
  state.levelScore = 0;
  state.ball = null;
  state.particles = [];
  state.fallers = [];
  state.aim = 0;
  state.recoil = 0;
  state.shake = 0;
  state.swoosh = null;
  state.heldPop = 1;
  state.current = pickType();
  state.next = pickType();
  if (Platform.onStateChange) Platform.onStateChange();   // Web 靠它刷新 DOM 数字；微信没有 DOM，每帧 UICanvas.draw() 自己重画，用不着这个钩子
}

// 只发本关面板上还存在的类型，保证局面永远可解
function livingTypes() {
  const set = new Set();
  forEachCell(cell => set.add(cell.type));
  return set.size ? [...set] : state.types;
}
function pickType() {
  const pool = livingTypes();
  return { type: pool[Math.floor(Math.random() * pool.length)], seed: Math.floor(Math.random() * 1e6) };
}

// ==================== 发射 / 碰撞 ====================
function shoot() {
  if (state.screen !== 'playing' || state.ball || state.fallers.length) return;
  const dir = { x: Math.sin(state.aim), y: -Math.cos(state.aim) };
  state.ball = { x: ORIGIN.x, y: ORIGIN.y, vx: dir.x * SHOT_SPEED, vy: dir.y * SHOT_SPEED, trail: [], ...state.current };
  sparkleBurst(ORIGIN.x, ORIGIN.y, TYPES[state.current.type].color, state.aim);
  state.current = state.next;
  state.next = pickType();
  state.recoil = 1;
  state.heldPop = 0;
  if (!reduceMotion) state.swoosh = { t: 0, aim: state.aim };
  sfx.shoot();
}

function stepBall(dt) {
  const b = state.ball;
  if (!b) return;
  if (!reduceMotion) { b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 7) b.trail.pop(); }
  const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / (R * 0.4)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < WALL_L) { b.x = WALL_L + (WALL_L - b.x); b.vx = Math.abs(b.vx); sfx.stick(); }
    if (b.x > WALL_R) { b.x = WALL_R - (b.x - WALL_R); b.vx = -Math.abs(b.vx); sfx.stick(); }
    if (b.y <= GRID_Y + R) { land(b); return; }
    let hit = false;
    forEachCell((cell, r, c) => {
      if (hit) return;
      if (Math.hypot(cellX(r, c) - b.x, cellY(r) - b.y) < R * 1.82) hit = true;
    });
    if (hit) { land(b); return; }
  }
}

function land(b) {
  state.ball = null;
  const cell = snapCell(b.x, b.y);
  if (!cell) { afterTurn(); return; }
  const [r, c] = cell;
  state.grid[r][c] = { type: b.type, seed: b.seed, pop: 0, born: state.time };
  sfx.stick();
  resolve(r, c);
}

// ==================== 消除 / 掉落 ====================
function sameCluster(row, col) {
  const type = state.grid[row][col].type;
  const seen = new Set([row + ',' + col]);
  const stack = [[row, col]], out = [[row, col]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c)) {
      const k = nr + ',' + nc;
      if (seen.has(k)) continue;
      const cell = state.grid[nr][nc];
      if (cell && cell.type === type) { seen.add(k); stack.push([nr, nc]); out.push([nr, nc]); }
    }
  }
  return out;
}

function floating() {
  const anchored = new Set();
  const stack = [];
  for (let c = 0; c < colsInRow(0); c++) if (state.grid[0] && state.grid[0][c]) { anchored.add('0,' + c); stack.push([0, c]); }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c)) {
      const k = nr + ',' + nc;
      if (!anchored.has(k) && state.grid[nr][nc]) { anchored.add(k); stack.push([nr, nc]); }
    }
  }
  const loose = [];
  forEachCell((cell, r, c) => { if (!anchored.has(r + ',' + c)) loose.push([r, c]); });
  return loose;
}

function popParticles(x, y, color, n = 10) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 190;
    const star = i % 3 === 0;
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 0.5 + Math.random() * 0.4, t: 0,
      color: star ? '#ffdf6b' : color, r: 2 + Math.random() * 4,
      star, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 12,
    });
  }
}

// 出手时手边炸开的一小把亮片，大致顺着球飞出去的方向散
function sparkleBurst(x, y, color, aim, n = 18) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const a = aim - Math.PI / 2 + (Math.random() - .5) * 2.3;
    const sp = 110 + Math.random() * 280;
    state.particles.push({
      x: x + (Math.random() - .5) * 26, y: y + (Math.random() - .5) * 26,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: .32 + Math.random() * .38, t: 0,
      color: Math.random() < .5 ? '#ffd94a' : color,
      r: 4 + Math.random() * 6, star: true,
      rot: Math.random() * 6.28, vr: (Math.random() - .5) * 16, g: 240,
    });
  }
}

function resolve(row, col) {
  const cluster = sameCluster(row, col);
  if (cluster.length < 3) { afterTurn(); return; }

  state.chain = (state.chain || 0) + 1;
  const mult = Math.min(5, state.chain);
  cluster.forEach(([r, c]) => {
    const cell = state.grid[r][c];
    popParticles(cellX(r, c), cellY(r), TYPES[cell.type].color, 9);
    state.grid[r][c] = null;
  });
  addScore(cluster.length * 10 * mult);
  sfx.pop(cluster.length - 3);
  if (!reduceMotion) state.shake = Math.min(10, 3 + cluster.length);

  const loose = floating();
  if (loose.length) {
    loose.forEach(([r, c], i) => {
      const cell = state.grid[r][c];
      state.fallers.push({ x: cellX(r, c), y: cellY(r), vx: (Math.random() - .5) * 90, vy: -60 - Math.random() * 60, rot: 0, vr: (Math.random() - .5) * 6, type: cell.type, seed: cell.seed });
      state.grid[r][c] = null;
    });
    addScore(loose.length * 20);
    sfx.drop();
  }
  // 掉落还在飞的时候不判定，等 update 里 fallers 落完再 afterTurn
  state.pendingTurn = true;
  if (!state.fallers.length) { state.pendingTurn = false; afterTurn(); }
}

function addScore(n) {
  state.score += n;
  state.levelScore += n;
  if (state.score > state.best) { state.best = state.score; save('best', state.best); }
  if (Platform.onStateChange) Platform.onStateChange();   // Web 靠它刷新 DOM 数字；微信没有 DOM，每帧 UICanvas.draw() 自己重画，用不着这个钩子
}

function afterTurn() {
  state.chain = 0;
  while (state.grid.length && state.grid[state.grid.length - 1].every(c => !c)) state.grid.pop();
  // 清完了？
  let any = false;
  forEachCell(() => { any = true; });
  if (!any) { levelClear(); return; }

  state.shotsLeft--;
  if (state.shotsLeft <= 0) pushDown();
  if (checkLose()) return;
  // 手里的球可能是已经消失的类型，换成还在场上的
  const pool = livingTypes();
  if (!pool.includes(state.current.type)) state.current = pickType();
  if (!pool.includes(state.next.type)) state.next = pickType();
  if (Platform.onStateChange) Platform.onStateChange();   // Web 靠它刷新 DOM 数字；微信没有 DOM，每帧 UICanvas.draw() 自己重画，用不着这个钩子
}

function pushDown() {
  state.parity ^= 1;                                   // 顶部插一行 -> 全体行奇偶翻转
  state.grid.unshift(makeRow(0, state.types, 1));
  state.shotsLeft = state.pushEvery;
  sfx.push();
  if (!reduceMotion) state.shake = 8;
}

function checkLose() {
  let dead = false;
  forEachCell((cell, r) => { if (cellY(r) + R > DANGER_Y) dead = true; });
  if (dead) { gameOver(); return true; }
  return false;
}


// ==================== 渲染 ====================
let canvas, ctx;   // 由 boot() 里的 Platform.createCanvas() 赋值，别在模块顶层就用

// 等比缩放 + 居中：Web 版这件事一直是外层 #stage 的 CSS 在做
// （width: min(100vw, 56.25vh) 那套），画布本身只是铺满一个已经算好比例
// 的容器。微信/抖音/TikTok 小游戏的画布是直接铺满整个物理屏幕的，没有
// CSS 这层，长宽比对不上 720x1280 就会整体走样——这里用同一套 contain
// 算法通用实现，两边都吃这一份，不用每个平台各自发明一遍。
// 算出来的缩放和偏移量存起来，触摸坐标换算要用它的逆运算（见 screenToLogical）。
let uiScale = 1, uiOffsetX = 0, uiOffsetY = 0;
// getViewport() 分两组数字：width/height 是画布要铺满的整个物理窗口（用来定
// canvas.width/height，这样画布的位置和尺寸行为是确定的，不用去猜运行时会怎么
// 摆一块比窗口更小的画布）；safeWidth/safeHeight/safeLeft/safeTop 是"内容能完整
// 显示、不会被刘海屏/Home Indicator 手势条这类物理遮挡区域盖住"的安全矩形——
// 等比缩放和居中要按这个算，不能按整个窗口算，见 adapters/wechat.js 的踩坑记录。
// 没有安全区概念的平台（Web，或者 safeWidth/Height 没传）就退化成安全区=整个窗口，
// 算出来跟以前完全一样，不影响 Web 版。
function fitCanvas() {
  const vp = Platform.getViewport();
  const dpr = Math.min(vp.pixelRatio || 1, 2.5);
  const safeW = vp.safeWidth != null ? vp.safeWidth : vp.width;
  const safeH = vp.safeHeight != null ? vp.safeHeight : vp.height;
  const safeL = vp.safeLeft || 0, safeT = vp.safeTop || 0;
  uiScale = Math.min(safeW / W, safeH / H);
  uiOffsetX = safeL + (safeW - W * uiScale) / 2;
  uiOffsetY = safeT + (safeH - H * uiScale) / 2;
  canvas.width = vp.width * dpr;
  canvas.height = vp.height * dpr;
  ctx.setTransform(uiScale * dpr, 0, 0, uiScale * dpr, uiOffsetX * dpr, uiOffsetY * dpr);
}
// 把屏幕物理坐标换算成游戏的逻辑坐标系（720x1280），fitCanvas() 那套变换的逆运算。
// 没有 CSS 可以借的平台（微信/抖音/TikTok）拿它换算触摸事件；
// Web 版靠 getBoundingClientRect() 已经够用，不需要这个。
function screenToLogical(sx, sy) {
  return { x: (sx - uiOffsetX) / uiScale, y: (sy - uiOffsetY) / uiScale };
}

function aimPath() {
  let x = ORIGIN.x, y = ORIGIN.y;
  let dx = Math.sin(state.aim), dy = -Math.cos(state.aim);
  const pts = [[x, y]];
  let bounces = 0;
  for (let i = 0; i < 500; i++) {
    x += dx * 9; y += dy * 9;
    if (x < WALL_L) { x = WALL_L; dx = -dx; bounces++; pts.push([x, y]); }
    else if (x > WALL_R) { x = WALL_R; dx = -dx; bounces++; pts.push([x, y]); }
    if (y <= GRID_Y + R) break;
    let hit = false;
    forEachCell((cell, r, c) => { if (!hit && Math.hypot(cellX(r, c) - x, cellY(r) - y) < R * 1.82) hit = true; });
    if (hit || bounces > 2) break;
  }
  pts.push([x, y]);
  return pts;
}

function drawAim() {
  const pts = aimPath();
  // 虚线从手里那个食物的外沿开始画，别从果子中间穿出来
  pts[0] = [ORIGIN.x + Math.sin(state.aim) * (R + 8), ORIGIN.y - Math.cos(state.aim) * (R + 8)];
  ctx.save();
  ctx.setLineDash([9, 11]);
  pencil(ctx, 2, .42);
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.setLineDash([]);
  // 落点小圈 + 原画里的箭头尖
  const [ex, ey] = pts[pts.length - 1];
  roughCircle(ctx, ex, ey, 9, 321, { width: 1.8, alpha: .45, passes: 1 });
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawDangerLine() {
  let close = false;
  forEachCell((cell, r) => { if (cellY(r) + R > DANGER_Y - ROW_H * 1.2) close = true; });
  const wobble = close && !reduceMotion ? Math.sin(state.time * 14) * 2 : 0;
  roughLine(ctx, 24, DANGER_Y + wobble, W - 24, DANGER_Y - wobble, 909,
    { width: close ? 3 : 2, alpha: close ? .85 : .5, color: close ? '#c9603f' : PENCIL });
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(paperCanvas, 0, 0);
  ctx.save();
  // 裁到逻辑画布范围——ctx.setTransform() 只是把 [0,W]x[0,H] 映射到安全区，
  // 从没真正"裁掉"过画面。Web 版没事是因为 canvas 元素本身被 CSS 死死限制在
  // 720:1280 的比例里，超出的内容天然不可见；微信这边画布物理尺寸是整个窗口，
  // 比安全区更大，任何算出来 Y 超过 H 的东西（最典型的就是 state.fallers 那些
  // 正往下掉、直到 y>H+80 才被移除的悬空食物——消除后的掉落动画，Y 短暂冲出
  // [0,H] 是设计好的"飞出屏幕消失"效果）只要还没冲出整个物理画布，就会被画
  // 到安全区外面、但仍在画布内的那圈"夹缝"里，从那边露出来。裁一刀就够了：
  // 这个 clip 是在 shake 的随机偏移之前设的，所以不会跟着画面震动一起晃。
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);
  }

  drawDangerLine();

  // 网格上的食物
  forEachCell((cell, r, c) => {
    const x = cellX(r, c), y = cellY(r);
    if (y < -R || y > H + R) return;
    let s = 1;
    if (cell.born !== undefined) {
      const age = state.time - cell.born;
      if (age < 0.3) s = 1 + Math.sin(Math.min(1, age / 0.3) * Math.PI) * 0.18;
    }
    if (s !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); drawFood(ctx, cell.type, 0, 0, R, cell.seed); ctx.restore(); }
    else drawFood(ctx, cell.type, x, y, R, cell.seed);
  });

  // 掉落中的食物
  state.fallers.forEach(f => {
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
    drawFood(ctx, f.type, 0, 0, R, f.seed);
    ctx.restore();
  });

  // 溅出来的水彩点和亮片
  state.particles.forEach(p => {
    const a = Math.max(0, 1 - p.t / p.life);
    ctx.globalAlpha = a * (p.star ? .95 : .7);
    ctx.fillStyle = p.color;
    if (p.star) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const r1 = p.r * (0.4 + a * 0.6), r2 = r1 * .32;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * Math.PI * 2, rad = i % 2 ? r2 : r1;
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  if (state.screen === 'playing' && !state.ball && !state.fallers.length) drawAim();
  if (state.ball) {
    // 拖尾：越靠后越小越淡
    state.ball.trail.forEach((t, i) => {
      const f = 1 - i / state.ball.trail.length;
      ctx.globalAlpha = f * .22;
      ctx.fillStyle = TYPES[state.ball.type].color;
      ctx.beginPath(); ctx.arc(t.x, t.y, R * .5 * f, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawFood(ctx, state.ball.type, state.ball.x, state.ball.y, R, state.ball.seed);
  }

  // 出手的弧光，划一下就没
  if (state.swoosh && state.swoosh.t < 0.3) {
    const u = state.swoosh.t / 0.3;
    ctx.save();
    ctx.translate(ORIGIN.x, ORIGIN.y); ctx.rotate(state.swoosh.aim);
    pencil(ctx, 4.6 * (1 - u) + 0.8, (1 - u) * 0.7, '#f7a520');
    ctx.beginPath(); ctx.arc(0, 0, 26 + u * 58, -Math.PI * 0.82, -Math.PI * 0.18); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // 手里的下一颗先画，小姑娘压在它上面——三条手指线要搭在食物下缘上才像捏着。
  // 胳膊本来就在食物下方，不会跟着盖过去。
  if (!state.ball && state.current) {
    ctx.save();
    girlTransform(ctx, state.aim, state.recoil);
    const t = state.heldPop, pop = 1 + 1.9 * Math.pow(t - 1, 3) + 0.9 * Math.pow(t - 1, 2);
    ctx.translate(ORIGIN.x, ORIGIN.y); ctx.scale(pop, pop);
    drawFood(ctx, state.current.type, 0, 0, R, state.current.seed);
    ctx.restore();
  }
  drawGirl(ctx, state.aim, state.recoil);

  // 她自己写在旁边的一句话——见文件顶部 DOODLE_TEXTS，每次进游戏随机挑一句
  handwrite(ctx, doodleText, 542, 1116, 30, 4242, { rot: -0.09, alpha: .6 });
  roughPath(ctx, [[452, 1146], [490, 1140], [530, 1148], [572, 1140], [612, 1147]], 4243, { width: 1.6, passes: 1, alpha: .35 });

  // 街边看热闹的小动物：站着的时候各自用不同频率轻轻起伏，别整齐划一地一起动
  const bob = f => reduceMotion ? 0 : Math.sin(state.time * f);
  const flap = state.screen === 'dialog' && state.lastResult === 'win' ? (Math.sin(state.time * 12) + 1) / 2
             : state.recoil > 0 ? (Math.sin(state.time * 30) + 1) / 2 * state.recoil : 0;
  // 轮到谁散步，谁就带着位移和迈步相位画；其余的原地站着
  const strollAt = (idx, fn) => {
    const a = STROLL[idx], w = strollState(idx);
    ctx.save();
    ctx.translate(a.x + w.off, a.y - w.lift);
    if (w.flip < 0) ctx.scale(-1, 1);
    fn(w);
    ctx.restore();
  };
  strollAt(0, w => drawGoose(ctx, 0, 0, 1, flap, w.step));
  strollAt(1, w => drawCat(ctx, 0, 0, .62, bob(1.7), w.step));
  strollAt(2, w => drawRabbit(ctx, 0, 0, .56, bob(2.3), w.step));
  strollAt(3, w => drawTurtle(ctx, 0, 0, .58, bob(1.2), w.step));
  drawLadybug(ctx, 648, 1062, .5, bob(3.1));   // 瓢虫不在裙子边上，就让它趴着
  // 下一个吃的：画成她头顶飘出来的一串思考泡泡——贴着头的地方是小圆点，
  // 一路沿直线变大，最大的那个泡泡里才是真正的下一个，像是从她脑子里冒出来的。
  // 位置是相对静止时的头部（headX/headY，见 drawGirl）算的，不参与出手动画，
  // 泡泡稳稳地飘在原地。
  if (state.next) {
    const headEdge = { x: 282 - 48 * .7, y: 1032 - 48 * .7 };  // 头轮廓左上边缘
    const bub = { x: 166, y: 890 };                             // 最大那个泡泡
    const dotAt = t => ({ x: headEdge.x + (bub.x - headEdge.x) * t, y: headEdge.y + (bub.y - headEdge.y) * t });
    [[.25, 4], [.5, 9], [.75, 15]].forEach(([t, r], n) => {
      const p = dotAt(t);
      roughCircle(ctx, p.x, p.y, r, 780 + n, { width: 1.3, alpha: .3, passes: 1 });
    });
    roughCircle(ctx, bub.x, bub.y, 31, 771, { width: 1.6, alpha: .35, passes: 1 });
    drawFood(ctx, state.next.type, bub.x, bub.y, R * 0.62, state.next.seed);
  }

  ctx.restore();
}

// ==================== 主循环 ====================
function update(dt) {
  state.time += dt;
  state.recoil = Math.max(0, state.recoil - dt * 1.9);     // 整套甩臂大约 0.53 秒
  state.shake = Math.max(0, state.shake - dt * 40);
  if (state.swoosh) { state.swoosh.t += dt; if (state.swoosh.t > 0.3) state.swoosh = null; }
  if (!state.ball) state.heldPop = Math.min(1, state.heldPop + dt * 4.5);
  updateStroll(dt);

  if (state.screen === 'playing') stepBall(dt);

  for (let i = state.fallers.length - 1; i >= 0; i--) {
    const f = state.fallers[i];
    f.vy += 1900 * dt;
    f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
    if (f.y > H + 80) state.fallers.splice(i, 1);
  }
  if (state.pendingTurn && !state.fallers.length) { state.pendingTurn = false; afterTurn(); }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.t += dt;
    p.vy += (p.g || 700) * dt;
    if (p.star) p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t >= p.life) state.particles.splice(i, 1);
  }
}

let lastT = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0);
  lastT = ts;
  if (state.screen !== 'paused') update(dt);
  render();
  // 没有 DOM 的平台（微信/抖音/TikTok 小游戏）把标题/HUD/弹框也画在这块画布上；
  // Web 版这些是独立的 DOM 元素，Platform.ui 留空，这一行什么都不做。
  if (Platform.ui) Platform.ui.draw(ctx);
  requestAnimationFrame(loop);
}


// ==================== 存档 / 文案 ====================
// 键名前缀保持 fat-goose- 不动：改了的话已经存下的最高分和设置会全部读不到
function save(k, v) { try { Platform.storage.set('fat-goose-' + k, String(v)); } catch (e) {} }
function load(k) { try { return Platform.storage.get('fat-goose-' + k); } catch (e) { return null; } }
const t = k => I18N[state.lang][k];

// ==================== 瞄准手势：按下瞄准、拖动跟随、松手发射 ====================
// 平台适配层只管把原始触摸/鼠标事件换算成这个逻辑坐标系（720x1280）里的 x,y，
// "按下算不算开始瞄准""松手算不算发射"这套状态机是共享的，不用每个平台各写一份。
let aiming = false;
function pointToAim(x, y) {
  const dx = x - ORIGIN.x;
  const dy = Math.min(y - ORIGIN.y, -30);      // 不允许往下瞄
  const a = Math.atan2(dx, -dy);
  state.aim = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
}
function onPointerDown(x, y) {
  if (state.screen !== 'playing') return;
  aiming = true;
  pointToAim(x, y);
}
function onPointerMove(x, y, isMouse = false) {
  if (state.screen !== 'playing') return;
  if (isMouse || aiming) pointToAim(x, y);
}
function onPointerUp(x, y) {
  if (state.screen !== 'playing') { aiming = false; return; }
  if (aiming) { pointToAim(x, y); shoot(); }
  aiming = false;
}
function onPointerCancel() { aiming = false; }

// ==================== 弹框触发：改 state，具体怎么呈现由各平台的 UI 层决定 ====================
function levelClear() {
  addScore(100 + state.shotsLeft * 15);
  state.lastResult = 'win';
  save('level', Math.max(state.level + 1, Number(load('level') || 1)));
  sfx.win();
  state.screen = 'dialog';
  // 没有 DOM 的平台每帧自己读 state.screen/state.lastResult 画弹框，用不着这个通知；
  // Web 版靠它把 DOM 弹框的文字填上、显示出来——这一步只有它自己知道该往哪个元素写字。
  if (Platform.onDialog) Platform.onDialog(state.lastResult);
}
function gameOver() {
  state.lastResult = 'lose';
  sfx.lose();
  state.isBest = state.score >= state.best && state.score > 0;
  state.screen = 'dialog';
  if (Platform.onDialog) Platform.onDialog(state.lastResult);
}

// ==================== 启动 ====================
// platform 必须实现：
//   createCanvas() / createOffscreenCanvas(w,h) / getViewport() -> {pixelRatio}
//   onResize(fn) [可选] / storage.get(key)/set(key,val) / audio.play(name,opt) / audio.unlock() [可选]
//   systemLang() -> 形如 'zh-CN' 的字符串
// UI 是可选的：平台若没有 DOM、需要在画布上自己画标题/弹框，把 { draw(ctx), hitTest(x,y) }
// 挂到 platform.ui 上，core 每帧画完游戏画面后会调用 Platform.ui.draw(ctx)。
let Platform;
function boot(platform) {
  Platform = platform;
  reduceMotion = !!(Platform.reduceMotion && Platform.reduceMotion());
  canvas = Platform.createCanvas();
  ctx = canvas.getContext('2d');
  buildPaper();
  fitCanvas();
  if (Platform.onResize) Platform.onResize(fitCanvas);

  state.best = Number(load('best') || 0);
  state.muted = load('muted') === '1';
  const savedLang = load('lang');
  state.lang = savedLang || ((Platform.systemLang() || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en');

  startLevel(1);          // 标题页背后就是第一关的画面
  state.screen = 'title';
  requestAnimationFrame(loop);
}


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
// 跟微信那份一样的思路：抖音这边目前也没找到能让我（Claude）远程读控制台的
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

