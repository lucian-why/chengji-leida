# 成绩雷达 Web 端 CloudBase 迁移复盘

日期：2026-04-06

## 背景

本轮工作目标是把成绩雷达 Web 端从原先的 Supabase 登录与云同步方案，切换到腾讯云 CloudBase，并完成以下能力：

- 邮箱验证码登录
- 邮箱密码登录/注册
- 云端同步
- GitHub Pages 发布

在落地过程中，前后经历了多次认证链路调整，最终形成了当前可用方案：

- 登录前置：CloudBase 匿名登录
- 认证方式：自定义邮箱验证码 + 自定义密码登录
- 验证码发送：云函数 `sendEmailCode` + 自定义 SMTP
- 登录注册：云函数 `emailRegister` / `passwordLogin`
- 云同步：`cloud_profiles` 集合 + 4 个同步云函数

## 本轮遇到的主要问题

### 1. GitHub Pages 与本地页面不一致

现象：

- 本地已经修好，但 GitHub Pages 还是旧页面
- 线上样式丢失，只剩纯文字按钮

根因：

- Pages 发布源在 `main` 与 `gh-pages` 之间来回切换
- 有时线上读的是仓库根目录 `index.html`
- 有时读的是构建后的 `dist/index.html`

解决：

- 明确 `main` 放源码，`gh-pages` 放构建产物
- 每次发布前先本地 `npm run build`
- 再把最新 `dist/index.html` 推到 `gh-pages`

对小程序的启示：

- 不要让“开发版本”和“发布版本”来源不清晰
- 后面小程序也应明确“开发分支 / 发布包 / 体验版”的边界

### 2. CloudBase CLI 部署云函数反复失败

现象：

- 新函数部署报错：
  - `entryFile did not find in code or layers`
  - 早期还出现过本地打包误扫用户目录

根因：

- CLI 在不同目录下对函数根目录识别不稳定
- 直接在父目录部署时，未正确把子函数目录作为上传根
- 一部分文件还出现过 BOM 与路径干扰问题

解决：

- 最终可用方式是进入具体函数目录，或显式指定函数目录部署
- 成功命令模式：
  - `tcb fn deploy <函数名> --env-id <环境ID> --dir <函数目录>`
- 部署后再用 `tcb fn list` 验证状态

对小程序的启示：

- 云函数目录结构要尽量统一
- 每个函数目录只保留：
  - `index.js`
  - `package.json`
- 提前固定一套部署命令模板，避免每次重新摸索

### 3. `Cannot read properties of null (reading 'scope')`

现象：

- 点击“发送验证码”后，前端直接报：
  - `Cannot read properties of null (reading 'scope')`
- 云函数没有任何调用日志

根因：

- 这是 CloudBase Web SDK 在前端内部抛出的错误
- 请求还没真正打到云函数
- 触发原因有两类：
  1. 前端仍在走 CloudBase 官方 Auth 验证码链路
  2. `callFunction()` 前没有先建立可调用的登录态

中间踩过的坑：

- WorkBuddy 后续改动把 `cloud-tcb.js` 的一部分逻辑覆盖回旧状态
- `sendEmailCode()` 已经改成走云函数，但 `callFunction()` 又被改回直接调用，没有匿名登录兜底
- 一度还引入过递归调用，导致按钮点击后页面“卡死”

解决：

- 统一把 `sendEmailCode()` 改成调用自定义云函数
- 在 `callFunction()` 前强制执行 `ensureCallableAuth()`
- `ensureCallableAuth()` 负责：
  - 检查现有登录态
  - 无登录态时先匿名登录
- 修复 `getAuth()` 与 `ensureCallableAuth()` 之间的递归问题

对小程序的启示：

- 认证初始化必须统一收口
- 不要在多个地方各自直接调用 SDK 的登录相关方法
- 小程序后面也应保留一个统一的 `auth-service` 层

### 4. 免费套餐无法添加 Web 安全域名

现象：

- 在 CloudBase 控制台添加本地调试来源时失败
- 报错：
  - `OperationDenied.FreePackageDenied`

根因：

- 免费/体验版套餐限制了 `WEB 安全域名` 配置能力
- 自定义认证云函数通过 Web SDK 调用时，需要本地来源在安全来源中放行

