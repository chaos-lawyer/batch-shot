# BatchShot 代码审计报告

审计时间：2026-07-08

审计范围：本次新增连续截图、分页检测、多字段模板、表单准备和相关 popup/background/content script 改动。

验证结果：

- `node --check` 覆盖主要 background、content、popup、options、offscreen、utils 脚本，已通过。
- `node scripts/check-manifest-scripts.mjs` 已通过。
- `node scripts/test-capture-flow.mjs`、`test-form-prep.mjs`、`test-background-wiring.mjs`、`test-schedule-name.mjs`、`test-pagination-detect.mjs`、`test-sequential-flow.mjs`、`test-capture-page-prep.mjs`、`test-stitch.mjs`、`test-metadata-overlay.mjs`、`test-xlsx.mjs` 已通过。

## 总体结论

新增功能可以通过现有自动化检查，但连续截图链路的失败语义、右键入口行为、脚本注入清单维护方式和测试覆盖仍不够稳。项目规模不大，更应该避免把同一份规则散落在 popup、background、manifest 中，否则后续每加一个 content script 或入口动作，都容易出现“某个入口忘记同步”的问题。

建议优先处理第 1、2 项，它们更接近真实用户路径中的行为问题；第 3、4、5 项属于维护性和测试质量问题；第 6 项是仓库整洁性问题，建议在合并前处理。

## 待整改事项

### 1. 连续截图失败时先设置“完成”状态再抛错，最终状态可能互相覆盖

严重级别：P1

位置：`background/capture-page-runner.js:472`

问题说明：`captureCurrentTabSequence` 在 `catch` 中统计已成功行数后调用 `batchStatus.setStatus(...sequentialDoneStatus...)`，随后继续 `throw error`。消息路由层会捕获该异常并再次把状态设置为错误响应。结果是同一次失败流程可能先显示“完成 N 张，失败 M 张”，随后又被错误状态覆盖；popup 侧也会收到 `ok: false`，但后台状态曾经广播过完成语义。

影响：用户无法准确判断这是部分成功、完全失败还是任务完成；测试也没有覆盖“翻页失败/等待超时后状态如何呈现”的路径。

改进方案：

- 明确连续截图的结果模型：成功完成、部分完成、失败中断三类状态不要混用同一个 `sequentialDoneStatus`。
- `catch` 分支不要先写完成态再抛给上层；可以返回结构化结果，例如 `{ ok: false, successful, failed, statusKey }`，或抛出带 `successful/failed` 元数据的错误，由 message-router 统一设置状态。
- 为 `clickNextPage` 失败、`nextPageWaitTimeoutError`、用户停止任务分别补充测试，断言最终状态只出现一次且语义一致。

### 2. 右键“设为下一页”保存后仍切回列表模式，入口行为不符合连续截图语义

严重级别：P2

位置：`background/action-ui.js:194`

问题说明：`setNextPageSelectorFromContextMenu` 保存了 `sequentialNextSelector`，但同时把 `urlInputMode` 写成 `'list'`。这会导致用户通过右键菜单设置下一页后打开 popup，看见的仍是普通 URL 列表模式，而不是连续截图模式。

影响：选择器已经保存，但入口没有把用户带到对应功能面板，容易造成“操作成功但不知道保存到哪里”的体验问题，也会让后续点击开始截图走普通批量截图路径。

改进方案：

- 将此处保存为 `urlInputMode: 'sequential'`。
- 如果仍需要保留原列表模式，应给出明确原因，并在 popup 打开后可见地提示已保存的下一页选择器。
- 增加一条 action-ui 单元测试，断言右键设置下一页后保存的 mode、selector 和打开 popup 行为。

### 3. content script 注入清单在 manifest、background、popup 中重复维护

严重级别：P2

位置：`background/tab-utils.js:5`、`popup/popup.js:191`、`manifest.json:70`

问题说明：content script 文件列表目前至少维护了三份。`scripts/check-manifest-scripts.mjs` 只校验 `manifest.json` 与 `background/tab-utils.js`，没有覆盖 `popup/popup.js` 里的内联数组。后续如果新增脚本或调整顺序，popup 的 `sendToActiveTab` 很容易漏改。

