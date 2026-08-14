#!/usr/bin/env node

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key || "<end>"}`);
    out[key.slice(2)] = value;
  }
  return out;
}

export function normalizeConfig(input) {
  const planName = input.planName || input["plan-name"];
  const execute = input.execute === true || input.execute === "true";
  const confirmPlanName = input.confirmPlanName || input["confirm-plan-name"];
  const date = input.date;
  const stock = Number(input.stock);
  const limit = Number(input.limit);
  if (!planName) throw new Error("Missing --plan-name");
  if (!execute) throw new Error("Explicit execute confirmation is required");
  if (confirmPlanName !== planName) throw new Error("confirm-plan-name must exactly match plan-name");
  if (!date) throw new Error("Missing --date");
  if (input.stock === undefined || input.stock === "") throw new Error("Missing --stock");
  if (input.limit === undefined || input.limit === "") throw new Error("Missing --limit");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
  if (!Number.isInteger(stock) || stock <= 0) throw new Error("--stock must be a positive integer");
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit must be a positive integer");
  const start = Math.floor(new Date(`${date}T00:00:00+08:00`).getTime() / 1000);
  const end = Math.floor(new Date(`${date}T23:59:59+08:00`).getTime() / 1000);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Invalid --date");
  return {
    planName,
    activityName: input.activityName || input["activity-name"] || "",
    date,
    stock,
    limit,
    start,
    end,
    concurrency: 3,
  };
}

async function browserRunner(cfg) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (fn, timeout = 2500, interval = 50) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = fn();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const jsonFetch = async (url, options) => {
    const response = await fetch(url, { credentials: "include", ...options });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}:${url}`);
      error.httpStatus = response.status;
      throw error;
    }
    const statusCode = Number(body.status_code || 0);
    if (statusCode !== 0) {
      const error = new Error(`API_${statusCode}:${body.status_msg || body.status_message || url}`);
      error.apiCode = statusCode;
      throw error;
    }
    return body;
  };
  const visible = (node) => Boolean(node?.isConnected && node.offsetParent !== null);
  const detailFrames = () => [...document.querySelectorAll([
    'iframe[src*="/life_marketing/live-detail"]',
    'iframe[src*="/life_marketing/drop-spike"]',
  ].join(","))];
  const closeDetailDrawers = async () => {
    for (let attempt = 0; attempt < 3 && detailFrames().length; attempt += 1) {
      const masks = [...document.querySelectorAll(".okee-main-drawer-mask-show")].filter(visible);
      masks.at(-1)?.click();
      if (await waitFor(() => detailFrames().length === 0, 1400)) return;
      const frame = detailFrames().at(-1);
      const drawer = frame?.closest('[class*="drawer"], [class*="Drawer"]');
      const close = drawer && [...drawer.querySelectorAll('button,[role="button"],[aria-label]')]
        .find((node) => visible(node) && /close|关闭/i.test(`${node.getAttribute("aria-label") || ""} ${node.innerText || ""}`));
      close?.click();
      await sleep(200);
    }
    assert(detailFrames().length === 0, "DETAIL_DRAWER_CLOSE_TIMEOUT");
  };
  const cardNodes = () => [...document.querySelectorAll("[data-index][data-rfd-draggable-id][aria-label]")];
  const componentId = (card) => (card.getAttribute("aria-label") || "").split("--")[0];
  const flashAction = (card) => {
    const semantic = [...card.querySelectorAll('button,[role="button"],a,[tabindex]')]
      .find((node) => /秒杀价|设置秒杀|编辑秒杀|仅剩\s*\d+\s*件/.test((node.innerText || "").replace(/\s+/g, " ")));
    return semantic || card.querySelector(".H_GI2");
  };
  const scrollParent = (element) => {
    for (let node = element?.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 50 && /(auto|scroll)/.test(style.overflowY)) return node;
    }
    return null;
  };
  const readAssignment = async (target) => {
    const body = await jsonFetch(`/aweme/v2/namek/merchant/marketing/coupon/detail/?coupon_id=${encodeURIComponent(target.coupon_id)}&assign_record_id=${encodeURIComponent(target.assign_record_id)}`);
    const detail = body.coupon_detail || body.data?.coupon_detail;
    assert(detail?.coupon, `DETAIL_SCHEMA:${target.coupon_id}`);
    const term = (detail.draw_rule?.term_list || []).find((item) => Number(item.term_type) === 11);
    return {
      coupon_id: target.coupon_id,
      component_id: target.component_id,
      stock: Number(detail.coupon.init_quantity),
      limit: Number(term?.term_value),
      start: Number(detail.coupon.draw_start_time),
      end: Number(detail.coupon.draw_end_time),
    };
  };
  const matches = (row) => Boolean(row)
    && row.stock === cfg.stock
    && row.limit === cfg.limit
    && row.start === cfg.start
    && row.end === cfg.end;
  const payload = (target) => ({
    assign_record_id: target.assign_record_id,
    coupon_id: target.coupon_id,
    scence: 1,
    assign_quantity: cfg.stock,
    start_time: cfg.start,
    end_time: cfg.end,
    count_down_switch: false,
    count_down_seconds: 0,
    assign_time_type: 2,
    draw_rule: {
      rule_name: "",
      rule_target: "",
      rule_type: 10,
      term_list: [{ term_value: String(cfg.limit), term_type: 11, term_function: 1, term_sign: 21 }],
    },
  });
  const edit = async (target) => jsonFetch("/aweme/v2/namek/merchant/marketing/coupon/assign/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload(target)),
  });
  const create = async (target) => {
    const createBody = payload(target);
    delete createBody.assign_record_id;
    const created = await jsonFetch("/aweme/v2/namek/merchant/marketing/coupon/assign/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    assert(created.assign_record_id, `CREATE_RECORD_ID:${target.coupon_id}`);
    target.assign_record_id = String(created.assign_record_id);
    return target;
  };
  const reset = async (target) => {
    await jsonFetch("/aweme/v2/namek/merchant/marketing/coupon/assign/disable/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coupon_id: target.coupon_id, assign_record_id: target.assign_record_id }),
    });
    return create(target);
  };

  console.clear();
  const started = performance.now();
  const planId = new URL(location.href).searchParams.get("id") || new URL(location.href).searchParams.get("plan_id");
  assert(location.hostname === "eos.douyin.com", "WRONG_HOST");
  assert(planId, "OPEN_PLAN_EDIT_PAGE_FIRST");
  const planBody = await jsonFetch(`/data/life/live/plan/detail/?plan_id=${encodeURIComponent(planId)}`);
  const plan = planBody.data || planBody;
  assert(plan.title === cfg.planName, `PLAN_MISMATCH:${plan.title || "unknown"}`);
  const planTargets = new Map((plan.info || []).map((item) => ({
    component_id: item?.product_base_info?.product_id || item?.component_id || item?.componentId,
    coupon_id: item?.marketing_info?.flash_sale?.flash_sale_id || null,
  })).filter((target) => target.component_id)
    .map((target) => [String(target.component_id), {
      component_id: String(target.component_id),
      coupon_id: target.coupon_id ? String(target.coupon_id) : null,
    }]));
  assert(planTargets.size > 0, "NO_PLAN_TARGETS");
  assert(planTargets.size === (plan.info || []).length, `PLAN_TARGET_ID_COUNT:${planTargets.size}/${(plan.info || []).length}`);

  await closeDetailDrawers();
  const cachedTargets = Array.isArray(window.__codexTargets) ? window.__codexTargets : [];
  const targets = new Map(cachedTargets
    .filter((target) => target?.component_id && target?.coupon_id && target?.assign_record_id)
    .filter((target) => {
      const expected = planTargets.get(String(target.component_id));
      return expected?.coupon_id && expected.coupon_id === String(target.coupon_id);
    })
    .map((target) => [String(target.component_id), { ...target }]));
  const scanVisible = async () => {
    const visibleIds = cardNodes().map(componentId).filter(Boolean);
    for (const component_id of visibleIds) {
      if (!component_id || targets.has(component_id)) continue;
      const expected = planTargets.get(component_id);
      assert(expected, `COMPONENT_MISMATCH:${component_id}`);
      let frame = null;
      for (let attempt = 0; attempt < 2 && !frame; attempt += 1) {
        await closeDetailDrawers();
        const card = cardNodes().find((candidate) => componentId(candidate) === component_id);
        assert(card, `CARD_STALE:${component_id}`);
        const action = flashAction(card);
        assert(action, `FLASH_ACTION_NOT_FOUND:${component_id}`);
        action.click();
        frame = await waitFor(() => detailFrames().find((candidate) => {
          const candidateUrl = new URL(candidate.src);
          return candidateUrl.searchParams.get("component_id") === component_id;
        }), 4000);
      }
      if (!frame) {
        await closeDetailDrawers();
        throw new Error(`DETAIL_FRAME_TIMEOUT:${component_id}`);
      }
      try {
        const url = new URL(frame.src);
        const target = {
          component_id,
          coupon_id: url.searchParams.get("coupon_id"),
          assign_record_id: url.searchParams.get("assign_record_id") || null,
        };
        assert(target.coupon_id, `MISSING_COUPON_ID:${component_id}`);
        assert(target.assign_record_id || url.searchParams.get("mode") === "create", `MISSING_ASSIGN_RECORD_ID:${component_id}`);
        if (expected.coupon_id) {
          assert(expected.coupon_id === String(target.coupon_id), `COUPON_MISMATCH:${target.coupon_id}`);
        } else {
          assert(url.searchParams.get("mode") === "create" && !target.assign_record_id, `UNASSIGNED_TARGET_MODE:${component_id}`);
        }
        targets.set(component_id, target);
      } finally {
        await closeDetailDrawers();
      }
    }
  };

  if (targets.size !== planTargets.size) {
    const cards = cardNodes();
    assert(cards.length > 0, "PRODUCT_CARDS_NOT_FOUND");
    const scroller = scrollParent(cards[0]);
    assert(scroller, "PRODUCT_SCROLL_CONTAINER_NOT_FOUND");
    const step = Math.max(300, Math.floor(scroller.clientHeight * 0.75));
    for (let top = 0; top <= scroller.scrollHeight - scroller.clientHeight; top += step) {
      scroller.scrollTop = top;
      await sleep(80);
      await scanVisible();
    }
    scroller.scrollTop = scroller.scrollHeight;
    await sleep(80);
    await scanVisible();
  }
  assert(targets.size === planTargets.size, `TARGET_COUNT:${targets.size}/${planTargets.size}`);

  const all = [...targets.values()];
  window.__codexTargets = all;
  const assigned = all.filter((target) => target.assign_record_id);
  const before = [];
  for (let i = 0; i < assigned.length; i += cfg.concurrency) {
    before.push(...await Promise.all(assigned.slice(i, i + cfg.concurrency).map(readAssignment)));
  }
  const beforeByCoupon = new Map(before.map((row) => [row.coupon_id, row]));
  const pending = all.filter((target) => !matches(beforeByCoupon.get(target.coupon_id)));

  const writeModes = { edit: 0, reset: 0, create: 0 };
  let preferredMode = "edit";
  const writeTarget = async (target) => {
    if (!target.assign_record_id) {
      await create(target);
      writeModes.create += 1;
      return;
    }
    if (preferredMode === "reset") {
      await reset(target);
      writeModes.reset += 1;
      return;
    }
    try {
      await edit(target);
      writeModes.edit += 1;
    } catch (error) {
      if (Number(error.apiCode) !== 21018) throw error;
      preferredMode = "reset";
      await reset(target);
      writeModes.reset += 1;
    }
  };

  if (pending.length) {
    const canary = pending[0];
    await writeTarget(canary);
    const canaryReadback = await readAssignment(canary);
    assert(matches(canaryReadback), `CANARY_READBACK:${JSON.stringify(canaryReadback)}`);
    for (let i = 1; i < pending.length; i += cfg.concurrency) {
      await Promise.all(pending.slice(i, i + cfg.concurrency).map(writeTarget));
      window.__douyinFlashSaleCheckpoint = {
        plan: cfg.planName,
        completed: Math.min(pending.length, i + cfg.concurrency),
        pending: Math.max(0, pending.length - i - cfg.concurrency),
      };
    }
  }

  const after = [];
  for (let i = 0; i < all.length; i += cfg.concurrency) {
    after.push(...await Promise.all(all.slice(i, i + cfg.concurrency).map(readAssignment)));
  }
  const failed = after.filter((row) => !matches(row));
  assert(failed.length === 0, `FINAL_READBACK:${JSON.stringify(failed)}`);
  const result = {
    plan: cfg.planName,
    date: cfg.date,
    stock: cfg.stock,
    limit: cfg.limit,
    targets: all.length,
    changed: pending.length,
    skipped: all.length - pending.length,
    verified: after.length,
    write_modes: writeModes,
    network_ms: Math.round(performance.now() - started),
  };
  window.__douyinFlashSaleResult = result;
  console.log("CODEX_RESULT", JSON.stringify(result));
  return result;
}

export function buildConsoleRunner(input) {
  const config = normalizeConfig(input);
  return `(${browserRunner.toString()})(${JSON.stringify(config)})`;
}

const cliArgv = Array.isArray(process.argv) ? process.argv : [];
if (cliArgv[1]?.endsWith("build-console-runner.mjs")) {
  try {
    process.stdout.write(buildConsoleRunner(parseArgs(cliArgv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
