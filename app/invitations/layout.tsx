export default function InvitationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg p-8">{children}</div>
    </main>
  );
}
