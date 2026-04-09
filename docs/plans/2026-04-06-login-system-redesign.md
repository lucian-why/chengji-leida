# 登录系统改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录系统从"验证码优先"改为"密码优先"，支持手机号密码登录、自动注册跳转、昵称编辑、30天免登，去掉返回按钮。

**Architecture:** 纯前端改动（Vite + ES Module）+ 云端函数扩展。不引入新框架，遵循现有 cloud-tcb.js → auth.js → login-ui.js 三层架构。新增 phonePasswordLogin 和 phoneResetPassword 两个云函数，其余为前端重构。

**Tech Stack:** Vite 6, @cloudbase/js-sdk v2, 腾讯云 CloudBase 云函数 (Node.js), bcryptjs, localStorage

**Spec:** `artifact://2026-04-06-login-system-redesign-spec.md`

---

## Task 1: 去掉登录页「暂不登录」按钮

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/src/login-ui.js:108`

- [ ] **Step 1: 删除「暂不登录，返回页面」按钮**

找到第108行：
```html
<button id="loginCancelBtn" class="login-ghost-btn" type="button">暂不登录，返回页面</button>
```
整行删除。

- [ ] **Step 2: 删除对应的事件绑定**

在 `bindUiEvents()` 中（约第283行），删除：
```javascript
const cancelBtn = document.getElementById('loginCancelBtn');
```
以及：
```javascript
cancelBtn?.addEventListener('click', dismiss);
```

- [ ] **Step 3: 构建验证**

Run: `cd E:/成绩雷达/成绩雷达_web && npm run build`
Expected: 构建成功，零错误

---

## Task 2: 新增 phonePasswordLogin 云函数（手机号+密码登录）

**Files:**
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/phonePasswordLogin/index.js`
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/phonePasswordLogin/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "phonePasswordLogin",
  "version": "1.0.0",
  "description": "手机号+密码登录",
  "main": "index.js",
  "dependencies": {
    "@cloudbase/node-sdk": "^2.0.0",
    "bcryptjs": "^2.4.3"
  }
}
```

- [ ] **Step 2: 创建 index.js 主逻辑**

核心逻辑（参考现有的 passwordLogin/index.js）：

```javascript
const cloud = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

function generateToken(uid, identifier) {
  const tokenData = JSON.stringify({ uid, identifier, ts: Date.now() });
  return crypto.createHash('sha256').update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2026')).digest('hex');
}

async function findUserByPhone(phone) {
  const result = await db.collection('users').where({ phone }).limit(1).get();
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

async function updateLoginState(userId, loginMethod) {
  const tokenData = await db.collection('users').doc(userId).get();
  const user = tokenData.data;
  // 支持手机号或邮箱作为标识
  const identifier = user.phone || user.email;
  const token = generateToken(typeof userId === 'string' ? userId : userId.toString(), identifier);
  await db.collection('users').doc(userId).update({
    token,
    tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天
    lastLoginMethod: loginMethod,
    lastLoginAt: new Date(),
    loginCount: _.inc(1),
    updatedAt: new Date()
  });
  return token;
}

function buildUserResponse(user) {
  return {
    id: user._id,
    email: user.email || '',
    nickname: user.nickname || user.phone || '云端用户',
    avatarUrl: user.avatarUrl || null,
    hasWeixin: !!user.weixinOpenid,
    hasPhone: !!user.phone
  };
}

/**
 * 手机号 + 密码登录
 *
 * 请求：{ phone, password }
 *
 * 返回：
 *   - 200: 登录成功 { code:0, data:{ token, user } }
 *   - 401: 手机号或密码错误
 *   - 402: 该账号尚未设置密码，请使用验证码登录
 *   - 403: 账号已被禁用
 *   - 400: 参数错误
 */
exports.main = async (event, context) => {
  const { phone, password } = event;

  // 1. 参数校验
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!password || typeof password !== 'string') {
    return { code: 400, message: '请输入密码' };
  }

  try {
    // 2. 查找用户
    const existingUser = await findUserByPhone(phone);
    if (!existingUser) {
      // 关键区别于邮箱版：手机号不存在时提示需要注册，而不是统一报错
      // 前端收到此响应后切换到注册流程
      return { code: 404, registered: false, message: '该账号尚未注册' };
    }

    // 3. 检查是否设过密码
    if (!existingUser.passwordHash) {
      return { code: 402, message: '该账号尚未设置密码，请使用验证码登录' };
    }

    // 4. 检查账号状态
    if (existingUser.status === 'disabled' || existingUser.status === 'banned') {
      return { code: 403, message: '该账号已被禁用，请联系客服' };
    }

    // 5. 校验密码
    const isMatch = await bcrypt.compare(password, existingUser.passwordHash);
    if (!isMatch) {
      return { code: 401, message: '手机号或密码错误' };
    }

    // 6. 更新登录态（30天有效期）
    const token = await updateLoginState(existingUser._id, 'phone_password');

    console.log('[phonePasswordLogin] 密码登录:', phone);

    return {
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: buildUserResponse({ ...existingUser }),
        expiresIn: 2592000 // 30天（秒）
      }
    };

  } catch (err) {
    console.error('[phonePasswordLogin] error:', err);
    return { code: 500, message: '登录失败：' + (err.message || '未知错误') };
  }
};
```

**关键设计点：**
- 返回 `{ code: 404, registered: false }` 让前端知道该手机号未注册，触发自动跳转注册流程
- Token 有效期从 7 天改为 **30 天**
- `buildUserResponse` 的 nickname 回退值用 `user.phone` 而非 email（因为手机号用户可能没有 email）

---

## Task 3: 新增 phoneRegister 云函数（手机号+验证码+密码注册）

**Files:**
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/phoneRegister/index.js`
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/phoneRegister/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "phoneRegister",
  "version": "1.0.0",
  "description": "手机号验证码注册",
  "main": "index.js",
  "dependencies": {
    "@cloudbase/node-sdk": "^2.0.0",
    "bcryptjs": "^2.4.3"
  }
}
```

- [ ] **Step 2: 创建 index.js 主逻辑**

```javascript
const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

