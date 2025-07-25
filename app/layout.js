import Head from "./head";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "DashCode API Dashboard",
  description: "DashCode API Dashboard: Template admin open-source Next.js 13 dengan fitur API dan komponen server terbaru. Futuristik, cepat, dan responsif.",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["nextjs", "next14", "pwa", "next-pwa", "dashcode", "admin", "dashboard"],
  themeColor: "#2196F3",
  authors: [
    {
      name: "AyGemuy",
      url: "https://www.github.com/AyGemuy/",
    },
  ],
  viewport:
    "minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, viewport-fit=cover",
  icons: [
    { rel: "apple-touch-icon", url: "/images/favicon/favicon.png", sizes: "192x192" },
    { rel: "icon", url: "/images/favicon/favicon.png", sizes: "192x192" },
  ],
  appleWebApp: {
    capable: true,
    title: "DashCode API Dashboard",
    statusBarStyle: "default",
  },
  applicationName: "DashCode",
};

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="id">
      <Head>
      </Head>
      <body className={`${inter.className} font-inter custom-tippy dashcode-app`}>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
