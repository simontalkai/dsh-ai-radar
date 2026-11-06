"""测试用的假 dsh：像 dsh headless --json 那样一行一个 JSON 事件。把收到的 patch 和提问原样回给测试检查。"""
import sys, json
args = sys.argv[1:]
patch = open(args[args.index('--patch') + 1], encoding='utf-8').read()
q = sys.stdin.read()
if '要报错' in q:
    print('dsh: authorization: not logged in', file=sys.stderr); sys.exit(3)
print(json.dumps({'type': 'session', 'sessionId': 's1'}))
print(json.dumps({'type': 'final', 'text': json.dumps({'args': args, 'patch': patch, 'q': q}, ensure_ascii=False)}))
