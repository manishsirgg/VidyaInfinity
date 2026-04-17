import { UnifiedRegisterForm } from "@/components/auth/unified-register-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">User Registration</h1>
      <p className="mt-2 text-sm text-slate-600">
        Students, institutes, universities, colleges and admins all register here with complete details and verification
        documents for admin approval.
      </p>
      <UnifiedRegisterForm />
    </div>
  );
}
