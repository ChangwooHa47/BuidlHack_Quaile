import CompanyHeader from "@/components/CompanyHeader";

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CompanyHeader />
      {children}
    </>
  );
}
