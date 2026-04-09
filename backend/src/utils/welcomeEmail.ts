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

/**
 * Day-3 follow-up email — sent 3 days after signup.
 * Focus: tips on getting the most out of automatic tracking.
 */
export async function sendDay3Email(
  input: SendWelcomeEmailInput,
  logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const firstName = (input.name || "").split(" ")[0] || "there";

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: input.email,
      subject: "How to get the most out of SeaTime Tracker",
      html: day3Html(firstName),
      text: day3Text(firstName),
    });
    if (error) return { success: false, error: String(error) };
    logger?.info({ email: input.email, emailId: data?.id }, "[Day3 Email] Sent");
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger?.error({ err, email: input.email }, "[Day3 Email] Failed");
    return { success: false, error: errorMessage };
  }
}

/**
 * Day-7 follow-up email — sent 7 days after signup.
 * Focus: introduce Lightship for fleet managers.
 */
export async function sendDay7Email(
  input: SendWelcomeEmailInput,
  logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const firstName = (input.name || "").split(" ")[0] || "there";

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: input.email,
      subject: "Managing more than one yacht? Meet Lightship.",
      html: day7Html(firstName),
      text: day7Text(firstName),
    });
    if (error) return { success: false, error: String(error) };
    logger?.info({ email: input.email, emailId: data?.id }, "[Day7 Email] Sent");
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger?.error({ err, email: input.email }, "[Day7 Email] Failed");
    return { success: false, error: errorMessage };
  }
}

function day3Html(firstName: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F9FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table cellspacing="0" cellpadding="0" align="center" width="600" style="margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#0077BE;padding:32px 40px;">
      <span style="color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">SeaTime Tracker</span>
      <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:300;">How are you getting on, ${firstName}?</h1>
    </td></tr>
    <tr><td style="padding:40px;">
      <p style="margin:0 0 16px;color:#1A1A1A;font-size:16px;line-height:1.6;">It's been a few days since you joined SeaTime Tracker. Here are three tips to get the most out of automatic sea time tracking.</p>

      <h3 style="margin:24px 0 8px;color:#0077BE;font-size:14px;font-weight:700;letter-spacing:0.5px;">1. Check your vessel is active</h3>
      <p style="margin:0 0 16px;color:#4A5568;font-size:14px;line-height:1.6;">Tracking only happens when your vessel is marked active in the home screen. Tap a vessel to activate it.</p>

      <h3 style="margin:24px 0 8px;color:#0077BE;font-size:14px;font-weight:700;letter-spacing:0.5px;">2. Review confirmations weekly</h3>
      <p style="margin:0 0 16px;color:#4A5568;font-size:14px;line-height:1.6;">Sea time entries start as 'pending'. Tap the Review tab and confirm them once a week so your records stay current. Set a reminder in Profile → Notification Settings.</p>

      <h3 style="margin:24px 0 8px;color:#0077BE;font-size:14px;font-weight:700;letter-spacing:0.5px;">3. Add your certificates</h3>
      <p style="margin:0 0 16px;color:#4A5568;font-size:14px;line-height:1.6;">Profile → Certificates lets you track STCW, ENG1, GMDSS, and other expiry dates. We'll remind you 90, 60, 30, and 7 days before each expires.</p>

      <p style="margin:32px 0 0;color:#4A5568;font-size:14px;">Questions? Just reply to this email.</p>
      <p style="margin:24px 0 0;color:#4A5568;font-size:14px;">Smooth sailing,<br>The Foreland Marine team</p>
    </td></tr>
  </table>
</body></html>`;
}

function day3Text(firstName: string): string {
  return `How are you getting on, ${firstName}?

It's been a few days since you joined SeaTime Tracker. Here are three tips:

1. CHECK YOUR VESSEL IS ACTIVE — Tracking only happens for active vessels.
2. REVIEW CONFIRMATIONS WEEKLY — Confirm pending entries once a week.
3. ADD YOUR CERTIFICATES — Profile → Certificates tracks STCW, ENG1 etc with expiry reminders.

Questions? Just reply.

Smooth sailing,
The Foreland Marine team`;
}

function day7Html(firstName: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F9FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table cellspacing="0" cellpadding="0" align="center" width="600" style="margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#0077BE;padding:32px 40px;">
      <span style="color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">From Foreland Marine</span>
      <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:300;">Hi ${firstName}, a quick introduction.</h1>
    </td></tr>
    <tr><td style="padding:40px;">
      <p style="margin:0 0 16px;color:#1A1A1A;font-size:16px;line-height:1.6;">SeaTime Tracker is built by Foreland Marine — a yacht management consultancy with offices in London, Antibes, Palma, and Fort Lauderdale.</p>

      <p style="margin:0 0 16px;color:#4A5568;font-size:15px;line-height:1.6;">If you're a master, captain, or fleet manager who needs to track sea time, certificates, and incidents for an entire crew — not just yourself — we have a tool built for that:</p>

      <table cellspacing="0" cellpadding="0" width="100%" style="background:#F7F9FC;border-left:4px solid #0077BE;border-radius:4px;margin:24px 0;">
        <tr><td style="padding:24px;">
          <h2 style="margin:0 0 8px;color:#0077BE;font-size:20px;font-weight:600;">Lightship ISM</h2>
          <p style="margin:0 0 16px;color:#4A5568;font-size:14px;line-height:1.6;">Yacht administration, but a bit clever. Fleet management, ISM compliance, incident tracking, audit logs, certificate renewals, AIS sea service records — all in one place.</p>
          <a href="https://forelandmarine.com/tools/lightship-ism" style="display:inline-block;background:#0077BE;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">See how it works</a>
        </td></tr>
      </table>

      <p style="margin:24px 0 0;color:#4A5568;font-size:14px;line-height:1.6;">Not interested? No problem — keep using SeaTime Tracker for your own logbook. We won't keep pushing.</p>

      <p style="margin:24px 0 0;color:#4A5568;font-size:14px;">Smooth sailing,<br>The Foreland Marine team</p>
    </td></tr>
  </table>
</body></html>`;
}

function day7Text(firstName: string): string {
  return `Hi ${firstName}, a quick introduction.

SeaTime Tracker is built by Foreland Marine — a yacht management consultancy with offices in London, Antibes, Palma, and Fort Lauderdale.

If you're a master, captain, or fleet manager who needs to track sea time, certificates, and incidents for an entire crew, we have a tool for that: Lightship ISM.

Lightship handles yacht administration, ISM compliance, incident tracking, audits, certificate renewals, and AIS sea service records — all in one place.

See how it works: https://forelandmarine.com/tools/lightship-ism

Not interested? No problem — keep using SeaTime Tracker for your own logbook.

Smooth sailing,
The Foreland Marine team`;
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
