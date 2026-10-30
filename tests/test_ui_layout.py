"""Layout estilo TFT: cena única — a arena ocupa a tela e sinergias, itens, jogadores e caldeirões flutuam colados ao tabuleiro.
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

# retângulos (px de tela) do canvas, do núcleo do tabuleiro (tabuleiro + margens dos avatares) e dos painéis
MEDIDAS = """() => {
  const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return {l:b.left, t:b.top, r:b.right, b:b.bottom, w:b.width, h:b.height}; };
  const cv = r('cv'), k = cv.w / CW;
  return {cv, box: r('cvbox'), esq: r('esq'), dir: r('dir'), faixa: r('faixa-rodada'), itens: r('itens'), topo: r('topo'), base: r('base'), CW, CW0, BX, BEN_X, ZD,
    W: innerWidth, fundoEsq: getComputedStyle(document.getElementById('esq')).backgroundImage, livre: document.getElementById('app').classList.contains('meter-livre'),
    nucleo: {l: cv.l + (CW - CW0) / 2 * k, r: cv.l + (CW + CW0) / 2 * k, t: cv.t, b: cv.b},
    pos: getComputedStyle(document.getElementById('esq')).position, cheia: document.getElementById('app').classList.contains('faixa-cheia')};
}"""

class LayoutTests(unittest.TestCase):
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
        self.page.evaluate('UI.timer=999')
        self.page.wait_for_timeout(400)
        return self.page.evaluate(MEDIDAS)

    def fechar(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def tearDown(self):
        self.fechar()

    def checar_desktop(self, m):
        self.assertEqual(m['pos'], 'absolute', 'sinergias/jogadores flutuam sobre a arena')
        # a arena preenche a caixa inteira: sem faixas pretas nas laterais
        self.assertGreaterEqual(m['cv']['w'], m['box']['w'] - 2 * m['ZD'] - 4)
        self.assertGreater(m['CW'], m['CW0'])
        self.assertEqual(m['BX'], (m['CW'] - 256) / 2)
        self.assertEqual(m['BX'] % 1, 0)
        self.assertEqual(m['BEN_X'] % 1, 0)
        # o núcleo (tabuleiro + avatares) nunca fica embaixo dos painéis flutuantes; sinergias e itens colados à esquerda, jogadores à direita
        n = m['nucleo']
        self.assertLessEqual(m['esq']['r'], n['l'] + 1)
        self.assertLessEqual(m['itens']['r'], n['l'] + 1)
        self.assertGreaterEqual(m['dir']['l'], n['r'] - 1)
        self.assertLess(n['l'] - m['esq']['r'], 40, 'sinergias ao lado do tabuleiro')
        self.assertLess(m['dir']['l'] - n['r'], 40, 'jogadores ao lado do tabuleiro')
        self.assertGreaterEqual(m['esq']['l'], 0)
        self.assertLessEqual(m['dir']['r'], m['W'])
        # próxima onda: cartão no topo da coluna de jogadores
        self.assertGreaterEqual(m['faixa']['l'], m['dir']['l'] - 1)
        self.assertLessEqual(m['faixa']['r'], m['dir']['r'] + 1)
        # cena única: topo fino, sem caixas pesadas atrás das colunas
        self.assertLessEqual(m['topo']['h'], 50)
        self.assertEqual(m['fundoEsq'], 'none')
        self.assertLessEqual(m['itens']['b'], m['base']['t'] if m['base']['h'] else m['box']['b'])

    def test_board_fills_desktop_screens(self):
        for w, h, minimo in [(1536, 730, 440), (1920, 1080, 760), (1366, 768, 470)]:
            with self.subTest(tela=f'{w}x{h}'):
                m = self.abrir(w, h)
                self.checar_desktop(m)
                self.assertGreaterEqual(m['cv']['h'], minimo, 'tabuleiro precisa crescer')
                self.fechar()
        self.abrir(1024, 768)  # tela 4:3 cai no modo de faixa cheia sem quebrar

    def test_combat_grows_board_and_meter_sits_beside_it(self):
        m0 = self.abrir(1536, 730)
        self.page.evaluate('UI.timer=0')
        self.page.wait_for_function("document.getElementById('app').classList.contains('em-combate')")
        self.page.wait_for_timeout(500)
        m = self.page.evaluate(MEDIDAS)
        self.checar_desktop(m)
        self.assertGreater(m['cv']['h'], m0['cv']['h'] + 80)
        self.page.keyboard.press('p')
        meter = self.page.evaluate("(() => {const e=document.getElementById('meter'),b=e.getBoundingClientRect();return {on:e.classList.contains('on'),fora:e.classList.contains('fora'),l:b.left,r:b.right}})()")
        self.assertTrue(meter['on'])
        if meter['fora'] and m['livre']:
            self.assertGreaterEqual(meter['l'], m['dir']['r'])   # placar ao lado da coluna de jogadores
            self.assertLessEqual(meter['r'], m['W'])

    def test_drag_from_bench_to_board_with_wide_world(self):
        self.abrir(1536, 730)
        self.page.evaluate("UI.jog.loja=['minotaur_guard',null,null,null,null]; hudLoja()")
        self.page.locator('#cartas .cslot[data-i="0"] .art').click()
        box = self.page.locator('#cv').bounding_box()
        p = self.page.evaluate('({bank:{x:(BEN_X+16)*ZD,y:(BEN_Y+16)*ZD},board:{x:(BX+16)*ZD,y:(BY+4*TS+16)*ZD}})')
        self.page.mouse.move(box['x'] + p['bank']['x'], box['y'] + p['bank']['y'])
        self.page.mouse.down()
        self.page.mouse.move(box['x'] + p['board']['x'], box['y'] + p['board']['y'], steps=8)
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('UI.jog.tab[0][0]?.id'), 'minotaur_guard')

    def test_mobile_keeps_square_world(self):
        for w, h in [(844, 390), (390, 844), (800, 1000)]:
            with self.subTest(tela=f'{w}x{h}'):
                m = self.abrir(w, h, is_mobile=w < 900, has_touch=w < 900)
                self.assertEqual(m['CW'], 352)
                self.assertEqual(m['BX'], 48)
                self.assertNotEqual(m['pos'], 'absolute')
                self.fechar()
        self.abrir(1536, 730)

if __name__ == '__main__':
    unittest.main()
