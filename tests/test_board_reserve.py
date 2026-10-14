"""Real pointer and keyboard regressions for the board/reserve redesign."""
import unittest
import test_interface as base

class BoardReserveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base.InterfaceTests.setUpClass()
        cls.browser=base.InterfaceTests.browser
        cls.url=base.InterfaceTests.url

    @classmethod
    def tearDownClass(cls):
        base.InterfaceTests.tearDownClass()

    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1440,'height':900})
        self.page=self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.goto(self.url,wait_until='domcontentloaded')
        self.page.locator('#b-jogar').click(timeout=30000)
        self.page.evaluate('UI.timer=999')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors,[])

    def populate(self):
        self.page.evaluate("""() => {
            UI.jog.banco=Array(9).fill(null);UI.jog.tab=Array.from({length:4},()=>Array(8).fill(null));
            UI.jog.banco[0]=novoInst(G,'minotaur_guard');UI.jog.banco[0].itens=[3281];
            UI.jog.banco[1]=novoInst(G,'minotaur_guard');UI.jog.banco[2]=novoInst(G,'hunter');
            posAcao();
        }""")
        self.page.wait_for_function("document.querySelector('[data-banco=\"0\"]').textContent.includes('Minotaur Guard')")

    def slot(self,i):return self.page.locator(f'#reserva-slots [data-banco="{i}"]')

    def board_point(self,x,y):
        rect=self.page.locator('#cv').bounding_box()
        p=self.page.evaluate('([x,y])=>({x:(BX+(x+.5)*TS)*Z,y:(BY+(y+4+.5)*TS)*Z})',[x,y])
        return {'x':rect['x']+p['x'],'y':rect['y']+p['y']}

    def drag(self,source,target,release=True):
        self.page.mouse.move(source['x'],source['y']);self.page.mouse.down()
        self.page.mouse.move(target['x'],target['y'],steps=10)
        if release:self.page.mouse.up()

    def center(self,locator):
        locator.wait_for(state='visible')
        box=locator.bounding_box();return {'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}

    def test_nine_identified_slots_show_equipment_and_promotion_progress(self):
        self.populate()
        self.assertEqual(self.page.locator('#reserva-slots [data-banco]').count(),9)
        self.assertIn('Minotaur Guard',self.slot(0).inner_text())
        self.assertIn('2/3',self.slot(0).inner_text())
        self.assertEqual(self.slot(0).locator('.ic').count(),1)
        self.assertIn('Vazio',self.slot(8).inner_text())

    def test_selection_uses_compact_panel_without_pausing_or_mutating_formation(self):
        self.populate();self.assertEqual(self.slot(0).count(),1)
        before=self.page.evaluate('JSON.stringify([UI.jog.ouro,UI.jog.banco,UI.jog.tab])')
        self.slot(0).click()
        self.assertIn('Minotaur Guard',self.page.locator('#unidade-selecionada').inner_text())
        self.assertEqual(self.page.get_by_role('dialog').count(),0)
        self.assertFalse(self.page.evaluate('UI.pausado'))
        self.assertEqual(before,self.page.evaluate('JSON.stringify([UI.jog.ouro,UI.jog.banco,UI.jog.tab])'))
        self.assertEqual(self.slot(0).get_attribute('aria-pressed'),'true')

    def test_drag_preview_and_move_from_reserve_to_board(self):
        self.populate();self.assertEqual(self.slot(0).count(),1)
        self.drag(self.center(self.slot(0)),self.board_point(0,0),release=False)
        self.assertIn('Mover',self.page.locator('#movimento-previa').inner_text())
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('UI.jog.tab[0][0]?.id'),'minotaur_guard')
        self.page.wait_for_function("document.getElementById('arena-capacidade').textContent.includes('1/3')")
        self.assertIn('1/3',self.page.locator('#arena-capacidade').inner_text())
        self.assertEqual(self.page.evaluate('UI.jog.banco[0]'),None)

    def test_occupied_destination_previews_and_executes_swap(self):
        self.populate();self.assertEqual(self.slot(0).count(),1)
        self.page.evaluate("UI.jog.tab[0][0]=novoInst(G,'ice_witch');posAcao()")
        self.drag(self.center(self.slot(0)),self.board_point(0,0),release=False)
        self.assertIn('Trocar',self.page.locator('#movimento-previa').inner_text())
        self.assertIn('Ice Witch',self.page.locator('#movimento-previa').inner_text())
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('UI.jog.tab[0][0].id'),'minotaur_guard')
        self.assertEqual(self.page.evaluate('UI.jog.banco[0].id'),'ice_witch')

    def test_board_limit_blocks_empty_drop_but_allows_swap(self):
        self.populate();self.assertEqual(self.slot(0).count(),1)
        self.page.evaluate("UI.jog.nivel=1;UI.jog.tab[0][0]=novoInst(G,'ice_witch');posAcao()")
        before=self.page.evaluate('JSON.stringify(UI.jog.banco)')
        self.drag(self.center(self.slot(0)),self.board_point(1,0),release=False)
        self.assertIn('Limite',self.page.locator('#movimento-previa').inner_text())
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('JSON.stringify(UI.jog.banco)'),before)
        self.assertEqual(self.page.evaluate('UI.jog.tab[0][1]'),None)

    def test_dropping_on_shop_never_sells_and_sale_zone_previews_name_and_value(self):
        self.populate();self.assertEqual(self.slot(0).count(),1)
        gold=self.page.evaluate('UI.jog.ouro')
        self.drag(self.center(self.slot(0)),self.center(self.page.locator('#loja')))
        self.assertEqual(self.page.evaluate('UI.jog.banco[0].id'),'minotaur_guard')
        self.assertEqual(self.page.evaluate('UI.jog.ouro'),gold)
        self.drag(self.center(self.slot(0)),self.center(self.page.locator('#zona-venda')),release=False)
        self.assertIn('Minotaur Guard',self.page.locator('#zona-venda').inner_text())
        self.assertEqual(self.page.locator('#venda-v').inner_text(),'2')
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('UI.jog.banco[0]'),None)
        self.assertEqual(self.page.evaluate('UI.jog.ouro'),gold+2)
        self.assertIn(3281,self.page.evaluate('UI.jog.itens'))

    def test_items_can_still_be_equipped_on_reserve_units(self):
        self.populate();self.assertEqual(self.slot(2).count(),1)
        self.page.evaluate('UI.jog.itens=[3349];hudItens()')
        self.drag(self.center(self.page.locator('#grade-itens [data-slot="0"]')),self.center(self.slot(2)))
        self.assertEqual(self.page.evaluate('UI.jog.banco[2].itens'),[3349])
        self.assertEqual(self.page.evaluate('UI.jog.itens'),[])

    def test_keyboard_selection_and_mobile_access_to_ninth_slot(self):
        self.populate();self.assertEqual(self.slot(0).count(),1)
        self.slot(0).focus();self.page.keyboard.press('Enter')
        self.assertIn('Minotaur Guard',self.page.locator('#unidade-selecionada').inner_text())
        self.page.set_viewport_size({'width':390,'height':844})
        self.page.get_by_role('button',name='Próximas vagas da reserva').click()
        self.page.get_by_role('button',name='Próximas vagas da reserva').click()
        self.page.get_by_role('button',name='Próximas vagas da reserva').click()
        self.slot(8).scroll_into_view_if_needed()
        box=self.slot(8).bounding_box()
        self.assertGreaterEqual(box['x'],0)
        self.assertLessEqual(box['x']+box['width'],390)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)

    def test_canvas_click_selects_board_unit_and_shows_reachable_tiles(self):
        self.populate()
        self.page.evaluate("UI.jog.tab[0][0]=novoInst(G,'hunter');posAcao()")
        point=self.board_point(0,0);self.page.mouse.click(point['x'],point['y'])
        self.assertEqual(self.page.get_by_role('dialog').count(),0)
        self.assertIn('Hunter',self.page.locator('#unidade-selecionada').inner_text())
        self.assertIn('Alcance',self.page.locator('#unidade-selecionada').inner_text())

    def test_arena_grows_and_resizes_without_covering_reserve_or_round_strip(self):
        self.populate()
        self.page.wait_for_function('Z>1.5')
        for width,height in [(1440,900),(1024,768),(390,844)]:
            self.page.set_viewport_size({'width':width,'height':height})
            self.page.wait_for_function("document.getElementById('cv').getBoundingClientRect().bottom <= document.getElementById('reserva').getBoundingClientRect().top")
            cv=self.page.locator('#cv').bounding_box();strip=self.page.locator('#faixa-rodada').bounding_box()
            self.assertGreaterEqual(cv['y'],strip['y']+strip['height'])
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),width)

    def test_scouting_does_not_move_or_equip_the_hidden_own_formation(self):
        self.populate()
        self.page.evaluate("UI.jog.tab[0][0]=novoInst(G,'knight');G.jog[1].tab[0][0]=novoInst(G,'hunter');UI.jog.itens=[3349];posAcao();atualizarSujos();espiarJog(1)")
        before=self.page.evaluate('JSON.stringify([UI.jog.banco,UI.jog.tab,UI.jog.itens])')
        self.drag(self.center(self.slot(0)),self.board_point(0,0))
        self.drag(self.center(self.page.locator('#grade-itens [data-slot="0"]')),self.board_point(0,0))
        self.assertEqual(before,self.page.evaluate('JSON.stringify([UI.jog.banco,UI.jog.tab,UI.jog.itens])'))
        self.assertEqual(self.page.evaluate('UI.espiar'),1)
        self.assertEqual(self.page.evaluate('UI.drag'),None)

    def test_touch_drag_and_pointer_cancel_leave_no_sale_or_drag_state(self):
        self.populate();self.page.set_viewport_size({'width':390,'height':844})
        self.slot(0).scroll_into_view_if_needed()
        source=self.center(self.slot(0));target=self.board_point(0,0)
        cdp=self.context.new_cdp_session(self.page)
        def touch(kind,p):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind in ['touchEnd','touchCancel'] else [{'x':p['x'],'y':p['y'],'id':1}]})
        touch('touchStart',source);touch('touchMove',target);touch('touchCancel',target)
        self.assertEqual(self.page.evaluate('UI.drag'),None)
        self.assertEqual(self.page.evaluate('UI.jog.banco[0].id'),'minotaur_guard')
        self.assertTrue(self.page.locator('#movimento-previa').is_hidden())
        self.assertNotIn('on',self.page.locator('#zona-venda').get_attribute('class') or '')
        touch('touchStart',source);touch('touchMove',target);touch('touchEnd',target)
        self.assertEqual(self.page.evaluate('UI.jog.tab[0][0]?.id'),'minotaur_guard')
        self.assertEqual(self.page.evaluate('UI.drag'),None)

    def test_real_purchase_fuses_reserve_copies_and_updates_stars(self):
        self.populate()
        self.page.evaluate("UI.jog.ouro=100;UI.jog.loja=['minotaur_guard',null,null,null,null];hudLoja()")
        self.page.locator('#cartas .cslot[data-i="0"] .art').click()
        self.page.wait_for_function("document.querySelector('#reserva-slots [aria-label*=\"2 estrelas\"]')")
        copies=self.page.evaluate("UI.jog.banco.filter(i=>i&&i.id==='minotaur_guard').map(i=>i.e)")
        self.assertEqual(copies,[2])

    def test_reserve_sprites_animate_and_respect_reduced_motion(self):
        self.populate();canvas=self.slot(0).locator('canvas')
        initial=canvas.evaluate('c=>c.toDataURL()')
        self.page.wait_for_function("initial=>document.querySelector('[data-banco=\"0\"] canvas').toDataURL()!==initial",arg=initial)
        self.page.evaluate('UI.reduz=true')
        self.page.wait_for_timeout(100)
        still=canvas.evaluate('c=>c.toDataURL()')
        self.page.wait_for_timeout(300)
        self.assertEqual(still,canvas.evaluate('c=>c.toDataURL()'))

if __name__=='__main__':unittest.main()
