# 成绩雷达 — AI 功能 UI 设计方案

> **版本**: v1.0  
> **日期**: 2026-04-07  
> **状态**: ✅ 已批准  
> **适用平台**: Web 版（优先）→ 小程序版（后继）

---

## 1. 设计概述

### 1.1 目标

在成绩雷达 Web 版中集成 AI 能力，提供两个核心交互入口：

| 入口 | 形态 | 用户价值 |
|------|------|---------|
| **AI 助手对话页** | 独立 Tab 页，全屏聊天式 | 主动提问、自由交流、多功能合一 |
| **AI 分析报告卡片** | 嵌入趋势图下方 | 被动触发、数据洞察、一键生成 |

### 1.2 核心决策

- **模型**: DeepSeek-V3.2（CloudBase 内置，hunyuan-exp）
- **调用方式**: 云函数 + Prompt 配置文件（方案 B）
- **权限**: 登录后即可使用（首期不做 VIP 限制）
- **开发顺序**: Web 版优先 → 验证后移植小程序

> 2026-04-07 实施收口说明：
> 1. 首期 web 版只落地“成绩分析中的 AI 分析卡片”与“批量填写中的 AI 辅助录入”。
> 2. 独立 AI 助手页、聊天历史、VIP 限制保留为后续扩展草案，本轮不实现。

### 1.3 设计原则

1. **渐进增强**：AI 是增值功能，不影响现有核心流程
2. **身份明确**：通过视觉语言让用户区分「系统 UI」和「AI 内容」
3. **按需触发**：不自动消耗 token，用户主动点击才调用
4. **移动端优先**：Web 版设计需考虑后续小程序复用

---

## 2. 整体架构

### 2.1 导航结构变化

```
修改前:
  [考试详情] [成绩分析] [设置]

修改后:
  [考试详情] [成绩分析] [🤖 AI助手] [设置]
                        ↑ 新增
```

在 `index.html` 的 `.tabs` 容器中，在「成绩分析」tab 按钮之后、「设置」tab 按钮之前，插入新的 tab：

```html
<button class="tab" data-tab="ai">🤖 AI助手</button>
```

新增对应的内容区域：

```html
<div class="content-section" id="tab-ai">
    <!-- AI 对话页内容 -->
</div>
```

### 2.2 数据流向

```
┌──────────────────────────────────────────────────────────┐
│                      成绩雷达 Web                          │
│                                                          │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────────┐  │
│  │ 考试详情  │   │  成绩分析    │   │  🤖 AI助手       │  │
│  │   tab    │   │   tab       │   │     tab          │  │
│  └──────────┘   └──────┬──────┘   └────────┬─────────┘  │
│                       │                    │             │
│               AI 分析报告卡片        AI 对话界面           │
│               (趋势图下方)           (全屏聊天)            │
│                       │                    │             │
└───────────────────────┼────────────────────┼─────────────┘
                        │                    │
                   ┌────▼────────────────────▼────┐
                   │      ai_service 云函数         │
                   │                               │
                   │  ┌─────────────────────────┐  │
                   │  │ prompts/                 │  │
                   │  │ ├── analyze.js (分析)    │  │
                   │  │ ├── inputParse (录入)    │  │
                   │  │ ├── chat (对话)          │  │
                   │  │ ├── report-score (分报告) │  │
                   │  │ └── report-rank (排报告)  │  │
                   │  ├─────────────────────────┤  │
                   │  │ ai_client.js (调用封装)   │  │
                   │  └─────────────────────────┘  │
                   └──────────────┬────────────────┘
                                  │
                     ┌────────────▼────────────┐
                     │  CloudBase AI            │
                     │  deepseek-v3.2           │
                     └─────────────────────────┘
```

---

## 3. AI 助手对话页（tab-ai）

### 3.1 布局结构

