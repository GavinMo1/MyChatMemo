# MyChatMemo

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/GavinMo1/MyChatMemo)

MyChatMemo 是一个 Chrome MV3 扩展，用来把你在 AI 对话平台里的重要对话保存到本地记忆库。

它的核心策略不是"默认自动保存所有对话"，而是：

- 用户先手动点击一次保存
- 该对话保存成功后进入激活状态
- 只有这条已激活对话，后续内容才会自动增量同步

当前版本已经支持本地搜索、文件夹整理、批量操作、单条 Markdown 导出和多条 ZIP 归档，并提供研究工作台风格的侧边面板与页面内悬浮面板。

## ✨ 核心特性

- **智能同步** - 手动保存成功后自动增量同步，避免把草稿或临时对话全部收进库里
- **页内悬浮面板** - 不挤压 AI 网页布局，时间线导航快速跳转
- **文件夹管理** - 两级文件夹管理，支持批量移动和批量删除
- **强大搜索** - 分页搜索，支持标题和消息正文检索
- **灵活导出** - 单条 Markdown 导出，批量 ZIP 导出
- **本地存储** - 所有数据仅存储在本地 IndexedDB，不依赖服务端

## 🌐 当前支持平台

| 平台 | 状态 | 网址 | DOM 回归测试 |
|------|------|------|----------|
| Kimi | ✅ 已支持 | `kimi.com` / `kimi.moonshot.cn` | 已提供 |
| 豆包 | ✅ 已支持 | `doubao.com` | 已提供 |
| Gemini | ✅ 已支持 | `gemini.google.com` | 已提供 |
| ChatGPT | ✅ 已支持 | `chatgpt.com` / `chat.openai.com` | 已提供 |

> 代码中的 `claude` 仍保留为类型预留，但当前版本并未接入 Claude 站点，也不会注入对应页面。

## 🚀 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Chrome MV3 | - | 扩展框架 |
| Vite | 5.x | 构建与开发 |
| React | 18.x | SidePanel、Popup 与内容脚本 UI |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 3.x | 样式工具层 |
| Dexie | 3.x | IndexedDB ORM |
| react-window | 2.x | 列表虚拟化 |
| jszip | 3.x | 批量 ZIP 导出 |
| Vitest | - | 单元测试 |

## 📦 开发命令

使用 Node.js 24 与 npm；依赖由 package-lock.json 固定。

```bash
# 安装依赖
npm ci

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# Bundle 分析
npm run build:analyze

# 全部质量检查（含格式、源码与测试类型检查、lint、测试、构建）
npm run check

# 运行测试
npm run test

# 测试覆盖率
npm run test:coverage

# 代码检查
npm run lint

# 只检查代码格式（不修改文件）
npm run format:check

# 代码格式化
npm run format
```

## 🔧 本地加载扩展

1. 运行 `npm run build`
2. 打开 `chrome://extensions/`
3. 开启开发者模式
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist/` 目录

## 📁 项目结构

```text
src/
├── background/                  # Service Worker：路由、数据库、同步、导出
│   ├── router.ts                # 消息路由
│   ├── syncEngine.ts            # 同步引擎（含锚点匹配算法）
│   ├── anchorMatcher.ts         # Rabin-Karp 锚点匹配
│   ├── database.ts              # Dexie IndexedDB 封装
│   └── exporter.ts              # Markdown/ZIP 导出
├── content/                     # 注入 AI 页面：适配器、observer、浮层 UI
│   ├── adapters/                # 平台适配器
│   │   ├── chatgpt.ts           # ChatGPT 适配器
│   │   ├── gemini.ts            # Gemini 适配器
│   │   ├── kimi.ts              # Kimi 适配器
│   │   └── doubao.ts            # 豆包适配器
│   ├── syncManager.ts           # 同步管理器
│   ├── smartObserver.ts         # DOM 变化观察器（性能优化）
│   └── ui/                      # 悬浮球、悬浮面板、时间线
├── sidepanel/                   # 记忆库主界面
│   ├── App.tsx                  # 主应用
│   └── components/              # 列表、详情、文件夹树
├── popup/                       # 浏览器弹窗
├── browser/                     # Chrome IPC 通信
├── infrastructure/              # 日志与错误处理
├── ui/                          # 共享通知、图标与 UI hooks
├── shared/                      # 纯工具、协议、输入校验、常量
└── types/                       # 领域类型定义

tests/                           # 自动化回归测试
├── chatgptAdapter.test.ts       # ChatGPT 适配器测试
├── geminiAdapter.test.ts        # Gemini 适配器测试
├── kimiAdapter.test.ts          # Kimi 适配器测试
├── smartObserver.test.ts        # DOM 观察器测试
├── syncEngine.test.ts           # 同步引擎测试
├── database.test.ts             # 数据库测试
└── ...                          # 其他测试
```

## 🎯 当前产品逻辑

### 保存策略

- 新对话默认不会自动保存
- 只有手动保存成功后的对话才会被持久化为"已激活"
- 已激活对话在页面重载、SPA 路由切回该对话时会自动恢复监听
- 路由切到未手动保存的新对话时，不会因为旧 observer 残留而误保存

### 搜索

- 普通列表是全量加载 + 虚拟渲染
- 搜索结果由后台分页返回，默认每页 `50` 条
- 搜索会结合当前文件夹筛选条件

### 导出

- 单条导出：Markdown 文件
- 批量导出：ZIP 文件
- ZIP 目录结构：`平台/文件夹路径/时间戳_标题.md`

## ✅ 测试与质量保证

执行 `npm run check` 验证格式、源码与测试类型、ESLint、单元/集成测试和生产构建。测试覆盖适配器、观察器、同步、数据库、导出、IPC 校验及异步搜索。

执行 `npm run test:coverage` 生成实测报告；全项目沿用 70% 门槛，尚未达标的存量 UI 测试债务会明确报错，不把测试通过数量当作覆盖率。

保存默认按局部快照合并，不因当前页面缺少某条消息就删除历史。无法唯一定位、存在分支冲突或不确定的中段编辑时，会提示失败并保留原记录。在线平台的 DOM 兼容性还需真实浏览器验收。

## 📊 性能优化

v1.2.0 版本包含多项性能优化（机制层面）：

| 优化项 | 机制 |
|--------|------|
| 锚点匹配算法 | Rabin-Karp，O(n²) → O(n) |
| DOM 观察器 | 1500ms 防抖 + 禁用 characterData 监听 |
| 虚拟列表渲染 | react-window，overscanCount=3 |
| 批量删除 | `anyOf()` 单次批量操作 |
| 日期格式化 | `formatDateCached()` 缓存 |

## 📚 维护文档

- **产品与使用**：[README.md](./README.md)
- **架构与平台扩展**：[ARCHITECTURE.md](./ARCHITECTURE.md) — 适配器注册、配置位置、分层与同步数据流
- **AI 开发约束**：[AGENTS.md](./AGENTS.md)

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

## 📄 License

MIT License

---

**Version**: 1.2.0

**Last Updated**: 2026-10-16
**Status**: 持续维护；发布前需真实浏览器验收
