const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const auth = app.auth();

async function getCurrentUser() {
  const userInfo = await auth.getUserInfo();
  const uid = userInfo?.uid || userInfo?.openId || userInfo?.customUserId || '';
  if (!uid) {
    return { code: 401, message: '未获取到当前登录用户，请重新登录' };
  }
  return { code: 0, uid, userInfo };
}

exports.main = async (event) => {
  const { profileId } = event;

  if (!profileId || typeof profileId !== 'string') {
    return { code: 400, message: '缺少 profileId' };
  }

  try {
    const current = await getCurrentUser();
    if (current.code !== 0) {
      return current;
    }

    const result = await db.collection('cloud_profiles')
      .where({
        userId: current.uid,
        profileId
      })
      .limit(1)
      .get();

    if (!result.data || result.data.length === 0) {
      return { code: 404, message: '未找到对应的云端档案' };
    }

    const item = result.data[0];
    return {
      code: 0,
      data: {
        id: item._id,
        profileId: item.profileId,
        profileName: item.profileName,
        examCount: item.examCount || 0,
        dataSize: item.dataSize || 0,
        lastSyncAt: item.lastSyncAt || item.updatedAt || item.createdAt || null,
        bundle: item.profileData || null,
        profileData: item.profileData || null,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null
      }
    };
  } catch (error) {
    console.error('[getCloudProfileData] error:', error);
    return { code: 500, message: '读取云端档案详情失败：' + (error.message || '未知错误') };
  }
};
