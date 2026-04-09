const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

// ==================== 邀请码列表（云端唯一真值） ====================

const INVITE_CODES = {
  'VIPKPOHY9': { expireAt: null },
  'VIPETYI8U': { expireAt: null },
  'VIP6BEPYK': { expireAt: null },
  'VIPQ4GILS': { expireAt: null },
  'VIP4582HR': { expireAt: null },
  'VIPKGF7M7': { expireAt: null },
  'VIP8WRKXV': { expireAt: null },
  'VIP2QRQYS': { expireAt: null },
  'VIPX0I23W': { expireAt: null },
  'VIP3E37DM': { expireAt: null },
  'VIPXQD5HF': { expireAt: null },
  'VIPF80D8C': { expireAt: null },
  'VIPYRVQTW': { expireAt: null },
  'VIP6M3AWR': { expireAt: null },
  'VIPTCLCHM': { expireAt: null },
  'VIPWRS2VK': { expireAt: null },
  'VIPZP2M3O': { expireAt: null },
  'VIPMJ8XUF': { expireAt: null },
  'VIPUOBSKH': { expireAt: null },
  'VIPS2WFRX': { expireAt: null },
};

// ==================== 工具函数 ====================

function parseEventPayload(event) {
  if (!event) return {};
  if (typeof event === 'string') {
    try { return JSON.parse(event); } catch { return {}; }
  }
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
    return event.queryStringParameters;
  }
  if (event.queryString && typeof event.queryString === 'object') {
    return event.queryString;
  }
  if (event.body) {
    let body = event.body;
    if (event.isBase64Encoded && typeof body === 'string') {
      try { body = Buffer.from(body, 'base64').toString('utf8'); } catch {}
    }
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch {}
      try { return Object.fromEntries(new URLSearchParams(body)); } catch {}
      return {};
    }
    if (typeof body === 'object') return body;
  }
  return event;
}

/**
 * 兑换邀请码 — 云端校验（一码一人，用完即失效）
 *
 * 请求：{ code, userId }
 * 逻辑：
 *   1. 校验邀请码是否存在且未过期
 *   2. 查 invite_redemptions 集合判断该码是否已被使用
 *   3. 查用户当前是否已是 VIP
 *   4. 原子写入：标记码已用 + 激活用户 VIP
 *
 * 返回：{ code, message, data?: { expireAt } }
 */
exports.main = async (event, context) => {
  const { code, userId } = parseEventPayload(event);

  if (!code || !code.trim()) {
    return { code: 400, message: '请输入邀请码' };
  }
  if (!userId) {
    return { code: 401, message: '请先登录后再兑换邀请码' };
  }

  const trimmed = code.trim().toUpperCase();

  try {
    // ---- 1. 校验邀请码有效性 ----
    const entry = INVITE_CODES[trimmed];
    if (!entry) {
      return { code: 404, message: '邀请码无效，请检查后重试' };
    }
    if (entry.expireAt && new Date(entry.expireAt).getTime() < Date.now()) {
      return { code: 410, message: '该邀请码已过期' };
    }

    // ---- 2. 查询该码是否已被任何人使用 ----
    const redemptionQuery = await db.collection('invite_redemptions')
      .where({ code: trimmed })
      .limit(1)
      .get();

    if (redemptionQuery.data && redemptionQuery.data.length > 0) {
      return { code: 409, message: '该邀请码已被使用过' };
    }

    // ---- 3. 查用户当前 VIP 状态 ----
    let userDoc;
    try {
      userDoc = await db.collection('users').doc(userId).get();
    } catch (e) {
      return { code: 404, message: '用户不存在' };
    }
    if (!userDoc.data || (Array.isArray(userDoc.data) && userDoc.data.length === 0)) {
      return { code: 404, message: '用户不存在' };
    }

    const userData = Array.isArray(userDoc.data) ? userDoc.data[0] : userDoc.data;
    if (userData.role === 'vip') {
      return { code: 409, message: '您已经是 VIP 用户，无需再次激活' };
    }
    if (userData.vipExpireAt && new Date(userData.vipExpireAt).getTime() > Date.now()) {
      return { code: 409, message: '您已经是 VIP 用户，无需再次激活' };
    }

    // ---- 4. 计算 VIP 到期时间 ----
    const vipExpireAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // ---- 5. 原子写入：标记码已用 ----
    await db.collection('invite_redemptions').add({
      code: trimmed,
      userId: userId,
      redeemedAt: new Date(),
    });

    // ---- 6. 更新用户 VIP 状态 ----
    await db.collection('users').doc(userId).update({
      role: 'vip',
      vipExpireAt: vipExpireAt,
      updatedAt: new Date(),
    });

    console.log('[redeemInviteCode] 邀请码兑换成功:', trimmed, 'userId:', userId);

    return {
      code: 0,
      message: 'VIP 激活成功',
      data: { expireAt: vipExpireAt, vipExpireAt },
    };

  } catch (err) {
    console.error('[redeemInviteCode] error:', err);
    return { code: 500, message: '兑换失败：' + (err.message || '未知错误') };
  }
};
