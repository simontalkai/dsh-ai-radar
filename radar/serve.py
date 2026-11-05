"""本机小服务器：给 DSH 插件和浏览器页面供数据，顺带按时跑抓取（不用自己配 cron/launchd）。
  GET  /api/cards?days=3     知识库卡片 + 打分 + 议题
  POST /api/cards/pick       现在挑一次（打分 + 归议题，后台跑）
  GET  /api/hot              热点快照
  POST /api/hot/run          现在抓一次（后台跑）
  GET  /api/meta             配置里页面要用的几项
  GET  /                      浏览器版页面（不装 DSH 也能看）
只听 127.0.0.1。带 CORS，DSH 页面（另一个端口）能直接读。"""
import os, sys, json, time, threading, subprocess, mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from .common import config, data, ROOT, log
from . import kb, hot, cards

STATIC = {'/': 'web/index.html', '/client.js': 'plugin/lib/client.js'}


def bg(args, logname):
    return subprocess.Popen([sys.executable, '-m', 'radar'] + args, cwd=ROOT, start_new_session=True,
                            stdout=open(data(logname), 'a'), stderr=subprocess.STDOUT)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        b = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'content-type')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self): self._send(204, b'')

    def do_GET(self):
        u = urlparse(self.path); p = u.path; q = parse_qs(u.query)
        try:
            if p == '/api/cards':
                days = max(1, min(90, int((q.get('days') or ['3'])[0])))
                return self._send(200, kb.view(days))
            if p == '/api/hot': return self._send(200, hot.view())
            if p == '/api/meta':
                c = config()
                return self._send(200, {'ok': True, 'workspace': c.get('dsh_workspace') or '', 'provider': c['llm']['provider'], 'model': c['llm']['model'],
                                        'cards_dir': c['cards_dir'], 'schedule': c['schedule']})
            if p in STATIC:
                f = os.path.join(ROOT, STATIC[p])
                with open(f, 'rb') as fh: body = fh.read()
                return self._send(200, body, (mimetypes.guess_type(f)[0] or 'text/plain') + '; charset=utf-8')
            self._send(404, {'ok': False, 'error': 'not found'})
        except Exception as e:
            self._send(500, {'ok': False, 'error': str(e)[:300]})

    def do_POST(self):
        p = urlparse(self.path).path
        if p == '/api/hot/run': return self._send(200, {'ok': True, 'started': hot.kick(True)})
        if p == '/api/cards/pick':
            if kb.running(): return self._send(200, {'ok': True, 'started': False})
            bg(['pick'], 'pick.log'); time.sleep(0.8)   # 等子进程占上 .running，页面马上就能读到「在挑」
            return self._send(200, {'ok': True, 'started': True})
        self._send(404, {'ok': False, 'error': 'not found'})


# ---------- 自带定时 ----------
def _hm(s):
    h, m = (s or '0:0').split(':'); return int(h), int(m)


def scheduler():
    """每分钟看一眼：热点按 hot_every_min 抓（quiet_hours 里不抓）；卡片、挑题每天各一次。跑过的记在 data/schedule.json。"""
    st_p = data('schedule.json')
    while True:
        try:
            c = config()['schedule']
            st = json.load(open(st_p)) if os.path.exists(st_p) else {}
            now, lt = time.time(), time.localtime()
            today = time.strftime('%Y-%m-%d')
            q0, q1 = (c.get('quiet_hours') or [0, 0])[:2]
            quiet = q0 <= lt.tm_hour < q1 if q0 < q1 else (lt.tm_hour >= q0 or lt.tm_hour < q1) if q0 > q1 else False
            if not quiet and now - st.get('hot', 0) >= c['hot_every_min'] * 60 and not hot.running():
                hot.kick(False); st['hot'] = now
            for key, at, args, logname in (('cards', c.get('cards_at'), ['cards', 'run'], 'cards.log'), ('pick', c.get('pick_at'), ['pick'], 'pick.log')):
                if at and st.get(key) != today and (lt.tm_hour, lt.tm_min) >= _hm(at):
                    if key == 'pick' and (cards.running() or kb.running()): continue   # 卡片还没做完就等它
                    bg(args, logname); st[key] = today
            json.dump(st, open(st_p, 'w'))
        except Exception as e:
            log('定时出错：', e)
        time.sleep(60)


def main(argv):
    c = config()
    nums = [a for a in argv if a.isdigit()]
    port = int(nums[0]) if nums else c['port']
    if c['schedule'].get('enabled') and '--no-schedule' not in argv:
        threading.Thread(target=scheduler, daemon=True).start()
    srv = ThreadingHTTPServer(('127.0.0.1', port), H)
    print(f'AI 雷达在 http://127.0.0.1:{port} （浏览器直接打开就能看；DSH 插件读这个地址）', flush=True)
    print(f'模型：{c["llm"]["provider"]} / {c["llm"]["model"]}；定时：' + ('开' if c['schedule'].get('enabled') and '--no-schedule' not in argv else '关'), flush=True)
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
