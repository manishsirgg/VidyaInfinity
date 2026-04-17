import Link from "next/link";

export function WhatsAppFloat() {
  return (
    <Link
      href="https://wa.me/917828199500"
      target="_blank"
      className="fixed bottom-6 right-6 rounded-full bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-lg"
    >
      WhatsApp Support
    </Link>
  );
}
