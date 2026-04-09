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
  const { profileId, profileName, profileData, examCount, dataSize, userEmail } = event;

  if (!profileId || typeof profileId !== 'string') {
    return { code: 400, message: '缺少 profileId' };
  }
  if (!profileName || typeof profileName !== 'string') {
    return { code: 400, message: '缺少档案名称' };
  }
  if (!profileData || typeof profileData !== 'object') {
    return { code: 400, message: '缺少档案数据' };
  }

  try {
    const current = await getCurrentUser();
    if (current.code !== 0) {
      return current;
    }

    const now = new Date();
    const normalizedExamCount = Number.isFinite(Number(examCount)) ? Number(examCount) : 0;
    const normalizedDataSize = Number.isFinite(Number(dataSize)) ? Number(dataSize) : 0;

    const existing = await db.collection('cloud_profiles')
      .where({
        userId: current.uid,
        profileId
      })
      .limit(1)
      .get();

    if (existing.data && existing.data.length > 0) {
      const currentDoc = existing.data[0];
      await db.collection('cloud_profiles').doc(currentDoc._id).update({
        profileName,
        profileData,
        examCount: normalizedExamCount,
        dataSize: normalizedDataSize,
        userEmail: userEmail || currentDoc.userEmail || '',
        lastSyncAt: now,
        updatedAt: now
      });

      return {
        code: 0,
        message: '云端档案已更新',
        data: {
          id: currentDoc._id,
          profileId,
          lastSyncAt: now.toISOString()
        }
      };
    }

    const createResult = await db.collection('cloud_profiles').add({
      userId: current.uid,
      userEmail: userEmail || '',
      profileId,
      profileName,
      profileData,
      examCount: normalizedExamCount,
      dataSize: normalizedDataSize,
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now
    });

    return {
      code: 0,
      message: '云端档案已创建',
      data: {
        id: createResult.id,
        profileId,
        lastSyncAt: now.toISOString()
      }
    };
  } catch (error) {
    console.error('[uploadCloudProfile] error:', error);
    return { code: 500, message: '上传云端档案失败：' + (error.message || '未知错误') };
  }
};
