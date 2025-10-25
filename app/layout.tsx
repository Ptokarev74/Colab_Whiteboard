import './globals.css';
// The import for 'next/font/google' has been removed to resolve the build error.
// We will rely on the system's default font (or the Tailwind config default).

// Metadata for the application (shows up in browser tab/search results)
export const metadata = {
  title: 'Collab Canvas | Real-Time Whiteboard',
  description: 'A collaborative, real-time whiteboard built with Next.js and TypeScript.',
};

// The RootLayout component wraps all pages in the 'app' directory
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Removed inter.className to fix the font import error.
          We now rely on Tailwind's default font. */}
      <body>
        {/* 'children' is a placeholder for the page content 
          (in our case, the content of app/page.tsx, which holds the Whiteboard).
          It ensures the Whiteboard component gets rendered inside this layout.
        */}
        {children}
      </body>
    </html>
  );
}
