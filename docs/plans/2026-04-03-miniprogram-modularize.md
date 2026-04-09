# 小程序模块拆分实现计划 (B方案)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `pages/index/index.js` 从 1679 行拆分为 10 个功能模块 + ~180 行的 index.js 薄胶水层，WXML/WXSS 零改动。

**Architecture:** 工厂函数模式 — 每个模块导出一个 `create(page)` 工厂函数，返回该模块的方法集合。在 `onLoad` 中用 `Object.assign` 将方法混入页面实例，使 WXML 的 `bindtap` 无需任何修改即可找到方法。

**Tech Stack:** 微信小程序原生框架、CommonJS 模块化、Object.assign 混入

---

## 文件结构总览

```
成绩管家_小程序/
├── pages/index/
│   ├── index.js         ← 重构为 ~180 行胶水层（修改）
│   ├── index.wxml       ← 零改动
│   └── index.wxss       ← 零改动
├── modules/             ← 新建目录
│   ├── defs.js          ← 所有 data 默认值定义 (~90行)
│   ├── examModule.js    ← 考试CRUD + 详情面板选择 (~190行)
│   ├── scoreModule.js   ← 成绩CRUD + 删除科目 (~150行)
│   ├── batchModule.js   ← 批量填写 (~120行)
│   ├── chartModule.js   ← 趋势图+雷达图+放大图 (~370行)
│   ├── profileModule.js ← 档案管理 (~115行)
│   ├── modalModule.js   ← 通用确认弹窗 (~40行)
│   ├── reportModule.js  ← 分享报告生成 (~125行)
│   └── dataManager.js   ← 示例数据+导入导出+首启检查 (~420行)
└── utils/               ← 不变（storage/format/chart/report/xlsx）
```

## data 字段归属映射

| data 字段 | 归属模块 | defs.js 中的分组 key |
|-----------|---------|-------------------|
| `profiles`, `activeProfileIndex`, `profileNames`, `currentTab`, `exams`, `currentExamId`, `currentExam`, `showDetailPanel`, `hasDemoData` | **global** (留在 index.js) | `_global` |
| `examForm`, `editExamId`, `showExamModal` | examModule | `exam` |
| `scoreForm`, `editSubjectIndex`, `showScoreModal` | scoreModule | `score` |
| `showBatchModal`, `batchList`, `newBatchSubject` | batchModule | `batch` |
| `analysisMode`, `selectedChartSubject`, `rankType`, `subjectNames`, `trendEmpty`, `compareExams`, `selectedCompareCount`, `radarEmpty`, `radarEmptyText`, `radarBest`, `radarWorst`, `showChartZoom`, `chartZoomType`, `chartZoomTitle`, `zoomSelectedSubject`, `zoomRankType` | chartModule | `chart` |
| `showAddProfile`, `newProfileName`, `renameValue`, `_renameProfileIndex` | profileModule | `profile` |
| `showConfirmModal`, `confirmIcon`, `confirmIconType`, `confirmTitle`, `confirmMessage`, `confirmOkText`, `confirmOkClass`, `confirmShowCancel`, `_confirmCallback` | modalModule | `modal` |
| `reportType`, `reportLoading`, `reportImage`, `reportCanvasHeight`, `_reportPayload` | reportModule | `report` |

---

### Task 1: 创建 modules/defs.js — Data 默认值定义

**Files:**
- Create: `成绩管家_小程序/modules/defs.js`

**目的:** 将 `Page({ data: {...} })` 中散落的 98 行 data 定义抽取为结构化的模块常量，供 `index.js` 用 spread 运算符合并。

- [ ] **Step 1: 创建 `modules/defs.js`**

```js
/**
 * 页面 data 默认值定义
 * 按 功能模块 分组，index.js 通过 Object spread 合并
 */

// 全局状态（不属于任何子模块，由 index.js 直接管理）
module.exports._global = {
  // 档案
  profiles: [],
  activeProfileIndex: 0,
  profileNames: [],

  // 标签页
  currentTab: 'exam',

  // 考试列表
  exams: [],
  currentExamId: '',
  currentExam: null,
  showDetailPanel: false,

  // 数据标记
  hasDemoData: false
};

// 考试模块 data
module.exports.exam = {
  editExamId: '',
  showExamModal: false,
  examForm: {
    name: '',
    startDate: '',
    endDate: '',
    notes: '',
    totalClassRank: '',
    totalGradeRank: '',
    classTotal: '',
    gradeTotal: ''
  }
};

// 成绩模块 data
module.exports.score = {
  editSubjectIndex: null,
  showScoreModal: false,
  scoreForm: {
    name: '',
    score: '',
    fullScore: '100',
    classRank: '',
    gradeRank: '',
    notes: ''
  }
};

// 批量填写模块 data
module.exports.batch = {
  showBatchModal: false,
  batchList: [],
  newBatchSubject: ''
};

// 图表模块 data
module.exports.chart = {
  // 分析模式
  analysisMode: 'score',
  selectedChartSubject: '',
  rankType: 'class',
  subjectNames: [],
  trendEmpty: false,

  // 雷达图
  compareExams: [],
  selectedCompareCount: 0,
  radarEmpty: false,
  radarEmptyText: '选择考试后查看各科得分率分析',

  // 图表放大
  showChartZoom: false,
  chartZoomType: '',
  chartZoomTitle: '',
  zoomSelectedSubject: '',
  zoomRankType: 'class'
};

// 档案管理模块 data
module.exports.profile = {
  showAddProfile: false,
  newProfileName: '',
  renameValue: '',
  _renameProfileIndex: null
};

// 确认弹窗 data
module.exports.modal = {
  showConfirmModal: false,
  confirmIcon: '',
  confirmIconType: '',
  confirmTitle: '',
  confirmMessage: '',
  confirmOkText: '确定',
  confirmOkClass: 'btn-primary',
  confirmShowCancel: true,
  _confirmCallback: null
};

// 分享报告 data
module.exports.report = {
  reportType: '',
  reportLoading: false,
  reportImage: '',
  reportCanvasHeight: 800
};
```

---

### Task 2: 创建 modules/examModule.js — 考试管理模块

**Files:**
- Create: `成绩管家_小程序/modules/examModule.js`
- Reference: 原 `index.js` L175-361

- [ ] **Step 1: 创建 `modules/examModule.js`**

