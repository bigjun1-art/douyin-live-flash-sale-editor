---
name: douyin-live-flash-sale-editor
description: Use the user's existing Google Chrome login and the Douyin page's same-origin backend interfaces to parameterize product flash-sale placements in Local Life Live Professional plans. Use when the user asks to 修改直播秒杀、重设投放日期、库存、每人限购、倒计时，停止后重新投放秒杀，或批量更新直播计划里的商品秒杀。 Never use coordinate replay or silently replace the requested API path with UI clicking.
---

# 抖音直播秒杀接口参数化修改

Use the user's logged-in Google Chrome page as the authenticated execution surface. The primary path is same-origin backend requests parameterized from a single run configuration. Recordings and UI are evidence for identity and readback, not a coordinate script.

## Required executable path

This skill is script-backed. Import the bundled builder directly; never reconstruct, slice, or copy its source in chat.

Do not use the legacy `scripts/run.mjs` production entrypoint. It uses clipboard injection and cannot prove the exact bound Chrome profile. Follow the connector and direct DevTools prompt-value path below.

1. Inspect the bound Chrome metadata before any EOS request. Require the exact profile named for the current run. If no profile was named, use only the currently active profile after showing its name; never substitute a remembered profile.
2. In that profile, reuse the current plan-list tab, match the exact visible row named by `live_plan`, invoke its semantic `编辑` action, and obtain the resulting current edit URL. Never reuse a recorded plan ID or a previous run's URL.
3. Confirm the active Chrome app state still shows the exact profile and plan edit URL. Open DevTools Console only because the Chrome connector cannot POST.
4. In the existing Node control session, build the complete runner directly from the installed module:

```js
const { buildConsoleRunner } = await import(
  "file:///absolute/path/to/douyin-live-flash-sale-editor/scripts/build-console-runner.mjs"
);
const parameters = {
  planName,
  date,
  stock,
  limit,
  execute: true,
  confirmPlanName: planName
}; // values from the current request after the user-authorized write scope is resolved
const runCode = buildConsoleRunner(parameters);
```

5. Set the DevTools prompt value to `runCode` directly and press Return once. Do not use `pbcopy`, browser-session clipboard APIs, keyboard paste, character-by-character typing, or ad-hoc source extraction.
6. Poll the exact tab for one compact `CODEX_RESULT` or one exact error. Success requires `verified === targets`; stop on error and never improvise a second runner.

The runner performs plan identity checking, virtual-list target discovery, drawer cleanup, initial readback and exact-match skipping, one canary, automatic `edit`, `disable + create`, or direct `create` selection, concurrency-3 batch writes, and final correct-schema readback. It stores only a compact result and progress counts in page memory.

## Hard execution boundary

1. Use the user's logged-in Google Chrome. Match `metadata.profileName` exactly. Never default to a profile name copied from another user or run.
2. Bind the browser once, claim one `eos.douyin.com` tab, and reuse the browser object, tab, request executor, run object, and target manifest for the entire batch.
3. Execute writes through a writable same-origin Chrome request surface. First use a writable Chrome connector when available. If the Chrome connector is read-only, generate the bundled console runner and use `computer-use` only to set the DevTools prompt value and submit it; this is still Google Chrome same-origin execution.
4. Never use per-product mouse clicks, coordinate replay, the in-app browser, standalone Playwright, raw CDP, AppleScript, or another browser. DevTools may programmatically invoke one semantic flash-sale action per unresolved card solely to discover its current assignment ID. A volatile CSS class is fallback-only.
5. Never persist or expose cookies, tokens, `initKey`, transient profile IDs, or other session secrets.

## Required run parameters

Resolve one immutable object before any write:

```js
run = {
  chrome_profile, live_plan, activity_name,
  start_at, end_at, stock, per_person_limit,
  countdown_switch, countdown_seconds
}
```

- `live_plan`: exact visible plan name; never inherit a recorded plan ID or URL.
- `stock`: positive integer mapped to `assign_quantity`.
- `per_person_limit`: positive integer mapped to `draw_rule.term_list[0].term_value` as a string.
- `start_at`, `end_at`: exact Asia/Shanghai timestamps converted to Unix seconds.
- `countdown_switch`: boolean. When false, force `countdown_seconds: 0`.
- `targets`: exact product name, merchant/store, `component_id`, `coupon_id`, and current `assign_record_id` when present.

Before every execution, show `live_plan`, `stock`, `per_person_limit`, and the resolved time range. Never inherit these values from a prior run. Per-product overrides are allowed only when explicitly supplied.

## Current interface contract

Treat these as the current frontend contract, and verify `status_code === 0` plus product-specific readback on every run.

### Plan interfaces

- `GET /data/life/live/plan/list/` with `page`, `limit`, `user_id`, `types`.
- `GET /data/life/live/plan/detail/` with `plan_id`, `room_id`, `user_id`.
- `POST /data/life/live/plan/save/` with the full preserved plan body: `plan_id`, `title`, `describe`, `card_data`, `live_start_time`, `live_end_time`, `user_id`, `from_room_id`.

Never construct a partial plan-save body. Read current plan detail first, preserve every unrelated field, and change only requested flash-sale card data if the current response proves that a plan save is required.

### Flash-sale assignment interfaces

- Stop: `POST /aweme/v2/namek/merchant/marketing/coupon/assign/disable/`
  - JSON body contains only `coupon_id` and current `assign_record_id` in the verified frontend contract.
