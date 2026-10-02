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

  // Hard stop for non-production environments. The sandbox runs against
  // seeded data, but a copied-in real address or a mistyped env var must
  // never result in mail reaching an actual student or family. Sandbox mail
  // either goes to an explicit sink address or doesn't go at all — there is
  // deliberately no way to send to an arbitrary recipient from here.
  let to = args.to;
  let subject = args.subject;
  if (process.env.NEXT_PUBLIC_APP_ENV === "sandbox") {
    const sink = process.env.SANDBOX_EMAIL_SINK;
    if (!sink) {
      return {
        ok: false,
        error: `Sandbox: refusing to email ${args.to}. Set SANDBOX_EMAIL_SINK to receive test mail.`,
      };
    }
    subject = `[SANDBOX → ${args.to}] ${args.subject}`;
    to = sink;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: args.html,
    attachments: args.attachments,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
