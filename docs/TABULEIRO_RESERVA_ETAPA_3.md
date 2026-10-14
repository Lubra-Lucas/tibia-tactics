# Etapa 3 — tabuleiro e reserva

Branch de entrega: `melhoria/tabuleiro-reserva`. Tag: `tibia-fase3-etapa3-tabuleiro-reserva`.

O ponto imediatamente anterior é o commit `6bd514e1eccf1f165f70cf8eb93ac2cedab1c090`, preservado na tag `tibia-marco-antes-tabuleiro-reserva-2026-10-14`. As tags anteriores continuam disponíveis. Esta etapa também é enviada para `main`, a branch usada pelo site.

## Interação

- Arena sem a reserva dentro do canvas, com indicação dos lados e capacidade. Em 1440×900, o tamanho de cada casa aumenta de 48 para 50 pixels; a reserva ocupa a faixa abaixo da arena.
- Nove vagas com número, nome, sprite animado, estrelas, itens e cópias da mesma estrela para evolução. Selecionar destaca as cópias correspondentes.
- Clique ou toque seleciona, sem pausar o solo. O painel compacto mostra vida, alcance, armadura, resistência mágica, habilidade e itens. O alcance aparece no tabuleiro; durante o combate, a seleção acompanha a unidade.
- **Ficha completa** abre a consulta detalhada; essa consulta continua pausando somente o solo. Escape limpa a seleção, ou fecha a ficha quando estiver aberta.
- Arrastar mostra casas permitidas e uma prévia **Mover**, **Trocar** ou **Limite de unidades**. Soltar na loja não vende. A área **Arraste aqui para vender** informa nome e valor antes da soltura.
- No celular, as setas acessam as nove vagas; o painel selecionado aparece logo abaixo da reserva. Enter e Espaço ativam as vagas pelo teclado.
- Espionagem é somente consulta: unidades e itens não podem ser arrastados enquanto outro tabuleiro estiver aberto.
- Preferências de animações reduzidas continuam funcionando.

O elenco, os valores de combate, os custos, a economia e o protocolo online 5 permanecem os mesmos da Etapa 2. Não há novas cartas ou mudanças de balanceamento nesta entrega.

## Validação

```bash
node tests/test_combat.cjs
python3 -m unittest discover -s tests -v
```

11 testes do motor e 30 testes de navegador passaram. A cobertura inclui mover/trocar, limite de unidades, equipar, venda e devolução de itens, compra com evolução, sprites animados e animações reduzidas, seleção e ficha por teclado, espionagem, cancelamento e movimento por toque real via CDP, layouts de 1440, 1024 e 390 pixels, receitas e sincronização entre anfitrião/convidado pelo transporte local. A simulação seed 1 preserva três partidas e 388 combates, sem erros ou travamentos.

As telas foram conferidas em Chromium. WebRTC pela internet e o resultado final do deploy do Pages não foram verificados deste ambiente.

## Git Bash — atualizar seu computador

Com suas edições locais salvas:

```bash
cd "/e/TIBIA SITE/tibia-tactics-site"
git status
git fetch origin --tags
git switch main
git pull --ff-only origin main
start index.html
```

`git pull` traz a atualização para seu computador; `git push` envia suas alterações locais ao GitHub. Se houver conflito ou edições locais pendentes, preserve seu trabalho antes de trocar a branch; não use reset forçado.

Para abrir exatamente esta etapa, independentemente de próximas atualizações:

```bash
git switch -c visualizar-tabuleiro-etapa3 tibia-fase3-etapa3-tabuleiro-reserva
start index.html
```

Para visualizar o ponto anterior sem apagar a evolução:

```bash
git switch -c visualizar-antes-tabuleiro tibia-marco-antes-tabuleiro-reserva-2026-10-14
start index.html
```

Para retomar a versão mais recente, use `git switch main`. Essas branches de visualização preservam as versões; não substituem `main` nem republicam o site.