- Create: `POST /aweme/v2/namek/merchant/marketing/coupon/assign/`
- Edit: `POST /aweme/v2/namek/merchant/marketing/coupon/assign/edit`
- Detail: `GET /aweme/v2/namek/merchant/marketing/coupon/detail/`
- Discount detail when used by the current activity: `GET /aweme/v2/namek/merchant/marketing/discount/activity/coupon/detail/`
- Assignment records: `GET /aweme/v2/namek/merchant/marketing/coupon/assign/record/`

The scheduled create/edit payload is:

```js
{
  assign_record_id,        // edit only; omit for create
  coupon_id,
  scence: 1,              // LIVE; official field spelling
  assign_quantity: Number(stock),
  start_time: unixStart,
  end_time: unixEnd,
  count_down_switch: Boolean(countdown_switch),
  count_down_seconds: countdown_switch ? Number(countdown_seconds) : 0,
  assign_time_type: 2,    // SPECIFY_TIME
  draw_rule: {
    rule_name: "",
    rule_target: "",
    rule_type: 10,        // COUPON_ISSUE
    term_list: [{
      term_value: String(per_person_limit),
      term_type: 11,      // COUPON_ISSUE_TOLTAL_LIMIT_COUNT; official typo
      term_function: 1,   // FILTER
      term_sign: 21       // LESS_EQUAL
    }]
  }
}
```

The create endpoint also accepts `time_interval`; omit it for scheduled placement unless the current frontend request includes it. For immediate placement use `assign_time_type: 1` and the verified current `time_interval`. Automatic mode is `assign_time_type: 3`.

## Parameterized batch algorithm

1. Read the exact plan once and build a manifest keyed by `info[].product_base_info.product_id`, which is the card's stable `component_id`. For an existing placement, its expected `coupon_id` is `info[].marketing_info.flash_sale.flash_sale_id`; an unassigned plan item has no `flash_sale` value and must still remain in the target manifest.
2. Obtain current `assign_record_id` from plan or assignment-record data when available. Otherwise, in one bounded DevTools preflight, close stale drawers, scan the virtualized list once, invoke each unresolved card's semantic flash-sale action in page JavaScript, and parse the matching `live-detail` or `drop-spike` iframe URL by exact `component_id`. For an assigned item, require the iframe `coupon_id` to equal the plan's `flash_sale_id`. For an unassigned item, require `drop-spike?mode=create`, accept its activity-specific `coupon_id` from that exact component's iframe, and require no `assign_record_id`. Retry one failed card once after drawer cleanup, then stop. Deduplicate by `component_id`. Do not persist `initKey`.
3. Use one mismatched target as a canary. Require the request and response to identify the intended `coupon_id`; do not continue if identity or schema is ambiguous.
4. If a target has no current `assign_record_id` and its drawer proves `mode=create`, call create directly and capture the returned record ID. Otherwise, try the complete edit payload on the canary. If the API returns `21018`, switch assigned targets to reset mode: call disable with the exact two-field body, require `status_code === 0`, call create without `assign_record_id`, capture the returned new `assign_record_id`, and read the canary back. Do not disable a direct-create target or repeatedly retry edit after the canary selects reset mode.
5. After one successful canary, write remaining targets with bounded concurrency of 3. Require HTTP 200 and `status_code === 0` for every response.
6. Save the plan at most once after all assignments, and only if current plan detail/card data proves a save is needed. Preserve the complete original plan body.
7. Fresh-read every target from the detail interface. Its response is top-level, not wrapped in `data`: stock is `coupon_detail.coupon.init_quantity`, limit is `coupon_detail.draw_rule.term_list[term_type===11].term_value`, and date is `coupon_detail.coupon.draw_start_time/draw_end_time`. Reconcile one visible Chrome sample after the batch; do not reopen 16 drawers merely for UI verification.
8. On CAPTCHA, authentication loss, profile mismatch, schema drift, nonzero `status_code`, missing product identity, or contradictory readback, stop immediately and preserve completed targets. Resume only incomplete IDs.

## Speed rules

- One profile lookup, one browser binding, one claimed tab, one plan-detail read, and one manifest per run.
- Do not reload documentation, rediscover the profile, rebuild helper functions, or reopen the plan for each product.
- Skip exact matches before writes. Parameterize the common payload once and substitute only product IDs and explicit overrides.
- In DevTools, use the exported bundled builder and set the prompt value directly. It clears the console and emits only compact `CODEX_RESULT`; never use a clipboard, character-by-character typing, source slicing, or script reconstruction.
- Keep one in-memory target manifest for the run. After IDs are known, a 16-product change is one canary plus concurrency-3 batches; report measured time, never promise a fixed duration.
- Wait on response completion and specific state predicates. Short waits are allowed only while the page creates a `live-detail` or `drop-spike` iframe during ID discovery.
- Chrome DevTools Console is the supported fallback when the Chrome connector cannot POST. Do not call that a blocker and do not fall back to per-item UI editing.

Run `scripts/test-runner.mjs` and Skill validation after changing Skill code. Do not spend an ordinary production run rebuilding or revalidating unchanged helper code.

## Verification report

Return the compact `CODEX_RESULT`: plan, date, stock, limit, targets, changed, skipped, verified, write modes, and measured time. Report individual exceptions only when present.

Completion requires `verified === targets`, exact plan identity, and fresh detail-interface values matching date, stock, and limit for every target. A click, toast, card text, or HTTP success alone is never enough.
