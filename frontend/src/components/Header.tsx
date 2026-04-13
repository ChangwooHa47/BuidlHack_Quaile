import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-lg">
        <Link href="/" className="text-xl font-semibold tracking-tight text-gray-1000">
          Qualie.
        </Link>

        <nav className="flex items-center gap-xl">
          <Link href="/" className="text-sm font-medium text-gray-800 hover:text-gray-1000 transition-colors">
            Project
          </Link>
          <Link href="/profile" className="text-sm font-medium text-gray-700 hover:text-gray-1000 transition-colors">
            Profile
          </Link>
        </nav>

        <button className="rounded-pill border border-gray-500 px-md py-xs text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors">
          Connect Wallet
        </button>
      </div>
    </header>
  );
}
