/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // đóng gói gọn để chạy trong Docker / VPS
};

export default nextConfig;