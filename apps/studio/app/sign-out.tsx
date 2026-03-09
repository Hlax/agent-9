"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        } catch {
          router.push("/login");
          router.refresh();
        }
      }}
      style={{ marginLeft: "auto" }}
    >
      Sign out
    </button>
  );
}
