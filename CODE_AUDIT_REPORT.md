# BatchShot 代码审计报告

审计时间：2026-07-05

审计范围：本次新增功能和代码后的当前工作区，重点关注代码清晰、简洁、易读、模块边界和后续维护成本。

审计结论：现有测试和语法检查通过，未发现直接阻断运行的语法问题；但新增的搜索模板、按钮选择、定时任务等能力让 `background/service-worker.js`、`content/page-capture.js` 和 popup 定时任务模块重新出现职责膨胀。当前优先整改方向应是拆分高复杂度入口、收敛重复摘要逻辑、清理遗留状态，并明确构建产物与审计文档的版本管理策略。

## 1. 后台入口重新膨胀为巨型模块

位置：`background/service-worker.js`

问题：

- 文件约 970 行，混合状态管理、右键菜单、弹窗行为、离屏文档、截图编排、搜索任务、报表下载、定时任务消息路由、启动恢复等职责。
- 新增搜索模板和定时任务后，入口文件继续承接业务实现，模块边界再次变弱。
- 阅读时需要跨越大范围函数才能理解一次批量截图的完整路径。

影响：

- 新增能力会继续挤入 service worker 入口。
- 截图、搜索、定时、报表、UI action 之间容易产生隐式耦合。
- 后续审查和定位问题成本会上升。

建议：

- 保留 `service-worker.js` 作为事件绑定和依赖装配入口。
- 拆分为：
  - `background/action-ui.js`：action popup、context menu、commands。
  - `background/capture-runner.js`：截图任务运行和清理。
  - `background/job-factory.js`：URL、tab、search job 构造。
  - `background/search-runner.js`：搜索页打开、提交、等待。
  - `background/report-download.js`：CSV/XLSX 报告下载。
  - `background/message-router.js`：runtime message 分发。

验收标准：

- `background/service-worker.js` 降到 200 行以内。
- 截图、搜索、定时任务、报表下载可以分别阅读和测试。

## 2. content script 职责过多

位置：`content/page-capture.js`

问题：

- 同时负责截图准备和恢复、滚动、搜索框填充、CSS selector 生成、右键目标追踪、按钮选择浮层、消息分发。
- 搜索按钮选择器的浮层 UI 与截图滚动逻辑在同一文件中，主题差异很大。
- 大量 DOM/CSS inline style 混在主 content script 中，主流程可读性下降。

影响：

- 搜索能力或截图能力任一侧改动，都需要进入同一个大文件。
- selector 生成逻辑难以单独验证。
- 按钮选择浮层后续扩展时会继续拉大文件。

建议：

- 拆分为：
  - `content/capture-page.js`：prepare、cleanup、scrollTo、metrics。
  - `content/search-form.js`：performSearch、输入事件派发。
  - `content/selector-builder.js`：selectorForElement 和 CSS escape。
  - `content/button-picker.js`：按钮选择浮层和交互。
  - `content/messages.js`：runtime message 分发。

验收标准：

- `content/page-capture.js` 只保留装配和消息路由。
- selector 生成和搜索提交可以独立单测。

## 3. 定时任务摘要逻辑重复

位置：`background/scheduled-task.js`

问题：

- `createTask()` 和 `normalizeTask()` 重复计算 `searchKeywords`、`urlCount`、`urlPreview`。
- 两处逻辑几乎一致，但分别处理新建任务和恢复任务。

影响：

- 后续新增输入模式或 job 类型时容易只改一处。
- UI 预览数量、任务恢复后的摘要可能出现口径不一致。

建议：

- 抽出共享函数：

```js
function summarizeScheduledOptions(options) {
  return { urlCount, urlPreview };
}
```

- `createTask()` 和 `normalizeTask()` 都调用该函数。

验收标准：

- 定时任务摘要逻辑只有一个实现来源。
- 新建任务和恢复任务的 `urlCount/urlPreview` 规则完全一致。

## 4. 定时 alarm 找不到任务时处理语义不清晰

位置：`background/scheduled-task.js`

问题：

- `handleAlarm()` 中 `task` 可能为 `undefined`，但仍执行 `saveTasks(tasks.filter((item) => item.id !== task?.id))`。
- 当前不会直接破坏任务列表，但代码读起来像 alarm 已被正常消费，实际没有明确处理“找不到任务”的情况。

影响：

- 缺少对异常 alarm 或脏数据的显式分支。
- 后续维护者不容易判断这是有意容错还是遗漏。

建议：

- 在找到任务后再保存任务列表。
- 增加明确分支：

```js
if (!task) {
  await chromeApi.alarms.clear(alarm.name);
  return;
}
```

验收标准：

- `handleAlarm()` 中不存在依赖 `task?.id` 的模糊删除逻辑。
- 找不到任务、任务为空、任务有效三种路径清晰分开。

## 5. popup 定时任务模块职责过重

