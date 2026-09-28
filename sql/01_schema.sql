
CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> a0b3c4259cb2

CREATE TABLE alergenos (
    id SERIAL NOT NULL, 
    nome VARCHAR NOT NULL, 
    icone VARCHAR, 
    descricao VARCHAR, 
    PRIMARY KEY (id), 
    UNIQUE (nome)
);

CREATE TABLE empresas (
    id SERIAL NOT NULL, 
    nome VARCHAR NOT NULL, 
    slug VARCHAR NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (nome), 
    UNIQUE (slug)
);

CREATE TABLE categorias (
    id SERIAL NOT NULL, 
    empresa_id INTEGER NOT NULL, 
    tipo VARCHAR NOT NULL, 
    nome VARCHAR NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(empresa_id) REFERENCES empresas (id), 
    CONSTRAINT uq_categoria_empresa_tipo_nome UNIQUE (empresa_id, tipo, nome)
);

CREATE INDEX ix_categorias_empresa_id ON categorias (empresa_id);

CREATE TABLE usuarios (
    id SERIAL NOT NULL, 
    nome VARCHAR NOT NULL, 
    email VARCHAR NOT NULL, 
    senha_hash VARCHAR NOT NULL, 
    senha_provisoria BOOLEAN NOT NULL, 
    ativo BOOLEAN NOT NULL, 
    papel VARCHAR NOT NULL, 
    empresa_id INTEGER, 
    criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(empresa_id) REFERENCES empresas (id), 
    UNIQUE (email)
);

CREATE TABLE acessos (
    id SERIAL NOT NULL, 
    usuario_id INTEGER NOT NULL, 
    empresa_id INTEGER, 
    criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(empresa_id) REFERENCES empresas (id), 
    FOREIGN KEY(usuario_id) REFERENCES usuarios (id)
);

CREATE INDEX ix_acessos_criado_em ON acessos (criado_em);

CREATE INDEX ix_acessos_empresa_id ON acessos (empresa_id);

CREATE INDEX ix_acessos_usuario_id ON acessos (usuario_id);

CREATE TABLE insumos (
    id SERIAL NOT NULL, 
    empresa_id INTEGER NOT NULL, 
    nome VARCHAR NOT NULL, 
    unidade_medida VARCHAR NOT NULL, 
    categoria_id INTEGER, 
    PRIMARY KEY (id), 
    FOREIGN KEY(categoria_id) REFERENCES categorias (id) ON DELETE SET NULL, 
    FOREIGN KEY(empresa_id) REFERENCES empresas (id), 
    CONSTRAINT uq_insumo_empresa_nome UNIQUE (empresa_id, nome)
);

CREATE INDEX ix_insumos_empresa_id ON insumos (empresa_id);

CREATE TABLE log_auditoria (
    id SERIAL NOT NULL, 
    empresa_id INTEGER, 
    usuario_id INTEGER NOT NULL, 
    acao VARCHAR NOT NULL, 
    entidade VARCHAR NOT NULL, 
    descricao VARCHAR NOT NULL, 
    criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(empresa_id) REFERENCES empresas (id), 
    FOREIGN KEY(usuario_id) REFERENCES usuarios (id)
);

CREATE INDEX ix_log_auditoria_empresa_id ON log_auditoria (empresa_id);

CREATE TABLE receitas (
    id SERIAL NOT NULL, 
    empresa_id INTEGER NOT NULL, 
    nome VARCHAR NOT NULL, 
    categoria_id INTEGER, 
    rendimento_quantidade NUMERIC(10, 2) NOT NULL, 
    rendimento_unidade VARCHAR NOT NULL, 
    foto_url VARCHAR, 
    observacoes VARCHAR, 
    dificuldade VARCHAR, 
    verificada BOOLEAN NOT NULL, 
    verificada_em TIMESTAMP WITHOUT TIME ZONE, 
    validade_congelado_dias INTEGER, 
    validade_refrigerado_dias INTEGER, 
    validade_ambiente_dias INTEGER, 
    ativa BOOLEAN NOT NULL, 
    criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(categoria_id) REFERENCES categorias (id) ON DELETE SET NULL, 
    FOREIGN KEY(empresa_id) REFERENCES empresas (id), 
    CONSTRAINT uq_receita_empresa_nome UNIQUE (empresa_id, nome)
);

CREATE INDEX ix_receitas_empresa_id ON receitas (empresa_id);

CREATE TABLE passos_preparo (
    id SERIAL NOT NULL, 
    receita_id INTEGER NOT NULL, 
    ordem INTEGER NOT NULL, 
    descricao VARCHAR NOT NULL, 
    tempo_min INTEGER, 
    PRIMARY KEY (id), 
    FOREIGN KEY(receita_id) REFERENCES receitas (id) ON DELETE CASCADE
);

CREATE INDEX ix_passos_preparo_receita_id ON passos_preparo (receita_id);

CREATE TABLE receita_alergenos (
    receita_id INTEGER NOT NULL, 
    alergeno_id INTEGER NOT NULL, 
    PRIMARY KEY (receita_id, alergeno_id), 
    FOREIGN KEY(alergeno_id) REFERENCES alergenos (id) ON DELETE CASCADE, 
    FOREIGN KEY(receita_id) REFERENCES receitas (id) ON DELETE CASCADE
);

CREATE TABLE receita_insumos (
    id SERIAL NOT NULL, 
    receita_id INTEGER NOT NULL, 
    insumo_id INTEGER, 
    sub_receita_id INTEGER, 
    quantidade NUMERIC(10, 4) NOT NULL, 
    unidade_sub_receita VARCHAR, 
    observacao VARCHAR, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_receita_insumo_um_tipo CHECK ((insumo_id IS NOT NULL) != (sub_receita_id IS NOT NULL)), 
    FOREIGN KEY(insumo_id) REFERENCES insumos (id), 
    FOREIGN KEY(receita_id) REFERENCES receitas (id), 
    FOREIGN KEY(sub_receita_id) REFERENCES receitas (id)
);

CREATE INDEX ix_receita_insumos_receita_id ON receita_insumos (receita_id);

CREATE INDEX ix_receita_insumos_sub_receita_id ON receita_insumos (sub_receita_id);

INSERT INTO alembic_version (version_num) VALUES ('a0b3c4259cb2') RETURNING alembic_version.version_num;


