# Tibia Tactics — versões e próximos incrementos

## Ponto de retorno antes das melhorias

- Tag: `tibia-marco-antes-fase3-2026-10-14`.
- Commit exato: `871432b8a5711168cfdbd2c6927ccc08881377f9`.
- Estado: Fase 2, com receitas, forja e encantamentos; solo, simulação e transporte multiplayer local validados.
- Este marco deve permanecer imutável. Outros agentes devem ler este registro antes de continuar.

## Etapa 1 — clareza estratégica e interface

Branch: `melhoria/fase3-etapa1`. Tag de entrega: `tibia-fase3-etapa1`.

- Função principal e elementos nas cartas, usando os dados atuais de cada unidade.
- Botão de detalhes para inspecionar sem comprar; armadura e resistência mágica visíveis.
- Espionagem com papéis, elementos, defesas médias e dicas baseadas no tabuleiro visível, incluindo itens e sinergias.
- Receitas com busca por nome, efeito ou componente; filtro por função e por componentes disponíveis no inventário.
- Uma receita de dois componentes iguais exige duas cópias. A consulta não gasta recursos.
- Detalhes da receita por clique, com a grade antiga, forja e encantamentos preservados no guia expansível.
- Consulta pausa o solo; online continua e informa isso ao jogador. Escape fecha; foco retorna ao controle de origem; busca não dispara atalhos do jogo.
- Layout adaptado a telas menores, loja com rolagem horizontal no celular e foco visível no teclado.
- Tab navega pelos controles; o atalho do placar passa a ser P.

O motor de combate e os valores de balanceamento permanecem os mesmos nesta etapa. Papéis são indicações de uso, não uma classe nova com bônus próprios. Os elementos indicados são fontes de dano da unidade, não uma estimativa de DPS.

**Ainda não implementado:** resistências nativas verificadas por criatura, Ferida, provocação, silêncio, novos bônus de builds, charms, eventos, progressão de conta e temporadas. Não apresentar essas ideias como se já existissem. Em particular, o veneno atual não reduz cura.

## Roteiro aprovado para entregas seguintes

1. **Fase 3 / combate:** conferir as resistências por criatura, definir adaptações de balanceamento, diferenciar tanques e implementar counters (Ferida, provocação e silêncio), com testes do motor e sincronização online.
2. **Fase 3 / builds e avaliação:** guias das cinco builds propostas, análise pós-combate e simulação reproduzível por unidade, composição e confronto. Comparar mesmas sementes, custos, estrelas e itens.
3. **Fase 4 / charms:** escolhas nos estágios 2-1, 3-2 e 4-2, rerrolagem e regras de economia/recuperação.
4. **Fase 4 / viradas:** duração das lutas, último suspiro e morte súbita progressiva; evitar que perder de propósito seja a melhor estratégia.
5. **Fase 4 / eventos:** carrossel com unidades, raids, Rashid, eventos de estágio e baús.
6. **Fase 5:** histórico detalhado, conquistas, XP e cosméticos; definir persistência e identidade antes de rankings entre dispositivos.
7. **Fase 6:** temporadas, após estabilizar as etapas anteriores.

Cada entrega deve ter um commit e uma tag próprios, documentação dos efeitos e validação antes da próxima. Não misturar mudanças de balanceamento com afirmações de fidelidade às tabelas do Tibia sem fontes verificadas.

## Visualizar no Windows / Git Bash

Os comandos abaixo pressupõem que a branch e as tags já estejam no remoto `origin`. Conferir `git status` antes de trocar de versão. Se houver trabalho local pendente, preservá-lo com um commit próprio antes de prosseguir; não usar reset forçado.

Primeira vez:

```bash
cd "/e/TIBIA SITE/tibia-tactics-site"
git status
git fetch origin --tags
git switch --track origin/melhoria/fase3-etapa1
start index.html
```

Se a branch já existir na sua máquina:

```bash
cd "/e/TIBIA SITE/tibia-tactics-site"
git switch melhoria/fase3-etapa1
git pull --ff-only origin melhoria/fase3-etapa1
start index.html
```

O jogo é estático; abrir `index.html` permite testar o solo. Para testes entre abas com origem HTTP, use um servidor local (`py -m http.server 8000`) e abra o endereço local no navegador. A publicação no GitHub Pages é uma etapa separada e depende da branch configurada em Pages; trocar uma branch local não publica o site.

`git push` envia os commits locais ao GitHub. `git fetch`/`git pull` trazem as alterações do GitHub para sua máquina.

Para visitar o marco original sem apagar a evolução:

```bash
git fetch origin --tags
git switch -c revisao-marco-original tibia-marco-antes-fase3-2026-10-14
start index.html
```

Para retomar a primeira etapa:

```bash
git switch melhoria/fase3-etapa1
start index.html
```

## Validação de desenvolvimento

O jogo não precisa de instalação de pacotes. Os testes de interface usam Python, Playwright e Chromium (dependências apenas de desenvolvimento):

```bash
python3 -m unittest discover -s tests -v
```

Defina `CHROMIUM_PATH` se o executável não estiver em `/usr/bin/chromium`. A suíte abre seu próprio servidor HTTP numa porta livre e encerra navegador e servidor ao terminar. A simulação existente `?sim=3&seed=1` conclui 3 partidas e 400 combates no marco inicial; esta etapa deve preservar esse resultado.

### Evidência da entrega

- 10 testes de interface passaram, incluindo foco/atalhos, consulta sem compra, contagem de componentes, atualização de inventário, espionagem, layout de 390 px e consulta online em host e convidado.
- Solo: menu, 185 sprites, loja de 5 cartas e avanço até o resultado da primeira rodada validados por HTTP.
- Simulação com seed 1: 3 partidas, 400 combates, zero erros e zero travamentos.
- Multiplayer local (BroadcastChannel): duas abas iniciaram uma partida com 8 jogadores; o relógio do host continuou durante a consulta.
- Multiplayer WebRTC pela internet não validado. A navegação `file://` do navegador automatizado deste ambiente é bloqueada por política; a validação visual foi realizada pelo servidor HTTP.
