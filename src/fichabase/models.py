"""Modelo de dados multi-tenant: cada unidade é uma `Empresa`, e os
dados operacionais (insumos, receitas, categorias, logs) pertencem a
exatamente uma empresa. `Alergeno` é a exceção: catálogo global compartilhado
por todas as empresas (é uma lista fixa de tipos de alérgeno, não um dado
operacional de cada loja)."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fichabase.db import Base

# Hierarquia de papéis: cada nível abaixo tem um subconjunto de permissões do
# nível acima, exceto pela verificação de ficha técnica (só admin_master).
PAPEIS = ("admin_master", "admin", "lider", "usuario")

PAPEL_LABELS = {
    "admin_master": "Admin master",
    "admin": "Admin",
    "lider": "Líder",
    "usuario": "Usuário",
}

# Tipo de categoria: de insumo (estoque) ou de ficha técnica (cardápio).
CATEGORIA_INSUMO = "insumo"
CATEGORIA_FICHA = "ficha"
TIPOS_CATEGORIA = (CATEGORIA_INSUMO, CATEGORIA_FICHA)

# Situação de uma auditoria de ficha técnica (menu Auditorias).
class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(unique=True)
    slug: Mapped[str] = mapped_column(unique=True)

    usuarios: Mapped[list[Usuario]] = relationship(back_populates="empresa")
    insumos: Mapped[list[Insumo]] = relationship(back_populates="empresa")
    receitas: Mapped[list[Receita]] = relationship(back_populates="empresa")
    categorias: Mapped[list[Categoria]] = relationship(back_populates="empresa")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str]
    email: Mapped[str] = mapped_column(unique=True)
    senha_hash: Mapped[str]
    senha_provisoria: Mapped[bool] = mapped_column(default=False)
    ativo: Mapped[bool] = mapped_column(default=True)
    papel: Mapped[str] = mapped_column(default="usuario")  # ver PAPEIS
    # admin_master não pertence a uma empresa fixa: enxerga todas via seletor na UI.
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), nullable=True)
    criado_em: Mapped[dt.datetime] = mapped_column(default=dt.datetime.utcnow)

    empresa: Mapped[Empresa | None] = relationship(back_populates="usuarios")

    @property
    def eh_admin_master(self) -> bool:
        return self.papel == "admin_master"

    @property
    def pode_gerenciar_conteudo(self) -> bool:
        """Cria/edita fichas técnicas, insumos e categorias (mas não verifica)."""
        return self.papel in ("admin_master", "admin")

    @property
    def pode_verificar_ficha(self) -> bool:
        return self.papel == "admin_master"

    @property
    def pode_criar_usuario(self) -> bool:
        return self.papel in ("admin_master", "admin", "lider")


class Categoria(Base):
    """Categoria cadastrada por empresa — evita categoria digitada livre e
    divergente entre fichas.

    Dois tipos que não se misturam: categoria de insumo (Frios, Mercearia,
    Laticínios) organiza o estoque; categoria de ficha (Entradas, Pratos
    principais, Sobremesas) organiza o cardápio. O mesmo nome pode existir
    nos dois tipos."""

    __tablename__ = "categorias"
    __table_args__ = (
        UniqueConstraint("empresa_id", "tipo", "nome", name="uq_categoria_empresa_tipo_nome"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    tipo: Mapped[str] = mapped_column(default=CATEGORIA_FICHA)  # ver TIPOS_CATEGORIA
    nome: Mapped[str]

    empresa: Mapped[Empresa] = relationship(back_populates="categorias")


class Insumo(Base):
    __tablename__ = "insumos"
    __table_args__ = (UniqueConstraint("empresa_id", "nome", name="uq_insumo_empresa_nome"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str]
    unidade_medida: Mapped[str]  # ex: kg, g, l, ml, un
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id", ondelete="SET NULL"), nullable=True
    )

    empresa: Mapped[Empresa] = relationship(back_populates="insumos")
    categoria: Mapped[Categoria | None] = relationship()


class Receita(Base):
    """Ficha técnica: uma receita padronizada (modo de preparo + composição de insumos)."""

    __tablename__ = "receitas"
    __table_args__ = (UniqueConstraint("empresa_id", "nome", name="uq_receita_empresa_nome"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    nome: Mapped[str]
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id", ondelete="SET NULL"), nullable=True
    )
    rendimento_quantidade: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    rendimento_unidade: Mapped[str] = mapped_column(default="un")  # kg, g, l, ml, un
    foto_url: Mapped[str | None]
    observacoes: Mapped[str | None]
    dificuldade: Mapped[str | None]  # "Fácil" | "Médio" | "Difícil"
    verificada: Mapped[bool] = mapped_column(default=False)
    verificada_em: Mapped[dt.datetime | None]
    # Validade em dias por forma de armazenamento. Cada uma é opcional: a
    # ficha pode ter as três, só algumas ou nenhuma (vazio = não se aplica).
    validade_congelado_dias: Mapped[int | None]
    validade_refrigerado_dias: Mapped[int | None]
    validade_ambiente_dias: Mapped[int | None]
    # Inativar em vez de excluir: a ficha pode estar em uso como sub-receita
    # de outras fichas e tem histórico de conferências/auditoria atrelado.
    ativa: Mapped[bool] = mapped_column(default=True)
    criado_em: Mapped[dt.datetime] = mapped_column(default=dt.datetime.utcnow)

    empresa: Mapped[Empresa] = relationship(back_populates="receitas")
    categoria: Mapped[Categoria | None] = relationship()
    itens: Mapped[list[ReceitaInsumo]] = relationship(
        back_populates="receita",
        cascade="all, delete-orphan",
        foreign_keys="ReceitaInsumo.receita_id",
    )
    passos: Mapped[list[PassoPreparo]] = relationship(
        back_populates="receita", cascade="all, delete-orphan", order_by="PassoPreparo.ordem"
    )
    alergenos: Mapped[list[Alergeno]] = relationship(secondary="receita_alergenos")


class ReceitaInsumo(Base):
    """Linha de composição de uma ficha técnica: quanto de cada insumo (ou de
    outra ficha técnica, usada como sub-receita) entra na receita. Exatamente
    um entre `insumo_id`/`sub_receita_id` é preenchido — nunca os dois, nunca
    nenhum."""

    __tablename__ = "receita_insumos"
    __table_args__ = (
        CheckConstraint(
            "(insumo_id IS NOT NULL) != (sub_receita_id IS NOT NULL)",
            name="ck_receita_insumo_um_tipo",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    receita_id: Mapped[int] = mapped_column(ForeignKey("receitas.id"), index=True)
    insumo_id: Mapped[int | None] = mapped_column(ForeignKey("insumos.id"), nullable=True)
    sub_receita_id: Mapped[int | None] = mapped_column(ForeignKey("receitas.id"), nullable=True, index=True)
    quantidade: Mapped[float] = mapped_column(Numeric(10, 4))
    unidade_sub_receita: Mapped[str | None]  # só usado quando sub_receita_id é setado (kg, g, l, ml, un)
    observacao: Mapped[str | None]  # ex: "Câmara refrigerada", "Manipulado"

    receita: Mapped[Receita] = relationship(back_populates="itens", foreign_keys=[receita_id])
    insumo: Mapped[Insumo | None] = relationship()
    sub_receita: Mapped[Receita | None] = relationship(foreign_keys=[sub_receita_id])

    @property
    def unidade(self) -> str:
        return self.unidade_sub_receita if self.sub_receita_id else self.insumo.unidade_medida

    @property
    def nome_item(self) -> str:
        return self.sub_receita.nome if self.sub_receita_id else self.insumo.nome


class PassoPreparo(Base):
    """Um passo do modo de preparo de uma ficha técnica, em ordem. `ordem` é
    0-based e reatribuída inteira a cada reordenação (sem gaps)."""

    __tablename__ = "passos_preparo"

    id: Mapped[int] = mapped_column(primary_key=True)
    receita_id: Mapped[int] = mapped_column(ForeignKey("receitas.id", ondelete="CASCADE"), index=True)
    ordem: Mapped[int]
    descricao: Mapped[str]
    tempo_min: Mapped[int | None]

    receita: Mapped[Receita] = relationship(back_populates="passos")


class Alergeno(Base):
    """Catálogo global de alérgenos (não é por empresa — é a mesma lista pra
    todas as unidades, como nos rótulos regulatórios de alimentos)."""

    __tablename__ = "alergenos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(unique=True)
    icone: Mapped[str | None]  # emoji exibido ao lado do nome
    descricao: Mapped[str | None]


class ReceitaAlergeno(Base):
    """Associação N:N entre ficha técnica e os alérgenos que ela contém."""

    __tablename__ = "receita_alergenos"

    receita_id: Mapped[int] = mapped_column(ForeignKey("receitas.id", ondelete="CASCADE"), primary_key=True)
    alergeno_id: Mapped[int] = mapped_column(ForeignKey("alergenos.id", ondelete="CASCADE"), primary_key=True)


class Acesso(Base):
    """Uma entrada no sistema (login), para a tela Log de acessos: quem
    entrou, de qual casa e quando. Um registro por sessão, não por página.

    `empresa_id` é nulo no admin master, que não pertence a uma casa fixa
    (escolhe a operação no seletor depois de entrar)."""

    __tablename__ = "acessos"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), nullable=True, index=True)
    criado_em: Mapped[dt.datetime] = mapped_column(default=dt.datetime.utcnow, index=True)

    usuario: Mapped[Usuario] = relationship()
    empresa: Mapped[Empresa | None] = relationship()


class LogAuditoria(Base):
    """Trilha de auditoria: quem criou/editou/removeu o quê, e quando."""

    __tablename__ = "log_auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), nullable=True, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    acao: Mapped[str]  # "criar" | "editar" | "excluir"
    entidade: Mapped[str]  # "Insumo" | "Receita" | "Categoria" | "Usuario" | ...
    descricao: Mapped[str]
    criado_em: Mapped[dt.datetime] = mapped_column(default=dt.datetime.utcnow)

    empresa: Mapped[Empresa | None] = relationship()
    usuario: Mapped[Usuario] = relationship()
