/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true }
  // typescript: { ignoreBuildErrors: true }, // ← only if you absolutely need to unblock
}
module.exports = nextConfig