function generateToken(uid, identifier) {
  const tokenData = JSON.stringify({ uid, identifier, ts: Date.now() });
  return crypto.createHash('sha256').update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2026')).digest('hex');
}

async function updateLoginState(userId, loginMethod) {
  const tokenData = await db.collection('users').doc(userId).get();
  const user = tokenData.data;
  const identifier = user.phone || user.email;
  const token = generateToken(typeof userId === 'string' ? userId : userId.toString(), identifier);
  await db.collection('users').doc(userId).update({
    token,
    tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lastLoginMethod: loginMethod,
    lastLoginAt: new Date(),
    loginCount: _.inc(1),
    updatedAt: new Date()
  });
  return token;
}

async function consumeSmsCode(phone, code) {
  const result = await db.collection('sms_codes')
    .where({ phone, code, used: false, expireAt: _.gte(new Date()) })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (!result.data || result.data.length === 0) return null;
  await db.collection('sms_codes').doc(result.data[0]._id).update({ used: true, usedAt: new Date() });
  return result.data[0];
}

/**
 * 手机号 + 验证码 + 密码 注册
 *
 * 请求：{ phone, code, password }
 *
 * 返回：
 *   - 201: 注册成功 { code:0, data:{ token, user } }
 *   - 400: 参数错误
 *   - 401: 验证码错误或已过期
 *   - 409: 该手机号已注册
 */
exports.main = async (event, context) => {
  let { phone, code, password } = event;

  // 1. 参数校验
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { code: 400, message: '验证码格式不正确（需6位数字）' };
  }
  if (!password || typeof password !== 'string') {
    return { code: 400, message: '请设置密码' };
  }
  if (password.length < 6) {
    return { code: 400, message: '密码至少需要6个字符' };
  }

  try {
    // 2. 检查手机号是否已注册
    const existingUser = await db.collection('users').where({ phone }).limit(1).get();
    if (existingUser.data && existingUser.data.length > 0) {
      return { code: 409, message: '该手机号已注册，请直接登录' };
    }

    // 3. 校验并消费短信验证码
    const codeRecord = await consumeSmsCode(phone, code);
    if (!codeRecord) {
      return { code: 401, message: '验证码错误或已过期' };
    }

    // 4. 哈希密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 5. 创建用户
    const createResult = await db.collection('users').add({
      phone,
      phoneVerified: true,
      passwordHash,
      nickname: phone, // 默认昵称=手机号，后续可改
      avatarUrl: null,
      email: null,
      emailVerified: false,
      weixinOpenid: null,
      weixinUnionid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      loginCount: 1,
      status: 'active',
      profileCount: 0
    });

    const userId = createResult.id;

    // 6. 生成 token（30天）
    const token = await updateLoginState(userId, 'phone_register');

    console.log('[phoneRegister] 新用户注册:', phone);

    return {
      code: 0,
      message: '注册成功',
      data: {
        token,
        user: {
          id: userId,
          phone,
          nickname: phone,
          avatarUrl: null,
          hasWeixin: false,
          hasPhone: true
        },
        expiresIn: 2592000
      }
    };

  } catch (err) {
    console.error('[phoneRegister] error:', err);
    return { code: 500, message: '注册失败：' + (err.message || '未知错误') };
  }
};
```

---

## Task 4: 新增 phoneResetPassword 云函数（手机号找回密码）

**Files:**
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/phoneResetPassword/index.js`
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/phoneResetPassword/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "phoneResetPassword",
  "version": "1.0.0",
  "description": "手机号重置密码",
  "main": "index.js",
  "dependencies": {
    "@cloudbase/node-sdk": "^2.0.0",
    "bcryptjs": "^2.4.3"
  }
}
```

- [ ] **Step 2: 创建 index.js 主逻辑**

```javascript
const cloud = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

function generateToken(uid, identifier) {
  const tokenData = JSON.stringify({ uid, identifier, ts: Date.now() });
  return crypto.createHash('sha256').update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2026')).digest('hex');
}

async function consumeSmsCode(phone, code) {
  const result = await db.collection('sms_codes')
    .where({ phone, code, used: false, expireAt: _.gte(new Date()) })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (!result.data || result.data.length === 0) return null;
  await db.collection('sms_codes').doc(result.data[0]._id).update({ used: true, usedAt: new Date() });
  return result.data[0];
}

async function updateLoginState(userId, loginMethod) {
  const tokenData = await db.collection('users').doc(userId).get();
  const user = tokenData.data;
  const identifier = user.phone || user.email;
  const token = generateToken(typeof userId === 'string' ? userId : userId.toString(), identifier);
  await db.collection('users').doc(userId).update({
    token,
    tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lastLoginMethod: loginMethod,
    lastLoginAt: new Date(),
    loginCount: _.inc(1),
    updatedAt: new Date()
  });
  return token;
}

