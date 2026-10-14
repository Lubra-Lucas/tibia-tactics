# Fase 3 — Etapa 2: oito novas cartas

Branch: `melhoria/fase3-etapa2-cartas`. Tag de entrega: `tibia-fase3-etapa2-cartas`.
Ponto de retorno anterior: `tibia-fase3-etapa1` (commit `aa75a8aac0c03b71a8e181175ad42258f4a6eb42`).

O elenco passa de 45 para 53 cartas. As oito entram no sorteio normal da loja, no estoque compartilhado, na fusão de estrelas, nas sinergias e na seleção dos bots. A distribuição de custos por nível permanece a mesma; há mais opções dentro de cada custo.

| Carta | Ouro | Origem / classe | Especialidade |
|---|---:|---|---|
| Minotaur Guard | 2 | Minotauro / Guardião | 40 de armadura e 10 de resistência mágica. Explosão física em raio 2, provocando inimigos próximos por 2,5 s. |
| Hunter | 2 | Humano / Atirador | Alcance 4 e disparo físico forte em alvo único. |
| Ice Witch | 3 | Humano / Mago | Onda de gelo que reduz velocidade de ataque e movimento em 25% por 3 s. |
| Demon Skeleton | 3 | Morto-vivo / Guardião | 45 de resistência mágica e 16 de armadura. Escudo de 30% da vida por 4 s. |
| Dark Monk | 3 | Humano / Curandeiro | Golpe de morte com Ferida de 40% por 5 s; depois cura o aliado mais ferido. |
| Wyvern | 3 | Dragão / Assassino | Golpe de terra e veneno ao longo de 4 s. Participa das sinergias de Dragão e Assassino. |
| Bonelord | 4 | Morto-vivo / Mago | Explosão de terra em raio 1 com silêncio de 2 s; precisa de 90 de mana. |
| Grim Reaper | 5 | Morto-vivo / Assassino | Habilidade prioriza alvos feridos ao alcance. Causa +60% de dano se o alvo tiver até 30% de vida no impacto, com animação FATAL!. |

Estatísticas e habilidades são adaptações para o Tactics; não são tabelas oficiais do Tibia. Esta entrega diferencia defesa física e mágica, mas ainda não adiciona resistências e fraquezas elementais nativas ao elenco inteiro.

## Regras dos novos efeitos

- **Ferida:** reduz toda cura recebida pelo alvo, incluindo regeneração, cura de sinergia e roubo de vida. Reduções não se somam. Reaplicações conservam a maior redução e o maior prazo de duração ativo. Não afeta escudos nem a vida restaurada pelo efeito de ressurreição.
- **Silêncio:** impede iniciar habilidades. Ataques básicos, movimento e ganho de mana continuam funcionando. Efeitos/projéteis de habilidades já lançadas não são cancelados.
- **Provocação:** força os inimigos afetados a escolher o provocador, inclusive para ataques e habilidades de alvo único. Termina quando o prazo acaba ou o provocador morre; uma nova provocação substitui o provocador anterior.
- **Finalização:** é dano adicional condicionado à vida do alvo no impacto, não morte automática. Escudos, defesas e ressurreição continuam funcionando. A prioridade por inimigos feridos respeita a provocação.
- **Feedback:** as barras das unidades mostram F (Ferida), S (Silêncio) e P (Provocado). A ficha informa os nomes e o tempo restante. A espionagem avisa sobre esses counters.

## Visualização e interação

O menu inicial oferece **Novas cartas**, com as oito unidades animadas e fichas de habilidades. As mesmas fichas podem ser abertas clicando no banco ou no tabuleiro. Arrastar continua movendo as unidades; consultar não compra, vende nem altera a formação. Solo pausa durante a consulta, enquanto online continua.

Os detalhes de itens, receitas, forja e encantamentos da Etapa 1 permanecem disponíveis. Os novos counters funcionam com o sistema de itens existente.

## Assets utilizados

Origem dos 16 arquivos adicionados: `Lubra-Lucas/tibia_basedados`, commit `d25009078d271e2facd848bee987983d67922398`. Foram copiados somente os oito sprites e seus oito cadáveres, mantendo os metadados já presentes em `sprites15.js`. As folhas oferecem quatro direções e quadros de movimento; Grim Reaper tem dois quadros por direção, os demais têm oito. Os efeitos visuais reutilizam `combate15.js`, incluindo FATAL (230).

## Compatibilidade online

O protocolo passou de 4 para 5. Todos os participantes devem carregar esta versão; o anfitrião recusa versões antigas para impedir simulações diferentes. O transporte local entre duas abas foi validado. Não foi realizado teste de conexão WebRTC pela internet nesta entrega.

## Validação

```bash
node --test tests/test_combat.cjs
python3 -m unittest discover -s tests -v
```

- 11 testes do motor passaram: oito cartas no estoque/loja, sprites, counters, cura e roubo de vida, defesa mágica, finalização, estrelas e serialização determinística.
- 16 testes de navegador passaram: sprites e descrições das oito, compêndio animado, fichas por clique, arrastar, receitas, teclado, mobile e sincronização real entre host/convidado.
- 23 partidas simuladas, 3.000 combates, zero erros e zero travamentos. Todas as novas cartas lançaram habilidades durante a simulação.
- Seed 1, três partidas com o novo elenco: 388 combates; o marco da Etapa 1 tinha 400. Essa mudança é esperada porque o sorteio das cartas e os resultados das partidas mudam com o elenco.

Esses resultados validam funcionamento e reprodução determinística. Os valores iniciais devem ser acompanhados em partidas reais e simulações maiores para ajustar o equilíbrio.

## Git Bash — visualizar esta etapa

Com suas edições locais salvas:

```bash
cd "/e/TIBIA SITE/tibia-tactics-site"
git fetch origin --tags
git switch --track origin/melhoria/fase3-etapa2-cartas
start index.html
```

Se a branch já existir localmente, use `git switch melhoria/fase3-etapa2-cartas` e depois `git pull --ff-only origin melhoria/fase3-etapa2-cartas`.

Para voltar à Etapa 1, use `git switch melhoria/fase3-etapa1`. O marco `tibia-marco-antes-fase3-2026-10-14` continua disponível para retornar à versão original anterior a todas as melhorias. Esta entrega está em uma branch de revisão; não publica o site por si só.
