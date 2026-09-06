// GPT 镜像生成轮询监管脚本
// 用法: node poll.mjs <会话名> [最大等待秒] [输出文件]
// 每10秒轮询一次，stop状态消失 + assistant出现 → 判定完成，提取全部 assistant 内容
// 兜底：assistant 长度增长且 ≥800 字 视为完成；持续生成中则每次检查长度增量
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OPENCLI = path.join('D:', 'opencli-app', 'dist', 'src', 'main.js');
const session = process.argv[2];
const maxWaitSec = parseInt(process.argv[3] || '300', 10);
const outFile = process.argv[4] || '';
const INTERVAL = 10;

function cli(args) {
  try {
    return JSON.parse(execFileSync('node', [OPENCLI, 'browser', session, ...args], { encoding: 'utf8' }));
  } catch (e) {
    return { _err: (e.stdout || e.message || '').toString().slice(0, 300) };
  }
}

const probe = () => cli(['eval',
  "(()=>{const gen=document.querySelector('[data-testid=stop-button],button[aria-label*=Stop]');" +
  "const as=document.querySelectorAll('[data-message-author-role=assistant]');" +
  "const last=as.length?as[as.length-1]:null;" +
  "return JSON.stringify({stop:!!gen,asCount:as.length,len:last?(last.innerText||last.textContent||'').trim().length:0})})()"
]);

const extractAll = () => cli(['eval',
  "(()=>{const as=document.querySelectorAll('[data-message-author-role=assistant]');" +
  "const text=Array.from(as).map(a=>(a.innerText||a.textContent||'').trim()).join('\\n\\n===MSG-BREAK===\\n\\n');" +
  "return JSON.stringify({text:text})})()"
]);

function log(level, msg) {
  console.log(`[${new Date().toISOString().slice(11,19)}] [${level}] ${msg}`);
}

(async () => {
  log('info', `开始轮询监控 session=${session} 上限=${maxWaitSec}s 间隔=${INTERVAL}s`);
  const start = Date.now();
  let prevLen = -1;
  let stableCount = 0;

  while (Date.now() - start < maxWaitSec * 1000) {
    const t = probe();
    if (t._err) { log('warn', `探针异常(等待下轮): ${t._err}`); await new Promise(r=>setTimeout(r,INTERVAL*1000)); continue; }

    const { stop, asCount, len } = t;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);

    // 完成判定1: stop消失且出现assistant（stop=false 即"已结束生成"的强信号）
    if (!stop && asCount >= 1) {
      // 完成判定2: 长度确认稳定（1次防抖，避免 stop 短暂抖动误判）
      if (len == prevLen) {
        stableCount++;
        if (stableCount >= 1) {
          log('done', `生成完成 stop消失 assistant出现 长度=${len} 耗时=${elapsed}s`);
          if (outFile) fs.writeFileSync(outFile, extractAll().text || '', 'utf8');
          log('info', outFile ? `已保存到 ${outFile}` : '（未指定输出文件）');
          process.exit(0);
        }
      } else {
        stableCount = 0;
      }
    } else {
      stableCount = 0;
    }
    prevLen = len;
    log('info', `轮询#${Math.round(elapsed/INTERVAL)+1} stop=${stop} as=${asCount} len=${len} 持续${elapsed}s`);
    await new Promise(r=>setTimeout(r, INTERVAL*1000));
  }

  // 超时兜底：强行提取当前已有内容
  const got = extractAll();
  const gotText = (got.text || '');
  log('warn', `超时(${maxWaitSec}s)，提取当前内容 ${gotText.length} 字`);
  if (outFile && gotText.length) { fs.writeFileSync(outFile, gotText, 'utf8'); log('info', `已保存超时内容到 ${outFile}`); }
  process.exit(2);
})();