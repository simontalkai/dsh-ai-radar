"""调模型。四种后端，在 config.json 的 llm.provider 里选：
  dsh       借 DSH 里已经登录的 DeepSeek 账号（dsh headless），不用另外申请 API key
  deepseek  DeepSeek 开放平台 API key，OpenAI 兼容接口
  openai    任何 OpenAI 兼容接口：Kimi、通义、智谱、OpenRouter、本地 Ollama……填 base_url、model、key
  claude    本机 Claude Code 的 claude -p（有订阅不用 key）
所有调用都不给模型任何工具：原文只当数据，模型只回文本。
llm.models 可以按用途换模型：{"cards": "deepseek-v4-pro"}，用途有 cards（做卡片）、events（归热点事件）、score（给观点打分）、group（归议题）。"""
import os, json, time, shlex, shutil, subprocess, tempfile, urllib.request, urllib.error
from .common import config


class LLMError(Exception): pass


def _key(c):
    k = c.get('api_key') or os.environ.get(c.get('api_key_env') or '', '')
    if not k: raise LLMError(f'没有 API key：在 config.json 的 llm.api_key 填，或者设环境变量 {c.get("api_key_env")}')
    return k


def _openai(prompt, system, model, c, timeout):
    url = c['base_url'].rstrip('/') + ('/chat/completions' if not c['base_url'].rstrip('/').endswith('/chat/completions') else '')
    msgs = ([{'role': 'system', 'content': system}] if system else []) + [{'role': 'user', 'content': prompt}]
    body = {'model': model, 'messages': msgs, 'stream': False}
    if c.get('max_tokens'): body['max_tokens'] = c['max_tokens']
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _key(c)})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: d = json.load(r)
    except urllib.error.HTTPError as e:
        raise LLMError(f'{e.code} {e.read().decode("utf-8", "ignore")[:300]}')
    try: return d['choices'][0]['message']['content'] or ''
    except Exception: raise LLMError('接口返回看不懂：' + json.dumps(d, ensure_ascii=False)[:300])


def _claude(prompt, system, model, c, timeout):
    exe = shutil.which('claude') or os.path.expanduser('~/.local/bin/claude')
    if not os.path.exists(exe): raise LLMError('找不到 claude 命令（先装 Claude Code，或者把 llm.provider 换成 deepseek）')
    args = [exe, '-p', '照系统提示处理下面的内容。' if system else prompt, '--tools', '', '--setting-sources', 'project', '--output-format', 'text']
    if model: args += ['--model', model]
    if system: args += ['--system-prompt', system]
    # 在系统临时目录里跑（不在家目录下），免得读到你自己项目里的 CLAUDE.md
    with tempfile.TemporaryDirectory(prefix='airadar-') as d:
        r = subprocess.run(args, input=prompt if system else None, capture_output=True, text=True, timeout=timeout, cwd=d)
    if r.returncode or not r.stdout.strip(): raise LLMError(f'claude 退出码 {r.returncode}：{(r.stderr or r.stdout)[-300:]}')
    return r.stdout


# dsh headless 默认只认 API key：这几项让它改用网页上登录的 DeepSeek 账号（凭据在 ~/.dsh），
# 再把工具、skill、AGENTS.md 全关掉——后台只要模型回一段文字，不让它在你电脑上动手。
DSH_PATCH = """- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-account
    model: {model}
    reasoningEffort: {effort}
""" + ''.join(f'- id: {x}\n  disabled: true\n' for x in (
    'skill-filesystem', 'tool-skill', 'agent-instructions', 'tool-bash', 'tool-fs', 'tool-fs-search', 'tool-goal', 'tool-jobs', 'tool-pwsh',
    'tool-subagent', 'tool-subagent-claude', 'tool-subagent-control', 'tool-subagent-fork', 'tool-subagent-list-agents', 'tool-todo',
    'tool-web', 'tool-workflow', 'tool-working-directory', 'mcp-resources'))


def _dsh(prompt, system, model, c, timeout):
    d = c.get('dsh') or {}
    cmd = d.get('cmd') or shutil.which('dsh')
    if not cmd: raise LLMError('找不到 dsh 命令：npm i -g @deepseek-ai/dsh 装上（要 Node 24），或者在 llm.dsh.cmd 里写它的完整路径')
    args = shlex.split(cmd) if isinstance(cmd, str) else list(cmd)
    env = dict(os.environ, DSH_TELEMETRY_DISABLED='1')
    if d.get('node_dir'): env['PATH'] = os.path.expanduser(d['node_dir']) + os.pathsep + env.get('PATH', '')
    text = f'{system}\n\n===== 下面是用户消息 =====\n\n{prompt}' if system else prompt
    with tempfile.TemporaryDirectory(prefix='airadar-dsh-') as tmp:   # 在空的临时目录里跑，读不到你项目里的文件
        patch = os.path.join(tmp, 'patch.yml')
        with open(patch, 'w', encoding='utf-8') as f: f.write(DSH_PATCH.format(model=model, effort=d.get('effort') or 'high'))
        r = subprocess.run(args + ['headless', '--patch', patch, '--json', '-'], input=text, capture_output=True, text=True,
                           errors='ignore', timeout=timeout, cwd=tmp, env=env)
    final = ''
    for line in r.stdout.splitlines():
        try: ev = json.loads(line)
        except Exception: continue
        if ev.get('type') == 'final': final = ev.get('text') or ''
    if r.returncode or not final.strip():
        err = next((l for l in reversed(r.stderr.splitlines()) if l.startswith('dsh: ') and 'subagent-claude' not in l), r.stderr.strip()[-300:])
        raise LLMError(f'dsh 退出码 {r.returncode}：{err or "没有回答（DSH 里的 DeepSeek 账号登录过期或余额不足？打开 DSH 网页看一眼）"}')
    return final


def ask(prompt, system=None, purpose='', timeout=None, tries=2):
    """问一次模型，返回文本。一过性出错（断线、限流）隔 20 秒再来一次。"""
    c = config()['llm']
    default = (c.get('dsh') or {}).get('model') or 'deepseek-flash' if c['provider'] == 'dsh' else c.get('model')
    model = (c.get('models') or {}).get(purpose) or default
    fn = {'claude': _claude, 'dsh': _dsh}.get(c['provider'], _openai)
    timeout = timeout or c.get('timeout', 900)
    for i in range(tries):
        try: return fn(prompt, system, model, c, timeout)
        except LLMError as e:
            msg = str(e)
            if i == tries - 1 or msg.startswith(('没有 API key', '找不到 claude', '找不到 dsh', '401', '402', '403')): raise
        except Exception as e:
            if i == tries - 1: raise LLMError(str(e)[:300])
        time.sleep(20)
