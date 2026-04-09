# 成绩雷达 SaaS 架构设计文档 V2

> 日期：2026-04-04  
> 状态：V2 草案  
> 阶段：第一阶段方案收敛  
> 适用范围：Web + 微信小程序

---

## 1. 文档目标

本版本用于把“本地单机工具”演进为“可登录、可同步、可增值”的 SaaS 产品，并解决 V1 中几个关键问题：

- 不再默认把 GitHub Pages 视为正式生产入口
- 明确哪些能力可以前端直连 Supabase，哪些必须走服务端
- 把“本地数据迁移到云端”的可靠性放到最高优先级
- 让现有 Web / 小程序的业务行为能平滑迁移，而不是推倒重来

---

## 2. 产品现状与约束

### 2.1 当前现状

- Web 版：Vite + ES Module，多模块拆分，当前更适合做开发预览、灰度验证、内部演示
- 小程序版：原生微信小程序，功能覆盖更完整，预计是正式主入口
- 当前数据主要存在本地：
  - Web：`localStorage`
  - 小程序：`wx.setStorageSync`
- 已有较多本地状态逻辑：
  - 默认档案
  - 示例数据首次注入
  - 手动总分覆盖
  - 批量填写
  - 科目满分记忆
  - 图表分析

### 2.2 关键产品判断

- GitHub Pages 不作为正式生产入口
- 正式入口优先级：
  1. 微信小程序
  2. 独立 Web 正式站点
  3. GitHub Pages 仅用于预览、演示、测试

这意味着：

- 鉴权、支付、分享、SEO、稳定性都不应围绕 GitHub Pages 设计
- Web 正式站点未来应有独立域名和可控部署环境

---

## 3. V2 核心设计原则

### 3.1 数据安全优先于功能扩张

对成绩类产品来说，最高风险不是 AI 不够聪明，而是：

- 数据迁移丢失
- 多设备状态不一致
- 同步覆盖错误
- 用户以为保存成功，实际上没入云

所以第一阶段优先级应为：

1. 登录与身份绑定
2. 云端数据模型
3. 本地到云端迁移
4. 同步与冲突处理
5. VIP / AI / PDF 等增值能力

### 3.2 前端可直连，但不能全都直连

可以前端直连 Supabase 的能力：

- 查询自己的档案
- 查询自己的考试和科目
- 基础 CRUD
- 实时订阅和同步状态刷新

必须经过服务端函数的能力：

- 微信登录换 token
- VIP 兑换
- AI 调用与配额扣减
- PDF 导出
- 分享码签发和校验
- 本地数据迁移任务的幂等处理

### 3.3 不把现有 `storage.js` 直接演化成“大一统巨石”

V1 的“双策略”方向是对的，但 V2 需要分层：

- `repositories/local/*`
- `repositories/cloud/*`
- `services/sync/*`
- `services/auth/*`
- `services/subscription/*`
- `storageFacade.js`

这样做的目的不是“更学院派”，而是为了避免以后所有逻辑都堆进一个 `storage.js`。

---

## 4. 整体架构

### 4.1 推荐架构

```text
客户端
├─ 微信小程序（主入口）
├─ Web 正式站点（后续独立部署）
└─ GitHub Pages（预览环境）

客户端数据访问层
├─ storageFacade
├─ local repositories
├─ cloud repositories
└─ sync service

云端
├─ Supabase Auth
├─ Postgres + RLS
├─ Storage
└─ Edge Functions

外部服务
├─ 微信开放平台 / 小程序登录
├─ AI 模型服务
├─ 短信服务
└─ PDF 渲染能力
```

### 4.2 第一阶段边界

第一阶段只做：

- 登录
- 基础云同步
- 本地迁移
- VIP 状态管理
- AI 分析基础版

第一阶段不强做：

- 复杂协作编辑
- 全量实时多人协同
- 支付系统闭环
- 大而全的运营后台

---

## 5. 数据模型设计

以下是 V2 推荐的数据模型，不追求一步到位，但要覆盖现有产品真实行为。

