# BatchShot 代码清晰性审计报告

审计范围：当前工作区内的扩展代码，重点关注代码清晰、简洁、易读和后续维护成本。

审计结论：项目整体功能边界清楚，但若继续增加功能，当前 `popup`、`background`、`offscreen` 和导出工具模块会成为主要维护瓶颈。最需要优先处理的是大文件拆分、重复流程收敛、状态模型显式化，以及手写格式生成代码的隔离和测试。

## 1. `popup/popup.js` 文件过大，职责混杂

位置：`popup/popup.js`

问题：

- 文件接近千行，包含 DOM 查询、表单读写、设置保存、URL 模板解析、历史记录管理、链接提取、链接选择器渲染、批量任务启动、暂停/停止控制和事件绑定。
- 多种业务概念共享同一组全局变量，例如 `urlInputMode`、`inputHistory`、`openHistoryType`、`extractedLinkItems`。
- 阅读时需要在文件内大范围跳转，模块边界不明显。

影响：

- 新增功能时容易把更多逻辑继续塞入该文件。
- 局部改动容易影响其他 UI 状态。
- 代码审查和故障定位成本高。

建议：

- 保留 `popup/popup.js` 作为初始化入口，只负责加载模块和绑定顶层事件。
- 拆分为以下模块：
  - `popup/url-input.js`：URL 列表、模板输入、模板预览。
  - `popup/history.js`：输入历史记录读写、渲染、重命名、删除。
  - `popup/link-selector.js`：链接提取结果的筛选、选择、应用。
  - `popup/capture-actions.js`：开始批量、当前页、当前窗口、暂停、停止。
  - `popup/dom.js`：统一管理元素查询和必要的空值断言。

验收标准：

- `popup/popup.js` 降到 150 行以内。
- URL 模板解析、历史记录、链接选择器可以在不加载完整 popup UI 的情况下单独阅读或测试。

## 2. 后台截图流程重复，业务路径不够统一

位置：`background/service-worker.js`

问题：

- `captureCurrentTab`、`captureCurrentWindowTabs`、`runBatch`、`processUrl` 都处理了类似流程：设置状态、准备页面、等待加载、延迟、截图、清理、记录结果、下载报告。
- 当前窗口标签截图和 URL 批量截图使用了不同循环结构，重复了成功/失败行构造逻辑。
- `batchState` 被多个函数直接读写，状态转移不集中。

影响：

- 修改截图流程时容易漏改某个入口。
- 错误处理、清理逻辑和报告行生成可能逐渐分叉。
- 暂停、停止等控制逻辑分散，增加竞态和边界问题排查成本。

建议：

- 引入统一任务模型，例如：
  - `createUrlJobs(urls, options)`
  - `createTabJobs(tabs, options)`
  - `runCaptureJobs(jobs, options)`
  - `captureSingleJob(job, index, total, options)`
- 统一返回结果行结构：
  - `{ index, url, title, filename, status, error }`
- 集中封装状态转移：
  - `startBatchStatus(label)`
  - `updateBatchProgress(index, total, url)`
  - `finishBatchStatus(rows, reportEnabled)`
  - `resetBatchStatus()`

验收标准：

- 当前页、当前窗口、URL 批量三个入口复用同一套单项截图函数。
- 成功/失败报告行只在一个函数中构造。
- `batchState` 的直接赋值集中到少数状态管理函数。

## 3. popup 中存在重复赋值

位置：`popup/popup.js` 运行状态消息监听器附近。

问题：

```js
elements.statusText.textContent = message.statusText;
setRunning(message.running, message.paused ? 'pausedStatus' : 'runningStatus', Boolean(message.paused));
elements.statusText.textContent = message.statusText;
```

`statusText` 被连续赋值两次。原因可能是 `setRunning()` 内部也会覆盖状态文本，调用方只能再次覆盖回来。

影响：

- 暴露了 `setRunning()` 的职责不清：它既设置按钮运行态，又设置状态文本。
- 后续维护者容易继续通过重复赋值绕过状态渲染问题。

建议：

- 将 `setRunning()` 拆成两个函数：
  - `renderRunningControls(state)`
  - `renderStatusText(statusKeyOrText)`
- 或让 `setRunning()` 支持明确参数：
  - `setRunning({ running, paused, statusKey, statusText })`

验收标准：

- 删除重复赋值。
- 状态文本只在一个明确的渲染函数中写入。

## 4. 暂停状态依赖 DOM 图标反推，语义不清

位置：`popup/popup.js` 的 `togglePauseCapture`

问题：

