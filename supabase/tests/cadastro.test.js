import { beforeAll, describe, expect, test } from "vitest";
import { como, criarBanco } from "./banco.js";

const GESTAO = "00000000-0000-0000-0000-00000000000a";
const COZINHA = "00000000-0000-0000-0000-00000000000b";
const OUTRA_CASA = "00000000-0000-0000-0000-00000000000d";

let db;

beforeAll(async () => {
  db = await criarBanco();
  await db.exec(`
    insert into public.empresas (id, nome, slug) overriding system value values
      (1, 'Brava Wine', 'brava-wine'), (2, 'Outra Casa', 'outra-casa');
    insert into auth.users (id) values ('${GESTAO}'), ('${COZINHA}'), ('${OUTRA_CASA}');
    insert into public.perfis (id, empresa_id, nome, papel) values
      ('${GESTAO}', 1, 'Ana', 'gestao'), ('${COZINHA}', 1, 'Cozinha', 'cozinha'), ('${OUTRA_CASA}', 2, 'Outra', 'gestao');
    insert into public.categorias (id, empresa_id, tipo, nome) overriding system value values
      (1, 1, 'insumo', 'Laticínios'), (2, 1, 'ficha', 'Molhos'), (3, 2, 'insumo', 'Da outra');
    insert into public.insumos (id, empresa_id, nome, unidade) overriding system value values
      (1, 1, 'Leite integral', 'g'), (2, 1, 'Farinha de trigo', 'g'), (3, 2, 'Sal da outra', 'g');
    insert into public.fichas (id, empresa_id, nome, rendimento_qtd, rendimento_unidade) overriding system value values
      (1, 1, 'Molho bechamel', 5000, 'g'), (2, 2, 'Ficha da outra', 100, 'g');
    insert into public.alergenos (id, nome) overriding system value values (1, 'Glúten'), (2, 'Lactose');
  `);
  for (const t of ["empresas", "categorias", "insumos", "fichas", "alergenos"]) {
    await db.exec(`select setval(pg_get_serial_sequence('public.${t}', 'id'), (select max(id) from public.${t}))`);
  }
});

