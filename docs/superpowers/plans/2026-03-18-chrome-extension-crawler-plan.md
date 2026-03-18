# Chrome Extension Crawler Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Chrome 扩展，支持通过 CSS 选择器爬取网页数据并导出为 JSON 文件

**Architecture:** Manifest V3 Chrome Extension，包含 popup（UI）、content script（DOM 爬取）、background Service Worker（文件下载）

**Tech Stack:** Vanilla JS（无框架依赖）、Chrome Extension APIs

---

## 文件结构

```
extension/
├── manifest.json       # 扩展配置，声明权限和入口
├── popup.html         # 弹窗界面
├── popup.js           # UI 交互逻辑
├── content.js         # 注入页面的爬虫脚本
├── background.js      # Service Worker，处理下载
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Chunk 1: 项目初始化

- [ ] **Step 1: 创建 extension 目录和基础文件**

创建 `extension/manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "网页数据爬虫",
  "version": "1.0.0",
  "description": "通过 CSS 选择器爬取网页数据并导出为 JSON",
  "permissions": ["activeTab", "storage", "downloads"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "commands": {
    "open-popup": {
      "suggested_key": {
        "default": "Ctrl+Shift+S",
        "mac": "Command+Shift+S"
      },
      "description": "打开爬虫扩展"
    }
  }
}
```

创建 `extension/popup.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 320px; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    h1 { font-size: 16px; margin-bottom: 12px; }
    label { display: block; font-size: 13px; color: #666; margin-bottom: 4px; }
    input[type="text"] { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    input[type="text"]:focus { outline: none; border-color: #4a90d9; }
    button { width: 100%; padding: 10px; margin-top: 12px; background: #4a90d9; color: white; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
    button:hover { background: #357abd; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    #result { margin-top: 12px; padding: 8px; border-radius: 4px; font-size: 13px; display: none; }
    #result.success { background: #d4edda; color: #155724; display: block; }
    #result.error { background: #f8d7da; color: #721c24; display: block; }
    #count { margin-top: 8px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>网页数据爬虫</h1>
  <label for="selector">CSS 选择器</label>
  <input type="text" id="selector" placeholder="例如: .topic-item" />
  <button id="scrape">爬取数据</button>
  <div id="result"></div>
  <div id="count"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: 提交**

```bash
git add extension/manifest.json extension/popup.html
git commit -m "feat: initial Chrome extension structure"
```

---

## Chunk 2: Popup 逻辑

- [ ] **Step 1: 创建 extension/popup.js**

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const selectorInput = document.getElementById('selector');
  const scrapeBtn = document.getElementById('scrape');
  const resultDiv = document.getElementById('result');
  const countDiv = document.getElementById('count');

  // 尝试从 storage 恢复上次选择器
  chrome.storage.local.get(['lastSelector'], (res) => {
    if (res.lastSelector) selectorInput.value = res.lastSelector;
  });

  // 发送消息给 content script（带重试机制）
  async function sendToContent(tabId, message, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, 500)); // 等待 content script 就绪
      }
    }
  }

  scrapeBtn.addEventListener('click', async () => {
    const selector = selectorInput.value.trim();

    if (!selector) {
      resultDiv.className = 'error';
      resultDiv.textContent = '请输入选择器';
      return;
    }

    // 保存选择器
    chrome.storage.local.set({ lastSelector: selector });

    // 禁用按钮
    scrapeBtn.disabled = true;
    scrapeBtn.textContent = '爬取中...';
    resultDiv.className = '';
    resultDiv.textContent = '';
    countDiv.textContent = '';

    try {
      // 获取当前 tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        resultDiv.className = 'error';
        resultDiv.textContent = '无法访问此页面';
        return;
      }

      // 先 ping 确认 content script 已加载
      try {
        await sendToContent(tab.id, { type: 'ping' });
      } catch (e) {
        resultDiv.className = 'error';
        resultDiv.textContent = '页面脚本未加载，请刷新重试';
        return;
      }

      // 发送选择器进行爬取
      const response = await sendToContent(tab.id, { selector });

      if (response.error) {
        resultDiv.className = 'error';
        resultDiv.textContent = response.error;
        return;
      }

      // 发送数据给 background 进行下载（fire-and-forget）
      chrome.runtime.sendMessage({
        type: 'download',
        data: response.data,
        filename: `爬取数据_${formatDate(new Date())}.json`
      });

      resultDiv.className = 'success';
      resultDiv.textContent = response.truncated ? response.warning : '下载已开始';
      countDiv.textContent = `共 ${response.count} 条数据`;
    } catch (err) {
      resultDiv.className = 'error';
      resultDiv.textContent = '执行失败: ' + err.message;
    } finally {
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = '爬取数据';
    }
  });

  function formatDate(date) {
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
});
```

- [ ] **Step 2: 提交**

```bash
git add extension/popup.js
git commit -m "feat: add popup.js with selector input and scrape logic"
```

---

## Chunk 3: Content Script 爬取逻辑

- [ ] **Step 1: 创建 extension/content.js**

```javascript
const MAX_RESULTS = 10000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ping') {
    sendResponse({ ok: true });
    return true;
  }

  if (request.selector) {
    try {
      const elements = document.querySelectorAll(request.selector);
      const total = elements.length;

      if (total === 0) {
        sendResponse({ error: '选择器无效或无匹配元素' });
        return true;
      }

      const data = [];
      const limit = Math.min(total, MAX_RESULTS);

      for (let i = 0; i < limit; i++) {
        const el = elements[i];
        const attributes = {};

        if (el.attributes) {
          Array.from(el.attributes).forEach(attr => {
            attributes[attr.name] = attr.value;
          });
        }

        data.push({
          index: i,
          text: el.textContent?.trim() || '',
          html: el.innerHTML || '',
          attributes
        });
      }

      const response = {
        data,
        count: total,
        truncated: total > MAX_RESULTS
      };

      if (total > MAX_RESULTS) {
        response.warning = `匹配元素超过 ${MAX_RESULTS} 条，已截断`;
      }

      sendResponse(response);
    } catch (err) {
      // 区分 CSS 语法错误和其他 DOM 错误
      if (err instanceof DOMException && err.name === 'SyntaxError') {
        sendResponse({ error: '选择器语法错误' });
      } else {
        sendResponse({ error: 'DOM 操作失败' });
      }
    }
  }

  return true; // 保持消息通道开放以支持异步响应
});
```

**修复说明**：
- 添加 `return true` 到 ping 处理（保持消息通道）
- 区分 `DOMException` 类型：CSS 语法错误提示"选择器语法错误"，其他错误提示"DOM 操作失败"

- [ ] **Step 2: 提交**

```bash
git add extension/content.js
git commit -m "feat: add content.js with CSS selector scraping logic"
```

---

## Chunk 4: Background Service Worker 下载逻辑

- [ ] **Step 1: 创建 extension/background.js**

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'download' && request.data) {
    try {
      const jsonString = JSON.stringify(request.data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // 注意：chrome.downloads.download 会复制 URL 内容，不会立即需要原 URL
      // 但为避免内存泄漏，在下载开始后释放 URL
      // 使用 saveAs: true 让用户选择保存位置
      chrome.downloads.download({
        url,
        filename: request.filename || `爬取数据_${Date.now()}.json`,
        saveAs: true
      }).then((downloadId) => {
        // 下载已开始，释放 URL
        URL.revokeObjectURL(url);
      }).catch((err) => {
        // 下载失败也要释放
        URL.revokeObjectURL(url);
        console.error('Download failed:', err);
      });

      // fire-and-forget，无需等待下载完成
    } catch (err) {
      console.error('Download setup failed:', err);
    }
  }
  return true; // 保持消息通道开放
});
```

