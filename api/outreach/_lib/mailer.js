import nodemailer from "nodemailer";
import { config } from "./config.js";

let _t;
function transport() {
  if (!_t) {
    _t = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return _t;
}

export async function sendMail({ to, subject, text, headers }) {
  return transport().sendMail({
    from: { name: config.from.name, address: config.from.address },
    to,
    replyTo: config.replyTo,
    subject,
    text,
    headers,
  });
}

export async function sendDigest({ to, subject, text }) {
  return transport().sendMail({
    from: { name: config.from.name, address: config.from.address },
    to,
    subject,
    text,
  });
}
