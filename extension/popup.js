// 全局存储爬取的数据和文件名
let scrapedData = [];
let scrapedFileName = '';

// 模板表头（对应 Excel 模板）
const HEADERS = ['题型', '题干', '正确答案', '解析', '分值', '难度系数', 'A', 'B', 'C', 'D'];

document.addEventListener('DOMContentLoaded', () => {
  const selectorInput = document.getElementById('selector');
  const scrapeBtn = document.getElementById('scrape');
  const downloadBtn = document.getElementById('download');
  const resultDiv = document.getElementById('result');
  const countDiv = document.getElementById('count');
  const previewContainer = document.getElementById('preview-container');
  const previewDiv = document.getElementById('preview');

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
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // 生成预览表格
  function generatePreviewTable(data) {
    const previewData = data.slice(0, 10);
    let html = '<table><thead><tr>';
    HEADERS.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';
    previewData.forEach(item => {
      html += '<tr>';
      html += `<td>${escapeHtml(item.type)}</td>`;
      html += `<td>${escapeHtml(item.subject.substring(0, 30))}${item.subject.length > 30 ? '...' : ''}</td>`;
      html += `<td>${escapeHtml(item.answer)}</td>`;
      html += `<td>${escapeHtml(item.analysis || '-')}</td>`;
      html += `<td>${item.score}</td>`;
      html += `<td>${item.level}</td>`;
      html += `<td>${escapeHtml(item.optionA)}</td>`;
      html += `<td>${escapeHtml(item.optionB)}</td>`;
      html += `<td>${escapeHtml(item.optionC)}</td>`;
      html += `<td>${escapeHtml(item.optionD)}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    if (data.length > 10) {
      html += `<div style="margin-top:8px;color:#666;">... 还有 ${data.length - 10} 条数据</div>`;
    }
    return html;
  }

  // HTML 转义
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 生成 Excel 文件并下载
  function downloadExcel() {
    if (scrapedData.length === 0) {
      resultDiv.className = 'error';
      resultDiv.textContent = '没有可下载的数据';
      return;
    }

    // 构建工作表数据
    const wsData = [HEADERS]; // 表头
    scrapedData.forEach(item => {
      wsData.push([
        item.type,
        item.subject,
        item.answer,
        item.analysis || '',
        item.score,
        item.level,
        item.optionA,
        item.optionB,
        item.optionC,
        item.optionD
      ]);
    });

    // 使用 XLSX 库生成工作簿
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 设置列宽
    ws['!cols'] = [
      { wch: 8 },   // 题型
      { wch: 50 },  // 题干
      { wch: 10 },  // 正确答案
      { wch: 20 },  // 解析
      { wch: 6 },   // 分值
      { wch: 8 },   // 难度系数
      { wch: 20 },  // A
      { wch: 20 },  // B
      { wch: 20 },  // C
      { wch: 20 }   // D
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '习题');

    // 生成文件并下载
    const baseName = scrapedFileName || `爬取数据_${formatDate(new Date())}`;
    const filename = `${baseName}.xlsx`;
    XLSX.writeFile(wb, filename);

    resultDiv.className = 'success';
    resultDiv.textContent = 'Excel 已下载';
  }

  // 预览按钮点击
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
    downloadBtn.disabled = true;
    resultDiv.className = '';
    resultDiv.textContent = '';
    countDiv.textContent = '';
    previewContainer.className = '';
    previewDiv.innerHTML = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        resultDiv.className = 'error';
        resultDiv.textContent = '无法访问此页面';
        return;
      }

      // ping 确认
      try {
        await sendToContent(tab.id, { type: 'ping' });
      } catch (e) {
        resultDiv.className = 'error';
        resultDiv.textContent = '页面脚本未加载，请刷新重试';
        return;
      }

      // 爬取数据
      const response = await sendToContent(tab.id, { selector });

      if (response.error) {
        resultDiv.className = 'error';
        resultDiv.textContent = response.error;
        return;
      }

      // 保存数据
      scrapedData = response.data;
      scrapedFileName = response.fileName || '';

      // 显示结果
      resultDiv.className = 'success';
      resultDiv.textContent = response.truncated ? response.warning : '数据已爬取';
      countDiv.textContent = `共 ${response.count} 条数据`;

      // 显示预览
      previewDiv.innerHTML = generatePreviewTable(scrapedData);
      previewContainer.className = 'show';

      // 启用下载按钮
      downloadBtn.disabled = false;

    } catch (err) {
      resultDiv.className = 'error';
      resultDiv.textContent = '执行失败: ' + err.message;
    } finally {
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = '预览数据';
    }
  });

  // 下载按钮点击
  downloadBtn.addEventListener('click', () => {
    downloadExcel();
  });

  function formatDate(date) {
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
});
