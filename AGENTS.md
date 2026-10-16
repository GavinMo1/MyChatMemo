# MyChatMemo - AI 协作指南

> 本文档是 AI 助手在本项目开发时的**规则手册**，不是变更日志。
> 版本：1.2.0 | 更新：2026-10-16 | 状态：本地开发，发布前需真实浏览器验收

## 项目概览

Chrome MV3 扩展，保存 AI 对话到本地 IndexedDB。核心策略：手动保存 → 激活 → 自动增量同步。

## 核心架构约束

### 模块边界（违反即为架构破坏）

- `background/` - Service Worker，所有数据库操作必须在此层
- `content/` - DOM 提取、观察、路由、激活状态及页内 UI；禁止直接操作 IndexedDB
- `shared/` - 平台无关工具与协议，禁止 DOM、Chrome、存储、网络副作用
- `browser/` - Chrome IPC 通信；`infrastructure/` - 日志与错误处理；`ui/` - 共享 React UI
- `types/` - 类型定义，禁止引入实现代码

### 性能关键路径（已优化，不可回退）

1. **锚点匹配** (`background/anchorMatcher.ts`)
   - 使用 Rabin-Karp 算法，O(n) 复杂度
   - 禁止改回 O(n²) 的嵌套循环实现

2. **DOM 观察器** (`content/smartObserver.ts`)
   - 防抖 1500ms（`OBSERVER_DEBOUNCE_DELAY`），禁用 characterData 监听
   - 禁止监听整个 document.body/html；通过 resolveTarget 或 containerSelector 定位对话根

3. **虚拟列表** (`sidepanel/components/ConversationList.tsx`)
   - overscanCount = 3，禁止超过 6
   - 使用 `react-window`，禁止全量渲染长列表

4. **日期缓存** (`shared/utils.ts`)
   - 使用 `formatDateCached()`，禁止在循环中直接 `new Date()`

### 平台适配器规则

每个适配器 (`content/adapters/*.ts`) 必须提供以下能力（基类默认方法可继承或覆盖）：
- `verifyUrl()` - URL 验证
- `extractConversationId()` - 对话 ID 提取
- `extractMessages()` - 消息提取
- `extractTitle()` - 标题提取
- `getSelectors()` - 平台选择器配置
- `getObservationRoot()` - 全对话观察根（与单条消息选择器分开）
- `getUserTurns()` - 时间线定位能力（UI 不判断平台 DOM）

新增平台适配器步骤：
1. 实现 `BaseAdapter` 接口
2. 注册到 `content/adapters/registry.ts`（公共导出按需更新 `index.ts`）
3. 对齐 Platform 类型、PLATFORM_LABELS、protocolValidation 平台白名单，以及 `public/manifest.json` 的三处域名配置
4. 编写完整测试用例（参考 ChatGPT 适配器及能力测试），重新构建并做真实浏览器验收

### 安全红线

1. **IPC 消息验证**
   - 所有 background 消息处理器必须验证 payload 结构
   - 使用 `shared/protocol.ts` 定义的类型

2. **输入净化**
   - 文件名必须通过正则清理特殊字符

## 测试要求

### 测试覆盖标准

- 新增适配器：必须 100% 覆盖 `verifyUrl`、`extractConversationId`、`extractMessages`
- 核心逻辑修改：必须保持测试全部通过，禁止引入 TODO
- 性能优化：必须添加性能对比测试（before/after）

### 测试环境

- 框架：Vitest + jsdom + fake-indexeddb
- JSDOM polyfills：`innerText`、`offsetParent` 已在 `tests/setup.ts` 中实现
- 运行：`npm run test`（CI 必须通过）

## 同步安全

- `snapshot` 缺省为 partial；手动保存或滚动采集不能自动视为 complete。
- 局部快照不得依据消息缺席删除历史；无法唯一定位时明确失败。
- 完整同步的元数据、消息与搜索索引同事务，后台按会话串行。

## 数据库操作

### 索引使用（v7 schema）

- `messages`: 独立 `conversationId` 索引 + 复合索引 `[conversationId+metadata.position]`
- 批量删除：使用 `where('conversationId').anyOf(ids).delete()`

### 迁移规则

- 新增字段：可选字段 + 默认值
- 修改 schema：递增版本号，添加 `upgrade()` 函数
- 禁止：删除字段、改变主键

## 界面文案

- 仅提供简体中文，文案直接硬编码在组件中，不使用 i18n 框架
- 新增 UI 文案直接写中文字符串

## 工具链命令

```bash
npm run dev              # 开发模式（热重载）
npm run build            # 生产构建
npm run build:analyze    # Bundle 分析
npm run check            # 格式、源码与测试类型检查、lint、测试、构建
npm run test             # 运行测试
npm run lint             # ESLint 检查
npm run format:check     # 只检查格式，不修改文件
npm run format           # Prettier 格式化
```

## 环境变量（无）

本项目无需环境变量。适配器、权限和默认参数属于源码配置；Chrome Storage 保存对话激活状态，IndexedDB 保存对话等业务数据。完整接入清单见 ARCHITECTURE.md。

## 禁止事项

1. ❌ 在 content script 中直接调用 `db.*`（必须通过 IPC）
2. ❌ 在 `shared/` 中引入 `chrome.*` API（必须保持平台无关）
3. ❌ 使用 `eval()` 或 `Function()` 构造器
4. ❌ 在 background 中使用 `window` 或 `document`
5. ❌ 修改性能优化代码时移除性能测试
6. ❌ 跳过 TypeScript 类型检查（禁止 `@ts-ignore`，除非有注释说明）

## 深入文档

完整技术细节参见：

| 文档 | 内容 |
|------|------|
| [README.md](./README.md) | 产品特性、安装使用 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构设计、模块职责、数据流 |
实现机制只在架构文档维护；不新增已完成任务的计划或整理报告。性能与覆盖率以实际测量为准。

---

**维护原则**：本文件应保持精简（~300 行以内），只记录"下次 AI 写代码时必须知道的规则"，不记录历史叙事。