```js
/**
 * 考试管理模块
 * 负责：考试列表选择、新建/编辑/删除考试、排除恢复考试
 * 对应原代码 L175-361 区段
 */
const storage = require('../utils/storage');

function createExamModule(page) {

  /** 选择考试 → 打开/关闭详情面板 */
  function selectExam(e) {
    const id = e.currentTarget.dataset.id;
    if (page.data.currentExamId === id) {
      page.setData({ currentExamId: '', showDetailPanel: false });
      page._refreshCurrentExam();
      return;
    }
    page.setData({ currentExamId: id, showDetailPanel: true });
    page._refreshCurrentExam();
    page._refreshAnalysis();
  }

  /** 关闭详情面板 */
  function closeDetailPanel() {
    page.setData({ showDetailPanel: false, currentExamId: '', currentExam: null });
  }

  /** 刷新当前选中考试的引用 */
  function _refreshCurrentExam() {
    const id = page.data.currentExamId;
    if (!id) { page.setData({ currentExam: null }); return; }
    const exam = page.data.exams.find(e => e.id === id) || null;
    page.setData({ currentExam: exam });
  }

  /** 打开新建/编辑考试弹窗 */
  function openExamModal(e) {
    const id = e.currentTarget ? e.currentTarget.dataset.id : '';
    if (id) {
      const exam = page.data.exams.find(ex => ex.id === id);
      if (!exam) return;
      page.setData({
        editExamId: id,
        showExamModal: true,
        examForm: {
          name: exam.name || '',
          startDate: exam.startDate || '',
          endDate: exam.endDate || '',
          notes: exam.notes || '',
          totalClassRank: exam.totalClassRank ? String(exam.totalClassRank) : '',
          totalGradeRank: exam.totalGradeRank ? String(exam.totalGradeRank) : '',
          classTotal: exam.classTotal ? String(exam.classTotal) : '',
          gradeTotal: exam.gradeTotal ? String(exam.gradeTotal) : ''
        }
      });
    } else {
      page.setData({
        editExamId: '',
        showExamModal: true,
        examForm: { name: '', startDate: '', endDate: '', notes: '', totalClassRank: '', totalGradeRank: '', classTotal: '', gradeTotal: '' }
      });
    }
  }

  function closeExamModal() {
    page.setData({ showExamModal: false });
  }

  function onExamFormInput(e) {
    const field = e.currentTarget.dataset.field;
    page.setData({ [`examForm.${field}`]: e.detail.value });
  }

  function onExamDatePick(e) {
    const field = e.currentTarget.dataset.field;
    page.setData({ [`examForm.${field}`]: e.detail.value });
  }

  /** 保存考试（新建 or 编辑） */
  function saveExam() {
    const form = page.data.examForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入考试名称', icon: 'none' });
      return;
    }

    const profileId = page._getActiveProfileId();
    if (page.data.editExamId) {
      // 编辑
      const allExams = storage.getExamsAll();
      const idx = allExams.findIndex(e => e.id === page.data.editExamId);
      if (idx !== -1) {
        allExams[idx] = {
          ...allExams[idx],
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes.trim(),
          totalClassRank: form.totalClassRank ? Number(form.totalClassRank) : undefined,
          totalGradeRank: form.totalGradeRank ? Number(form.totalGradeRank) : undefined,
          classTotal: form.classTotal ? Number(form.classTotal) : undefined,
          gradeTotal: form.gradeTotal ? Number(form.gradeTotal) : undefined
        };
        storage.saveExamsAll(allExams);
      }
    } else {
      // 新建
      const newExam = {
        id: 'exam_' + Date.now(),
        profileId,
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes.trim(),
        totalClassRank: form.totalClassRank ? Number(form.totalClassRank) : undefined,
        totalGradeRank: form.totalGradeRank ? Number(form.totalGradeRank) : undefined,
        classTotal: form.classTotal ? Number(form.classTotal) : undefined,
        gradeTotal: form.gradeTotal ? Number(form.gradeTotal) : undefined,
        subjects: [],
        createdAt: new Date().toISOString()
      };
      const allExams = storage.getExamsAll();
      allExams.push(newExam);
      storage.saveExamsAll(allExams);
      page.setData({ currentExamId: newExam.id });
    }

    page.setData({ showExamModal: false });
    page._saveAndReload();
    wx.showToast({ title: page.data.editExamId ? '已更新' : '已创建', icon: 'success' });
  }

  /** 删除考试（带确认弹窗） */
  function deleteExam(e) {
    const id = e.currentTarget.dataset.id;
    const exam = page.data.exams.find(ex => ex.id === id);
    if (!exam) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '⚠️',
      confirmIconType: 'danger',
      confirmTitle: '删除考试',
      confirmMessage: `确定要删除「${exam.name}」吗？\n此操作不可撤销。`,
      confirmOkText: '删除',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: true,
      _confirmCallback: () => {
        const allExams = storage.getExamsAll().filter(ex => ex.id !== id);
        storage.saveExamsAll(allExams);
        page.setData({ currentExamId: '', currentExam: null, showDetailPanel: false });
        page._saveAndReload();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }

  /** 切换考试排除/恢复统计 */
  function toggleExclude(e) {
    const id = e.currentTarget.dataset.id;
    const allExams = storage.getExamsAll();
    const exam = allExams.find(ex => ex.id === id);
    if (!exam) return;
    exam.excluded = !exam.excluded;
    storage.saveExamsAll(allExams);
    page._saveAndReload();
    wx.showToast({ title: exam.excluded ? '已排除' : '已恢复', icon: 'none' });
  }

  // 暴露给外部的内部方法（chartModule 等需要调用 _refreshCurrentExam）
  this._refreshCurrentExam = _refreshCurrentExam;

  return {
    selectExam,
    closeDetailPanel,
    _refreshCurrentExam,
    openExamModal,
    closeExamModal,
    onExamFormInput,
    onExamDatePick,
    saveExam,
    deleteExam,
    toggleExclude
  };
}

module.exports = createExamModule;
```

---

### Task 3: 创建 modules/scoreModule.js — 成绩管理模块

**Files:**
- Create: `成绩管家_小程序/modules/scoreModule.js`
- Reference: 原 `index.js` L363-506

- [ ] **Step 1: 创建 `modules/scoreModule.js`**

```js
/**
 * 成绩管理模块
 * 负责：单科添加/编辑/删除成绩
 * 对应原代码 L363-506 区段
 */
const storage = require('../utils/storage');

function createScoreModule(page) {

  /** 打开添加成绩弹窗 */
  function openScoreModal(e) {
    page.setData({
      editSubjectIndex: null,
      showScoreModal: true,
      scoreForm: { name: '', score: '', fullScore: '100', classRank: '', gradeRank: '', notes: '' }
    });
  }

  /** 编辑已有科目成绩 */
  function editSubject(e) {
    const index = e.currentTarget.dataset.index;
    const exam = page.data.currentExam;
    if (!exam || !exam.subjects || !exam.subjects[index]) return;
    const sub = exam.subjects[index];
    page.setData({
      editSubjectIndex: index,
      showScoreModal: true,
      scoreForm: {
        name: sub.name || '',
        score: sub.score !== undefined ? String(sub.score) : '',
        fullScore: sub.fullScore ? String(sub.fullScore) : '100',
        classRank: sub.classRank ? String(sub.classRank) : '',
        gradeRank: sub.gradeRank ? String(sub.gradeRank) : '',
        notes: sub.notes || ''
      }
    });
  }

  function closeScoreModal() {
    page.setData({ showScoreModal: false });
  }

  function onScoreFormInput(e) {
    const field = e.currentTarget.dataset.field;
    page.setData({ [`scoreForm.${field}`]: e.detail.value });
  }

  /** 保存科目成绩 */
  function saveSubject() {
    const form = page.data.scoreForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入科目名称', icon: 'none' });
      return;
    }
    if (form.score === '' || isNaN(Number(form.score))) {
      wx.showToast({ title: '请输入有效成绩', icon: 'none' });
      return;
    }

    const exam = page.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target) return;

    if (!target.subjects) target.subjects = [];

    const subjectData = {
      name: form.name.trim(),
      score: Number(form.score),
      fullScore: form.fullScore ? Number(form.fullScore) : 100,
      classRank: form.classRank ? Number(form.classRank) : undefined,
      gradeRank: form.gradeRank ? Number(form.gradeRank) : undefined,
      notes: form.notes.trim()
    };

    if (page.data.editSubjectIndex !== null && page.data.editSubjectIndex < target.subjects.length) {
      target.subjects[page.data.editSubjectIndex] = subjectData;
    } else {
      target.subjects.push(subjectData);
    }

    storage.saveExamsAll(allExams);
    page.setData({ showScoreModal: false });
    page._saveAndReload();
    wx.showToast({ title: '已保存', icon: 'success' });
  }

  /** 删除科目（先选科再确认） */
  function confirmDeleteSubject() {
    const exam = page.data.currentExam;
    if (!exam || !exam.subjects || exam.subjects.length === 0) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '🗑️',
      confirmIconType: 'danger',
      confirmTitle: '删除科目',
      confirmMessage: '选择要删除的科目：\n（此操作不可撤销）',
      confirmOkText: '',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: false,
      _confirmCallback: null
    });

    const subjectList = exam.subjects.map(s => s.name);
    wx.showActionSheet({
      itemList: subjectList,
      success: (res) => {
        const idx = res.tapIndex;
        const subName = exam.subjects[idx].name;
        page.setData({
          showConfirmModal: true,
          confirmIcon: '🗑️',
          confirmIconType: 'danger',
          confirmTitle: '删除科目',
          confirmMessage: `确定删除「${subName}」吗？`,
          confirmOkText: '删除',
          confirmOkClass: 'btn-danger',
          confirmShowCancel: true,
          _confirmCallback: () => { _doDeleteSubject(idx); }
        });
      }
    });
  }

  /** 执行删除科目 */
  function _doDeleteSubject(subjectIndex) {
    const exam = page.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target || !target.subjects) return;

    target.subjects.splice(subjectIndex, 1);
    storage.saveExamsAll(allExams);
    page._saveAndReload();
    wx.showToast({ title: '已删除', icon: 'success' });
  }

  return {
    openScoreModal,
    editSubject,
    closeScoreModal,
    onScoreFormInput,
    saveSubject,
    confirmDeleteSubject
  };
}

module.exports = createScoreModule;
```

