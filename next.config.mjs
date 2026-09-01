/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'santeetlongevite.vercel.app',
          },
        ],
        destination: 'https://sciencetruths.com/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
