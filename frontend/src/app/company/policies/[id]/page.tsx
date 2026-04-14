export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-[1200px] px-lg py-xl">
        <h1 className="text-2xl font-semibold text-gray-1000">Policy #{id}</h1>
        <p className="mt-sm text-sm text-alpha-40">Policy detail will go here.</p>
      </div>
    </main>
  );
}
