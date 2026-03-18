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