影响：某些入口可用、某些入口不可用。比如 background 入口能注入 `pagination.js`，但 popup 入口若漏掉它，分页检测会失败。

改进方案：

- 将注入清单集中到一个可复用模块，例如 `content-script-files.js`，由 background 和测试引用。
- popup 不能直接 import background 模块时，也应通过生成脚本或测试校验三份清单完全一致。
- 扩展 `check-manifest-scripts.mjs`，解析 `popup/popup.js` 中实际注入列表，至少在 CI 中阻止三份清单漂移。

### 4. 连续截图测试只覆盖成功路径，缺少最关键的失败和边界用例

严重级别：P2

位置：`scripts/test-sequential-flow.mjs:121`

问题说明：当前 `test-sequential-flow.mjs` 只验证 count=2 时能成功调用签名和点击下一页。对连续截图这种长流程来说，真正容易出问题的是第二页不存在、选择器无效、页面签名不变化、用户停止、报告下载失败、起始 URL 跳转失败等分支。

影响：第 1 项这种状态覆盖问题不会被现有测试发现。代码看起来有测试，但测试没有保护核心失败语义。

改进方案：

- 增加失败路径测试：`clickNextPage` 返回 `{ ok:false }`、签名 15 秒内不变化、`getPageSignature` 返回空、`stopping=true`。
- 断言每种失败最终返回值、状态 key、成功/失败计数、报告是否下载。
- 将等待函数的超时时间和轮询间隔通过依赖注入传入，避免失败测试真实等待 15 秒。

### 5. `content/pagination.js` 职责过宽，分页识别、右键坐标、点击执行、选择器拾取混在一个文件

严重级别：P3

位置：`content/pagination.js:1`

问题说明：该文件同时处理右键上下文缓存、自动识别下一页、点击下一页、页面签名、人工选择下一页。文件当前约 318 行，且依赖 `button-picker.js` 暴露的全局变量和函数。功能仍能运行，但阅读路径比较绕，后续调整选择器规则时容易碰到拾取器 UI 或右键逻辑。

影响：维护成本上升，功能边界不清晰。新增分页规则时，开发者需要理解整套 content 交互，而不是只改检测算法。

改进方案：

- 拆成更清晰的内部函数或文件边界：`pagination-detect`、`pagination-action`、`pagination-picker`、`context-selector`。
- 保持 `content/messages.js` 对外 action 不变，避免影响现有功能。
- 优先提取纯函数，例如候选元素评分函数，方便用 VM/DOM mock 单独测试。

### 6. 仓库中出现疑似手工调试产物，建议不要进入正式代码提交

严重级别：P3

位置：`website/`、`截图.png`、`连续截图功能方案.md`

问题说明：当前工作区新增了 `website/`，体积约 9.9MB，包含大量保存网页资源、`.download` 文件、图片和 CSS/JS 快照。现有测试没有引用这些文件，更像手工验证连续截图时保存的页面。根目录还新增了截图和方案文档。

影响：仓库变大、审查噪音增加，也可能引入与产品无关的第三方页面资源。若确实需要 fixture，应裁剪成最小 HTML/CSS，并放入明确的 `fixtures/` 或 `tests/fixtures/` 目录。

改进方案：

- 若只是本地验证产物，应删除或加入 `.gitignore`。
- 若是测试夹具，应改成最小可复现页面，只保留测试需要的 DOM 结构。
- 文档如需保留，建议移动到 `docs/`，并用清晰文件名说明用途。

## 暂不要求立即修改的观察项

- `popup/url-input.js:getSettings` 只返回 `sequentialStartUrl`，而 selector/count 由 `popup/popup.js:31` 和 `popup/capture-actions.js:25` 另行拼接保存。当前功能可以工作，但状态收集入口分散，后续可以统一为一个 `getSequentialSettings()`，降低漏字段风险。
- `waitForPageSignatureChange` 的等待时间和轮询间隔写死为 15 秒 / 250ms。当前可以接受，但测试和后续配置都会受限，建议后续抽成可配置参数。
- `content/pagination.js` 依赖全局加载顺序。当前 manifest 和 background 顺序正确，并已有脚本校验；若继续增加 content 模块，应考虑更系统地约束全局依赖。
