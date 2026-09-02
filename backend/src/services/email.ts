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