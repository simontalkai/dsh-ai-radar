"""AI 热点监控：中文热榜 + X + 中文媒体 + 开发者社区一起看，模型把原料归成「正在发酵的事」。

  python3 -m radar hot [--regroup]    抓一轮 → data/hot/latest.json（一轮 1–3 分钟）

来源（都不用登录、不用 cookie）：
  中文热榜  抖音、B站、百度、知乎、头条，只留跟 AI 沾边的词
  X        sources.json 里 hot.x 列的号（中文大V / 官方号 / 一手开发者），近 48 小时本人发帖，按每小时互动速度排；走公开的 fxtwitter 接口
  中文媒体  量子位、机器之心、新智元 + 360 新闻按 hot.news_queries 搜
  开发者社区 Hacker News、Hugging Face trending、GitHub trending，只留 AI 相关
抓完让模型把原料归成 6–12 件事，打「值不值得做」1–5 分；原料没怎么变就沿用上一轮的归类，省钱。"""
import os, re, sys, json, math, time, html, email.utils, datetime, subprocess, urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from .common import config, data, sources, load, save, last_json, norm, fetch, get_json, UA, log as _log, ROOT
from . import llm

HOURS = 48
CN = datetime.timezone(datetime.timedelta(hours=8))


def log(*a): _log(*a, file='hot.log')
def D(name): return data('hot', name)


# ---------- 来源：中文热榜 ----------
AI_ZH = re.compile(r'AI|A\.I|人工智能|大模型|模型|智能体|Agent|GPT|ChatGPT|OpenAI|奥特曼|Claude|Anthropic|Gemini|谷歌|DeepSeek|深度求索|Kimi|月之暗面|千问|通义|'
                   r'豆包|字节|智谱|MiniMax|混元|文心|讯飞|英伟达|黄仁勋|芯片|算力|马斯克|xAI|Grok|机器人|宇树|自动驾驶|萝卜快跑|特斯拉', re.I)


def douyin():
    d = get_json('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/')
    return [{'word': x['word'], 'hot': x.get('hot_value')} for x in d['word_list']]


def bilibili():
    d = get_json('https://s.search.bilibili.com/main/hotword')
    return [{'word': x['keyword']} for x in d['list']]


def baidu():
    d = get_json('https://top.baidu.com/api/board?platform=wise&tab=realtime')
    c = d['data']['cards'][0]['content']
    if c and isinstance(c, list) and 'content' in c[0]: c = c[0]['content']
    return [{'word': x['word'], 'desc': (x.get('desc') or '')[:80]} for x in c]


def wan(s):
    m = re.search(r'([\d.]+)\s*(万|亿)?', s or '')
    return int(float(m.group(1)) * {'万': 1e4, '亿': 1e8}.get(m.group(2), 1)) if m else None


def zhihu():   # www.zhihu.com 的接口要登录，App 接口不用
    d = get_json('https://api.zhihu.com/topstory/hot-lists/total?limit=50')
    return [{'word': x['target']['title'], 'desc': (x['target'].get('excerpt') or '')[:80], 'hot': wan(x.get('detail_text'))}
            for x in d['data'] if x.get('target', {}).get('title')]


def toutiao():
    d = get_json('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', 'https://www.toutiao.com/')
    return [{'word': x['Title'], 'desc': '', 'hot': int(x['HotValue']) if str(x.get('HotValue', '')).isdigit() else None} for x in d['data']]


# ---------- 来源：AI 垂直媒体、360 新闻 ----------
def hours(dt):
    return round((datetime.datetime.now(datetime.timezone.utc) - dt).total_seconds() / 3600, 1) if dt else None


def iso(s):
    try: return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception: return None


def rss(url, site):
    out = []
    for it in ET.fromstring(fetch(url)).iter('item'):
        t = it.findtext('pubDate') or ''
        try: dt = email.utils.parsedate_to_datetime(t)
        except Exception: dt = None
        out.append({'title': (it.findtext('title') or '').strip(), 'url': (it.findtext('link') or '').strip(), 'site': site, 'time': t, 'age_h': hours(dt)})
    return out


