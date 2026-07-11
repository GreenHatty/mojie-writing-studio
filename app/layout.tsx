import type { Metadata } from 'next';
import './globals.css';
import './auth.css';
import './tools.css';
import './visual-tools.css';
import './ranking.css';
import './search-replace.css';

export const metadata: Metadata = {
  title: '墨界·私人网文创作台',
  description: '面向受邀创作者的中文网文写作、设定、备份与发布准备空间。'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
