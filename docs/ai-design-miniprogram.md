# 🤖 成绩雷达小程序版 — AI 集成架构设计

> **模型**: DeepSeek-V3.2（通过 CloudBase 内置 AI）  
> **方案**: 云函数 + Prompt 配置文件（方案 B，与 Web 版共享同一套云函数）  
> **优先级 P0**: AI 学习洞察 + AI 辅助录入  
> **日期**: 2026-04-07

---

## 一、小程序版项目现状

| 维度 | 详情 |
|------|------|
| **路径** | `E:/成绩雷达/成绩雷达_小程序` |
| **技术栈** | 原生微信小程序（WXML + WXSS + JS） |
| **架构模式** | 单页 SPA（只有 pages/index 一个页面） |
| **模块化** | 9 个 modules/*.js + 8 个 utils/*.js |
| **云环境** | `chengjiguanjia-1g1twvrkd736c880` |
| **数据存储** | wx.Storage 本地 + 云端同步 |
| **AI 代码** | ❌ 完全空白 |

### 关键发现

1. **模块化架构清晰** — 每个 module 导出工厂函数
2. **已有云开发基础设施** — `utils/cloud.js` 封装了 `callFunction`
3. **单页面多 Tab 切换** — exam / chart / settings 三个视图
4. **与 Web 版共享同一套云函数**

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                   微信小程序端                                 │
│                                                              │
│   pages/index/index.wxml                                      │
│   ┌─────────────────────────────────────────────────────┐    │
│   │              modules/ 模块层                         │    │
│   │                                                     │    │
│   │  index.js (Page)                                     │    │
│   │  ├── dataManager.js      ← 现有                     │    │
│   │  ├── chartModule.js      ← 现有（加入 AI 卡片渲染）   │    │
│   │  ├── batchModule.js      ← 现有（加入 AI 录入入口）   │    │
│   │  ├── reportModule.js     ← 现有（加入 AI 评语）       │    │
│   │  ├── aiModule.js         ← 【新增】AI 功能模块        │    │
│   │  └── ...                                            │    │
│   │                                                     │    │
│   │              utils/ 工具层                           │    │
│   │  ├── cloud.js            ← 现有                     │    │
│   │  ├── ai.js               ← 【新增】AI 调用封装       │    │
│   │  └── ...                                            │    │
│   └────────────────────┬────────────────────────────────┘    │
│                        │ callFunction('ai_service', ...)    │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                云端 (CloudBase)                                │
│                                                                │
│   cloud-functions/ai_service/  （与 Web 版共用同一套！）        │
│   ├── index.js              主函数，分发 action              │
│   ├── prompts/                                                   │
│   │   ├── analyze.js        分析 System Prompt 模板          │
│   │   ├── inputParse.js     录入解析 System Prompt 模板       │
│   │   ├── chat.js           对话 Prompt（P1 预留）            │
│   │   └── report.js         报告评语 Prompt（P1 预留）         │
│   └── package.json                                              │
│                                                                  │
│   CloudBase 内置 AI                                               │
│   └─ hunyuan-exp / deepseek-v3.2                                 │
└────────────────────────────────────────────────────────────────┘
```

### 核心优势：**与 Web 版共用云函数**

```
Web 版 ai.js  ──→  ai_service 云函数  ←── 小程序 aiModule.js
                    ├─ prompts/analyze.js    (同一份)
                    ├─ prompts/inputParse.js  (同一份)
                    └─ deepseek-v3.2          (同一个)
```

**Prompt 调试在 Web 端完成 → 直接在小程序端生效，无需重复工作。**

---

## 三、新增文件清单

| # | 文件路径 | 类型 | 行数估算 | 说明 |
|---|---------|------|---------|------|
| 1 | `modules/aiModule.js` | 小程序模块 | ~180 行 | AI 功能模块（工厂函数） |
| 2 | `utils/ai.js` | 小程序工具 | ~60 行 | 云函数调用封装 |

**需修改的现有文件**：

| # | 文件路径 | 改动内容 |
|---|---------|---------|
| 3 | `modules/defs.js` | 新增 AI 相关 data 字段定义 |
| 4 | `pages/index/index.wxml` | 插入 AI 分析卡片容器 + AI 录入区域 |
| 5 | `pages/index/index.wxss` | 新增 AI 样式 (~100行) |
| 6 | `pages/index/index.js` | 引入 aiModule，绑定事件 |
| 7 | `modules/chartModule.js` | 图表渲染后触发 AI 分析 |
| 8 | `modules/batchModule.js` | 批量弹窗中加入 AI 录入入口 |

> **注意**：云函数 `cloud-functions/ai_service/` 不需要重新写！直接复用 Web 版部署好的那套。

---

## 四、功能一：AI 学习洞察卡片

### 4.1 WXML 结构（追加到趋势图下方）

```xml
<!-- AI 学习洞察卡片 -->
<view class="ai-card" wx:if="{{aiAnalysisVisible}}">
  <view class="ai-card-header">
    <view class="ai-card-title">
      <text class="ai-icon">🤖</text>
      <text>AI 学习洞察</text>
    </view>
    <view class="ai-card-refresh" bindtap="onAIRefresh">
      <text wx:if="{{!aiLoading}}">🔄</text>
      <text wx:else class="ai-spinning">⏳</text>
    </view>
  </view>
  
  <!-- Loading 态 -->
  <view class="ai-card-loading" wx:if="{{aiLoading}}">
    <view class="ai-loading-dot"></view>
    <text>正在分析你的成绩...</text>
  </view>
  
  <!-- 内容态 -->
  <rich-text class="ai-card-content" wx:elif="{{aiAnalysisText}}" 
             nodes="{{aiAnalysisText}}"></rich-text>
  
  <!-- 错误态 -->
  <view class="ai-card-error" wx:elif="{{aiError}}">
    <text>{{aiError}}</text>
    <view class="ai-retry-btn" bindtap="onAIRefresh">重试</view>
  </view>
</view>

<!-- 无数据引导 -->
<view class="ai-empty-hint" wx:if="{{!aiAnalysisVisible && currentTab === 'chart'}}">
  <text class="ai-empty-icon">💡</text>
  <text class="ai-empty-text">添加 2 次以上考试记录后，这里将显示 AI 学习洞察</text>
</view>
```

### 4.2 数据定义（defs.js 追加）

```javascript
// defs.js — 在合适位置追加
module.exports.ai = {
  aiAnalysisVisible: false,
  aiLoading: false,
  aiAnalysisText: '',
  aiError: '',
  aiInputText: '',
  aiInputParsing: false,
  aiParsedSubjects: null,
  showAIChatPanel: false,
  aiChatMessages: [],
  aiChatInput: '',
  aiChatSending: false
};
```

### 4.3 模块实现（aiModule.js）

```javascript
// modules/aiModule.js
const { callFunction } = require('../utils/cloud');
const { analyzePrompt, inputParsePrompt } = require('../config/aiPrompts');

function createAIModule(page) {

  // ====== AI 学习洞察 ======
  
  async function fetchAIAnalysis(forceRefresh = false) {
    const exams = getExamsForAnalysis(page);
    
    if (!exams || exams.length < 2) {
      page.setData({ aiAnalysisVisible: false });
      return;
    }

    if (!forceRefresh && page.data.aiAnalysisText) {
      page.setData({ aiAnalysisVisible: true });
      return;
    }

    page.setData({ aiLoading: true, aiError: '', aiAnalysisVisible: true });

    try {
      const res = await callFunction('ai_service', {
        action: 'analyze',
        data: { exams: sanitizeExams(exams) }
      });

      if (res.error) {
        throw new Error(res.error);
      }

      // 将纯文本转为 rich-text 可识别的节点格式
      const formatted = formatAIResponse(res.text || res.result?.text || '');
      page.setData({
        aiAnalysisText: formatted,
        aiLoading: false
      });
    } catch (err) {
      console.error('[AI] 分析失败:', err);
      page.setData({
        aiLoading: false,
        aiError: '分析暂时失败了，请稍后重试 🙏'
      });
    }
  }

  function onAIRefresh() {
    fetchAIAnalysis(true);
  }

  // ====== AI 辅助录入 ======

  async function parseAIInput() {
    const text = page.data.aiInputText?.trim();
    if (!text) {
      wx.showToast({ title: '请先输入成绩信息', icon: 'none' });
      return;
    }

    page.setData({ aiInputParsing: true });

    try {
      const res = await callFunction('ai_service', {
        action: 'inputParse',
        data: { rawText: text }
      });

      if (res.error) throw new Error(res.error);

      const subjects = res.parsed || res.result?.parsed || [];
      
      if (subjects.length === 0) {
        wx.showToast({ title: '未能识别到有效成绩，换个说法试试？', icon: 'none' });
        return;
      }

      // 将解析结果填入批量表格
      page.setData({
        aiParsedSubjects: subjects,
        aiInputParsing: false
      });

      // 触发批量模块的数据填充
      if (page._fillBatchFromAIParse) {
        page._fillBatchFromAIParse(subjects);
      }

      wx.showToast({ title: `成功识别 ${subjects.length} 科成绩`, icon: 'success' });
    } catch (err) {
      console.error('[AI] 解析失败:', err);
      page.setData({ aiInputParsing: false });
      wx.showToast({ title: '解析失败，请重试', icon: 'none' });
    }
  }

  function onAIInputChange(e) {
    page.setData({ aiInputText: e.detail.value });
  }

  // ====== 内部工具方法 ======

  function getExamsForAnalysis(page) {
    const storage = require('../utils/storage');
    const profileId = storage.getActiveProfileId();
    const allExams = storage.getExams(profileId) || [];
    
    // 取最近 8 次，按时间正序
    return allExams
      .filter(e => !e.excluded)
      .sort((a, b) => new Date(a.startDate || a.createdAt) - new Date(b.startDate || b.createdAt))
      .slice(-8);
  }

  function sanitizeExams(exams) {
    return exams.map(e => ({
      name: e.name,
      date: e.startDate || e.createdAt,
      totalScore: e.totalScore,
      subjects: (e.subjects || []).map(s => ({
        name: s.name, score: s.score, fullScore: s.fullScore
      })),
      rank: e.totalClassRank ? `${e.totalClassRank}/${e.classTotal}` : null
    }));
  }

  /**
   * 将 AI 返回的纯文本格式化为 rich-text nodes
   * 处理 emoji 开头和加粗标记
   */
  function formatAIResponse(text) {
    if (!text) return '';
    // 按段落分割，处理 **加粗**
    const paragraphs = text.split('\n').filter(p => p.trim());
    return paragraphs.map(p => {
      let formatted = p.trim()
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (formatted.startsWith('📈') || formatted.startsWith('💪') || 
          formatted.startsWith('⚠️') || formatted.startsWith('🎯')) {
        formatted = `<p style="margin:10px 0;">${formatted}</p>`;
      }
      return formatted;
    }).join('');
  }

  return {
    fetchAIAnalysis,
    onAIRefresh,
    parseAIInput,
    onAIInputChange
  };
}