全屏沉浸式聊天界面，采用「居中容器」布局：

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ┌───────────────────────────────────────────────┐     │
│   │  🤖 AI 学习助手                       [♡ VIP]  │     │  ← 页面标题栏
│   └───────────────────────────────────────────────┘     │
│                                                         │
│   ══════════════════════════════════════════════════   │  ← 分隔线
│                                                         │
│   ┌───────────────────────────────────────────────┐     │
│   │                                                │     │
│   │   💡 我可以帮你做这些事                          │     │  ← 能力引导卡
│   │                                                │     │
│   │   ┌─────────────┐  ┌─────────────┐             │     │
│   │   │ 🔍 分析趋势  │  │ 📝 快速录入  │             │     │  ← 快捷入口
│   │   └─────────────┘  └─────────────┘             │     │    (2x2 网格)
│   │   ┌─────────────┐  ┌─────────────┐             │     │
│   │   │ 💡 学习建议  │  │ 📊 学习报告  │             │     │
│   │   └─────────────┘  └─────────────┘             │     │
│   │                                                │     │
│   └───────────────────────────────────────────────┘     │
│                                                         │
│   ┌───────────────────────────────────────────────┐     │
│   │  🧑 你                                         │     │  ← 用户消息气泡
│   │  帮我分析一下数学最近几次考试的情况              │     │    (右对齐)
│   └───────────────────────────────────────────────┘     │
│                                                         │
│   ┌───────────────────────────────────────────────┐     │
│   │  🤖 AI                                         │     │  ← AI 回复气泡
│   │                                                │     │    (左对齐)
│   │  好的，让我来看看你的数学成绩...                 │     │    Markdown渲染
│   │                                                │     │    流式打字
│   └───────────────────────────────────────────────┘     │
│                                                         │
│                                                         │
│                                          ┌────────────┐│
│                                          │ 输入消息... ││  ← 底部输入区(固定)
│                                          │      [发送]││
│                                          └────────────┘│
└─────────────────────────────────────────────────────────┘
```

#### HTML 结构骨架

```html
<div class="content-section active" id="tab-ai">
    <div class="ai-page">
        <!-- 标题栏 -->
        <div class="ai-header">
            <div class="ai-header-info">
                <span class="ai-header-icon">🤖</span>
                <div class="ai-header-text">
                    <h2>AI 学习助手</h2>
                    <p class="ai-header-desc">基于你的成绩数据，提供智能分析和学习建议</p>
                </div>
            </div>
            <div class="ai-header-badge" id="aiVipBadge">♡ VIP</div>
        </div>

        <!-- 对话区域（可滚动） -->
        <div class="ai-chat-area" id="aiChatArea">
            <!-- 能力引导卡片 -->
            <div class="ai-welcome-card" id="aiWelcomeCard">
                <div class="ai-welcome-title">💡 我可以帮你做这些事</div>
                <div class="ai-shortcuts-grid">
                    <button class="ai-shortcut-btn" data-action="analyze">
                        <span class="ai-shortcut-icon">🔍</span>
                        <span class="ai-shortcut-label">分析成绩趋势</span>
                    </button>
                    <button class="ai-shortcut-btn" data-action="inputParse">
                        <span class="ai-shortcut-icon">📝</span>
                        <span class="ai-shortcut-label">快速录入成绩</span>
                    </button>
                    <button class="ai-shortcut-btn" data-action="advice">
                        <span class="ai-shortcut-icon">💡</span>
                        <span class="ai-shortcut-label">学习方法建议</span>
                    </button>
                    <button class="ai-shortcut-btn" data-action="report">
                        <span class="ai-shortcut-icon">📊</span>
                        <span class="ai-shortcut-label">生成学习报告</span>
                    </button>
                </div>
                <!-- 欢迎语 -->
                <div class="ai-welcome-msg">
                    <p>你好！我是你的 AI 学习助手。你可以：</p>
                    <ul>
                        <li><strong>自然语言录入成绩</strong>：「数学考了92分」</li>
                        <li><strong>询问成绩分析</strong>：「我最近进步了吗？」</li>
                        <li><strong>获取学习建议</strong>：「英语怎么提高？」</li>
                    </ul>
                </div>
            </div>

            <!-- 消息列表由 JS 动态渲染 -->
            <div class="ai-messages" id="aiMessages"></div>
        </div>

        <!-- 未登录提示（条件显示） -->
        <div class="ai-login-prompt" id="aiLoginPrompt" style="display: none;">
            <p>🔒 登录后即可使用 AI 学习助手</p>
            <button class="btn btn-primary" id="aiLoginBtn">登录以解锁 AI</button>
        </div>

        <!-- 输入区域（固定底部） -->
        <div class="ai-input-area" id="aiInputArea">
            <div class="ai-input-wrap">
                <textarea 
                    class="ai-input" 
                    id="aiInput" 
                    placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                    rows="1"
                ></textarea>
                <button class="ai-send-btn" id="aiSendBtn" disabled>
                    <span>发送</span>
                </button>
            </div>
            <p class="ai-input-hint">AI 基于你的真实成绩数据回答 · VIP 专享功能</p>
        </div>
    </div>
