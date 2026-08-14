#!/usr/bin/env node
/**
 * 抖音直播秒杀参数化一键执行入口
 *
 * 用法:
 *   预演: node run.mjs --plan-name "计划名称" --date 2026-08-12 --stock 29 --limit 99 --profile "Chrome Profile"
 *   执行: 在上述参数后增加 --execute --confirm-plan-name "计划名称"
 *
 * 流程: 激活Chrome → 计划列表取plan_id跳转编辑页 → 注入runner → 轮询结果
 * 依赖: Google Chrome已切换到对应profile并登录, DevTools可通过Cmd+Option+J打开, pbcopy可用
 * 注意: 脚本不会自动切换Chrome profile, 请先手动切换到目标profile再运行
 */
import { execSync, spawnSync } from "child_process";
import { writeFileSync, unlinkSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { buildConsoleRunner } from "./build-console-runner.mjs";

// ---------- 参数解析 ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--execute") {
      out.execute = true;
    } else if (args[i].startsWith("--")) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  for (const k of ["plan-name", "date", "stock", "limit", "profile"]) {
    if (!out[k]) throw new Error(`缺少必需参数 --${k}（Chrome个人资料页名称，支持模糊匹配）`);
  }
  if (out.execute && out["confirm-plan-name"] !== out["plan-name"]) {
    throw new Error('--execute 需要 --confirm-plan-name 与 --plan-name 完全一致');
  }
  return out;
}

