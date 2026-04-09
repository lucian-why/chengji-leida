const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

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
 * 更新用户 VIP 状态
 * 邀请码激活后调用，将 VIP 状态同步到云端
 *
 * 请求：{ userId, isVip, vipExpireAt }
 */
exports.main = async (event, context) => {
  let { userId, isVip, vipExpireAt } = parseEventPayload(event);

  if (!userId) {
    return { code: 400, message: '缺少用户ID' };
  }

  try {
    let userResult;
    try {
      userResult = await db.collection('users').doc(userId).get();
    } catch (e) {
      return { code: 404, message: '用户不存在' };
    }
    if (!userResult.data || (Array.isArray(userResult.data) && userResult.data.length === 0)) {
      return { code: 404, message: '用户不存在' };
    }

    const updateData = {
      updatedAt: new Date()
    };

    if (isVip) {
      updateData.role = 'vip';
      updateData.vipExpireAt = vipExpireAt || null;
    } else {
      updateData.role = '';
      updateData.vipExpireAt = null;
    }

    await db.collection('users').doc(userId).update(updateData);

    console.log('[updateVipStatus] VIP 状态已更新:', userId, 'isVip:', isVip);

    return {
      code: 0,
      message: 'VIP 状态更新成功',
      data: { isVip: !!isVip, vipExpireAt: vipExpireAt || null }
    };

  } catch (err) {
    console.error('[updateVipStatus] error:', err);
    return { code: 500, message: '更新失败：' + (err.message || '未知错误') };
  }
};
