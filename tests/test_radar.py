"""不联网、不调模型的测试：python3 -m unittest discover -s tests -v
数据目录用临时目录，卡片读 tests/fixtures/卡片/。"""
import os, sys, json, time, shutil, tempfile, threading, unittest, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix='airadar-test-')
CFG = os.path.join(TMP, 'config.json')
json.dump({'data_dir': os.path.join(TMP, 'data'), 'cards_dir': os.path.join(HERE, 'fixtures'), 'schedule': {'enabled': False},
           'llm': {'provider': 'deepseek', 'api_key': '', 'api_key_env': 'AIRADAR_TEST_NO_KEY'}}, open(CFG, 'w'))
os.environ['RADAR_CONFIG'] = CFG

from radar import common, cards, kb, hot, llm   # noqa: E402


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


class Common(unittest.TestCase):
    def test_config_override(self):
        c = common.config()
        self.assertEqual(c['cards_dir'], os.path.join(HERE, 'fixtures'))
        self.assertEqual(c['llm']['model'], 'deepseek-v4-flash')   # 没写的项用默认值
        self.assertTrue(common.data('hot', 'x.json').startswith(os.path.join(TMP, 'data', 'hot')))

    def test_last_json(self):
        self.assertEqual(common.last_json('先说两句\n```json\n[{"a": 1}]\n```'), [{'a': 1}])
        self.assertEqual(common.last_json('```json\n[1]\n```\n改一下\n```json\n[2]\n```'), [2])
        self.assertEqual(common.last_json('[{"a": 2}]'), [{'a': 2}])
        self.assertEqual(common.last_json('好的：[{"a": 3}] 就这些'), [{'a': 3}])
        with self.assertRaises(ValueError): common.last_json('没有 JSON')

    def test_dsh_provider(self):
        c = {'dsh': {'cmd': f'{sys.executable} {os.path.join(HERE, "fake_dsh.py")}', 'effort': 'medium'}}
        got = json.loads(llm._dsh('原文在这', '你是编辑', 'deepseek-flash', c, 30))
        self.assertEqual(got['args'][0], 'headless'); self.assertIn('--json', got['args'])
        self.assertIn('provider: deepseek-account', got['patch'])   # 用 DSH 网页上登录的账号，不要 API key
        self.assertIn('model: deepseek-flash', got['patch']); self.assertIn('reasoningEffort: medium', got['patch'])
        for tool in ('tool-bash', 'tool-fs', 'tool-web', 'agent-instructions', 'skill-filesystem'):
            self.assertIn(f'- id: {tool}\n  disabled: true', got['patch'])   # 工具全关，只回答不动手
        self.assertTrue(got['q'].startswith('你是编辑') and got['q'].endswith('原文在这'))
        with self.assertRaises(llm.LLMError) as e: llm._dsh('要报错', None, 'm', c, 30)
        self.assertIn('not logged in', str(e.exception))
        from unittest import mock
        with mock.patch('shutil.which', return_value=None), self.assertRaises(llm.LLMError) as e:
            llm._dsh('x', None, 'm', {'dsh': {'cmd': ''}}, 30)
        self.assertIn('找不到 dsh', str(e.exception))

    def test_no_key_message(self):
        with self.assertRaises(llm.LLMError) as e: llm.ask('hi', tries=1)
        self.assertIn('没有 API key', str(e.exception))


class Cards(unittest.TestCase):
    SRC = 'He said: I now spend most of my day reading code rather than writing it. That is new.'

    def test_quote_ok(self):
        self.assertTrue(cards.quote_ok('I now spend most of my day reading code rather than writing it.', cards.norm(self.SRC)))
        self.assertTrue(cards.quote_ok('I now spend most of my day reading code rather than writing it [12:30]', cards.norm(self.SRC)))
        self.assertFalse(cards.quote_ok('Models will replace every programmer by next year for sure.', cards.norm(self.SRC)))

    def test_verify_marks_bad_quote(self):
        card = '1. **观点**\n   > I now spend most of my day reading code rather than writing it.\n   > 译文\n2. **编的**\n   > This sentence was never said by anyone at all.\n   > 译文'
        out, ok, bad = cards.verify(card, self.SRC)
        self.assertEqual((ok, bad), (1, 1))
        self.assertIn('⚠️未核到原文：This sentence', out)
        self.assertNotIn('⚠️未核到原文：I now', out)

    def test_vtt_text(self):
        p = os.path.join(TMP, 'a.vtt')
        open(p, 'w').write('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nhello there\n\n00:00:02.000 --> 00:00:04.000\nhello there\nnext line\n\n00:01:05.000 --> 00:01:07.000\nlater\n')
        t = cards.vtt_text(p)
        self.assertEqual(t.count('hello there'), 1)   # 自动字幕的滚动重复去掉
        self.assertIn('[00:01] hello there', t); self.assertIn('[01:05] later', t)

    def test_canon_url(self):
        self.assertEqual(cards.canon('https://www.latent.space/p/x/?utm=1'), cards.canon('https://latent.space/p/x'))

    def test_sources_shape(self):
        s = common.sources()
        self.assertGreaterEqual(len(s['people']), 10)
        for name in s['x']['people']: self.assertIn(name, s['people'])
        for b in s['blogs']: self.assertIn(b['person'], s['people'], b)
        self.assertTrue(s['hot']['x']['官方'] and s['hot']['news_queries'] and s['hot']['entities'])


