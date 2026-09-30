-- Fichas Brava — dados iniciais da Entrega 2 (só para a casa Brava Wine).
-- Idempotente e sem efeito onde o Brava não existe (ex.: banco de teste).
-- Gerado a partir de INSUMOS e SUB_RECEITAS de scripts/importar_fichas_brava.py.

-- Categorias de insumo sugeridas (renomeáveis pela tela).
insert into public.categorias (empresa_id, tipo, nome)
select e.id, 'insumo', c.nome
from public.empresas e
cross join (values ('Proteínas'), ('Laticínios'), ('Hortifruti'), ('Mercearia'), ('Temperos e especiarias'), ('Bebidas e vinhos'), ('Congelados')) as c (nome)
where e.slug = 'brava-wine'
on conflict (empresa_id, tipo, nome) do nothing;

-- Apelidos de insumo: grafias das planilhas do chef -> insumo cadastrado.
insert into public.apelidos (empresa_id, chave, insumo_id)
select e.id, a.chave, i.id
from (values
    ('ABACATI', 'Abacate'),
    ('ACAFRAO', 'Açafrão'),
    ('ACAI', 'Açaí'),
    ('ACUCAR', 'Açúcar'),
    ('AGUA', 'Água'),
    ('AGUA COM LEGUMES', 'Água com legumes (consommé)'),
    ('AGUA COM LEGUMES(CONSUME)', 'Água com legumes (consommé)'),
    ('ALCAPARRAS', 'Alcaparras'),
    ('ALECRIM', 'Alecrim fresco'),
    ('ALECRIM FRESCO', 'Alecrim fresco'),
    ('ALHO INTEIRO', 'Alho'),
    ('ALHO PORO', 'Alho-poró'),
    ('APARA DE FILE', 'Aparas de filé'),
    ('ARROZ', 'Arroz branco'),
    ('ARROZ ARBOREO', 'Arroz arbóreo'),
    ('AZEITE EXTRA VIRGEM', 'Azeite extra virgem'),
    ('BANANA DA TERRA', 'Banana-da-terra'),
    ('BATATA', 'Batata inglesa'),
    ('BATATA RUSTICA', 'Batata rústica'),
    ('BERINGELA', 'Berinjela'),
    ('BISCOITO MAISENA', 'Biscoito maisena'),
    ('BROCOLES', 'Brócolis'),
    ('BROTO', 'Brotos'),
    ('BROTOS', 'Brotos'),
    ('CACHACA', 'Cachaça branca'),
    ('CAFE', 'Café'),
    ('CAMARAO', 'Camarão'),
    ('CANELA DE BOI', 'Canela de boi (osso)'),
    ('CANELA EM PO', 'Canela em pó'),
    ('CEBOLA', 'Cebola branca'),
    ('CHAMPGNON', 'Champignon'),
    ('CHAMPINGNON', 'Champignon'),
    ('CHANTILY', 'Chantilly'),
    ('CHOCOLATE EM PO', 'Chocolate em pó'),
    ('COGUMELO PARIS', 'Cogumelo paris'),
    ('COGUMELOS', 'Cogumelos'),
    ('CREAME CHEASE', 'Cream cheese'),
    ('CREAME CHEEASE', 'Cream cheese'),
    ('CREME CULINARIO', 'Creme de leite culinário'),
    ('CREME DE LEITE CULINARIO', 'Creme de leite culinário'),
    ('CRISPE DE COUVE MANTEIGA', 'Couve-manteiga (crispy)'),
    ('CUPUACU', 'Cupuaçu'),
    ('DENDE', 'Azeite de dendê'),
    ('EMUCIFICANTE', 'Emulsificante'),
    ('EXENCIA DE BAUNILHA', 'Essência de baunilha'),
    ('FARINHA DE PANKO', 'Farinha panko'),
    ('FILE MIGON EM TIRAS', 'Filé mignon'),
    ('FILE MINGNON', 'Filé mignon'),
    ('FIOLHAS DE LOURO', 'Louro (folhas)'),
    ('GELEI DE PIMENTA', 'Geleia de pimenta'),
    ('HORTELA', 'Hortelã'),
    ('KATCHUP', 'Ketchup'),
    ('LEITE', 'Leite integral'),
    ('LIMAO SICILIANO', 'Limão siciliano'),
    ('LOURO', 'Louro (folhas)'),
    ('MANDIOQUINHA', 'Mandioquinha'),
    ('MANJERICAO', 'Manjericão fresco'),
    ('MANJERICAO FRESCO', 'Manjericão fresco'),
    ('MANTEIGA SEM SAL GELADA', 'Manteiga sem sal'),
    ('MARACUJA', 'Maracujá'),
    ('MASCAPONE', 'Mascarpone'),
    ('MASSA PASTEL', 'Massa de pastel'),
    ('MELACO DE CANA', 'Melaço de cana'),
    ('MOLHO INGLES', 'Molho inglês'),
    ('MOLHO SHOYU', 'Shoyu'),
    ('MOSTARDA DJON', 'Mostarda Dijon'),
    ('MUSARELA', 'Muçarela'),
    ('MUSSARELA', 'Muçarela'),
    ('NOZ MOSCADA', 'Noz-moscada'),
    ('OLHEO', 'Óleo'),
    ('OSSO BUCO', 'Ossobuco'),
    ('OVO(GEMA)', 'Ovos'),
    ('OVOS', 'Ovos'),
    ('PANKO', 'Farinha panko'),
    ('PAO ITALIANO', 'Pão italiano'),
    ('PAREMESSAO', 'Parmesão'),
    ('PARMESAO', 'Parmesão'),
    ('PARMESSAO', 'Parmesão'),
    ('PESTO DE MANJERICAO', 'Pesto de manjericão'),
    ('PIMENTA DO REINO', 'Pimenta-do-reino'),
    ('PIMENTA DO REINO EM GRAOS', 'Pimenta-do-reino em grãos'),
    ('PIMENTA POAVRE', 'Pimenta preta em grãos (poivre)'),
    ('PIMENTAO VERMELHO', 'Pimentão vermelho'),
    ('PURE DE BATATA', 'Purê de batata'),
    ('REQUEIJAO', 'Requeijão'),
    ('RUCULA SELVAGEM', 'Rúcula selvagem'),
    ('SAL', 'Sal fino'),
    ('SAL FINO', 'Sal fino'),
    ('SALMAO', 'Salmão'),
    ('SALSAO', 'Salsão'),
    ('SASINHA', 'Salsinha'),
    ('SHITAKI', 'Shiitake'),
    ('SHOYO', 'Shoyu'),
    ('SORVETE', 'Sorvete de creme'),
    ('SUMO LIMAO', 'Suco de limão'),
    ('VARGEM', 'Vagem'),
    ('VINAGRE BANCO SECO', 'Vinagre de vinho branco'),
    ('VINAGRE DE VINHO BRANCO', 'Vinagre de vinho branco'),
    ('VINHO BRANCO', 'Vinho branco seco'),
    ('VINHO BRANCO SECO', 'Vinho branco seco'),
    ('VINHO TINTO', 'Vinho tinto seco'),
    ('VINHO TINTO SECO', 'Vinho tinto seco')
) as a (chave, insumo)
join public.empresas e on e.slug = 'brava-wine'
join public.insumos i on i.empresa_id = e.id and i.nome = a.insumo
on conflict (empresa_id, chave) do nothing;

-- Apelidos de sub-receita: nome na planilha -> ficha (molhos da casa).
insert into public.apelidos (empresa_id, chave, ficha_id)
select e.id, a.chave, f.id
from (values
    ('BECHAMEL', 'Molho bechamel'),
    ('MOLHO BECHAMEL', 'Molho bechamel'),
    ('MOLHO BRANCO', 'Molho bechamel'),
    ('MOLHO POLMODORO', 'Molho pomodoro'),
    ('MOLHO POMODORO', 'Molho pomodoro'),
    ('MOLHO POMORORO', 'Molho pomodoro'),
    ('MOLHO ROTI', 'Molho roti'),
    ('POLMODORO', 'Molho pomodoro'),
    ('POMODORO', 'Molho pomodoro')
) as a (chave, ficha)
join public.empresas e on e.slug = 'brava-wine'
join public.fichas f on f.empresa_id = e.id and f.nome = a.ficha
on conflict (empresa_id, chave) do nothing;