**修复说明**：
- 将回调函数改为 `.then()/.catch()` Promise 风格
- `URL.revokeObjectURL()` 在下载开始后调用，而非回调中调用
- 即使下载失败也会释放 URL，避免内存泄漏
- 移除无意义的 `sendResponse`，这是 fire-and-forget 场景

- [ ] **Step 2: 提交**

```bash
git add extension/background.js
git commit -m "feat: add background.js service worker for file download"
```

---

## Chunk 5: 图标资源

- [ ] **Step 1: 创建简单的占位图标**

使用纯色方块作为占位图标（实际项目应使用设计好的图标）：

```bash
mkdir -p extension/icons
# 创建 16x16, 48x48, 128x128 的 PNG 图标
# 这里创建纯色占位图（实际使用时替换为真实图标）
```

**注意：** 图标需要手动创建或从其他来源获取。此处暂时跳过，Chrome 扩展在未指定图标时使用默认图标。

- [ ] **Step 2: 提交**

```bash
git add extension/ -A
git commit -m "chore: add extension icons directory"
```

---

## Chunk 6: 本地测试指南

- [ ] **Step 1: 添加 README 说明如何加载扩展**

创建 `extension/README.md`：

```markdown
# 网页数据爬虫 - Chrome 扩展

## 安装步骤

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension` 文件夹

## 使用方法

1. 进入目标网页
2. 点击扩展图标，或按 `Ctrl+Shift+S`
3. 输入 CSS 选择器（如 `.topic-item`）
4. 点击「爬取数据」
5. JSON 文件将自动下载

## 快捷键

- `Ctrl+Shift+S` - 打开扩展 popup

## 权限说明

- `activeTab` - 访问当前标签页
- `storage` - 保存上次使用的选择器
- `downloads` - 触发文件下载

## 调试

- 右键扩展图标 → 检查弹出内容 → 查看 console
- 在目标页面按 F12 → Console 可查看 content script 日志
```

- [ ] **Step 2: 提交**

```bash
git add extension/README.md
git commit -m "docs: add extension usage README"
```

---

## 验证清单

完成所有 chunks 后，确认：

- [ ] `manifest.json` 是有效的 Manifest V3 配置
- [ ] `popup.html` 界面正常显示
- [ ] `popup.js` 带 ping 重试机制，能正确获取当前 tab 并发送消息
- [ ] `content.js` 能正确执行 CSS 选择器并提取数据，区分错误类型
- [ ] `background.js` 正确处理 Blob URL 生命周期
- [ ] `Ctrl+Shift+S` 快捷键已注册
- [ ] 扩展能成功加载到 Chrome（无报错）
