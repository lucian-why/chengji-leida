# 🤖 成绩雷达 Web 版 — AI 集成架构设计

> **模型**: DeepSeek-V3.2（通过 CloudBase 内置 AI）  
> **方案**: 云函数 + Prompt 配置文件（方案 B）  
> **优先级 P0**: AI 学习洞察 + AI 辅助录入  
> **日期**: 2026-04-07
> **当前实现决策**: 首期只做“AI 分析卡片 + AI 辅助录入”，独立 AI 助手页延后到 P1  
> **权限**: 登录后即可使用，首期不做 VIP 限制

---

## 一、Web 版项目现状

| 维度 | 详情 |
|------|------|
| **路径** | `E:/成绩雷达/成绩雷达_web` |
| **技术栈** | Vite + 原生 ES Module + Chart.js |
| **构建** | `vite build` → 单文件输出 |
| **部署** | GitHub Pages（CDN 分发） |
| **数据存储** | localStorage（本地）+ Supabase Auth（登录） |
| **云函数** | 已有 18 个云函数（认证、同步等） |
| **模块数** | 20 个 src/*.js 文件，职责清晰分离 |

### 关键发现

1. **Web 版已有云函数基础设施** — `cloud-functions/` 下 18 个函数
2. **Web 版有 `src/cloud-tcb.js`** — 已封装腾讯云开发 SDK 调用
3. **单页应用** — `index.html` + `src/app.js` 主入口
4. **无 AI 相关代码** — 需要从零构建

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                    浏览器 (GitHub Pages)                      │
│                                                              │
│   index.html                                                 │
│   ┌─────────────────────────────────────────────────────┐    │
│   │                  src/ 模块层                        │    │
│   │                                                     │    │
│   │  app.js          ← 主入口                           │    │
│   │  ├── ai.js            ← 【新增】AI 功能入口         │    │
│   │  │   ├── getAIAnalysis()      调用云函数获取分析     │    │
│   │  │   ├── aiParseInput()       调用云函数解析输入     │    │
│   │  │   └── renderAICard()       渲染分析卡片 UI        │    │
│   │  │                                                    │    │
│   │  ├── exam-detail.js    ← 现有（加入 AI 录入入口）     │    │
│   │  ├── chart-trend.js     ← 现有（加入 AI 分析卡片）    │    │
│   │  ├── report.js          ← 现有（加入 AI 评语）        │    │
│   │  └── ... (其他现有模块)                               │    │
│   └────────────────────┬────────────────────────────────┘    │
│                        │ wx.cloud.callFunction               │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                云端 (CloudBase)                                │
│                                                              │
│   cloud-functions/ai_service/  ← 【新增】统一 AI 入口         │
│   ├── index.js              主函数，分发 action              │
│   ├── prompts/                                                   │
│   │   ├── analyze.js        分析 System Prompt 模板          │
│   │   └── inputParse.js     录入解析 System Prompt 模板       │
│   └── package.json                                              │
│                                                                  │
│   CloudBase 内置 AI                                               │
│   └─ hunyuan-exp / deepseek-v3.2                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 三、新增文件清单

| # | 文件路径 | 类型 | 行数估算 | 说明 |
|---|---------|------|---------|------|
| 1 | `src/ai.js` | JS 模块 | ~150 行 | 前端 AI 功能入口 |
| 2 | `cloud-functions/ai_service/index.js` | 云函数 | ~120 行 | 统一 AI 服务入口 |
| 3 | `cloud-functions/ai_service/prompts/analyze.js` | 配置 | ~60 行 | 分析 Prompt 模板 |
| 4 | `cloud-functions/ai_service/prompts/inputParse.js` | 配置 | ~50 行 | 录入解析 Prompt 模板 |
| 5 | `cloud-functions/ai_service/package.json` | 配置 | ~8 行 | 云函数依赖声明 |

**需修改的现有文件**：

| # | 文件路径 | 改动内容 |
|---|---------|---------|
| 6 | `index.html` | 在趋势图下方插入 AI 分析卡片容器；在批量填写弹窗中插入 AI 录入入口 |
| 7 | `src/styles.css` | 新增 `.ai-analysis-card`, `.ai-input-zone` 等样式 (~80行) |
| 8 | `src/app.js` | import ai.js + 初始化绑定事件 |
| 9 | `src/exam-detail.js` | 批量填写弹窗中加入「AI 快速录入」按钮 |
| 10 | `src/chart-trend.js` | 趋势图渲染后调用 AI 分析卡片 |

---

## 四、功能一：AI 学习洞察卡片

### 4.1 用户交互

**位置**：「成绩分析」tab → 分数趋势图 → 下方新增卡片

```
┌─────────────────────────────────────────────────────────────┐
│  📊 分数趋势                              [⛶ 放大]          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Canvas 折线图                     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  🤖 AI 学习洞察                                    [🔄 刷新] │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  📈 **趋势判断**                                   │   │
│  │     你最近 5 次考试总分呈【上升趋势】                │   │
│  │     498→523→510→532→540（累计进步 +42 分）         │   │
│  │                                                     │   │
│  │  💪 **优势科目**                                   │   │
│  │     数学：稳定在 110+，波动率仅 5%，发挥可靠        │   │
│  │                                                     │   │
│  │  ⚠️ **薄弱预警**                                   │   │
│  │     英语：连续 3 次下滑（98→91→88）                 │   │
│  │     建议重点复习阅读理解和语法填空                   │   │
│  │                                                     │   │
│  │  🎯 **下阶段建议**                                 │   │
│  │     当前距 550 目标差 10 分                          │   │
│  │     重点补英语到 95+，化学稳住 90+ 即可达成         │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 触发时机

- **自动触发**：用户切换到「成绩分析」tab 且考试数量 ≥ 2 时
- **手动触发**：点击卡片右上角 🔄 刷新按钮
- **防抖处理**：同一组数据 30 秒内不重复请求

### 4.3 数据流

```javascript
// src/ai.js — 前端入口

export async function renderAICard(exams) {
  // 1. 显示 loading 状态
  showAILoading();

  // 2. 收集数据（只传必要字段，不传敏感信息）
  const payload = exams.map(e => ({
    name: e.name,
    date: e.startDate || e.createdAt,
    totalScore: e.totalScore,
    subjects: e.subjects?.map(s => ({
      name: s.name, score: s.score, fullScore: s.fullScore
    })),
    rank: e.totalClassRank ? `${e.totalClassRank}/${e.classTotal}` : null
  }));

  // 3. 调用云函数
  const result = await callCloudAI('analyze', { exams: payload });

  // 4. 渲染 Markdown 格式的分析结果
  renderAIContent(result.text);
}
```

### 4.4 云函数实现

```javascript
// cloud-functions/ai_service/index.js

const cloud = require('@cloudbase/js-sdk');
const { analyzePrompt } = require('./prompts/analyze');
const { inputParsePrompt } = require('./prompts/inputParse');

exports.main = async (event, context) => {
  const { action, data } = event;

  switch (action) {
    case 'analyze': return handleAnalyze(data);
    case 'inputParse': return handleInputParse(data);
    default: return { error: '未知 action' };
  }
};

async function handleAnalyze(data) {
  const ai = cloud.extend.AI.createModel("hunyuan-exp");
  
  const result = await ai.generateText({
    data: {
      model: "deepseek-v3.2",
      messages: [
        { role: "system", content: analyzePrompt },
        { role: "user", content: formatExamsForAI(data.exams) }
      ],
      temperature: 0.7
    }
  });

  return { text: result };
}
```

### 4.5 Prompt 设计 — analyze.js

```javascript
// cloud-functions/ai_service/prompts/analyze.js

module.exports = `你是「成绩雷达」的 AI 学习分析师，一名经验丰富的中学学习顾问。

## 你的身份
- 你关心学生的成长，语气温暖但不溺爱
- 你基于数据说话，不做空洞鼓励也不制造焦虑
- 你的分析要有可操作性，学生看完知道下一步该做什么

## 输出规则
严格按以下 4 个段落输出，每段一个 emoji 开头：

📈 **趋势判断**
一句话概括总分走向 + 具体数字支撑（如"近3次平均每次进步X分"）
如果考试次数不足2次，就说"数据还不够，继续记录吧！"

💪 **优势科目**
指出 1-2 个最稳定的科目，说明为什么稳（波动小/持续上升/得分率高）

⚠️ **薄弱预警**
指出最需要关注的 1-2 个问题（可以是连续下滑的科目、或波动最大的科目）
给出可能的原因推断（不要下定论，用"可能是""建议关注"）

🎯 **下阶段建议**
根据当前水平和目标差距，给 2 条具体可行的建议
每条建议要包含：做什么 + 预期效果

## 格式约束
- 总字数控制在 200 字以内
- 不使用 markdown 标题符号（#, ## 等），直接用段落
- 不要编造数据，只用提供的信息
- 如果某项无法判断，跳过该项而不是瞎编`;
```

---

## 五、功能二：AI 辅助录入

### 5.1 用户交互

**位置**：「批量填写成绩」弹窗中，新增 AI 录入区域

```
┌──────────────────────────────────────────────────────────────┐
│  📝 批量填写成绩                                    [× 关闭]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  🤖 AI 快速录入（试试看！）                           │   │
│  │                                                       │   │
│  │  输入示例：                                            │   │
│  │  · "数学115英语98物理86化学79生物91"                  │   │
│  │  · "这次期末考了540分，数学120英语95"                 │   │
│  │  · "语文132 数学118 英语96 物理89 化学92"             │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────┐     │   │
│  │  │ 在这里输入或粘贴成绩...                       │     │   │
│  │  └─────────────────────────────────────────────┘     │   │
│  │                                           [AI识别 🚀] │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ── 或手动填写 ──                                            │
│                                                              │
│  ┌──────────┬────────┬────────┬────────┬──────┐             │
│  │   科目    │  成绩  │ 班排名 │ 年排名 │      │             │
│  ├──────────┼────────┼────────┼────────┼──────┤             │
│  │  [输入]  │        │        │        │  ✕   │             │
│  └──────────┴────────┴────────┴────────┴──────┘             │
│                                                              │
│                        [取消]  [全部保存]                     │
└──────────────────────────────────────────────────────────────┘
```

**AI 识别后的确认流程**：

```
用户输入: "数学115满分120 英语98 物理86化学79 生物91"
    ↓ 点击 [AI识别 🚀]
    
云函数返回:
  [
    { name: "数学", score: 115, fullScore: 120 },
    { name: "英语", score: 98, fullScore: 100 },
    { name: "物理", score: 86, fullScore: 100 },
    { name: "化学", score: 79, fullScore: 100 },
    { name: "生物", score: 91, fullScore: 100 }
  ]
    ↓
前端填充到批量表格中，高亮显示 AI 识别结果
用户检查无误后点「全部保存」入库
```

### 5.2 Prompt 设计 — inputParse.js

```javascript
// cloud-functions/ai_service/prompts/inputParse.js

module.exports = `你是一个成绩录入助手。用户的输入包含各科成绩信息，你需要提取并标准化。

## 提取规则
1. 只提取明确提到的科目和分数
2. 科目名保留原文，不做翻译或简化
3. 如果没提满分就默认 100
4. 忽略总分信息，只提取各科明细
5. 如果用户说"考了XX分"但没有拆分到各科，尝试合理推断（但标注不确定）

## 输出格式
严格且仅输出 JSON 数组，不加任何其他文字：
[{"name":"科目名","score":分数,"fullScore":满分}]

## 示例
输入："数学115满分120 英语98 物理86化学79"
输出：[{"name":"数学","score":115,"fullScore:120},{"name":"英语","score":98,"fullScore:100},{"name":"物理","score":86,"fullScore:100},{"name":"化学","score":79,"fullScore:100}]

## 重要
- temperature 设为 0.1 保证格式稳定
- 如果无法解析任何有效成绩，返回空数组 []
- 不要输出解释、道歉或其他多余内容`;
```

---

## 六、样式设计

### 6.1 AI 分析卡片 CSS（追加到 `src/styles.css`）

```css
/* ====== AI 分析卡片 ====== */
.ai-analysis-card {
  margin-top: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f0f7ff 0%, #faf5ff 100%);
  border: 1px solid rgba(99, 102, 241, 0.15);
  overflow: hidden;
  animation: aiCardFadeIn 0.3s ease;
}

