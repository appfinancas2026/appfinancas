import './globals.css';

export const metadata = {
  title: 'AppFinançasBr',
  description: 'Controle financeiro completo para PF e PJ. Controle. Planeje. Realize.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AppFinançasBr',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F1214',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var tema = localStorage.getItem('financas-tema');
                if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
              } catch (e) {}

              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