def newest(items):
    seen, out = set(), []
    for x in items:
        if x['url'] not in seen: seen.add(x['url']); out.append(x)
    return sorted(out, key=lambda x: x['age_h'] if x['age_h'] is not None else 1e9)


def qbitai():
    items = rss('https://www.qbitai.com/feed', '量子位')
    for p in (2, 3):
        try: items += rss(f'https://www.qbitai.com/feed?paged={p}', '量子位')
        except Exception: break
    return newest(items)


def jiqizhixin():   # 网页对爬虫返回广告页，前端用的这个接口不拦，只有最新 20 条
    d = get_json('https://www.jiqizhixin.com/api/article_library/articles.json?sort=time&page=1&per=20', 'https://www.jiqizhixin.com/')
    out = []
    for a in d['articles']:
        try: dt = datetime.datetime.strptime(a['publishedAt'], '%Y/%m/%d %H:%M').replace(tzinfo=CN)
        except Exception: dt = None
        out.append({'title': a['title'], 'url': f'https://www.jiqizhixin.com/articles/{a["slug"]}', 'site': '机器之心', 'time': a.get('publishedAt') or '', 'age_h': hours(dt)})
    return newest(out)


def aiera():
    return newest(rss('https://aiera.com.cn/feed/', '新智元'))


def so_age_h(t):
    """360 新闻的时间：12分钟前 / 3小时前 / 2天前 / 昨天 / 10月21日 → 距今小时数。"""
    t = (t or '').strip()
    for pat, mul in ((r'(\d+)\s*分钟前', 1 / 60), (r'(\d+)\s*小时前', 1), (r'(\d+)\s*天前', 24)):
        m = re.match(pat, t)
        if m: return int(m.group(1)) * mul
    if t.startswith('昨天'): return 24.0
    if t.startswith('前天'): return 48.0
    m = re.match(r'(?:(\d{4})[年-])?(\d{1,2})[月-](\d{1,2})', t)
    if m:
        y = int(m.group(1) or time.strftime('%Y'))
        try: return max(0.0, (time.time() - time.mktime((y, int(m.group(2)), int(m.group(3)), 12, 0, 0, 0, 0, -1))) / 3600)
        except Exception: return None
    return None


def so_search(q):
    s = fetch('https://news.so.com/ns?q=' + urllib.parse.quote(q) + '&rank=pdate').decode('utf-8', 'ignore')
    out = []
    for li in re.findall(r'<li class="[^"]*res-list[^"]*"(.*?)</li>(?=<li class="[^"]*res-list|</ul>)', s, re.S):
        t = re.search(r'title="([^"]+)"', li)
        u = re.search(r'data-url="([^"]+)"', li) or re.search(r'href="([^"]+)"', li)
        c = re.search(r'<cite class="sitename">(.*?)</cite>', li)
        tm = re.search(r'class="[^"]*time">(.*?)</span>', li)
        if not t: continue
        out.append({'q': q, 'title': html.unescape(t.group(1)).strip(), 'url': u.group(1) if u else '',
                    'site': html.unescape(c.group(1)).strip() if c else '', 'time': tm.group(1).strip() if tm else '', 'age_h': so_age_h(tm.group(1) if tm else '')})
    return out


# 360 搜「豆包」「千问」会捞上来一堆 GEO 优化、服务商排行的软文，不算报道
SPAM = re.compile(r'GEO|服务商|哪家好|排行榜|推荐榜|口碑|靠谱|优化公司|代运营|培训班')


# ---------- 来源：开发者社区 ----------
AI_EN = re.compile(r'\b(AI|AGI|LLMs?|GPT[\w.-]*|ChatGPT|Claude|Anthropic|OpenAI|Gemini|DeepMind|DeepSeek|Qwen|Llama|Mistral|Kimi|MiniMax|Grok|xAI|'
                   r'Copilot|Codex|Cursor|agents?|agentic|models?|inference|GPUs?|Nvidia|CUDA|TPUs?|transformers?|neural|diffusion|RAG|MCP|'
                   r'embeddings?|fine-?tun\w*|prompts?|tokens?|chatbots?|benchmark\w*|artificial intelligence|machine learning|deep learning|'
                   r'Hugging ?Face|vLLM|Ollama|LoRA|RLHF)\b|\bA\.I\.', re.I)