</div>
```

### 3.2 能力引导快捷入口

用户首次进入或清空对话时展示。点击后自动填入输入框并发送。

| 按钮 | 图标 | 预填文本 | action 参数 |
|------|------|---------|------------|
| 分析成绩趋势 | 🔍 | 「帮我分析最近几次考试的成绩趋势和科目强弱」 | `analyze` |
| 快速录入成绩 | 📝 | 「我要录入成绩：[请告诉我科目、分数、满分]」 | `inputParse` |
| 学习方法建议 | 💡 | 「根据我的成绩情况，给我一些针对性的学习建议」 | `advice` |
| 生成学习报告 | 📊 | 「请帮我生成一份完整的个人学习分析报告，包括各科表现和改进方向」 | `report` |

### 3.3 对话消息组件

#### 用户消息

```
┌────────────────────────────────────┐
│                            🧑 你   │
│                                    │
│                    帮我分析一下     │
│                    数学最近几次的   │
│                    考试情况         │
└────────────────────────────────────┘
```

- 右对齐
- 背景：浅紫色 (`var(--ai-bg-subtle)`)
- 圆角：右上角小圆角（12px），其余大圆角（18px）

#### AI 消息

```
┌────────────────────────────────────┐
│  🤖 AI                              │
│                                    │
│  好的！让我来分析一下你的           │
│  数学考试成绩：                      │
│                                    │
│  📊 近期数学成绩概览                 │
│  - 最近5次平均分：87.4              │
│  - 最高分：95（期中考）              │
│  - 最低分：78（月考）                │
│                                    │
│  📈 趋势判断：稳步上升 ↑             │
│  ...                                │
└────────────────────────────────────┘
```

- 左对齐，带 AI 头像图标
- 背景：白色卡片 (`var(--bg-card)`) + 边框
- 支持 Markdown 渲染（加粗、列表、代码块）
- 流式输出时显示闪烁光标 `▎`
- 圆角：左上角小圆角，其余大圆角

### 3.4 状态管理

| 状态 | 条件 | UI 表现 |
|------|------|---------|
| **未登录** | `currentUser === null` | 隐藏输入框，显示登录引导卡片；能力引导卡隐藏 |
| **已登录非 VIP** | `currentUser && !isVip` | 正常可用但显示次数限制 / 引导开通；标题 badge 显示「升级VIP」 |
| **VIP 已激活** | `currentUser && isVip` | 完全可用；标题 badge 显示「♡ VIP」金色 |
| **空会话** | 无历史消息 | 显示欢迎语 + 能力引导卡片 |
| **有会话** | 有历史消息 | 隐藏欢迎语，显示消息列表 |
| **AI 思考中** | 已发送等待响应 | 输入框 disabled；最后一条 AI 消息处显示跳动的三点动画 `···` |
| **AI 流式输出** | 收到 SSE stream | 文字逐字/逐句出现，带光标 |
| **发送失败** | 网络错误 / API 错误 | 消息气泡内显示错误提示 + 重试按钮 |

### 3.5 权限控制逻辑流

```
用户打开 AI 助手 tab
  │
  ├─ 检查登录状态
  │   ├─ 未登录 → 显示登录引导 → 登录成功后初始化对话
  │   └─ 已登录 ↓
  │
  ├─ 检查 VIP 状态
  │   ├─ 非 VIP → 显示「升级 VIP」入口 + 限制每日免费次数（如 3 次/天）
  │   └─ VIP → 无限制使用
  │
  ├─ 初始化对话界面
  │   └─ 加载本地缓存的历史消息（如有）
  │
  └─ 用户发消息
      ├─ 校验权限（登录+剩余次数）
      ├─ 追加用户消息到列表
      ├─ 调用云函数 ai_service { action: "chat", message, history }
      ├─ 流式接收并渲染 AI 回复
      └─ 保存到本地历史记录
```

---

## 4. AI 分析报告卡片（嵌入趋势图）

### 4.1 位置与嵌入方式

在 `index.html` 的 `tab-trend` 区域内，趋势图卡片 (`#trendCard`) 之后插入 AI 报告卡片：

```html
<div class="content-section" id="tab-trend">
    <!-- 现有的图表类型切换 tabs -->
    <div class="chart-tabs" id="analysisModeTabs">...</div>

    <!-- 现有的趋势图卡片 -->
    <div class="card" id="trendCard">...</div>
    
    <!-- 现有的雷达图卡片 -->
    <div class="card" id="radarCard" style="display:none;">...</div>

    <!-- ★ 新增：AI 分析报告卡片 ★ -->
    <div class="card ai-report-card" id="aiScoreReportCard">
        <!-- 由 JS 渲染内容 -->
    </div>
    
    <!-- 排名趋势的 AI 报告卡片（初始隐藏） -->
    <div class="card ai-report-card" id="aiRankReportCard" style="display:none;">
        <!-- 由 JS 渲染内容 -->
    </div>
</div>
```

### 4.2 卡片状态设计

#### 状态 A：未生成（默认态）

```
┌──────────────────────────────────────────────┐
│ ▂▃▅▇▂▃▅▇▂▃▅▇▂▃▅▇▂▃▅▇  AI 学习洞察  ♡ VIP  │  ← 紫色渐变顶条
├──────────────────────────────────────────────┤
│                                              │
│         ┌──────────────────────────┐         │
│         │                          │         │
│         │    ✨                   │         │
│         │    AI 将基于你的考试数据   │         │
│         │    生成深度分析报告       │         │
│         │                          │         │
│         │    • 发现隐藏的趋势规律    │         │
│         │    • 识别优势与薄弱科目    │         │
│         │    • 提供个性化提升建议    │         │
│         │                          │         │
│         │  ┌──────────────────┐    │         │
│         │  │  🤖 生成 AI 报告  │    │         │  ← 主按钮
│         │  └──────────────────┘    │         │
│         │                          │         │
│         └──────────────────────────┘         │
│                                              │
└──────────────────────────────────────────────┘
```

#### 状态 B：生成中（流式输出）

