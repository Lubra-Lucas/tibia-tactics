# Tibia Tactics

Auto-battler de navegador inspirado em Teamfight Tactics, com unidades, itens e magias do Tibia.
Um único arquivo HTML (`index.html`), sem instalação.

## Como jogar

- **Solo:** abra o site e clique em *Jogar*. Você enfrenta 7 adversários controlados pela IA.
- **Online com amigos (2 a 8 jogadores):** clique em *Jogar online*.
  1. Um jogador clica em *Criar sala* e passa o código de 4 letras (ou o link da sala) aos amigos.
  2. Os outros clicam em *Jogar online*, digitam o código e clicam em *Entrar*.
  3. O anfitrião clica em *Iniciar partida*; as vagas que sobrarem viram bots.
  - A conexão é direta entre navegadores (WebRTC, via PeerJS). Se o anfitrião sair, a partida acaba.
    Se um convidado cair, um bot assume a vaga e ele pode voltar com o mesmo código e nome.

## Publicar no GitHub Pages

Envie o conteúdo desta pasta para um repositório e ative o Pages (Settings > Pages) na branch escolhida.
O arquivo `.nojekyll` já está incluído.

## Aviso

Tibia e todos os sprites, nomes e marcas relacionados pertencem à CipSoft GmbH.
Este é um projeto de fã, sem fins lucrativos e sem qualquer vínculo com a CipSoft.

## Melhorias incrementais

A etapa atual adiciona funções e elementos nas cartas, inspeção sem compra, resumo de espionagem e uma consulta de receitas com busca e filtros. Use **i** na carta para ver detalhes e **Receitas** para abrir o compêndio. O solo pausa durante a consulta; online continua. **P** abre o placar e **Tab** navega pelos controles.

O ponto de retorno anterior às melhorias, as próximas etapas e os comandos de Git Bash estão em [docs/ETAPAS.md](docs/ETAPAS.md).
