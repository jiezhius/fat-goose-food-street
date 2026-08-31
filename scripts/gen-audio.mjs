// 把 adapters/web.js 里 WebAudio 现场合成的音效，渲染成微信小游戏能用的 WAV 文件。
// 微信官方文档确认 mp3/aac/wav 三种格式两个平台都完全支持——选 wav 是因为这几个
// 音效都很短（几十到几百毫秒），无压缩的体积完全可以接受，而且不需要任何第三方
// mp3 编码库，纯 JS 手写振荡器 + WAV 文件头就能做，不引入依赖。
//
// 这里精确复刻的是 adapters/web.js 里 playTone() 的算法：
//   - 振荡器：sine/square/sawtooth/triangle 四种标准波形
//   - 频率：可选从 freq 指数滑音到 endFreq（对应 exponentialRampToValueAtTime）
//   - 音量包络：0 线性升到 volume 用时 0.01s，再指数衰减到 0.001 用时到 duration
// 频率是时变的，用相位积分（不是简单的 freq*t）算相位，避免滑音时的相位跳变/破音。
//
// 用法：node scripts/gen-audio.mjs
// 改了 adapters/web.js 里 WEB_SOUNDS 的参数以后，重跑这个脚本就能重新生成。

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'platforms', 'wechat-minigame', 'audio');
mkdirSync(OUT_DIR, { recursive: true });

const SR = 44100;

// 单个振荡器的波形函数：输入弧度相位，输出 [-1, 1]
const WAVEFORM = {
  sine: p => Math.sin(p),
  square: p => (Math.sin(p) >= 0 ? 1 : -1),
  sawtooth: p => {
    const t = (p / (2 * Math.PI)) % 1;
    const tt = t < 0 ? t + 1 : t;
    return 2 * tt - 1;
  },
  triangle: p => {
    const t = (p / (2 * Math.PI)) % 1;
    const tt = t < 0 ? t + 1 : t;
    return 4 * Math.abs(tt - 0.5) - 1;
  },
};

// 复刻 playTone(freq, startTime, duration, type, volume, endFreq)，把结果叠加进 buf（Float32Array）。
// buf 的下标 0 对应音效整体的 t=0。
function renderTone(buf, freq, startTime, duration, type, volume, endFreq) {
  const wave = WAVEFORM[type];
  const startSample = Math.round(startTime * SR);
  const totalDur = duration + 0.02;         // playTone 里 osc.stop 在 duration+0.02
  const nSamples = Math.round(totalDur * SR);
  // 指数滑音的增长率 k：freq(t) = freq * exp(k*t)，滑音只在 [0, duration] 内进行，
  // 之后频率保持在 endFreq（exponentialRampToValueAtTime 到达终值后就不再变化）。
  const k = endFreq ? Math.log(endFreq / freq) / duration : 0;
  for (let i = 0; i < nSamples; i++) {
    const t = i / SR;
    const idx = startSample + i;
    if (idx < 0 || idx >= buf.length) continue;
    const tClamped = Math.min(t, duration);
    // 相位 = 2π * ∫freq(s)ds，0..tClamped；k≈0 时退化成 2π*freq*t，避免除零。
    const phase = Math.abs(k) < 1e-9
      ? 2 * Math.PI * freq * tClamped
      : 2 * Math.PI * (freq / k) * (Math.exp(k * tClamped) - 1);
    // 音量包络：0 -> volume 线性(0.01s)，volume -> 0.001 指数衰减(到 duration)，
    // duration 之后保持在 0.001（约等于听不见，但精确复刻而不是直接切 0）。
    let env;
    if (t < 0.01) env = volume * (t / 0.01);
    else if (t < duration) env = volume * Math.pow(0.001 / volume, (t - 0.01) / (duration - 0.01));
    else env = 0.001;
    buf[idx] += env * wave(phase);
  }
}

// 一个音效可能是好几个 playTone 叠加/错开（比如 pop 的连击、win/lose 的音符序列）。
// notes: [[freq, startTime, duration, type, volume, endFreq], ...]
function synth(notes) {
  const totalDur = Math.max(...notes.map(([, s, d]) => s + d + 0.02)) + 0.02;
  const buf = new Float32Array(Math.round(totalDur * SR));
  notes.forEach(([freq, s, d, type, vol, end]) => renderTone(buf, freq, s, d, type, vol, end || null));
  return buf;
}

function writeWav(path, buf) {
  const n = buf.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;              // mono
  const byteRate = SR * blockAlign;
  const dataSize = n * bytesPerSample;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);                       // fmt chunk size
  out.writeUInt16LE(1, 20);                        // PCM
  out.writeUInt16LE(1, 22);                        // mono
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(16, 34);                       // bits per sample
  out.write('data', 36);
  out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));   // 防止叠加削波
    out.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(path, out);
  return out.length;
}

// ---- 逐个复刻 adapters/web.js 里 WEB_SOUNDS 的定义 ----
const SOUNDS = {
  shoot: () => synth([[300, 0, 0.09, 'triangle', 0.10, 620]]),
  stick: () => synth([[220, 0, 0.07, 'square', 0.07]]),
  drop: () => synth([[500, 0, 0.35, 'sine', 0.09, 120]]),
  push: () => synth([[160, 0, 0.22, 'sawtooth', 0.07, 110]]),
  win: () => synth([523.25, 659.25, 783.99, 1046.5].map((f, i) => [f, i * 0.12, 0.2, 'triangle', 0.13])),
  lose: () => synth([392, 330, 262].map((f, i) => [f, i * 0.16, 0.3, 'sine', 0.12])),
};
// pop 的基础音高随连击数变调（chain 0~6），静态文件生成 7 个等级
for (let chain = 0; chain <= 6; chain++) {
  const base = 660 * Math.pow(1.12, Math.min(chain, 6));
  SOUNDS['pop_' + chain] = () => synth([0, 0.07, 0.14].map((d, i) => [base * (1 + i * 0.25), d, 0.14, 'triangle', 0.11]));
}

let total = 0;
for (const [name, fn] of Object.entries(SOUNDS)) {
  const buf = fn();
  const path = join(OUT_DIR, name + '.wav');
  const bytes = writeWav(path, buf);
  total += bytes;
  console.log(`  ${name}.wav  ${(bytes / 1024).toFixed(1)} KB`);
}
console.log(`完成，共 ${Object.keys(SOUNDS).length} 个文件，合计 ${(total / 1024).toFixed(1)} KB -> ${OUT_DIR}`);
