import { log } from "../logging/logger";

type ResendConfig = {
  apiKey: string;
  from: string;
};

function config(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.DIGEST_FROM_EMAIL?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

export function isResendConfigured(): boolean {
  return config() !== null;
}

export async function sendDigestEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<void> {
  const settings = config();
  if (!settings) {
    throw new Error("Resend is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.from,
      to: [to],
      subject,
      text,
      html,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    log.error("weekly digest email rejected", { status: response.status });
    throw new Error(`Resend rejected the email with status ${response.status}.`);
  }

  log.info("weekly digest email sent", { status: "sent" });
}