---

### Task 4: 创建 modules/batchModule.js — 批量填写模块

**Files:**
- Create: `成绩管家_小程序/modules/batchModule.js`
- Reference: 原 `index.js` L508-630

- [ ] **Step 1: 创建 `modules/batchModule.js`**

```js
/**
 * 批量填写模块
 * 负责：批量填写/修改多科成绩
 * 对应原代码 L508-630 区段
 */
const storage = require('../utils/storage');

function createBatchModule(page) {

  function noop() {}

  function openBatchModal() {
    const exam = page.data.currentExam;
    if (!exam) return;

    const subjects = (exam.subjects || []).map(s => ({
      name: s.name,
      score: s.score !== undefined ? String(s.score) : '',
      classRank: s.classRank ? String(s.classRank) : '',
      gradeRank: s.gradeRank ? String(s.gradeRank) : '',
      fullScore: s.fullScore || 100
    }));

    if (subjects.length === 0) {
      subjects.push({ name: '', score: '', classRank: '', gradeRank: '', fullScore: 100 });
    }

    page.setData({ showBatchModal: true, batchList: subjects, newBatchSubject: '' });
  }

  function closeBatchModal() {
    page.setData({ showBatchModal: false, batchList: [], newBatchSubject: '' });
  }

  function onBatchInput(e) {
    const { index, field } = e.currentTarget.dataset;
    page.setData({ [`batchList[${index}].${field}`]: e.detail.value });
  }

  function addBatchSubject() {
    const name = page.data.newBatchSubject.trim();
    if (!name) {
      wx.showToast({ title: '请输入科目名', icon: 'none' });
      return;
    }

    // 从历史考试查找满分
    const allExams = storage.getExamsAll().filter(ex => ex.id !== page.data.currentExam.id);
    let fullScore = 100;
    for (const exam of allExams) {
      const found = (exam.subjects || []).find(s => s.name === name);
      if (found && found.fullScore) { fullScore = found.fullScore; break; }
    }

    const list = page.data.batchList.concat([{ name, score: '', classRank: '', gradeRank: '', fullScore }]);
    page.setData({ batchList: list, newBatchSubject: '' });
  }

  function onNewBatchInput(e) {
    page.setData({ newBatchSubject: e.detail.value });
  }

  function removeBatchSubject(e) {
    const index = e.currentTarget.dataset.index;
    const list = page.data.batchList.slice();
    if (list.length <= 1) {
      wx.showToast({ title: '至少保留一个科目', icon: 'none' });
      return;
    }
    list.splice(index, 1);
    page.setData({ batchList: list });
  }

  function saveBatch() {
    const list = page.data.batchList;
    const validSubjects = list.filter(s => s.name.trim());

    if (validSubjects.length === 0) {
      wx.showToast({ title: '至少填写一个科目', icon: 'none' });
      return;
    }

    for (const s of validSubjects) {
      if (s.score === '' || isNaN(Number(s.score))) {
        wx.showToast({ title: `「${s.name}」成绩无效`, icon: 'none' });
        return;
      }
    }

    const exam = page.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target) return;

    target.subjects = validSubjects.map(s => ({
      name: s.name.trim(),
      score: Number(s.score),
      fullScore: Number(s.fullScore) || 100,
      classRank: s.classRank ? Number(s.classRank) : undefined,
      gradeRank: s.gradeRank ? Number(s.gradeRank) : undefined
    }));

    storage.saveExamsAll(allExams);
    page.setData({ showBatchModal: false, batchList: [], newBatchSubject: '' });
    page._saveAndReload();
    wx.showToast({ title: '已保存', icon: 'success' });
  }

  return {
    noop,
    openBatchModal,
    closeBatchModal,
    onBatchInput,
    addBatchSubject,
    onNewBatchInput,
    removeBatchSubject,
    saveBatch
  };
}

module.exports = createBatchModule;
```

---

### Task 5: 创建 modules/chartModule.js — 图表分析模块（最大模块）

**Files:**
- Create: `成绩管家_小程序/modules/chartModule.js`
- Reference: 原 `index.js` L632-1001

- [ ] **Step 1: 创建 `modules/chartModule.js`**

