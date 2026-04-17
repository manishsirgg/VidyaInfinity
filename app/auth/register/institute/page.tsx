import { InstituteRegisterForm } from "@/components/auth/institute-register-form";

export default function InstituteRegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Register as Institute</h1>
      <p className="mt-2 text-sm text-slate-600">Create institute account. Admin approval is required before publishing courses.</p>
      <InstituteRegisterForm />
    </div>
  );
}