### 5.1 `public.users`

用于承接 `auth.users` 扩展信息。

建议字段：

- `id uuid pk references auth.users(id)`
- `openid text unique`
- `phone text`
- `nickname text`
- `avatar_url text`
- `vip_status text not null default 'free'`
- `vip_expires_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

不建议把 AI 配额累计字段直接长期堆在这张表里。更稳的是拆日志表。

### 5.2 `user_preferences`

新增建议表，用来存“偏好设置”而不是业务主数据。

建议字段：

- `user_id uuid pk`
- `active_profile_id uuid null`
- `theme text`
- `onboarding_done boolean default false`
- `created_at timestamptz`
- `updated_at timestamptz`

原因：

- `profiles.is_active` 在多设备下容易冲突
- “当前激活档案”属于用户偏好，不是档案本体属性

### 5.3 `profiles`

建议字段：

- `id uuid pk`
- `user_id uuid not null`
- `name text not null`
- `school text`
- `grade_level text`
- `class_name text`
- `education_stage text`
- `created_at timestamptz`
- `updated_at timestamptz`

建议移除 `is_active`。

### 5.4 `exams`

建议字段：

- `id uuid pk`
- `profile_id uuid not null`
- `name text not null`
- `start_date date`
- `end_date date`
- `term text`
- `exam_type text`
- `class_rank int`
- `grade_rank int`
- `class_total int`
- `grade_total int`
- `manual_total_score numeric(8,2) null`
- `is_excluded boolean default false`
- `notes text`
- `created_at timestamptz`
- `updated_at timestamptz`

这里最关键的是 `manual_total_score`。  
因为你现在产品里已经支持：

- 各科自动汇总总分
- 用户手动覆盖总分
- 与自动汇总不一致时显示提醒

如果云端模型不保留这个字段，现有功能一上云就会语义丢失。

### 5.5 `subjects`

建议字段：

- `id uuid pk`
- `exam_id uuid not null`
- `name text not null`
- `score numeric(8,2)`
- `full_score numeric(8,2)`
- `class_rank int`
- `grade_rank int`
- `notes text`
- `sort_order int default 0`
- `created_at timestamptz`
- `updated_at timestamptz`

建议增加约束策略二选一：

1. 如果一个考试中同名科目只能存在一次，则加唯一约束：
   - `(exam_id, name)`
2. 如果允许重复，则必须保留 `sort_order`

我更建议第一阶段采用“同一考试内科目名唯一”。

### 5.6 `share_links`

建议字段：

- `id uuid pk`
- `profile_id uuid not null`
- `target_type text not null`
- `target_id uuid null`
- `code text unique not null`
- `role text not null default 'view'`
- `created_by uuid not null`
- `expires_at timestamptz null`
- `is_active boolean default true`
- `created_at timestamptz`

建议 `code` 使用高熵随机串，不要做短码猜测风险。

### 5.7 `ai_usage_logs`

建议新增这张表，不要只在用户表里做累计字段。

建议字段：

- `id uuid pk`
- `user_id uuid not null`
- `profile_id uuid null`
- `feature text not null`
- `model text`
- `quota_type text not null`
- `tokens_in int null`
- `tokens_out int null`
- `status text not null`
- `error_message text null`
- `created_at timestamptz`

价值：

- 可追溯
- 可对账
- 可做配额审计
- 可查失败请求是否误扣次数

### 5.8 `ai_analyses`

建议保留，但明确它是“缓存表”。

建议字段：

- `id uuid pk`
- `profile_id uuid not null`
- `analysis_type text not null`
- `content text not null`
- `data_hash text not null`
- `version int default 1`
- `model_used text`
- `created_at timestamptz`

推荐唯一索引：

- `(profile_id, analysis_type, data_hash, version)`

### 5.9 `vip_codes`

可以保留，但建议再补“使用记录”。

新增建议表：`vip_code_redemptions`

- `id uuid pk`
- `code_id uuid not null`
- `user_id uuid not null`
- `redeemed_at timestamptz`

这样你以后查谁用了哪张码会更清楚。

### 5.10 `migration_jobs`

强烈建议新增。

建议字段：

- `id uuid pk`
- `user_id uuid not null`
- `source text not null`
- `status text not null`
- `payload jsonb`
- `error_message text`
- `created_at timestamptz`
- `updated_at timestamptz`

状态建议：

- `pending`
- `running`
- `failed`
- `done`

---

## 6. RLS 设计建议

V1 的方向对，但 V2 需要更明确：

### 6.1 基础原则

- 所有业务表开启 RLS
- 普通用户默认只能访问自己的数据
- 分享访问单独走受控查询路径，不建议直接把普通 RLS 写得过于复杂

### 6.2 建议收敛策略

第一阶段：

- `profiles / exams / subjects / ai_analyses` 只允许 owner 访问
- 分享功能不直接开放全表 SELECT
- 分享查看优先走 Edge Function 或受控 RPC

原因：

- 如果一开始就把“分享可读”混进每张表 RLS，调试成本很高
- 你当前阶段更需要稳定，而不是极致灵活

### 6.3 推荐做法

- 自有数据：RLS 直接放行 owner
- 分享数据：通过 `share_links` + `Edge Function get-shared-profile` 返回脱敏结果

这样能显著降低 RLS 出错概率。

---

## 7. 登录与身份体系

### 7.1 登录方式

小程序：

- 微信登录为主

Web 正式站点：

- 手机号验证码登录为主
- 微信扫码登录可作为后续增强项

### 7.2 游客模式策略

建议保留游客模式，不要强制登录。

游客用户可继续使用：

- 本地档案
- 本地考试
- 本地图表
- 本地导入导出

需要登录才能用：

- 云同步
- 多设备同步
- VIP 权益
- AI 分析
- 分享协作
- PDF 导出

### 7.3 首次登录后的迁移流程

建议明确成状态机，而不是前端临时拼逻辑。

流程：

1. 登录成功
2. 检查本地是否有数据
3. 检查云端是否已有数据
4. 若本地有、云端空：
   - 提示迁移
5. 若本地有、云端也有：
   - 提示用户选择：
     - 以云端为准
     - 以本地为准并覆盖云端
     - 稍后处理

第一阶段建议不要做自动合并，先做人可理解的显式选择。

---

## 8. 同步策略

### 8.1 第一阶段不同步所有状态

第一阶段同步：

- profiles
- exams
- subjects

第一阶段不同步：

- UI 偏好
- 临时表单记忆
- 图表本地展开状态
- 临时编辑草稿

### 8.2 冲突策略

第一阶段采用简单规则：

- 单用户、多设备场景
- 同一条记录以 `updated_at` 较新者为准
- 复杂冲突不自动合并

这不是最完美，但适合当前阶段。

### 8.3 同步触发时机

- 登录完成后主动拉取一次
- 关键 CRUD 成功后增量同步
- 页面恢复前台时可做轻量校验

不建议第一阶段就做高频实时双向同步。

---

## 9. AI 能力设计建议

### 9.1 AI 分析先做窄，不要同时铺太宽

建议顺序：

- 成绩总结
- 学习建议
- 趋势解读
- OCR 识别
- 语音录入

原因：

- OCR 和语音链路远比文本分析复杂
- 先证明用户愿意为 AI 结果买单，再扩展录入方式

### 9.2 AI 入口拆分

建议不要把“AI 分析”和“AI 录入”放成一个服务函数。

拆成：

- `ai-analyze`
- `ai-import-text`
- `ai-import-image`
- `ai-import-voice`

第一阶段甚至可以只实现前两个。

### 9.3 配额扣减原则

- 先鉴权
- 再校验配额
- 成功调用且成功返回才扣减
- 超时、模型报错、解析失败不应直接扣减

---

## 10. VIP 体系建议

### 10.1 第一阶段 VIP 不要和支付强绑定

建议第一阶段仅支持：

- 兑换码
- 后台手动开通

这是对的，继续保留。

### 10.2 免费版限制建议再温和一点

当前文档限制可以保留大方向，但建议不要过早卡太死。

更推荐：

- 档案数：免费 2 个
- 考试数：免费每档案 30 场
- AI：免费每月 3 次
- 云同步：可登录后试用一次迁移，但长期同步为 VIP

原因：

- 如果一上来就把基础记录能力卡太狠，用户很难进入留存阶段

---

## 11. 前端改造建议

### 11.1 不建议继续以“一个 storage.js 兜底所有云本地切换”

建议改成：

```javascript
// storageFacade.js
export async function getProfiles() { ... }
export async function saveExam() { ... }