```js
/**
 * 图表分析模块
 * 负责：趋势图、雷达图、图表放大、对比选择
 * 对应原代码 L632-1001 区段（最大模块，~370行）
 */
const storage = require('../utils/storage');
const fmt = require('../utils/format');
const chart = require('../utils/chart');

function createChartModule(page) {

  /** 切换分析模式（分数/排名/雷达） */
  function switchAnalysisMode(e) {
    const mode = e.currentTarget.dataset.mode;
    page.setData({ analysisMode: mode });
    setTimeout(() => _drawChart(), 100);
  }

  /** 选择图表筛选科目 */
  function selectChartSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    page.setData({ selectedChartSubject: subject });
    setTimeout(() => _drawChart(), 100);
  }

  /** 切换排名类型（班级/年级） */
  function switchRankType(e) {
    const type = e.currentTarget.dataset.type;
    page.setData({ rankType: type });
    storage.saveTrendMode({ mode: page.data.analysisMode, rankType: type });
    setTimeout(() => _drawChart(), 100);
  }

  /** 刷新分析数据（雷达图对比列表等） */
  function _refreshAnalysis() {
    const exams = storage.getExams(page._getActiveProfileId(), true)
      .sort(fmt.compareExamDateDesc);

    const currentExamId = page.data.currentExam ? page.data.currentExam.id : '';
    const compareExams = exams
      .filter(ex => ex.id !== currentExamId)
      .map(ex => ({
        ...ex,
        selected: false,
        totalScore: fmt.getTotalScore(ex.subjects)
      }));

    page.setData({ compareExams });

    const modeSettings = storage.getTrendMode();
    if (modeSettings.rankType) {
      page.setData({ rankType: modeSettings.rankType });
    }
  }

  /** 绘制图表入口（根据 mode 分发） */
  function _drawChart() {
    if (page.data.currentTab !== 'trend') return;
    if (page.data.analysisMode === 'radar') {
      _drawRadarChart();
    } else {
      _drawTrendChart();
    }
  }

  /** ====== 趋势图绘制 ====== */
  function _drawTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#trendChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('trendChart', page);

      const exams = storage.getExams(page._getActiveProfileId(), true)
        .sort(fmt.compareExamDateAsc);

      let points = [];
      let yReverse = false;
      let yTitle = '';

      if (page.data.analysisMode === 'score') {
        yTitle = '分数';
        if (page.data.selectedChartSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === page.data.selectedChartSubject);
            return { label: ex.name, value: sub ? sub.score : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: fmt.getTotalScore(ex.subjects) }));
        }
      } else {
        yReverse = true;
        yTitle = page.data.rankType === 'class' ? '班级排名' : '年级排名';
        const rankKey = page.data.rankType === 'class' ? 'totalClassRank' : 'totalGradeRank';

        if (page.data.selectedChartSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === page.data.selectedChartSubject);
            return { label: ex.name, value: sub ? (sub[page.data.rankType === 'class' ? 'classRank' : 'gradeRank']) : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: ex[rankKey] }))
            .filter(p => p.value !== null && p.value !== undefined);
        }
      }

      const isEmpty = points.length === 0;
      page.setData({ trendEmpty: isEmpty });

      chart.drawTrendChart(ctx, {
        width, height, points,
        lineColor: page.data.analysisMode === 'rank' ? '#9b8dc4' : '#e8a87c',
        fillColor: page.data.analysisMode === 'rank' ? 'rgba(155, 141, 196, 0.12)' : 'rgba(232, 168, 124, 0.12)',
        yReverse, yTitle,
        empty: isEmpty,
        emptyText: page.data.analysisMode === 'rank' ? '暂无排名数据' : '暂无成绩数据'
      });
    });
  }

  /** ====== 雷达图绘制 ====== */
  function toggleCompare(e) {
    const id = e.currentTarget.dataset.id;
    let compareExams = page.data.compareExams.map(ex => {
      if (ex.id === id) {
        if (!ex.selected && page.data.selectedCompareCount >= 2) return ex;
        return { ...ex, selected: !ex.selected };
      }
      return ex;
    });

    const selectedCount = compareExams.filter(ex => ex.selected).length;
    page.setData({ compareExams, selectedCompareCount: selectedCount });
    setTimeout(() => _drawRadarChart(), 100);
  }

  function _drawRadarChart() {
    const query = wx.createSelectorQuery();
    query.select('#radarChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('radarChart', page);

      const currentExam = page.data.currentExam;
      const selectedCompares = page.data.compareExams.filter(ex => ex.selected);
      const allCompareExams = [currentExam, ...selectedCompares].filter(ex => ex && ex.id);

      if (allCompareExams.length === 0 || !currentExam) {
        page.setData({ radarEmpty: true, radarEmptyText: '选择考试后查看各科得分率分析', radarBest: null, radarWorst: null });
        chart.drawRadarChart(ctx, { width, height, empty: true });
        return;
      }

      const labelSet = new Set();
      allCompareExams.forEach(ex => {
        (ex.subjects || []).forEach(s => { if (s.name) labelSet.add(s.name); });
      });
      const labels = Array.from(labelSet);

      if (labels.length < 3) {
        page.setData({ radarEmpty: true, radarEmptyText: '至少需要3个科目才能生成雷达图', radarBest: null, radarWorst: null });
        chart.drawRadarChart(ctx, { width, height, empty: true, emptyText: '至少需要3个科目' });
        return;
      }

      page.setData({ radarEmpty: false });

      const colorSets = [
        { borderColor: '#e8a87c', fillColor: 'rgba(232, 168, 124, 0.2)', pointStyle: 'circle', label: '当前考试' },
        { borderColor: '#7ca9c9', fillColor: 'rgba(124, 169, 201, 0.15)', pointStyle: 'rect', label: '对比1' },
        { borderColor: '#9b8dc4', fillColor: 'rgba(155, 141, 196, 0.15)', pointStyle: 'triangle', label: '对比2' }
      ];

      const datasets = allCompareExams.map((ex, i) => {
        const data = labels.map(label => {
          const sub = (ex.subjects || []).find(s => s.name === label);
          if (!sub || !sub.fullScore) return null;
          return Number(fmt.toPercent(sub.score, sub.fullScore, 1)) || 0;
        });
        return { ...colorSets[i], label: ex.name, data };
      });

      chart.drawRadarChart(ctx, { width, height, labels, datasets });

      // 计算最强/最弱科目
      const subjects = (currentExam.subjects || []).filter(s => s.fullScore > 0);
      if (subjects.length >= 3) {
        const sorted = subjects.map(s => ({
          name: s.name, score: s.score, fullScore: s.fullScore,
          rate: s.score / s.fullScore
        })).sort((a, b) => b.rate - a.rate);
        page.setData({
          radarBest: { name: sorted[0].name, score: sorted[0].score, fullScore: sorted[0].fullScore, rate: Math.round(sorted[0].rate * 100) },
          radarWorst: { name: sorted[sorted.length - 1].name, score: sorted[sorted.length - 1].score, fullScore: sorted[sorted.length - 1].fullScore, rate: Math.round(sorted[sorted.length - 1].rate * 100) }
        });
      } else {
        page.setData({ radarBest: null, radarWorst: null });
      }
    });
  }

  /** ====== 图表放大 ====== */
  function openChartZoom(e) {
    const type = e.currentTarget.dataset.type;
    const title = type === 'radar'
      ? '🎯 科目对比'
      : (page.data.analysisMode === 'rank' ? '🏅 排名趋势' : '📊 分数趋势');

    page.setData({
      showChartZoom: true,
      chartZoomType: type,
      chartZoomTitle: title,
      zoomSelectedSubject: page.data.selectedChartSubject || '',
      zoomRankType: page.data.rankType
    });

    setTimeout(() => {
      if (type === 'radar') { _drawZoomRadarChart(); }
      else { _drawZoomTrendChart(); }
    }, 400);
  }

  function closeChartZoom() {
    page.setData({ showChartZoom: false });
  }

  function zoomSelectSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    page.setData({ zoomSelectedSubject: subject });
    setTimeout(() => _drawZoomTrendChart(), 100);
  }

  function zoomSwitchRankType(e) {
    const type = e.currentTarget.dataset.type;
    page.setData({ zoomRankType: type });
    setTimeout(() => _drawZoomTrendChart(), 100);
  }

  /** 放大版趋势图 */
  function _drawZoomTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#zoomTrendChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('zoomTrendChart', page);

      const exams = storage.getExams(page._getActiveProfileId(), true)
        .sort(fmt.compareExamDateAsc);
      const selectedSubject = page.data.zoomSelectedSubject;
      const isRank = page.data.analysisMode === 'rank';
      const rankType = page.data.zoomRankType;

      let points = [];
      let yReverse = false;
      let yTitle = '';

      if (isRank) {
        yReverse = true;
        yTitle = rankType === 'class' ? '班级排名' : '年级排名';
        const rankKey = rankType === 'class' ? 'totalClassRank' : 'totalGradeRank';
        const subRankKey = rankType === 'class' ? 'classRank' : 'gradeRank';

        if (selectedSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === selectedSubject);
            return { label: ex.name, value: sub ? sub[subRankKey] : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: ex[rankKey] }))
            .filter(p => p.value !== null && p.value !== undefined);
        }
      } else {
        yTitle = '分数';
        if (selectedSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === selectedSubject);
            return { label: ex.name, value: sub ? sub.score : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: fmt.getTotalScore(ex.subjects) }));
        }
      }

      chart.drawTrendChart(ctx, {
        width, height, points,
        lineColor: isRank ? '#9b8dc4' : '#e8a87c',
        fillColor: isRank ? 'rgba(155, 141, 196, 0.12)' : 'rgba(232, 168, 124, 0.12)',
        yReverse, yTitle,
        empty: points.length === 0,
        emptyText: isRank ? '暂无排名数据' : '暂无成绩数据'
      });
    });
  }

  /** 放大版雷达图 */
  function _drawZoomRadarChart() {
    const query = wx.createSelectorQuery();
    query.select('#zoomRadarChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('zoomRadarChart', page);

      const currentExam = page.data.currentExam;
      const selectedCompares = page.data.compareExams.filter(ex => ex.selected);
      const allCompareExams = [currentExam, ...selectedCompares].filter(ex => ex && ex.id);

      if (allCompareExams.length === 0 || !currentExam) {
        chart.drawRadarChart(ctx, { width, height, empty: true });
        return;
      }

      const labelSet = new Set();
      allCompareExams.forEach(ex => {
        (ex.subjects || []).forEach(s => { if (s.name) labelSet.add(s.name); });
      });
      const labels = Array.from(labelSet);

      if (labels.length < 3) {
        chart.drawRadarChart(ctx, { width, height, empty: true, emptyText: '至少需要3个科目' });
        return;
      }

      const colorSets = [
        { borderColor: '#e8a87c', fillColor: 'rgba(232, 168, 124, 0.2)', pointStyle: 'circle', label: '当前考试' },
        { borderColor: '#7ca9c9', fillColor: 'rgba(124, 169, 201, 0.15)', pointStyle: 'rect', label: '对比1' },
        { borderColor: '#9b8dc4', fillColor: 'rgba(155, 141, 196, 0.15)', pointStyle: 'triangle', label: '对比2' }
      ];

      const datasets = allCompareExams.map((ex, i) => {
        const data = labels.map(label => {
          const sub = (ex.subjects || []).find(s => s.name === label);
          if (!sub || !sub.fullScore) return null;
          return Number(fmt.toPercent(sub.score, sub.fullScore, 1)) || 0;
        });
        return { ...colorSets[i], label: ex.name, data };
      });

      chart.drawRadarChart(ctx, { width, height, labels, datasets });
    });
  }

  // 暴露给外部的内部方法
  this._refreshAnalysis = _refreshAnalysis;
  this._drawChart = _drawChart;

  return {
    switchAnalysisMode,
    selectChartSubject,
    switchRankType,
    _refreshAnalysis,
    _drawChart,
    toggleCompare,
    openChartZoom,
    closeChartZoom,
    zoomSelectSubject,
    zoomSwitchRankType
  };
}

module.exports = createChartModule;
```