```
┌──────────────────────────────────────────────┐
│ ▂▃▅▇ AI 学习洞察 ♡ VIP       [✕ 停止生成]  │
├──────────────────────────────────────────────┤
│                                              │
│  📊 基于最近 5 场考试的分数分析               │
│                                              │
│  总体来看，你最近的考试成绩呈现稳步上升的趋 ▎  │  ← 逐字出现 + 光标
│                                              │
│  ┌──────────────────────────────────┐       │
│  │   ⏳ AI 正在分析你的成绩数据...    │       │  ← loading 提示条
│  │   ████████░░░░░░░░░░  60%        │       │
│  └──────────────────────────────────┘       │
│                                              │
└──────────────────────────────────────────────┘
```

#### 状态 C：生成完成（混合式报告 - 折叠态）

```
┌──────────────────────────────────────────────┐
│ ▂▃▅▇ AI 学习洞察 ♡ VIP       [↻ 重新生成]  │
├──────────────────────────────────────────────┤
│                                              │
│  📊 基于最近 5 场考试的分数分析               │
│                                              │
│  ┌────────────────────────────────────┐      │
│  │ 📝 总体评价                        │      │
│  │                                    │      │
│  │ 你的成绩整体呈上升趋势，总分从      │      │
│  │ 425分提升至468分，进步43分。数学    │      │
│  │ 和物理是主要拉分科目，英语需加强。  │      │
│  └────────────────────────────────────┘      │
│                                              │
│  📈 数学：近3次平均88分，较期初↑12分          │
│  ⚠️ 英语：波动较大(82→78→85)，需稳定发挥       │
│  🎯 物理：保持优秀，得分率稳定90%+             │
│  💪 建议：重点突破英语阅读理解                 │
│                                              │
│                    [展开全部 ▼]              │  ← 折叠按钮
│                                              │
└──────────────────────────────────────────────┘
```

#### 状态 D：生成完成（展开态）

同上，但：
- 要点区域完整展开（可能有 6-8 条要点）
- 底部按钮变为「收起 ▲」

#### 状态 E：未登录

```
┌──────────────────────────────────────────────┐
│ ▂▃▅▇ AI 学习洞察                             │
├──────────────────────────────────────────────┤
│                                              │
│         🔒 登录后开启 AI 智能分析             │
│                                              │
│         AI 将深度分析你的成绩数据，            │
│         发现隐藏趋势和改进机会                │
│                                              │
│      ┌──────────────────────────┐            │
│      │  👤 登录以解锁 AI 分析    │            │
│      └──────────────────────────┘            │
│                                              │
└──────────────────────────────────────────────┘
```

#### 状态 F：非 VIP

```
┌──────────────────────────────────────────────┐
│ ▂▃▅▇ AI 学习洞察              👑 升级 VIP   │
├──────────────────────────────────────────────┤
│                                              │
│         ✨ AI 深度分析你的成绩                │
│                                              │
│         本功能为 VIP 专享特权                  │
│         开通后即可享受：                       │
│         • 智能成绩分析与趋势预测               │
│         • 个性化学习建议                       │
│         • AI 学习助手无限对话                  │
│                                              │
│      ┌──────────────────────────┐            │
│      │  👑 开启 VIP 解锁 AI     │            │
│      └──────────────────────────┘            │
│                                              │
└──────────────────────────────────────────────┘
```

### 4.3 两份报告的差异设计

| 维度 | 分数趋势报告 (`#aiScoreReportCard`) | 排名趋势报告 (`#aiRankReportCard`) |
|------|-----|------|
| **显示时机** | 切换到「分数趋势」或「总分趋势」模式时可见 | 切换到「排名趋势」模式时可见 |
| **图标** | 📊 分数洞察 | 🏅 排名洞察 |
| **Prompt ID** | `report-score` | `report-rank` |
| **分析维度** | 分数绝对值、得分率、科目对比、进退步幅度 | 位次竞争、percentile、班级/年级排名变化 |
| **总评侧重点** | 「总分从 X 升至 Y，进步 Z 分」 | 「年级排名从第 N 名进至第 M 名」 |
| **典型要点** | 「数学得分率 72%→88%」<br>「英语低于班级均分 5 分」 | 「年级前 10% 区间，竞争力强」<br>「超越同年级 85% 学生」 |

### 4.4 卡片渲染 JS 接口

```javascript
/**
 * AI 报告卡片渲染器
 * 位于 src/ai-report-card.js
 */
const AiReportCard = {
    /**
     * 初始化卡片（根据当前状态渲染正确的 UI）
     * @param {'score'|'rank'} type - 报告类型
     */
    init(type) { /* ... */ },

    /**
     * 渲染未生成态
     */
    renderEmpty() { /* ... */ },

    /**
     * 渲染生成中态（开始流式输出）
     */
    renderStreaming() { /* ... */ },

    /**
     * 追加流式内容
     * @param {string} textChunk - 新收到的文本片段
     */
    appendStream(textChunk) { /* ... */ },

    /**
     * 渲染完成态（解析 Markdown 并渲染混合式报告）
     * @param {string} fullText - AI 返回的完整文本
     */
    renderComplete(fullText) { /* ... */ },

    /**
     * 切换折叠/展开
     */
    toggleCollapse() { /* ... */ },

    /**
     * 渲染未登录/非 VIP 状态
     * @param {'logged_out'|'non_vip'} state
     */
    renderLocked(state) { /* ... */ }
};
```