function buildUserResponse(user) {
  return {
    id: user._id,
    email: user.email || '',
    nickname: user.nickname || user.phone || '云端用户',
    avatarUrl: user.avatarUrl || null,
    hasWeixin: !!user.weixinOpenid,
    hasPhone: !!user.phone
  };
}

/**
 * 手机号 + 验证码 + 新密码 → 重置密码
 *
 * 请求：{ phone, code, newPassword }
 *
 * 返回：
 *   - 200: 重置成功 { code:0, data:{ token, user } }
 *   - 400: 参数错误
 *   - 401: 验证码错误或已过期
 *   - 404: 该手机号未注册
 */
exports.main = async (event, context) => {
  let { phone, code, newPassword } = event;

  // 1. 参数校验
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { code: 400, message: '验证码格式不正确（需6位数字）' };
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return { code: 400, message: '请设置新密码' };
  }
  if (newPassword.length < 6) {
    return { code: 400, message: '密码至少需要6个字符' };
  }

  try {
    // 2. 查找用户
    const existingUser = await db.collection('users').where({ phone }).limit(1).get();
    if (!existingUser.data || existingUser.data.length === 0) {
      return { code: 404, message: '该手机号未注册' };
    }

    // 3. 校验并消费验证码
    const codeRecord = await consumeSmsCode(phone, code);
    if (!codeRecord) {
      return { code: 401, message: '验证码错误或已过期' };
    }

    // 4. 哈希新密码
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 5. 更新密码
    await db.collection('users').doc(existingUser.data[0]._id).update({
      passwordHash,
      updatedAt: new Date()
    });

    // 6. 重置后自动登录（生成新 token，30天）
    const token = await updateLoginState(existingUser.data[0]._id, 'phone_password_reset');

    console.log('[phoneResetPassword] 密码重置成功:', phone);

    return {
      code: 0,
      message: '密码重置成功',
      data: {
        token,
        user: buildUserResponse({ ...existingUser.data[0] }),
        expiresIn: 2592000
      }
    };

  } catch (err) {
    console.error('[phoneResetPassword] error:', err);
    return { code: 500, message: '重置失败：' + (err.message || '未知错误') };
  }
};
```

---

## Task 5: 更新现有云函数 Token 有效期为 30 天

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/cloud-functions/emailRegister/index.js:31`
- Modify: `E:/成绩雷达/成绩雷达_web/cloud-functions/passwordLogin/index.js:28`
- Modify: `E:/成绩雷达/成绩雷达_web/cloud-functions/resetPassword/index.js:37`
- Modify: `E:/成绩雷达/成绩雷达_web/cloud-functions/emailLogin/index.js:39`
- Modify: `E:/成绩雷达/成绩雷达_web/cloud-functions/phoneLogin/index.js:89`

- [ ] **Step 1: 批量替换所有云函数中的 token 有效期**

每个文件中的 `tokenExpireAt` 行将 `7 * 24 * 60 * 60 * 1000` 替换为 `30 * 24 * 60 * 60 * 1000`。

具体文件和行号：
- `emailRegister/index.js:31`: `7 * 24 * 60 * 60 * 1000` → `30 * 24 * 60 * 60 * 1000`
- `passwordLogin/index.js:28`: 同上
- `resetPassword/index.js:37`: 同上
- `emailLogin/index.js:39`: 同上
- `phoneLogin/index.js:89`: 同上

同时将所有 `expiresIn: 604800`（7天的秒数）改为 `expiresIn: 2592000`（30天的秒数）。

---