def is_ai(*texts):
    return bool(AI_EN.search(re.sub(r'[-_/]', ' ', ' '.join(t or '' for t in texts))))


def hn():
    d = get_json('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40')
    out = []
    for x in d['hits']:
        if not is_ai(x.get('title')): continue
        item = f'https://news.ycombinator.com/item?id={x["objectID"]}'
        out.append({'title': x['title'], 'url': x.get('url') or item, 'desc': f'HN 讨论 {item}', 'score': x.get('points'),
                    'comments': x.get('num_comments'), 'age_h': hours(iso(x.get('created_at') or '')), 'by': x.get('author')})
    return out


def hf():
    out = []
    for x in get_json('https://huggingface.co/api/models?sort=trendingScore&limit=20'):
        mid = x.get('id') or x.get('modelId')
        desc = f'{x.get("pipeline_tag") or "?"} · 下载 {x.get("downloads", 0):,} · 赞 {x.get("likes", 0):,}'
        out.append({'title': mid, 'url': f'https://huggingface.co/{mid}', 'desc': desc, 'score': x.get('likes'), 'comments': None, 'age_h': None,
                    'by': mid.split('/')[0] if '/' in mid else None})
    return out


def github():
    h = fetch('https://github.com/trending?since=daily').decode('utf-8', 'replace')
    out = []
    for a in h.split('<article class="Box-row')[1:]:
        m = re.search(r'<h2[^>]*>.*?href="/([^"/]+/[^"/]+)"', a, re.S)
        if not m: continue
        name = m.group(1)
        p = re.search(r'<p class="[^"]*color-fg-muted[^"]*">(.*?)</p>', a, re.S)
        desc = html.unescape(re.sub(r'<[^>]+>|\s+', ' ', p.group(1))).strip() if p else ''
        if not is_ai(name, desc): continue
        s = re.search(r'([\d,]+)\s+stars? today', a)
        out.append({'title': name, 'url': f'https://github.com/{name}', 'desc': desc[:160], 'score': int(s.group(1).replace(',', '')) if s else None,
                    'comments': None, 'age_h': None, 'by': name.split('/')[0]})
    return out


# ---------- 来源：X（fxtwitter 公开接口） ----------
def scan(u, kind, now):
    """只要本人发帖（不要转、不要回复），速度 = (赞 + 2转 + 2引 + 藏) / 小时。"""
    try: rs = get_json(f'https://api.fxtwitter.com/2/profile/{u}/statuses', timeout=30).get('results') or []
    except Exception: return []
    out = []
    for t in rs:
        if t.get('type') != 'status' or t.get('reposted_by') or not t.get('author') or t.get('replying_to'): continue
        if t['author']['screen_name'].lower() != u.lower(): continue
        age = (now - t['created_timestamp']) / 3600
        if age > HOURS: continue
        out.append({'key': 'x:' + str(t['id']), 'url': t['url'], 'author': u, 'name': t['author']['name'], 'kind': kind,
                    'age_h': round(age, 1), 'ts': t['created_timestamp'], 'likes': t['likes'], 'reposts': t['reposts'], 'replies': t['replies'], 'views': t.get('views'),
                    'velocity': round((t['likes'] + 2 * t['reposts'] + 2 * t.get('quotes', 0) + t.get('bookmarks', 0)) / max(age, 0.5), 1),
                    'text': (t.get('text') or '')[:600],
                    'quote': ({'author': (t['quote'].get('author') or {}).get('screen_name'), 'text': (t['quote'].get('text') or '')[:300]} if t.get('quote') else None)})
    return out


# ---------- 认公司 ----------
_ent = {}


def ent_rules():
    H = sources().get('hot') or {}
    key = json.dumps([H.get('entities'), H.get('author_entity')], ensure_ascii=False)
    if _ent.get('key') != key:
        pats = [(name, re.compile('|'.join((r'(?<![A-Za-z])' + re.escape(w) + r'(?![A-Za-z])') if w.isascii() else re.escape(w) for w in ws), re.I))
                for name, ws in H.get('entities') or []]
        _ent.update(key=key, pats=pats, author=H.get('author_entity') or {})
    return _ent


