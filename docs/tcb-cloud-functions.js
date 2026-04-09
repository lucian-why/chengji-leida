/**
 * 腾讯云 CloudBase - 当前云函数示例（与现网架构一致）
 *
 * 当前真实方案：
 * 1. Web 登录使用 CloudBase 官方邮箱验证码登录
 * 2. 云同步函数直接读取 CloudBase 当前登录用户身份
 * 3. cloud_profiles 是当前云同步主集合
 *
 * 说明：
 * - 这份文件是“结构示例与职责说明”，方便后续继续扩展。
 * - 当前 Web 主链路已经不再依赖 sendSmsCode / phoneLogin / 自建 token。
 */

// ===== 1. 云同步：列出云端档案 =====
// 函数名：listCloudProfiles

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

exports.main = async () => {
  try {
    const current = await getCurrentUser();
    if (current.code !== 0) {
      return current;
    }

    const result = await db.collection('cloud_profiles')
      .where({ userId: current.uid })
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get();

    return {
      code: 0,
      data: (result.data || []).map((item) => ({
        id: item._id,
        profileId: item.profileId,
        profileName: item.profileName,
        examCount: item.examCount || 0,
        dataSize: item.dataSize || 0,
        lastSyncAt: item.lastSyncAt || item.updatedAt || item.createdAt || null,
      }))
    };
  } catch (error) {
    console.error('[listCloudProfiles] error:', error);
    return { code: 500, message: '读取云端档案失败：' + (error.message || '未知错误') };
  }
};

// ===== 2. 云同步：读取单个云端档案 =====
// 函数名：getCloudProfileData

exports.getCloudProfileDataExample = async (event) => {
  const { profileId } = event;
  const current = await getCurrentUser();
  if (current.code !== 0) return current;

  const result = await db.collection('cloud_profiles')
    .where({ userId: current.uid, profileId })
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
      bundle: item.profileData || null,
      examCount: item.examCount || 0,
      dataSize: item.dataSize || 0,
      lastSyncAt: item.lastSyncAt || item.updatedAt || item.createdAt || null
    }
  };
};

// ===== 3. 云同步：上传/覆盖档案 =====
// 函数名：uploadCloudProfile

exports.uploadCloudProfileExample = async (event) => {
  const { profileId, profileName, profileData, examCount, dataSize, userEmail } = event;
  const current = await getCurrentUser();
  if (current.code !== 0) return current;

  const now = new Date();
  const existing = await db.collection('cloud_profiles')
    .where({ userId: current.uid, profileId })
    .limit(1)
    .get();

  if (existing.data && existing.data.length > 0) {
    const row = existing.data[0];
    await db.collection('cloud_profiles').doc(row._id).update({
      profileName,
      profileData,
      examCount: Number(examCount) || 0,
      dataSize: Number(dataSize) || 0,
      userEmail: userEmail || row.userEmail || '',
      lastSyncAt: now,
      updatedAt: now,
    });

    return {
      code: 0,
      message: '云端档案已更新',
      data: { id: row._id, profileId, lastSyncAt: now.toISOString() }
    };
  }

  const createResult = await db.collection('cloud_profiles').add({
    userId: current.uid,
    userEmail: userEmail || '',
    profileId,
    profileName,
    profileData,
    examCount: Number(examCount) || 0,
    dataSize: Number(dataSize) || 0,
    lastSyncAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    code: 0,
    message: '云端档案已创建',
    data: { id: createResult.id, profileId, lastSyncAt: now.toISOString() }
  };
};

// ===== 4. 云同步：删除云端档案 =====
// 函数名：deleteCloudProfiles

exports.deleteCloudProfilesExample = async (event) => {
  const _ = db.command;
  const { profileIds } = event;
  const current = await getCurrentUser();
  if (current.code !== 0) return current;

  const result = await db.collection('cloud_profiles')
    .where({
      userId: current.uid,
      profileId: _.in(profileIds || [])
    })
    .remove();

  return {
    code: 0,
    message: '云端档案删除成功',
    data: {
      count: result.deleted || result.stats?.removed || 0
    }
  };
};

// ===== 5. 当前数据库集合建议 =====

/**
 * cloud_profiles
 *
 * {
 *   _id: "auto_generated",
 *   userId: "cloudbase_uid",
 *   userEmail: "user@example.com",
 *   profileId: "local-profile-id",
 *   profileName: "默认档案",
 *   profileData: { ...完整档案包... },
 *   examCount: 7,
 *   dataSize: 5230,
 *   lastSyncAt: Date,
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 */

// ===== 6. 当前架构说明 =====

/**
 * 当前 Web 已经切换为：
 * - CloudBase 官方邮箱验证码登录
 * - CloudBase 官方登录态鉴权
 * - cloud_profiles 文档型同步存储
 *
 * 因此下面这些旧方案不再是 Web 主链路：
 * - sendSmsCode
 * - phoneLogin
 * - 自建 token
 * - users.token 校验
 * - SMTP 发验证码作为主登录方式
 */
