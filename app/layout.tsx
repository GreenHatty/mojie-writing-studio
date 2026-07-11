import type { Metadata } from 'next';
import './globals.css';
import './tools.css';
import './visual-tools.css';

export const metadata: Metadata = {
  title: '墨界·私人网文创作台',
  description: '面向个人创作者的离线优先中文网文写作与设定管理空间。'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