def ents(text, author=None):
    R = ent_rules()
    out = [name for name, p in R['pats'] if p.search(text or '')]
    a = R['author'].get(author or '')
    return out if not a or a in out else [a] + out


# ---------- 抓一轮 ----------
def collect(now):
    H = sources().get('hot') or {}
    errs, src = [], {}
    accounts = [(u, kind) for kind, us in (H.get('x') or {}).items() for u in us]
    seen_u, acc = set(), []
    for u, k in accounts:
        if u.lower() not in seen_u: seen_u.add(u.lower()); acc.append((u, k))
    queries = H.get('news_queries') or []
    boards = [('抖音', douyin), ('B站', bilibili), ('百度', baidu), ('知乎', zhihu), ('头条', toutiao)]
    zms = [('量子位', qbitai), ('机器之心', jiqizhixin), ('新智元', aiera)]
    devs = [('Hacker News', hn), ('Hugging Face', hf), ('GitHub', github)]
    def _try(fn, *a):
        try: return fn(*a)
        except Exception: return None
    with ThreadPoolExecutor(12) as ex:
        fb = {n: ex.submit(fn) for n, fn in boards}
        fz = [(n, ex.submit(fn)) for n, fn in zms]
        fd = [(n, ex.submit(fn)) for n, fn in devs]
        fs = [(q, ex.submit(_try, so_search, q)) for q in queries]
        fx_ = [ex.submit(scan, u, k, now) for u, k in acc]
        hot = []
        for name, f in fb.items():
            try: rows = f.result()
            except Exception as e: rows = None; errs.append(f'{name}热榜：{str(e)[:60]}')
            ai = [(i, x) for i, x in enumerate(rows or [], 1) if AI_ZH.search(x['word'] + ' ' + x.get('desc', ''))]
            src[name] = {'ok': rows is not None, 'n': len(ai), 'total': len(rows or [])}
            hot += [{'key': f'hot:{name}:{norm(x["word"])}', 'board': name, 'rank': i, 'word': x['word'], 'desc': x.get('desc', ''), 'hot': x.get('hot')} for i, x in ai]
        xs, ids = [], set()
        for x in sorted([x for f in fx_ for x in f.result()], key=lambda x: -x['velocity']):
            if x['key'] not in ids: ids.add(x['key']); xs.append(x)
        src['X'] = {'ok': bool(xs) or not acc, 'n': len(xs), 'total': len(acc)}
        if acc and not xs: errs.append('X：一条都没抓到（fxtwitter 挂了？）')
        media, seen, zok = [], set(), 0
        for n, f in fz:   # 垂直媒体排在 360 前面去重：同一条两边都有，留垂直媒体那条
            try: rows = f.result(); zok += 1
            except Exception as e: errs.append(f'{n}：{str(e)[:60]}'); continue
            for x in rows:
                if x.get('age_h') is not None and x['age_h'] > HOURS: continue
                k = norm(x['title'])
                if not k or k in seen: continue
                seen.add(k); media.append(dict(x, q=n, key='zm:' + k, ai_media=True))
        src['AI 媒体'] = {'ok': zok > 0, 'n': len(media), 'total': len(fz)}
        dev, dok = [], 0
        for n, f in fd:
            try: rows = f.result(); dok += 1
            except Exception as e: errs.append(f'{n}：{str(e)[:60]}'); continue
            dev += [dict(x, site=n, key=f'dev:{n}:' + norm(x['title'])) for x in rows]
        src['社区'] = {'ok': dok > 0, 'n': len(dev), 'total': len(fd)}
        failed = 0
        for q, f in fs:
            rows = f.result()
            if rows is None: failed += 1; continue
            for x in rows:
                if x['age_h'] is not None and x['age_h'] > HOURS: continue
                k = norm(x['title'])
                if not k or k in seen or SPAM.search(x['title']): continue
                seen.add(k); media.append(dict(x, key='so:' + k))
        src['媒体'] = {'ok': failed < len(queries) or not queries, 'n': sum(1 for m in media if m['key'].startswith('so:')), 'total': len(queries)}
        if failed: errs.append(f'360 新闻：{failed}/{len(queries)} 个词没搜到')
    media.sort(key=lambda x: x['age_h'] if x['age_h'] is not None else 999)
    return hot, xs[:120], media, dev, src, errs


