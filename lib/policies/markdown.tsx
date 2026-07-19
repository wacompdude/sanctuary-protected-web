import type { ReactNode } from "react";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\[[^\]]+\]\(\/[^)\s]*\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
      if (linkMatch) {
        const href = linkMatch[2];
        const safe =
          href.startsWith("https://") ||
          href.startsWith("http://") ||
          href.startsWith("/");
        if (safe) {
          nodes.push(
            <a
              key={key++}
              href={href}
              className="font-medium text-primary underline underline-offset-4"
              {...(href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {linkMatch[1]}
            </a>,
          );
        } else {
          nodes.push(linkMatch[1]);
        }
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes.length > 0 ? nodes : [text];
}

export type PolicyTocItem = {
  id: string;
  text: string;
  level: 1 | 2 | 3;
};

function slugifyHeading(text: string, used: Map<string, number>) {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "section";
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function extractPolicyToc(markdown: string): PolicyTocItem[] {
  const used = new Map<string, number>();
  const items: PolicyTocItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length as 1 | 2 | 3;
    const text = match[2].trim();
    items.push({ id: slugifyHeading(text, used), text, level });
  }
  return items;
}

export function PolicyMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const used = new Map<string, number>();
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test((lines[i] ?? "").trim())) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-sm"
        >
          <code>{escapeHtml(code.join("\n"))}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugifyHeading(text, used);
      const Tag = (`h${level}` as "h1" | "h2" | "h3");
      const size =
        level === 1
          ? "text-2xl font-bold tracking-tight"
          : level === 2
            ? "text-xl font-semibold tracking-tight"
            : "text-lg font-semibold";
      blocks.push(
        <Tag key={key++} id={id} className={`scroll-mt-24 ${size}`}>
          {renderInline(text)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const callout: string[] = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trim())) {
        callout.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <aside
          key={key++}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          {callout.map((row, idx) => (
            <p key={idx} className={idx > 0 ? "mt-2" : undefined}>
              {renderInline(row)}
            </p>
          ))}
        </aside>,
      );
      continue;
    }

    if (/^([-*] |\d+\. |[-*] \[[ xX]\] )/.test(trimmed)) {
      const items: { text: string; ordered: boolean; checked?: boolean }[] = [];
      let ordered = /^\d+\.\s/.test(trimmed);
      while (i < lines.length) {
        const row = (lines[i] ?? "").trim();
        const checklist = /^[-*] \[([ xX])\]\s+(.*)$/.exec(row);
        const bullet = /^[-*]\s+(.*)$/.exec(row);
        const number = /^\d+\.\s+(.*)$/.exec(row);
        if (checklist) {
          ordered = false;
          items.push({
            text: checklist[2],
            ordered: false,
            checked: checklist[1].toLowerCase() === "x",
          });
          i += 1;
          continue;
        }
        if (bullet) {
          ordered = false;
          items.push({ text: bullet[1], ordered: false });
          i += 1;
          continue;
        }
        if (number) {
          ordered = true;
          items.push({ text: number[1], ordered: true });
          i += 1;
          continue;
        }
        break;
      }
      if (items.some((item) => item.checked !== undefined)) {
        blocks.push(
          <ul key={key++} className="space-y-2">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(item.checked)}
                  readOnly
                  className="mt-1"
                  aria-hidden
                />
                <span>{renderInline(item.text)}</span>
              </li>
            ))}
          </ul>,
        );
      } else if (ordered) {
        blocks.push(
          <ol key={key++} className="list-decimal space-y-1 pl-5 text-sm">
            {items.map((item, idx) => (
              <li key={idx}>{renderInline(item.text)}</li>
            ))}
          </ol>,
        );
      } else {
        blocks.push(
          <ul key={key++} className="list-disc space-y-1 pl-5 text-sm">
            {items.map((item, idx) => (
              <li key={idx}>{renderInline(item.text)}</li>
            ))}
          </ul>,
        );
      }
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test((lines[i] ?? "").trim())) {
        const row = (lines[i] ?? "").trim();
        if (/^\|[\s:-|]+\|$/.test(row)) {
          i += 1;
          continue;
        }
        rows.push(
          row
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim()),
        );
        i += 1;
      }
      if (rows.length > 0) {
        const [header, ...body] = rows;
        blocks.push(
          <div key={key++} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {header.map((cell, idx) => (
                    <th key={idx} className="px-2 py-2 font-medium">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-border/70">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-2 py-2 align-top">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (
        !next ||
        /^(#{1,3}\s|>\s?|[-*]\s|\d+\.\s|```|\|)/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-foreground">
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return (
    <div className={className ?? "space-y-4"}>{blocks}</div>
  );
}
