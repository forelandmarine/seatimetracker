/**
 * Welcome email — sent on user signup.
 * Uses Resend (already configured).
 *
 * Future: extend to a 5-email drip sequence (welcome, getting started,
 * MCA tips, Lightship intro, premium features).
 */

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "SeaTime Tracker <noreply@forelandmarine.com>";
const SEATIME_URL = "https://forelandmarine.com/tools/seatime-tracker";
const LIGHTSHIP_URL = "https://forelandmarine.com/tools/lightship-ism";
const SUPPORT_EMAIL = "info@forelandmarine.com";

interface SendWelcomeEmailInput {
  email: string;
  name?: string;
}

export async function sendWelcomeEmail(
  input: SendWelcomeEmailInput,
  logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    logger?.info({ email: input.email }, "[Welcome Email] No Resend API key, skipping");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const firstName = (input.name || "").split(" ")[0] || "there";

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: input.email,
      subject: "Welcome to SeaTime Tracker",
      html: welcomeHtml(firstName),
      text: welcomeText(firstName),
    });

    if (error) {
      logger?.warn({ email: input.email, err: error }, "[Welcome Email] Resend returned error");
      return { success: false, error: String(error) };
    }

    logger?.info({ email: input.email, emailId: data?.id }, "[Welcome Email] Sent");
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger?.error({ err, email: input.email }, "[Welcome Email] Failed to send");
    return { success: false, error: errorMessage };
  }
}

function welcomeHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to SeaTime Tracker</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7F9FC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="margin: 40px auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(4, 13, 26, 0.06);">

    <!-- Header -->
    <tr>
      <td style="background-color: #040D1A; padding: 32px 40px; text-align: left;">
        <table cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="vertical-align: middle;">
              <span style="color: #5386B6; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">SeaTime Tracker</span>
              <h1 style="margin: 8px 0 0; color: #FFFFFF; font-size: 24px; font-weight: 300;">Welcome aboard, ${firstName}.</h1>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 40px;">
        <p style="margin: 0 0 16px; color: #040D1A; font-size: 16px; line-height: 1.6;">
          Thanks for signing up to SeaTime Tracker — your sea time, on autopilot.
        </p>

        <p style="margin: 0 0 24px; color: #4A5568; font-size: 15px; line-height: 1.6;">
          You can now add your vessel by MMSI and we'll automatically log your sea service using AIS data. When it's time to apply for a CoC or revalidation, generate an MCA-compliant testimonial in seconds.
        </p>

        <h2 style="margin: 32px 0 16px; color: #040D1A; font-size: 18px; font-weight: 600;">Getting started</h2>
        <ol style="margin: 0; padding-left: 20px; color: #4A5568; font-size: 15px; line-height: 1.8;">
          <li>Open the app and tap <strong>Add Vessel</strong></li>
          <li>Enter your vessel's MMSI (you can find it on your AIS unit)</li>
          <li>Activate the vessel — we'll start tracking immediately</li>
          <li>Review your sea time entries in the Logbook tab</li>
        </ol>

        <p style="margin: 32px 0 0;">
          <a href="${SEATIME_URL}" style="display: inline-block; background-color: #5386B6; color: #FFFFFF; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Visit the SeaTime Tracker site</a>
        </p>

        <hr style="margin: 40px 0; border: 0; border-top: 1px solid #E2E8F0;">

        <!-- Lightship hook -->
        <table cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #F7F9FC; border-left: 4px solid #5386B6; border-radius: 4px;">
          <tr>
            <td style="padding: 20px 24px;">
              <p style="margin: 0 0 8px; color: #5386B6; font-size: 11px; font-weight: 700; letter-spacing: 1.2px;">FOR YACHT MANAGERS</p>
              <h3 style="margin: 0 0 8px; color: #040D1A; font-size: 17px; font-weight: 600;">Managing an entire fleet?</h3>
              <p style="margin: 0 0 12px; color: #4A5568; font-size: 14px; line-height: 1.6;">
                SeaTime Tracker is built by Foreland Marine — the same team behind <strong>Lightship ISM</strong>, our fleet management and ISM compliance platform for yacht managers.
              </p>
              <a href="${LIGHTSHIP_URL}" style="color: #5386B6; font-weight: 600; font-size: 14px; text-decoration: none;">Learn more about Lightship →</a>
            </td>
          </tr>
        </table>

        <p style="margin: 32px 0 0; color: #4A5568; font-size: 14px; line-height: 1.6;">
          Questions? Just reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color: #5386B6;">${SUPPORT_EMAIL}</a>.
        </p>

        <p style="margin: 24px 0 0; color: #4A5568; font-size: 14px; line-height: 1.6;">
          Smooth sailing,<br>
          The Foreland Marine team
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #F7F9FC; padding: 24px 40px; text-align: center; border-top: 1px solid #E2E8F0;">
        <p style="margin: 0; color: #4A5568; font-size: 12px; line-height: 1.6;">
          Foreland Marine Consultancy Ltd<br>
          7 Bell Yard, London WC2A 2JR, United Kingdom
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function welcomeText(firstName: string): string {
  return `Welcome aboard, ${firstName}.

Thanks for signing up to SeaTime Tracker — your sea time, on autopilot.

You can now add your vessel by MMSI and we'll automatically log your sea service using AIS data. When it's time to apply for a CoC or revalidation, generate an MCA-compliant testimonial in seconds.

GETTING STARTED
1. Open the app and tap Add Vessel
2. Enter your vessel's MMSI
3. Activate the vessel — we'll start tracking immediately
4. Review your sea time entries in the Logbook tab

Visit: ${SEATIME_URL}

---

FOR YACHT MANAGERS

Managing an entire fleet? SeaTime Tracker is built by Foreland Marine — the same team behind Lightship ISM, our fleet management and ISM compliance platform.

Learn more: ${LIGHTSHIP_URL}

---

Questions? Reply to this email or write to ${SUPPORT_EMAIL}.

Smooth sailing,
The Foreland Marine team

—
Foreland Marine Consultancy Ltd
7 Bell Yard, London WC2A 2JR, United Kingdom
`;
}
