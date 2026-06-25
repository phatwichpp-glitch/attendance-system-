"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import Spinner from "@/components/Spinner";
import { IconGoogle } from "@/components/icons";

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/admin" });
  };

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="btn-outline w-full flex items-center justify-center gap-3"
    >
      {loading ? <Spinner className="h-4 w-4" /> : <IconGoogle size={18} />}
      <span>{loading ? "Signing in..." : "Sign In with Google"}</span>
    </button>
  );
}
