"""配置、路径、日志、HTTP 这些各模块共用的小东西。只用 Python 标准库，3.9 起都能跑。"""
import os, re, json, time, urllib.request, urllib.error, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

DEFAULT = {
    'port': 8790,
    'data_dir': 'data',
    'cards_dir': 'data/cards',
    'me': '一个做 AI 内容的创作者，给普通人讲 AI 圈发生了什么',
    'forms': ['短视频讲解', '口播', '图文帖子', '不做'],
    'llm': {'provider': 'dsh', 'base_url': 'https://api.deepseek.com', 'model': 'deepseek-v4-flash',
            'api_key': '', 'api_key_env': 'DEEPSEEK_API_KEY', 'timeout': 900, 'max_tokens': 8192, 'models': {},
            'dsh': {'cmd': '', 'model': 'deepseek-flash', 'effort': 'high', 'node_dir': ''}},
    'schedule': {'enabled': True, 'hot_every_min': 60, 'quiet_hours': [1, 8], 'cards_at': '07:40', 'pick_at': '09:30'},
    'cards': {'days': 3, 'limit': 25, 'workers': 3, 'max_chars': 200000},
    'youtube_cookies': '',
    'whisper': {'bin': 'whisper-cli', 'model': ''},
    'dsh_workspace': '',
}


def _merge(a, b):
    out = dict(a)
    for k, v in (b or {}).items():
        out[k] = _merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return out


def _strip_notes(x):
    """配置文件里 _ 开头的键是说明，读的时候丢掉。"""
    if isinstance(x, dict): return {k: _strip_notes(v) for k, v in x.items() if not k.startswith('_')}
    return x


_cfg = {}


def config():
    p = os.environ.get('RADAR_CONFIG') or os.path.join(ROOT, 'config.json')   # 想用另一份配置（比如测试）就设 RADAR_CONFIG
    mt = os.path.getmtime(p) if os.path.exists(p) else 0
    if _cfg.get('mt') != mt:
        user = _strip_notes(json.load(open(p, encoding='utf-8'))) if mt else {}
        _cfg.clear(); _cfg.update(mt=mt, c=_merge(DEFAULT, user))
    return _cfg['c']


def path(key):
    """config 里的相对路径都按仓库根目录算，~ 会展开。"""
    p = os.path.expanduser(config()[key])
    p = p if os.path.isabs(p) else os.path.join(ROOT, p)
    os.makedirs(p, exist_ok=True)
    return p


def data(*parts):
    """data_dir 下的路径；最后一段是文件名，前面的目录不存在就建。"""
    base = path('data_dir')
    if not parts: return base
    d = os.path.join(base, *parts[:-1])
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, parts[-1])


def sources():
    return _strip_notes(json.load(open(os.path.join(ROOT, 'sources.json'), encoding='utf-8')))


def log(*a, file='run.log'):
    s = time.strftime('%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a)
    print(s, flush=True)
    try:
        with open(data(file), 'a', encoding='utf-8') as f: f.write(s + '\n')
    except OSError: pass


def fetch(url, referer=None, timeout=20, headers=None):
    h = {'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'}
    if referer: h['Referer'] = referer
    h.update(headers or {})
    for _ in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:   # Python 3.11 以前的 urllib 不跟 308 跳转（claude.com/blog 就是 308）
            if e.code != 308 or not e.headers.get('Location'): raise
            url = urllib.parse.urljoin(url, e.headers['Location'])
    raise OSError('跳转太多次：' + url)


def get_json(url, referer=None, timeout=20):
    return json.loads(fetch(url, referer, timeout))


def load(p, default):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return default


def save(p, x, indent=None):
    tmp = p + '.tmp'
    json.dump(x, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=indent)
    os.replace(tmp, p)


def last_json(text):
    """模型回的文本里取最后一个 ```json 代码块；没有代码块就整段当 JSON，再不行找第一个 [ 到最后一个 ]。"""
    blocks = re.findall(r'```(?:json)?\s*(.*?)```', text or '', re.S)
    for b in reversed(blocks):
        try: return json.loads(b)
        except Exception: pass
    try: return json.loads(text)
    except Exception: pass
    i, j = (text or '').find('['), (text or '').rfind(']')
    if 0 <= i < j: return json.loads(text[i:j + 1])
    raise ValueError('模型回的不是 JSON：' + (text or '')[:200])


def norm(t):
    return re.sub(r'[\W_]+', '', (t or '').lower())[:18]