module.exports = createAIModule;
```

---

## 五、功能二：AI 辅助录入（小程序版）

### 5.1 WXML（嵌入 batchModal 中）

```xml
<!-- 在批量填写弹窗的 batch-body 最前面插入 -->
<view class="ai-input-zone" wx:if="{{showBatchModal}}">
  <view class="ai-input-label">🤖 AI 快速录入</view>
  <view class="ai-input-hints">
    <text>例："数学115英语98物理85"</text>
    <text>或 "这次期末考了540分"</text>
  </view>
  <textarea 
    class="ai-textarea" 
    placeholder="在这里输入或粘贴成绩..."
    value="{{aiInputText}}"
    bindinput="onAIInputChange"
    auto-height
    maxlength="500"
  />
  <view class="ai-parse-btn-wrap">
    <button 
      class="ai-parse-btn {{aiInputParsing ? 'disabled' : ''}}"
      bindtap="parseAIInput"
      disabled="{{aiInputParsing}}"
    >
      {{aiInputParsing ? '识别中...' : 'AI 识别 🚀'}}
    </button>
  </view>
</view>
```

### 5.2 WXSS 样式

```css
/* ====== AI 分析卡片 ====== */
.ai-card {
  margin: 16px 12px 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #f0f7ff 0%, #faf5ff 100%);
  border: 1px solid rgba(99, 102, 241, 0.15);
  overflow: hidden;
}