// ---------- Chrome Profile 模糊匹配 ----------
// 规范化字符串: 去所有空白、转小写
function normalize(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

// 从 Chrome Local State 读取所有 profile 显示名称
function listChromeProfiles() {
  const localStatePath = join(homedir(), "Library/Application Support/Google/Chrome/Local State");
  if (!existsSync(localStatePath)) return [];
  try {
    const raw = readFileSync(localStatePath, "utf8");
    const data = JSON.parse(raw);
    const cache = data?.profile?.info_cache || {};
    return Object.values(cache)
      .map((p) => p.name)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

// 计算相似度分数, 越高越相似 (用于多匹配时排序)
function similarityScore(normProfile, normInput) {
  if (normProfile === normInput) return 1000;
  if (normProfile.endsWith(normInput)) return 900 + normInput.length; // 后缀匹配最可能
  const idx = normProfile.indexOf(normInput);
  if (idx >= 0) return 800 - idx; // 出现位置越靠前越相似
  if (normInput.endsWith(normProfile)) return 700;
  if (normInput.includes(normProfile)) return 600;
  return 0;
}

// 模糊匹配 profile 名称, 返回匹配到的完整名称
function matchProfile(input) {
  const profiles = listChromeProfiles();
  if (profiles.length === 0) return input; // 读不到配置时原样返回

  const normInput = normalize(input);

  // 1. 精确匹配(规范化后完全相等)
  const exact = profiles.find((p) => normalize(p) === normInput);
  if (exact) return exact;

  // 2. 子串匹配(用户输入是profile名的子串, 或反过来)
  const partial = profiles.filter(
    (p) => normalize(p).includes(normInput) || normInput.includes(normalize(p))
  );

  if (partial.length === 1) return partial[0];

  if (partial.length > 1) {
    // 按相似度排序, 最相似的排最前
    const ranked = partial
      .map((p) => ({ name: p, score: similarityScore(normalize(p), normInput) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0].name;
    const list = ranked.map((r, i) => `${i + 1}. "${r.name}"`).join("\n    ");
    throw new Error(
      `profile "${input}" 匹配到 ${partial.length} 个相似结果, 无法自动选择:\n    ${list}\n` +
      `  最可能是 "${best}"\n` +
      `  请传入完整精确的 profile 名称（如 --profile "${best}"）`
    );
  }

  // 3. 没匹配到, 列出可用 profile
  throw new Error(
    `profile "${input}" 未匹配到。可用的 Chrome profile:\n    ${profiles.map((p) => `"${p}"`).join("\n    ")}`
  );
}

// ---------- AppleScript ----------
function osa(script, timeout = 15000) {
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout });
  if (r.status !== 0) throw new Error(`osascript: ${r.stderr.trim() || r.stdout.trim()}`);
  return r.stdout.trim();
}

// ---------- Chrome 基础操作 ----------
const chromeActivate = () => osa(`tell application "Google Chrome" to activate`);
const chromeUrl = () => osa(`tell application "Google Chrome" to get URL of active tab of window 1`);
const chromeTitle = () => osa(`tell application "Google Chrome" to get title of active tab of window 1`);
const chromeNavigate = (url) => osa(`tell application "Google Chrome" to set URL of active tab of window 1 to "${url}"`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Console 注入 (通过剪贴板, 用后即删临时文件) ----------
const TMP_FILE = "/tmp/_douyin_fs_inject.js";

function pasteToConsole(jsCode, opts = {}) {
  const { clear = true, wait = 2, openDevTools = true } = opts;
  // 写临时文件 → pbcopy → 立即删除, 确保不残留
  writeFileSync(TMP_FILE, jsCode);
  try {
    execSync(`pbcopy < "${TMP_FILE}"`);
  } finally {
    unlinkSync(TMP_FILE);
  }

  const lines = [
    `tell application "Google Chrome" to activate`,
    `delay 0.2`,
    `tell application "System Events"`,
  ];
  if (openDevTools) {
    lines.push(`    keystroke "j" using {command down, option down}`);
    lines.push(`    delay 0.8`);
  }
  lines.push(`    key code 53`); // Esc 聚焦 Console 输入
  lines.push(`    delay 0.2`);
  if (clear) {
    lines.push(`    keystroke "a" using command down`);
    lines.push(`    delay 0.15`);
    lines.push(`    key code 51`);
    lines.push(`    delay 0.15`);
  }
  lines.push(`    keystroke "v" using command down`);
  lines.push(`    delay 1.2`);
  lines.push(`    key code 36`); // Enter 执行
  lines.push(`end tell`);
  lines.push(`delay ${wait}`);

  osa(lines.join("\n"), 30000);
}

// ---------- 主流程 ----------
async function main() {
  const p = parseArgs();
  const planName = p["plan-name"];

  if (!p.execute) {
    console.log(JSON.stringify({
      ok: true,
      preview: true,
      writesPerformed: false,
      planName,
      date: p.date,
      stock: Number(p.stock),
      limit: Number(p.limit),
      profile: p.profile,
      next: '复核后增加 --execute --confirm-plan-name 与计划名完全一致',
    }, null, 2));
    return;
  }

  // Profile 模糊匹配
  const matchedProfile = matchProfile(p.profile);
  const profileMatched = matchedProfile !== p.profile;

  console.log(`━━━ 抖音直播秒杀修改 ━━━`);
  console.log(`计划: ${planName}`);
  console.log(`日期: ${p.date}  库存: ${p.stock}  限购: ${p.limit}`);
  if (profileMatched) {
    console.log(`Chrome Profile: "${p.profile}" → 匹配到 "${matchedProfile}"`);
  } else {
    console.log(`Chrome Profile: ${matchedProfile}`);
  }
  console.log(``);
  console.log(`⚠️  请确认 Chrome 已切换到 profile "${matchedProfile}"，3秒后开始执行...`);
  await sleep(3000);

  // 1. 激活 Chrome, 确保在计划列表页
  console.log(`[1/5] 激活 Chrome...`);
  chromeActivate();
  await sleep(500);

  const listUrl = "https://eos.douyin.com/livesite/live/plan";
  if (!chromeUrl().includes("/livesite/live/plan")) {
    console.log(`  导航到计划列表页...`);
    chromeNavigate(listUrl);
    await sleep(3500);
  }

  // 2. 获取 plan_id 并跳转编辑页
  console.log(`[2/5] 获取计划 ID 并跳转编辑页...`);
  // 用 JSON.stringify 安全嵌入 planName, 防止特殊字符
  const gotoCode = `(async()=>{try{const r=await fetch('/data/life/live/plan/list/?page=1&limit=50',{credentials:'include'});const d=await r.json();const list=d.data?.list||d.data||[];const plan=list.find(x=>(x.title||x.plan_name||x.name)===${JSON.stringify(planName)});if(plan){const id=plan.plan_id||plan.id;location.href='/livesite/live/plan/edit?id='+id;document.title='NAV:'+id}else{document.title='NAV_FAIL:not_found'}}catch(e){document.title='NAV_FAIL:'+e.message}})()`;
  pasteToConsole(gotoCode, { wait: 4 });

  // 等待跳转
  let editUrl = "";
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    editUrl = chromeUrl();
    if (editUrl.includes("/plan/edit?id=")) break;
  }
  if (!editUrl.includes("/plan/edit?id=")) throw new Error(`跳转编辑页失败, 当前: ${editUrl}`);
  const planId = editUrl.match(/id=(\d+)/)[1];
  console.log(`  plan_id = ${planId}`);

  // 等待页面加载
  await sleep(2000);

  // 3. 构建 runner
  console.log(`[3/5] 构建 runner...`);
  const runCode = buildConsoleRunner({
    planName,
    execute: true,
    confirmPlanName: planName,
    date: p.date,
    stock: Number(p.stock),
    limit: Number(p.limit),
  });

  // 4. 注入执行
  console.log(`[4/5] 注入 runner 并执行 (16商品约30-90秒)...`);
  // 先清理可能存在的旧结果
  pasteToConsole(`window.__douyinFlashSaleResult=null;window.__douyinFlashSaleCheckpoint=null;window.__codexTargets=null;`, { wait: 1, clear: true });
  // 注入 runner
  pasteToConsole(runCode, { wait: 3, clear: true });

  // 5. 轮询结果
  console.log(`[5/5] 轮询结果...`);
  const checkCode = `document.title='R:'+JSON.stringify(window.__douyinFlashSaleResult||(window.__douyinFlashSaleCheckpoint?{...window.__douyinFlashSaleCheckpoint,_s:'run'}:{_s:'wait'}))`;
  const deadline = Date.now() + 180000;
  let result = null;
  let lastProgress = "";

  while (Date.now() < deadline) {
    await sleep(6000);
    // 检查时不清空 Console, 直接输入 (不干扰 runner 输出)
    pasteToConsole(checkCode, { clear: false, wait: 2, openDevTools: false });
    const title = chromeTitle();
    if (title.startsWith("R:")) {
      try {
        const data = JSON.parse(title.slice(2));
        if (data.verified !== undefined) {
          result = data;
          break;
        }
        if (data._s === "run" && data.completed !== undefined) {
          const prog = `${data.completed}/${data.completed + data.pending}`;
          if (prog !== lastProgress) {
            console.log(`  进度: ${prog}`);
            lastProgress = prog;
          }
        }
      } catch (_) {}
    }
  }

  if (!result) throw new Error("执行超时 (3分钟), 未获取到最终结果");

  // 输出
  console.log(``);
  console.log(`━━━ 执行结果 ━━━`);
  console.log(`计划: ${result.plan}`);
  console.log(`目标商品: ${result.targets}  修改: ${result.changed}  跳过: ${result.skipped}  验证通过: ${result.verified}`);
  console.log(`写入模式: edit=${result.write_modes.edit}, reset=${result.write_modes.reset}`);
  console.log(`耗时: ${(result.network_ms / 1000).toFixed(1)}s`);
  console.log(``);

  if (result.verified === result.targets) {
    console.log(`✅ 全部 ${result.verified} 个商品修改并验证通过`);
    process.exit(0);
  } else {
    console.log(`❌ 验证未通过: verified=${result.verified}, targets=${result.targets}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n❌ 失败: ${e.message}`);
  process.exit(1);
});
