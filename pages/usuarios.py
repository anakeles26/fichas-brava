from __future__ import annotations

import streamlit as st
from sqlalchemy import func, select

from fichabase.auditoria import registrar
from fichabase.auth import empresas_visiveis, hash_senha, usuario_logado
from fichabase.db import get_session
from fichabase.email import EmailError, enviar_senha_provisoria
from fichabase.models import PAPEIS, PAPEL_LABELS, Usuario
from fichabase.rls import aplicar_escopo_rls
from fichabase.senha import gerar_senha_provisoria, senha_valida
from fichabase.ui import badge

if st.session_state.pop("_limpar_novo_usuario", False):
    st.session_state["novo_usuario_nome"] = ""
    st.session_state["novo_usuario_email"] = ""
    st.session_state["novo_usuario_senha_manual"] = False
    st.session_state["novo_usuario_senha"] = ""
    st.session_state["novo_usuario_confirmar_senha"] = ""

with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is None:
        st.stop()

    st.title("Usuários")

    if not usuario.pode_criar_usuario:
        st.info("Você não tem permissão para gerenciar usuários — fale com um admin ou líder.")
        st.stop()

    empresas = empresas_visiveis(session, usuario)
    if not empresas:
        st.info("Nenhuma empresa disponível para cadastrar usuários.")
        st.stop()

    # Ninguém cria um papel acima do seu próprio nível (evita escalonamento de
    # privilégio): admin_master cria qualquer papel; admin só cria líder/usuário;
    # líder só cria usuário.
    if usuario.eh_admin_master:
        papeis_permitidos = list(PAPEL_LABELS)
    elif usuario.papel == "admin":
        papeis_permitidos = ["lider", "usuario"]
    else:  # lider
        papeis_permitidos = ["usuario"]

    with st.expander("Novo usuário", icon=":material/person_add:"):
        st.subheader("Novo Usuário")
        st.caption("Adicione um novo membro à equipe do restaurante.")

        with st.container(border=True):
            col_nome_fora, col_email_fora = st.columns(2)
            nome = col_nome_fora.text_input(
                "Nome", placeholder="Ex: João Silva", key="novo_usuario_nome"
            )
            # .strip().lower(): o streamlit-authenticator trabalha só com
            # username em minúsculo, então guardar "Fulano@x.com" no banco faz
            # o login "funcionar" mas nenhuma página carregar (ver
            # fichabase.auth.usuario_logado). Normalizar na entrada evita o
            # problema na origem.
            email = col_email_fora.text_input(
                "Email", placeholder="joao@exemplo.com", key="novo_usuario_email"
            ).strip().lower()

            # Função fica FORA do st.form: dentro de um form, o Streamlit só
            # roda o script de novo quando o formulário é enviado, então
            # trocar a Função não atualizava a tela pra mostrar/esconder o
            # campo Empresa — ele ficava sempre travado na primeira opção
            # (Admin master, que não tem empresa).
            papel_novo = st.selectbox(
                "Função", papeis_permitidos, format_func=lambda p: PAPEL_LABELS[p], key="novo_usuario_papel"
            )
            if usuario.eh_admin_master and papel_novo != "admin_master":
                nome_empresa = st.selectbox("Empresa", [e.nome for e in empresas], key="novo_usuario_empresa")
            elif not usuario.eh_admin_master:
                st.caption(f"Empresa: {usuario.empresa.nome}")
                nome_empresa = usuario.empresa.nome
            else:
                nome_empresa = None  # admin_master não pertence a uma empresa fixa


            # Fora do form pelo mesmo motivo da Função: precisa reagir na hora
            # pra mostrar/esconder os campos de senha ao marcar/desmarcar.
            definir_senha_manual = st.checkbox(
                "Definir a senha agora (em vez de gerar automaticamente por e-mail)",
                key="novo_usuario_senha_manual",
            )
            senha_manual = confirmar_senha_manual = None
            if definir_senha_manual:
                col_senha, col_confirmar = st.columns(2)
                senha_manual = col_senha.text_input(
                    "Senha", type="password", key="novo_usuario_senha"
                )
                confirmar_senha_manual = col_confirmar.text_input(
                    "Confirmar senha", type="password", key="novo_usuario_confirmar_senha"
                )
                st.caption("Mínimo 6 caracteres, pelo menos 1 letra e 1 número/especial.")
            else:
                st.caption(
                    "A senha é gerada automaticamente e enviada por e-mail — no primeiro "
                    "login, a pessoa cria a senha definitiva dela."
                )

            with st.form("novo_usuario", clear_on_submit=True):
                if st.form_submit_button("Criar usuário", type="primary") and nome and email:
                    ja_existe = session.scalar(
                        select(Usuario).where(func.lower(Usuario.email) == email)
                    )
                    erro_senha_manual = None
                    if definir_senha_manual:
                        if senha_manual != confirmar_senha_manual:
                            erro_senha_manual = "As senhas não coincidem."
                        elif not senha_valida(senha_manual):
                            erro_senha_manual = (
                                "A senha precisa ter no mínimo 6 caracteres, com pelo "
                                "menos 1 letra e 1 número/especial."
                            )

                    if ja_existe:
                        st.error("Já existe um usuário com esse email.")
                    elif erro_senha_manual:
                        st.error(erro_senha_manual)
                    else:
                        # Senha manual: a pessoa que cria já define a senha final
                        # (não força trocar no 1º login, nem envia e-mail — quem
                        # cadastrou repassa por fora). Senha automática: gerada e
                        # enviada por e-mail, com troca obrigatória no 1º login.
                        senha_final = senha_manual if definir_senha_manual else gerar_senha_provisoria()
                        empresa_escolhida = next((e for e in empresas if e.nome == nome_empresa), None)
                        # Esta página não passa pelo empresa_atual() (admin_master
                        # precisa ver/criar usuário de qualquer empresa, não uma
                        # fixa), então ninguém mais aplica o escopo de RLS aqui —
                        # sem isso, o INSERT em log_auditoria abaixo é rejeitado
                        # pela política (current_empresa_id fica NULL, e NULL não
                        # bate com o empresa_id real do novo usuário). Descoberto
                        # testando a criação de usuário comum (não admin_master)
                        # contra o Postgres real — só passava despercebido porque
                        # os testes anteriores só cobriam admin_master, cujo
                        # empresa_id é NULL e cai no "OR empresa_id IS NULL".
                        aplicar_escopo_rls(session, usuario, empresa_escolhida)
                        session.add(
                            Usuario(
                                nome=nome,
                                email=email,
                                senha_hash=hash_senha(senha_final),
                                senha_provisoria=not definir_senha_manual,
                                papel=papel_novo,
                                empresa_id=empresa_escolhida.id if empresa_escolhida else None,
                            )
                        )
                        registrar(
                            session,
                            usuario,
                            empresa_escolhida,
                            "criar",
                            "Usuario",
                            f"Usuário '{nome}' <{email}> ({PAPEL_LABELS[papel_novo]})",
                        )
                        session.commit()
                        # "Nome"/"Email" ficam fora do st.form (pro campo Função
                        # reagir), então clear_on_submit não os limpa sozinho —
                        # a limpeza precisa ser adiada pro início do próximo
                        # rerun, antes desses widgets serem instanciados de novo.
                        st.session_state["_limpar_novo_usuario"] = True
                        if definir_senha_manual:
                            st.success(f"Usuário '{nome}' criado com a senha definida.")
                            st.rerun()
                        else:
                            try:
                                enviar_senha_provisoria(nome, email, senha_final)
                                st.success(f"Usuário '{nome}' criado — e-mail com a senha provisória enviado.")
                                st.rerun()
                            except EmailError as erro:
                                # Sem rerun aqui de propósito: é a ÚNICA vez que essa
                                # senha aparece em algum lugar (nunca fica salva em
                                # texto puro) — se recarregar agora, ninguém mais
                                # consegue recuperá-la.
                                st.warning(
                                    f"Usuário '{nome}' criado, mas o e-mail não pôde ser enviado ({erro}). "
                                    f"Repasse a senha provisória manualmente: **{senha_final}**"
                                )

    empresa_ids = [e.id for e in empresas]
    if usuario.eh_admin_master:
        usuarios = session.scalars(select(Usuario).order_by(Usuario.nome)).all()
    else:
        usuarios = session.scalars(
            select(Usuario).where(Usuario.empresa_id.in_(empresa_ids)).order_by(Usuario.nome)
        ).all()

    usuarios_ativos = [u for u in usuarios if u.ativo]
    usuarios_inativos = [u for u in usuarios if not u.ativo]

    def _renderizar_usuario(u: Usuario) -> None:
        with st.container(border=True):
            empresa_label = "Todas as lojas" if u.eh_admin_master else (u.empresa.nome if u.empresa else "-")
            cor = "rosa" if u.papel in ("admin_master", "admin") else "azul"
            st.markdown(
                f"**{u.nome}**  \n{u.email}  \n{badge(PAPEL_LABELS[u.papel], cor)}{badge(empresa_label, 'azul')}",
                unsafe_allow_html=True,
            )

            # Mesma regra de hierarquia da criação: ninguém edita/desativa um
            # papel acima do que poderia criar — exceto a própria conta.
            if u.papel not in papeis_permitidos and u.id != usuario.id:
                return

            with st.expander("Editar", icon=":material/edit:"):
                empresa_alvo = None if u.eh_admin_master else u.empresa

                with st.form(f"trocar_senha_{u.id}", clear_on_submit=True):
                    st.caption("Definir nova senha")
                    col_senha1, col_senha2 = st.columns(2)
                    nova_senha = col_senha1.text_input(
                        "Nova senha", type="password", key=f"nova_senha_{u.id}"
                    )
                    confirmar_nova = col_senha2.text_input(
                        "Confirmar nova senha", type="password", key=f"confirmar_senha_{u.id}"
                    )
                    if st.form_submit_button("Salvar nova senha", key=f"salvar_senha_{u.id}") and nova_senha:
                        if nova_senha != confirmar_nova:
                            st.error("As senhas não coincidem.")
                        elif not senha_valida(nova_senha):
                            st.error(
                                "A senha precisa ter no mínimo 6 caracteres, com pelo "
                                "menos 1 letra e 1 número/especial."
                            )
                        else:
                            aplicar_escopo_rls(session, usuario, empresa_alvo)
                            u.senha_hash = hash_senha(nova_senha)
                            u.senha_provisoria = False
                            registrar(
                                session, usuario, empresa_alvo, "editar", "Usuario",
                                f"Senha alterada para '{u.nome}' <{u.email}>",
                            )
                            session.commit()
                            st.success("Senha atualizada.")
                            st.rerun()

                st.divider()
                if u.id == usuario.id:
                    st.caption("Você não pode alterar a função/empresa da própria conta.")
                else:
                    st.caption("Alterar função e empresa")
                    # Fora do form pelo mesmo motivo do cadastro: precisa
                    # reagir na hora pra mostrar/esconder o seletor de
                    # empresa ao trocar a função.
                    opcoes_papel = sorted(
                        set(papeis_permitidos) | {u.papel}, key=PAPEIS.index
                    )
                    papel_editado = st.selectbox(
                        "Função",
                        opcoes_papel,
                        index=opcoes_papel.index(u.papel),
                        format_func=lambda p: PAPEL_LABELS[p],
                        key=f"papel_editado_{u.id}",
                    )
                    if usuario.eh_admin_master and papel_editado != "admin_master":
                        nomes_empresas_editar = [e.nome for e in empresas]
                        empresa_atual_nome = u.empresa.nome if u.empresa else nomes_empresas_editar[0]
                        empresa_editada_nome = st.selectbox(
                            "Empresa",
                            nomes_empresas_editar,
                            index=nomes_empresas_editar.index(empresa_atual_nome)
                            if empresa_atual_nome in nomes_empresas_editar
                            else 0,
                            key=f"empresa_editada_{u.id}",
                        )
                    elif not usuario.eh_admin_master:
                        st.caption(f"Empresa: {usuario.empresa.nome}")
                        empresa_editada_nome = usuario.empresa.nome
                    else:
                        empresa_editada_nome = None

                    if st.button("Salvar função e empresa", icon=":material/save:", key=f"salvar_acesso_{u.id}"):
                        nova_empresa = next(
                            (e for e in empresas if e.nome == empresa_editada_nome), None
                        )
                        # Escopo pela empresa NOVA (não a antiga guardada em
                        # empresa_alvo): o log_auditoria criado abaixo, assim
                        # como qualquer política de RLS futura sobre
                        # usuarios, precisa bater com o empresa_id que está
                        # sendo gravado agora, não com o que estava antes.
                        aplicar_escopo_rls(session, usuario, nova_empresa)
                        descricao = (
                            f"Usuário '{u.nome}' <{u.email}>: função {PAPEL_LABELS[u.papel]} → "
                            f"{PAPEL_LABELS[papel_editado]}, empresa "
                            f"{u.empresa.nome if u.empresa else 'Todas as lojas'} → "
                            f"{nova_empresa.nome if nova_empresa else 'Todas as lojas'}"
                        )
                        u.papel = papel_editado
                        u.empresa_id = nova_empresa.id if nova_empresa else None
                        registrar(session, usuario, nova_empresa, "editar", "Usuario", descricao)
                        session.commit()
                        st.success("Função/empresa atualizada.")
                        st.rerun()

                st.divider()
                if u.id == usuario.id:
                    st.caption("Você não pode desativar sua própria conta.")
                elif u.ativo:
                    if st.button("Desativar usuário", icon=":material/block:", key=f"desativar_{u.id}"):
                        aplicar_escopo_rls(session, usuario, empresa_alvo)
                        u.ativo = False
                        registrar(
                            session, usuario, empresa_alvo, "editar", "Usuario",
                            f"Usuário '{u.nome}' <{u.email}> desativado",
                        )
                        session.commit()
                        st.rerun()
                else:
                    if st.button("Reativar usuário", icon=":material/undo:", key=f"reativar_{u.id}"):
                        aplicar_escopo_rls(session, usuario, empresa_alvo)
                        u.ativo = True
                        registrar(
                            session, usuario, empresa_alvo, "editar", "Usuario",
                            f"Usuário '{u.nome}' <{u.email}> reativado",
                        )
                        session.commit()
                        st.rerun()

    aba_ativos, aba_inativos = st.tabs(
        [f"Ativos ({len(usuarios_ativos)})", f"Inativos ({len(usuarios_inativos)})"]
    )
    with aba_ativos:
        if not usuarios_ativos:
            st.caption("Nenhum usuário ativo.")
        for u in usuarios_ativos:
            _renderizar_usuario(u)
    with aba_inativos:
        if not usuarios_inativos:
            st.caption("Nenhum usuário inativo.")
        for u in usuarios_inativos:
            _renderizar_usuario(u)
