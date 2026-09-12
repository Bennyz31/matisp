/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // argon2 est un module natif : il doit rester hors du bundle serveur.
  serverExternalPackages: ["argon2", "@prisma/client"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