解决：

- 升级到支持该能力的套餐
- 在 `环境管理 -> 跨域设置 / WEB 安全域名` 中加入：
  - `127.0.0.1:5173`
  - `localhost:5173`

对小程序的启示：

- 平台套餐能力会直接影响开发模式
- 小程序虽然不走浏览器来源校验，但未来如果要做 H5/管理后台，仍然会遇到相同问题

### 5. 云函数权限配置把匿名用户拦住了

现象：

- 点击发送验证码时，前端变成：
  - `PERMISSION_DENIED`

根因：

- 认证前置链路依赖匿名登录
- 但云函数权限规则写成了：

```json
{
  "*": {
    "invoke": "auth != null && auth.loginType != 'ANONYMOUS'"
  }
}
```

- 这会明确拒绝匿名用户调用

解决：

- 对“登录前就要调用”的函数，放开匿名登录态访问
- 适用函数：
  - `sendEmailCode`
  - `emailRegister`
  - `passwordLogin`
  - `resetPassword`
- 更合适的规则：

```json
{
  "*": {
    "invoke": "auth != null"
  }
}
```

对小程序的启示：

- 要提前区分：
  - 登录前函数
  - 登录后函数
- 不能一刀切地把匿名用户都拦掉

### 6. `email_codes` 集合不存在

现象：

- 发送验证码时报错：
  - `Db or Table not exist: email_codes`

根因：

- 自定义验证码方案已经切换到云函数
- 但数据库里还没有创建 `email_codes` 集合

解决：

- 在 CloudBase 文档型数据库中创建集合：
  - `email_codes`
- 权限选择：
  - `ADMINONLY`

对小程序的启示：

- 认证相关集合需要提前准备完整：
  - `users`
  - `email_codes`
  - `cloud_profiles`

### 7. QQ 邮箱 SMTP 配置失败

现象：

- 腾讯云控制台验证 SMTP 时失败
- 报错中包含：
  - `535 Login fail`

根因：

- 初始配置时，SMTP 用户名填错
- 还需要确保 QQ 邮箱本身开启了 SMTP/授权码

解决：

- 改为标准 QQ SMTP 参数：
  - `SMTP_HOST = smtp.qq.com`
  - `SMTP_PORT = 465`
  - `SMTP_USER = 完整邮箱地址`
  - `SMTP_PASS = QQ 邮箱授权码`
  - `FROM_NAME = 成绩雷达`

对小程序的启示：

- 后面若继续用自定义邮箱发信，建议统一抽成环境变量文档
- 最好不要长期依赖私人邮箱，后续应切到项目域名邮箱

### 8. CloudBase 内置邮箱验证码与自定义验证码链路混用

现象：

- 一部分代码走 CloudBase 官方邮箱验证码
- 一部分代码走自建 `email_codes`
- 行为不一致，且验证码有效期、复用方式不可控

根因：

- 两套认证方案同时存在
- “发送验证码”和“消费验证码”不是同一条链路

解决：

- 最终统一到自定义认证方案：
  - `sendEmailCode`
  - `emailRegister`
  - `passwordLogin`
  - `resetPassword`
- 不再依赖 CloudBase 官方邮箱验证码作为主登录方案

对小程序的启示：

- 认证方案必须尽量统一
- 小程序不要再走另一套完全不同的验证码体系

## 当前形成的可用架构

### 前端

- `src/cloud-tcb.js`
  - CloudBase 初始化
  - 匿名登录兜底
  - 调用认证云函数
  - 本地 token / user 管理

- `src/auth.js`
  - 认证中间层，给页面统一接口

- `src/login-ui.js`
  - 登录弹窗 UI
  - 验证码/密码模式切换

- `src/cloud-sync.js`
  - 云同步相关前端调用

### 云函数

- `sendEmailCode`
- `emailRegister`
- `passwordLogin`
- `resetPassword`
- `listCloudProfiles`
- `getCloudProfileData`
- `uploadCloudProfile`
- `deleteCloudProfiles`

### 数据集合

- `users`
- `email_codes`
- `cloud_profiles`