# ---------- 热度和事件 ----------
def made_ts(it, now):
    if 'ts' in it: return it['ts']
    return now - it['age_h'] * 3600 if it.get('age_h') is not None else it.get('first_seen', now)


HEAT_V = 2


def heat_parts(items):
    """四处各 0–10 分：热榜看最好名次（第 1 名 10 分）、多上一个榜加 2；X 看互动速度之和取对数；媒体看几家不同的站在报；社区一条 3 分。"""
    rk = [max(1.0, 10 - (h['rank'] - 1) * 9 / 49) for h in items if 'rank' in h]
    boards = {h['board'] for h in items if 'rank' in h}
    v = sum(x['velocity'] for x in items if 'velocity' in x)
    sites = {m.get('site') for m in items if 'title' in m and not m['key'].startswith('dev:')}
    nd = sum(1 for it in items if it['key'].startswith('dev:'))
    return {'hot': round(min(10, max(rk) + 2 * (len(boards) - 1)), 1) if rk else 0,
            'x': round(min(10, 1.1 * math.log2(1 + v / 8)), 1) if v else 0,
            'media': round(min(10, 3.2 * math.log2(1 + len(sites))), 1) if sites else 0,
            'dev': min(10, 3 * nd)}


def heat(items):
    """热度 = 四处分数相加，每多一处来源再加 3（同时在好几处热的才是大事），满分 49。"""
    p = heat_parts(items)
    n = sum(1 for s in p.values() if s)
    return round(sum(p.values()) + 3 * (n - 1), 1) if n else 0


EV_PROMPT = """下面是这会儿抓到的 AI 圈原料：X 上大V、官方号、核心开发者近 24 小时的帖（按每小时互动速度排），中文媒体近 24 小时的报道标题，中文热榜上跟 AI 沾边的词，开发者社区上 AI 相关的条目。
把讲同一件事的归成一个事件，挑出 6–12 件真正的 AI 新闻：新模型和产品发布、大公司动作、融资收购、人事变动、争议和事故、政策、重要研究。
不要的：个人感想和段子、教程和广告、GEO 优化之类的软文、跟 AI 不沾边的、只有一条中文小报道又没人在聊的。
只用原料里写了的事实，不要补原料里没有的数字和细节；英文帖用中文讲。

看这些原料的人是：{me}

每个事件交这些字段：
- id：上一轮已经有的事件（下面列了）就沿用它的 id；新的事件起一个短英文 slug，比如 kimi-gmail
- title：中文，20 字以内，像新闻标题，主语是谁干了什么
- what：一两句话，发生了什么，普通人能看懂
- kind：发布 / 产品更新 / 融资 / 人事 / 争议 / 政策 / 研究 / 财报 / 其他，选一个
- x / media / hot / dev：属于这件事的原料编号（x 编号、m 编号、h 编号、d 编号，只写数字），没有就空数组
- score：1–5，值不值得这个人做一条内容。5 = 普通人也会关心、有新东西可讲；3 = 圈里热但普通人无感，或只够写条帖子；1 = 小新闻、软文味、只有数字没有故事。
  分数要拉开，这一批放在一起比：5 分最多 2 件，4 分最多 3 件，其余 3 分及以下
- form：{forms}，选一个最合适的
- why：20 字以内，为什么这么打分

上一轮的事件：
{prev}

【X】
{xs}

【媒体】
{ms}

【热词】
{hs}

【开发者社区】
{ds}

最后用一个 ```json 代码块交稿：[{{"id": "...", "title": "...", "what": "...", "kind": "...", "x": [0, 3], "media": [2], "hot": [], "dev": [], "score": 4, "form": "...", "why": "..."}}]"""


def zh_side(it):
    """中文这边：中文媒体、中文热榜、中文大V；其余（官方号、一手开发者、海外社区）算源头。"""
    return it['key'].startswith(('so:', 'hot:', 'zm:')) or it.get('kind') == '中文'


