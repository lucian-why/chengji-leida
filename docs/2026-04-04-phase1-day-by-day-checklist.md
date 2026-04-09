# 成绩雷达 Phase 1 V2 执行清单（Day 1 - Day 7）

> 基于 `2026-04-04-phase1-implementation-plan.md`
> 目标：以 GitHub 远端稳定前端版为基线，完成 Web 端最小 SaaS 闭环
> 说明：本清单默认小程序 Phase 1 不接后端

---

## Day 1：云端项目初始化

### 目标

把 Supabase 项目、数据库和环境变量基础准备好。

### 必做项

1. 创建 Supabase 项目
2. 记录 `project ref`
3. 打开 SQL Editor
4. 执行核心表 SQL
5. 执行 RLS SQL
6. 在 Web 项目创建 `.env.local`
7. 只填入：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### 当天交付物

- Supabase 项目可访问
- 6 张核心表创建成功
- RLS 已开启
- Web 本地能读取到环境变量

### 验收

- 在 Table Editor 中能看到：
  - `users`
  - `profiles`
  - `exams`
  - `subjects`
  - `user_preferences`
  - `migration_jobs`
- SQL Editor 无报错
- `.env.local` 不入 Git

---

## Day 2：手机号登录打通

### 目标

让 Web 端从“直接进应用”变成“先登录再进入应用”。

### 必做项

1. 新增 `src/auth.js`
2. 新增 `src/login-ui.js`
3. 在 `src/app.js` 增加认证入口判断
4. 在 `src/styles.css` 或单独登录样式中补登录页样式
5. 建两个 Edge Function 占位：
   - `request-sms-code`
   - `verify-sms-code`
6. 开发期先使用测试验证码方案
7. 支持登录后持久化 session
8. 支持退出登录

### 建议先改的文件

- `E:\成绩雷达\成绩雷达_web\src\app.js`
- `E:\成绩雷达\成绩雷达_web\src\styles.css`
- `E:\成绩雷达\成绩雷达_web\src\auth.js`
- `E:\成绩雷达\成绩雷达_web\src\login-ui.js`

### 当天交付物

- 未登录时只显示登录页
- 输入手机号 + 验证码后能进入应用
- 刷新后保持登录态
- 可退出登录

### 验收

- 无登录态时不会直接加载业务数据
- 登录成功后能进入现有主界面
- 退出登录后回到登录页

---

## Day 3：云端 API 与 storage 分层

### 目标

把 Supabase 访问逻辑从 UI 和 `storage.js` 中分出来，建立云端数据访问层。

### 必做项

1. 新增 `src/cloud-api.js`
2. 在里面封装：
   - `fetchProfiles`
   - `createProfile`
   - `updateProfile`
   - `deleteProfile`
   - `fetchExams`
   - `createExam`
   - `updateExam`
   - `deleteExam`
   - `fetchSubjects`
   - `createSubject`
   - `updateSubject`
   - `deleteSubject`
   - `fetchUserPreferences`
   - `saveUserPreferences`
3. 修改 `src/storage.js`
4. 保留 local strategy
5. 增加 cloud strategy
6. 让 `storage.js` 只做策略分发，不直接堆满 Supabase 查询细节

### 建议先改的文件

- `E:\成绩雷达\成绩雷达_web\src\storage.js`
- `E:\成绩雷达\成绩雷达_web\src\cloud-api.js`
- `E:\成绩雷达\成绩雷达_web\src\utils.js`

### 当天交付物

- `storage.js` 可切换 local / cloud
- 云端读档案接口跑通
- 云端读考试接口跑通
- 云端读科目接口跑通

### 验收

- 登录后能从 Supabase 读取空数据而不报错
- 未登录仍保留原本本地读取能力

---

## Day 4：Web 核心 CRUD 云化

### 目标

把档案、考试、科目的增删改查切到云端。

### 必做项