---

## 5. 视觉设计规范

### 5.1 色彩系统（AI 扩展）

在现有 `styles.css` 的 `:root` 变量基础上扩展：

```css
:root {
    /* ====== 现有变量（保持不变）====== */
    --bg-primary: #faf8f5;
    --bg-card: #ffffff;
    --text-primary: #2d2a26;
    --text-secondary: #6b6560;
    --accent-warm: #e8a87c;
    --accent-green: #7cb98b;
    --accent-blue: #7ca9c9;
    --accent-purple: #9b8dc4;
    --border-color: #e8e4de;
    --shadow-soft: 0 2px 12px rgba(45, 42, 38, 0.06);
    --shadow-card: 0 4px 20px rgba(45, 42, 38, 0.08);

    /* ====== AI 专属变量（新增）====== */

    /* 主色 */
    --ai-primary: #8b5cf6;
    --ai-primary-light: #a78bfa;
    --ai-primary-dark: #7c3aed;
    --ai-primary-bg: #f5f3ff;

    /* 渐变 */
    --ai-gradient: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);
    --ai-gradient-subtle: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);

    /* 语义色 */
    --ai-user-bubble: #f3effc;       /* 用户消息背景 */
    --ai-ai-bubble: #ffffff;         /* AI 消息背景 */
    --ai-border: #e9d5ff;             /* AI 元素边框 */
    --ai-glow: rgba(139, 92, 246, 0.12); /* 发光效果 */
    --ai-streaming-cursor: #8b5cf6;   /* 流式输出光标色 */

    /* VIP 徽章 */
    --vip-gold: #f59e0b;
    --vip-gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}
```

### 5.2 AI 报告卡片样式

```css
/* ========== AI 报告卡片 ========== */

.ai-report-card {
    margin-top: 16px;
    border: none;
    border-radius: 12px;
    overflow: hidden;
    transition: box-shadow 0.3s ease, transform 0.2s ease;
}

.ai-report-card:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-card);
}

/* 紫色渐变顶条（4px） */
.ai-report-card::before {
    content: '';
    display: block;
    height: 4px;
    background: var(--ai-gradient);
}

/* 卡片头部 */
.ai-report-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px 0;
}

.ai-report-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 600;
    color: var(--ai-primary-dark);
}

.ai-report-title-icon {
    font-size: 1.1rem;
}

/* VIP / 重新生成 按钮 */
.ai-report-action {
    font-size: 0.8rem;
    padding: 4px 12px;
    border-radius: 20px;
    cursor: pointer;
    border: 1px solid var(--ai-border);
    background: var(--ai-primary-bg);
    color: var(--ai-primary-dark);
    font-weight: 500;
    transition: all 0.2s ease;
}

.ai-report-action:hover {
    background: var(--ai-primary-light);
    color: white;
    border-color: var(--ai-primary-light);
}

.ai-report-action.vip-gold {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    border-color: #fcd34d;
}

.ai-report-action.vip-gold:hover {
    background: var(--vip-gold);
    color: white;
    border-color: var(--vip-gold);
}

/* ===== 未生成态 ===== */
.ai-report-empty {
    padding: 40px 20px;
    text-align: center;
}

.ai-report-empty-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
    opacity: 0.8;
}

.ai-report-empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
}

.ai-report-empty-desc {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 280px;
    margin: 0 auto 20px;
}

.ai-report-empty-features {
    text-align: left;
    font-size: 0.82rem;
    color: var(--text-secondary);
    max-width: 260px;
    margin: 0 auto 24px;
    padding-left: 20px;
}

.ai-report-empty-features li {
    margin-bottom: 4px;
}

/* 生成主按钮 */
.ai-generate-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 28px;
    font-size: 0.95rem;
    font-weight: 600;
    color: white;
    background: var(--ai-gradient);
    border: none;
    border-radius: 25px;
    cursor: pointer;
    transition: all 0.25s ease;
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
}

.ai-generate-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
}

.ai-generate-btn:active {
    transform: translateY(0);
}

.ai-generate-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

/* ===== 生成中态 ===== */
.ai-report-streaming {
    padding: 20px;
}

.ai-report-data-hint {
    font-size: 0.82rem;
    color: var(--ai-primary-dark);
    font-weight: 500;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.ai-report-content {
    font-size: 0.92rem;
    line-height: 1.75;
    color: var(--text-primary);
}

/* 流式光标动画 */
.ai-cursor {
    display: inline-block;
    width: 2px;
    height: 1.1em;
    background: var(--ai-streaming-cursor);
    vertical-align: text-bottom;
    margin-left: 2px;
    animation: blink 1s step-end infinite;
}

@keyframes blink {
    50% { opacity: 0; }
}

/* Progress bar for streaming */
.ai-stream-progress {
    height: 3px;
    background: var(--ai-gradient-subtle);
    border-radius: 2px;
    margin-top: 16px;
    overflow: hidden;
}

.ai-stream-progress-bar {
    height: 100%;
    background: var(--ai-gradient);
    border-radius: 2px;
    width: 0%;
    transition: width 0.3s ease;
}

/* ===== 完成态（混合式报告）===== */
.ai-report-complete {
    padding: 20px;
}

/* 总评区块 */
.ai-report-summary-box {
    background: var(--ai-primary-bg);
    border: 1px solid var(--ai-border);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
}

.ai-report-summary-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ai-primary-dark);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.ai-report-summary-text {
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--text-primary);
}

/* 要点列表 */
.ai-report-points {
    list-style: none;
    padding: 0;
    margin: 0;
}

.ai-report-point {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-color);
    font-size: 0.9rem;
    line-height: 1.5;
}

.ai-report-point:last-child {
    border-bottom: none;
}

.ai-report-point-icon {
    font-size: 1rem;
    flex-shrink: 0;
    margin-top: 1px;
}

.ai-report-point-text {
    color: var(--text-primary);
}

.ai-report-point-text strong {
    color: var(--ai-primary-dark);
}

/* 折叠/展开按钮 */
.ai-report-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 10px;
    margin-top: 4px;
    font-size: 0.82rem;
    color: var(--ai-primary);
    background: none;
    border: none;
    border-top: 1px dashed var(--ai-border);
    cursor: pointer;
    transition: color 0.2s;
}

.ai-report-toggle:hover {
    color: var(--ai-primary-dark);
}

/* 折叠时隐藏超出行数的要点 */
.ai-report-points.collapsed .ai-report-point:nth-child(n+5) {
    display: none;
}

/* ===== 锁定态（未登录/非VIP）===== */
.ai-report-locked {
    padding: 36px 20px;
    text-align: center;
}

.ai-report-locked-icon {
    font-size: 2rem;
    margin-bottom: 12px;
}

.ai-report-locked-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 8px;
}

.ai-report-locked-desc {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 280px;
    margin: 0 auto 20px;
}

.ai-report-locked-features {
    text-align: left;
    font-size: 0.82rem;
    color: var(--text-secondary);
    max-width: 260px;
    margin: 0 auto 20px;
    padding-left: 20px;
}

.ai-lock-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 24px;
    font-size: 0.9rem;
    font-weight: 600;
    border: none;
    border-radius: 22px;
    cursor: pointer;
    transition: all 0.2s;
}

.ai-lock-btn.login {
    color: white;
    background: var(--ai-gradient);
}

.ai-lock-btn.login:hover {
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);
}

.ai-lock-btn.vip {
    color: white;
    background: var(--vip-gradient);
}

.ai-lock-btn.vip:hover {
    box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
}
```

