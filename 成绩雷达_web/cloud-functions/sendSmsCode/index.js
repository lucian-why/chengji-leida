const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const TencentCloud = require('tencentcloud-sdk-nodejs');

// SMS Client
const SmsClient = TencentCloud.sms.v20210111.Client;

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;

/**
 * 发送短信验证码
 * - 校验手机号格式
 * - 检查60秒冷却
 * - 生成6位验证码
 * - 存入 sms_codes 集合
 * - 调用腾讯云短信API发送
 */
exports.main = async (event, context) => {
  const { phone } = event;

  // 1. 校验手机号
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }

  try {
    // 2. 检查冷却时间（60秒内不能重发）
    const cooldownResult = await db.collection('sms_codes')
      .where({
        phone,
        createdAt: _.gte(new Date(Date.now() - 60000))
      })
      .count();

    if (cooldownResult.total > 0) {
      return { code: 429, message: '操作过于频繁，请60秒后重试' };
    }

    // 3. 生成6位验证码
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // 4. 存入数据库（有效期5分钟）
    await db.collection('sms_codes').add({
      phone,
      code,
      used: false,
      createdAt: new Date(),
      expireAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    // 5. 调用腾讯云短信API发送
    const clientConfig = {
      credential: {
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
      },
      region: 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } }
    };

    const smsClient = new SmsClient(clientConfig);

    await smsClient.SendSms({
      SmsAppId: process.env.SMS_APPID,
      SignName: process.env.SMS_SIGN_NAME,
      TemplateId: process.env.SMS_TEMPLATE_ID,
      PhoneNumberSet: [`+86${phone}`],
      TemplateParamSet: [code, '5']
    });

    return { code: 0, message: '验证码发送成功' };

  } catch (err) {
    console.error('sendSmsCode error:', err);
    return { code: 500, message: '发送失败：' + (err.message || '未知错误') };
  }
};