def build_event(meta, items, pe, prev_heat, now):
    eid = meta['id']
    by = lambda p: [it for it in items if it['key'].startswith(p)]
    first = min(items, key=lambda it: made_ts(it, now))
    h_ = heat(items)
    ph = prev_heat.get(eid)
    e = {'id': eid, 'title': meta['title'], 'what': meta['what'], 'kind': meta['kind'],
         'keys': [it['key'] for it in items], 'n_x': len(by('x:')), 'n_media': len(by('so:')) + len(by('zm:')), 'n_hot': len(by('hot:')), 'n_dev': len(by('dev:')),
         'ents': sorted({en for it in items for en in it['ents']}, key=lambda en: -sum(en in it['ents'] for it in items))[:4],
         'first_ts': made_ts(first, now), 'first': ('@' + first['author']) if 'author' in first else first.get('site') or first.get('board'),
         'first_url': first.get('url', ''), 'first_seen': min(it['first_seen'] for it in items), 'heat': h_, 'parts': heat_parts(items),
         'trend': 'new' if pe and all(p['id'] != eid for p in pe) else 'up' if ph and h_ >= ph * 1.3 + 2 else 'down' if ph and h_ <= ph * 0.7 - 2 else '',
         'score': meta.get('score'), 'form': meta.get('form', ''), 'why': meta.get('why', '')}
    e['srcs'] = (e['n_x'] > 0) + (e['n_media'] > 0) + (e['n_hot'] > 0) + (e['n_dev'] > 0)
    # 传播时间线：源头谁先发，中文隔多久跟上；源头热了中文还没人报的就是窗口期
    en = [made_ts(it, now) for it in items if not zh_side(it)]
    zh = [made_ts(it, now) for it in items if zh_side(it)]
    e['first_en_ts'] = min(en) if en else None
    e['first_zh_ts'] = min(zh) if zh else None
    e['lag_h'] = round((min(zh) - min(en)) / 3600, 1) if en and zh and min(zh) > min(en) else None
    xv = sum(it['velocity'] for it in items if 'velocity' in it and not zh_side(it))
    e['gap'] = bool(en) and not zh and (xv >= 150 or e['n_dev'] > 0)
    e['rank'] = round(h_ * (0.6 + 0.2 * (e['score'] or 3)), 1)   # 综合 = 热度 × 值不值得做
    return e


REGROUP_NEW, REGROUP_XV, REGROUP_EVERY = 8, 150, 2 * 3600


def need_regroup(X, M, hot, dev, prev, now):
    """原料没怎么变就不叫模型，沿用上次的事件，只按这会儿的原料重算热度和时间线。"""
    info, pe = prev.get('ev_info') or {}, prev.get('events') or []
    if not pe or any(e.get('stale') for e in pe): return True, '上一轮没有可沿用的事件'
    if prev.get('heat_v') != HEAT_V or not info.get('keys'): return True, '第一次按新办法跑'
    if now - info.get('ts', 0) >= REGROUP_EVERY: return True, f'离上次归类满 {REGROUP_EVERY // 3600} 小时'
    old = set(info['keys'])
    fresh = [it for it in X + M + hot + dev if it['key'] not in old]
    big = [x for x in fresh if x.get('velocity', 0) >= REGROUP_XV]
    if big: return True, f'新进来 {len(big)} 条快推（@{big[0]["author"]} {big[0]["velocity"]}/时）'
    if any(it['key'].startswith('hot:') for it in fresh): return True, '热榜上了新的 AI 词'
    if len(fresh) >= REGROUP_NEW: return True, f'新进来 {len(fresh)} 条'
    return False, f'只新进来 {len(fresh)} 条，沿用 {time.strftime("%H:%M", time.localtime(info["ts"]))} 的归类'