---

### Task 6: 创建 modules/profileModule.js — 档案管理模块

**Files:**
- Create: `成绩管家_小程序/modules/profileModule.js`
- Reference: 原 `index.js` L1003-1117

- [ ] **Step 1: 创建 `modules/profileModule.js`**

```js
/**
 * 档案管理模块
 * 负责：切换档案、新建/重命名/删除档案
 * 对应原代码 L1003-1117 区段
 */
const storage = require('../utils/storage');

function createProfileModule(page) {

  function onProfileSwitch(e) {
    const index = e.detail.value;
    const profile = page.data.profiles[index];
    if (!profile) return;
    storage.setActiveProfileId(profile.id);
    page.setData({ activeProfileIndex: index, currentExamId: '', currentExam: null, showDetailPanel: false });
    page._saveAndReload();
  }

  function switchToProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;
    storage.setActiveProfileId(profile.id);
    page.setData({ activeProfileIndex: index, currentExamId: '', currentExam: null, showDetailPanel: false });
    page._saveAndReload();
    wx.showToast({ title: `已切换到「${profile.name}」`, icon: 'none' });
  }

  function showAddProfileInput() {
    page.setData({ showAddProfile: true, newProfileName: '' });
  }

  function cancelAddProfile() {
    page.setData({ showAddProfile: false, newProfileName: '' });
  }

  function onNewProfileInput(e) {
    page.setData({ newProfileName: e.detail.value });
  }

  function confirmAddProfile() {
    const name = page.data.newProfileName.trim();
    if (!name) { wx.showToast({ title: '请输入档案名称', icon: 'none' }); return; }
    storage.createProfile(name);
    page.setData({ showAddProfile: false, newProfileName: '' });
    page._saveAndReload();
    wx.showToast({ title: '已创建', icon: 'success' });
  }

  function renameProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;
    page.setData({ showRenameModal: true, renameValue: profile.name, _renameProfileIndex: index });
  }

  function closeRenameModal() {
    page.setData({ showRenameModal: false });
  }

  function onRenameInput(e) {
    page.setData({ renameValue: e.detail.value });
  }

  function confirmRename() {
    const name = page.data.renameValue.trim();
    if (!name) { wx.showToast({ title: '请输入档案名称', icon: 'none' }); return; }
    const profile = page.data.profiles[page.data._renameProfileIndex];
    if (!profile) return;
    storage.updateProfile(profile.id, name);
    page.setData({ showRenameModal: false });
    page._saveAndReload();
    wx.showToast({ title: '已重命名', icon: 'success' });
  }

  function confirmDeleteProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '⚠️',
      confirmIconType: 'danger',
      confirmTitle: '删除档案',
      confirmMessage: `确定要删除档案「${profile.name}」吗？\n该档案下的所有考试数据将一并删除。\n此操作不可撤销。`,
      confirmOkText: '删除',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: true,
      _confirmCallback: () => {
        storage.deleteProfile(profile.id);
        page.setData({ activeProfileIndex: 0, currentExamId: '', currentExam: null, showDetailPanel: false });
        page._saveAndReload();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }

  return {
    onProfileSwitch,
    switchToProfile,
    showAddProfileInput,
    cancelAddProfile,
    onNewProfileInput,
    confirmAddProfile,
    renameProfile,
    closeRenameModal,
    onRenameInput,
    confirmRename,
    confirmDeleteProfile
  };
}

module.exports = createProfileModule;
```

---

### Task 7: 创建 modules/modalModule.js — 通用确认弹窗模块

**Files:**
- Create: `成绩管家_小程序/modules/modalModule.js`
- Reference: 原 `index.js` L1119-1131

- [ ] **Step 1: 创建 `modules/modalModule.js`**

```js
/**
 * 通用确认弹窗模块
 * 提供 open/ok/close 三个方法
 * 各模块通过设置 confirm* 系列 data + _confirmCallback 来使用
 * 对应原代码 L1119-1131 区段
 */
function createModalModule(page) {

  function closeConfirmModal() {
    page.setData({ showConfirmModal: false, _confirmCallback: null });
  }

  function onConfirmOk() {
    const cb = page.data._confirmCallback;
    page.setData({ showConfirmModal: false, _confirmCallback: null });
    if (cb && typeof cb === 'function') { cb(); }
  }

  return {
    closeConfirmModal,
    onConfirmOk
  };
}

module.exports = createModalModule;
```

---

### Task 8: 创建 modules/reportModule.js — 分享报告模块

**Files:**
- Create: `成绩管家_小程序/modules/reportModule.js`
- Reference: 原 `index.js` L1133-1256

- [ ] **Step 1: 创建 `modules/reportModule.js`**

```js
/**
 * 分享报告模块
 * 负责：考试报告/档案报告生成、保存、分享
 * 对应原代码 L1133-1256 区段
 */
const report = require('../utils/report');

function createReportModule(page) {

  function openShareExamReport() {
    const exam = page.data.currentExam;
    if (!exam) return;
    const profile = page.data.profiles[page.data.activeProfileIndex];
    page.setData({
      reportType: 'exam',
      showReportModal: true,
      reportLoading: true,
      reportImage: '',
      _reportPayload: { exam, profileName: profile ? profile.name : '' }
    });
    setTimeout(() => _generateReport(), 300);
  }

  function openShareProfileReport(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;
    const exams = require('../utils/storage').getExams(profile.id, true);
    page.setData({
      reportType: 'profile',
      showReportModal: true,
      reportLoading: true,
      reportImage: '',
      _reportPayload: { profile, exams }
    });
    setTimeout(() => _generateReport(), 300);
  }

  function _generateReport() {
    const payload = page.data._reportPayload;
    const width = 375;

    let drawHeight;
    if (page.data.reportType === 'exam') {
      drawHeight = report.drawExamReport(null, { ...payload, width });
    } else {
      drawHeight = report.drawProfileReport(null, { ...payload, width });
    }

    page.setData({ reportCanvasHeight: drawHeight }, () => {
      setTimeout(() => {
        const ctx = wx.createCanvasContext('reportCanvas', page);

        if (page.data.reportType === 'exam') {
          report.drawExamReport(ctx, { ...payload, width });
        } else {
          report.drawProfileReport(ctx, { ...payload, width });
        }

        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'reportCanvas', x: 0, y: 0, width, height: drawHeight,
              destWidth: width * 2, destHeight: drawHeight * 2, fileType: 'png',
              success: (res) => { page.setData({ reportLoading: false, reportImage: res.tempFilePath }); },
              fail: (err) => { console.error('报告生成失败', err); page.setData({ reportLoading: false }); wx.showToast({ title: '报告生成失败', icon: 'none' }); }
            }, page);
          }, 500);
        });
      }, 300);
    });
  }

  function closeReportModal() {
    page.setData({ showReportModal: false, reportImage: '' });
  }

  function saveReport() {
    if (!page.data.reportImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: page.data.reportImage,
      success: () => { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({ title: '需要相册权限', content: '请前往设置页开启「保存到相册」权限', confirmText: '去设置', success: (res) => { if (res.confirm) { wx.openSetting(); } } });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  }

  function shareReport() {
    if (!page.data.reportImage) return;
    wx.previewImage({ current: page.data.reportImage, urls: [page.data.reportImage] });
  }

  return {
    openShareExamReport,
    openShareProfileReport,
    closeReportModal,
    saveReport,
    shareReport
  };
}

module.exports = createReportModule;
```

---

### Task 9: 创建 modules/dataManager.js — 数据管理模块（示例/导入/导出/首启）

