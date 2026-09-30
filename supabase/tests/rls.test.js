import { beforeAll, describe, expect, test } from "vitest";
import { como, criarBanco } from "./banco.js";

const GESTAO = "00000000-0000-0000-0000-00000000000a";
const COZINHA = "00000000-0000-0000-0000-00000000000b";
const INATIVO = "00000000-0000-0000-0000-00000000000c";
const OUTRA_CASA = "00000000-0000-0000-0000-00000000000d";
const SEM_PERFIL = "00000000-0000-0000-0000-00000000000e";

let db;

// Dados de base, gravados como superusuário (a migração real faz o mesmo).
beforeAll(async () => {
  db = await criarBanco();
  await db.exec(`
    insert into public.empresas (id, nome, slug) overriding system value values
      (1, 'Brava Wine', 'brava-wine'), (2, 'Outra Casa', 'outra-casa');
    insert into auth.users (id) values
      ('${GESTAO}'), ('${COZINHA}'), ('${INATIVO}'), ('${OUTRA_CASA}'), ('${SEM_PERFIL}');
    insert into public.perfis (id, empresa_id, nome, papel, ativo) values
      ('${GESTAO}', 1, 'Ana', 'admin', true),
      ('${COZINHA}', 1, 'Cozinha', 'usuario', true),
      ('${INATIVO}', 1, 'Ex-funcionário', 'admin', false),
      ('${OUTRA_CASA}', 2, 'Gestão outra', 'admin', true);
    insert into public.categorias (id, empresa_id, tipo, nome) overriding system value values
      (1, 1, 'ficha', 'Molhos e bases'), (2, 2, 'ficha', 'Molhos');
    insert into public.insumos (id, empresa_id, nome, unidade) overriding system value values
      (1, 1, 'Leite integral', 'g'), (2, 1, 'Farinha de trigo', 'g'), (3, 2, 'Sal fino', 'g');
    insert into public.fichas (id, empresa_id, nome, categoria_id, rendimento_qtd, rendimento_unidade)
      overriding system value values
      (1, 1, 'Molho bechamel', 1, 5701, 'g'),
      (2, 1, 'Arroz de polvo', 1, 418, 'g'),
      (3, 2, 'Molho da outra casa', 2, 1000, 'g');
    insert into public.ficha_itens (ficha_id, ordem, insumo_id, quantidade) values
      (1, 0, 1, 5000), (1, 1, 2, 250), (3, 0, 3, 10);
    insert into public.ficha_itens (ficha_id, ordem, sub_ficha_id, quantidade, unidade_sub) values
      (2, 0, 1, 10, 'g');
    insert into public.passos (ficha_id, ordem, descricao) values (1, 0, 'Aquecer o leite'), (3, 0, 'Misturar');
    insert into public.alergenos (id, nome) overriding system value values (1, 'Glúten');
    insert into public.ficha_alergenos (ficha_id, alergeno_id) values (1, 1), (3, 1);
  `);
  // IDs gravados à mão não avançam o contador automático: acerta para o próximo livre.
  for (const tabela of ["empresas", "categorias", "insumos", "fichas", "alergenos"]) {
    await db.exec(`select setval(pg_get_serial_sequence('public.${tabela}', 'id'),
      (select max(id) from public.${tabela}))`);
  }
});

async function linhas(tx, sql, params = []) {
  return (await tx.query(sql, params)).rows;
}

// Espera que o comando seja recusado. Savepoint para a transação seguir usável.
async function recusado(tx, sql, params = []) {
  await tx.exec("savepoint tentativa");
  try {
    const r = await tx.query(sql, params);
    await tx.exec("release savepoint tentativa");
    return r.affectedRows === 0; // update/delete bloqueado pela RLS afeta 0 linhas
  } catch {
    await tx.exec("rollback to savepoint tentativa");
    return true;
  }
}

const TABELAS = ["empresas", "perfis", "categorias", "insumos", "fichas", "ficha_itens",
  "passos", "alergenos", "ficha_alergenos"];

describe("sem login (anon)", () => {
  test.each(TABELAS)("não lê %s", async (tabela) => {
    await como(db, null, async (tx) => {
      expect(await recusado(tx, `select * from public.${tabela}`)).toBe(true);
    });
  });
});

describe("cozinha (só leitura)", () => {
  test("lê as fichas, itens, passos e alérgenos da própria casa", async () => {
    await como(db, COZINHA, async (tx) => {
      expect((await linhas(tx, "select nome from public.fichas order by id")).map((f) => f.nome))
        .toEqual(["Molho bechamel", "Arroz de polvo"]);
      expect(await linhas(tx, "select id from public.ficha_itens")).toHaveLength(3);
      expect(await linhas(tx, "select id from public.passos")).toHaveLength(1);
      expect(await linhas(tx, "select * from public.ficha_alergenos")).toHaveLength(1);
      expect(await linhas(tx, "select id from public.insumos")).toHaveLength(2);
      expect(await linhas(tx, "select nome from public.alergenos")).toHaveLength(1);
      expect(await linhas(tx, "select nome from public.empresas")).toEqual([{ nome: "Brava Wine" }]);
      // Perfis da própria casa (Entrega 2: nome de quem verificou); nunca os da outra casa.
      expect((await linhas(tx, "select nome from public.perfis order by nome")).map((p) => p.nome)).toEqual([
        "Cozinha",
        "Ana",
        "Ex-funcionário",
      ].sort());
    });
  });

  test.each([
    ["criar ficha", "insert into public.fichas (empresa_id, nome) values (1, 'Nova')"],
    ["editar ficha", "update public.fichas set nome = 'X' where id = 1"],
    ["excluir ficha", "delete from public.fichas where id = 1"],
    ["criar insumo", "insert into public.insumos (empresa_id, nome, unidade) values (1, 'Novo', 'g')"],
    ["editar insumo", "update public.insumos set nome = 'X' where id = 1"],
    ["criar categoria", "insert into public.categorias (empresa_id, tipo, nome) values (1, 'ficha', 'X')"],
    ["criar item", "insert into public.ficha_itens (ficha_id, ordem, insumo_id, quantidade) values (1, 9, 1, 1)"],
    ["editar item", "update public.ficha_itens set quantidade = 1"],
    ["criar passo", "insert into public.passos (ficha_id, ordem, descricao) values (1, 9, 'x')"],
    ["excluir passo", "delete from public.passos"],
    ["marcar alérgeno", "delete from public.ficha_alergenos"],
    ["mudar o próprio papel", `update public.perfis set papel = 'admin' where id = '${COZINHA}'`],
  ])("não consegue %s", async (_, sql) => {
    await como(db, COZINHA, async (tx) => {
      expect(await recusado(tx, sql)).toBe(true);
    });
  });
});

