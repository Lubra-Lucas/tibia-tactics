"""Inventário em menu suspenso (desktop): python3 -m unittest discover -s tests -v.
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

class ItensMenuTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={'width': 1536, 'height': 730})
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.goto(self.url, wait_until='domcontentloaded')
        self.page.locator('#b-jogar').click(timeout=30000)
        self.page.evaluate('UI.timer=999')
        self.btn = self.page.locator('#bt-itens-menu')
        self.pop = self.page.locator('#itens')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def expanded(self):
        return self.btn.get_attribute('aria-expanded')

    def test_closed_by_default_with_badge_and_toggle_button(self):
        self.assertTrue(self.btn.is_visible())
        self.assertEqual(self.btn.get_attribute('aria-controls'), 'itens')
        self.assertEqual(self.expanded(), 'false')
        self.assertFalse(self.pop.is_visible(), 'O inventário começa fechado')
        self.page.evaluate('UI.jog.itens=[3264,3357]; hudItens()')
        self.assertEqual(self.page.locator('#bt-itens-menu .badge').inner_text(), '2')
        self.page.evaluate('UI.jog.itens.push(3370); hudItens()')
        self.assertIn('novo', self.btn.get_attribute('class'), 'Item novo destaca o contador')
        self.btn.click()
        self.assertEqual(self.expanded(), 'true')
        self.assertTrue(self.pop.is_visible())
        self.assertEqual(self.page.locator('#grade-itens .slot.cheio').count(), 3)
        self.assertTrue(self.page.locator('#runas').is_visible())
        self.btn.click()
        self.assertEqual(self.expanded(), 'false')
        self.assertFalse(self.pop.is_visible())

    def test_escape_closes_and_returns_focus_without_pausing(self):
        self.btn.click()
        self.assertTrue(self.pop.is_visible())
        self.page.keyboard.press('Escape')
        self.assertFalse(self.pop.is_visible())
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'bt-itens-menu')
        self.assertFalse(self.page.evaluate('UI.pausado'), 'Esc fecha o menu antes de pausar o jogo')

    def test_click_outside_closes(self):
        self.btn.click()
        self.pop.locator('h3').click()
        self.assertTrue(self.pop.is_visible(), 'Clique dentro não fecha')
        self.page.locator('#faixa-rodada').click()
        self.assertFalse(self.pop.is_visible())
        self.assertEqual(self.expanded(), 'false')

    def test_recipes_and_forge_stay_reachable_while_closed(self):
        self.assertTrue(self.page.locator('#bt-rec').is_visible())
        self.page.evaluate('UI.jog.itens=[3366,3366]; hudItens()')
        self.assertTrue(self.page.locator('#bt-forjar').is_visible())

    def drag(self, start, end):
        self.page.mouse.move(*start)
        self.page.mouse.down()
        self.page.mouse.move(start[0]+12, start[1]+8, steps=3)
        self.page.mouse.move(*end, steps=12)
        classes = self.pop.get_attribute('class') or ''
        self.page.mouse.up()
        return classes

    def test_drag_item_from_menu_onto_bench_unit_equips_it(self):
        self.page.evaluate("UI.jog.loja=['minotaur_guard',null,null,null,null]; hudLoja()")
        self.page.locator('#cartas .cslot[data-i="0"] .art').click()
        self.page.evaluate('UI.jog.itens=[3264,3357]; hudItens()')
        self.btn.click()
        slot = self.page.locator('#grade-itens .slot[data-s="0"]').bounding_box()
        box = self.page.locator('#cv').bounding_box()
        bank = self.page.evaluate('(()=>{const k=cv.getBoundingClientRect().width/cv.width;return {x:(BEN_X+16)*Z*k,y:(BEN_Y+16)*Z*k}})()')
        classes = self.drag((slot['x']+slot['width']/2, slot['y']+slot['height']/2), (box['x']+bank['x'], box['y']+bank['y']))
        self.assertIn('fora', classes, 'Fora do menu, o popover sai do caminho durante o arrasto')
        self.assertEqual(self.page.evaluate('UI.jog.banco.find(Boolean).itens'), [3264])
        self.assertEqual(self.page.evaluate('UI.jog.itens'), [3357])
        self.assertNotIn('fora', self.pop.get_attribute('class') or '')
        self.assertEqual(self.page.get_by_role('dialog').count(), 0)

    def test_drag_item_onto_another_item_inside_menu_combines(self):
        self.page.evaluate('UI.jog.itens=[3264,3264]; hudItens()')
        self.btn.click()
        a = self.page.locator('#grade-itens .slot[data-s="0"]').bounding_box()
        b = self.page.locator('#grade-itens .slot[data-s="1"]').bounding_box()
        self.drag((a['x']+a['width']/2, a['y']+a['height']/2), (b['x']+b['width']/2, b['y']+b['height']/2))
        self.assertEqual(self.page.evaluate('UI.jog.itens.length'), 1)
        self.assertTrue(self.page.evaluate('ehCompleto(UI.jog.itens[0])'))

    def test_mobile_layouts_keep_their_own_items_panel(self):
        for w, h in [(844, 390), (390, 844)]:
            self.page.set_viewport_size({'width': w, 'height': h})
            self.page.wait_for_timeout(200)
            self.assertFalse(self.btn.is_visible())
            self.assertEqual(self.page.evaluate("document.getElementById('itens').parentNode.id"), 'base')
            self.assertTrue(self.page.evaluate("!!document.querySelector('#itens h3 #bt-rec')"))
            self.page.locator('#bt-t-itens').click()
            self.assertTrue(self.page.locator('#grade-itens').is_visible())
            self.page.locator('#bt-t-itens').click()
        self.page.set_viewport_size({'width': 1536, 'height': 730})
        self.page.wait_for_timeout(200)
        self.assertTrue(self.btn.is_visible())
        self.assertEqual(self.page.evaluate("document.getElementById('itens').parentNode.id"), 'cvbox')

if __name__ == '__main__':
    unittest.main()
