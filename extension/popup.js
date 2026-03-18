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
