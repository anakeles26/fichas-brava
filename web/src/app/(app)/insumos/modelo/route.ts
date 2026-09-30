import { gerarModeloInsumos } from "@/lib/excel";

// Planilha modelo para importar insumos (Nome / Unidade / Categoria).
export async function GET() {
  return new Response(await gerarModeloInsumos(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo_insumos_fichas_brava.xlsx"',
    },
  });
}
