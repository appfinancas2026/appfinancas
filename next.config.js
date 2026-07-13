/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Desativa a concatenação de módulos do webpack (scope hoisting).
    // Essa otimização, combinada com bibliotecas grandes como @supabase/supabase-js,
    // pode gerar "ReferenceError: Cannot access 'x' before initialization" em produção
    // depois da minificação — um bug conhecido do empacotador, não do código do app.
    config.optimization.concatenateModules = false;
    return config;
  },
};

module.exports = nextConfig;
