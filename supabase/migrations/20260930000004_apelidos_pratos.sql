-- Fichas Brava — apelidos dos PRATOS: o nome do produto como vem na planilha do chef
-- ("FILE MINGNO COM RISOTO DE COGUMELOS") -> a ficha cadastrada com o nome corrigido.
-- Sem isso, reenviar uma planilha já importada criaria fichas duplicadas.
-- Gerado a partir do mapa FICHAS de scripts/importar_fichas_brava.py e das planilhas originais.
insert into public.apelidos (empresa_id, chave, ficha_id)
select e.id, a.chave, f.id
from (values
    ('ABACAXI', 'Abacaxi caramelizado'),
    ('BAVETE AO MOLHO DE QUEIJO SALMAO', 'Bavete ao molho de queijo com salmão'),
    ('BERINGELA GRATINADA', 'Berinjela gratinada'),
    ('BRUSQUETA DE COGUMELOS', 'Bruschetta de cogumelos trufados'),
    ('CAMARA A BEURRE BLANC', 'Camarão à beurre blanc com fettuccine'),
    ('CAMARAO A BEURRE BLANC', 'Camarão beurre blanc'),
    ('CROQUETE DE OSSO BUCO', 'Croquete de ossobuco'),
    ('FILE MIGNON AO POAVRE', 'Filé mignon ao poivre'),
    ('FILE MINGNO COM RISOTO DE COGUMELOS', 'Filé mignon com risoto de cogumelos'),
    ('FILE TORNEDOR AO MOLHO POAVRE', 'Filé tornedor ao molho poivre'),
    ('NHOQUE DE BANANA DA TERRA', 'Nhoque de banana-da-terra'),
    ('PANACOTA DE CASTANHA COM ACAI', 'Panna cotta de castanha com açaí'),
    ('RAVIOLE DE ESPINAFRE COM RICOTA', 'Ravióli de espinafre com ricota'),
    ('RAVIOLE MEDIT SECCH', 'Ravióli medit secch'),
    ('RIGATONI AO POLMODORO', 'Rigatoni ao pomodoro'),
    ('SALMAO AO MOLHO DE MARACUJA E RISOTO SICILIANO', 'Salmão ao molho de maracujá com risoto siciliano'),
    ('SIRIGADO NA CROSTA DE ERVAS', 'Sirigado em crosta de ervas')
) as a (chave, ficha)
join public.empresas e on e.slug = 'brava-wine'
join public.fichas f on f.empresa_id = e.id and f.nome = a.ficha
on conflict (empresa_id, chave) do nothing;
