-- Fichas Brava — Entrega 2, parte 3: a ficha mostra "Verificada por <nome>", então quem
-- está logado precisa ler o nome dos perfis da própria casa (não só o próprio).
-- Continua sem enxergar perfis de outras casas, e perfis seguem sem escrita pelo app.
create policy perfis_ler_da_casa on public.perfis for select to authenticated
    using (empresa_id = (select public.minha_empresa()));
