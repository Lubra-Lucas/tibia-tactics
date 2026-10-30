"""Itens sempre visíveis dentro da cena (desktop estilo TFT): python3 -m unittest discover -s tests -v.
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

RECTS = """(() => {const r=e=>{const b=document.querySelector(e).getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}};
  const cv=r('#cv'),k=cv.w/CW;return {itens:r('#itens'),grade:r('#grade-itens'),base:r('#base'),esq:r('#esq'),
  nucleo:{l:cv.l+(CW-CW0)/2*k,r:cv.l+(CW+CW0)/2*k}}})()"""

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class ItensCenaTests(unittest.TestCase):
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
        self.page.wait_for_timeout(300)
        self.pop = self.page.locator('#itens')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def test_items_always_visible_beside_the_board_without_menu(self):
        self.assertEqual(self.page.locator('#bt-itens-menu').count(), 0, 'Sem botão de menu: os itens nunca ficam escondidos')
        self.assertEqual(self.page.evaluate("document.getElementById('itens').parentNode.id"), 'app')
        self.assertTrue(self.pop.is_visible())
        self.assertEqual(self.page.locator('#grade-itens .slot').count(), self.page.evaluate('MAX_ITENS'))
        self.page.evaluate('UI.jog.itens=[3264,3357,3370]; hudItens()')
        self.assertEqual(self.page.locator('#grade-itens .slot.cheio').count(), 3)
        for sel in ['#runas', '#bt-rec', '#grade-itens .slot[data-s="14"]']:
            self.assertTrue(self.page.locator(sel).is_visible(), sel)
        m = self.page.evaluate(RECTS)
        # bancada de itens: colada à esquerda do núcleo do tabuleiro, acima da loja e abaixo das sinergias
        self.assertLessEqual(m['itens']['r'], m['nucleo']['l'] + 1)
        self.assertLess(m['nucleo']['l'] - m['itens']['r'], 40, 'itens encostados no tabuleiro')
        self.assertLessEqual(m['itens']['b'], m['base']['t'])
        self.assertLessEqual(m['esq']['b'], m['itens']['t'])
        self.assertGreater(m['grade']['h'], m['grade']['w'], 'bancada vertical de itens')
        # sem painel pesado: fundo transparente
        self.assertEqual(self.page.evaluate("getComputedStyle(document.getElementById('itens')).backgroundImage"), 'none')

    def test_items_stay_visible_in_combat(self):
        self.page.evaluate('UI.jog.itens=[3264]; hudItens(); UI.timer=0')
        self.page.wait_for_function("document.getElementById('app').classList.contains('em-combate')", timeout=20000)
        self.page.wait_for_timeout(400)
        self.assertTrue(self.page.locator('#grade-itens .slot.cheio').is_visible())
        mini = self.page.evaluate("document.getElementById('mini').getBoundingClientRect().top")
        self.assertLessEqual(self.page.evaluate(RECTS)['itens']['b'], mini)

    def test_recipes_and_forge_stay_reachable(self):
        self.assertTrue(self.page.locator('#bt-rec').is_visible())
        self.page.evaluate('UI.jog.itens=[3366,3366]; hudItens()')
        self.assertTrue(self.page.locator('#bt-forjar').is_visible())

    def drag(self, start, end):
        self.page.mouse.move(*start)
        self.page.mouse.down()
        self.page.mouse.move(start[0]+12, start[1]+8, steps=3)
        self.page.mouse.move(*end, steps=12)
        self.page.mouse.up()

    def test_drag_item_onto_bench_unit_equips_it(self):
        self.page.evaluate("UI.jog.loja=['minotaur_guard',null,null,null,null]; hudLoja()")
        self.page.locator('#cartas .cslot[data-i="0"] .art').click()
        self.page.evaluate('UI.jog.itens=[3264,3357]; hudItens()')
        slot = self.page.locator('#grade-itens .slot[data-s="0"]').bounding_box()
        box = self.page.locator('#cv').bounding_box()
        bank = self.page.evaluate('(()=>{const k=cv.getBoundingClientRect().width/cv.width;return {x:(BEN_X+16)*Z*k,y:(BEN_Y+16)*Z*k}})()')
        self.drag((slot['x']+slot['width']/2, slot['y']+slot['height']/2), (box['x']+bank['x'], box['y']+bank['y']))
        self.assertEqual(self.page.evaluate('UI.jog.banco.find(Boolean).itens'), [3264])
        self.assertEqual(self.page.evaluate('UI.jog.itens'), [3357])
        self.assertEqual(self.page.get_by_role('dialog').count(), 0)

    def test_drag_item_onto_another_item_combines(self):
        self.page.evaluate('UI.jog.itens=[3264,3264]; hudItens()')
        a = self.page.locator('#grade-itens .slot[data-s="0"]').bounding_box()
        b = self.page.locator('#grade-itens .slot[data-s="1"]').bounding_box()
        self.drag((a['x']+a['width']/2, a['y']+a['height']/2), (b['x']+b['width']/2, b['y']+b['height']/2))
        self.assertEqual(self.page.evaluate('UI.jog.itens.length'), 1)
        self.assertTrue(self.page.evaluate('ehCompleto(UI.jog.itens[0])'))

    def test_mobile_layouts_keep_their_own_items_panel(self):
        for w, h in [(844, 390), (390, 844)]:
            self.page.set_viewport_size({'width': w, 'height': h})
            self.page.wait_for_timeout(200)
            self.assertEqual(self.page.evaluate("document.getElementById('itens').parentNode.id"), 'base')
            self.assertTrue(self.page.evaluate("!!document.querySelector('#itens h3 #bt-rec')"))
            self.assertFalse(self.page.locator('#grade-itens').is_visible())
            self.page.locator('#bt-t-itens').click()
            self.assertTrue(self.page.locator('#grade-itens').is_visible())
            self.page.locator('#bt-t-itens').click()
        self.page.set_viewport_size({'width': 1536, 'height': 730})
        self.page.wait_for_timeout(200)
        self.assertEqual(self.page.evaluate("document.getElementById('itens').parentNode.id"), 'app')
        self.assertTrue(self.page.locator('#grade-itens').is_visible())

if __name__ == '__main__':
    unittest.main()
