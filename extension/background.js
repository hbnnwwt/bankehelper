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
