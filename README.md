# BatchShot Chrome Extension

BatchShot 是一个基于 Chrome Extension Manifest V3 的批量网页截图插件。它面向“批量打开 URL、自动截图、自动下载”的工作流，支持全页滚动拼接、可视区截图、PNG/JPG/PDF 输出、中英文界面，以及可选的图片元信息横幅。

这份 README 主要写给后续接手的 AI 或开发者：先理解现有架构，再做小步、可验证的改进。

## 当前能力

- 在 popup 中粘贴 URL 列表，一行一个 URL，按队列逐个截图。
- 使用 URL 模板模式：用 `%s` 占位符批量生成 URL。
- 支持全页截图和当前可视区截图。
- 支持 PNG、JPG、PDF 输出。
- 自动下载截图到指定文件夹。
- 通过 `chrome.storage.local` 保存 popup 和 options 设置。
- 通过 `chrome.i18n` 支持英文和简体中文。
- 可选给图片顶部或底部添加元信息横幅，支持字段顺序、日期格式、字号、颜色、间距、标签和分隔符配置。

## 本地加载

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择本目录：`batch-shot`。
5. 修改文件后，在扩展卡片上点击 reload，再重新测试。

## 目录结构

```text
batch-shot/
├── manifest.json
├── _locales/
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── background/
│   └── service-worker.js
├── content/
│   └── page-capture.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── scripts/
│   └── generate-icons.mjs
├── icons/
│   ├── icon.svg
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── utils/
    ├── helpers.js
    └── settings.js
```

## 核心架构

### `manifest.json`

声明 MV3 扩展入口、权限、默认语言、popup、options、service worker、content script 和图标。当前权限包括：

- `activeTab`
- `downloads`
- `offscreen`
- `scripting`
- `storage`
- `tabs`
- host permissions: `<all_urls>`

如果新增跨域访问、额外 Chrome API 或后台能力，需要先从这里检查权限是否足够。

### `popup/*`

popup 是主操作面板。

- `popup.html` 定义 URL 输入、模板生成、截图模式、文件夹、开始/停止按钮。
- `popup.js` 负责 i18n、读取和保存设置、构造 URL 队列、发送 `startBatch` / `stopBatch` 消息给 service worker、接收批量状态。
- `popup.css` 负责弹窗样式。

注意：popup 生命周期很短，关闭 popup 不应该中断截图队列。运行状态保存在 `background/service-worker.js` 的 `batchState`，popup 重新打开时通过 `getState` 同步状态。

### `options/*`

options 是高级设置页。

- 输出格式：`format`
- 页面加载后延迟：`delay`
- 文件名模板：`filenamePattern`
- 截图报告导出：`reportEnabled`
- 图片元信息横幅：`metadata*` 系列字段

所有默认值集中在 `utils/settings.js` 的 `DEFAULT_SETTINGS`。新增设置时，通常需要同步修改：