def events(hot, xs, media, dev, prev, now, regroup=False):
    X = [x for x in xs if x['age_h'] <= 24][:50]
    M = [m for m in media if m['age_h'] is None or m['age_h'] <= 24][:100]
    pe = prev.get('events') or []
    prev_heat = {e['id']: e['heat'] for e in pe} if prev.get('heat_v') == HEAT_V else {}
    keys = [it['key'] for it in X + M + hot + dev]
    go, why = (True, '手动点了现在抓一次') if regroup else need_regroup(X, M, hot, dev, prev, now)
    if not go:
        pool = {it['key']: it for it in X + M + hot + dev}
        out = []
        for pv in pe:
            items = [pool[k] for k in pv['keys'] if k in pool]
            if items: out.append(build_event(pv, items, pe, prev_heat, now))
        out.sort(key=lambda e: -e['rank'])
        return out, None, dict(prev['ev_info'], reused=True, why=why)
    c = config()
    p = EV_PROMPT.format(
        me=c['me'], forms=' / '.join(c['forms']),
        prev='\n'.join(f'- {e["id"]}：{e["title"]}' for e in pe) or '（没有，这是第一轮）',
        xs='\n'.join(f'x{i} @{x["author"]}（{x["kind"]}，{x["age_h"]} 小时前，速度 {x["velocity"]}/时）：' + ' '.join(x['text'].split())[:280] for i, x in enumerate(X)) or '（没有）',
        ms='\n'.join(f'm{i} {m["site"]}｜{m["title"]}' for i, m in enumerate(M)) or '（没有）',
        hs='\n'.join(f'h{i} {h["board"]}第{h["rank"]}「{h["word"]}」{h["desc"][:40]}' for i, h in enumerate(hot)) or '（没有）',
        ds='\n'.join(f'd{i} {x["site"]}｜{x["title"]}' + (f'：{x["desc"][:80]}' if x.get('desc') else '') for i, x in enumerate(dev)) or '（没有）')
    try:
        raw = last_json(llm.ask(p, purpose='events', timeout=600))
    except Exception as e:
        log('事件归类没成，沿用上一轮：', str(e)[:200])
        return [dict(e, stale=True) for e in pe], str(e)[:200], dict(prev.get('ev_info') or {}, reused=True, why='模型没成，沿用上一轮')
    out, used = [], set()
    for r in raw if isinstance(raw, list) else []:
        pick = lambda arr, k: [arr[i] for i in (r.get(k) or []) if isinstance(i, int) and 0 <= i < len(arr)]
        items = pick(X, 'x') + pick(M, 'media') + pick(hot, 'hot') + pick(dev, 'dev')
        eid = re.sub(r'[^a-z0-9-]', '', str(r.get('id') or '').lower())[:40]
        if not items or not r.get('title') or not eid or eid in used: continue
        used.add(eid)
        meta = {'id': eid, 'title': str(r['title'])[:40], 'what': str(r.get('what') or '')[:200], 'kind': str(r.get('kind') or '其他')[:6],
                'form': str(r.get('form') or '')[:8], 'why': str(r.get('why') or '')[:40]}
        try: meta['score'] = max(1, min(5, int(r.get('score'))))
        except (TypeError, ValueError): meta['score'] = None
        out.append(build_event(meta, items, pe, prev_heat, now))
    out.sort(key=lambda e: -e['rank'])
    return out, None, {'ts': now, 'keys': keys, 'reused': False, 'why': why}


