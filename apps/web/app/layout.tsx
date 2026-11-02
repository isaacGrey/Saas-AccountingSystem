import "./globals.css";
export const metadata = {
  title: "Tala · Accounting workspace",
  description:
    "Philippine accounting, with clarity. Local development edition.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-PH">
      <body>{children}</body>
    </html>
  );
}
