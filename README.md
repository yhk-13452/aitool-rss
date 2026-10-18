# RSS Reader — Feed Pipeline

一个以静态方式托管的 RSS 阅读器项目，本仓库当前为数据管道部分：定时抓取订阅源并聚合为静态 JSON，供前端 PWA 读取。

## 功能

- 定时抓取多个 RSS 订阅源并聚合为统一格式
- 单源失败隔离，不影响整体产出
- 纯静态产出，无常驻后端

## 技术栈

Node.js + rss-parser + GitHub Actions
