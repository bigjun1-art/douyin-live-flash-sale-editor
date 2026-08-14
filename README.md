# 抖音直播计划库存与秒杀编辑

`douyin-live-flash-sale-editor` 是面向 Codex 的抖音本地生活投放自动化 Skill。批量修改直播计划的秒杀日期、库存和限购，并通过精确计划识别、单条 canary 和逐条回读降低误操作风险。

> 非抖音、字节跳动或巨量引擎官方项目。仅限操作自己或已获明确授权的账号，并遵守适用的平台规则和法律。

## 安全边界

- 使用用户本人已登录的 Google Chrome，不保存或导出密码、Cookie、Token、API Key 和浏览器会话。
- 所有写入默认只预演；实际执行必须显式确认目标，并在完成后回读验证。
- 不提交真实广告主 ID、计划 ID、门店 ID、业务数据、HAR、日志或观察账本。
- HTTP 成功不等于业务完成，必须检查业务状态和目标详情。

## 安装

将本仓库目录复制到 Codex 的 Skill 目录，目录名保持为 `douyin-live-flash-sale-editor`。参数和执行边界见 [SKILL.md](SKILL.md)。

## 本地校验

```bash
node scripts/validate-repository.mjs
```

校验包含 Skill 结构、敏感信息模式、Node/Bash 语法和离线自测，不会执行真实平台写入。

## 可见性

本仓库按 MIT License 开源。

## 许可证

见 [MIT License](LICENSE)。

## English summary

Codex Skill for authorized Douyin Local Ads automation on macOS using the user's logged-in Chrome session. Mutating runners are preview-only by default and require explicit target confirmation plus readback. No credentials, cookies, tokens, production identifiers, or business data are included.
