"""调模型。三种后端，在 config.json 的 llm.provider 里选：
  deepseek  DeepSeek 开放平台（默认，DSH 用户手里一般都有 key），OpenAI 兼容接口
  openai    任何 OpenAI 兼容接口：Kimi、通义、智谱、OpenRouter、本地 Ollama……填 base_url、model、key
  claude    本机 Claude Code 的 claude -p（有订阅不用 key）
所有调用都不给模型任何工具：原文只当数据，模型只回文本。
llm.models 可以按用途换模型：{"cards": "deepseek-v4-pro"}，用途有 cards（做卡片）、events（归热点事件）、score（给观点打分）、group（归议题）。"""
import os, json, time, shutil, subprocess, tempfile, urllib.request, urllib.error
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


def ask(prompt, system=None, purpose='', timeout=None, tries=2):
    """问一次模型，返回文本。一过性出错（断线、限流）隔 20 秒再来一次。"""
    c = config()['llm']
    model = (c.get('models') or {}).get(purpose) or c.get('model')
    fn = _claude if c['provider'] == 'claude' else _openai
    timeout = timeout or c.get('timeout', 900)
    for i in range(tries):
        try: return fn(prompt, system, model, c, timeout)
        except LLMError as e:
            msg = str(e)
            if i == tries - 1 or msg.startswith(('没有 API key', '找不到 claude', '401', '402', '403')): raise
        except Exception as e:
            if i == tries - 1: raise LLMError(str(e)[:300])
        time.sleep(20)
