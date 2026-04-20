const WORDS_PER_MINUTE = 220;

export function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeBlogStatus(input: string | null | undefined): "draft" | "published" | "archived" {
  const value = String(input ?? "draft").trim().toLowerCase();
  if (value === "published" || value === "archived") return value;
  return "draft";
}

export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^\s{0,3}(#{1,6})\s+/gm, "")
    .replace(/[>*_~#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateReadingTime(content: string | null | undefined) {
  const text = stripMarkdown(content ?? "");
  const wordCount = text ? text.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(line: string) {
  let rendered = escapeHtml(line);
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  rendered = rendered.replace(/`([^`]+)`/g, "<code>$1</code>");
  rendered = rendered.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return rendered;
}

export function markdownToHtml(markdown: string | null | undefined) {
  if (!markdown) return "";

  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(line.slice(2).trim())}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  if (inList) html.push("</ul>");

  return html.join("\n");
}
