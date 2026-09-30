import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Envio de planilhas (insumos e fichas do chef) por Server Action. O padrão é 1 MB e as
    // planilhas do chef com fotos passam disso; 10 MB dá folga sem abrir para arquivos enormes.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