### 5.3 AI 对话页样式

```css
/* ========== AI 对话页布局 ========== */

.ai-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 120px);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
}

/* 标题栏 */
.ai-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-card);
    flex-shrink: 0;
}

.ai-header-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.ai-header-icon {
    font-size: 1.8rem;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ai-gradient-subtle);
    border-radius: 12px;
}

.ai-header-text h2 {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
}

.ai-header-desc {
    font-size: 0.78rem;
    color: var(--text-secondary);
    margin: 2px 0 0;
}

.ai-header-badge {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 4px 14px;
    border-radius: 20px;
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
}

/* 对话滚动区域 */
.ai-chat-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    scroll-behavior: smooth;
}

/* 自定义滚动条 */
.ai-chat-area::-webkit-scrollbar {
    width: 5px;
}

.ai-chat-area::-webkit-scrollbar-track {
    background: transparent;
}

.ai-chat-area::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
}

/* ===== 能力引导卡片 ===== */
.ai-welcome-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: var(--shadow-soft);
}

.ai-welcome-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
    text-align: center;
}

.ai-shortcuts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 20px;
}

.ai-shortcut-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    font-size: 0.85rem;
    color: var(--text-primary);
    text-align: left;
}

.ai-shortcut-btn:hover {
    border-color: var(--ai-primary-light);
    background: var(--ai-primary-bg);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px var(--ai-glow);
}

.ai-shortcut-icon {
    font-size: 1.3rem;
    flex-shrink: 0;
}

.ai-shortcut-label {
    font-weight: 500;
}

.ai-welcome-msg {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.7;
    padding: 14px 16px;
    background: var(--ai-primary-bg);
    border-radius: 10px;
}

.ai-welcome-msg p {
    margin-bottom: 8px;
}

.ai-welcome-msg ul {
    padding-left: 18px;
    margin: 0;
}

.ai-welcome-msg li {
    margin-bottom: 4px;
}

.ai-welcome-msg strong {
    color: var(--ai-primary-dark);
}

/* ===== 消息列表 ===== */
.ai-messages {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* 用户消息 */
.ai-msg-user {
    display: flex;
    justify-content: flex-end;
}

.ai-msg-user-bubble {
    max-width: 80%;
    padding: 12px 18px;
    background: var(--ai-user-bubble);
    border-radius: 18px 18px 4px 18px;
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--text-primary);
    word-break: break-word;
}

.ai-msg-user-label {
    font-size: 0.72rem;
    color: var(--text-secondary);
    margin-bottom: 4px;
    text-align: right;
}

/* AI 消息 */
.ai-msg-ai {
    display: flex;
    justify-content: flex-start;
    gap: 10px;
}

.ai-msg-avatar {
    font-size: 1.5rem;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ai-gradient);
    border-radius: 10px;
    flex-shrink: 0;
    font-size: 0.9rem;
    color: white;
    font-weight: 700;
}

.ai-msg-ai-bubble {
    max-width: 80%;
    padding: 14px 18px;
    background: var(--ai-ai-bubble);
    border: 1px solid var(--border-color);
    border-radius: 18px 18px 18px 4px;
    font-size: 0.92rem;
    line-height: 1.7;
    color: var(--text-primary);
    word-break: break-word;
    box-shadow: var(--shadow-soft);
}

.ai-msg-ai-bubble p {
    margin-bottom: 8px;
}

.ai-msg-ai-bubble p:last-child {
    margin-bottom: 0;
}

.ai-msg-ai-bubble ul,
.ai-msg-ai-bubble ol {
    padding-left: 20px;
    margin: 8px 0;
}

.ai-msg-ai-bubble li {
    margin-bottom: 4px;
}

.ai-msg-ai-bubble strong {
    color: var(--ai-primary-dark);
}

.ai-msg-ai-bubble code {
    background: var(--ai-primary-bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'JetBrains Mono', monospace;
}

/* 思考中动画 */
.ai-thinking-dots {
    display: inline-flex;
    gap: 4px;
    padding: 4px 0;
}

.ai-thinking-dots span {
    width: 6px;
    height: 6px;
    background: var(--ai-primary-light);
    border-radius: 50%;
    animation: thinking-bounce 1.4s ease-in-out infinite;
}

.ai-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.ai-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes thinking-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
}

/* 错误消息 */
.ai-msg-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 10px;
    color: #dc2626;
    font-size: 0.85rem;
}

.ai-retry-btn {
    padding: 4px 12px;
    font-size: 0.8rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

/* ===== 未登录遮罩 ===== */
.ai-login-prompt {
    position: absolute;
    inset: 0;
    background: rgba(250, 248, 245, 0.96);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
}

.ai-login-prompt p {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
}

/* ===== 输入区域（固定底部）===== */
.ai-input-area {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-card);
    flex-shrink: 0;
}

.ai-input-wrap {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    max-width: 100%;
}

.ai-input {
    flex: 1;
    padding: 12px 16px;
    border: 1.5px solid var(--border-color);
    border-radius: 20px;
    font-size: 0.92rem;
    font-family: inherit;
    resize: none;
    min-height: 44px;
    max-height: 120px;
    line-height: 1.5;
    outline: none;
    transition: border-color 0.2s;
    background: var(--bg-primary);
    color: var(--text-primary);
}

.ai-input:focus {
    border-color: var(--ai-primary-light);
    box-shadow: 0 0 0 3px var(--ai-glow);
}

.ai-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
}

.ai-send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: var(--ai-gradient);
    color: white;
    cursor: pointer;
    flex-shrink: 0;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
}

.ai-send-btn:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
}

.ai-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.ai-input-hint {
    font-size: 0.72rem;
    color: var(--text-secondary);
    text-align: center;
    margin-top: 6px;
    opacity: 0.7;
}
```

