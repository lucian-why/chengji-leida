# 成绩雷达 - 认证与云同步方案设计文档

> 版本：v2.0 | 日期：2026-04-05  
> 当前基线：Web 端已切换到 CloudBase 官方邮箱验证码登录；云同步已切换到 CloudBase 官方登录态鉴权。

---

## 1. 当前结论

本项目已经不再使用 Supabase Auth，也不再使用“自建 token + users 集合校验”作为 Web 主认证链路。

当前已落地的真实方案是：

1. Web 登录使用 **CloudBase 官方邮箱验证码登录**。
2. 云同步使用 **CloudBase 云函数 + cloud_profiles 集合**。
3. 云同步函数直接读取 **当前 CloudBase 登录用户身份**，不再依赖前端传入旧 token。
4. 小程序后续继续沿用 CloudBase 认证体系，再补微信登录。

---

## 2. 当前生效架构

```text
Web 前端
  ├─ CloudBase 官方邮箱验证码登录
  ├─ 本地成绩/档案数据
  └─ 云端同步面板
          │
          ▼
CloudBase Web SDK
  ├─ getVerification({ email })
  ├─ signInWithEmail(...)
  └─ getCurrentUser()
          │
          ▼
CloudBase 云函数
  ├─ listCloudProfiles
  ├─ getCloudProfileData
  ├─ uploadCloudProfile
  └─ deleteCloudProfiles
          │
          ▼
CloudBase 文档型数据库
  └─ cloud_profiles
```

---

## 3. 这次变更的核心原因

之前系统里混着两套认证思路：

1. Supabase / Magic Link
2. 自建 token + users 集合 + 云函数校验

后来 Web 端正式切到腾讯云 CloudBase 后，认证来源发生了变化：

- 用户登录身份不再来自 Supabase session
- 也不再来自自建 users.token
- 而是来自 CloudBase 官方登录态

因此云同步链路必须一起调整：

1. 前端不能再继续传旧的 `token + userId` 给同步函数
2. 同步函数不能再继续查询旧的 `users` 集合校验登录
3. 同步函数必须直接读取 CloudBase 当前登录用户身份

这就是这次联调过程中，前端登录成功后仍提示“登录已过期”的根因。

---

## 4. 已完成的架构变更

### 4.1 Web 登录链路

已经改为 CloudBase 官方邮箱验证码登录：

1. 前端调用 `auth.getVerification({ email })` 发送验证码
2. 用户输入验证码
3. 前端调用 `auth.signInWithEmail(...)` 完成登录
4. 前端再通过 `auth.getCurrentUser()` 获取当前登录用户

### 4.2 云同步链路

已经改为 CloudBase 官方登录态鉴权：

- `listCloudProfiles`
- `getCloudProfileData`
- `uploadCloudProfile`
- `deleteCloudProfiles`

这 4 个函数现在都不再依赖旧 token 校验，而是直接读取 CloudBase 当前用户身份。

### 4.3 前端本地缓存

前端仍保留一层轻量本地缓存，仅用于 UI 展示和减少重复请求：

- `tcb_user`
- `tcb_user_id`
- `tcb_user_email`
- `tcb_token`

说明：
- 这里的 `tcb_token` 现在只是前端兼容键，不再作为云同步函数的真实鉴权依据。
- 真实鉴权以 CloudBase 官方登录态为准。

---

## 5. 数据模型

### 5.1 当前必须存在的集合

#### `cloud_profiles`

用于保存每个用户备份到云端的档案数据包。

推荐字段：

```javascript
{
  _id: "auto_generated",
  userId: "cloudbase_uid",
  userEmail: "user@example.com",
  profileId: "local-profile-id",
  profileName: "默认档案",
  profileData: { ...完整档案包... },
  examCount: 7,
  dataSize: 5230,
  lastSyncAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

说明：
- `userId` 保存的是 **CloudBase 当前登录用户标识**。
- 不再要求它等于自建 `users._id`。
- `profileData` 继续保存完整档案包，第一阶段不拆关系表。

### 5.2 当前不再作为主链路依赖的集合

下面这些集合或字段，不再是 Web 当前认证与同步主链路的前置条件：

- `users`
- `email_codes`
- 自建 `token`
- `token_expire_at`

它们如果继续保留，只能视作旧方案遗留或后续扩展材料，不能再作为当前 Web 主链路的真相来源。

---

## 6. 云函数职责

### `listCloudProfiles`

作用：
- 读取当前登录用户的所有云端档案摘要

当前规则：
- 直接根据 CloudBase 当前登录用户身份读取 `cloud_profiles.userId`
- 不再校验前端传入 token

### `getCloudProfileData`

作用：
- 读取某个云端档案的完整数据包

### `uploadCloudProfile`

作用：
- 将本地某个档案完整备份到云端
- 如果该档案已存在，则覆盖更新

### `deleteCloudProfiles`

作用：
- 删除当前登录用户选中的云端档案

---

## 7. 当前 Web 端真实登录流程

```text
点击云端同步
  ↓
如果未登录，打开登录弹层
  ↓
输入邮箱
  ↓
发送验证码（CloudBase 官方接口）
  ↓
输入验证码
  ↓
CloudBase 官方登录成功
  ↓
打开云端同步面板
  ↓
读取 cloud_profiles 集合
```

---

## 8. 为什么不再继续用自定义 SMTP 方案

本轮已明确收敛：

- 登录认证使用 CloudBase 官方邮箱验证码能力
- 不再把“自定义 SMTP 发验证码 + email_codes 集合 + 自建 token”作为 Web 主方案

原因：

1. 少一套验证码表和状态机
2. 少一套 SMTP 发信维护成本
3. 少一套“前端登录态”和“云函数登录态”不一致的问题
4. 更适合后续与小程序统一到同一 CloudBase 认证体系

---

## 9. 后续阶段建议

### Phase 1.5：把文案与代码彻底对齐

继续清理项目中还残留的旧描述，例如：

- “SMTP”
- “自建 token”
- “users 集合校验登录”
- “Supabase 登录”

### Phase 2：小程序接入微信登录

建议方向：

1. 小程序使用 CloudBase / 微信生态登录能力
2. 小程序和 Web 共用 `cloud_profiles` 云同步数据层
3. 认证层统一在 CloudBase 下管理

### Phase 3：再评估手机号登录

如果后面确实需要手机号登录，再决定：

1. 继续用 CloudBase 官方能力
2. 或补自定义短信云函数

但无论如何，都不建议再恢复到“自建 token 作为主鉴权来源”的旧路线。

---

## 10. 当前实现边界

这份文档描述的是 **当前真实已跑通的 Web 架构**，不是最初设想版本。

也就是说，当前真相是：

- Web 已切到 CloudBase 官方邮箱验证码登录
- 云同步已切到 CloudBase 官方登录态鉴权
- `cloud_profiles` 是当前唯一必须落地的云同步主集合
- 旧的 `sendEmailCode / emailLogin / verifyToken(users token)` 方案不再作为主链路

后续若继续做小程序，请以这份 v2 为准，而不是以旧版“SMTP + email_codes + 自建 token”的描述为准。
