const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;

// 创建邮件传输器
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * 发送邮箱验证码
 * - 校验邮箱格式
 * - 检查60秒冷却
 * - 生成6位验证码
 * - 存入 email_codes 集合
 * - 通过 QQ 邮箱 SMTP 发送邮件
 */
exports.main = async (event, context) => {
  const { email } = event;

  // 1. 校验邮箱格式
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { code: 400, message: '邮箱格式不正确' };
  }

  try {
    // 2. 检查冷却时间（60秒内不能重发）
    const cooldownResult = await db.collection('email_codes')
      .where({
        email,
        createdAt: _.gte(new Date(Date.now() - 60000))
      })
      .count();

    if (cooldownResult.total > 0) {
      return { code: 429, message: '操作过于频繁，请60秒后重试' };
    }

    // 3. 生成6位验证码
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // 4. 存入数据库（有效期5分钟）
    await db.collection('email_codes').add({
      email,
      code,
      used: false,
      createdAt: new Date(),
      expireAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    // 5. 发送邮件
    const transporter = createTransporter();
    const fromName = process.env.FROM_NAME || '成绩雷达';

    await transporter.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '【成绩雷达】登录验证码',
      html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
        <div style="background:#4f46e5;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">🎓 成绩雷达</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
          <p style="color:#374151;font-size:15px;">您好！</p>
          <p style="color:#374151;font-size:15px;">您的登录验证码为：</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:16px 0;">
            <span style="font-size:32px;font-weight:bold;color:#4f46e5;letter-spacing:8px;">${code}</span>
          </div>
          <p style="color:#9ca3af;font-size:13px;">验证码 <strong>5分钟</strong> 内有效，请勿泄露给他人。</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">如非本人操作，请忽略此邮件。</p>
        </div>
        <p style="text-align:center;color:#d1d5db;font-size:12px;margin-top:12px;">
          此邮件由系统自动发送，请勿回复
        </p>
      </div>`
    });

    console.log('[sendEmailCode] 验证码已发送至:', email);

    return { code: 0, message: '验证码已发送' };

  } catch (err) {
    console.error('[sendEmailCode] error:', err);
    
    // 区分不同错误类型给出友好提示
    if (err.code === 'EAUTH') {
      return { code: 502, message: '邮件服务配置错误，请联系管理员' };
    }
    if (err.code === 'ECONNECTION') {
      return { code: 503, message: '邮件服务连接失败，请稍后重试' };
    }
    
    return { code: 500, message: '发送失败：' + (err.message || '未知错误') };
  }
};
