import { EMAIL_SUBJECT_PREFIX } from "@/lib/notifications/constants";
import type {
  NotificationSeverity,
  NotificationTemplate,
} from "@/lib/notifications/types";
import { escapeHtml } from "@/lib/notifications/validation";

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type RenderedTemplate = {
  subject: string;
  text: string;
  html: string;
  templateKey: string;
  templateVersion: number;
};

function replaceTokens(
  template: string,
  variables: Record<string, string>,
  htmlEscape: boolean,
): string {
  return template.replace(TOKEN_PATTERN, (_match, key: string) => {
    const value = variables[key] ?? "";
    return htmlEscape ? escapeHtml(value) : value;
  });
}

export function collectTemplateTokens(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

/**
 * Safe controlled token replacement. Does not evaluate code.
 * Unknown tokens become empty strings. Values are HTML-escaped in HTML bodies.
 */
export function renderNotificationTemplate(
  template: NotificationTemplate,
  variables: Record<string, string | number | null | undefined>,
  options?: { severity?: NotificationSeverity },
): RenderedTemplate {
  const allowed = new Set(template.allowed_variables ?? []);
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (allowed.size > 0 && !allowed.has(key)) {
      continue;
    }
    if (value == null) {
      normalized[key] = "";
    } else {
      normalized[key] = String(value);
    }
  }

  // Always allow empty campus_suffix default
  if (normalized.campus_suffix == null) {
    normalized.campus_suffix = normalized.campus_name
      ? ` (${normalized.campus_name})`
      : "";
  }

  const usedTokens = [
    ...collectTemplateTokens(template.subject_template),
    ...collectTemplateTokens(template.body_text_template),
    ...collectTemplateTokens(template.body_html_template ?? ""),
  ];

  for (const token of usedTokens) {
    if (allowed.size > 0 && !allowed.has(token) && token !== "campus_suffix") {
      throw new Error(`Template uses unknown variable: ${token}`);
    }
    if (normalized[token] == null) {
      normalized[token] = "";
    }
  }

  const severity = options?.severity ?? template.severity;
  const prefix = EMAIL_SUBJECT_PREFIX[severity] ?? "";
  const subjectRaw = replaceTokens(template.subject_template, normalized, false);
  const subject = subjectRaw.startsWith("[CRITICAL]") || subjectRaw.startsWith("[HIGH]")
    ? subjectRaw
    : `${prefix}${subjectRaw}`;

  const text = replaceTokens(template.body_text_template, normalized, false);
  const htmlSource =
    template.body_html_template?.trim() ||
    `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`;
  const html = replaceTokens(htmlSource, normalized, true);

  return {
    subject: subject.slice(0, 500),
    text: text.slice(0, 20000),
    html: html.slice(0, 50000),
    templateKey: template.template_key,
    templateVersion: template.version,
  };
}

export function wrapEmailHtml(bodyHtml: string, churchName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sanctuary Protected</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
          <tr>
            <td style="font-size:14px;color:#71717a;padding-bottom:12px;">
              Sanctuary Protected · ${escapeHtml(churchName)}
            </td>
          </tr>
          <tr>
            <td style="font-size:16px;line-height:1.5;color:#18181b;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#a1a1aa;padding-top:24px;border-top:1px solid #e4e4e7;">
              Sign in to review full details. Do not share operational security information by email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
