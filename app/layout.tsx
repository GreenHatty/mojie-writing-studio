import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '墨界·私人网文创作台',
  description: '仅供所有者使用的私密中文写作空间。'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