**Files:**
- Create: `成绩管家_小程序/modules/dataManager.js`
- Reference: 原 `index.js` L1258-1679

- [ ] **Step 1: 创建 `modules/dataManager.js`**

```js
/**
 * 数据管理模块
 * 负责：首次启动检测、示例数据注入/清除、Excel导入导出
 * 对应原代码 L1258-1679 区段（最长纯数据模块，~420行）
 */
const storage = require('../utils/storage');
const XLSX = require('../utils/xlsx');

function createDataManager(page) {

  /** 首次启动检测 & 注入示例数据 */
  function _checkFirstLaunch() {
    if (wx.getStorageSync('hasLaunched')) return;
    const profileId = page._getActiveProfileId();
    if (!profileId) return;
    _injectDemoData(profileId);
    wx.setStorageSync('hasLaunched', true);
  }

  /** 注入示例数据 */
  function _injectDemoData(profileId) {
    const allExams = storage.getExamsAll();

    const demoExams = [
      {
        id: 'demo_20250315', profileId, name: '2025年3月月考', startDate: '2025-03-15', endDate: '2025-03-16',
        subjects: [
          { name: '语文', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
          { name: '数学', score: 50, fullScore: 100, classRank: 28, gradeRank: 200 },
          { name: '英语', score: 40, fullScore: 100, classRank: 36, gradeRank: 270 },
          { name: '物理', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
          { name: '化学', score: 48, fullScore: 100, classRank: 30, gradeRank: 225 },
          { name: '生物', score: 44, fullScore: 100, classRank: 32, gradeRank: 245 }
        ],
        totalClassRank: 28, totalGradeRank: 168, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-03-16').toISOString()
      },
      {
        id: 'demo_20250510', profileId, name: '2025年5月月考', startDate: '2025-05-10', endDate: '2025-05-11',
        subjects: [
          { name: '语文', score: 52, fullScore: 100, classRank: 26, gradeRank: 210 },
          { name: '数学', score: 58, fullScore: 100, classRank: 22, gradeRank: 178 },
          { name: '英语', score: 48, fullScore: 100, classRank: 30, gradeRank: 240 },
          { name: '物理', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
          { name: '化学', score: 55, fullScore: 100, classRank: 24, gradeRank: 185 },
          { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
        ],
        totalClassRank: 24, totalGradeRank: 148, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-05-11').toISOString()
      },
      {
        id: 'demo_20250620', profileId, name: '2025年6月期末考', startDate: '2025-06-20', endDate: '2025-06-22',
        subjects: [
          { name: '语文', score: 60, fullScore: 100, classRank: 20, gradeRank: 165 },
          { name: '数学', score: 65, fullScore: 100, classRank: 16, gradeRank: 140 },
          { name: '英语', score: 52, fullScore: 100, classRank: 27, gradeRank: 230 },
          { name: '物理', score: 50, fullScore: 100, classRank: 28, gradeRank: 210 },
          { name: '化学', score: 62, fullScore: 100, classRank: 18, gradeRank: 145 },
          { name: '生物', score: 55, fullScore: 100, classRank: 24, gradeRank: 178 }
        ],
        totalClassRank: 18, totalGradeRank: 125, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-06-22').toISOString()
      },
      {
        id: 'demo_20250715', profileId, name: '2025年7月月考', startDate: '2025-07-15', endDate: '2025-07-16',
        subjects: [
          { name: '语文', score: 55, fullScore: 100, classRank: 24, gradeRank: 195 },
          { name: '数学', score: 60, fullScore: 100, classRank: 20, gradeRank: 168 },
          { name: '英语', score: 45, fullScore: 100, classRank: 33, gradeRank: 255 },
          { name: '物理', score: 48, fullScore: 100, classRank: 30, gradeRank: 230 },
          { name: '化学', score: 58, fullScore: 100, classRank: 22, gradeRank: 190 },
          { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
        ],
        totalClassRank: 22, totalGradeRank: 142, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-07-16').toISOString()
      },
      {
        id: 'demo_20250915', profileId, name: '2025年9月月考', startDate: '2025-09-15', endDate: '2025-09-16', excluded: true,
        subjects: [
          { name: '语文', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
          { name: '数学', score: 45, fullScore: 100, classRank: 32, gradeRank: 235 },
          { name: '英语', score: 38, fullScore: 100, classRank: 38, gradeRank: 265 },
          { name: '物理', score: 35, fullScore: 100, classRank: 40, gradeRank: 280 },
          { name: '化学', score: 44, fullScore: 100, classRank: 33, gradeRank: 240 },
          { name: '生物', score: 40, fullScore: 100, classRank: 36, gradeRank: 258 }
        ],
        totalClassRank: 30, totalGradeRank: 180, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-09-16').toISOString()
      },
      {
        id: 'demo_20251110', profileId, name: '2025年11月期中考', startDate: '2025-11-10', endDate: '2025-11-11',
        subjects: [
          { name: '语文', score: 95, fullScore: 100, classRank: 2, gradeRank: 15 },
          { name: '数学', score: 50, fullScore: 100, classRank: 25, gradeRank: 145 },
          { name: '英语', score: 55, fullScore: 100, classRank: 28, gradeRank: 175 },
          { name: '物理', score: 48, fullScore: 100, classRank: 32, gradeRank: 200 },
          { name: '化学', score: 50, fullScore: 100, classRank: 28, gradeRank: 170 },
          { name: '生物', score: 60, fullScore: 100, classRank: 20, gradeRank: 130 }
        ],
        totalClassRank: 14, totalGradeRank: 85, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-11-11').toISOString()
      },
      {
        id: 'demo_20260320', profileId, name: '2026年3月模拟考', startDate: '2026-03-20', endDate: '2026-03-21',
        subjects: [
          { name: '语文', score: 70, fullScore: 100, classRank: 15, gradeRank: 105 },
          { name: '数学', score: 95, fullScore: 100, classRank: 1, gradeRank: 8 },
          { name: '英语', score: 80, fullScore: 100, classRank: 8, gradeRank: 68 },
          { name: '物理', score: 95, fullScore: 100, classRank: 2, gradeRank: 10 },
          { name: '化学', score: 78, fullScore: 100, classRank: 10, gradeRank: 75 },
          { name: '生物', score: 88, fullScore: 100, classRank: 4, gradeRank: 30 }
        ],
        totalClassRank: 5, totalGradeRank: 42, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2026-03-21').toISOString()
      }
    ];

    const demoIds = new Set(demoExams.map(e => e.id));
    const filtered = allExams.filter(e => !demoIds.has(e.id));
    storage.saveExamsAll(filtered.concat(demoExams));
    page._saveAndReload();
  }

  /** 手动添加示例数据 */
  function addDemoData() {
    const profileId = page._getActiveProfileId();
    if (!profileId) return;

    if (page.data.exams.length > 0) {
      page.setData({
        showConfirmModal: true, confirmIcon: '📋', confirmIconType: 'info',
        confirmTitle: '添加示例数据？', confirmMessage: '已有数据，添加示例将追加到现有记录中。',
        confirmOkText: '添加', confirmOkClass: 'btn-primary', confirmShowCancel: true,
        _confirmCallback: () => { _injectDemoData(profileId); wx.showToast({ title: '示例数据已添加', icon: 'success' }); }
      });
    } else {
      _injectDemoData(profileId);
      wx.showToast({ title: '示例数据已添加', icon: 'success' });
    }
  }

  /** 清除示例数据 */
  function clearDemoData() {
    const profileId = page._getActiveProfileId();
    if (!profileId) return;
    const allExams = storage.getExamsAll();
    const filtered = allExams.filter(e => !e.id.startsWith('demo_'));
    if (filtered.length === allExams.length) {
      wx.showToast({ title: '没有示例数据可清除', icon: 'none' }); return;
    }
    page.setData({
      showConfirmModal: true, confirmIcon: '🗑️', confirmIconType: 'warn',
      confirmTitle: '清除示例数据',
      confirmMessage: '将删除所有以"2025年"/"2026年"开头的示例考试。\n您的真实数据不受影响。',
      confirmOkText: '清除', confirmOkClass: 'btn-danger', confirmShowCancel: true,
      _confirmCallback: () => { storage.saveExamsAll(filtered); page._saveAndReload(); wx.showToast({ title: '示例数据已清除', icon: 'success' }); }
    });
  }

  /** 导出 Excel */
  function exportData() {
    const profileId = page._getActiveProfileId();
    const profile = page.data.profiles[page.data.activeProfileIndex];
    const exams = storage.getExams(profileId);
    if (exams.length === 0) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }

    const rows = [];
    rows.push(['考试名称', '开始日期', '结束日期', '备注', '班级排名', '年级排名', '班级人数', '年级人数', '科目', '成绩', '满分', '班级排名', '年级排名', '排除']);

    exams.forEach(exam => {
      const subjects = exam.subjects || [];
      if (subjects.length === 0) {
        rows.push([exam.name, exam.startDate || '', exam.endDate || '', exam.notes || '', exam.totalClassRank || '', exam.totalGradeRank || '', exam.classTotal || '', exam.gradeTotal || '', '', '', '', '', '', exam.excluded ? '是' : '否']);
      } else {
        subjects.forEach((sub, i) => {
          rows.push([i === 0 ? exam.name : '', i === 0 ? (exam.startDate || '') : '', i === 0 ? (exam.endDate || '') : '', i === 0 ? (exam.notes || '') : '', i === 0 ? (exam.totalClassRank || '') : '', i === 0 ? (exam.totalGradeRank || '') : '', i === 0 ? (exam.classTotal || '') : '', i === 0 ? (exam.gradeTotal || '') : '', sub.name || '', sub.score, sub.fullScore || 100, sub.classRank || '', sub.gradeRank || '', i === 0 ? (exam.excluded ? '是' : '否') : '']);
        });
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 6 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '成绩数据');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const fileName = `${profile ? profile.name : '成绩'}_成绩数据.xlsx`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

    wx.getFileSystemManager().writeFile({
      filePath, data: wbout, encoding: 'binary',
      success: () => {
        wx.shareFileMessage({ filePath, fileName,
          success: () => { wx.showToast({ title: '导出成功', icon: 'success' }); },
          fail: () => {
            wx.showModal({ title: '导出成功', content: '文件已保存，是否打开文件管理器查看？', confirmText: '打开', success: (res) => { if (res.confirm) { wx.openDocument({ filePath, showMenu: true, success: () => {}, fail: () => { wx.showToast({ title: '无法打开文件', icon: 'none' }); } }); } } });
          }
        });
      },
      fail: () => { wx.showToast({ title: '导出失败', icon: 'none' }); }
    });
  }

  /** 导入 Excel */
  function importData() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['xlsx', 'xls'],
      success: (res) => { _parseExcel(res.tempFiles[0].path); },
      fail: () => {}
    });
  }

  /** 解析 Excel 内容 */
  function _parseExcel(filePath) {
    try {
      const fileData = wx.getFileSystemManager().readFileSync(filePath, 'binary');
      const workbook = XLSX.read(fileData, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) { wx.showToast({ title: '文件中没有数据', icon: 'none' }); return; }

      const profileId = page._getActiveProfileId();
      const allExams = storage.getExamsAll();
      let importCount = 0;
      let lastExam = null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]; if (!row || !row[0]) continue;
        const examName = String(row[0]).trim();
        const startDate = row[1] ? String(row[1]).trim() : '';
        const endDate = row[2] ? String(row[2]).trim() : '';
        const notes = row[3] ? String(row[3]).trim() : '';
        const totalClassRank = row[4] ? Number(row[4]) : undefined;
        const totalGradeRank = row[5] ? Number(row[5]) : undefined;
        const classTotal = row[6] ? Number(row[6]) : undefined;
        const gradeTotal = row[7] ? Number(row[7]) : undefined;
        const excluded = row[13] === '是';
        const subjectName = row[8] ? String(row[8]).trim() : '';
        const score = row[9] !== undefined ? Number(row[9]) : undefined;
        const fullScore = row[10] ? Number(row[10]) : 100;
        const subClassRank = row[11] ? Number(row[11]) : undefined;
        const subGradeRank = row[12] ? Number(row[12]) : undefined;

        if (examName && (!lastExam || lastExam.name !== examName)) {
          const newExam = {
            id: 'exam_' + Date.now() + '_' + importCount, profileId, name: examName,
            startDate: startDate || undefined, endDate: endDate || undefined, notes: notes || undefined,
            totalClassRank, totalGradeRank, classTotal, gradeTotal, subjects: [], excluded,
            createdAt: new Date().toISOString()
          };
          allExams.push(newExam); lastExam = newExam; importCount++;
        }

        if (subjectName && score !== undefined && lastExam) {
          lastExam.subjects.push({ name: subjectName, score, fullScore, classRank: subClassRank || undefined, gradeRank: subGradeRank || undefined });
        }
      }

      if (importCount > 0) {
        storage.saveExamsAll(allExams); page._saveAndReload();
        wx.showToast({ title: `成功导入 ${importCount} 场考试`, icon: 'success' });
      } else {
        wx.showToast({ title: '未识别到有效数据', icon: 'none' });
      }
    } catch (err) {
      console.error('导入失败', err); wx.showToast({ title: '导入失败，请检查文件格式', icon: 'none' });
    }
  }

  return {
    _checkFirstLaunch,
    addDemoData,
    clearDemoData,
    exportData,
    importData
  };
}

module.exports = createDataManager;
```

