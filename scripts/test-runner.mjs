#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const builder = fileURLToPath(new URL("./build-console-runner.mjs", import.meta.url));
const { buildConsoleRunner, normalizeConfig } = await import(new URL("./build-console-runner.mjs", import.meta.url));
const parameters = {
  planName: "测试直播计划",
  execute: true,
  confirmPlanName: "测试直播计划",
  date: "2026-08-09",
  stock: 9,
  limit: 99,
};
const directRunner = buildConsoleRunner(parameters);
const runner = execFileSync(process.execPath, [
  builder,
  "--plan-name", "测试直播计划",
  "--execute", "true",
  "--confirm-plan-name", "测试直播计划",
  "--date", "2026-08-09",
  "--stock", "9",
  "--limit", "99",
], { encoding: "utf8" });

assert.equal(runner, directRunner);
assert.doesNotThrow(() => new Function(`return ${runner}`));
assert.match(runner, /coupon\/assign\/edit/);
assert.match(runner, /coupon\/assign\/disable\//);
assert.match(runner, /coupon\/assign\//);
assert.match(runner, /apiCode/);
assert.match(runner, /write_modes/);
assert.match(runner, /life_marketing\/drop-spike/);
assert.match(runner, /searchParams\.get\("mode"\) === "create"/);
assert.match(runner, /if \(!target\.assign_record_id\)/);
assert.match(runner, /writeModes\.create \+= 1/);
assert.match(runner, /const assigned = all\.filter/);
assert.match(runner, /const matches = \(row\) => Boolean\(row\)/);
assert.match(runner, /const planTargets = new Map/);
assert.match(runner, /product_base_info\?\.product_id/);
assert.match(runner, /UNASSIGNED_TARGET_MODE/);
assert.doesNotMatch(runner, /innerText\.trim\(\) === "取消"/);
assert.match(runner, /coupon\/detail\/\?coupon_id=.*assign_record_id/);
assert.match(runner, /Array\.isArray\(window\.__codexTargets\)/);
assert.match(runner, /"start":1786204800/);
assert.match(runner, /"end":1786291199/);
assert.match(runner, /"stock":9/);
assert.match(runner, /"limit":99/);
assert.deepEqual(normalizeConfig(parameters), {
  planName: "测试直播计划",
  activityName: "",
  date: "2026-08-09",
  stock: 9,
  limit: 99,
  start: 1786204800,
  end: 1786291199,
  concurrency: 3,
});
assert.throws(() => buildConsoleRunner({ ...parameters, stock: 0 }), /positive integer/);
assert.throws(() => buildConsoleRunner({ ...parameters, execute: false }), /execute confirmation/);
assert.throws(() => buildConsoleRunner({ ...parameters, confirmPlanName: "其他计划" }), /exactly match/);

// Regression: a product without a current placement opens drop-spike?mode=create.
// The runner must discover it, create directly without disable/edit, then read it back.
const originalGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  location: globalThis.location,
  fetch: globalThis.fetch,
  getComputedStyle: globalThis.getComputedStyle,
};
const calls = [];
let frames = [];
const componentId = "component-create-1";
const couponId = "coupon-create-1";
const assignedId = "assignment-created-1";
const mask = {
  isConnected: true,
  offsetParent: {},
  click() { frames = []; },
};
const action = {
  innerText: "设置秒杀",
  click() {
    frames = [{
      src: `https://eos.douyin.com/life_marketing/drop-spike?mode=create&coupon_id=${couponId}&component_id=${componentId}`,
      closest() { return null; },
    }];
  },
};
const scroller = {
  scrollHeight: 800,
  clientHeight: 400,
  scrollTop: 0,
  parentElement: null,
};
const card = {
  parentElement: scroller,
  getAttribute(name) { return name === "aria-label" ? `${componentId}--product` : null; },
  querySelectorAll() { return [action]; },
  querySelector() { return null; },
};
const response = (body) => ({ ok: true, status: 200, async json() { return body; } });
globalThis.window = {};
globalThis.location = { hostname: "eos.douyin.com", href: "https://eos.douyin.com/livesite/live/plan/edit?id=plan-1" };
globalThis.getComputedStyle = (node) => ({ overflowY: node === scroller ? "auto" : "visible" });
globalThis.document = {
  querySelectorAll(selector) {
    if (selector.includes('iframe[src*="/life_marketing/')) return frames;
    if (selector === ".okee-main-drawer-mask-show") return frames.length ? [mask] : [];
    if (selector === "[data-index][data-rfd-draggable-id][aria-label]") return [card];
    return [];
  },
};
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.startsWith("/data/life/live/plan/detail/")) {
    return response({ data: { title: parameters.planName, info: [{
      product_base_info: { product_id: componentId },
      marketing_info: { flash_sale: null },
    }] } });
  }
  if (url === "/aweme/v2/namek/merchant/marketing/coupon/assign/") {
    return response({ status_code: 0, assign_record_id: assignedId });
  }
  if (url.startsWith("/aweme/v2/namek/merchant/marketing/coupon/detail/")) {
    return response({
      status_code: 0,
      coupon_detail: {
        coupon: { init_quantity: parameters.stock, draw_start_time: 1786204800, draw_end_time: 1786291199 },
        draw_rule: { term_list: [{ term_type: 11, term_value: String(parameters.limit) }] },
      },
    });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};
const simulated = await eval(runner);
assert.equal(simulated.targets, 1);
assert.equal(simulated.verified, 1);
assert.deepEqual(simulated.write_modes, { edit: 0, reset: 0, create: 1 });
assert.equal(calls.filter((call) => call.url === "/aweme/v2/namek/merchant/marketing/coupon/assign/").length, 1);
assert.equal(calls.some((call) => call.url.includes("assign/disable")), false);
assert.equal(calls.some((call) => call.url.includes("assign/edit")), false);
Object.assign(globalThis, originalGlobals);

const invalid = spawnSync(process.execPath, [builder, "--plan-name", "x", "--execute", "true", "--confirm-plan-name", "x"], { encoding: "utf8" });
assert.equal(invalid.status, 2);
assert.match(invalid.stderr, /Missing --date/);

console.log("runner regression tests passed");
