"""python3 -m radar <命令>

  serve [端口] [--no-schedule]   起服务器（默认 8790），自带定时：热点每小时、卡片每天 7:40、挑题每天 9:30
  hot [--regroup]                现在抓一轮热点
  cards run|fetch|make|index|status|redo   AI 大佬知识库（python3 -m radar cards -h 看参数）
  pick [score|group]             给新观点打分、归议题
  doctor                         检查配置：模型通不通、各个来源抓不抓得到"""
import sys


def doctor():
    from .common import config, sources
    from . import llm, hot
    c = config()
    print(f'模型：{c["llm"]["provider"]} / {c["llm"]["dsh"]["model"] if c["llm"]["provider"] == "dsh" else c["llm"]["model"]}')
    try: print('  回答：', llm.ask('只回两个字：通了', purpose='doctor', timeout=120, tries=1).strip()[:40])
    except Exception as e: print('  ✗ 不通：', str(e)[:300])
    S = sources()
    print(f'名单：{len(S.get("people") or {})} 人，{len(S.get("blogs") or [])} 个博客，{len(S.get("videos") or [])} 个视频频道，X {len((S.get("x") or {}).get("people") or [])} 人')
    for name, fn in (('抖音', hot.douyin), ('B站', hot.bilibili), ('百度', hot.baidu), ('知乎', hot.zhihu), ('头条', hot.toutiao), ('量子位', hot.qbitai),
                     ('机器之心', hot.jiqizhixin), ('新智元', hot.aiera), ('Hacker News', hot.hn), ('Hugging Face', hot.hf), ('GitHub', hot.github)):
        try: print(f'  ✓ {name} {len(fn())} 条')
        except Exception as e: print(f'  ✗ {name}：{str(e)[:80]}')
    import time
    xs = hot.scan('OpenAI', '官方', int(time.time()))
    print(f'  {"✓" if xs is not None else "✗"} X（fxtwitter）@OpenAI 48 小时内 {len(xs)} 条')
    try: print(f'  ✓ 360 新闻 {len(hot.so_search("大模型"))} 条')
    except Exception as e: print(f'  ✗ 360 新闻：{str(e)[:80]}')


def main():
    a = sys.argv[1:]
    cmd, rest = (a[0], a[1:]) if a else ('help', [])
    if cmd == 'serve':
        from . import serve; serve.main(rest)
    elif cmd == 'hot':
        from . import hot; hot.main(rest)
    elif cmd == 'cards':
        from . import cards; cards.main(rest or ['run'])
    elif cmd == 'pick':
        from . import kb; kb.main(rest)
    elif cmd == 'doctor':
        doctor()
    else:
        print(__doc__)


main()