const rpc = (tx, funcao, ...args) =>
  tx.query(`select public.${funcao}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args).then((r) => r.rows[0].r);

// Executa esperando erro; devolve a mensagem. Savepoint para a transação seguir usável.
async function erro(tx, fn) {
  await tx.exec("savepoint tentativa");
  try {
    await fn();
  } catch (e) {
    await tx.exec("rollback to savepoint tentativa");
    return e.message;
  }
  await tx.exec("release savepoint tentativa");
  return null;
}

const linhas = async (tx, sql, params = []) => (await tx.query(sql, params)).rows;

const FICHA = {
  nome: "Molho da casa",
  categoria_id: 2,
  rendimento_qtd: 1000,
  rendimento_unidade: "g",
  validade_refrigerado_dias: 3,
  observacoes: "Obs",
  itens: [
    { insumo_id: 1, quantidade: 800, observacao: "quente" },
    { sub_ficha_id: 1, quantidade: 200, unidade_sub: "g" },
  ],
  passos: [{ descricao: "Aquecer" }, { descricao: "Misturar", tempo_min: 5 }, { descricao: "  " }],
  alergeno_ids: [2, 1, 2],
};

describe("quem pode gravar", () => {
  const chamadas = [
    ["salvar_categoria", [{ tipo: "insumo", nome: "X" }]],
    ["excluir_categoria", [1]],
    ["salvar_insumo", [{ nome: "X", unidade: "g" }]],
    ["mudar_categoria_insumos", [[1], 1]],
    ["importar_insumos", [[{ nome: "X", unidade: "g" }]]],
    ["salvar_ficha", [FICHA]],
    ["definir_ficha_ativa", [1, false]],
    ["verificar_ficha", [1]],
    ["importar_planilha", [{ arquivo: "x.xlsx", fichas: [] }]],
  ];

  test.each(chamadas)("cozinha é recusada em %s", async (funcao, args) => {
    await como(db, COZINHA, async (tx) => {
      expect(await erro(tx, () => rpc(tx, funcao, ...args))).toMatch(/Apenas a gestão/);
    });
  });

  test.each(chamadas)("sem login não executa %s", async (funcao, args) => {
    await como(db, null, async (tx) => {
      expect(await erro(tx, () => rpc(tx, funcao, ...args))).toMatch(/permission denied/);
    });
  });

  test("funções internas não são acessíveis pela API (schema interno)", async () => {
    await como(db, null, async (tx) => {
      expect(await erro(tx, () => tx.query("select interno.exigir_gestao()"))).toMatch(/permission denied/);
    });
  });
});

describe("categorias", () => {
  test("cria, renomeia, recusa repetida e registra no log", async () => {
    await como(db, GESTAO, async (tx) => {
      const id = await rpc(tx, "salvar_categoria", { tipo: "insumo", nome: "Hortifruti" });
      await rpc(tx, "salvar_categoria", { id, tipo: "insumo", nome: "Hortifrúti" });
      expect(await erro(tx, () => rpc(tx, "salvar_categoria", { tipo: "insumo", nome: "Laticínios" }))).toMatch(
        /Já existe uma categoria/,
      );
      const log = await linhas(tx, "select acao, descricao, usuario_id from public.log_auditoria order by id");
      expect(log.map((l) => l.acao)).toEqual(["criar", "editar"]);
      expect(log[1].descricao).toContain('"Hortifruti" para "Hortifrúti"');
      expect(log.every((l) => l.usuario_id === GESTAO)).toBe(true);
    });
  });

  test("excluir deixa insumos sem categoria", async () => {
    await como(db, GESTAO, async (tx) => {
      await tx.query("update public.insumos set categoria_id = 1 where id = 1");
      await rpc(tx, "excluir_categoria", 1);
      expect((await linhas(tx, "select categoria_id from public.insumos where id = 1"))[0].categoria_id).toBeNull();
    });
  });
});

describe("insumos", () => {
  test("cria, edita e recusa nome repetido (sem diferenciar maiúsculas)", async () => {
    await como(db, GESTAO, async (tx) => {
      const id = await rpc(tx, "salvar_insumo", { nome: "Ovos", unidade: "un", categoria_id: 1 });
      expect(await erro(tx, () => rpc(tx, "salvar_insumo", { nome: "leite INTEGRAL", unidade: "g" }))).toMatch(
        /Já existe um insumo/,
      );
      await rpc(tx, "salvar_insumo", { id, nome: "Ovos caipira", unidade: "un" });
      expect(await linhas(tx, "select nome, categoria_id from public.insumos where id = $1", [id])).toEqual([
        { nome: "Ovos caipira", categoria_id: null },
      ]);
    });
  });

  test("não edita insumo de outra casa", async () => {
    await como(db, GESTAO, async (tx) => {
      expect(await erro(tx, () => rpc(tx, "salvar_insumo", { id: 3, nome: "Invasão", unidade: "g" }))).toMatch(
        /não encontrado/,
      );
    });
  });

  test("muda a categoria de vários de uma vez", async () => {
    await como(db, GESTAO, async (tx) => {
      expect(await rpc(tx, "mudar_categoria_insumos", [1, 2], 1)).toBe(2);
    });
  });

  test("importa planilha: pula existentes e cria categoria que falta", async () => {
    await como(db, GESTAO, async (tx) => {
      const r = await rpc(tx, "importar_insumos", [
        { nome: "Leite integral", unidade: "g" },
        { nome: "Tomate", unidade: "kg", categoria: "Hortifruti" },
        { nome: "", unidade: "g" },
      ]);
      expect(r).toEqual({ criados: 1, ignorados: 2, categorias_criadas: ["Hortifruti"] });
    });
  });
});

describe("fichas", () => {
  test("cria a ficha inteira: dados, itens na ordem, passos e alérgenos", async () => {
    await como(db, GESTAO, async (tx) => {
      const id = await rpc(tx, "salvar_ficha", FICHA);
      expect(
        await linhas(tx, "select ordem, insumo_id, sub_ficha_id, unidade_sub, observacao from public.ficha_itens where ficha_id = $1 order by ordem", [id]),
      ).toEqual([
        { ordem: 0, insumo_id: 1, sub_ficha_id: null, unidade_sub: null, observacao: "quente" },
        { ordem: 1, insumo_id: null, sub_ficha_id: 1, unidade_sub: "g", observacao: null },
      ]);
      expect((await linhas(tx, "select descricao from public.passos where ficha_id = $1 order by ordem", [id])).map((p) => p.descricao)).toEqual([
        "Aquecer",
        "Misturar",
      ]);
      expect(await linhas(tx, "select alergeno_id from public.ficha_alergenos where ficha_id = $1 order by 1", [id])).toHaveLength(2);
    });
  });

  test("editar substitui o conteúdo e mantém o id", async () => {
    await como(db, GESTAO, async (tx) => {
      const id = await rpc(tx, "salvar_ficha", FICHA);
      const mesmo = await rpc(tx, "salvar_ficha", { ...FICHA, id, nome: "Molho da casa 2", itens: [{ insumo_id: 2, quantidade: 10 }], passos: [], alergeno_ids: [] });
      expect(mesmo).toBe(id);
      expect(await linhas(tx, "select insumo_id from public.ficha_itens where ficha_id = $1", [id])).toEqual([{ insumo_id: 2 }]);
      expect(await linhas(tx, "select 1 from public.passos where ficha_id = $1", [id])).toHaveLength(0);
    });
  });

  test("tudo ou nada: item inválido no meio não deixa a ficha gravada", async () => {
    await como(db, GESTAO, async (tx) => {
      const msg = await erro(tx, () =>
        rpc(tx, "salvar_ficha", { ...FICHA, itens: [{ insumo_id: 1, quantidade: 1 }, { insumo_id: 999, quantidade: 1 }] }),
      );
      expect(msg).not.toBeNull();
      expect(await linhas(tx, "select 1 from public.fichas where nome = 'Molho da casa'")).toHaveLength(0);
      expect(await linhas(tx, "select 1 from public.log_auditoria")).toHaveLength(0);
    });
  });

  test("recusa sub-receita circular (A usa B, B passa a usar A)", async () => {
    await como(db, GESTAO, async (tx) => {
      const a = await rpc(tx, "salvar_ficha", { ...FICHA, nome: "A", itens: [{ sub_ficha_id: 1, quantidade: 1, unidade_sub: "g" }] });
      const msg = await erro(tx, () =>
        rpc(tx, "salvar_ficha", { nome: "Molho bechamel", id: 1, rendimento_qtd: 5000, rendimento_unidade: "g", itens: [{ sub_ficha_id: a, quantidade: 1, unidade_sub: "g" }] }),
      );
      expect(msg).toMatch(/referência circular/);
    });
  });

  test("recusa nome repetido e ficha de outra casa", async () => {
    await como(db, GESTAO, async (tx) => {
      expect(await erro(tx, () => rpc(tx, "salvar_ficha", { ...FICHA, nome: "molho BECHAMEL" }))).toMatch(/Já existe uma ficha/);
      expect(await erro(tx, () => rpc(tx, "salvar_ficha", { ...FICHA, id: 2 }))).toMatch(/não encontrada/);
      expect(await erro(tx, () => rpc(tx, "salvar_ficha", { ...FICHA, itens: [{ insumo_id: 3, quantidade: 1 }] }))).not.toBeNull();
    });
  });

  test("inativa, reativa e verifica registrando quem verificou", async () => {
    await como(db, GESTAO, async (tx) => {
      await rpc(tx, "definir_ficha_ativa", 1, false);
      await rpc(tx, "definir_ficha_ativa", 1, true);
      await rpc(tx, "verificar_ficha", 1);
      const [f] = await linhas(tx, "select ativa, verificada, verificada_por, verificada_em is not null as tem_data from public.fichas where id = 1");
      expect(f).toEqual({ ativa: true, verificada: true, verificada_por: GESTAO, tem_data: true });
      expect((await linhas(tx, "select acao from public.log_auditoria order by id")).map((l) => l.acao)).toEqual([
        "inativar",
        "reativar",
        "verificar",
      ]);
    });
  });
});

describe("importar planilha do chef", () => {
  const PLANILHA = {
    arquivo: "FCT EXECUTIVO 8.xlsx",
    puladas: 1,
    novos_insumos: [{ ref: "n1", nome: "Parmesão", unidade: "g", categoria_id: 1 }],
    fichas: [
      {
        ref: "f1",
        nome: "Risoto de parmesão",
        rendimento_qtd: 300,
        rendimento_unidade: "g",
        alergeno_ids: [2],
        passos: [{ descricao: "Cozinhar o arroz." }],
        itens: [
          { insumo_id: null, insumo_ref: "n1", quantidade: 20 },
          { sub_ficha_id: null, sub_ficha_ref: "f2", quantidade: 50, unidade_sub: "g" },
          { sub_ficha_id: 1, quantidade: 30, unidade_sub: "g" },
        ],
      },
      { ref: "f2", nome: "Caldo", rendimento_qtd: 1000, rendimento_unidade: "g", itens: [{ insumo_id: 2, quantidade: 5 }] },
    ],
    apelidos: [
      { chave: "PARMESSAO", insumo_ref: "n1" },
      { chave: "CALDO DE LEGUMES", ficha_ref: "f2" },
    ],
  };

  test("cria insumos e fichas, liga as referências e aprende os apelidos", async () => {
    await como(db, GESTAO, async (tx) => {
      const r = await rpc(tx, "importar_planilha", PLANILHA);
      expect(r).toMatchObject({ fichas_criadas: 2, fichas_substituidas: 0, fichas_puladas: 1, insumos_criados: 1, apelidos_criados: 2 });
      const itens = await linhas(
        tx,
        `select i.nome as insumo, s.nome as sub from public.ficha_itens fi
         left join public.insumos i on i.id = fi.insumo_id left join public.fichas s on s.id = fi.sub_ficha_id
         where fi.ficha_id = $1 order by fi.ordem`,
        [r.fichas.f1],
      );
      expect(itens).toEqual([
        { insumo: "Parmesão", sub: null },
        { insumo: null, sub: "Caldo" },
        { insumo: null, sub: "Molho bechamel" },
      ]);
      const apelidos = await linhas(
        tx,
        "select a.chave, i.nome as insumo, f.nome as ficha from public.apelidos a left join public.insumos i on i.id = a.insumo_id left join public.fichas f on f.id = a.ficha_id order by a.chave",
      );
      expect(apelidos).toEqual([
        { chave: "CALDO DE LEGUMES", insumo: null, ficha: "Caldo" },
        { chave: "PARMESSAO", insumo: "Parmesão", ficha: null },
      ]);
      expect(await linhas(tx, "select arquivo, fichas_criadas from public.importacoes")).toEqual([
        { arquivo: "FCT EXECUTIVO 8.xlsx", fichas_criadas: 2 },
      ]);
    });
  });

  test("a mesma palavra pode ser apelido de prato e de ingrediente (caso ABACAXI)", async () => {
    await como(db, GESTAO, async (tx) => {
      await rpc(tx, "importar_planilha", {
        arquivo: "x.xlsx",
        fichas: [],
        apelidos: [
          { tipo: "prato", chave: "MOLHO", ficha_id: 1 },
          { tipo: "ingrediente", chave: "MOLHO", insumo_id: 2 },
        ],
      });
      expect(await linhas(tx, "select tipo, insumo_id, ficha_id from public.apelidos where chave = 'MOLHO' order by tipo")).toEqual([
        { tipo: "ingrediente", insumo_id: 2, ficha_id: null },
        { tipo: "prato", insumo_id: null, ficha_id: 1 },
      ]);
      expect(
        await erro(tx, () => tx.query("insert into public.apelidos (empresa_id, tipo, chave, insumo_id) values (1, 'prato', 'X', 1)")),
      ).toMatch(/apelidos_prato_e_ficha/);
    });
  });

  test("substituir mantém o id da ficha existente", async () => {
    await como(db, GESTAO, async (tx) => {
      const r = await rpc(tx, "importar_planilha", {
        arquivo: "x.xlsx",
        fichas: [{ ref: "f", id: 1, nome: "Molho bechamel", rendimento_qtd: 4000, rendimento_unidade: "g", itens: [{ insumo_id: 1, quantidade: 4000 }] }],
      });
      expect(r).toMatchObject({ fichas_criadas: 0, fichas_substituidas: 1 });
      expect(await linhas(tx, "select id, rendimento_qtd::float as r from public.fichas where nome = 'Molho bechamel'")).toEqual([{ id: 1, r: 4000 }]);
    });
  });

  test("tudo ou nada: nome repetido cancela a planilha inteira", async () => {
    await como(db, GESTAO, async (tx) => {
      const msg = await erro(tx, () =>
        rpc(tx, "importar_planilha", { ...PLANILHA, fichas: [...PLANILHA.fichas, { ref: "f3", nome: "Molho bechamel", rendimento_qtd: 1, itens: [] }] }),
      );
      expect(msg).toMatch(/Já existe uma ficha/);
      expect(await linhas(tx, "select 1 from public.insumos where nome = 'Parmesão'")).toHaveLength(0);
      expect(await linhas(tx, "select 1 from public.importacoes")).toHaveLength(0);
    });
  });
});

describe("perfis", () => {
  test("cada um lê os perfis da própria casa, não os da outra", async () => {
    await como(db, COZINHA, async (tx) => {
      expect((await linhas(tx, "select nome from public.perfis order by nome")).map((p) => p.nome)).toEqual(["Ana", "Cozinha"]);
    });
    await como(db, OUTRA_CASA, async (tx) => {
      expect((await linhas(tx, "select nome from public.perfis")).map((p) => p.nome)).toEqual(["Outra"]);
    });
  });
});

describe("log de auditoria", () => {
  test("não pode ser alterado nem apagado, nem gravado em nome de outra pessoa", async () => {
    await como(db, GESTAO, async (tx) => {
      await rpc(tx, "verificar_ficha", 1);
      expect((await tx.query("update public.log_auditoria set descricao = 'x'")).affectedRows).toBe(0);
      expect((await tx.query("delete from public.log_auditoria")).affectedRows).toBe(0);
      const msg = await erro(tx, () =>
        tx.query(`insert into public.log_auditoria (empresa_id, usuario_id, acao, entidade, descricao) values (1, '${COZINHA}', 'editar', 'ficha', 'falso')`),
      );
      expect(msg).toMatch(/row-level security/);
    });
  });

  test("gestão registra ações sobre usuários; cozinha não", async () => {
    await como(db, GESTAO, async (tx) => {
      await tx.query(
        `insert into public.log_auditoria (empresa_id, usuario_id, acao, entidade, descricao) values (1, '${GESTAO}', 'criar', 'usuario', 'Usuário novo')`,
      );
      expect(await linhas(tx, "select 1 from public.log_auditoria where entidade = 'usuario'")).toHaveLength(1);
    });
    await como(db, COZINHA, async (tx) => {
      const msg = await erro(tx, () =>
        tx.query(`insert into public.log_auditoria (empresa_id, usuario_id, acao, entidade, descricao) values (1, '${COZINHA}', 'criar', 'usuario', 'x')`),
      );
      expect(msg).toMatch(/row-level security/);
    });
    await db.exec("delete from public.log_auditoria");
  });

  test("cozinha não lê o log", async () => {
    await db.exec(`
      insert into public.log_auditoria (empresa_id, usuario_id, acao, entidade, descricao)
      values (1, '${GESTAO}', 'editar', 'ficha', 'registro de teste')`);
    await como(db, COZINHA, async (tx) => {
      expect(await linhas(tx, "select 1 from public.log_auditoria")).toHaveLength(0);
    });
    await como(db, GESTAO, async (tx) => {
      expect(await linhas(tx, "select 1 from public.log_auditoria")).toHaveLength(1);
    });
    await db.exec("delete from public.log_auditoria");
  });
});