.ai-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 8px;
}

.ai-card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #4338ca;
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.ai-icon {
  font-size: 32rpx;
}

.ai-card-refresh {
  padding: 8rpx 16rpx;
  color: #94a3b8;
  font-size: 28rpx;
}

.ai-card-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 32rpx 16rpx;
  color: #94a3b8;
  font-size: 28rpx;
  justify-content: center;
}

.ai-loading-dot {
  width: 32rpx;
  height: 32rpx;
  border: 3rpx solid #e5e7eb;
  border-top-color: #4338ca;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.ai-card-content {
  padding: 8rpx 16rpx 20rpx;
  font-size: 28rpx;
  line-height: 1.75;
  color: #374151;
}

.ai-card-error {
  padding: 24rpx 16rpx;
  text-align: center;
}

.ai-retry-btn {
  display: inline-block;
  margin-top: 12rpx;
  padding: 8rpx 28rpx;
  background: #4338ca;
  color: white;
  font-size: 26rpx;
  border-radius: 20rpx;
}

.ai-empty-hint {
  margin: 40rpx 20rpx;
  text-align: center;
  color: #94a3b8;
}

.ai-empty-icon {
  font-size: 56rpx;
  display: block;
  margin-bottom: 12rpx;
}

.ai-empty-text {
  font-size: 26rpx;
  line-height: 1.5;
}

