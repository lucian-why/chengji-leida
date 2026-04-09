const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const auth = app.auth();
const _ = db.command;

async function getCurrentUser() {
  const userInfo = await auth.getUserInfo();
  const uid = userInfo?.uid || userInfo?.openId || userInfo?.customUserId || '';
  if (!uid) {
    return { code: 401, message: '未获取到当前登录用户，请重新登录' };
  }
  return { code: 0, uid, userInfo };
}

exports.main = async (event) => {
  const { profileIds } = event;

  if (!Array.isArray(profileIds) || profileIds.length === 0) {
    return { code: 400, message: '请提供要删除的 profileIds' };
  }

  try {
    const current = await getCurrentUser();
    if (current.code !== 0) {
      return current;
    }

    const result = await db.collection('cloud_profiles')
      .where({
        userId: current.uid,
        profileId: _.in(profileIds)
      })
      .remove();

    return {
      code: 0,
      message: '云端档案删除成功',
      data: {
        count: result.deleted || result.stats?.removed || profileIds.length
      }
    };
  } catch (error) {
    console.error('[deleteCloudProfiles] error:', error);
    return { code: 500, message: '删除云端档案失败：' + (error.message || '未知错误') };
  }
};