@keyframes aiCardFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 10px;
}

.ai-card-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4338ca;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-card-refresh {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  color: #94a3b8;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.ai-card-refresh:hover {
  background: rgba(99, 102, 241, 0.08);
  color: #4338ca;
}

.ai-card-body {
  padding: 8px 18px 16px;
  font-size: 0.87rem;
  line-height: 1.7;
  color: #374151;
}

.ai-card-body p {
  margin: 8px 0;
}

.ai-card-body strong {
  color: #1f2937;
  font-weight: 600;
}

/* Loading 态 */
.ai-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 18px;
  color: #94a3b8;
  font-size: 0.87rem;
}

.ai-loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #e5e7eb;
  border-top-color: #4338ca;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 错误态 */
.ai-error {
  padding: 16px 18px;
  color: #dc2626;
  font-size: 0.85rem;
  text-align: center;
  background: #fef2f2;
  margin: 8px 0;
  border-radius: 8px;
}

/* ====== AI 辅助录入区域 ====== */
.ai-input-zone {
  background: linear-gradient(135deg, #fffbeb 0%, #f0fdf4 100%);
  border: 1px dashed #a3e635;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.ai-input-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #4d7c0f;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-input-hints {
  font-size: 0.75rem;
  color: #92400e;
  margin-bottom: 8px;
  line-height: 1.6;
}

.ai-input-hints span {
  display: block;
}

.ai-input-field {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d97706;
  border-radius: 8px;
  font-size: 0.87rem;
  resize: vertical;
  min-height: 48px;
  font-family: inherit;
  transition: border-color 0.2s;
}

.ai-input-field:focus {
  outline: none;
  border-color: #4338ca;
  box-shadow: 0 0 0 3px rgba(67, 56, 202, 0.1);
}

.ai-input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.ai-parse-btn {
  padding: 8px 18px;
  background: linear-gradient(135deg, #4338ca, #6366f1);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: transform 0.15s, box-shadow 0.15s;
}

.ai-parse-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(67, 56, 202, 0.25);
}

.ai-parse-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

---

## 七、错误处理策略

| 场景 | 处理方式 |
|------|---------|
| 云函数调用失败 | 显示错误卡片，提示「网络开小差了，稍后重试」，显示重试按钮 |
| AI 返回空结果 | 显示「暂时无法生成分析，请添加更多考试记录后重试」 |
| AI 返回格式异常 | 尝试清理后展示；若仍异常，显示原始文本 + 反馈入口 |
| Token 超限 | 截断至最近 8 次考试数据重新请求 |
| 并发重复请求 | 前端锁防抖，30秒内相同参数不重复调 |
| 用户无考试数据 | 显示引导提示「先添加 2 次以上考试记录，即可开启 AI 分析」|

---

## 八、开发步骤（Web 版 P0）

1. **创建云函数** `cloud-functions/ai_service/`
   - 写 `index.js`（主入口 + action 分发）
   - 写 `prompts/analyze.js` 和 `prompts/inputParse.js`
   - 本地测试 → 部署到 CloudBase

2. **创建前端模块** `src/ai.js`
   - 实现 `renderAICard()` — AI 分析卡片
   - 实现 `showAIInputZone()` — AI 录入区
   - 实现 `callCloudAI(action, data)` — 统一调用封装

3. **修改 index.html**
   - 趋势图 card 后插入 `<div id="aiAnalysisCard"></div>`
   - 批量弹窗中插入 AI 录入 zone

4. **修改 src/styles.css**
   - 追加 AI 卡片和录入区样式

5. **修改 src/app.js**
   - 引入 ai.js，绑定初始化事件
   - tab 切换时触发 AI 分析

6. **修改 src/chart-trend.js**
   - 图表渲染完成后调用 `renderAICard()`

7. **修改 src/exam-detail.js**
   - 批量弹窗打开时初始化 AI 录入区

8. **联调测试**
   - 用 demo 数据验证分析卡片效果
   - 用各种自然语言输入测试录入解析准确率
   - 调试 Prompt 直到输出质量满意

---

## 九、后续扩展预留（P1/P2）

本设计为后续功能预留了扩展接口：

| 功能 | 状态 | 接入方式 |
|------|------|---------|
| ~~AI 学习洞察~~ | ✅ P0 已设计 | `action: 'analyze'` |
| ~~AI 辅助录入~~ | ✅ P0 已设计 | `action: 'inputParse'` |
| AI 对话问答 | 🔲 P1 | 新增 `action: 'chat'` + prompts/chat.js |
| AI 报告评语 | 🔲 P1 | 新增 `action: 'reportComment'` + prompts/report.js |
| 流式输出 | 🔲 P2 | 将 `generateText` 替换为 `streamText` |

所有新功能只需：
1. 在 `prompts/` 下新增 Prompt 模板文件
2. 在 `index.js` 中新增 case 分支
3. 在 `src/ai.js` 中新增前端调用方法

---

*设计者：UI设计师 (AI Agent)*  
*审核状态：待用户确认*
