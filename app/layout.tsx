import type { Metadata } from 'next';
import './globals.css';
import './comments.css';
import './connection-wizard.css';

export const metadata: Metadata = {
  title: 'SocialDesk — Quản lý bài viết Facebook',
  description:
    'Soạn bài, quản lý tài khoản và theo dõi bài đăng Facebook trong một nơi.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
