import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '墨界·私人网文创作台',
    short_name: '墨界',
    description: '面向受邀创作者的离线优先私人网文创作、设定与版本管理空间。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4efe7',
    theme_color: '#2f2925',
    orientation: 'any',
    categories: ['productivity', 'writing'],
    icons: [
      {
        src: '/mojie-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  };
}
