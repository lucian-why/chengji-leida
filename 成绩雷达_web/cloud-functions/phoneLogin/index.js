const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;

exports.main = async (event) => {
  const { phone, code, verified } = parseEventPayload(event);

  if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!verified && (!code || !/^\d{6}$/.test(String(code)))) {
    return { code: 400, message: '验证码格式不正确' };
  }

  try {
    if (!verified) {
      const codeRecord = await db.collection('sms_codes')
        .where({
          phone,
          code,
          used: false,
          expireAt: _.gte(new Date())
        })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!codeRecord.data || codeRecord.data.length === 0) {
        return { code: 401, message: '验证码错误或已过期' };
      }

      await db.collection('sms_codes')
        .doc(codeRecord.data[0]._id)
        .update({ used: true, usedAt: new Date() });
    }

    const existingUser = await db.collection('users')
      .where({ phone })
      .limit(1)
      .get();

    if (!existingUser.data || existingUser.data.length === 0) {
      return { code: 404, registered: false, message: '该手机号尚未注册，请先完成注册' };
    }

    const user = existingUser.data[0];

    await db.collection('users').doc(user._id).update({
      lastLoginAt: new Date(),
      loginCount: _.inc(1)
    });

    const tokenData = JSON.stringify({
      uid: typeof user._id === 'object' ? user._id.toString() : user._id,
      phone,
      ts: Date.now()
    });
    const token = crypto
      .createHash('sha256')
      .update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2024'))
      .digest('hex');

    await db.collection('users')
      .doc(typeof user._id === 'string' ? user._id : user._id)
      .update({
        token,
        tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

    return {
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user._id,
          phone,
          nickname: user.nickname || phone,
          email: user.email || '',
          avatarUrl: user.avatarUrl || null,
          hasWeixin: !!user.weixinOpenid,
          hasPhone: true
        },
        expiresIn: 2592000
      }
    };
  } catch (err) {
    console.error('phoneLogin error:', err);
    return { code: 500, message: '登录失败：' + (err.message || '未知错误') };
  }
};

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
