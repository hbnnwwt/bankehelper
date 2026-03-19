const MAX_RESULTS = 10000;

// 题型映射：DOM class → 模板题型
const TYPE_MAP = {
  'SINGLE': '单选题',
  'MULTI': '多选题',
  'TF': '判断题',
  'GAP': '填空题',
  'VOTE': '投票题',
  'SUBJECTIVE': '主观题'
};

// 难度映射：中文 → 数字
const LEVEL_MAP = {
  '简单': 1,
  '中等': 2,
  '困难': 3
};

// 提取题型
function extractType(el) {
  const typeEl = el.querySelector('.t-type');
  if (!typeEl) return '';
  const typeClass = typeEl.className.split(' ')
    .find(c => c.startsWith('t-type-') || ['SINGLE', 'MULTI', 'TF', 'GAP', 'VOTE', 'SUBJECTIVE'].includes(c));
  if (!typeClass) {
    // fallback: 直接用文本
    return typeEl.textContent.trim();
  }
  return TYPE_MAP[typeClass] || typeEl.textContent.trim();
}

// 提取分值
function extractScore(el) {
  const scoreEl = el.querySelector('.t-score');
  if (!scoreEl) return '1';
  const match = scoreEl.textContent.match(/(\d+)/);
  return match ? match[1] : '1';
}

// 提取难度
function extractLevel(el) {
  const levelEl = el.querySelector('.t-level');
  if (!levelEl) return '1';
  const level = LEVEL_MAP[levelEl.textContent.trim()];
  return level ? String(level) : '1';
}

// 提取题干
function extractSubject(el) {
  const subjectEl = el.querySelector('.t-subject');
  return subjectEl ? subjectEl.textContent.trim() : '';
}

// 提取选项
function extractOptions(el) {
  const options = [];
  const optEls = el.querySelectorAll('.t-option .opt .opt-content');
  optEls.forEach(opt => {
    options.push(opt.textContent.trim());
  });
  return options;
}

// 提取正确答案
function extractAnswer(el) {
  const answerEl = el.querySelector('.t-answer .light');
  if (!answerEl) {
    // 判断题
    const answerText = el.querySelector('.t-answer');
    if (answerText) {
      const text = answerText.textContent.trim();
      if (text.includes('正确')) return '正确';
      if (text.includes('错误')) return '错误';
    }
    return '';
  }
  return answerEl.textContent.trim();
}

// 提取正确率
function extractAccuracy(el) {
  const chartEl = el.querySelector('.t-chart');
  if (!chartEl) return '';
  const match = chartEl.textContent.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? match[1] + '%' : '';
}

// 解析单条数据
function parseTopicItem(el) {
  const type = extractType(el);
  const subject = extractSubject(el);
  const answer = extractAnswer(el);
  const score = extractScore(el);
  const level = extractLevel(el);
  const options = extractOptions(el);
  const accuracy = extractAccuracy(el);

  // 选项补齐到4个
  while (options.length < 4) {
    options.push('');
  }

  return {
    type,
    subject,
    answer,
    analysis: '',  // 暂无解析
    score,
    level,
    optionA: options[0] || '',
    optionB: options[1] || '',
    optionC: options[2] || '',
    optionD: options[3] || '',
    accuracy
  };
}

// 提取文件名（从页面标题）
function extractFileName() {
  const infoCon = document.querySelector('.info-con');
  if (!infoCon) return '';
  const firstSpan = infoCon.querySelector('span:first-child');
  return firstSpan ? firstSpan.textContent.trim() : '';
}

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
        const parsed = parseTopicItem(elements[i]);
        parsed.index = i;
        data.push(parsed);
      }

      const response = {
        data,
        count: total,
        truncated: total > MAX_RESULTS,
        fileName: extractFileName()
      };

      if (total > MAX_RESULTS) {
        response.warning = `匹配元素超过 ${MAX_RESULTS} 条，已截断`;
      }

      sendResponse(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SyntaxError') {
        sendResponse({ error: '选择器语法错误' });
      } else {
        sendResponse({ error: 'DOM 操作失败: ' + err.message });
      }
    }
  }

  return true;
});
