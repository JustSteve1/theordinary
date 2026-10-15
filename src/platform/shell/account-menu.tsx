import { signOut } from "@/src/platform/auth-actions";

export function AccountMenu({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-4">
      <p className="text-stone-400">{name}</p>
      <form action={signOut}>
        <button type="submit" className="text-[#0a84ff]">
          Sign out
        </button>
      </form>
    </div>
  );
}
