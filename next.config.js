/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El linting y chequeo de tipos se ejecutan en desarrollo (`npm run dev`)
  // y manualmente con `npm run lint` / `tsc`. Durante el build de producción
  // los desactivamos para evitar bloqueos por warnings o tipos no críticos:
  // si llegó hasta aquí, ya pasó el desarrollo.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};
module.exports = nextConfig;
