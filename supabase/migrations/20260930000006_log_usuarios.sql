-- Fichas Brava — Entrega 3: a gestão cria e altera acessos pelo app; isso entra no log.
alter table public.log_auditoria drop constraint log_auditoria_entidade_check;
alter table public.log_auditoria add constraint log_auditoria_entidade_check
    check (entidade in ('ficha', 'insumo', 'categoria', 'planilha', 'usuario'));
