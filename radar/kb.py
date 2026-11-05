"""AI 大佬知识库的读取和挑题。
- ls(days)：把卡片目录里的 md 解析成 JSON（一张卡几条观点，每条认出是谁说的），给页面 /api/cards 用。只读，不改卡片。
- score：没打过分的观点一批 50 条交给模型，打「值不值得做成内容」1–5 分 + 一句为什么 + 一句切入角度，存 data/kb/scores.json，打过不重打。
- group：最近 14 天 3 分以上的观点，让模型归成「几个人在说同一件事」的议题，存 data/kb/topics.json。
  python3 -m radar pick [score|group]     默认两步都跑（定时每天跑一次，页面上也能点）
打分标准在 config.json 的 kb_criteria 里可以改成你自己的。"""
import os, re, sys, glob, time, json, hashlib
from .common import config, path, data, sources, load, save, last_json, log as _log, ROOT
from . import llm

_cache, _names = {}, {}


def log(*a): _log(*a, file='pick.log')
def CARDS(): return os.path.join(path('cards_dir'), '卡片')


def point_key(p, idx):
    return hashlib.sha1(f'{os.path.realpath(p)}#{idx}'.encode()).hexdigest()[:10]


def _front(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not m: return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(':')
        if not sep: continue
        v = v.strip()
        if v.startswith('[') and v.endswith(']'): v = [s.strip() for s in v[1:-1].split(',') if s.strip()]
        elif len(v) >= 2 and v[0] == v[-1] == '"': v = v[1:-1]
        meta[k.strip()] = v
    return meta, text[m.end():]


# ---------- 认人：X 合集卡一张卡混着好几个人，按每条观点开头认是谁说的 ----------
VERB = r"(?:的推|的帖|的文章|的博客|在播客里|认为|觉得|说|宣布|转发|介绍|拿|根据|提醒|指出|表示|发现|算出|预测|承认|建议|担心|强调|批评|回应|透露|直言|吐槽|同意|实测|推荐)"
SPEAKER = re.compile(r"^(?:嘉宾|主持人|作者)?\s*(@?[A-Za-z][\w.'’-]*(?: [A-Z][\w.'’-]*){0,3})\s*(?:官方)?\s*(?:" + VERB[3:-1] + r"|：)")
HOST = re.compile(r"^(?:嘉宾|主持人)\s*([A-Z][\w.'’-]*(?: [A-Z][\w.'’-]*){0,3})")
ORG_AFTER = r"\s*(?:官方|：|:|（|\(|" + VERB[3:-1] + r"|发布|公开|举了|列了|把|在)"
TITLE = re.compile(r"^(?:CEO|CTO|CFO|COO|创始人|联合创始人)\s+|\s+(?:CEO|CTO|CFO|COO)$")
NAMES = os.path.join(ROOT, 'kb-names.json')


def names():
    """名单（sources.json 的 people + 人物页）和别名（kb-names.json，改了自动重读）。"""
    mt = (os.path.getmtime(NAMES) if os.path.exists(NAMES) else 0, os.path.getmtime(os.path.join(ROOT, 'sources.json')))
    if _names.get('mt') == mt: return _names
    S = sources()
    roster = set(os.path.basename(f)[:-3] for f in glob.glob(os.path.join(path('cards_dir'), '人物', '*.md')))
    roster |= set(S.get('people') or [])
    orgs = set(S.get('orgs') or [])
    extra = load(NAMES, {})
    alias = {}
    for part in (0, -1):   # 名单里的人，名或姓只此一家就认（Mollick → Ethan Mollick）
        cnt = {}
        for n in roster:
            if ' ' in n and n not in orgs: cnt.setdefault(n.split()[part], []).append(n)
        for tok, ns in cnt.items():
            if len(ns) == 1 and len(tok) >= 4: alias.setdefault(tok, ns[0])
    alias.update({k: v for k, v in (extra.get('alias') or {}).items() if not k.startswith('_')})
    known = sorted(roster | set(alias) | orgs, key=len, reverse=True)
    _names.clear()
    _names.update(mt=mt, roster=roster, orgs=orgs, alias=alias, nope=set(extra.get('not_people') or []),
                  known=re.compile(r"(?<![A-Za-z@])(" + '|'.join(re.escape(n) for n in known) + r")(?![A-Za-z])") if known else None)
    return _names


def canon(name, text=''):
    N = names(); name = TITLE.sub('', (name or '').strip())
    if not name or name in N['nope']: return ''
    name = N['alias'].get(name, name)
    if name in N['roster'] or name in N['orgs'] or ' ' in name: return name
    tok = re.escape(name.lstrip('@'))   # 只有一个词：先在本卡正文找全名
    full = re.findall(r"(?<![A-Za-z])(" + tok + r" [A-Z][A-Za-z'’-]+|[A-Z][A-Za-z'’-]+ " + tok + r")(?![A-Za-z])", text)
    full = [f for f in full if not any(w in ('The', 'And', 'Why', 'How', 'What', 'Code', 'AI', 'API', 'CEO', 'CTO', 'VP') for w in f.split())]
    if full:
        best = max(set(full), key=full.count)
        return N['alias'].get(best, best)
    return name


def find_in(claim):
    """合集卡用：整句里最早出现的人；公司号要跟着「官方 / ： / 动词」才算，免得 Claude Code 认成 Claude。"""
    N = names(); best, pos, lead = None, len(claim), None
    if not N['known']: return ''
    for m in N['known'].finditer(claim):
        n = N['alias'].get(m.group(1), m.group(1))
        if n in N['nope']: continue
        if n in N['orgs']:
            after = claim[m.end():]
            if not (re.match(ORG_AFTER, after) or re.match(r"[^（(]*$", after) and re.search(r"[（(][^）)]*$", claim[:m.start()])):
                if m.start() == 0 and not after.startswith(' Code'): lead = n
                continue
        best, pos = n, m.start(); break
    m = re.search(r"(?<![A-Za-z])([A-Z][a-z]+ [A-Z][a-z]+)\s*[：:]|的 ([A-Z][a-z]+ [A-Z][a-z]+)\s*[：:]", claim)
    if m and m.start() < pos: best = m.group(1) or m.group(2)
    return best or lead or ''


def speaker(claim, person, text='', more=''):
    coll = person.startswith('X ')
    m = SPEAKER.match(claim) or HOST.match(claim)
    if m:
        raw = m.group(1); n = canon(raw, text)
        colon = claim[m.end() - 1] in '：:'
        if n and not (colon and ' ' not in n and n not in names()['roster'] and n == raw): return n
    if coll:
        n = find_in(claim) or find_in(more)
        if n: return canon(n, text)
        org = person.replace('X · ', '')   # 合集卡里谁都没点名的，多半是这家的官方号发的
        return org if org not in ('其他', person) else ''
    return canon(person) or person


def _points(body):
    sec = re.search(r'^## 核心观点\n(.*?)(?=^## |\Z)', body, re.S | re.M)
    if not sec: return []
    out = []
    for item in re.split(r'^\d+\. ', sec.group(1), flags=re.M)[1:]:
        lines = item.strip().splitlines()
        head = lines[0] if lines else ''
        m = re.match(r'\*\*(.+?)\*\*\s*(.*)', head)
        quotes = [l.strip()[1:].strip() for l in lines[1:] if l.strip().startswith('>')]
        out.append({'claim': (m.group(1) if m else head).strip(), 'detail': (m.group(2) if m else '').strip(),
                    'quote': quotes[0] if quotes else '', 'quote_zh': quotes[1] if len(quotes) > 1 else ''})
    return out


def parse(p):
    st = os.stat(p)
    hit = _cache.get(p)
    if hit and hit[0] == (st.st_mtime, names()['mt']): return hit[1]
    text = open(p, encoding='utf-8').read()
    meta, body = _front(text)
    h1 = re.search(r'^# (.+)$', body, re.M)
    one = re.search(r'^\*\*一句话\*\*[：:]\s*(.+)$', body, re.M)
    d = {'id': os.path.basename(p)[:-3], 'path': p, 'person': meta.get('person', ''), 'kind': meta.get('kind', ''),
         'source': meta.get('source', ''), 'source_title': meta.get('title', ''), 'url': meta.get('url', ''),
         'date': str(meta.get('date', '')), 'mtime': int(getattr(st, 'st_birthtime', st.st_mtime)), 'topics': meta.get('topics') or [],
         'title': h1.group(1).strip() if h1 else os.path.basename(p)[11:-3], 'one': one.group(1).strip() if one else '', 'points': _points(body)}
    for i, pt in enumerate(d['points']):
        pt.update(who=speaker(pt['claim'], d['person'], text, pt['detail'] + ' ' + pt['quote']), idx=i, key=point_key(p, i))
    _cache[p] = ((st.st_mtime, names()['mt']), d)
    return d


def ls(days=14):
    since = time.strftime('%Y-%m-%d', time.localtime(time.time() - days * 86400))
    cards = []
    for f in glob.glob(f'{CARDS()}/*.md'):
        try: c = parse(f)
        except Exception: continue
        if c['date'] >= since: cards.append(c)
    cards.sort(key=lambda c: (c['date'], c['id']), reverse=True)
    people = {}
    for c in cards:
        for p in c['points']:
            if p['who']: people[p['who']] = people.get(p['who'], 0) + 1
    return {'cards': cards, 'people': sorted(people.items(), key=lambda kv: -kv[1]), 'since': since}


# ---------- 挑题：打分 + 归议题 ----------
SCORES, TOPICS, RUNNING = (lambda: data('kb', 'scores.json')), (lambda: data('kb', 'topics.json')), (lambda: data('kb', '.running'))
BATCH = 50
CRITERIA = """打分看的是：拿这一条当由头做一条内容（短视频、口播或帖子），刷到的普通人（不一定懂 AI）会不会停下来、看完、想评论想转。
- 5：跟普通人的工作、钱、孩子、日常直接有关，有反常识或冲突，有具体的数字或故事，还能给一个看完就能用上的东西。
- 4：上面占了大半，换个讲法普通人也会关心。
- 3：圈内人会看，普通人得费劲解释才有感觉。
- 2：偏行业、偏技术、偏资本，普通人基本无感。
- 1：产品小更新、人事八卦、只有圈内人懂的梗，或者信息太少撑不起一条。
同一件事几条都在，挑讲得最具体的那条给高分。"""


def scores(): return load(SCORES(), {})


def topics(): return load(TOPICS(), {})


def running():
    try: t = os.path.getmtime(RUNNING())
    except OSError: return None
    return t if time.time() - t < 1800 else None


def _all_points(days):
    for c in ls(days)['cards']:
        for p in c['points']: yield c, p


def _line(c, p):
    return f"[{p['key']}] {p['who'] or c['person']}（{c['source'] or c['person']}，{c['date']}）：{p['claim']}。{p['detail'][:160]}"


def score(days=3, again=False):
    have = scores()
    todo = [(c, p) for c, p in _all_points(days) if again or p['key'] not in have]
    log(f'打分：{len(todo)} 条没打过（最近 {days} 天）')
    crit = config().get('kb_criteria') or CRITERIA
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        q = f"""你帮一个内容创作者挑题，他是：{config()['me']}。下面每行是一条 AI 大佬的观点（方括号里是编号）。
{crit}

每条交一个分数、一句为什么（20 字以内，大白话）、一句切入角度（拿这条做内容时开头可以怎么说，直接对观众说，不用人名开头，不吓人，不用“真相、底层、颠覆”这类词）。2 分及以下的切入角度留空。
最后用一个 ```json 代码块交：[{{"k": "编号", "s": 分数, "why": "为什么", "hook": "切入角度"}}]

<观点>
""" + '\n'.join(_line(c, p) for c, p in part) + '\n</观点>'
        try: got = last_json(llm.ask(q, purpose='score'))
        except Exception as e: log('这批没打成，下次再打：', str(e)[:200]); continue
        keys = set(p['key'] for _, p in part)
        have = scores()
        for x in got if isinstance(got, list) else []:
            k = str(x.get('k', '')).strip('[] ')
            try: s = max(1, min(5, int(x.get('s'))))
            except (TypeError, ValueError): continue
            if k in keys: have[k] = {'s': s, 'why': (x.get('why') or '').strip(), 'hook': (x.get('hook') or '').strip() if s >= 3 else '', 'ts': int(time.time())}
        save(SCORES(), have, 1)
        log(f'打完 {min(i + BATCH, len(todo))}/{len(todo)}')


def group(days=14):
    sc = scores()
    pts = [(c, p) for c, p in _all_points(days) if sc.get(p['key'], {}).get('s', 0) >= 3]
    log(f'归议题：最近 {days} 天 3 分以上 {len(pts)} 条')
    if len(pts) < 6: return
    q = f"""下面是最近 {days} 天 AI 圈各位大佬的观点（方括号里是编号，后面是谁说的、出处、日期）。帮一个内容创作者（{config()['me']}）找出「好几个人都在说的同一件事」，他要把几个人的说法串成一条内容。
- 归出 6–12 个议题，越具体越好：“AI 黑客潮里攻方和守方谁占便宜”可以，“Agent”“AI 编程”这种大类不行。
- 每个议题至少两个不同的人，3–8 条观点；说法有分歧的最好，能讲成“谁和谁看法不一样、普通人该信谁”。
- 一条观点只归一个议题，凑不进的就不归，别硬凑。
- 按普通人会不会关心排，最值得做的放前面。
每个议题交：title（一句话，15 字以内）、angle（这条内容怎么讲：分歧在哪、跟普通人什么关系，40 字以内）、keys（编号列表）。
最后用一个 ```json 代码块交：[{{"title": "", "angle": "", "keys": ["编号"]}}]

<观点>
""" + '\n'.join(_line(c, p) for c, p in pts) + '\n</观点>'
    got = last_json(llm.ask(q, purpose='group'))
    ok = set(p['key'] for _, p in pts); who = {p['key']: p['who'] or c['person'] for c, p in pts}
    out = []
    for i, t in enumerate(got if isinstance(got, list) else []):
        keys = [k for k in dict.fromkeys(str(k).strip('[] ') for k in t.get('keys') or []) if k in ok]
        people = list(dict.fromkeys(who[k] for k in keys))
        if len(keys) >= 2 and len(people) >= 2:
            out.append({'id': f't{i}', 'title': (t.get('title') or '').strip(), 'angle': (t.get('angle') or '').strip(), 'keys': keys, 'people': people})
    save(TOPICS(), {'ts': int(time.time()), 'days': days, 'items': out}, 1)
    log(f'议题 {len(out)} 个：' + ' / '.join(t['title'] for t in out))


def topics_view():
    """页面用：议题带上每条观点的人、论断、出处和分数。"""
    t = topics()
    if not t.get('items'): return t
    sc, by = scores(), {}
    for c, p in _all_points(max(14, t.get('days') or 14) + 2):
        by[p['key']] = {'key': p['key'], 'who': p['who'] or c['person'], 'claim': p['claim'], 'quote_zh': p['quote_zh'], 'path': c['path'],
                        'date': c['date'], 'url': c['url'], 's': sc.get(p['key'], {}).get('s')}
    items = []
    for it in t['items']:
        pts = [by[k] for k in it['keys'] if k in by]
        if len(pts) >= 2: items.append(dict(it, points=pts))
    return dict(t, items=items)


def view(days):
    d = ls(days)
    return dict(d, scores=scores(), topics=topics_view(), picking=bool(running()))


def pick(what='run'):
    if running(): log('已经在挑了'); return
    open(RUNNING(), 'w').write(str(os.getpid()))
    try:
        if what in ('run', 'score'): score(3)
        if what in ('run', 'group'): group(14)
    finally:
        try: os.remove(RUNNING())
        except OSError: pass


def main(argv):
    pick(argv[0] if argv else 'run')
