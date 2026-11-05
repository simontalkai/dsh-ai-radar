# macOS：开机自动在后台跑

把下面这段存成 `~/Library/LaunchAgents/com.airadar.serve.plist`，两处 `/你的路径/dsh-ai-radar` 换成仓库的绝对路径：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.airadar.serve</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string><string>-m</string><string>radar</string><string>serve</string>
  </array>
  <key>WorkingDirectory</key><string>/你的路径/dsh-ai-radar</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/你的路径/dsh-ai-radar/data/serve.log</string>
  <key>StandardErrorPath</key><string>/你的路径/dsh-ai-radar/data/serve.log</string>
</dict>
</plist>
```

然后：

```bash
mkdir -p /你的路径/dsh-ai-radar/data
launchctl load ~/Library/LaunchAgents/com.airadar.serve.plist      # 启动
launchctl unload ~/Library/LaunchAgents/com.airadar.serve.plist    # 停掉
```

- `PATH` 里要能找到 `yt-dlp`（抓视频用），用 `provider: claude` 的话还要能找到 `claude`。不在上面这几个目录的，把它们所在的目录加进去。
- API key 写在 `config.json` 里最省事。要放环境变量的话，在 `EnvironmentVariables` 里加一项 `DEEPSEEK_API_KEY`。

Linux 用 systemd 或 cron 跑 `python3 -m radar serve` 也是一样的。