describe("gestão", () => {
  test("cria, edita e exclui na própria casa", async () => {
    await como(db, GESTAO, async (tx) => {
      const [nova] = await linhas(tx,
        "insert into public.fichas (empresa_id, nome, rendimento_qtd, rendimento_unidade) values (1, 'Nova', 100, 'g') returning id");
      await tx.query("insert into public.ficha_itens (ficha_id, ordem, insumo_id, quantidade) values ($1, 0, 1, 50)", [nova.id]);
      await tx.query("insert into public.passos (ficha_id, ordem, descricao) values ($1, 0, 'Mexer')", [nova.id]);
      const editada = await tx.query("update public.fichas set nome = 'Nova 2' where id = $1", [nova.id]);
      expect(editada.affectedRows).toBe(1);
      const excluida = await tx.query("delete from public.fichas where id = $1", [nova.id]);
      expect(excluida.affectedRows).toBe(1);
    });
  });

  test.each([
    ["criar ficha em outra casa", "insert into public.fichas (empresa_id, nome) values (2, 'Invasora')"],
    ["editar ficha de outra casa", "update public.fichas set nome = 'X' where id = 3"],
    ["usar insumo de outra casa", "insert into public.ficha_itens (ficha_id, ordem, insumo_id, quantidade) values (1, 9, 3, 1)"],
    ["usar ficha de outra casa como sub-receita",
      "insert into public.ficha_itens (ficha_id, ordem, sub_ficha_id, quantidade, unidade_sub) values (1, 9, 3, 1, 'g')"],
    ["mover ficha para outra casa", "update public.fichas set empresa_id = 2 where id = 1"],
  ])("não consegue %s", async (_, sql) => {
    await como(db, GESTAO, async (tx) => {
      expect(await recusado(tx, sql)).toBe(true);
    });
  });

  test("não vê nada da outra casa", async () => {
    await como(db, GESTAO, async (tx) => {
      expect(await linhas(tx, "select id from public.fichas where empresa_id = 2")).toHaveLength(0);
      expect(await linhas(tx, "select id from public.ficha_itens where ficha_id = 3")).toHaveLength(0);
      expect(await linhas(tx, "select id from public.passos where ficha_id = 3")).toHaveLength(0);
      expect(await linhas(tx, "select id from public.insumos where empresa_id = 2")).toHaveLength(0);
    });
  });
});

describe("outra casa", () => {
  test("não vê as fichas do Brava", async () => {
    await como(db, OUTRA_CASA, async (tx) => {
      expect((await linhas(tx, "select nome from public.fichas")).map((f) => f.nome))
        .toEqual(["Molho da outra casa"]);
    });
  });
});

describe("sem acesso", () => {
  test.each([["perfil inativo", INATIVO], ["login sem perfil", SEM_PERFIL]])("%s não vê nada", async (_, id) => {
    await como(db, id, async (tx) => {
      for (const tabela of ["fichas", "insumos", "categorias", "ficha_itens", "passos", "empresas"]) {
        expect(await linhas(tx, `select * from public.${tabela}`)).toHaveLength(0);
      }
    });
  });

  test("perfil inativo de gestão não consegue editar", async () => {
    await como(db, INATIVO, async (tx) => {
      expect(await recusado(tx, "insert into public.fichas (empresa_id, nome) values (1, 'X')")).toBe(true);
    });
  });
});

describe("integridade dos itens", () => {
  test.each([
    ["insumo e sub-ficha juntos",
      "insert into public.ficha_itens (ficha_id, ordem, insumo_id, sub_ficha_id, quantidade, unidade_sub) values (2, 9, 1, 1, 1, 'g')"],
    ["nem insumo nem sub-ficha", "insert into public.ficha_itens (ficha_id, ordem, quantidade) values (2, 9, 1)"],
    ["sub-ficha sem unidade", "insert into public.ficha_itens (ficha_id, ordem, sub_ficha_id, quantidade) values (2, 9, 1, 1)"],
    ["ficha como sub-receita dela mesma",
      "insert into public.ficha_itens (ficha_id, ordem, sub_ficha_id, quantidade, unidade_sub) values (1, 9, 1, 1, 'g')"],
    ["quantidade negativa", "insert into public.ficha_itens (ficha_id, ordem, insumo_id, quantidade) values (1, 9, 1, -1)"],
  ])("recusa %s", async (_, sql) => {
    await como(db, GESTAO, async (tx) => {
      expect(await recusado(tx, sql)).toBe(true);
    });
  });
});
