# 成绩雷达 SaaS 化实施计划（Phase 1 V2）

> 基于 `docs/2026-04-04-saas-architecture-design.md` V2
> 更新时间：2026-04-04
> 状态：V2（按当前 GitHub 远端稳定版重排）

---

## 一、当前基线确认

### 1.1 GitHub 远端稳定版

本计划以 GitHub 上已经存在的纯前端稳定提交为起点，而不是以当前本地工作区的未提交改动为起点。

- Web 仓库：`lucian-why/chengjileida`
  - 远端 `main` 当前可见稳定提交：`aa12b47`
  - 提交说明：`fix: sync root index with latest pages build`
  - 说明：这代表 Web 纯前端版本已经形成一个可用基线。
- 小程序仓库：`lucian-why/chengjiguanjia-miniprogram`
  - 远端 `main` 当前可见稳定提交：`fcad57e`
  - 提交说明：`Localize miniprogram UI and iconize controls`
  - 说明：这代表小程序纯前端版本也已有一个可用基线。

### 1.2 当前本地状态说明

当前本地两个仓库都存在未提交修改，因此：

- GitHub 远端：可以视为“纯前端稳定版基线”
- 本地工作区：不能直接视为 SaaS Phase 1 的唯一实施依据

因此 V2 的原则是：

1. 先冻结远端稳定前端基线
2. Phase 1 只接 Web 端云化
3. 小程序保持本地版可用，暂不在 Phase 1 接入后端
4. GitHub Pages 只作为预览地址，不作为正式入口

---

## 二、V2 的核心调整

相较于旧版 Phase 1，本版做了 5 个关键收缩：

1. 去掉 Phase 1 内的微信扫码登录。
2. 去掉 Phase 1 内的自动离线降级和自动回切。
3. 去掉 Phase 1 内的小程序同步改造。
4. 去掉 Phase 1 内的 VIP、AI、分享链路云端化。
5. 去掉“delete + insert 全量重写”的数据保存方案，改为明确的单实体 CRUD / upsert。

### 为什么这么改

因为你现在最重要的不是“把所有能力都挂上云”，而是先把下面这条链路做稳：

`Web 登录 -> 云端建档 -> 云端增删改查 -> 本地数据迁移 -> 刷新后恢复`

只要这条链路稳定，后面再接扫码登录、小程序、AI、VIP，风险就会低很多。

---

## 三、Phase 1 V2 目标

### 总目标

在不破坏当前纯前端稳定版体验的前提下，让 Web 版具备最小可用的 SaaS 能力：

- 用户可登录
- 数据可存入云端
- Web 刷新后可恢复云端数据
- 本地历史数据可一次性迁移
- 未完成迁移前，本地数据不丢失

### 不包含内容

以下内容明确不放入 Phase 1：

- 微信扫码登录
- 小程序接后端
- AI 分析
- VIP 与支付
- 分享链接云端化
- 自动离线同步队列
- 多设备实时协同

---

## 四、Phase 1 V2 范围拆分

### Phase 1A：云端底座与手机号登录（预计 2-3 天）

目标：先把用户身份和最小核心表跑通。

产出：

- Supabase 项目创建完成
- 核心表建立完成
- 正确的 RLS 生效
- 手机号验证码登录可用
- Web 端登录页接入完成

### Phase 1B：Web 数据层云化（预计 2-3 天）

目标：只改 Web，把档案/考试/科目从本地存储接到云端。

产出：

- `storage.js` 完成云端策略接入
- 档案 CRUD 走云端
- 考试 CRUD 走云端
- 科目 CRUD 走云端
- 刷新页面后能恢复云端数据

### Phase 1C：本地迁移与稳定性收尾（预计 1-2 天）

目标：把旧用户历史数据安全迁到云端，并补齐回归测试。

产出：

- 首次登录触发迁移提示
- 本地数据迁移完成
- 迁移失败不丢原始本地数据
- 关键流程回归通过

### 总工期建议

- 预计：`5-8 天`
- 不再写死 `5-7 天`
- 如果短信服务和 RLS 第一次接入不顺，`8 天`更现实
- 建议为 RLS 调试单独预留 `0.5 - 1 天` 缓冲，尤其是第一次接 Supabase 时

---

## 五、数据库设计（Phase 1 核心版）

V2 不再沿用旧版那套 7 张业务表全上云的思路。

Phase 1 只建立当前真正需要的核心表：`users`、`profiles`、`exams`、`subjects`、`user_preferences`、`migration_jobs`。`share_links`、`ai_usage_logs`、`ai_analyses`、`vip_codes`、`vip_code_redemptions` 等后续阶段再建。

1. `users`
2. `profiles`
3. `exams`
4. `subjects`
5. `user_preferences`
6. `migration_jobs`

### 5.1 users

```sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  openid text unique,
  phone varchar(20) unique,
  nickname varchar(100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

说明：

- `users.id` 必须直接对齐 `auth.users.id`
- 不再自己 `gen_random_uuid()` 另造一套用户主键

### 5.2 profiles

```sql
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name varchar(100) not null default '默认档案',
  xueji varchar(50),
  school_name varchar(200),
  class_name varchar(100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_user_id on public.profiles(user_id);
```

### 5.3 exams

```sql
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name varchar(200) not null,
  start_date date,
  end_date date,
  notes text,
  total_score numeric(10,2),
  manual_total_score numeric(10,2),
  class_rank integer,
  grade_rank integer,
  class_count integer,
  grade_count integer,
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_exams_profile_id on public.exams(profile_id);
```

说明：

- `manual_total_score` 要保留，因为你现在前端已经有“手动总分覆盖”能力
- `start_date/end_date/notes` 要和当前真实前端字段对齐

### 5.4 subjects

```sql
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject_name varchar(50) not null,
  score numeric(10,2),
  full_score numeric(10,2) default 100,
  class_rank integer,
  grade_rank integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subjects_exam_id on public.subjects(exam_id);
create unique index idx_subjects_exam_name on public.subjects(exam_id, subject_name);
```

### 5.5 user_preferences

```sql
create table public.user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  active_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

说明：

- 活跃档案不要再通过“取第一个档案”猜测
- 统一放在 `user_preferences.active_profile_id`

### 5.6 migration_jobs

```sql
create table public.migration_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source varchar(20) not null default 'local',
  status varchar(20) not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_migration_jobs_user_id on public.migration_jobs(user_id);
```

说明：

- 用于记录迁移是否 `pending / running / failed / done`
- 迁移失败后更容易排查

---

## 六、RLS 策略（修正版）

V2 不再使用旧版里不正确的 `FOR USING` 写法。

### 6.1 启用 RLS

```sql
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.subjects enable row level security;
alter table public.user_preferences enable row level security;
alter table public.migration_jobs enable row level security;
```

### 6.2 users

```sql
create policy "users_select_own" on public.users
for select using (auth.uid() = id);

create policy "users_update_own" on public.users
for update using (auth.uid() = id);

create policy "users_insert_own" on public.users
for insert with check (auth.uid() = id);
```

### 6.3 profiles

```sql
create policy "profiles_manage_own" on public.profiles
for all using (user_id = auth.uid())
with check (user_id = auth.uid());
```

### 6.4 exams

```sql
create policy "exams_manage_own" on public.exams
for all using (
  exists (
    select 1
    from public.profiles
    where profiles.id = exams.profile_id
      and profiles.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = exams.profile_id
      and profiles.user_id = auth.uid()
  )
);
```

### 6.5 subjects

```sql
create policy "subjects_manage_own" on public.subjects
for all using (
  exists (
    select 1
    from public.exams
    join public.profiles on profiles.id = exams.profile_id
    where exams.id = subjects.exam_id
      and profiles.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.exams
    join public.profiles on profiles.id = exams.profile_id
    where exams.id = subjects.exam_id
      and profiles.user_id = auth.uid()
  )
);
```

### 6.6 user_preferences / migration_jobs

```sql
create policy "preferences_manage_own" on public.user_preferences
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "migration_jobs_manage_own" on public.migration_jobs
for all using (user_id = auth.uid())
with check (user_id = auth.uid());
```

---

## 七、环境变量与安全边界

V2 明确区分“前端可公开变量”和“服务端私密变量”。

### 前端允许放的变量

放在 `成绩雷达_web/.env`：

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

### 不允许放在前端的变量

以下变量不能再出现在 `VITE_` 前缀里：

- 微信 `AppSecret`
- 腾讯云短信 `SecretId`
- 腾讯云短信 `SecretKey`
- 任何服务端签名密钥

这些只允许放在：

- Supabase Edge Functions secrets
- 或你自己的服务端环境变量

---

## 八、认证方案（Phase 1 仅手机号）

### 为什么先不上微信扫码

因为当前 Phase 1 的目标是“先让 Web 端完成最小可用上云”。

微信扫码登录会额外引入：

- OAuth 回调域名配置
- 微信网页授权限制
- 公众号/开放平台差异
- 回调链路调试成本

这些都不适合和数据迁移、RLS、云端 CRUD 混在同一阶段。

### Phase 1 认证方案

只做：

- 手机号输入
- 发送验证码
- 验证码登录
- 自动保持登录态
- 退出登录

### Edge Functions

Phase 1 只需要 2 个函数：

1. `request-sms-code`
2. `verify-sms-code`

说明：

- 开发期可以先用“控制台打印验证码”或固定测试码
- 不要求第一天就接真实短信供应商

---

## 九、Web 代码改造范围（按真实项目结构）

旧版计划里的文件名和真实代码不一致，这里统一修正。

### 需要新增的文件

- `src/auth.js`
- `src/login-ui.js`
- `src/cloud-api.js`
- `src/migration.js`

### 需要重点修改的现有文件

- `src/app.js`
- `src/storage.js`
- `src/store.js`
- `src/profile.js`
- `src/exam-list.js`
- `src/exam-detail.js`
- `src/report.js`
- `src/utils.js`
- `src/styles.css`

### 暂不改的小程序代码

Phase 1 不修改：

- `成绩雷达_小程序/*`

原因：

- 先把 Web 上云链路做稳
- 再把同样的数据协议迁到小程序

---

## 十、数据层改造原则

### 10.1 不采用 delete + insert 全量覆盖

旧版计划里 `saveProfiles/saveExams/saveSubjects` 的“先删再插”方案不再使用。

原因：

- 会导致主键变化
- 会让考试和科目引用关系变脆弱
- 会让迁移与问题排查变难
- 会让未来分享链接和日志体系失去稳定对象

### 10.2 改为更稳的写法

优先顺序：

1. 单条新增：`insert`
2. 单条编辑：`update`
3. 单条删除：`delete`
4. 批量同步：仅在迁移场景使用 `insert/upsert`

### 10.3 storage.js 的角色

`storage.js` 在 Phase 1 仍然保留 facade 角色，但职责收窄：

- local strategy：保留现有 localStorage 逻辑
- cloud strategy：转调 `cloud-api.js`
- 不在 `storage.js` 内直接堆大量 Supabase 查询细节

建议结构：

- `auth.js`：登录与会话
- `cloud-api.js`：Supabase 数据访问
- `migration.js`：一次性迁移
- `storage.js`：策略分发与兼容接口

这四个文件在 Phase 1 中要明确职责边界，避免后续再次演变成把认证、查询、迁移和缓存细节都堆回 `storage.js` 的巨石实现。

---

## 十一、迁移策略（V2）

迁移的原则是“显式确认、一次执行、失败可回看、本地不丢”。

### 迁移触发时机

- 用户首次手机号登录成功后
- 且云端当前没有数据
- 且本地存在档案/考试数据

### 迁移流程

1. 检测本地数据是否存在
2. 弹窗提示是否迁移
3. 写入 `migration_jobs` 一条 `running`
4. 先迁移档案，再迁移考试，再迁移科目
5. 成功后写 `done`
6. 失败后写 `failed`，保留错误明细

### 迁移约束

- 不自动清理本地原始数据
- 不做“静默自动迁移”
- 不做迁移中途强制覆盖云端已有数据

---

## 十二、Phase 1 验收标准

### 12.1 必须通过

1. 未登录打开 Web 时，只看到登录页。
2. 手机号登录成功后，可进入主页。
3. 能创建档案、考试、科目并成功保存到云端。
4. 刷新页面后，云端数据仍能恢复。
5. 首次登录发现本地数据时，会弹迁移确认。
6. 迁移成功后，云端数据与本地数据数量一致。
7. 登录退出后，再进页面不会直接读到上一位用户的云端数据。

### 12.2 可接受但暂不解决

1. GitHub Pages 预览站不参与正式登录体系。
2. 小程序仍然只用本地存储。
3. 无网络时只提示失败，不做自动离线写队列。

---

## 十三、测试清单（V2）

### 认证

- [ ] 手机号输入校验正常
- [ ] 验证码发送流程正常
- [ ] 验证码登录流程正常
- [ ] 刷新后保持登录态
- [ ] 退出登录成功

### 数据

- [ ] 新建档案成功
- [ ] 新建考试成功
- [ ] 编辑考试成功
- [ ] 删除考试成功
- [ ] 新增科目成功
- [ ] 编辑科目成功
- [ ] 删除科目成功
- [ ] 手动总分字段在云端保持一致

### 迁移

- [ ] 有本地数据时会提示迁移
- [ ] 迁移成功后档案数量一致
- [ ] 迁移成功后考试数量一致
- [ ] 迁移成功后科目数量一致
- [ ] 迁移失败时本地数据不丢

### 回归

- [ ] 示例数据逻辑不受影响
- [ ] 默认档案逻辑不受影响
- [ ] 档案切换逻辑不受影响
- [ ] 批量填写逻辑不受影响
- [ ] 图表展示逻辑不受影响
- [ ] 分享报告本地预览逻辑不受影响

---

## 十四、推荐执行顺序

### Day 1

- 建 Supabase 项目
- 建 6 张核心表
- 写正确 RLS
- 配好前端环境变量

### Day 2

- 接 `auth.js`
- 做手机号登录页
- 接入登录保持与退出

### Day 3-4

- 建 `cloud-api.js`
- 改 `storage.js`
- 改 `store.js`
- 打通档案/考试/科目云端 CRUD

### Day 5

- 做 `migration.js`
- 跑本地到云端迁移
- 修回归 bug

### Day 6-7

- 做异常提示与边界处理
- 跑完整回归清单
- 产出 Phase 1 完成报告

---

## 十五、Phase 2 入口（预告）

Phase 1 完成后，再进入这些内容：

1. 微信扫码登录
2. 小程序接云端
3. 分享链接落地页
4. AI 分析
5. VIP 与支付
6. 更稳的离线同步与冲突处理

---

## 十六、一句话结论

V2 的核心思想不是“把所有 SaaS 功能一次接完”，而是：

**以 GitHub 上现有纯前端稳定版为基线，先把 Web 的手机号登录、云端存储和本地迁移做稳，再继续扩到扫码登录和小程序。**