---

### Task 10: 重构 index.js 为薄胶水层

**Files:**
- Modify: `成绩管家_小程序/pages/index/index.js`

**目的:** 将原来的 1679 行替换为 ~180 行的模块装配层。

- [ ] **Step 1: 替换 `index.js` 全部内容**

新的 `index.js` 内容：

```js
const storage = require('../../utils/storage');
const fmt = require('../../utils/format');

// 导入 data 定义
const defs = require('../../modules/defs');

// 导入模块工厂
const createExamModule = require('../../modules/examModule');
const createScoreModule = require('../../modules/scoreModule');
const createBatchModule = require('../../modules/batchModule');
const createChartModule = require('../../modules/chartModule');
const createProfileModule = require('../../modules/profileModule');
const createModalModule = require('../../modules/modalModule');
const createReportModule = require('../../modules/reportModule');
const createDataManager = require('../../modules/dataManager');

Page({
  /**
   * Data: 从 defs 模块 spread 合并所有分组的 data
   * - _global: 全局状态（profiles, exams, tabs 等）
   * - exam/score/batch/chart/profile/modal/report: 各子模块 data
   */
  data: {
    ...defs._global,
    ...defs.exam,
    ...defs.score,
    ...defs.batch,
    ...defs.chart,
    ...defs.profile,
    ...defs.modal,
    ...defs.report
  },

  // ==================== 生命周期 ====================

  onLoad() {
    // 初始化所有模块（传入 page 实例 this）
    const m = {};
    m.exam = createExamModule(this);
    m.score = createScoreModule(this);
    m.batch = createBatchModule(this);
    m.chart = createChartModule(this);
    m.profile = createProfileModule(this);
    m.modal = createModalModule(this);
    m.report = createReportModule(this);
    m.dataMgr = createDataManager(this);
    this._m = m;

    // 将所有模块方法混入页面实例（使 WXML bindtap 可直接找到）
    Object.assign(
      this,
      m.exam, m.score, m.batch, m.chart,
      m.profile, m.modal, m.report, m.dataMgr
    );

    this._loadData();
    this._m.dataMgr._checkFirstLaunch();
  },

  onShow() {
    this._loadData();
  },

  onShareAppMessage() {
    const profile = this.data.profiles[this.data.activeProfileIndex];
    return { title: `成绩管家 - ${profile ? profile.name : '我的成绩'}`, path: '/pages/index/index' };
  },

  // ==================== 核心数据方法（保留在胶水层）====================

  _loadData() {
    const profiles = storage.getProfiles();
    const activeId = storage.getActiveProfileId();
    let activeIndex = profiles.findIndex(p => p.id === activeId);
    if (activeIndex === -1) activeIndex = 0;

    const profilesWithCount = profiles.map(p => {
      const exams = storage.getExams(p.id);
      return { ...p, examCount: exams.length };
    });

    const profileNames = profilesWithCount.map(p => p.name);
    const currentProfileId = profilesWithCount[activeIndex] ? profilesWithCount[activeIndex].id : '';
    const exams = storage.getExams(currentProfileId).sort(fmt.compareExamDateDesc);

    exams.forEach(e => { e.totalScore = fmt.getTotalScore(e.subjects); });
    const subjectNames = fmt.uniqueSubjectNames(exams);
    const hasDemoData = exams.some(e => e.id.startsWith('demo_')) && exams.some(e => !e.id.startsWith('demo_'));

    this.setData({ profiles: profilesWithCount, activeProfileIndex, profileNames, exams, subjectNames, hasDemoData });

    if (!this.data.currentExamId && exams.length > 0) {
      this.setData({ currentExamId: exams[0].id });
    }

    this._refreshCurrentExam();
    this._refreshAnalysis();
  },

  _saveAndReload() {
    this._loadData();
  },

  _getActiveProfileId() {
    return this.data.profiles[this.data.activeProfileIndex]
      ? this.data.profiles[this.data.activeProfileIndex].id
      : '';
  },

  // ==================== 标签页切换（保留在胶水层，因为它触发图表重绘）====================

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab, showDetailPanel: false });
    if (tab === 'trend') {
      this.$nextTick && this.$nextTick(() => this._drawChart());
      setTimeout(() => this._drawChart(), 300);
    }
  }
});
```

