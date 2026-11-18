import { Facebook, Globe, Instagram, Linkedin, Youtube } from "lucide-react";

import { normalizeInstituteWebsite, readInstituteSocialLinks, SOCIAL_LINK_FIELDS } from "@/lib/institutes/social-links";

function XIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.2l7.3-8.4L2.8 2h6.5l4.5 5.9L18.9 2Zm-1.1 18h1.7L8.4 3.9H6.6L17.8 20Z" />
    </svg>
  );
}

function WhatsAppIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a9.9 9.9 0 0 0-8.6 14.8L2 22l5.3-1.4A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.4A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1-1.8-.9c-.3-.1-.5-.1-.7.2l-.8 1c-.2.2-.4.2-.7.1a6.6 6.6 0 0 1-3.2-2.8c-.2-.3 0-.4.1-.6l.5-.6c.1-.2.2-.4.1-.6l-.8-1.9c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.3.3-.9.8-.9 2s.9 2.4 1 2.6c.1.2 1.7 2.7 4.2 3.8.6.3 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.1-1.2l-.5-.4Z" />
    </svg>
  );
}

const platformIcons = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  linkedin: Linkedin,
  x: XIcon,
  whatsapp: WhatsAppIcon,
};

export function InstituteSocialLinks({ links, website }: { links: unknown; website: unknown }) {
  const socialLinks = readInstituteSocialLinks(links);
  const destinations = [
    ...SOCIAL_LINK_FIELDS.map(({ key, label }) => ({ label, href: socialLinks[key], Icon: platformIcons[key] })),
    { label: "Website", href: normalizeInstituteWebsite(website), Icon: Globe },
  ].filter((destination) => destination.href);

  if (!destinations.length) return null;

  return (
    <section className="mt-5" aria-labelledby="institute-connect-heading">
      <h2 id="institute-connect-heading" className="text-sm font-semibold text-slate-900">Connect With Us</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {destinations.map(({ label, href, Icon }) => (
          <li key={label}>
            <a
              href={href ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} (opens in a new tab)`}
              title={label}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-700 transition-colors hover:border-brand-600 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Icon size={19} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