```js
const isPaused = elements.pauseButton.querySelector('.resume-icon').hidden === false;
```

当前是否暂停是通过按钮内图标是否隐藏来推断的。业务状态依赖 UI 结构，图标或 DOM 改动可能破坏暂停逻辑。

影响：

- 状态来源不可靠。
- UI 渲染细节和业务状态耦合。
- 后续更换图标或按钮结构时容易引入隐藏 bug。

建议：

- 维护显式状态对象，例如：

```js
let batchUiState = {
  running: false,
  paused: false
};
```

- `refreshState()` 和后台 `batchStatus` 消息更新该对象。
- `togglePauseCapture()` 只读取 `batchUiState.paused`。
- 图标显示由 `renderRunningControls(batchUiState)` 决定。

验收标准：

- 暂停/恢复逻辑不再读取 `.pause-icon` 或 `.resume-icon`。
- DOM 只作为渲染目标，不作为业务状态来源。

## 5. 设置表单读写重复映射

位置：`options/options.js`

问题：

- `SETTINGS_KEYS`、`readForm()`、`writeForm()` 三处都维护同一批字段。
- 新增设置项时必须同时修改多个位置。
- 数字、布尔、文本字段的读取逻辑散落在手写对象中。

影响：

- 字段遗漏风险高。
- 文件可读性会随设置项增长明显下降。
- 默认值、范围、控件类型之间缺少统一声明。

建议：

- 使用设置字段 schema：

```js
const SETTINGS_FIELDS = [
  { key: 'theme', type: 'value' },
  { key: 'urlListWrap', type: 'checked' },
  { key: 'screenshotQuality', type: 'number', min: 1, max: 100 },
  { key: 'historyLimit', type: 'number', min: 1, max: 50 }
];
```

- 基于 schema 生成：
  - `readForm()`
  - `writeForm(settings)`
  - `bindSaveEvents()`

验收标准：

- 新增普通设置项时只需要在 schema 中声明一次。
- `readForm()` 和 `writeForm()` 中不再出现大段重复字段赋值。

## 6. 手写 XLSX/ZIP 生成逻辑可读性和验证成本高

位置：`utils/xlsx.js`

问题：

- 模块同时负责 XML 转义、列名生成、worksheet XML、hyperlink relationship、CRC32、ZIP header、base64 编码和报告 workbook 生成。
- XLSX/ZIP 是格式细节密集的代码，当前实现缺少测试保护。
- `createXlsxReportDataUrl()` 中包含大量 XML 模板，业务意图被格式细节淹没。

影响：

- 后续调整样式、sheet、链接或兼容性时风险高。
- 一旦生成的 XLSX 在某些软件中打不开，定位成本较高。
- 代码审查者需要同时理解业务和底层文件格式。

建议：

- 优先考虑引入可靠的 XLSX 或 ZIP 生成库，并通过构建流程打包。
- 如果必须保留手写实现，至少拆分为：
  - `utils/zip-store.js`：ZIP store、CRC、二进制拼接。
  - `utils/xlsx-xml.js`：XML 片段、worksheet、relationships。
  - `utils/report-workbook.js`：报告 rows、失败 sheet、链接列等业务逻辑。
- 增加最小测试：
  - 特殊字符正确 XML escape。
  - 空报告、全部成功、部分失败都能生成文件。
  - 生成后的 XLSX 可被解析库打开。

验收标准：

- `createXlsxReportDataUrl()` 只表达“根据报告行生成 workbook”这层业务。
- ZIP 和 XML 细节被隔离。
- 有测试覆盖特殊字符和失败 sheet。

## 7. `offscreen/offscreen.js` 混合了截图拼接、PDF 生成和元数据排版

位置：`offscreen/offscreen.js`

问题：

- 文件内同时存在图片加载、canvas 导出、PDF 字节拼装、日期格式化、元数据字段解析、文本换行、元数据绘制、截图拼接等逻辑。
- PDF 生成和元数据绘制都是独立复杂领域，放在同一个文件里降低主流程可读性。

影响：

- 修改元数据样式时需要穿过 PDF 和 canvas 导出细节。
- 修改导出格式时容易影响截图拼接流程。
- 文件职责过重，不利于单独测试。

建议：

- 拆分为：
  - `offscreen/canvas-export.js`：`canvasToBlob`、`blobToDataUrl`、导出格式选择。
  - `offscreen/pdf.js`：PDF blob 生成。
  - `offscreen/metadata-overlay.js`：元数据字段、换行、绘制。
  - `offscreen/stitch.js`：截图分片拼接。