- `utils/settings.js`
- `options/options.html`
- `options/options.js`
- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`
- 需要使用该设置的业务代码

### `background/service-worker.js`

这是调度引擎，负责队列、标签页生命周期、截图调用和下载。

主要流程：

1. popup 发送 `startBatch`，payload 中包含设置和 URL 队列。
2. `runBatch()` 创建 offscreen document。
3. 对每个 URL 调用 `processUrl()`。
4. `processUrl()` 创建 active tab，等待页面加载，应用延迟。
5. 根据 `captureMode` 调用 `captureViewport()` 或 `captureFullPage()`。
6. 下载截图。
7. 清理 content script 对页面做过的改动，关闭 tab。
8. 队列结束后关闭 offscreen document。若开启 `reportEnabled`，会在结束前下载 CSV 报告。

重要常量：

- `CAPTURE_SETTLE_MS`: 每次滚动后等待页面稳定的时间。
- `MIN_CAPTURE_INTERVAL_MS`: 两次 `captureVisibleTab` 之间的最小间隔，降低 Chrome 截图频率限制导致的失败概率。

### `content/page-capture.js`

content script 运行在被截图页面里，负责页面测量、滚动、隐藏固定元素和恢复页面状态。

支持的消息：

- `prepare`: 记录原始滚动位置和样式，隐藏 `position: fixed` / `position: sticky` 元素，返回页面尺寸。
- `scrollTo`: 滚动到指定 Y 坐标，并返回浏览器实际滚到的位置。
- `cleanup`: 恢复隐藏元素、滚动行为和原始滚动位置。

这里的 `actualScrollY` 很关键。全页拼接不能只相信请求的滚动坐标，因为页面底部最后一屏通常会被浏览器限制在 `scrollHeight - viewportHeight`。

### `offscreen/offscreen.js`

offscreen document 提供 DOM Canvas 能力，负责把截图片段拼成最终图片，并在需要时绘制元信息横幅。

核心职责：

- 加载每一帧 `dataUrl`。
- 按实际滚动位置绘制到 canvas。
- 对最后一帧做重叠裁剪，避免底部重复内容。
- 绘制顶部或底部 metadata band。
- 用 `canvas.toBlob()` 生成 Blob。
- 用 `FileReader.readAsDataURL()` 转成 Base64 data URL 返回给 service worker。

MV3 service worker 不能稳定下载 offscreen 里创建的 `blob:` URL，所以这里必须返回 Base64 data URL。

### `utils/helpers.js`

通用工具函数：

- `normalizeUrl()`: 没有协议时补 `https://`。
- `sanitizeFilename()`: 清理下载文件名中的非法字符。
- `buildFilename()`: 根据 `{index}` / `{序号}`、`{host}` / `{域名}`、`{title}` / `{标题}`、`{folder}` / `{文件夹}`、`{datetime}` / `{日期时间}` 等占位符生成文件路径。
- `csvEscape()`: 输出 CSV 字段。

### `utils/settings.js`

集中维护默认设置和 storage 读写。

- `DEFAULT_SETTINGS`
- `loadSettings()`
- `saveSettings()`
- `resetSettings()`

新增设置应优先放进这里，避免默认值散落在 UI 和业务逻辑里。

## 消息流

```text
popup.js
  ├─ chrome.runtime.sendMessage({ action: "startBatch", payload })
  ├─ chrome.runtime.sendMessage({ action: "stopBatch" })
  └─ chrome.runtime.sendMessage({ action: "getState" })

service-worker.js
  ├─ chrome.tabs.create({ active: true })
  ├─ chrome.tabs.sendMessage(tab.id, { action: "prepare" })
  ├─ chrome.tabs.sendMessage(tab.id, { action: "scrollTo", y })
  ├─ chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" })
  ├─ chrome.runtime.sendMessage({ action: "stitch", segments, metrics, options })
  ├─ chrome.downloads.download({ url: dataUrl, filename })
  └─ chrome.tabs.sendMessage(tab.id, { action: "cleanup" })

content/page-capture.js
  └─ prepare / scrollTo / cleanup

offscreen/offscreen.js
  └─ stitch -> { ok, dataUrl }
```

## 全页截图拼接算法

Chrome 的 `chrome.tabs.captureVisibleTab()` 只能截当前可视区。全页截图通过“滚动页面、截图每一屏、canvas 拼接”实现。

关键点：

1. 截图前在 content script 中关闭平滑滚动。
2. 隐藏 fixed 和 sticky 元素，避免导航栏或悬浮按钮在每一屏重复出现。
3. 每次滚动后读取 `window.scrollY`，把它作为 `actualScrollY` 返回给后台。
4. offscreen 拼接时按照 `actualScrollY * devicePixelRatio` 放置图片。
5. 最后一帧如果与上一帧重叠，只绘制未重叠部分。

最后一帧裁剪逻辑位于 `offscreen/offscreen.js` 的 `stitchImages()`：

```text
previousFrameBottom = (segments.length - 1) * viewportHeight
overlap = previousFrameBottom - segment.actualScrollY
overlapPx = Math.round(overlap * devicePixelRatio)
```