## Task 6: 更新 cloud-tcb.js — 新增手机号密码相关函数

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/src/cloud-tcb.js`

- [ ] **Step 1: 新增 normalizePhone 函数（已有，确认存在）**

确认 `normalizePhone()` 在约第68行已存在。如果不存在则添加。

- [ ] **Step 2: 新增 phonePasswordLogin 函数**

在 `passwordLogin` 函数之后添加：

```javascript
/**
 * 用手机号 + 密码登录（不需要验证码）
 *
 * @param {string} phone — 手机号（11位）
 * @param {string} password — 密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phonePasswordLogin(phone, password) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPassword = normalizePassword(password);

    try {
        const result = await callFunction('phonePasswordLogin', {
            phone: normalizedPhone,
            password: normalizedPassword
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error(result.message || '手机号或密码错误');
                case 402: throw new Error(result.message || '该账号尚未设置密码，请使用验证码登录');
                case 403: throw new Error(result.message || '该账号已被禁用');
                case 404:
                    // 未注册 —— 返回特殊标记让前端处理
                    const err = new Error(result.message || '该账号尚未注册');
                    err.code = 'NOT_REGISTERED';
                    err.registered = false;
                    throw err;
                default: throw new Error(result.message || '登录失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 手机号密码登录成功:', normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '手机号密码登录失败');
    }
}
```

- [ ] **Step 3: 新增 phoneRegister 函数**

```javascript
/**
 * 用手机号 + 验证码 + 密码 注册
 *
 * @param {string} phone — 手机号（11位）
 * @param {string} code — 6位验证码
 * @param {string} password — 要设置的密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phoneRegister(phone, code, password) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedCode = normalizeCode(code);
    const normalizedPassword = normalizePassword(password);

    try {
        const result = await callFunction('phoneRegister', {
            phone: normalizedPhone,
            code: normalizedCode,
            password: normalizedPassword
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('验证码错误或已过期，请重新发送');
                case 409: throw new Error(result.message || '该手机号已注册，请直接登录');
                default: throw new Error(result.message || '注册失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 手机号注册成功:', normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '注册操作失败');
    }
}
```

- [ ] **Step 4: 新增 phoneResetPassword 函数**

```javascript
/**
 * 通过手机号 + 验证码重置密码
 *
 * @param {string} phone — 手机号
 * @param {string} code — 6位验证码
 * @param {string} newPassword — 新密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phoneResetPassword(phone, code, newPassword) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedCode = normalizeCode(code);
    const normalizedPassword = normalizePassword(newPassword);

    try {
        const result = await callFunction('phoneResetPassword', {
            phone: normalizedPhone,
            code: normalizedCode,
            newPassword: normalizedPassword
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('验证码错误或已过期');
                case 404: throw new Error(result.message || '该手机号未注册');
                default: throw new Error(result.message || '重置失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 手机号密码重置成功:', normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '密码重置失败');
    }
}
```

- [ ] **Step 5: 更新 mapCloudUser 支持 phone 作为 nickname 回退值**

确认 `mapCloudUser` 函数（约第89行）nickname 行为：
```javascript
nickname: user.nickname || user.email?.split('@')[0] || user.phone || '云端用户',
```
确保当用户无 email 但有 phone 时也能显示合理的默认昵称。

---

## Task 7: 更新 auth.js — 导出新函数

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/src/auth.js`

- [ ] **Step 1: 在 import 中新增函数引用**

在 import 块中追加：
```javascript
import {
    // ... 现有 imports ...
    phonePasswordLogin as tcbPhonePasswordLogin,
    phoneRegister as tcbPhoneRegister,
    phoneResetPassword as tcbPhoneResetPassword
} from './cloud-tcb.js';
```

- [ ] **Step 2: 新增三个导出函数**

在 `smsLogin` 函数之后添加：

```javascript
/**
 * 手机号密码登录
 * @param {string} phone — 手机号
 * @param {string} password — 密码
 */
export async function phonePasswordLogin(phone, password) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhonePasswordLogin(phone, password);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 手机号验证码注册（带密码设置）
 * @param {string} phone — 手机号
 * @param {string} code — 验证码
 * @param {string} password — 要设置的密码
 */
export async function phoneRegisterFn(phone, code, password) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhoneRegister(phone, code, password);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 手机号重置密码
 * @param {string} phone — 手机号
 * @param {string} code — 验证码
 * @param {string} newPassword — 新密码
 */
export async function phoneResetPasswordFn(phone, code, newPassword) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhoneResetPassword(phone, code, newPassword);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}
```

> 注意：`phoneRegister` 与已有的 `phoneLogin` 区分——前者是注册（必带密码），后者是纯验证码登录（老用户快速进站）。

---

## Task 8: 重构 login-ui.js — 核心UI改造

这是最大的改动任务。目标：将登录页从"验证码默认"改为"密码默认"，支持手机号三种模式的流畅切换。

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/src/login-ui.js`

### 当前 UI 结构回顾
```
默认：账号输入框 + 验证码区域 + 可选密码 + [验证码登录]
备选：「或使用密码登录」→ 切换到密码区域 + [密码登录]
底部：「暂不登录，返回页面」❌ 要删掉
```

### 目标 UI 结构
```
默认：手机号/邮箱输入框 + 密码区域 + [登录]
     ↓ 输入手机号+密码点登录
     ├─ 已注册+有密码 → 登录成功 ✅
     └─ 未注册（404）→ 自动切到注册面板（验证码+确认密码）

底部：「📨 验证码登录」链接（独立入口）
底部：「忘记密码？」链接（独立入口）
```

- [ ] **Step 1: 重构 HTML 模板（ensureLoginUi 内的 innerHTML）**

新的 DOM 结构：