// repositories/local/profileRepo.js
// repositories/cloud/profileRepo.js
// services/sync/migrateLocalToCloud.js
```

### 11.2 现有模块改造优先级

优先改：

- `storage.js` / 数据访问层
- `app.js` / 登录态初始化
- `profile.js` / 云端档案切换
- `exam-detail.js` / 保存与总分逻辑
- `demo-data.js` / 游客模式与登录模式边界

后改：

- 图表
- 报告
- AI UI

### 11.3 示例数据策略要重新定义

现在本地版有“首次启动自动注入示例数据”的行为。  
SaaS 化后建议改为：

- 游客模式：可选择添加示例数据
- 登录用户：默认不自动注入
- 新用户引导里可手动点“体验示例”

否则云端正式用户会觉得自己的真实空间被“演示数据污染”。

---

## 12. 实施路线图 V2

### Phase 0：设计收口

- 确认正式入口：小程序优先，Web 为正式站点预留，GitHub Pages 仅预览
- 冻结数据模型 V2
- 冻结同步策略 V2

### Phase 1：云端底座

- 建表
- RLS
- Auth
- `user_preferences`
- `migration_jobs`
- `ai_usage_logs`

### Phase 2：登录与迁移

- 小程序微信登录
- Web 手机号登录
- 本地数据迁移弹窗
- 迁移任务状态
- 迁移失败提示与重试

### Phase 3：基础云同步

- profiles 云端 CRUD
- exams 云端 CRUD
- subjects 云端 CRUD
- 当前档案偏好同步

### Phase 4：会员与 AI

- VIP 兑换
- AI 分析
- 配额日志
- 基础埋点

### Phase 5：增强功能

- 分享查看
- PDF 导出
- OCR 录入
- 语音录入

---

## 13. 风险与建议

### 13.1 最大风险排序

1. 数据迁移与覆盖错误
2. 多端状态不一致
3. RLS 误配导致越权或查不到数据
4. AI 成本失控
5. 小程序审核与登录链路问题

### 13.2 对应建议

- 所有迁移先做本地备份
- 所有“覆盖云端”操作必须二次确认
- 分享功能不要第一阶段直接深度耦合 RLS
- AI 调用统一经过服务端
- Web 正式站点尽早从 GitHub Pages 预览模式中分离

---

## 14. 最终建议结论

V2 推荐技术决策如下：

- 第一阶段继续用 Supabase，没有问题
- GitHub Pages 不纳入正式架构，只保留预览用途
- 先做登录、迁移、同步，再做 AI 和 PDF
- 数据模型必须补上：
  - `manual_total_score`
  - `user_preferences`
  - `ai_usage_logs`
  - `migration_jobs`
- 分享功能第一阶段走受控服务端读取，不直接把全套分享权限揉进 RLS
- 前端改造采用“仓储 + 门面 + 同步服务”分层，不让 `storage.js` 继续膨胀

---

## 15. 待确认事项

- Web 正式站点最终部署平台：
  - Vercel / Netlify / 自建 Node / 其他
- 云同步是否作为 VIP 权益，还是登录即开放
- PDF 导出是否第一阶段就做
- OCR 是否第一阶段进入 MVP
- 分享功能第一阶段是否只做“只读查看”

---

文档到此为止。后续如果进入实施阶段，建议再补一份配套文档：

- `2026-04-xx-saas-implementation-plan.md`

专门拆任务、接口、表结构迁移顺序和测试清单。
