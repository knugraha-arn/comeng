import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "COMENG",
  description: "Community Engagement Monitoring Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
