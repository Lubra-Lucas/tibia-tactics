"""Lista de jogadores estilo TFT (ouro e juros de cada jogador): python3 -m unittest discover -s tests -v.
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

# ouro e juros mostrados em cada linha, junto com o estado e a regra de juros do jogo (jurosDe)
LINHAS = """[...document.querySelectorAll('#jogadores .jg')].map(el=>{const q=G.jog[+el.dataset.id],g=el.querySelector('.jgo');
  return {id:q.id,vivo:q.vivo,ouro:q.ouro,juros:jurosDe(q),jm:jurosMax(q),visivel:!g.hidden&&getComputedStyle(g).display!=='none',
    txtOuro:g.querySelector('b').textContent,txtJuros:g.querySelector('.jr').textContent,pips:g.querySelectorAll('.jp u').length,
    pipsOn:g.querySelectorAll('.jp u.on').length,eu:el.classList.contains('eu'),local:!!q.local};})"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class JogadoresTests(unittest.TestCase):
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

    def conferir(self, linhas):
        self.assertEqual(len(linhas), self.page.evaluate('G.jog.length'))
        for r in linhas:
            if not r['vivo']:
                self.assertFalse(r['visivel'], r)
                continue
            self.assertTrue(r['visivel'], r)
            self.assertEqual(r['txtOuro'], str(r['ouro']), r)
            self.assertEqual(r['txtJuros'], '+%d' % r['juros'], r)
            self.assertEqual(r['pips'], r['jm'], r)
            self.assertEqual(r['pipsOn'], r['juros'], r)
            self.assertEqual(r['eu'], r['local'], r)

    def test_cada_linha_mostra_ouro_e_juros_do_estado(self):
        # ouros diferentes para cada jogador (inclui faixas de juros 0..5 e acima do teto)
        self.page.evaluate("G.jog.forEach((q,i)=>{q.ouro=[0,9,10,23,37,49,50,88][i%8];});marcar('jog')")
        self.page.wait_for_timeout(200)
        linhas = self.page.evaluate(LINHAS)
        self.conferir(linhas)
        juros = sorted(r['juros'] for r in linhas)
        self.assertEqual(juros[0], 0)
        self.assertEqual(juros[-1], 5)

    def test_atualiza_depois_das_rodadas_e_tooltip(self):
        for _ in range(3):
            r = self.page.evaluate('G.rodada')
            self.page.evaluate('UI.vel=4;UI.timer=0')
            self.page.wait_for_function(f"G.rodada>{r}&&UI.fase==='prep'", timeout=60000)
            self.page.evaluate('UI.timer=999')
        self.page.wait_for_timeout(200)
        self.conferir(self.page.evaluate(LINHAS))
        bot = self.page.evaluate('G.jog.find(q=>!q.local&&q.vivo).id')
        tip = self.page.evaluate(f"htmlTip('jog:{bot}')")
        ouro, juros = self.page.evaluate(f'[G.jog[{bot}].ouro,jurosDe(G.jog[{bot}])]')
        self.assertIn('Ouro', tip)
        self.assertIn('Juros', tip)
        self.assertIn(str(ouro), tip)
        self.assertIn('+%d' % juros, tip)

    def test_convidado_sem_campo_de_ouro_esconde(self):
        # anfitrião antigo (sem "ou" no pubList): o ouro dos outros fica escondido; com o campo, aparece
        self.page.evaluate("pubAplicar(pubList(false).map(o=>{const c=Object.assign({},o);delete c.ou;return c;}));marcar('jog')")
        self.page.wait_for_timeout(200)
        linhas = self.page.evaluate(LINHAS)
        for r in linhas:
            self.assertEqual(r['visivel'], r['local'] and r['vivo'], r)
        self.page.evaluate("G.jog.forEach(q=>{if(!q.local)q.ouro=31;});pubAplicar(pubList(false));marcar('jog')")
        self.page.wait_for_timeout(200)
        linhas = self.page.evaluate(LINHAS)
        self.conferir(linhas)
        self.assertTrue(all(r['txtOuro'] == '31' for r in linhas if not r['local'] and r['vivo']))


if __name__ == '__main__':
    unittest.main()