1. 修改 `src/store.js` 为 async 数据流
2. 检查 `src/profile.js` 的档案操作
3. 检查 `src/exam-list.js` 的考试列表行为
4. 检查 `src/exam-detail.js` 的考试编辑、总分编辑、科目编辑
5. 确保：
   - 新建档案写入云端
   - 改名档案写入云端
   - 删除档案写入云端
   - 新建考试写入云端
   - 编辑考试写入云端
   - 删除考试写入云端
   - 新建科目写入云端
   - 编辑科目写入云端
   - 删除科目写入云端

### 建议重点文件

- `E:\成绩雷达\成绩雷达_web\src\store.js`
- `E:\成绩雷达\成绩雷达_web\src\profile.js`
- `E:\成绩雷达\成绩雷达_web\src\exam-list.js`
- `E:\成绩雷达\成绩雷达_web\src\exam-detail.js`

### 当天交付物

- 所有核心 CRUD 都可用
- 刷新页面后云端数据能恢复

### 验收

- 新建一场考试后刷新页面仍存在
- 新增一个科目后刷新页面仍存在
- 手动总分修改后刷新仍保持

---

## Day 5：活跃档案与迁移功能

### 目标

让活跃档案在云端有可靠落点，并让旧本地数据能迁移。

### 必做项

1. 用 `user_preferences.active_profile_id` 代替“默认取第一个档案”
2. 新增 `src/migration.js`
3. 检测是否存在本地历史数据
4. 首次登录后弹出迁移确认
5. 按顺序迁移：
   - profiles
   - exams
   - subjects
6. 写入 `migration_jobs`
7. 失败时保留本地原始数据

### 建议重点文件

- `E:\成绩雷达\成绩雷达_web\src\migration.js`
- `E:\成绩雷达\成绩雷达_web\src\storage.js`
- `E:\成绩雷达\成绩雷达_web\src\store.js`
- `E:\成绩雷达\成绩雷达_web\src\app.js`

### 当天交付物

- 活跃档案切换后刷新仍正确
- 本地数据迁移流程完整

### 验收

- 有本地数据的账号首次登录时会出现迁移提示
- 迁移完成后数量一致
- 迁移失败不会清掉本地数据

---

## Day 6：回归修复与异常提示

### 目标

把核心失败场景补到“能解释、能恢复、不会丢数据”。

### 必做项

1. 增加统一错误提示
2. 增加保存中 loading
3. 登录失败有可读提示
4. 云端保存失败有可读提示
5. 迁移失败有可读提示
6. 保证以下链路不回归：
   - 默认档案
   - 示例数据
   - 批量填写
   - 手动总分
   - 图表分析
   - 分享报告本地预览

### 建议重点文件

- `E:\成绩雷达\成绩雷达_web\src\app.js`
- `E:\成绩雷达\成绩雷达_web\src\modal.js`
- `E:\成绩雷达\成绩雷达_web\src\styles.css`
- `E:\成绩雷达\成绩雷达_web\src\report.js`

### 当天交付物

- 主要失败场景都有提示
- 不会出现无反馈的保存失败

### 验收

- 断网或 Supabase 报错时，界面不白屏
- 用户能知道“失败了什么”

---

## Day 7：联调与发布前检查

### 目标

完成 Phase 1 可交付版本的最终核验。

### 必做项

1. 跑完整测试清单
2. 清理临时调试代码
3. 清理临时测试验证码逻辑
4. 确认 `.env.local` 未误提交
5. 确认无明显控制台错误
6. 输出一份 Phase 1 完成说明

### 建议检查项

- 登录链路
- 云端 CRUD
- 活跃档案
- 本地迁移
- 手动总分
- 批量填写
- 图表
- 报告预览

### 当天交付物

- 可演示的 Web SaaS Phase 1
- 可供下一阶段继续扩展的小程序本地稳定版

---

## 附：Phase 1 期间不动的内容

这阶段明确不动：

- `E:\成绩雷达\成绩雷达_小程序\*`
- 微信扫码登录
- AI 分析接口
- VIP
- 分享链接后端
- 自动离线写队列

---

## 一句话执行顺序

**先认证，再云端数据，再迁移，最后回归。不要一上来同时改 Web、小程序、扫码、支付和 AI。**
