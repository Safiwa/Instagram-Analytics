import nodemailer, { type Transporter } from "nodemailer";
import { log } from "../logging/logger";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

function config(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  const rawPort = process.env.SMTP_PORT?.trim() ?? "587";
  const port = Number(rawPort);

  if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465;
  return { host, port, secure, user, password, from };
}

export function isSmtpConfigured(): boolean {
  return config() !== null;
}

function createTransporter(settings: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.user,
      pass: settings.password,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

export async function sendDigestEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const settings = config();
  if (!settings) {
    throw new Error("SMTP is not configured.");
  }

  const transporter = createTransporter(settings);
  try {
    await transporter.sendMail({
      from: settings.from,
      to,
      subject,
      text,
      html,
    });
    log.info("weekly digest email sent", { status: "sent" });
  } finally {
    transporter.close();
  }
}
