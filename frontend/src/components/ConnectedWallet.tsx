export default function ConnectedWallet({
  address,
  onDisconnect,
}: {
  address: string;
  onDisconnect: () => void;
}) {
  const truncated =
    address.length > 14
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  return (
    <button
      onClick={onDisconnect}
      className="flex items-center gap-2 rounded-pill border border-gray-500 px-sm py-xs text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors"
    >
      <span className="h-2 w-2 rounded-full bg-neon-glow" />
      {truncated}
    </button>
  );
}
