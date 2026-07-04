import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "InvoiceFlow",
  description: "Invoice management app",
};

// Set the theme class before paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{var t=localStorage.getItem('invoiceflow-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