### 5.4 响应式断点

```css
/* 平板及以下：对话页全宽 */
@media (max-width: 768px) {
    .ai-page {
        height: calc(100vh - 100px);
    }

    .ai-chat-area {
        padding: 12px;
    }

    .ai-welcome-card {
        padding: 16px;
    }

    .ai-shortcuts-grid {
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .ai-msg-user-bubble,
    .ai-msg-ai-bubble {
        max-width: 88%;
    }

    .ai-input-area {
        padding: 10px 12px 12px;
    }

    /* 报告卡片在小屏幕上字体缩小 */
    .ai-report-complete {
        padding: 14px;
    }

    .ai-report-summary-text,
    .ai-report-point-text {
        font-size: 0.85rem;
    }
}

/* 手机竖屏 */
@media (max-width: 480px) {
    .ai-header {
        padding: 12px 14px;
    }

    .ai-header-icon {
        width: 38px;
        height: 38px;
        font-size: 1.5rem;
    }

    .ai-header-text h2 {
        font-size: 1rem;
    }

    .ai-welcome-card {
        padding: 14px;
        border-radius: 12px;
    }

    .ai-msg-avatar {
        width: 28px;
        height: 28px;
        font-size: 0.75rem;
    }
}
```

---

## 6. 交互细节规范

### 6.1 流式输出实现策略