---

### Task 11: 验证测试

**Files:**
- Verify: `成绩管家_小程序/pages/index/index.js`
- Verify: `成绩管家_小程序/modules/*.js` (共 9 个文件)

- [ ] **Step 1: 文件完整性检查**

运行以下命令确认所有模块文件都已创建：

```
modules/ 目录下应有以下 9 个文件:
✓ defs.js
✓ examModule.js
✓ scoreModule.js
✓ batchModule.js
✓ chartModule.js
✓ profileModule.js
✓ modalModule.js
✓ reportModule.js
✓ dataManager.js
```

- [ ] **Step 2: 代码交叉验证**

逐项检查：

1. **WXML 中所有 `bindtap=` 引用的方法名** 都能在某个模块中找到对应函数：
   - `selectExam` → examModule ✅
   - `closeDetailPanel` → examModule ✅
   - `openExamModal` → examModule ✅
   - `closeExamModal` → examModule ✅
   - `onExamFormInput` → examModule ✅
   - `onExamDatePick` → examModule ✅
   - `saveExam` → examModule ✅
   - `deleteExam` → examModule ✅
   - `toggleExclude` → examModule ✅
   - `openScoreModal` → scoreModule ✅
   - `editSubject` → scoreModule ✅
   - `closeScoreModal` → scoreModule ✅
   - `onScoreFormInput` → scoreModule ✅
   - `saveSubject` → scoreModule ✅
   - `confirmDeleteSubject` → scoreModule ✅
   - `openBatchModal` → batchModule ✅
   - `closeBatchModal` → batchModule ✅
   - `onBatchInput` → batchModule ✅
   - `addBatchSubject` → batchModule ✅
   - `onNewBatchInput` → batchModule ✅
   - `removeBatchSubject` → batchModule ✅
   - `saveBatch` → batchModule ✅
   - `noop` → batchModule ✅
   - `switchTab` → index.js (胶水层) ✅
   - `switchAnalysisMode` → chartModule ✅
   - `selectChartSubject` → chartModule ✅
   - `switchRankType` → chartModule ✅
   - `toggleCompare` → chartModule ✅
   - `openChartZoom` → chartModule ✅
   - `closeChartZoom` → chartModule ✅
   - `zoomSelectSubject` → chartModule ✅
   - `zoomSwitchRankType` → chartModule ✅
   - `onProfileSwitch` → profileModule ✅
   - `switchToProfile` → profileModule ✅
   - `showAddProfileInput` → profileModule ✅
   - `cancelAddProfile` → profileModule ✅
   - `onNewProfileInput` → profileModule ✅
   - `confirmAddProfile` → profileModule ✅
   - `renameProfile` → profileModule ✅
   - `closeRenameModal` → profileModule ✅
   - `onRenameInput` → profileModule ✅
   - `confirmRename` → profileModule ✅
   - `confirmDeleteProfile` → profileModule ✅
   - `closeConfirmModal` → modalModule ✅
   - `onConfirmOk` → modalModule ✅
   - `openShareExamReport` → reportModule ✅
   - `openShareProfileReport` → reportModule ✅
   - `closeReportModal` → reportModule ✅
   - `saveReport` → reportModule ✅
   - `shareReport` → reportModule ✅
   - `addDemoData` → dataManager ✅
   - `clearDemoData` → dataManager ✅
   - `exportData` → dataManager ✅
   - `importData` → dataManager ✅

2. **data 字段完整性**：defs.js 中定义的每个字段都能在原 index.js L8-98 中找到

3. **跨模块调用链**：
   - `deleteExam` → 设置 `confirm*` data + `_confirmCallback` → 用户点 ok → `onConfirmOk` → 执行 callback ✅
   - `confirmDeleteSubject` → 同上模式 ✅
   - `confirmDeleteProfile` → 同上模式 ✅
   - `addDemoData` / `clearDemoData` → 同上模式 ✅
   - `selectExam` → 调用 `_refreshCurrentExam()` + `_refreshAnalysis()` ✅
   - `switchTab(trend)` → 调用 `_drawChart()` ✅
   - 各模块中 `page._saveAndReload()` / `page._getActiveProfileId()` / `page._refreshCurrentExam()` / `page._refreshAnalysis()` / `page._drawChart()` ✅

- [ ] **Step 3: 微信开发者工具编译验证**

在微信开发者工具中：
1. 打开项目，确认编译无报错
2. 切换三个标签页（考试详情 / 成绩分析 / 设置）
3. 新建一场考试 → 填写 → 保存 → 验证列表刷新
4. 点击考试 → 详情面板弹出 → 编辑 → 保存 → 验证更新
5. 添加单科成绩 → 验证卡片显示
6. 批量填写 → 添加/删除科目 → 保存 → 验证
7. 删除科目 → ActionSheet 选择 → 确认删除 → 验证
8. 切到成绩分析 → 趋势图显示 → 切换科目 → 切换分数/排名模式
9. 雷达图模式 → 选择对比考试 → 验证雷达图绘制
10. 放大图表 → 验证放大版趋势图/雷达图
11. 切换档案 → 验证数据隔离
12. 新建/重命名/删除档案 → 验证
13. 清除示例数据 / 添加示例数据 → 验证
14. 导出 Excel / 导入 Excel → 验证
15. 生成报告 → 预览 → 保存图片 → 验证

---

## 自检清单

**1. Spec 覆盖率:**
- [x] data 定义完整抽取到 defs.js
- [x] 考试 CRUD (L217-361) → examModule.js
- [x] 成绩 CRUD (L363-506) → scoreModule.js
- [x] 批量填写 (L508-630) → batchModule.js
- [x] 趋势图+雷达图+放大 (L632-1001) → chartModule.js
- [x] 档案管理 (L1003-1117) → profileModule.js
- [x] 确认弹窗 (L1119-1131) → modalModule.js
- [x] 分享报告 (L1133-1256) → reportModule.js
- [x] 示例数据+导入导出 (L1258-1679) → dataManager.js
- [x] 生命周期+数据加载 (L7-173) → index.js 胶水层

**2. 占位符扫描:**
- [x] 无 TBD/TODO/占位符
- [x] 每个步骤都有完整可执行的代码
- [x] 函数签名跨文件一致（如 `_drawChart`, `_refreshCurrentExam`, `_refreshAnalysis`, `_saveAndReload`, `_getActiveProfileId`）

**3. 类型一致性:**
- [x] data 字段名与原 index.js 完全一致（WXML 依赖这些名字）
- [x] 方法名与原 index.js 完全一致（WXML bindtap 依赖这些名字）
- [x] `require` 路径正确（`../utils/*` 和 `../../modules/*` 相对路径）
