import './globals.css';

export const metadata = {
  title: 'Controle Financeiro',
  description: 'Controle financeiro pessoal e empresarial',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Finanças',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F6E56',
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
