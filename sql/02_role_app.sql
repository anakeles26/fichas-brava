-- Role de conexão do FichaBase.
--
-- IMPORTANTE: troque a senha abaixo antes de rodar, e use essa mesma senha na
-- DATABASE_URL do app. Rode depois do 01_schema.sql e antes do rls_policies.sql.
--
-- Por que não usar a role "postgres" do Supabase: ela tem o atributo BYPASSRLS,
-- ou seja, ignora todas as regras de segurança por empresa sem dar erro — o
-- isolamento entre unidades simplesmente não valeria.

CREATE ROLE fichabase_app LOGIN PASSWORD 'TROQUE_POR_UMA_SENHA_FORTE' NOSUPERUSER NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO fichabase_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fichabase_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fichabase_app;

-- Tabelas e sequências criadas depois (novas migrações) já nascem liberadas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fichabase_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fichabase_app;

-- Conferência: deve listar fichabase_app com rolbypassrls = false.
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'fichabase_app';