```html
<div class="login-card">
    <button type="button" class="login-close-btn" id="loginCloseBtn" aria-label="关闭">×</button>
    <div class="login-logo">成绩雷达</div>
    <p class="login-subtitle">登录后可启用云端备份与多端同步</p>

    <div class="login-form">
        <!-- 统一账号输入框 -->
        <label class="login-label" id="loginAccountLabel" for="loginAccountInput">邮箱 / 手机号</label>
        <input id="loginAccountInput" class="login-input" type="text"
               placeholder="请输入邮箱或手机号" maxlength="100" autocomplete="username" />

        <!-- 密码区域（默认展示） -->
        <div id="passwordModeSection">
            <label class="login-label" for="loginPwdInput">密码</label>
            <input id="loginPwdInput" class="login-input" type="password"
                   placeholder="请输入登录密码" maxlength="64" autocomplete="current-password" />
        </div>

        <!-- 验证码区域（注册时展示 / 验证码登录模式展示） -->
        <div id="codeModeSection" style="display:none;">
            <label class="login-label" for="loginCodeInput">验证码</label>
            <div class="login-inline-row">
                <input id="loginCodeInput" class="login-input" type="text"
                       inputmode="numeric" placeholder="请输入 6 位验证码" maxlength="6" />
                <button id="sendCodeBtn" class="login-secondary-btn" type="button">发送验证码</button>
            </div>

            <!-- 确认密码（仅注册模式显示） -->
            <div id="registerConfirmPwdSection" style="display:none; margin-top:8px;">
                <label class="login-label" for="loginConfirmPwdInput">
                    确认密码 <span style="font-weight:400;font-size:0.8em;color:#9ca3af;">(必填)</span>
                </label>
                <input id="loginConfirmPwdInput" class="login-input" type="password"
                       placeholder="再次输入密码" maxlength="64" autocomplete="new-password" />
            </div>
        </div>

        <!-- 模式切换提示 -->
        <div id="modeSwitchHint" style="display:none; margin-top:8px; font-size:0.85rem; color:#e8a87c; text-align:center;"></div>

        <button id="loginSubmitBtn" class="login-primary-btn" type="button">
            <span id="submitBtnText">登 录</span>
        </button>

        <!-- 底部辅助操作 -->
        <div class="login-footer-links">
            <a href="javascript:void(0)" id="smsLoginLink" class="login-link">📨 验证码登录</a>
            <a href="javascript:void(0)" id="forgotPwdLink" class="login-link" style="display:none;">忘记密码？</a>
        </div>

        <!-- 找回密码面板（默认隐藏） -->
        <div id="resetPwdPanel" style="display:none;">
            <div style="border-top:1px solid #e8e4de; padding-top:16px; margin-top:12px;">
                <div style="font-weight:600; font-size:0.95rem; margin-bottom:12px;">找回密码</div>
                <label class="login-label" for="resetPwdPhone">手机号</label>
                <input id="resetPwdPhone" class="login-input" type="tel" placeholder="请输入注册手机号" maxlength="11" />
                
                <label class="login-label" for="resetPwdCode" style="margin-top:8px;">验证码</label>
                <div class="login-inline-row">
                    <input id="resetPwdCode" class="login-input" type="text" inputmode="numeric" placeholder="6位验证码" maxlength="6" />
                    <button id="resetSendCodeBtn" class="login-secondary-btn" type="button">发送验证码</button>
                </div>
                
                <label class="login-label" for="resetNewPwd" style="margin-top:8px;">新密码</label>
                <input id="resetNewPwd" class="login-input" type="password" placeholder="至少6位" maxlength="64" />
                
                <label class="login-label" for="resetConfirmPwd" style="margin-top:8px;">确认新密码</label>
                <input id="resetConfirmPwd" class="login-input" type="password" placeholder="再次输入" maxlength="64" />
                
                <button id="resetSubmitBtn" class="login-primary-btn" type="button" style="margin-top:12px;">确认重置</button>
                <a href="javascript:void(0)" id="backToLoginLink" class="login-link" style="display:inline-block; margin-top:8px;">← 返回登录</a>
            </div>
        </div>

        <div id="loginStatus" class="login-status"></div>
    </div>
</div>
```

- [ ] **Step 2: 新增 UI 状态变量**

```javascript
/** 
 * 登录子状态：'login'(默认) | 'register'(注册) | 'resetpwd'(找回密码) | 'sms_login'(验证码登录)
 */
let loginSubMode = 'login';
```

- [ ] **Step 3: 重构 switchLoginMode 函数**

支持四种状态切换：

```javascript
function switchLoginMode(mode, subMode) {
    currentMode = mode; // 'password' | 'code'
    loginSubMode = subMode || 'login';

    const pwdSection = document.getElementById('passwordModeSection');
    const codeSection = document.getElementById('codeModeSection');
    const regConfirmPwd = document.getElementById('registerConfirmPwdSection');
    const switchHint = document.getElementById('modeSwitchHint');
    const submitText = document.getElementById('submitBtnText');
    const smsLink = document.getElementById('smsLoginLink');
    const forgotLink = document.getElementById('forgotPwdLink');
    const resetPanel = document.getElementById('resetPwdPanel');
    const mainForm = resetPanel?.previousElementSibling; // 找到主表单区域

    // 先隐藏找回密码面板
    if (resetPanel) resetPanel.style.display = 'none';

    if (subMode === 'resetpwd') {
        // 找回密码模式
        if (resetPanel) resetPanel.style.display = '';
        if (mainForm) mainForm.style.display = 'none';
        submitText.textContent = '';
        setStatus('');
        return;
    }

    // 显示主表单
    if (mainForm) mainForm.style.display = '';

    if (subMode === 'register') {
        // 注册模式：显示验证码 + 确认密码
        pwdSection.style.display = 'none';
        codeSection.style.display = '';
        regConfirmPwd.style.display = '';
        switchHint.textContent = '检测到该账号尚未注册，请完成验证码注册';
        switchHint.style.display = '';
        submitText.textContent = '注 册';
        smsLink.style.display = '';
        forgotLink.style.display = 'none';
    } else if (mode === 'code' && subMode === 'sms_login') {
        // 验证码登录模式
        pwdSection.style.display = 'none';
        codeSection.style.display = '';
        regConfirmPwd.style.display = 'none';
        switchHint.style.display = 'none';
        submitText.textContent = '验证码登录';
        smsLink.style.display = 'none';
        forgotLink.style.display = 'none';
    } else {
        // 默认密码登录模式
        pwdSection.style.display = '';
        codeSection.style.display = 'none';
        regConfirmPwd.style.display = 'none';
        switchHint.style.display = 'none';
        submitText.textContent = '登 录';
        smsLink.style.display = '';
        forgotLink.style.display = 'none'; // 手机号模式才显示
    }

    setStatus('');
}
```

- [ ] **Step 4: 重写 handleLogin 函数**

支持多种分支：