## 对小程序开发的准备建议

### 1. 继续保持“平台相关代码收口”

小程序开始前，建议延续当前思路：

- 认证相关统一走一层 service
- 云同步相关统一走一层 service
- 页面不直接调用底层平台 SDK

建议未来小程序也保留类似分层：

- `auth-service`
- `sync-service`
- `storage-service`

### 2. 小程序优先复用现有后端能力

后面小程序不要重新发明一套认证后端，优先复用：

- `sendEmailCode`
- `emailRegister`
- `passwordLogin`
- `resetPassword`
- `cloud_profiles`

这样 Web 和小程序才能共享同一套用户与云同步数据。

### 3. 早做账户体系稳定化

现在已经有一个比较清晰的方向：

- 邮箱 + 验证码
- 邮箱 + 密码
- 未来再补微信登录

后面小程序如果要接微信登录，建议做“账户绑定”，而不是另起一套用户体系。

### 4. 不要再让平台免费版能力成为核心阻塞

这轮最大的非代码问题，就是被套餐能力卡住。

后面小程序开发前，建议先确认：

- 当前套餐是否满足小程序登录方式
- 是否满足跨端用户体系
- 是否满足生产访问量和邮件/短信需求

### 5. 提前考虑未来迁移

如果后面决定从 CloudBase 迁到底层腾讯云：

- 当前分层已经有帮助
- 但还要继续减少页面对 CloudBase SDK 的直接依赖

目标应该是：

- 页面只认自己定义的接口
- 不认平台 SDK 细节

## 建议的下一步

1. 在 CloudBase 中补齐 `users` 集合规则与字段约定
2. 把当前 SMTP 发信账号视为过渡方案，后续切到项目域名邮箱
3. 为小程序整理一份单独的接入方案：
   - 登录流程
   - 账户绑定
   - 云同步复用
4. 对认证云函数增加限流、防刷和错误码统一
5. 对登录/注册/云同步再做一轮完整回归测试

## 一句话结论

这轮 Web 端迁移真正解决的，不只是“把功能跑通”，而是把成绩雷达后续跨端账号体系、云同步体系的第一版基础打好了。后面做小程序时，重点不是重写，而是复用并继续收口。

---

## 补充记录：线上后台 `Failed to fetch` 的真实根因

日期：2026-04-08

### 现象

- 本地 `http://127.0.0.1:5173/admin/` 暖心文案后台可用
- 线上 `https://chengjileida.cn/admin/` 打开后显示：
  - `Failed to fetch`
- 页面看起来像是“后台功能没迁移”或“云函数没部署”

### 根因

这次不是单点故障，而是三层问题叠加：

1. `getEncouragementCopy` / `manageEncouragementCopies` 最开始没有迁移到统一环境 `chengjiguanjia-1g1twvrkd736c880`
2. 迁移后，这两个函数最开始还没有兼容 HTTP 路由事件格式
3. 最终真正导致“本地能用、线上失败”的核心原因是：
   - CloudBase 环境安全域名里没有 `chengjileida.cn`
   - 浏览器从 `https://chengjileida.cn/admin/` 请求 `https://<env>.service.tcloudbase.com/...` 时被跨域拦截
   - 前端只表现成 `Failed to fetch`

### 解决步骤

1. 将以下函数迁移到统一环境：
   - `getEncouragementCopy`
   - `manageEncouragementCopies`
2. 在统一环境里创建集合：
   - `encouragement_copies`
3. 为两个函数补 HTTP 兼容：
   - `queryStringParameters`
   - `queryString`
   - `body`
   - `isBase64Encoded`
4. 将后台文案管理前端改为直接走已经验证可用的 HTTP 路由
5. 在 CloudBase 环境安全域名中加入：
   - `chengjileida.cn`

### 以后怎么排查

如果再出现“本地后台正常、线上后台 `Failed to fetch`”，按这个顺序查：

1. 函数是否已经部署到当前统一环境
2. 对应集合是否存在
3. 云函数是否兼容 HTTP 路由事件
4. CloudBase 安全域名里是否已经加入线上站点域名

### 结论

这类问题优先看 **跨域 / 安全域名**，不要先怀疑 UI。