位置：`popup/schedule.js`

问题：

- 同时维护定时任务状态、选中任务、面板开关、任务列表渲染、URL 预览渲染、批量选项构造、保存和取消动作。
- `scheduleBatch()` 既做 UI 校验，也做 batch options 构造、设置持久化、历史记录保存和后台消息发送。
- DOM 创建代码手写较多，业务意图被元素拼装细节稀释。

影响：

- 后续增加重复定时、编辑任务、任务排序等能力时，文件会继续膨胀。
- 测试业务动作需要绕过大量 DOM 细节。

建议：

- 拆分为：
  - `popup/schedule-state.js`：任务列表、选中任务、默认时间。
  - `popup/schedule-render.js`：列表、预览、按钮状态渲染。
  - `popup/schedule-actions.js`：schedule、cancel、refresh。
- 复用现有 DOM helper 或抽一个小型 `el()` helper。

验收标准：

- `scheduleBatch()` 只负责调度业务动作，不直接铺开大量 UI 和设置细节。
- 渲染函数和动作函数可以分开阅读。

## 6. URL 输入模块存在遗留状态和无用变量

位置：`popup/url-input.js`

问题：

- `isPreviewExpanded` 已声明但未使用。
- `captureMode` 在该模块中只从 settings 恢复并原样返回，当前没有对应 UI 在此模块内修改它。

影响：

- 遗留变量会误导读者，以为预览面板有展开状态模型。
- `captureMode` 的所有权不清晰，容易让人误判截图模式仍由 URL 输入模块控制。

建议：

- 删除 `isPreviewExpanded`。
- 如果截图模式已归属其他模块，将 `captureMode` 从 `url-input.js` 移走；如果仍由该模块负责，应补上明确 UI 读写路径。

验收标准：

- `popup/url-input.js` 中没有未使用状态。
- 每个返回的 setting 都能追溯到本模块明确维护的输入控件或状态来源。

## 7. 模板分隔符默认值不统一

位置：`popup/url-input.js`、`utils/settings.js`、`background/service-worker.js`

问题：

- `buildTemplateUrlsFromValues()` 的默认 delimiter 是 `'\\'`。
- 全局默认值 `DEFAULT_SETTINGS.urlTemplateDelimiter` 是 `' :: '`。
- 后台右键追加搜索模板时也使用 `' :: '`。

影响：

- UI 路径通常没问题，但测试或直接调用 `buildTemplateUrlsFromValues()` 时会得到不同解析结果。
- 旧默认值残留增加理解成本。

建议：

- 使用 `DEFAULT_SETTINGS.urlTemplateDelimiter` 作为唯一默认来源。
- 或提取 `DEFAULT_URL_TEMPLATE_DELIMITER` 常量，由设置、解析、后台追加共用。

验收标准：

- 搜索 `'\\'` 不再作为模板分隔符默认值出现。
- 直接调用解析函数和 UI 调用的行为一致。

## 8. 项目文档和构建产物状态需要确认

位置：项目根目录

问题：

- `CODE_AUDIT_REPORT.md` 和 `CSS_SELECTOR_SEARCH_PLAN.md` 当前在 git 状态中显示为删除。
- `dist/` 为未跟踪目录。

影响：

- 审计历史和搜索选择器设计文档可能被误删。
- 构建产物如果没有明确策略，容易造成提交噪音或发布遗漏。

建议：

- 确认两个文档删除是否有意。如果不是，应恢复或重新生成。
- 明确 `dist/` 策略：
  - 若是构建产物，加入 `.gitignore`。
  - 若是发布产物，补充提交和发布说明。

验收标准：

- `git status --short` 中不再出现意外删除的审计/设计文档。
- `dist/` 的忽略或提交策略清晰。

## 已执行验证

本轮审计执行并通过以下检查：

```text
node --check background/service-worker.js background/scheduled-task.js content/page-capture.js popup/schedule.js popup/url-input.js popup/batch-options.js popup/popup.js
node scripts/test-capture-flow.mjs
node scripts/test-stitch.mjs
node scripts/test-metadata-overlay.mjs
node scripts/test-xlsx.mjs
```

验证结论：当前没有发现语法错误或现有脚本测试回归。问题主要集中在模块边界、重复逻辑、遗留状态和项目文件管理。

## 建议整改顺序

1. 先拆分 `background/service-worker.js`，避免新增后台能力继续堆在入口。
2. 拆分 `content/page-capture.js`，隔离截图、搜索、selector 和按钮选择器 UI。
3. 收敛 `background/scheduled-task.js` 的任务摘要逻辑。
4. 简化 `popup/schedule.js`，拆分状态、渲染和动作。
5. 清理 `popup/url-input.js` 的遗留变量和默认分隔符。
6. 明确 `dist/` 与审计/设计文档的版本管理策略。