```javascript
async function handleLogin() {
    const account = (document.getElementById('loginAccountInput')?.value || '').trim();
    const inputType = detectInputType(account);

    // 输入校验
    if (inputType === 'unknown') {
        setStatus('请输入正确的邮箱地址或手机号', 'error');
        return;
    }

    try {
        if (loginSubMode === 'register') {
            // ---- 注册模式：验证码 + 密码 ----
            await handleRegister(account, inputType);
        } else if (currentMode === 'code' || loginSubMode === 'sms_login') {
            // ---- 验证码登录模式 ----
            await handleCodeLogin(account, inputType);
        } else {
            // ---- 默认密码登录模式 ----
            await handlePasswordLogin(account, inputType);
        }
    } catch (error) {
        // 处理 NOT_REGISTERED 特殊错误 → 自动切到注册模式
        if (error.code === 'NOT_REGISTERED' || error.registered === false) {
            setStatus('该账号尚未注册，请完成下方注册', 'info');
            // 自动切换到注册模式
            switchLoginMode('code', 'register');
            // 把手机号填回去，预填密码
            const codeInput = document.getElementById('loginCodeInput');
            if (codeInput) codeInput.focus();
            return;
        }
        setStatus(error.message || '登录失败，请稍后重试。', 'error');
    }
}

async function handlePasswordLogin(account, inputType) {
    const pwd = (document.getElementById('loginPwdInput')?.value || '').trim();
    
    if (!pwd) {
        setStatus('请输入密码', 'error');
        return;
    }

    if (inputType === 'phone') {
        // 手机号密码登录（新功能）
        setStatus('正在登录…', 'pending');
        const result = await phonePasswordLogin(account, pwd);
        setStatus('✅ 登录成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    } else {
        // 邮箱密码登录（原有功能）
        setStatus('正在登录…', 'pending');
        const result = await passwordLogin(account, pwd);
        setStatus('✅ 登录成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    }
}

async function handleCodeLogin(account, inputType) {
    const code = (document.getElementById('loginCodeInput')?.value || '').trim();
    
    if (!code || !/^\d{6}$/.test(code)) {
        setStatus('请输入6位验证码', 'error');
        return;
    }

    setStatus('正在登录…', 'pending');
    let result;
    
    if (inputType === 'phone') {
        result = await smsLogin(account, code);
    } else {
        const optionalPwd = (document.getElementById('loginOptionalPwdInput')?.value || '').trim();
        result = await emailCodeLogin(account, code, optionalPwd || undefined);
    }
    
    setStatus('✅ 登录成功，正在进入…', 'success');
    if (onLoginSuccess) await onLoginSuccess(result?.user || null);
}

async function handleRegister(account, inputType) {
    const code = (document.getElementById('loginCodeInput')?.value || '').trim();
    const pwd = (document.getElementById('loginPwdInput')?.value || '').trim();  // 注册时的密码
    const confirmPwd = (document.getElementById('loginConfirmPwdInput')?.value || '').trim();

    if (!code || !/^\d{6}$/.test(code)) {
        setStatus('请输入6位验证码', 'error');
        return;
    }
    if (!pwd || pwd.length < 6) {
        setStatus('请设置至少6位的密码', 'error');
        return;
    }
    if (pwd !== confirmPwd) {
        setStatus('两次输入的密码不一致', 'error');
        return;
    }

    setStatus('正在注册…', 'pending');
    
    if (inputType === 'phone') {
        const result = await phoneRegisterFn(account, code, pwd);
        setStatus('✅ 注册成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    } else {
        // 邮箱注册走原有的 emailCodeLogin（带密码参数）
        const result = await emailCodeLogin(account, code, pwd);
        setStatus('✅ 注册成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    }
}
```

- [ ] **Step 5: 新增找回密码处理逻辑**

```javascript
async function handleResetPassword() {
    const phone = (document.getElementById('resetPwdPhone')?.value || '').trim();
    const code = (document.getElementById('resetPwdCode')?.value || '').trim();
    const newPwd = (document.getElementById('resetNewPwd')?.value || '').trim();
    const confirmPwd = (document.getElementById('resetConfirmPwd')?.value || '').trim();

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        setStatus('请输入正确的手机号', 'error'); return;
    }
    if (!/^\d{6}$/.test(code)) {
        setStatus('请输入6位验证码', 'error'); return;
    }
    if (newPwd.length < 6) {
        setStatus('密码至少需要6个字符', 'error'); return;
    }
    if (newPwd !== confirmPwd) {
        setStatus('两次输入的密码不一致', 'error'); return;
    }

    try {
        setStatus('正在重置…', 'pending');
        const result = await phoneResetPasswordFn(phone, code, newPwd);
        setStatus('✅ 密码重置成功', 'success');
        // 延迟一下切回登录
        setTimeout(() => {
            switchLoginMode('password', 'login');
            showTransientToast('密码已重置，请使用新密码登录');
        }, 1500);
    } catch (error) {
        setStatus(error.message || '重置失败', 'error');
    }
}
```

- [ ] **Step 6: 更新事件绑定**

新增/修改以下绑定：
- `smsLoginLink` 点击 → `switchLoginMode('code', 'sms_login')`
- `forgotPwdLink` 点击 → `switchLoginMode('password', 'resetpwd')`（仅手机号模式显示）
- `backToLoginLink` 点击 → `switchLoginMode('password', 'login')`
- `resetSendCodeBtn` 点击 → 发送手机验证码（复用 sendSmsCode）
- `resetSubmitBtn` 点击 → `handleResetPassword()`
- 手机号输入时显示「忘记密码」链接，邮箱时隐藏

更新 `accountInput` input 事件：手机号模式时显示 forgotPwdLink

