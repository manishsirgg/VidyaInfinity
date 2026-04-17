import Link from "next/link";

export function WhatsAppFloat() {
  return (
    <Link
      href="https://wa.me/917828199500"
      target="_blank"
      className="fixed bottom-4 right-4 z-40 rounded-full bg-emerald-500 px-3 py-2 text-xs font-medium text-white shadow-lg sm:bottom-6 sm:right-6 sm:px-4 sm:py-3 sm:text-sm"
    >
      WhatsApp Support
    </Link>
  );
}