class Kb(unittest.TestCase):
    def test_parse_and_speaker(self):
        d = kb.ls(9999)
        self.assertEqual(len(d['cards']), 1)
        c = d['cards'][0]
        self.assertEqual(c['title'], '写代码的瓶颈已经从写变成了审')
        self.assertEqual(c['topics'], ['AI 编程', 'AI 与工作'])
        whos = [p['who'] for p in c['points']]
        self.assertEqual(whos[:2], ['Andrej Karpathy', 'Ethan Mollick'])   # 「Karpathy 的推」按名单补成全名
        self.assertEqual(whos[2], '')   # 合集卡「其他」里谁都没点名，不硬认
        self.assertTrue(c['points'][0]['quote'].startswith('I now spend'))
        self.assertTrue(c['points'][0]['key'])

    def test_view_without_scores(self):
        v = kb.view(9999)
        self.assertEqual(v['scores'], {})
        self.assertFalse(v['picking'])


def _x(i, v, age, author='OpenAI', kind='官方'):
    return {'key': f'x:{i}', 'author': author, 'kind': kind, 'velocity': v, 'age_h': age, 'ts': int(time.time() - age * 3600), 'text': 't', 'first_seen': 0, 'ents': ['OpenAI']}


class Hot(unittest.TestCase):
    def test_heat(self):
        one = [_x(1, 100, 1)]
        both = one + [{'key': 'so:a', 'title': 'x', 'site': '新浪', 'age_h': 1, 'first_seen': 0, 'ents': []}]
        self.assertGreater(hot.heat(both), hot.heat(one) + 3)   # 多一处来源加 3
        self.assertLessEqual(hot.heat_parts([_x(1, 10 ** 9, 1)])['x'], 10)

    def test_build_event_lag_and_gap(self):
        now = int(time.time())
        src = _x(1, 400, 5)
        zh = {'key': 'so:b', 'title': 'y', 'site': '量子位', 'age_h': 2, 'first_seen': now, 'ents': []}
        e = hot.build_event({'id': 'e1', 'title': 'T', 'what': 'W', 'kind': '发布', 'score': 5}, [src, zh], [], {}, now)
        self.assertEqual(e['lag_h'], 3.0)
        self.assertFalse(e['gap'])
        e2 = hot.build_event({'id': 'e2', 'title': 'T', 'what': 'W', 'kind': '发布'}, [src], [], {}, now)
        self.assertTrue(e2['gap'])   # 源头热了、中文还没人报 = 窗口期
        self.assertGreater(e['rank'], e2['rank'] * 0)

    def test_need_regroup(self):
        now = int(time.time())
        X = [_x(1, 10, 1)]
        prev = {'heat_v': hot.HEAT_V, 'events': [{'id': 'a'}], 'ev_info': {'ts': now - 600, 'keys': ['x:1']}}
        self.assertFalse(hot.need_regroup(X, [], [], [], prev, now)[0])
        self.assertTrue(hot.need_regroup(X + [_x(2, 999, 1)], [], [], [], prev, now)[0])   # 冒出快推就重归
        self.assertTrue(hot.need_regroup(X, [], [], [], dict(prev, ev_info={'ts': now - 3 * 3600, 'keys': ['x:1']}), now)[0])

    def test_so_age(self):
        self.assertAlmostEqual(hot.so_age_h('30分钟前'), 0.5)
        self.assertEqual(hot.so_age_h('3小时前'), 3)
        self.assertEqual(hot.so_age_h('昨天 12:00'), 24.0)
        self.assertIsNone(hot.so_age_h('不知道'))

    def test_ents(self):
        self.assertIn('Anthropic', hot.ents('Claude 发布新版'))
        self.assertNotIn('Meta', hot.ents('metadata 更新'))   # 英文按词边界认
        self.assertEqual(hot.ents('a new coding agent', 'trq212')[0], 'Anthropic')   # 一手开发者按账号补公司


class Serve(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from http.server import ThreadingHTTPServer
        from radar import serve
        cls.srv = ThreadingHTTPServer(('127.0.0.1', 0), serve.H)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.srv.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def get(self, p):
        with urllib.request.urlopen(self.base + p, timeout=10) as r: return r.status, dict(r.headers), r.read()

    def test_api(self):
        st, h, b = self.get('/api/cards?days=9999')
        self.assertEqual(st, 200); self.assertEqual(h.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(len(json.loads(b)['cards']), 1)
        self.assertIsNone(json.loads(self.get('/api/hot')[2])['data'])   # 还没抓过
        self.assertEqual(json.loads(self.get('/api/meta')[2])['model'], 'deepseek-v4-flash')

    def test_static(self):
        st, h, b = self.get('/')
        self.assertIn('text/html', h['Content-Type']); self.assertIn(b'client.js', b)
        st, h, b = self.get('/client.js')
        self.assertIn(b'__ModuleLoader__', b)

    def test_preflight(self):
        req = urllib.request.Request(self.base + '/api/hot/run', method='OPTIONS')
        with urllib.request.urlopen(req, timeout=10) as r:
            self.assertEqual(r.status, 204); self.assertEqual(r.headers['Access-Control-Allow-Headers'], 'content-type')


class Plugin(unittest.TestCase):
    def test_module_id_matches_package(self):
        # DSH 按包名找模块：两边不一致会报 duplicate factory registration（实测踩过）
        root = os.path.dirname(HERE)
        with open(os.path.join(root, 'plugin', 'package.json'), encoding='utf-8') as f: name = json.load(f)['name']
        with open(os.path.join(root, 'plugin', 'lib', 'client.js'), encoding='utf-8') as f: self.assertIn(f'id: "{name}"', f.read())


if __name__ == '__main__':
    unittest.main()
