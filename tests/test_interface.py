"""Browser regressions: python3 -m unittest discover -s tests -v.
Requires Python Playwright and Chromium; no game runtime dependencies.
"""
import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class InterfaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.goto(self.url, wait_until='domcontentloaded')
        self.page.locator('#b-jogar').click(timeout=30000)
        self.page.evaluate('UI.timer=999')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def test_inspect_card_without_buying_and_show_actual_defenses(self):
        self.page.evaluate("UI.jog.loja=['paladin','knight','druid','necromancer','dragon']; hudLoja()")
        gold = self.page.locator('#ouro').inner_text()
        info = self.page.get_by_role('button', name='Detalhes de Paladin', exact=True)
        self.assertEqual(info.count(), 1, 'A carta precisa oferecer inspeção sem compra')
        info.click()
        dialog = self.page.get_by_role('dialog')
        text = dialog.inner_text()
        for label in ['Carry', 'físico', 'sagrado', 'Res. mágica']:
            self.assertIn(label.casefold(), text.casefold())
        self.assertEqual(self.page.locator('#ouro').inner_text(), gold)
        self.page.keyboard.press('Escape')
        self.assertEqual(self.page.get_by_role('dialog').count(), 0)
        self.assertEqual(self.page.evaluate('UI.pausado'), False)

    def test_search_recipes_does_not_trigger_game_shortcuts(self):
        self.page.locator('#bt-rec').click()
        search = self.page.get_by_role('searchbox', name='Buscar receita')
        self.assertEqual(search.count(), 1, 'As receitas precisam de busca')
        before = self.page.evaluate('JSON.stringify([UI.jog.ouro, UI.jog.xp, UI.jog.loja, UI.jog.travada])')
        search.press_sequentially('demon shield')
        self.assertEqual(self.page.locator('.receita-card').count(), 1)
        self.assertIn('Demon Shield', self.page.locator('.receita-card').inner_text())
        self.assertEqual(before, self.page.evaluate('JSON.stringify([UI.jog.ouro, UI.jog.xp, UI.jog.loja, UI.jog.travada])'))
        self.page.keyboard.press('Escape')
        self.assertEqual(self.page.get_by_role('dialog').count(), 0)

    def test_available_recipes_require_two_copies_of_same_component(self):
        self.page.evaluate('UI.jog.itens=[3264]; hudItens()')
        self.page.locator('#bt-rec').click()
        only = self.page.get_by_label('Só o que posso montar')
        self.assertEqual(only.count(), 1, 'Filtro deve conferir quantidades do inventário')
        only.check()
        self.assertEqual(self.page.locator('.receita-card').count(), 0)
        self.page.keyboard.press('Escape')
        self.page.evaluate('UI.jog.itens=[3264,3264]; hudItens()')
        self.page.locator('#bt-rec').click()
        self.page.get_by_label('Só o que posso montar').check()
        cards = self.page.locator('.receita-card')
        self.assertEqual(cards.count(), 1)
        self.assertIn('Giant Sword', cards.inner_text())
        cards.click()
        self.assertIn('Sword + Sword', self.page.locator('#receita-detalhe').inner_text())
        self.assertEqual(self.page.evaluate('UI.jog.itens'), [3264,3264], 'Consultar receita não gasta itens')

    def test_scouting_summarizes_only_units_on_opponent_board(self):
        self.page.evaluate("G.jog[1].tab=Array.from({length:4},()=>Array(8).fill(null)); G.jog[1].tab[0][0]=novoInst(G,'knight'); G.jog[1].banco=[novoInst(G,'demon'),...Array(8).fill(null)]")
        self.page.locator('#jogadores .jg[data-id="1"]').click()
        panel = self.page.locator('#espia-analise')
        self.assertEqual(panel.count(), 1, 'Espionagem precisa de resumo estratégico')
        panel.wait_for(state='visible')
        self.assertIn('Armadura média', panel.inner_text())
        self.assertIn('Res. mágica média', panel.inner_text())
        self.assertIn('1 unidades no tabuleiro', panel.inner_text())
        self.assertNotIn('Invocador', panel.inner_text())
        self.page.locator('#bt-espia-v').click()
        self.assertFalse(panel.is_visible())

    def test_mobile_board_and_recipe_controls_fit_screen(self):
        self.page.set_viewport_size({'width':390, 'height':844})
        self.page.wait_for_timeout(200)
        box = self.page.locator('#cv').bounding_box()
        self.assertGreaterEqual(box['x'], 0, 'Tabuleiro cortado à esquerda')
        self.assertLessEqual(box['x']+box['width'], 391, 'Tabuleiro cortado à direita')
        self.page.locator('#bt-rec').click()
        self.assertEqual(self.page.get_by_role('searchbox', name='Buscar receita').count(), 1)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)

    def test_hotkeys_still_work_after_clicking_a_toolbar_button(self):
        self.page.locator('#bt-trava').click()
        self.assertTrue(self.page.evaluate('UI.jog.travada'))
        self.page.keyboard.press('l')
        self.assertFalse(self.page.evaluate('UI.jog.travada'), 'Foco em botão não pode desativar os atalhos')

    def test_recipe_role_filter_and_modal_focus(self):
        self.page.locator('#bt-rec').click()
        self.assertTrue(self.page.evaluate('UI.pausado'))
        self.page.get_by_label('Função do item').select_option('tk')
        text = self.page.locator('#receita-lista').inner_text()
        self.assertIn('Blessed Shield', text)
        self.assertNotIn('Giant Sword', text)
        self.page.get_by_role('button', name='Fechar consulta').focus()
        self.page.keyboard.press('Shift+Tab')
        self.assertTrue(self.page.evaluate("!!document.activeElement.closest('[role=dialog]')"))
        self.page.keyboard.press('Escape')
        self.assertFalse(self.page.evaluate('UI.pausado'))
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'bt-rec')

    def test_available_recipe_list_refreshes_when_inventory_changes(self):
        self.page.evaluate('UI.jog.itens=[3264]; hudItens()')
        self.page.locator('#bt-rec').click()
        self.page.get_by_label('Só o que posso montar').check()
        self.assertEqual(self.page.locator('.receita-card').count(), 0)
        self.page.evaluate('UI.jog.itens.push(3264); hudItens()')
        self.assertEqual(self.page.locator('.receita-card').count(), 1)
        self.page.locator('.receita-card').click()
        self.page.evaluate('hudItens()')
        self.assertIn('Giant Sword', self.page.locator('#receita-detalhe').inner_text())

    def test_online_consultation_does_not_pause_host(self):
        host = self.page
        guest = self.context.new_page()
        guest.on('pageerror', lambda e: self.errors.append(str(e)))
        for page in (host, guest):
            page.goto(self.url+'?rede=local', wait_until='domcontentloaded')
            page.locator('#b-online').click(timeout=30000)
        host.locator('#i-nome').fill('Host')
        host.locator('#b-criar').click()
        host.locator('#cod-sala').wait_for()
        code = host.locator('#cod-sala').inner_text()
        guest.locator('#i-nome').fill('Guest')
        guest.locator('#i-cod').fill(code)
        guest.locator('#b-entrar').click()
        guest.locator('#cod-sala').wait_for()
        host.locator('#b-ini').click()
        for page in (host, guest):
            page.wait_for_function("UI.estado==='jogo' && G.jog.length===8")
        host.locator('#bt-rec').click()
        self.assertFalse(host.evaluate('UI.pausado'))
        remaining = host.evaluate('UI.timer')
        host.wait_for_function('previous => UI.timer < previous', arg=remaining)
        self.assertIn('o tempo continua', host.get_by_role('dialog').inner_text())
        guest.locator('#bt-rec').click()
        self.assertFalse(guest.evaluate('UI.pausado'))
        guest.keyboard.press('Escape')
        host.keyboard.press('Escape')

    def test_new_roster_can_be_previewed_before_starting_a_game(self):
        self.page.evaluate('voltarMenu()')
        button = self.page.get_by_role('button', name='Novas cartas', exact=True)
        self.assertEqual(button.count(), 1, 'Menu deve permitir conhecer as oito cartas')
        button.click()
        self.assertEqual(self.page.locator('[data-nova-carta]').count(), 8)
        self.page.get_by_role('button', name='Ver Grim Reaper', exact=True).click()
        self.assertIn('30%', self.page.get_by_role('dialog').inner_text())
        self.assertIn('60%', self.page.get_by_role('dialog').inner_text())
        self.page.keyboard.press('Escape')
        self.assertEqual(self.page.locator('[data-nova-carta]').count(), 8)

    def test_new_compendium_previews_are_animated(self):
        self.page.evaluate('voltarMenu()')
        self.page.get_by_role('button', name='Novas cartas', exact=True).click()
        self.page.wait_for_function("FOLHAS[SPR.criaturas.minotaur_guard.src]?.ok")
        initial = self.page.locator('[data-nova-carta="minotaur_guard"] canvas').evaluate('c => c.toDataURL()')
        self.page.wait_for_function("initial => document.querySelector('[data-nova-carta=\"minotaur_guard\"] canvas').toDataURL() !== initial", arg=initial)

    def test_all_eight_new_cards_have_visible_sprites_and_skill_descriptions(self):
        ids = ['minotaur_guard','ice_witch','demon_skeleton','hunter','dark_monk','bonelord','wyvern','grim_reaper']
        self.assertEqual(self.page.evaluate('LISTA_U.length'), 53)
        for ident in ids:
            self.page.evaluate("id => {UI.jog.loja=[id,null,null,null,null]; hudLoja();}", ident)
            self.page.wait_for_function("id => FOLHAS[SPR.criaturas[id].src]?.ok", arg=ident)
            name = self.page.evaluate('id => U[id].nome', ident)
            self.page.get_by_role('button', name='Detalhes de '+name, exact=True).click()
            text = self.page.get_by_role('dialog').inner_text().casefold()
            self.assertIn(name.casefold(), text)
            self.assertNotIn('undefined', text)
            self.assertNotIn('nan', text)
            self.page.keyboard.press('Escape')

    def test_click_on_owned_unit_opens_its_sheet_without_moving_or_selling(self):
        self.page.evaluate("UI.jog.loja=['minotaur_guard',null,null,null,null]; hudLoja()")
        self.page.locator('#cartas .cslot[data-i="0"] .art').click()
        before = self.page.evaluate('JSON.stringify([UI.jog.ouro, UI.jog.banco])')
        box = self.page.locator('#cv').bounding_box()
        point = self.page.evaluate("ptCv({onde:'banco',i:0})")
        self.page.mouse.click(box['x']+point['x'], box['y']+point['y'])
        self.assertEqual(self.page.get_by_role('dialog').count(), 1)
        self.assertIn('Minotaur Guard', self.page.get_by_role('dialog').inner_text())
        self.assertEqual(before, self.page.evaluate('JSON.stringify([UI.jog.ouro, UI.jog.banco])'))

    def test_new_units_can_still_be_dragged_to_the_board(self):
        self.page.evaluate("UI.jog.loja=['minotaur_guard',null,null,null,null]; hudLoja()")
        self.page.locator('#cartas .cslot[data-i="0"] .art').click()
        box = self.page.locator('#cv').bounding_box()
        points = self.page.evaluate("({bank:ptCv({onde:'banco',i:0}),board:ptCv({onde:'tab',x:0,y:0})})")
        self.page.mouse.move(box['x']+points['bank']['x'],box['y']+points['bank']['y'])
        self.page.mouse.down()
        self.page.mouse.move(box['x']+points['board']['x'],box['y']+points['board']['y'],steps=8)
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('UI.jog.tab[0][0]?.id'), 'minotaur_guard')
        self.assertEqual(self.page.get_by_role('dialog').count(), 0)

    def test_eight_new_units_sync_through_real_online_snapshots_and_combat(self):
        host = self.page
        guest = self.context.new_page()
        guest.on('pageerror', lambda e: self.errors.append(str(e)))
        for page in (host,guest):
            page.goto(self.url+'?rede=local',wait_until='domcontentloaded')
            page.locator('#b-online').click(timeout=30000)
        host.locator('#i-nome').fill('Host')
        host.locator('#b-criar').click()
        host.locator('#cod-sala').wait_for()
        guest.locator('#i-nome').fill('Guest')
        guest.locator('#i-cod').fill(host.locator('#cod-sala').inner_text())
        guest.locator('#b-entrar').click()
        guest.locator('#cod-sala').wait_for()
        host.locator('#b-ini').click()
        guest.wait_for_function("UI.estado==='jogo'")
        guest_id = guest.evaluate('UI.jog.id')
        host.evaluate("""() => {
            G.jog.filter(p=>p.humano).forEach(p=>{
                p.nivel=9;p.tab=Array.from({length:4},()=>Array(NC).fill(null));
                NOVAS_CARTAS.forEach((id,i)=>p.tab[i<NC?0:1][i%NC]=novoInst(G,id));p.pronto=false;   // 7 colunas: a 8ª carta vai para a 2ª linha
            });
            paraHumanos(cl=>enviarSnapCl(cl,'snap',{force:true}));posAcao();
        }""")
        guest.wait_for_function("contarTab(UI.jog)===8 && UI.jog.tab[1][0]?.id==='grim_reaper'")
        guest.locator('#bt-pronto').click()
        host.locator('#bt-pronto').click()
        guest.wait_for_function("UI.fase==='combate' && UI.C")
        expected = host.evaluate("id => {const C=G.lutas[id].C;simular(C);return JSON.stringify({seed:C.seed,t:C.t,v:C.venc,u:C.un.map(u=>[u.d.id,u.hp,u.mana,u.st.d,u.st.c])});}",guest_id)
        actual = guest.evaluate("() => {const C=UI.C;simular(C);return JSON.stringify({seed:C.seed,t:C.t,v:C.venc,u:C.un.map(u=>[u.d.id,u.hp,u.mana,u.st.d,u.st.c])});}")
        self.assertEqual(actual,expected)
        self.assertEqual(guest.evaluate('Online.dessinc'),0)

    def test_seeded_simulations_complete(self):
        self.page.goto(self.url+'?sim=3&seed=1', wait_until='domcontentloaded')
        self.page.wait_for_function("document.querySelector('#sim').textContent.startsWith('partidas ')", timeout=60000)
        text = self.page.locator('#sim').inner_text()
        self.assertIn('partidas 3 | erros 0 | travas 0', text)
        # Canonical seed with the 53-card roster on the 7x8 hex board (square 8x8 board: 388/403; Etapa 1 had 400 fights;
        # hex board before the TFT walking pace / backline assassin leap / bot formation: 416).
        self.assertIn('lutas PvP/PvE 396', text)

if __name__ == '__main__':
    unittest.main()
