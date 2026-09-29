import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Mesma família de fonte do app Streamlit ("Source Sans").
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Fichas Brava", template: "%s · Fichas Brava" },
  description: "Fichas técnicas da cozinha do Brava Wine",
};

export const viewport: Viewport = { themeColor: "#3d0a16" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${sourceSans.variable} h-full antialiased`}>
      <head>
        {/* Ícones Material Symbols (os mesmos do app Streamlit). display=block de propósito:
            sem ele, o nome do ícone ("dashboard", "schedule") aparece como texto até a fonte carregar. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0..1,0&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
