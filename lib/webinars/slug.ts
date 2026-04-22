const MAX_SLUG_LENGTH = 80;

type SlugQueryResult = {
  data: Array<{ slug: string | null }> | null;
  error: { message: string } | null;
};

type SlugQueryBuilder = {
  ilike: (column: string, pattern: string) => SlugQueryBuilder;
  neq: (column: string, value: string) => SlugQueryBuilder;
  limit: (count: number) => PromiseLike<SlugQueryResult>;
};

type WebinarSlugClient = {
  from: (table: "webinars") => {
    select: (columns: "slug") => SlugQueryBuilder;
  };
};

export function sanitizeWebinarSlug(value: string) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, MAX_SLUG_LENGTH).replace(/^-+|-+$/g, "");
}

function buildSlugWithSuffix(baseSlug: string, suffix: string) {
  const safeBase = baseSlug.slice(0, Math.max(1, MAX_SLUG_LENGTH - suffix.length - 1)).replace(/^-+|-+$/g, "");
  return `${safeBase}-${suffix}`;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export async function generateUniqueWebinarSlug({
  client,
  title,
  explicitSlug,
  excludeWebinarId,
}: {
  client: unknown;
  title: string;
  explicitSlug?: string | null;
  excludeWebinarId?: string;
}) {
  const baseSlug = sanitizeWebinarSlug(explicitSlug || title) || `webinar-${Date.now()}`;

  const slugClient = client as WebinarSlugClient;
  let query = slugClient.from("webinars").select("slug").ilike("slug", `${baseSlug}%`);
  if (excludeWebinarId) {
    query = query.neq("id", excludeWebinarId);
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  const used = new Set((data ?? []).map((row) => String(row.slug ?? "").trim().toLowerCase()).filter(Boolean));
  if (!used.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (counter <= 9999) {
    const candidate = buildSlugWithSuffix(baseSlug, String(counter));
    if (!used.has(candidate)) return candidate;
    counter += 1;
  }

  let randomCandidate = buildSlugWithSuffix(baseSlug, randomSuffix());
  while (used.has(randomCandidate)) {
    randomCandidate = buildSlugWithSuffix(baseSlug, randomSuffix());
  }

  return randomCandidate;
}
