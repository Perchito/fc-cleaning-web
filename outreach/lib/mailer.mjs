// Outbound mail through iCloud SMTP (same transport the MCP server uses).

import nodemailer from "nodemailer";
import { config } from "./config.mjs";
import { logSend } from "./store.mjs";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

export async function verify() {
  return transporter.verify();
}

/**
 * Send an email. `context` is metadata for the send log (prospectId, type).
 * `headers` can carry In-Reply-To / References so replies thread correctly.
 */
export async function sendMail({ to, subject, text, headers, context = {} }) {
  const info = await transporter.sendMail({
    from: { name: config.from.name, address: config.from.address },
    to,
    replyTo: config.replyTo,
    subject,
    text,
    headers,
  });
  logSend({
    ...context,
    to,
    subject,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  });
  return info;
}

/** Digest email to the operator. */
export async function sendDigest({ to, subject, text }) {
  return transporter.sendMail({
    from: { name: config.from.name, address: config.from.address },
    to,
    subject,
    text,
  });
}