- `offscreen/offscreen.js` 只保留消息监听和高层编排。

验收标准：

- 主消息处理文件可以在 150 行以内。
- 元数据绘制可以独立测试输入 options 后的行布局。
- PDF 生成和 PNG/JPG 导出互不影响。

## 8. 后台状态文本硬编码英文，和 i18n 体系不一致

位置：`background/service-worker.js`

问题：

- 后台直接发送英文状态文本，例如：
  - `Capturing current page...`
  - `Current page screenshot downloaded.`
  - `Done. ...`
  - `Paused.`
- popup/options 已经有 `i18n` 工具，但后台状态没有统一走消息 key。

影响：

- 多语言体验不一致。
- UI 文案分散，翻译维护成本升高。
- 后续状态文本调整需要在后台业务代码中查找。

建议：

- 后台发送结构化状态：

```js
{
  action: 'batchStatus',
  statusKey: 'batchDoneStatus',
  statusArgs: [successful, failed],
  running,
  paused
}
```

- popup 负责调用 `message(statusKey, statusArgs)` 渲染。
- 对需要保留原始 URL 的进度文本，可以发送：

```js
{
  statusKey: 'batchProgressStatus',
  statusArgs: [index, total, url]
}
```

验收标准：

- `background/service-worker.js` 中不再直接出现用户可见英文状态句子。
- 所有状态文案集中在 `_locales/*/messages.json`。

## 9. DOM 创建代码重复且噪音较多

位置：`popup/popup.js` 的 `renderLinkSelector()`、`renderHistoryMenu()`

问题：

- 多处手写 `document.createElement`、设置 class、dataset、title、aria-label。
- 历史菜单按钮图标直接用长字符串 `innerHTML` 嵌入 SVG。
- 业务数据和 DOM 细节交织，核心逻辑不够突出。

影响：

- 渲染函数冗长。
- 图标、按钮属性、可访问性属性的重复维护成本高。
- 后续新增菜单项容易复制粘贴。

建议：

- 增加小型 DOM helper：

```js
function el(tag, props = {}, children = []) {}
function iconButton({ action, titleKey, iconName }) {}
```

- 或使用 `<template>` 放在 HTML 中，JS 只 clone 并填充数据。
- 图标建议抽成复用函数或静态模板，避免长 SVG 字符串散落在业务渲染函数中。

验收标准：

- `renderHistoryMenu()` 的主体只表达“根据 entries 渲染列表”。
- 按钮创建和图标创建不再重复铺开。

## 10. 部分工具函数重复存在

位置：`utils/helpers.js`、`offscreen/offscreen.js`

问题：

- 日期格式化和 `pad()` 在多个文件中各自实现。
- 数字 clamp 逻辑在设置、后台、offscreen 中都有相似实现。

影响：

- 格式规则或边界规则修改时需要多处同步。
- 同名或近似函数分散，增加认知负担。

建议：

- 新增通用模块：
  - `utils/number.js`：`clampNumber`、`clampInteger`
  - `utils/date-format.js`：`formatDateTime`
- 各处复用同一实现。

验收标准：

- 日期格式化逻辑只有一个来源。
- 截图质量、历史数量、元数据尺寸等 clamp 逻辑有统一 helper。

## 建议整改顺序

1. 先拆分 `popup/popup.js`，降低最大文件的理解成本。
2. 统一 `background/service-worker.js` 的截图任务流程，减少重复路径。
3. 显式化 popup 的运行状态模型，去掉 DOM 反推业务状态。
4. 用 schema 重构 options 设置表单读写。
5. 拆分 `offscreen/offscreen.js`。
6. 拆分或替换 `utils/xlsx.js` 的手写 XLSX/ZIP 实现。
7. 统一状态文案 i18n。
8. 补最小测试，尤其是 URL 模板、报告字段、XLSX 特殊字符、截图任务结果行。

## 建议新增测试点

- URL 模板：
  - 空模板、空条目、缺少 `%s`、多模板多条目组合。
- 文件名和路径：
  - 非法字符清理。
  - `{index}`、`{host}`、`{keyword}`、中文别名替换。
- 报告字段：
  - 英文字段、中文字段、重复字段、未知字段。
- XLSX：
  - URL、标题、错误信息含 `&`、`<`、`>`、引号、换行。
  - 无失败行和有失败行。
- 后台任务：
  - 成功截图生成 `ok` 行。
  - 捕获异常生成 `error` 行。
  - stop/pause 状态转移。

## 总体评价