```
前端调用云函数时使用 stream 模式：

云函数返回 SSE (Server-Sent Events) 格式：
  data: {"type":"thinking"}\n\n
  data: {"type":"delta","content":"好的"}\n\n
  data: {"type":"delta","content："，让我"}\n\n
  data: {"type":"delta","content":"来看..."}\n\n
  data: {"type":"done"}\n\n

前端处理：
  1. thinking → 显示跳动三点动画
  2. delta → 追加文字到消息气泡末尾 + 光标
  3. done → 移除光标，启用重新生成按钮
  4. error → 显示错误提示 + 重试按钮
```

### 6.2 折叠/展开逻辑

```
默认状态：最多显示 4 个要点
- 第 5 个及以后的要点隐藏
- 底部显示「展开全部 ▼」(附带隐藏数量如「展开全部 3 条 ▼」)

点击展开：
- 所有要点显示（带淡入动画 200ms）
- 按钮变为「收起 ▲」

点击收起：
- 恢复为只显示前 4 个
- 滚动到卡片顶部
```

### 6.3 重新生成

```
点击「重新生成」：
  1. 清空当前报告内容
  2. 恢复为 streaming 状态
  3. 重新调用云函数（加入随机 seed 让结果不同）
  4. 再次流式输出新报告
```

注意：每次重新生成都消耗一次 AI 调用额度。

### 6.4 输入框行为

| 操作 | 行为 |
|------|------|
| Enter | 发送消息 |
| Shift + Enter | 换行 |
| 输入内容为空 | 发送按钮禁用 |
| 发送后 | 清空输入框，恢复单行高度 |
| 超过 3 行 | 出现滚动条（max-height: 120px） |
| Ctrl/Cmd + V | 粘贴文本 |
| AI 思考中 | 输入框禁用，防止重复发送 |

---

## 7. 文件清单

### 7.1 新增文件

| 文件路径 | 类型 | 说明 |
|----------|------|------|
| `src/ai-chat.js` | JS 模块 | AI 对话页逻辑：消息收发、流式渲染、历史管理 |
| `src/ai-report-card.js` | JS 模块 | AI 分析报告卡片：状态机、渲染器、事件绑定 |
| `src/ai-client.js` | JS 工具 | 云函数调用封装：stream 模式、错误重试、权限校验 |
| `src/styles-ai.css` | CSS | AI 功能所有样式（也可合并入 styles.css） |

### 7.2 修改文件

| 文件 | 改动说明 |
|------|---------|
| `index.html` | 新增 AI tab 按钮和 `tab-ai` 区域 + 报告卡片容器 |
| `src/styles.css` | 在 `:root` 中追加 AI 色彩变量（约 15 行） |
| `src/app.js` | 引入 AI 模块，绑定 tab 切换事件，注册 AI 相关全局函数 |

### 7.3 云函数（后续实施）

| 文件路径 | 说明 |
|----------|------|
| `cloudfunctions/ai_service/index.js` | 统一入口，分发 action |
| `cloudfunctions/ai_service/prompts/chat.js` | 对话 System Prompt |
| `cloudfunctions/ai_service/prompts/analyze.js` | 分析 Prompt |
| `cloudfunctions/ai_service/prompts/inputParse.js` | 录入解析 Prompt |
| `cloudfunctions/ai_service/prompts/report-score.js` | 分数报告 Prompt |
| `cloudfunctions/ai_service/prompts/report-rank.js` | 排名报告 Prompt |
| `cloudfunctions/ai_service/prompts/advice.js` | 学习建议 Prompt |
| `cloudfunctions/ai_service/ai_client.js` | CloudBase AI 调用封装 |

---

## 8. 错误处理

| 场景 | 用户看到的表现 | 处理方式 |
|------|---------------|---------|
| 未登录打开 AI tab | 登录引导卡片 | 引导去登录页 |
| 非 VIP 尝试使用 | 弹出 VIP 升级引导 | 引导去开通页 |
| 今日免费额度用完 | 「今日次数已用完，明天再来 or 升级 VIP」 | 显示倒计时 / 引导升级 |
| 网络断开 | 消息气泡内红色错误 + 重试按钮 | 本地不丢消息，恢复网络后可重试 |
| AI 超时 (>30s) | 「AI 思考时间较长，是否继续等待？」 | 可选取消或继续等 |
| AI 返回异常内容 | 「AI 返回了异常内容，是否重新生成？」 | 一键重新生成 |
| 流式中途断开 | 已输出的内容保留，尾部显示错误 | 支持从断点续传或重新生成 |

---

## 9. 扩展预留

### P1 功能（第二阶段）

- **语音输入**：输入框旁增加麦克风按钮，调用 Whisper API
- **对话历史持久化**：云数据库存储，多设备同步
- **分享 AI 报告**：将 AI 分析报告纳入分享图片

### P2 功能（远期）

- **自定义 AI 人设**：VIP 高级权益，调整 AI 说话风格
- **AI 辅助目标设定**：根据成绩数据智能推荐目标分数
- **家长视角报告**：生成面向家长的简明报告（不同于学生视角）

---

> **文档结束** — 下一步转入 implementation plan 编写阶段
