import { Resend } from "resend";

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Email isn't configured (RESEND_API_KEY/EMAIL_FROM missing)." };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    attachments: args.attachments,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
