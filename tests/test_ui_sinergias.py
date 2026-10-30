"""Rastreador de sinergias estilo TFT: python3 -m unittest discover -s tests -v.
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

PLACE = """(()=>{const p=UI.jog;for(let y=0;y<4;y++)for(let x=0;x<p.tab[y].length;x++)p.tab[y][x]=null;
const ids=Object.keys(U).filter(id=>!U[id].pve).slice(0,9);
ids.forEach((id,i)=>{p.tab[Math.floor(i/7)][i%7]={uid:9000+i,id,e:1,itens:[]};});hudSinergias();})()"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class SinergiasTests(unittest.TestCase):
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

    def abrir(self, w, h):
        self.context = self.browser.new_context(viewport={'width': w, 'height': h})
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

    def test_vazio_curto_e_rotulo_acessivel(self):
        self.abrir(1536, 730)
        txt = self.page.locator('#sinergias .vazio').inner_text()
        self.assertLess(len(txt), 70, 'Texto vazio das sinergias deve ser curto')
        self.assertEqual(self.page.locator('#esq h2').inner_text().strip().casefold(), 'sinergias')

    def test_rastreador_compacto_ativas_antes_das_inativas(self):
        self.abrir(1536, 730)
        self.page.evaluate(PLACE)
        info = self.page.evaluate("""[...document.querySelectorAll('#sinergias .sin')].map(e=>({a:e.classList.contains('ativa'),h:e.getBoundingClientRect().height,pips:getComputedStyle(e.querySelector('.pips')).display,tip:e.dataset.tip,tr:e.dataset.tr}))""")
        self.assertGreaterEqual(len(info), 8)
        ativas = [i for i in info if i['a']]
        inativas = [i for i in info if not i['a']]
        self.assertTrue(ativas and inativas)
        self.assertEqual([i['a'] for i in info], [True] * len(ativas) + [False] * len(inativas), 'Ativas primeiro')
        for i in info:
            self.assertTrue(i['tip'].startswith('sin:') and i['tr'])
        self.assertLessEqual(max(i['h'] for i in ativas), 48, 'Linha ativa compacta')
        self.assertLess(max(i['h'] for i in inativas), min(i['h'] for i in ativas), 'Inativas recolhidas')
        self.assertTrue(all(i['pips'] == 'none' for i in inativas))
        self.assertTrue(all(i['pips'] != 'none' for i in ativas))
        total = sum(i['h'] for i in info[:10]) + 3 * 10
        self.assertLess(total, 470, '~10 traços devem caber na coluna a 730px de altura')
        # tooltip e realce das unidades continuam funcionando
        self.page.hover('#sinergias .sin')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.evaluate('UI.hoverTr'), info[0]['tr'])
        self.assertTrue(self.page.locator('#tip').is_visible())

    def test_celular_retrato_botao_sin(self):
        self.abrir(390, 844)
        self.page.evaluate(PLACE)
        self.assertFalse(self.page.locator('#esq').is_visible())
        self.page.locator('#bt-t-sin').click()
        self.assertTrue(self.page.locator('#esq').is_visible())
        self.assertTrue(self.page.locator('#sinergias .sin.ativa .nm').first.is_visible())


if __name__ == '__main__':
    unittest.main()