当 `overlapPx > 0` 时，从最后一帧图片的 `overlapPx` 位置开始绘制，目标位置仍然是 `previousFrameBottom * devicePixelRatio`。

## 重要约束和坑

### `captureVisibleTab` 必须针对活动标签页

`chrome.tabs.captureVisibleTab()` 捕获的是目标窗口当前活动标签页。如果后台创建 inactive tab，可能截到用户正在看的页面。

当前代码在 `processUrl()` 中使用：

```js
chrome.tabs.create({ url, active: true })
```

并在截图前调用 `activateTab()`，同时传入 `tab.windowId`：

```js
chrome.tabs.captureVisibleTab(tab.windowId, options)
```

如果未来想做后台静默截图，需要重新设计，不能简单改成 `active: false`。

### Service worker 不直接下载 offscreen Blob

offscreen document 生成的 `blob:` URL 属于 offscreen 文档上下文。MV3 service worker 直接拿这个 URL 调 `chrome.downloads.download()` 容易出现 `Access Denied` 或 `Network Failed`。

当前正确做法是：offscreen 把 Blob 转成 Base64 data URL，再传回 service worker 下载。

### 停止不是立即中断所有异步任务

`stopBatch` 会设置 `batchState.stopping = true`。全页截图循环在每一帧开始时检查该标记，并在当前页面的 `finally` 中执行清理和关 tab。不要绕过 `finally`，否则页面可能残留隐藏元素或标签页不关闭。

### popup 不等于后台状态

popup 关闭后 DOM 和 JS 会销毁。不要把长期运行状态只放在 `popup.js`。需要跨 popup 生命周期的数据应放到 service worker 状态或 `chrome.storage.local`。

## 设置字段速查

默认设置在 `utils/settings.js`：

| 字段 | 含义 |
| --- | --- |
| `urls` | popup 中的 URL 列表文本 |
| `urlInputMode` | `list` 或 `template` |
| `urlTemplate` | URL 模板，使用 `%s` 占位 |
| `urlTemplateItems` | 模板替换用的文本列表 |
| `captureMode` | `fullPage` 或 `viewport` |
| `format` | `png`、`jpg`、`pdf` |
| `screenshotQuality` | `jpg` / `pdf` 导出质量，1-100；`png` 保持无损 |
| `delay` | 页面加载完成后的等待秒数 |
| `folder` | 下载文件夹 |
| `reportEnabled` | 是否导出 CSV 截图报告 |
| `filenamePattern` | 文件名模板 |
| `filenameDateTimeFormat` | 文件名中 `{datetime}` 的格式 |
| `metadataEnabled` | 是否绘制元信息横幅 |
| `metadataPosition` | `top` 或 `bottom` |
| `metadataLayout` | `stacked` 或 `inline` |
| `metadataFields` | 逗号分隔字段列表 |
| `metadataDateTimeFormat` | metadata 中 `capturedAt` 的日期时间格式 |
| `metadataFontSize` | 元信息字号 |
| `metadataPadding` | 元信息内边距 |
| `metadataGap` | 元信息行距 |
| `metadataTextColor` | 元信息文字颜色 |
| `metadataBackgroundColor` | 元信息背景颜色 |
| `metadataLabelsEnabled` | 是否显示字段标签 |
| `metadataBoldLabels` | 标签是否加粗 |
| `metadataSeparator` | inline 布局分隔符 |

metadata 字段支持：

- `capturedAt` / `截图时间`
- `url` / `网址`
- `title` / `标题`
- `host` / `域名`
- `index` / `序号`
- `total` / `总数`

当界面语言为简体中文，或语言设置为自动且浏览器 UI 是中文时，截图元信息的字段标签会使用中文。

文件名和 metadata 都使用完整日期时间格式。日期时间格式支持：

- `YYYY`
- `MM`
- `DD`
- `HH`
- `mm`
- `ss`

文件名模板支持：