- [ ] **Step 7: 更新 import**

顶部 import 新增：
```javascript
import { sendEmailCode, sendSmsCode, emailCodeLogin, smsLogin, passwordLogin,
         phonePasswordLogin, phoneRegisterFn, phoneResetPasswordFn } from './auth.js';
```

- [ ] **Step 8: 更新 showLoginPage 默认模式**

```javascript
export function showLoginPage(message = '') {
    // ...
    // 默认使用密码模式（而非验证码）
    switchLoginMode('password', 'login');
    // ...
}
```

---

## Task 9: 昵称点击编辑功能

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/src/login-ui.js`
- Modify: `E:/成绩雷达/成绩雷达_web/src/auth.js`
- Modify: `E:/成绩雷达/成绩雷达_web/src/cloud-tcb.js`

- [ ] **Step 1: 在 cloud-tcb.js 新增 updateNickname 函数**

```javascript
/**
 * 更新用户昵称
 */
export async function updateNickname(userId, nickname) {
    if (!userId || !nickname) throw new Error('参数不完整');
    if (typeof nickname !== 'string' || nickname.length > 50) {
        throw new Error('昵称长度不能超过50个字符');
    }

    try {
        const result = await callFunction('updateNickname', { userId, nickname });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '昵称格式不正确');
                case 401: throw new Error('请重新登录后再试');
                default: throw new Error(result.message || '更新失败');
            }
        }

        // 更新本地缓存的用户数据
        const storedUser = getStoredUser();
        if (storedUser) {
            storedUser.nickname = nickname;
            saveAuthSession({ user: storedUser });
        }

        console.log('[cloud-tcb] 昵称已更新:', nickname);
        return result.data;
    } catch (error) {
        throw buildError(error, '昵称更新失败');
    }
}
```

- [ ] **Step 2: 在 auth.js 导出 updateNickname**

```javascript
import { updateNickname as tcbUpdateNickname } from './cloud-tcb.js';

// ...
export async function updateNickname(userId, nickname) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await tcbUpdateNickname(userId, nickname);
}
```

- [ ] **Step 3: 在 login-ui.js 的 renderAuthStatus 中给昵称加点击事件**

修改 `renderAuthStatus` 函数，使昵称可点击：

```javascript
export function renderAuthStatus(user) {
    ensureLoginUi();
    const authBar = document.getElementById('authStatusBar');
    const value = document.getElementById('authStatusValue');
    
    const displayText = user?.nickname || user?.email || user?.phone || '已登录';
    if (value) {
        value.textContent = displayText;
        // 添加点击编辑样式
        value.style.cursor = 'pointer';
        value.title = '点击修改昵称';
        
        // 清除旧监听器（简化：用 onclick 替代 addEventListener 避免重复绑定）
        value.onclick = () => openNicknameEditor(user, displayText);
    }
    authBar?.classList.remove('hidden');
}