当前代码的主要问题不是某个局部写法错误，而是模块边界正在变得模糊。功能继续增长时，最容易失控的是 popup UI 逻辑、后台截图编排和手写文件格式生成。建议优先做结构性拆分和状态模型整理，再逐步补测试。这样后续工程师逐项改进时，可以避免在大文件里做高风险局部修补。

## 验收后待解决事项

更新时间：2026-05-30

以下事项来自对第 1-10 项整改结果的逐项验收。已通过的整改不再重复记录，这里只保留仍需工程师继续处理或补强的内容。

### A. popup 初始化顺序仍有隐性耦合

关联审计项：第 1 项

位置：`popup/popup.js`

现状：

- `popup/popup.js` 已拆分到多个模块，入口文件已降到约 150 行，整体整改通过。
- 但入口文件中创建 `history` 时传入的回调引用了后续才初始化的 `urlInput`。
- 当前多数路径不会在初始化期间立即触发这些回调，所以不是阻塞 bug，但它让模块初始化顺序存在隐式约束。

风险：

- 后续如果某个模块在构造期间调用回调，可能触发 `Cannot access 'urlInput' before initialization`。
- 阅读入口文件时，工程师需要理解闭包延迟执行才能确认安全，降低了清晰性。

建议：

- 将模块创建顺序调整为更线性的依赖关系。
- 或让需要互相引用的模块使用显式 adapter 注入，例如 `history.setUrlInputAdapter(...)`。
- 避免在模块构造参数中引用尚未初始化的 `const` 变量。

验收标准：

- `popup/popup.js` 中不再存在依赖后置变量初始化的闭包。
- 模块构造顺序可以从上到下直接阅读，无需依赖“回调不会马上执行”的隐含前提。

### B. XLSX 测试还需补失败 sheet 内容断言

关联审计项：第 6 项

位置：`scripts/test-xlsx.mjs`

现状：

- `utils/xlsx.js` 已拆成 `xlsx.js`、`report-workbook.js`、`xlsx-xml.js`、`zip-store.js`，结构整改通过。
- 已新增 `scripts/test-xlsx.mjs`，覆盖 XML escape、空报告、成功报告、混合成功/失败报告和 ZIP 条目列表。
- 但当前测试只确认 `sheet2.xml` 存在，没有确认失败 sheet 的内容正确。

风险：

- 如果后续失败 sheet 错误地包含全部行、漏掉错误行，或行号/超链接错位，当前测试可能无法发现。

建议：

- 在 `scripts/test-xlsx.mjs` 中读取 `xl/worksheets/sheet2.xml` 的内容。
- 断言失败 sheet：
  - 包含失败行的 URL、标题或错误信息。
  - 不包含成功行的文件名或成功标题。
  - 在无失败行时只包含表头。

验收标准：

- `node scripts/test-xlsx.mjs` 能验证失败 sheet 只包含失败行。
- 测试仍覆盖空报告、全部成功、部分失败三类输入。

### C. 后台错误状态仍未完全 i18n 化

关联审计项：第 8 项

位置：`background/service-worker.js`、`_locales/en/messages.json`、`_locales/zh_CN/messages.json`

现状：

- 正常运行状态已经改为结构化 `statusKey/statusArgs`。
- popup 端已根据 `statusKey/statusArgs` 调用 `message()` 渲染。
- 但后台仍会把部分 `error.message` 作为用户可见状态直接透传给 popup。

典型位置：

- `runBatch()` 的 catch 中调用 `setStatus(error.message, false, false)`。
- `captureCurrentTab()` 消息处理 catch 中调用 `setStatus(error.message, false)`。
- `captureCurrentWindowTabs()` 消息处理 catch 中调用 `setStatus(error.message, false)`。
- `togglePauseBatch`、`startBatch` 的错误响应仍返回英文错误字符串。

风险：

- 中文界面下仍可能看到英文错误。
- 用户可见文案分散在业务代码和 locale 文件中，后续维护时容易遗漏。
- 第 8 项“所有状态文案集中在 `_locales/*/messages.json`”尚未完全达成。

建议：

- 为常见错误定义稳定错误 key，例如：
  - `batchAlreadyRunningError`
  - `noActivePageError`
  - `noCapturableTabsError`
  - `pageLoadTimeoutError`
  - `capturePrepareError`
  - `stitchError`
  - `unknownCaptureError`
- 后台内部可以继续抛 `Error`，但进入用户状态和 `sendResponse` 前应映射为 `{ statusKey, statusArgs }`。
- 对第三方或底层未知错误，用统一兜底 key 加短参数，不直接把原始英文作为主要状态文本。

验收标准：

