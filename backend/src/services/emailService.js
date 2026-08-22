const nodemailer = require("nodemailer");

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendPasswordResetCode({ to, username, code }) {
  if (!smtpConfigured()) return { sent: false, reason: "SMTP_NOT_CONFIGURED" };

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "كود استرجاع كلمة مرور الصيدلية",
    text: `مرحبًا ${username || ""}\nكود استرجاع كلمة المرور هو: ${code}\nينتهي الكود خلال 10 دقائق.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>استرجاع كلمة المرور</h2><p>مرحبًا ${username || ""}</p><p>استخدم الكود التالي خلال 10 دقائق:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px">${code}</p><p>إذا لم تطلب تغيير كلمة المرور فتجاهل الرسالة.</p></div>`
  });

  return { sent: true };
}

module.exports = { sendPasswordResetCode, smtpConfigured };
