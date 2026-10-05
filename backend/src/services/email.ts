import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export async function sendVerificationEmail(
  email: string,
  otp: string,
) {
  await transporter.sendMail({
    from: `"TOR Insight" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "TOR Insight - Email Verification",
    html: `
      <div>
        <h2>TOR Insight</h2>

        <p>Your email verification code is:</p>

        <h1>${otp}</h1>

        <p>This code will expire in 10 minutes.</p>

        <p>If you did not create an account, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  await transporter.sendMail({
    from: `"TOR Insight" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "TOR Insight - Password Reset Request",
    html: `
      <div>
        <h2>TOR Insight</h2>
        <p>We received a request to reset your password. Click the link below to set a new one:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link will expire in 30 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendTorMatchEmail(
  email: string,
  name: string,
  tors: { title: string; agency: string; budgetAmount?: number; sourceUrl?: string }[],
) {
  const itemsHtml = tors
    .map(
      (t) => `
        <li style="margin-bottom: 12px;">
          <strong>${t.title}</strong><br/>
          หน่วยงาน: ${t.agency}<br/>
          ${t.budgetAmount ? `งบประมาณ: ${t.budgetAmount.toLocaleString()} บาท<br/>` : ""}
          ${t.sourceUrl ? `<a href="${t.sourceUrl}">ดูรายละเอียด</a>` : ""}
        </li>
      `,
    )
    .join("");

  await transporter.sendMail({
    from: `"TOR Insight" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `TOR Insight - พบ TOR ใหม่ที่ตรงกับความสนใจของคุณ (${tors.length} รายการ)`,
    html: `
      <div>
        <h2>TOR Insight</h2>
        <p>สวัสดีคุณ ${name},</p>
        <p>เราพบ TOR ใหม่ที่ตรงกับเงื่อนไขที่คุณตั้งไว้ ${tors.length} รายการ:</p>
        <ul>${itemsHtml}</ul>
        <p>คุณสามารถปรับเงื่อนไขการแจ้งเตือนได้ที่หน้าตั้งค่าบัญชี</p>
      </div>
    `,
  });
}

export async function sendFeedbackResolvedEmail(
  email: string,
  name: string,
  description: string,
  adminResponse: string,
) {
  await transporter.sendMail({
    from: `"TOR Insight" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "TOR Insight - ข้อเสนอแนะของคุณได้รับการตอบกลับแล้ว",
    html: `
      <div>
        <h2>TOR Insight</h2>
        <p>สวัสดีคุณ ${name},</p>
        <p>ข้อเสนอแนะของคุณได้รับการตรวจสอบและตอบกลับแล้ว:</p>
        <p><strong>ข้อความของคุณ:</strong> ${description}</p>
        <p><strong>คำตอบจากทีมงาน:</strong> ${adminResponse}</p>
        <p>ขอบคุณที่ช่วยพัฒนา TOR Insight ให้ดียิ่งขึ้น</p>
      </div>
    `,
  });
}

export async function sendNewFeedbackAdminEmail(
  adminEmail: string,
  submitterName: string,
  category: string,
  description: string,
  torReference?: string,
) {
  await transporter.sendMail({
    from: `"TOR Insight" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject: "TOR Insight - มีข้อเสนอแนะใหม่รอตรวจสอบ",
    html: `
      <div>
        <h2>TOR Insight</h2>
        <p>มีข้อเสนอแนะใหม่จาก ${submitterName}:</p>
        <p><strong>ประเภท:</strong> ${category}</p>
        ${torReference ? `<p><strong>เกี่ยวข้องกับ:</strong> ${torReference}</p>` : ""}
        <p><strong>รายละเอียด:</strong> ${description}</p>
        <p>กรุณาตรวจสอบและตอบกลับได้ที่แผงควบคุมผู้ดูแลระบบ</p>
      </div>
    `,
  });
}

export async function sendAccountDisabledEmail(email: string, name: string) {
  await transporter.sendMail({
    from: `"TOR Insight" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "TOR Insight - บัญชีของคุณถูกระงับการใช้งาน",
    html: `
      <div>
        <h2>TOR Insight</h2>
        <p>สวัสดีคุณ ${name},</p>
        <p>บัญชีของคุณถูกระงับการใช้งานชั่วคราว หากคุณคิดว่านี่เป็นความผิดพลาด กรุณาติดต่อทีมงานผู้ดูแลระบบ</p>
      </div>
    `,
  });
}