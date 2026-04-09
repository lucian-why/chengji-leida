const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const auth = app.auth();

function parseEventPayload(event = {}) {
  if (!event || typeof event !== 'object') return {};
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object' && Object.keys(event.queryStringParameters).length > 0) {
    return event.queryStringParameters;
  }
  if (event.queryString && typeof event.queryString === 'object' && Object.keys(event.queryString).length > 0) {
    return event.queryString;
  }
  if (typeof event.body === 'string' && event.body) {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    try {
      return JSON.parse(rawBody);
    } catch {
      return Object.fromEntries(new URLSearchParams(rawBody));
    }
  }
  if (event.body && typeof event.body === 'object') {
    return event.body;
  }
  return event;
}

async function getCurrentUser(event = {}) {
  const payload = parseEventPayload(event);
  const explicitUid = String(payload.userId || payload.uid || '').trim();
  if (explicitUid) {
    return { code: 0, uid: explicitUid, userInfo: { uid: explicitUid } };
  }

  const explicitEmail = String(payload.userEmail || payload.email || '').trim().toLowerCase();
  if (explicitEmail) {
    const matchedUser = await db.collection('users').where({ email: explicitEmail }).limit(1).get();
    const user = matchedUser.data && matchedUser.data[0];
    if (user && user._id) {
      const uid = typeof user._id === 'string' ? user._id : user._id.toString();
      return { code: 0, uid, userInfo: { uid, email: explicitEmail } };
    }
  }

  const userInfo = await auth.getUserInfo();
  const uid = userInfo?.uid || userInfo?.openId || userInfo?.customUserId || '';
  if (!uid) {
    return { code: 401, message: '未获取到当前登录用户，请重新登录' };
  }
  return { code: 0, uid, userInfo };
}

exports.main = async (event = {}) => {
  try {
    const payload = parseEventPayload(event);
    const current = await getCurrentUser(payload);
    if (current.code !== 0) {
      return current;
    }

    const showDeleted = payload.showDeleted === true || payload.showDeleted === 'true';
    const where = { userId: current.uid };

    // showDeleted=true 时查全部（含已删除），否则只查未删除的
    if (!showDeleted) {
      where.deleted = { $ne: true };
    }

    const result = await db.collection('cloud_profiles')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get();

    const profiles = (result.data || []).map((item) => ({
      id: item._id,
      profileId: item.profileId,
      profileName: item.profileName,
      examCount: item.examCount || 0,
      dataSize: item.dataSize || 0,
      lastSyncAt: item.lastSyncAt || item.updatedAt || item.createdAt || null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      deleted: item.deleted || false,
      deletedAt: item.deletedAt || item.deleted_at || null
    }));

    return { code: 0, data: profiles };
  } catch (error) {
    console.error('[listCloudProfiles] error:', error);
    return { code: 500, message: '读取云端档案失败：' + (error.message || '未知错误') };
  }
};
