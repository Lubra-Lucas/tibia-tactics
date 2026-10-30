"""Loja estilo TFT: cinco encaixes iguais numa fileira, sem leque.
python3 -m unittest discover -s tests -v  (requer Python Playwright e Chromium; CHROMIUM_PATH aponta o executável).
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

# retângulos dos encaixes e transform computado de cada carta
MEDIDAS = """() => [...document.querySelectorAll('#cartas .cslot')].map(s => {
  const b = s.getBoundingClientRect(), c = s.querySelector('.carta');
  return {l: b.left, t: b.top, w: b.width, h: b.height, tf: getComputedStyle(c).transform, r: getComputedStyle(c).getPropertyValue('--r').trim()};
})"""

class LojaTests(unittest.TestCase):
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

    def abrir(self, w, h, **kw):
        self.context = self.browser.new_context(viewport={'width': w, 'height': h}, **kw)
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.goto(self.url, wait_until='domcontentloaded')
        self.page.locator('#b-jogar').click(timeout=30000)
        self.page.evaluate("UI.timer=999; UI.jog.ouro=50; UI.jog.loja=['paladin','knight','druid','necromancer','dragon']; hudLoja()")
        self.page.wait_for_timeout(900)   # deixa terminar a virada das cartas novas

    def tearDown(self):
        if getattr(self, 'context', None):
            self.context.close()
        self.assertEqual(self.errors, [])

    def assert_fileira(self, m):
        self.assertEqual(len(m), 5)
        larguras = [s['w'] for s in m]
        self.assertLessEqual(max(larguras) - min(larguras), 1, 'os cinco encaixes têm a mesma largura')
        self.assertLessEqual(max(s['t'] for s in m) - min(s['t'] for s in m), 1, 'todos na mesma linha')
        for a, b in zip(m, m[1:]):
            self.assertGreaterEqual(b['l'], a['l'] + a['w'] - 0.5, 'encaixes não se sobrepõem')

    def test_cartas_retas_em_encaixes_iguais_no_desktop(self):
        for w, h in [(1536, 730), (1920, 1080), (1366, 768)]:
            with self.subTest(tela=f'{w}x{h}'):
                self.abrir(w, h)
                m = self.page.evaluate(MEDIDAS)
                self.assert_fileira(m)
                for s in m:
                    self.assertIn(s['tf'], ('none', 'matrix(1, 0, 0, 1, 0, 0)'), 'carta sem rotação (sem leque)')
                    self.assertIn(s['r'], ('', '0deg'))
                # com o mouse em cima a carta só sobe (translação), nunca gira
                self.page.hover('#cartas .cslot[data-i="1"]')
                self.page.wait_for_timeout(300)
                tf = self.page.evaluate("getComputedStyle(document.querySelector('#cartas .cslot[data-i=\"1\"] .carta')).transform")
                if tf != 'none':
                    a, b, c, d = [float(x) for x in tf[7:-1].split(',')[:4]]
                    self.assertAlmostEqual(b, 0, places=3)
                    self.assertAlmostEqual(c, 0, places=3)
                self.context.close()
                self.assertEqual(self.errors, [])
                self.context = None

    def test_celular_em_pe_cinco_cartas_numa_fileira(self):
        self.abrir(390, 844, is_mobile=True, has_touch=True)
        m = self.page.evaluate(MEDIDAS)
        self.assert_fileira(m)
        self.assertLessEqual(m[-1]['l'] + m[-1]['w'], 390, 'a fileira cabe na tela')
        self.assertTrue(all(s['tf'] == 'none' for s in m))

    def test_comprar_carta_leva_unidade_ao_banco_e_esvazia_o_encaixe(self):
        self.abrir(1536, 730)
        ouro = self.page.evaluate('UI.jog.ouro')
        self.page.locator('#cartas .cslot[data-i="1"]').click()
        self.assertEqual(self.page.locator('.voo').count(), 1, 'a carta voa até o banco')
        self.page.wait_for_timeout(700)
        self.assertEqual(self.page.evaluate('UI.jog.loja[1]'), None)
        self.assertEqual(self.page.evaluate("UI.jog.banco.filter(Boolean).map(u=>u.id)"), ['knight'])
        self.assertEqual(self.page.evaluate('UI.jog.ouro'), ouro - 1)
        self.assertEqual(self.page.locator('#cartas .cslot[data-i="1"].vazio').count(), 1)
        self.assertEqual(self.page.locator('.voo').count(), 0)
        self.assert_fileira(self.page.evaluate(MEDIDAS))

    def test_rolar_anima_e_travar_marca_a_loja(self):
        self.abrir(1536, 730)
        antes = self.page.evaluate('UI.jog.loja.join()')
        self.page.locator('#bt-rolar').click()
        self.page.wait_for_timeout(50)
        if self.page.evaluate('UI.jog.loja.join()') != antes:
            self.assertGreater(self.page.locator('#cartas .cslot.entra').count(), 0, 'cartas novas viram ao rolar')
        self.page.locator('#bt-trava').click()
        self.page.wait_for_timeout(100)
        self.assertIn('travada', self.page.locator('#loja').get_attribute('class') or '')
        self.page.locator('#bt-trava').click()
        self.page.wait_for_timeout(100)
        self.assertNotIn('travada', self.page.locator('#loja').get_attribute('class') or '')

if __name__ == '__main__':
    unittest.main()
