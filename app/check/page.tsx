import { Suspense } from "react";
import CheckClient from "./CheckClient";
import Spinner from "@/components/Spinner";

export default function CheckPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="h-8 w-8 text-[#185FA5]" />
        </div>
      }
    >
      <CheckClient />
    </Suspense>
  );
}
