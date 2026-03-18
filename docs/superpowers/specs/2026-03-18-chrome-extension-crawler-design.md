# Chrome 扩展爬虫插件 — 设计文档

## 概述

开发一个 Chrome 浏览器扩展，用于爬取网页上的结构化数据，支持通过 CSS 选择器灵活提取任意 DOM 元素，并导出为 JSON 文件。

## 核心功能

| 功能 | 描述 |
|------|------|
| CSS 选择器爬取 | 用户输入任意 CSS 选择器，提取匹配的所有元素 |
| 结构化 JSON 导出 | 提取元素的文本内容、HTML、结构信息 |
| 快捷键支持 | Ctrl+Shift+S 打开扩展 popup |
| 文件下载 | 自动生成并下载 JSON 文件 |

## 技术架构

### 文件结构

```
extension/
├── manifest.json       # Chrome 扩展配置文件 (Manifest V3)
├── popup.html          # 扩展弹窗界面
├── popup.js            # 弹窗交互逻辑
├── content.js          # 注入页面的爬虫脚本
├── background.js       # 后台 Service Worker（处理文件下载）
└── icons/              # 扩展图标
```

### 组件职责

#### manifest.json
- Manifest V3 格式（background 使用 Service Worker）
- 声明权限：`activeTab`、`storage`、`downloads`
- 定义 popup、content script、background script 入口
- 配置快捷键绑定

#### popup.html / popup.js
- CSS 选择器输入框
- "爬取" 执行按钮
- 显示爬取结果数量 / 错误信息
- **消息传递流程**：
  1. `chrome.tabs.query({ active: true, currentWindow: true })` 获取当前 tabId
  2. `chrome.tabs.sendMessage(tabId, { selector, maxResults })` 发送爬取指令
  3. 监听 `chrome.runtime.onMessage` 接收结果

#### content.js
- 注册 `chrome.runtime.onMessage` 监听来自 popup 的消息
- 接收选择器字符串和最大结果数
- 在当前页面执行 `document.querySelectorAll()`
- 提取每个元素的：
  - `textContent`（纯文本，去首尾空白）
  - `innerHTML`（原始 HTML）
  - `attributes`（所有属性名值对）
- 若匹配数量超过 `maxResults`（默认 10000），截断并返回提示
- 通过 `chrome.runtime.sendMessage` 返回结果

#### background.js（Service Worker）
- 注册 `chrome.runtime.onMessage` 接收 content.js 的数据
- 序列化为 JSON 字符串
- 生成 Blob 对象：`new Blob([jsonString], { type: 'application/json' })`
- 调用 `chrome.downloads.download()` 触发文件下载
- 文件名格式：`爬取数据_YYYYMMDD_HHmmss.json`

### 消息传递流程图

```
┌─────────────┐      chrome.tabs.sendMessage       ┌─────────────┐
│  popup.js   │ ──────────────────────────────────► │ content.js   │
│             │                                     │             │
│  获取tabId   │                                     │ 执行爬取逻辑  │
│  发送selector│                                     │ 返回JSON数据 │
│             │ ◄──────────────────────────────────── │             │
└─────────────┘      chrome.runtime.sendMessage     └─────────────┘
        │
        │ chrome.runtime.sendMessage
        ▼
┌─────────────────────┐
│    background.js    │
│  (Service Worker)    │
│                     │
│  生成Blob            │
│  chrome.downloads    │
│  .download()         │
└─────────────────────┘
```

### 数据格式

```json
[
  {
    "text": "元素纯文本内容",
    "html": "元素的完整HTML",
    "attributes": {
      "class": "topic-item",
      "data-id": "123"
    },
    "index": 0
  },
  {
    "text": "...",
    "html": "...",
    "attributes": {},
    "index": 1
  }
]
```

#### 截断提示（当超过 maxResults 时）

```json
{
  "warning": "匹配元素超过 10000 条，已截断",
  "truncated": true,
  "total": 25000,
  "returned": 10000,
  "data": [ ... ]
}
```

## 用户交互流程

1. 用户在目标页面点击扩展图标，或按 `Ctrl+Shift+S`
2. Popup 弹出，显示选择器输入框
3. 用户输入 CSS 选择器（如 `.topic-item`）
4. 点击"爬取"按钮
5. 扩展自动下载 JSON 文件
6. Popup 显示"成功爬取 N 条数据"或警告信息

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+S` | 打开扩展 popup |

**注意**：`Alt+S` 与中文输入法冲突，故改用 `Ctrl+Shift+S`。

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| 选择器为空 | 提示"请输入选择器"，不执行爬取 |
| 选择器无效或无匹配 | 提示"选择器无效或无匹配元素" |
| 页面无法注入脚本（如 chrome://、PDF） | 提示"无法访问此页面，请确保在普通网页中使用" |
| 页面还在加载中 | 等待 `document.readyState === 'complete'` 后再执行 |
| 匹配元素过多（> maxResults） | 截断返回，附带警告信息 |
| content script 未就绪 | 提示"页面脚本未加载，请刷新重试" |
| Service Worker 未激活 | 提示"扩展后台服务未就绪，请稍后重试" |

## 技术约束

### Content Security Policy (CSP)
- Manifest V3 要求严格 CSP
- 禁止使用 `eval()`、`new Function()`
- 所有代码必须为静态字符串或外部文件引用
- JSON 序列化使用原生 `JSON.stringify()`，无需 eval

### 页面兼容性
- 支持所有支持 content script 注入的 HTTP/HTTPS 页面
- 不支持 `chrome://` 页面、PDF 查看器、扩展页面
- 单页应用（SPA）需用户手动触发（页面渲染完成后）

## 后续扩展方向（暂不实现）

- 保存常用选择器到本地
- 支持 CSV 导出
- 支持定时自动爬取
- 支持数据预览
- 支持批量选择器（一次爬取多种数据）

---

*创建时间：2026-03-18*
*评审状态：已修复评审问题*
