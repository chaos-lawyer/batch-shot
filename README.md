# BatchShot

<img width="600" height="795" alt="image" src="https://github.com/user-attachments/assets/9fe1f6d8-bb9a-4ffc-859f-58f001657935" />

[中文](#中文) | [English](#english)

## 中文

BatchShot 是一个基于 Chrome Extension Manifest V3 的批量网页截图工具。它适合需要一次性保存大量页面截图的场景，例如竞品页面留档、搜索结果采集、内容审核、网页归档、运营素材整理和测试记录。

你可以粘贴 URL 列表，也可以用 URL 模板批量生成链接；BatchShot 会按队列打开页面、等待加载、截图并自动下载到指定文件夹。

### 功能特性

- 批量截图：一行一个 URL，自动按队列处理。
- URL 模板：使用 `%s` 占位符批量生成 URL。
- CSS 选择器搜索模板：为不支持 URL 参数搜索的网站填写搜索框并截图。
- 当前页面截图：一键截取当前标签页。
- 当前窗口截图：一键截取当前窗口的所有可截图标签页。
- 截图模式：支持整页截图和当前可视区截图。
- 输出格式：支持 PNG、JPG、PDF。
- 自动下载：可设置下载文件夹和文件名模板。
- 截图报告：可导出 CSV 或 XLSX 报告，记录 URL、标题、状态、文件名和错误信息。
- 元信息水印：可在图片顶部或底部添加截图时间、URL、标题、域名、序号等信息。
- 中英文界面：支持 English 和简体中文，也可以跟随浏览器语言。
- 外观设置：支持自动、浅色和深色主题。
- 快捷键：支持打开弹窗、截取当前页面、截取当前窗口标签页。

### 安装方式

目前项目适合以开发者模式加载到 Chrome 或其他 Chromium 浏览器中。

1. 下载或克隆本仓库。
2. 打开浏览器地址栏中的 `chrome://extensions`。
3. 开启右上角的 Developer mode。
4. 点击 Load unpacked。
5. 选择本项目目录。
6. 浏览器工具栏中会出现 BatchShot 图标。

更新代码后，回到 `chrome://extensions`，在 BatchShot 扩展卡片上点击 reload。

### 使用方法

#### 批量 URL 截图

1. 点击浏览器工具栏中的 BatchShot 图标。
2. 在 URLs 输入框中粘贴链接，一行一个。
3. 选择截图模式：Full page 或 Viewport。
4. 设置页面加载后的等待时间和下载文件夹。
5. 点击 Start。

没有协议的 URL 会自动补全为 `https://`。

#### URL 模板模式

模板模式适合批量生成搜索页、商品页、文档页等规律 URL。

普通 URL 模板使用 `%s` 作为关键词占位符。例如模板：

```text
https://www.baidu.com/s?wd=%s
https://example.com/search?q=%s
```

文本列表：

```text
BatchShot
Chrome extension
web screenshot
```

BatchShot 会把每一行模板和每一行文本组合成截图任务。

如果网站不能通过 URL 参数搜索，也可以用 CSS 选择器创建搜索模板。默认格式是：

```text
起始页面 URL :: 搜索输入框 CSS 选择器 :: 可选的提交按钮 CSS 选择器
```

示例：

```text
https://example.com :: input[name="q"]
https://example.com :: input[name="q"] :: button[type="submit"]
```

运行时，BatchShot 会为文本列表中的每个关键词打开起始页面，找到搜索输入框，填入关键词，然后按 Enter 提交；如果提供了按钮选择器，则点击该按钮提交。搜索完成后会继续使用当前的截图模式、文件名、元信息和报告设置。

模板模式中可以混合普通 URL 模板和 CSS 选择器搜索模板。搜索模板的分隔符默认是 ` :: `，可在设置页中修改。

#### 当前页面和当前窗口

弹窗右上角提供两个快捷操作：

- Capture current page：截取当前标签页。
- Capture all tabs in current window：截取当前窗口中的所有可截图标签页。

默认快捷键：

| 操作 | 快捷键 |
| --- | --- |
| 打开 BatchShot | `Alt+Shift+B` |
| 截取当前页面 | `Alt+Shift+S` |
| 截取当前窗口标签页 | `Alt+Shift+W` |

快捷键可以在 Chrome 的扩展快捷键页面中修改。

### 设置说明

点击弹窗底部的设置按钮可打开设置页。

#### 输出

- Format：选择 PNG、JPG 或 PDF。
- Quality：设置 JPG 和 PDF 导出质量，PNG 始终保持无损。
- Filename：设置文件名模板。
- Filename date/time format：设置文件名中的日期时间格式。

下载文件夹和文件名模板都支持以下占位符，文件夹中可以用 `/` 生成多级子目录，例如 `BatchShot/{date}/{域名}`：

| 占位符 | 含义 |
| --- | --- |
| `{index}` / `{序号}` | 当前截图序号 |
| `{total}` / `{总数}` | 当前任务总数 |
| `{host}` / `{域名}` | 页面域名 |
| `{title}` / `{标题}` | 页面标题 |
| `{keyword}` / `{关键词}` | URL 模板模式中的搜索关键词 |
| `{folder}` / `{文件夹}` | 下载文件夹 |
| `{datetime}` / `{日期时间}` | 完整日期时间 |
| `{date}` / `{日期}` | 日期 |
| `{time}` / `{时间}` | 时间 |
| `{year}` / `{年}` | 年 |
| `{month}` / `{月}` | 月 |
| `{day}` / `{日}` | 日 |
| `{url}` / `{网址}` | 页面 URL |

#### 元信息

开启 Add metadata to image 后，可以在截图顶部或底部绘制元信息横幅。

支持字段：

| 字段 | 含义 |
| --- | --- |
| `capturedAt` / `截图时间` | 截图时间 |
| `url` / `网址` | 页面 URL |
| `title` / `标题` | 页面标题 |
| `host` / `域名` | 页面域名 |
| `index` / `序号` | 当前序号 |
| `total` / `总数` | 总数量 |

#### 报告

开启 Export screenshot report 后，批量任务结束时会下载报告文件。

报告格式支持：

- CSV
- XLSX

报告字段支持：

| 字段 | 含义 |
| --- | --- |
| `index` | 序号 |
| `url` | 页面 URL |
| `title` | 页面标题 |
| `status` | 成功或失败 |
| `filename` | 下载文件名 |
| `error` | 错误信息 |

### 权限说明

BatchShot 需要以下 Chrome 扩展权限：

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 访问当前活动标签页以执行截图 |
| `tabs` | 创建、激活、读取和关闭截图标签页 |
| `scripting` | 注入页面测量和滚动脚本 |
| `downloads` | 自动下载截图和报告 |
| `storage` | 保存用户设置和输入历史 |
| `offscreen` | 使用离屏页面进行整页拼接和格式转换 |
| `<all_urls>` | 支持对用户提供的网页 URL 进行截图 |

项目不会上传截图内容；截图和报告由浏览器下载到本地。

### 已知限制

- 截图过程中会激活被截图标签页，这是 `chrome.tabs.captureVisibleTab()` 的浏览器限制。
- Chrome 内置页面、扩展页面、受保护页面和无权限访问的页面可能无法截图。
- 超长页面会生成较大的 canvas，可能受到浏览器内存限制。
- 动态加载、懒加载、搜索结果页或无限滚动页面可能需要更长的 Delay。
- CSS 选择器搜索模板不支持跨域 iframe、Shadow DOM、验证码或复杂多步骤搜索流程。
- 整页截图会隐藏 fixed 和 sticky 元素，以避免页头、悬浮按钮在每一屏重复出现；如果页面重要内容本身使用这些定位方式，截图中可能不会显示。

### 项目结构

```text
BatchShot/
├── manifest.json
├── _locales/
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── background/
│   └── service-worker.js
├── content/
│   ├── capture-page.js
│   ├── form-fill.js
│   ├── search-submit.js
│   ├── selector-builder.js
│   ├── search-infer.js
│   ├── button-picker.js
│   └── messages.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── help/
│   ├── help.html
│   ├── help.css
│   └── help.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── utils/
│   ├── helpers.js
│   ├── i18n.js
│   ├── report-fields.js
│   ├── settings.js
│   └── xlsx.js
├── icons/
└── scripts/
    └── generate-icons.mjs
```

### 开发说明

这个项目不依赖构建工具，直接以 Chrome 扩展源码运行。

核心模块：

- `manifest.json`：扩展声明、权限、入口和快捷键。
- `popup/`：主操作面板，负责 URL 输入、模板生成、任务控制和状态显示。
- `options/`：设置页面，负责输出、报告、元信息、外观和语言配置。
- `help/`：帮助页面，提供详细的功能说明、使用示例和排错指南。
- `background/service-worker.js`：批量任务调度、标签页生命周期、截图和下载。
- `content/`：内容脚本，包含页面测量与滚动（capture-page.js）、表单填充（form-fill.js）、搜索提交（search-submit.js）、选择器生成（selector-builder.js）、搜索框推断（search-infer.js）、按钮选择器 UI（button-picker.js）及消息监听（messages.js）。
- `offscreen/offscreen.js`：整页截图拼接、元信息绘制、PDF/JPG/PNG 转换。
- `utils/`：设置、文件名、报告字段、i18n 和 XLSX 生成工具。

生成图标：

```sh
node scripts/generate-icons.mjs
```

### 许可证

本项目基于 [MIT License](LICENSE) 开源。

[Back to top](#batchshot)

## English

BatchShot is a batch webpage screenshot tool built with Chrome Extension Manifest V3. It is designed for workflows that need to save many page screenshots at once, such as competitor page archiving, search result collection, content review, web preservation, marketing asset collection, and QA records.

You can paste a list of URLs or generate URLs from a template. BatchShot opens each page in order, waits for it to load, captures the screenshot, and downloads the result to your chosen folder.

### Features

- Batch capture: paste one URL per line and process the queue automatically.
- URL templates: generate URL lists with the `%s` placeholder.
- CSS selector search templates: fill a site's search box and capture the results when URL-based search is not available.
- Current page capture: capture the active tab with one click.
- Current window capture: capture all capturable tabs in the current window.
- Capture modes: full-page screenshots or viewport screenshots.
- Output formats: PNG, JPG, and PDF.
- Automatic downloads: configure the download folder and filename pattern.
- Screenshot reports: export CSV or XLSX reports with URL, title, status, filename, and error details.
- Metadata banner: add capture time, URL, title, host, index, and other fields to the top or bottom of images.
- Bilingual UI: supports English and Simplified Chinese, with browser-language auto mode.
- Appearance settings: auto, light, and dark themes.
- Keyboard shortcuts: open popup, capture current page, and capture current window tabs.

### Installation

BatchShot is currently intended to be loaded as an unpacked extension in Chrome or another Chromium-based browser.

1. Download or clone this repository.
2. Open `chrome://extensions` in your browser.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select this project directory.
6. The BatchShot icon should appear in the browser toolbar.

After updating the source code, return to `chrome://extensions` and click reload on the BatchShot extension card.

### Usage

#### Batch URL Capture

1. Click the BatchShot icon in the browser toolbar.
2. Paste URLs into the URLs field, one per line.
3. Choose a capture mode: Full page or Viewport.
4. Set the delay after page load and the download folder.
5. Click Start.

URLs without a protocol are automatically completed with `https://`.

#### URL Template Mode

Template mode is useful for generating search pages, product pages, document pages, or any patterned URL list.

Regular URL templates use `%s` as the keyword placeholder. Example templates:

```text
https://www.baidu.com/s?wd=%s
https://example.com/search?q=%s
```

Text list:

```text
BatchShot
Chrome extension
web screenshot
```

BatchShot combines each template line with each text line.

For sites that cannot search reliably through URL parameters, you can also create a search template with CSS selectors. The default format is:

```text
Start page URL :: search input CSS selector :: optional submit button CSS selector
```

Examples:

```text
https://example.com :: input[name="q"]
https://example.com :: input[name="q"] :: button[type="submit"]
```

For each keyword in the text list, BatchShot opens the start page, finds the search input, fills the keyword, and submits with Enter. If a button selector is provided, BatchShot clicks that button instead. After submission, it uses the current capture mode, filename, metadata, and report settings.

Template mode can mix regular URL templates and CSS selector search templates. The search template delimiter defaults to ` :: ` and can be changed in Settings.

#### Current Page and Current Window

The top-right actions in the popup provide two quick capture options:

- Capture current page: capture the active tab.
- Capture all tabs in current window: capture all capturable tabs in the current window.

Default shortcuts:

| Action | Shortcut |
| --- | --- |
| Open BatchShot | `Alt+Shift+B` |
| Capture current page | `Alt+Shift+S` |
| Capture current window tabs | `Alt+Shift+W` |

Shortcuts can be changed in Chrome's extension shortcuts page.

### Settings

Click the settings button at the bottom of the popup to open the settings page.

#### Output

- Format: choose PNG, JPG, or PDF.
- Quality: controls JPG and PDF export quality. PNG remains lossless.
- Filename: configure the filename pattern.
- Filename date/time format: configure date and time formatting in filenames.

The download folder and filename patterns both support these placeholders. Use `/` in the folder to create nested subfolders, for example `BatchShot/{date}/{domain}`:

| Placeholder | Meaning |
| --- | --- |
| `{index}` / `{序号}` | Capture index |
| `{total}` / `{总数}` | Total captures in the task |
| `{host}` / `{域名}` | Page host |
| `{title}` / `{标题}` | Page title |
| `{keyword}` / `{关键词}` | Search keyword from URL template mode |
| `{folder}` / `{文件夹}` | Download folder |
| `{datetime}` / `{日期时间}` | Full date and time |
| `{date}` / `{日期}` | Date |
| `{time}` / `{时间}` | Time |
| `{year}` / `{年}` | Year |
| `{month}` / `{月}` | Month |
| `{day}` / `{日}` | Day |
| `{url}` / `{网址}` | Page URL |

#### Metadata

When Add metadata to image is enabled, BatchShot can draw a metadata banner at the top or bottom of the screenshot.

Supported fields:

| Field | Meaning |
| --- | --- |
| `capturedAt` / `截图时间` | Capture time |
| `url` / `网址` | Page URL |
| `title` / `标题` | Page title |
| `host` / `域名` | Page host |
| `index` / `序号` | Current index |
| `total` / `总数` | Total count |

#### Reports

When Export screenshot report is enabled, BatchShot downloads a report file after the batch task finishes.

Supported report formats:

- CSV
- XLSX

Supported report fields:

| Field | Meaning |
| --- | --- |
| `index` | Index |
| `url` | Page URL |
| `title` | Page title |
| `status` | Success or failure |
| `filename` | Downloaded filename |
| `error` | Error message |

### Permissions

BatchShot requires the following Chrome extension permissions:

| Permission | Purpose |
| --- | --- |
| `activeTab` | Access the active tab for screenshot capture |
| `tabs` | Create, activate, read, and close capture tabs |
| `scripting` | Inject page measurement and scrolling scripts |
| `downloads` | Download screenshots and reports automatically |
| `storage` | Save user settings and input history |
| `offscreen` | Stitch full-page screenshots and convert output formats |
| `<all_urls>` | Capture user-provided webpage URLs |

BatchShot does not upload screenshot content. Screenshots and reports are downloaded locally by the browser.

### Known Limitations

- Capture tabs are activated during screenshot tasks because of the `chrome.tabs.captureVisibleTab()` browser API.
- Chrome internal pages, extension pages, protected pages, and pages without sufficient access permissions may not be capturable.
- Very long pages create large canvases and may hit browser memory limits.
- Dynamic, lazy-loaded, search result, or infinite-scroll pages may require a longer Delay setting.
- CSS selector search templates do not support cross-origin iframes, Shadow DOM, CAPTCHAs, or complex multi-step search flows.
- Full-page capture hides fixed and sticky elements to avoid repeated headers and floating buttons. If important content uses fixed or sticky positioning, it may be missing from the screenshot.

### Project Structure

```text
BatchShot/
├── manifest.json
├── _locales/
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── background/
│   └── service-worker.js
├── content/
│   ├── capture-page.js
│   ├── form-fill.js
│   ├── search-submit.js
│   ├── selector-builder.js
│   ├── search-infer.js
│   ├── button-picker.js
│   └── messages.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── help/
│   ├── help.html
│   ├── help.css
│   └── help.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── utils/
│   ├── helpers.js
│   ├── i18n.js
│   ├── report-fields.js
│   ├── settings.js
│   └── xlsx.js
├── icons/
└── scripts/
    └── generate-icons.mjs
```

### Development

This project has no build step. It runs directly as Chrome extension source code.

Core modules:

- `manifest.json`: extension metadata, permissions, entry points, and shortcuts.
- `popup/`: main operation panel for URL input, template generation, task control, and status display.
- `options/`: settings page for output, reports, metadata, appearance, and language.
- `help/`: help page, providing detailed feature explanations, usage examples, and troubleshooting guides.
- `background/service-worker.js`: batch scheduling, tab lifecycle, screenshot capture, and downloads.
- `content/`: content scripts, containing page measurement and scrolling (capture-page.js), form filling (form-fill.js), search submit (search-submit.js), selector building (selector-builder.js), search input inference (search-infer.js), button picking UI (button-picker.js), and message routing (messages.js).
- `offscreen/offscreen.js`: full-page stitching, metadata drawing, and PNG/JPG/PDF conversion.
- `utils/`: settings, filenames, report fields, i18n, and XLSX generation utilities.

Generate icons:

```sh
node scripts/generate-icons.mjs
```

### License

This project is open-sourced under the [MIT License](LICENSE).

[Back to top](#batchshot)
