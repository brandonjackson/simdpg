export const metadata = {
  title: "SimDPG Portal",
  description: "Simulated Digital Public Goods administration portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