- `background/service-worker.js` 中用户可见状态不再直接使用英文 `error.message`。
- popup 收到的批量状态优先是 `statusKey/statusArgs`。
- `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json` 都包含新增错误 key。

### D. offscreen 拼接仍缺少真实 canvas 路径测试

关联审计项：第 7 项

位置：`offscreen/stitch.js`、`scripts/test-metadata-overlay.mjs`

现状：

- `offscreen/offscreen.js` 已拆分，结构整改通过。
- `scripts/test-metadata-overlay.mjs` 已覆盖元数据字段解析、日期格式化、换行、band 高度和缩放。
- 但还没有测试真实 `stitchImages()` 路径。

风险：

- metadata top/bottom、last-frame overlap、canvas 尺寸和导出格式之间的组合问题，当前测试无法发现。

建议：

- 增加浏览器环境测试或 mock canvas 测试。
- 至少覆盖：
  - 无元数据拼接。
  - 顶部元数据拼接。
  - 底部元数据拼接。
  - 最后一帧有 overlap 的 full-page 拼接。

验收标准：

- 有测试直接调用或间接验证 `stitchImages()`。
- 测试能确认 canvas 宽高和元数据位置符合预期。

### E. 仍建议补后台任务结果行测试

关联审计项：第 2 项、第 8 项

位置：`background/service-worker.js`

现状：

- 后台截图任务已统一为 job/row 流程，结构整改通过。
- 但核心流程仍缺少单元测试或可替换依赖的测试入口。

风险：

- 成功/失败 row 构造、stop/pause 状态转移、report 下载时机等逻辑后续变更时缺少自动保护。

建议：

- 将纯逻辑函数进一步抽出到可测试模块，或为 Chrome API 做轻量 mock。
- 优先覆盖：
  - 成功截图生成 `ok` row。
  - 捕获异常生成 `error` row。
  - stop 后停止后续 job。
  - pause/resume 状态 key 正确。

验收标准：

- 有脚本或测试文件覆盖后台任务行生成和状态转移。
- 测试可以在不打开真实浏览器标签的情况下运行。

### F. 后台状态测试与生产实现仍未共用同一套代码

关联审计项：第 2 项、第 8 项、验收后事项 E

位置：`background/capture-flow.js`、`background/service-worker.js`、`scripts/test-capture-flow.mjs`

现状：

- 工程师已新增 `background/capture-flow.js` 和 `scripts/test-capture-flow.mjs`。
- `scripts/test-capture-flow.mjs` 覆盖了：
  - `createReportRow()` 成功/失败行生成。
  - `runCaptureJobs()` 在 stop 后停止后续 job。
  - `createBatchStatusState()` 的 start、pause、resume、progress、finish、stop 状态转移。
- 但生产代码 `background/service-worker.js` 仍保留独立的状态实现，例如 `emitStatus()`、`startBatchStatus()`、`finishBatchStatus()`、`requestBatchStop()`、`toggleBatchPause()`。
- `createBatchStatusState()` 当前只被测试使用，没有被 `service-worker.js` 复用。

风险：

- 测试覆盖的是测试专用状态实现，不是实际运行的 service worker 状态实现。
- 未来如果 `service-worker.js` 中的状态逻辑回归，`scripts/test-capture-flow.mjs` 可能仍然通过。
- 这会形成“看起来有测试，实际没有保护生产路径”的误导。

建议：

- 将 `service-worker.js` 的状态管理改为直接使用 `createBatchStatusState()`。
- 或将 `service-worker.js` 当前实际使用的状态 helper 完整抽入 `background/capture-flow.js`，由生产代码和测试共同引用。
- 保持 `onStatus` 注入点用于 service worker 发送 `chrome.runtime.sendMessage()`，测试里则收集状态快照。

建议结构：

```js
const batchStatus = createBatchStatusState((state) => {
  chrome.runtime.sendMessage({ action: 'batchStatus', ...state }).catch(() => {});
});
```

然后生产代码只调用：

```js
batchStatus.start('runningStatus');
batchStatus.updateProgress(index, total, url);
batchStatus.finish(rows, options.reportEnabled);
batchStatus.requestStop();
batchStatus.togglePause();
```

验收标准：

- `background/service-worker.js` 不再维护一套与 `createBatchStatusState()` 重复的状态转移逻辑。
- `scripts/test-capture-flow.mjs` 测到的状态函数就是生产代码实际调用的状态函数。
- 搜索 `startBatchStatus`、`finishBatchStatus`、`requestBatchStop`、`toggleBatchPause` 时，不应再出现只存在于 `service-worker.js` 的重复实现。
