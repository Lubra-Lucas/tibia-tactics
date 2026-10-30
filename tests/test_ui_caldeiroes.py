"""Caldeirões de juros ao lado do tabuleiro (estilo TFT): python3 -m unittest discover -s tests -v.
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

# estado dos dois grupos de caldeirões (embaixo = tabuleiro em vista, em cima = adversário) e a borda do tabuleiro em px de tela
CALD = """(() => {const w=document.getElementById('cvw').getBoundingClientRect(),rt=rectTab(),
  tab={l:w.left+rt.x,t:w.top+rt.y,r:w.left+rt.x+rt.w,b:w.top+rt.y+rt.h};
  const g=k=>{const e=document.querySelector('.cald.'+k);if(!e)return null;const b=e.getBoundingClientRect();
    return {vis:!e.hidden&&getComputedStyle(e).display!=='none',id:e.dataset.id===undefined?null:+e.dataset.id,on:e.querySelectorAll('.cal.on').length,
      tot:e.querySelectorAll('.cal').length,txt:(e.querySelector('.cg b')||{}).textContent,l:b.left,r:b.right,t:b.top,b:b.bottom};};
  return {eu:g('eu'),op:g('op'),tab};})()"""

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class CaldeiroesTests(unittest.TestCase):
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

    def abrir(self, w=1536, h=730):
        self.context = self.browser.new_context(viewport={'width': w, 'height': h})
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.goto(self.url, wait_until='domcontentloaded')
        self.page.locator('#b-jogar').click(timeout=30000)
        self.page.evaluate('UI.timer=999')
        self.page.wait_for_timeout(300)

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def cald(self):
        self.page.wait_for_timeout(120)
        return self.page.evaluate(CALD)

    def test_count_follows_own_interest_and_sits_beside_board(self):
        self.abrir()
        for ouro in [0, 9, 10, 23, 47, 50, 88]:
            self.page.evaluate(f'UI.jog.ouro={ouro}')
            c = self.cald()
            juros = self.page.evaluate('jurosDe(UI.jog)')
            self.assertTrue(c['eu']['vis'])
            self.assertEqual(c['eu']['on'], juros, ouro)
            self.assertEqual(c['eu']['tot'], 5)
            self.assertEqual(c['eu']['txt'], str(ouro))
        # coluna encostada na borda direita do tabuleiro, terminando na borda de baixo
        t = c['tab']
        self.assertGreaterEqual(c['eu']['l'], t['r'])
        self.assertLess(c['eu']['l'] - t['r'], 20)
        self.assertLessEqual(abs(c['eu']['b'] - t['b']), 2)
        self.assertGreaterEqual(c['eu']['t'], t['t'] + (t['b'] - t['t']) / 3, 'os seus ficam do seu lado (metade de baixo)')
        self.assertFalse(c['op']['vis'], 'rodada de monstros: sem adversário em cima')
        # Juros Compostos sobe o teto para 7
        self.page.evaluate('UI.jog.bn=(UI.jog.bn||[]).concat([7]);UI.jog.ouro=75')
        c = self.cald()
        self.assertEqual((c['eu']['on'], c['eu']['tot']), (7, 7))

    def test_opponent_on_top_and_spied_board(self):
        self.abrir()
        bot = self.page.evaluate("(()=>{const q=G.jog.find(q=>!q.local);q.ouro=23;G.opoDe[UI.jog.id]=q.id;return q.id})()")
        c = self.cald()
        self.assertTrue(c['op']['vis'])
        self.assertEqual((c['op']['id'], c['op']['on']), (bot, 2))
        self.assertLessEqual(c['op']['r'], c['tab']['l'])
        self.assertLessEqual(abs(c['op']['t'] - c['tab']['t']), 2)
        # espiando outro jogador: os caldeirões de baixo passam a ser os dele, sem adversário em cima
        outro = self.page.evaluate("(()=>{const q=G.jog.find(q=>!q.local&&q.id!==%d);q.ouro=37;espiarJog(q.id);return q.id})()" % bot)
        c = self.cald()
        self.assertEqual((c['eu']['id'], c['eu']['on'], c['eu']['txt']), (outro, 3, '37'))
        self.assertFalse(c['op']['vis'])
        # ouro desconhecido (convidado online com anfitrião antigo): escondido
        self.page.evaluate(f'G.jog[{outro}].semOuro=true')
        self.assertFalse(self.cald()['eu']['vis'])
        self.page.evaluate('sairEspiar()')
        c = self.cald()
        self.assertEqual(c['eu']['id'], self.page.evaluate('UI.jog.id'))

    def test_both_sides_during_combat(self):
        self.abrir()
        self.page.evaluate("(()=>{const q=G.jog.find(q=>!q.local);q.ouro=31;G.opoDe[UI.jog.id]=q.id;UI.jog.ouro=12;UI.timer=0})()")
        self.page.wait_for_function("document.getElementById('app').classList.contains('em-combate')", timeout=20000)
        self.page.wait_for_timeout(400)
        c = self.cald()
        self.assertEqual(c['eu']['on'], self.page.evaluate('jurosDe(UI.jog)'))
        self.assertGreaterEqual(c['eu']['l'], c['tab']['r'])

    def test_hidden_on_mobile_and_menu(self):
        self.abrir(844, 390)
        self.assertFalse(self.cald()['eu']['vis'])
        self.context.close()
        self.abrir()
        self.page.evaluate('voltarMenu()')
        self.page.wait_for_timeout(300)
        self.assertFalse(self.cald()['eu']['vis'])


if __name__ == '__main__':
    unittest.main()
