import type { Metadata } from 'next';
import './globals.css';
import './auth.css';
import './tools.css';
import './writing-assistant.css';
import './cloud-docx.css';
import './visual-tools.css';
import './ranking.css';
import './ranking-automation.css';
import './search-replace.css';
import './collaboration-admin.css';

export const metadata: Metadata = {
  title: '墨界·私人网文创作台',
  description: '面向受邀创作者的中文网文写作、设定、协作、备份与发布准备空间。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/mojie-icon.svg', apple: '/mojie-icon.svg' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const icpNumber = process.env.MOJIE_ICP_NUMBER?.trim();
  return (
    <html lang="zh-CN">
      <body>
        {children}
        {icpNumber ? <a className="icp-footer" href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">{icpNumber}</a> : null}
      </body>
    </html>
  );
}