def run(regroup=False):
    t0 = time.time(); now = int(t0)
    hot, xs, media, dev, src, errs = collect(now)
    prev = load(D('latest.json'), {})
    baseline = not os.path.exists(D('seen.json'))   # 第一轮当底子，不标「新」
    seen = load(D('seen.json'), {})
    prev_rank = {h['key']: h['rank'] for h in prev.get('hot', [])}
    for it in hot + xs + media + dev:
        it['first_seen'] = seen.setdefault(it['key'], now)
        it['new'] = not baseline and it['first_seen'] == now
        it['ents'] = ents(' '.join(str(it.get(k) or '') for k in ('word', 'desc', 'text', 'title')) + ' ' + ((it.get('quote') or {}).get('text') or ''), it.get('author'))
    for h in hot: h['prev_rank'] = prev_rank.get(h['key'])
    save(D('seen.json'), {k: v for k, v in seen.items() if now - v < 4 * 86400})
    evs, ev_err, ev_info = events(hot, xs, media, dev, prev, now, regroup)
    if ev_err: errs.append('事件归类没成（沿用上一轮）')

    # 谁在热：每家公司在三处各几条，热度跟事件同一个算法
    E, IT = {}, {}
    def add(e, it):
        IT.setdefault(e, []).append(it)
        return E.setdefault(e, {'name': e, 'hot': 0, 'x': 0, 'media': 0, 'top': None})
    for h in hot:
        for e in h['ents']:
            r = add(e, h); r['hot'] += 1; r['top'] = r['top'] or f'{h["board"]}第{h["rank"]}「{h["word"]}」'
    for x in xs:
        if x['age_h'] > 24: continue
        for e in x['ents']:
            r = add(e, x); r['x'] += 1
    for m in media:
        if m['age_h'] is not None and m['age_h'] > 24: continue
        for e in m['ents']:
            r = add(e, m); r['media'] += 1; r['top'] = r['top'] or m['title']
    for r in E.values():
        r['heat'] = heat(IT[r['name']])
        own = next((e for e in evs if not e.get('stale') and e['ents'][:1] == [r['name']]), None)   # 代表标题取这家是主角的事件
        if own: r['top'] = own['title']
        elif not r['top']:
            best = max((x for x in xs if r['name'] in x['ents'] and x['age_h'] <= 24), key=lambda x: x['velocity'], default=None)
            r['top'] = best and f'@{best["author"]}：' + ' '.join(best['text'].split())[:60]
    ent_list = sorted(E.values(), key=lambda r: -r['heat'])

    hist_p = D('history.jsonl')
    Hs = [json.loads(l) for l in open(hist_p, encoding='utf-8')] if os.path.exists(hist_p) else []
    Hs = [h for h in Hs if now - h['ts'] < HOURS * 3600] + [{'ts': now, 'v': HEAT_V, 'e': {r['name']: r['heat'] for r in ent_list}, 'ev': {e['id']: e['heat'] for e in evs}}]
    open(hist_p, 'w', encoding='utf-8').write(''.join(json.dumps(h, ensure_ascii=False) + '\n' for h in Hs))
    for r in ent_list: r['spark'] = [h['e'].get(r['name'], 0) for h in Hs if h.get('v') == HEAT_V][-48:]

    out = {'at': time.strftime('%Y-%m-%d %H:%M', time.localtime(now)), 'ts': now, 'took_s': round(time.time() - t0), 'hours': HOURS,
           'every_min': config()['schedule']['hot_every_min'], 'heat_v': HEAT_V, 'baseline': baseline, 'sources': src, 'errors': errs,
           'events': evs, 'ev_info': ev_info, 'ents': ent_list, 'hot': hot, 'x': xs, 'media': media[:200], 'dev': dev}
    save(D('latest.json'), out)
    log(f'用 {out["took_s"]}s（{"沿用归类" if ev_info.get("reused") else "重新归类"}：{ev_info.get("why")}）：热榜 AI 词 {len(hot)}，X {len(xs)}，媒体 {len(media)}，社区 {len(dev)}，事件 {len(evs)}'
        + ('；' + '；'.join(errs) if errs else ''))


# ---------- 给服务器用：在不在抓、后台起一轮、读快照 ----------
def running():
    st = load(D('running.json'), None)
    if not st: return None
    try: os.kill(st['pid'], 0)
    except OSError: return None
    return st


def kick(regroup=True):
    if running(): return False
    args = [sys.executable, '-m', 'radar', 'hot'] + (['--regroup'] if regroup else [])
    p = subprocess.Popen(args, cwd=ROOT, start_new_session=True, stdout=open(D('run.log'), 'a'), stderr=subprocess.STDOUT)
    save(D('running.json'), {'pid': p.pid, 'started': int(time.time())})   # 先占上，网页马上读到「在抓」
    return True


def view():
    d = load(D('latest.json'), None)
    st = running()
    return {'ok': True, 'data': d, 'running': bool(st), 'running_since': st and st['started'],
            'next_ts': d and d['ts'] + config()['schedule']['hot_every_min'] * 60}


def main(argv):
    st = running()
    if st and st['pid'] != os.getpid(): print('已经在抓'); return
    save(D('running.json'), {'pid': os.getpid(), 'started': int(time.time())})
    try: run('--regroup' in argv)
    finally:
        try: os.remove(D('running.json'))
        except FileNotFoundError: pass
