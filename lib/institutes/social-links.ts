export const SOCIAL_LINK_FIELDS = [
  { key: "facebook", label: "Facebook", example: "https://www.facebook.com/yourinstitute" },
  { key: "instagram", label: "Instagram", example: "https://www.instagram.com/yourinstitute/" },
  { key: "youtube", label: "YouTube", example: "https://www.youtube.com/@yourinstitute" },
  { key: "linkedin", label: "LinkedIn", example: "https://www.linkedin.com/company/yourinstitute/" },
  { key: "x", label: "X (Twitter)", example: "https://x.com/yourinstitute" },
  { key: "whatsapp", label: "WhatsApp", example: "+91 98765 43210 or https://wa.me/919876543210" },
] as const;

type SocialPlatform = (typeof SOCIAL_LINK_FIELDS)[number]["key"];
export type InstituteSocialLinks = Partial<Record<SocialPlatform, string>>;
export const SOCIAL_LINK_MAX_LENGTH = 512;

const MAX_SOCIAL_LINK_PAYLOAD = SOCIAL_LINK_FIELDS.length * (SOCIAL_LINK_MAX_LENGTH + 32);
const phonePattern = /^[1-9][0-9]{6,14}$/;

const platformHosts = {
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com", "mbasic.facebook.com"],
  instagram: ["instagram.com", "www.instagram.com", "m.instagram.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
  x: ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
};

const reservedPaths = {
  facebook: /^(?:flx|login|share|sharer|dialog|watch|reel|reels|groups|events|marketplace|help)$/i,
  instagram: /^(?:accounts|direct|explore|p|reel|reels|stories|about|oauth)$/i,
  x: /^(?:home|explore|search|intent|share|settings|messages|i|login|signup|logout|compose|notifications)$/i,
};

function parseHttpsUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > SOCIAL_LINK_MAX_LENGTH) return null;
  const value = raw.trim();
  // Require an explicit authority and reject characters browsers may silently rewrite.
  if (!/^https:\/\/[^/?#]+/i.test(value) || /[\s\\\u0000-\u001F\u007F]/u.test(value)) return null;
  if (value.slice(8).split(/[/?#]/, 1)[0].includes("@")) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port ? url : null;
  } catch {
    return null;
  }
}

export function normalizeInstituteWebsite(value: unknown): string | null {
  return parseHttpsUrl(value)?.href ?? null;
}

function normalizeWhatsApp(value: string): string | null {
  let phone: string | undefined;
  if (/^\+?[0-9][0-9 ().-]*$/.test(value)) {
    phone = value.replace(/\D/g, "");
  } else {
    const url = parseHttpsUrl(value);
    if (url?.hostname === "wa.me" || url?.hostname === "www.wa.me") {
      phone = url.pathname.match(/^\/(\d+)\/?$/)?.[1];
    } else if (url && ["api.whatsapp.com", "www.whatsapp.com", "whatsapp.com"].includes(url.hostname) && /^\/send\/?$/.test(url.pathname)) {
      const numbers = url.searchParams.getAll("phone");
      if (numbers.length === 1) phone = numbers[0].replace(/^\+/, "");
    }
  }
  return phone && phonePattern.test(phone) ? `https://wa.me/${phone}` : null;
}

function normalizeSocialLink(platform: SocialPlatform, raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > SOCIAL_LINK_MAX_LENGTH) return null;
  if (platform === "whatsapp") return normalizeWhatsApp(raw.trim());

  const url = parseHttpsUrl(raw);
  if (!url) return null;

  const { hostname } = url;
  const path = url.pathname.replace(/\/$/, "");
  const allowedHost = platformHosts[platform].includes(hostname)
    || (platform === "linkedin" && /^[a-z]{2}\.linkedin\.com$/.test(hostname));
  if (!allowedHost) return null;

  // Rebuild known profile routes without tracking, redirect parameters, or fragments.
  switch (platform) {
    case "facebook": {
      const ids = url.searchParams.getAll("id");
      if (path === "/profile.php" && ids.length === 1 && /^[0-9]+$/.test(ids[0])) {
        return `https://www.facebook.com/profile.php?id=${ids[0]}`;
      }
      if (/^\/(?:people|pages)\/[\w.-]+\/[0-9]+$/.test(path)) return `https://www.facebook.com${path}`;
      if (!/^\/[\w.]+$/.test(path) || /\.php$/i.test(path) || reservedPaths.facebook.test(path.slice(1))) return null;
      return `https://www.facebook.com${path}`;
    }
    case "instagram":
      if (!/^\/[\w.]{1,30}$/.test(path) || reservedPaths.instagram.test(path.slice(1))) return null;
      return `https://www.instagram.com${path}/`;
    case "youtube":
      if (!/^\/(?:@[\p{L}\p{N}\p{M}_.-]+|(?:channel|c|user)\/[\w.-]+)(?:\/(?:featured|videos|shorts|streams|playlists|community|about))?$/u.test(decodeYouTubeHandle(path))) return null;
      return `https://www.youtube.com${path}`;
    case "linkedin":
      if (!/^\/(?:in|company|school|showcase)\/[\w.-]+$/.test(path)) return null;
      return `https://www.linkedin.com${path}/`;
    case "x":
      if (!/^\/[\w]{1,15}$/.test(path) || reservedPaths.x.test(path.slice(1))) return null;
      return `https://x.com${path}`;
  }
}

function decodeYouTubeHandle(path: string): string {
  try {
    const [prefix, handle, ...tabs] = path.split("/");
    if (!handle?.startsWith("@")) return path;
    const decoded = decodeURIComponent(handle);
    return decoded.includes("/") ? "" : [prefix, decoded, ...tabs].join("/");
  } catch {
    return "";
  }
}

function isSocialLinkRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readInstituteSocialLinks(value: unknown): InstituteSocialLinks {
  if (!isSocialLinkRecord(value)) return {};
  const links: InstituteSocialLinks = {};
  for (const { key } of SOCIAL_LINK_FIELDS) {
    const url = normalizeSocialLink(key, value[key]);
    if (url) links[key] = url;
  }
  return links;
}

export function parseInstituteSocialLinks(value: FormDataEntryValue | null):
  | { links: InstituteSocialLinks | null | undefined }
  | { error: string } {
  // Missing means leave the column alone. A submitted empty set clears the column.
  if (value === null) return { links: undefined };
  if (typeof value !== "string" || value.length > MAX_SOCIAL_LINK_PAYLOAD) {
    return { error: "Social media links must be a valid set of optional profile links." };
  }

  let submitted: unknown;
  try {
    submitted = JSON.parse(value);
  } catch {
    return { error: "Social media links could not be read." };
  }

  if (submitted === null) return { links: null };
  if (!isSocialLinkRecord(submitted) || Object.keys(submitted).some((key) => !SOCIAL_LINK_FIELDS.some((field) => field.key === key))) {
    return { error: "Social media links must use the supported platforms." };
  }

  const links: InstituteSocialLinks = {};
  for (const { key, label } of SOCIAL_LINK_FIELDS) {
    const raw = submitted[key];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.length <= SOCIAL_LINK_MAX_LENGTH && !raw.trim())) continue;
    const url = normalizeSocialLink(key, raw);
    if (!url) {
      return {
        error: key === "whatsapp"
          ? "Enter a valid international WhatsApp number with country code or a WhatsApp chat URL."
          : `Enter a valid HTTPS ${label} profile URL (up to ${SOCIAL_LINK_MAX_LENGTH} characters).`,
      };
    }
    links[key] = url;
  }
  return { links: Object.keys(links).length ? links : null };
}
