"use client";

import { Copy, Facebook, Instagram, Linkedin, Mail, MessageSquare, Share2, Smartphone, Twitter } from "lucide-react";

type Props = {
  title: string;
  url: string;
  text?: string;
  className?: string;
};

function encoded(value: string) {
  return encodeURIComponent(value);
}

export function ShareActions({ title, url, text, className }: Props) {
  const message = text?.trim() ? text : `Check this out: ${title}`;

  async function onNativeShare() {
    if (typeof navigator === "undefined" || !("share" in navigator)) return;
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      // user cancelled
    }
  }

  async function onCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(url);
  }

  const channels = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encoded(`${message} ${url}`)}`,
      Icon: MessageSquare,
    },
    {
      label: "Email",
      href: `mailto:?subject=${encoded(title)}&body=${encoded(`${message}\n\n${url}`)}`,
      Icon: Mail,
    },
    {
      label: "SMS",
      href: `sms:?body=${encoded(`${message} ${url}`)}`,
      Icon: Smartphone,
    },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded(url)}`,
      Icon: Linkedin,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encoded(url)}`,
      Icon: Facebook,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encoded(message)}&url=${encoded(url)}`,
      Icon: Twitter,
    },
    {
      label: "Instagram",
      href: "https://www.instagram.com/",
      Icon: Instagram,
    },
  ] as const;

  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Share</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onNativeShare}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy link
        </button>
        {channels.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