function openNicknameEditor(user, currentNickname) {
    const authBar = document.getElementById('authStatusBar');
    if (!authBar) return;

    // 查找或创建编辑弹窗
    let editor = document.getElementById('nicknameEditor');
    if (!editor) {
        editor = document.createElement('div');
        editor.id = 'nicknameEditor';
        editor.innerHTML = `
            <div class="nickname-editor-overlay" id="nicknameOverlay" style="
                position:fixed; top:0; left:0; right:0; bottom:0; z-index:99998;
                background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;
            ">
                <div class="nickname-editor-card" style="
                    background:#fff; border-radius:12px; padding:20px; width:320px; max-width:90vw;
                    box-shadow:0 8px 32px rgba(0,0,0,0.15); position:relative; z-index:99999;
                ">
                    <div style="font-weight:600; font-size:1rem; margin-bottom:12px;">✏️ 修改显示昵称</div>
                    <input id="nicknameInputField" type="text" maxlength="20" 
                           style="width:100%; padding:10px 12px; border:1px solid #e8e4de; border-radius:8px;
                                  font-size:14px; box-sizing:border-box; outline:none;"
                           placeholder="输入新昵称" value="${currentNickname || ''}" />
                    <div style="display:flex; gap:8px; margin-top:16px;">
                        <button id="nicknameCancelBtn" type="button" style="
                            flex:1; padding:8px; border:1px solid #e8e4de; border-radius:8px;
                            background:#fff; cursor:pointer; font-size:14px;
                        ">取消</button>
                        <button id="nicknameSaveBtn" type="button" style="
                            flex:1; padding:8px; border:none; border-radius:8px;
                            background:#4f46e5; color:#fff; cursor:pointer; font-size:14px;
                        ">保存</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(editor);
    } else {
        editor.style.display = '';
        document.getElementById('nicknameInputField').value = currentNickname || '';
    }

    // 绑定事件
    const overlay = document.getElementById('nicknameOverlay');
    const input = document.getElementById('nicknameInputField');
    const cancelBtn = document.getElementById('nicknameCancelBtn');
    const saveBtn = document.getElementById('nicknameSaveBtn');

    const close = () => { editor.style.display = 'none'; };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    cancelBtn.onclick = close;
    input?.focus();

    saveBtn.onclick = async () => {
        const newName = (input?.value || '').trim();
        if (!newName) {
            input.style.borderColor = '#ef4444';
            return;
        }
        
        try {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中…';
            
            await updateNickname(user.id, newName);
            close();
            // 刷新显示
            if (user) user.nickname = newName;
            renderAuthStatus(user);
            showTransientToast('昵称已更新 ✓');
        } catch (err) {
            showTransientToast(err.message || '保存失败');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
    };

    // ESC 关闭
    const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }};
    document.addEventListener('keydown', escHandler);
}
```

---

## Task 10: 新增 updateNickname 云函数

**Files:**
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/updateNickname/index.js`
- Create: `E:/成绩雷达/成绩雷达_web/cloud-functions/updateNickname/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "updateNickname",
  "version": "1.0.0",
  "description": "更新用户昵称",
  "main": "index.js",
  "dependencies": {
    "@cloudbase/node-sdk": "^2.0.0"
  }
}
```

- [ ] **Step 2: 创建 index.js**

```javascript
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

/**
 * 更新用户昵称
 *
 * 请求：{ userId, nickname }
 */
exports.main = async (event, context) => {
  let { userId, nickname } = event;

  if (!userId || !nickname) {
    return { code: 400, message: '参数不完整' };
  }
  if (typeof nickname !== 'string' || nickname.length > 50 || nickname.length === 0) {
    return { code: 400, message: '昵称长度需要在1-50个字符之间' };
  }
  // 简单的昵称安全过滤
  if (/[<>\"'&]/.test(nickname)) {
    return { code: 400, message: '昵称包含非法字符' };
  }

  try {
    // 验证用户存在
    const userResult = await db.collection('users').doc(userId).get();
    if (!userResult.data) {
      return { code: 404, message: '用户不存在' };
    }

    await db.collection('users').doc(userId).update({
      nickname,
      updatedAt: new Date()
    });

    console.log('[updateNickname] 用户昵称已更新:', userId, '->', nickname);

    return {
      code: 0,
      message: '昵称更新成功',
      data: { nickname }
    };

  } catch (err) {
    console.error('[updateNickname] error:', err);
    return { code: 500, message: '更新失败：' + (err.message || '未知错误') };
  }
};
```

---

## Task 11: 样式补充

**Files:**
- Modify: `E:/成绩雷达/成绩雷达_web/src/styles.css`

- [ ] **Step 1: 新增样式规则**

在 styles.css 末尾（或登录相关样式区块）追加：

```css
/* ===== 登录页改造新增样式 ===== */

/* 底部辅助链接区域 */
.login-footer-links {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
}

.login-link {
    color: #7ca9c9;
    text-decoration: none;
    font-size: 0.85rem;
    cursor: pointer;
    transition: color 0.2s;
}

.login-link:hover {
    color: #4f46e5;
    text-decoration: underline;
}

/* 模式切换提示文字 */
#modeSwitchHint {
    animation: fadeSlideIn 0.3s ease-out;
}

@keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
}

/* 昵称显示区域的 hover 效果 */
#authStatusValue:hover {
    background: rgba(74, 70, 229, 0.08);
    border-radius: 4px;
    transition: background 0.2s;
}
```

---

## Task 12: 构建验证与测试

- [ ] **Step 1: Vite 构建**

```bash
cd E:/成绩雷达/成绩雷达_web && npm run build
```

Expected: 零错误，输出到 `dist/index.html`（单文件 ~850KB 左右）

- [ ] **Step 2: 功能检查清单**

| 检查项 | 预期 |
|--------|------|
| 打开登录页 | 默认显示密码输入框（不是验证码） |
| 「暂不登录」按钮 | 不再出现 |
| 输入手机号+不存在的密码点登录 | 提示"该账号尚未注册"，自动展开注册面板 |
| 注册面板 | 有验证码输入、确认密码 |
| 「📨 验证码登录」链接 | 可点击，切换到纯验证码模式 |
| 手机号模式下 | 出现「忘记密码？」链接 |
| 忘记密码面板 | 可发验证码+设新密码 |
| 登录后右上角昵称 | 可点击弹出编辑框 |
| 改昵称保存 | 即时刷新显示 |
| 关闭浏览器重新打开 | 30天内自动免登 |

- [ ] **Step 3: 部署云函数**

需要将新建的4个云函数部署到腾讯云 CloudBase：
- `phonePasswordLogin`
- `phoneRegister`
- `phoneResetPassword`
- `updateNickname`

以及修改了 Token 有效期的旧函数也需要重新部署：
- `emailRegister`
- `passwordLogin`
- `resetPassword`
- `emailLogin`
- `phoneLogin`

---

## 实施顺序总结

| 序号 | 任务 | 类型 | 依赖 |
|------|------|------|------|
| 1 | 去掉返回按钮 | 前端 | 无 |
| 2 | phonePasswordLogin 云函数 | 后端 | 无 |
| 3 | phoneRegister 云函数 | 后端 | 无 |
| 4 | phoneResetPassword 云函数 | 后端 | 无 |
| 5 | 更新旧云函数 Token 30天 | 后端 | 无 |
| 6 | cloud-tcb.js 新增函数 | 前端 | Task 2-4 |
| 7 | auth.js 导出新函数 | 前端 | Task 6 |
| 8 | login-ui.js 重构（最大改动） | 前端 | Task 7 |
| 9 | 昵称编辑功能 | 前后端 | Task 8 |
| 10 | updateNickname 云函数 | 后端 | 无 |
| 11 | CSS 样式补充 | 前端 | Task 8 |
| 12 | 构建验证与部署 | 全部 | 所有前置 |

**建议执行方式**：Task 1-5 可以并行（都是独立的新建/小改），Task 6-11 顺序依赖，Task 12 最后做。
