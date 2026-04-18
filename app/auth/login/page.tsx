import { LoginForm } from "@/components/auth/login-form";

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.status;
  const pendingApproval = status === "pending_approval";
  const rejected = status === "rejected";

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in with your Vidya Infinity account.</p>
      {pendingApproval && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Registration submitted successfully. Your account will be activated after admin approval.
        </p>
      )}
      {rejected && (
        <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Your account was rejected during moderation. Please review the rejection reason in your profile, correct details/documents, and resubmit using the same account.
        </p>
      )}
      <LoginForm />
    </div>
  );
}