/* ====== AI 辅助录入区域 ====== */
.ai-input-zone {
  background: linear-gradient(135deg, #fffbeb 0%, #f0fdf4 100%);
  border: 1.5rpx dashed #a3e635;
  border-radius: 16rpx;
  padding: 20rpx 18rpx;
  margin-bottom: 20rpx;
}

.ai-input-label {
  font-size: 27rpx;
  font-weight: 600;
  color: #4d7c0f;
  margin-bottom: 10rpx;
}

.ai-input-hints {
  font-size: 24rpx;
  color: #92400e;
  margin-bottom: 12rpx;
  opacity: 0.85;
}

.ai-textarea {
  width: 100%;
  min-height: 80rpx;
  padding: 14rpx;
  border: 1.5rpx solid #d97706;
  border-radius: 10rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  background: rgba(255,255,255,0.7);
}

.ai-parse-btn-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 12rpx;
}

.ai-parse-btn {
  font-size: 27rpx;
  padding: 10rpx 36rpx !important;
  background: linear-gradient(135deg, #4338ca, #6366f1) !important;
  color: white !important;
  border-radius: 16rpx !important;
  margin: 0 !important;
  line-height: 1.4;
}

.ai-parse-btn.disabled {
  opacity: 0.6;
}
```

---

## 六、index.js 集成方式

```javascript
// pages/index/index.js 顶部引入
const createAIModule = require('../../modules/aiModule');
let aiModule;

// 在 Page({ 的 onLoad 或适当初始化位置
onLoad() {
  // ... 已有的初始化代码 ...
  
  // 初始化 AI 模块
  aiModule = createAIModule(this);
  
  // 绑定事件到 page 上
  this.fetchAIAnalysis = aiModule.fetchAIAnalysis;
  this.onAIRefresh = aiModule.onAIRefresh;
  this.parseAIInput = aiModule.parseAIInput;
  this.onAIInputChange = aiModule.onAIInputChange;
},

// tab 切换时触发分析
onTabChange(e) {
  const tab = e.currentTarget.dataset.tab;
  this.setData({ currentTab: tab });
  
  if (tab === 'chart') {
    // 延迟等图表渲染完再调 AI
    setTimeout(() => {
      if (aiModule) aiModule.fetchAIAnalysis();
    }, 500);
  }
},
```

---

## 七、与 Web 版的差异对照

| 维度 | Web 版 | 小程序版 |
|------|--------|---------|
| **UI 渲染** | DOM 操作 (`innerHTML`) | `setData` + WXML 数据绑定 |
| **富文本** | HTML `<strong>` 等 | `<rich-text nodes>` |
| **样式** | CSS (`.class`) | WXSS (`.class`) + rpx 单位 |
| **调用封装** | `src/cloud-tcb.js` | `utils/cloud.js` (`callFunction`) |
| **模块模式** | ES Module import/export | CommonJS require/module.exports |
| **事件绑定** | addEventListener | bindtap/bindinput |
| **云函数** | ✅ 自己写 + 部署 | ✅ **直接复用 Web 版的！** |
| **Prompt 文件** | ✅ prompts/*.js | ✅ **同一份，不用重写** |
| **调试体验** | 浏览器 DevTools | 微信开发者工具 |

---

## 八、移植步骤（Web 版完成后）

当 Web 版 AI 功能调试完毕后，移植到小程序只需：

### Step 1：确认云函数已部署
确保 `ai_service` 云函数已在 CloudBase 控制台部署成功（Web 版部署时就完成了）

### Step 2：创建前端模块
- 写 `modules/aiModule.js`（约 180 行）
- 写 `utils/ai.js`（约 60 行，如果需要额外封装的话）

### Step 3：修改现有文件
- `defs.js` — 加 data 字段
- `index.wxml` — 加 UI 组件
- `index.wxss` — 加样式
- `index.js` — 引入并绑定

### Step 4：联调测试
- 用微信开发者工具测试
- 真机预览验证

**预估工作量**：1 天（因为云函数和 Prompt 都已经调好了）

---

*设计者：UI设计师 (AI Agent)*  
*审核状态：待用户确认*
*依赖*: 本文档基于 Web 版设计 (`ai-design-web.md`) 完成，两者共享同一套云函数和 Prompt 配置。
