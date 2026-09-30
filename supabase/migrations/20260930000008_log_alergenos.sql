-- Fichas Brava — Entrega 3: o catálogo de alérgenos é editado pelo app e entra no log.
alter table public.log_auditoria drop constraint log_auditoria_entidade_check;
alter table public.log_auditoria add constraint log_auditoria_entidade_check
    check (entidade in ('ficha', 'insumo', 'categoria', 'planilha', 'usuario', 'alergeno'));
