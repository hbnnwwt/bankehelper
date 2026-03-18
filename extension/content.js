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