- `{index}` / `{序号}`
- `{host}` / `{域名}`
- `{title}` / `{标题}`
- `{folder}` / `{文件夹}`
- `{datetime}` / `{日期时间}`
- `{date}` / `{日期}`
- `{time}` / `{时间}`
- `{url}` / `{网址}`

## 开发建议

### 新增 popup 输入项

1. 修改 `popup/popup.html`。
2. 在 `popup/popup.js` 的 `elements` 中加入 DOM 引用。
3. 在 `getSettings()` 和 `restoreSettings()` 中读写该字段。
4. 如果需要默认值，修改 `utils/settings.js`。
5. 补齐 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`。

### 新增 options 设置项

1. 修改 `options/options.html`。
2. 把字段加入 `options/options.js` 的 `SETTINGS_KEYS`。
3. 在 `readForm()` 和 `writeForm()` 中处理字段。
4. 修改 `utils/settings.js` 的默认值。
5. 补齐两个 locale 文件。
6. 在实际业务逻辑中消费该字段。

### 改截图逻辑

优先从这些函数入手：

- 队列和 tab 生命周期：`background/service-worker.js` 的 `runBatch()`、`processUrl()`。
- 可视区截图：`captureViewport()`。
- 全页截图：`captureFullPage()`。
- 页面测量和滚动：`content/page-capture.js`。
- 拼接和导出：`offscreen/offscreen.js` 的 `stitchImages()`。

修改后至少测试：

- 单个短页面全页截图。
- 单个长页面全页截图，检查拼接处是否重复或断裂。
- 可视区截图。
- JPG、PNG、PDF。
- metadata 顶部和底部。
- 停止按钮。
- 如改动 `reportEnabled` 相关逻辑，再覆盖 CSV 报告。

### 改 i18n

所有用户可见文本优先通过 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 和 `utils/i18n.js` 管理，避免绕过用户手动选择的语言。新增文案时同时改：

- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`

## 手动测试清单

加载插件后建议按这个顺序验证：

1. 打开 popup，输入 `example.com`，选择可视区截图，开始。
2. 确认下载目录中生成截图。
3. 输入一个长页面 URL，选择全页截图，开始。
4. 检查全页图片顶部、中部、底部是否有重复导航栏或重叠条纹。
5. 打开 Settings，切换格式为 JPG 或 PDF，再截图。
6. 开启 metadata，分别测试 top 和 bottom。
7. 使用 URL 模板模式生成多个 URL，点击 Apply to list，再开始。
8. 截图过程中点击 Stop，确认当前 tab 被关闭，状态恢复。
9. 切换 Chrome 语言或 locale 环境时，检查英文/中文文案是否完整。

## 已知限制

- 截图过程中会激活并聚焦被截图标签页，这是 Chrome `captureVisibleTab` 行为限制带来的设计取舍。
- 需要对目标页面有访问权限，Chrome 内置页、扩展页、受限制页面可能无法截图。
- 超长页面会创建很大的 canvas，可能触发内存限制或导出失败。
- 动态加载、懒加载、无限滚动页面可能需要更长 `delay`，当前没有自动等待网络空闲或滚动触发懒加载的逻辑。
- fixed/sticky 元素会被隐藏，适合避免重复页头，但如果目标页面重要内容本身使用 fixed/sticky，截图中会缺失这些内容。

## 图标生成

图标 PNG 可通过脚本从 JS 渲染逻辑生成：

```sh
node scripts/generate-icons.mjs
```

脚本会写入 `icons/icon-16.png`、`icon-32.png`、`icon-48.png`、`icon-128.png`。

## 适合后续改进的方向

- 增加并发控制或窗口模式，降低对用户当前浏览的干扰。
- 为懒加载页面增加“滚动预热”或截图前稳定检测。
- 对超长页面做高度上限提示或分段输出。
- 增加失败重试策略，尤其是页面加载超时和截图频率限制。
- 增加导出文件名中的 `{title}`、自定义日期时间格式等 token。
- 增加自动化测试或最小可复现测试页面，方便验证拼接算法。
