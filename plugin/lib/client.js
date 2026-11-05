// AI 雷达 · DSH 左栏两页：「AI 大佬知识库」「AI 热点监控」。
// 写成 DSH 客户端模块的格式（window.__ModuleLoader__ + require），不用打包：sidebar.panellist 放入口，main 按同一个 key 放页面。
// 数据读本机服务 http://127.0.0.1:8790（python3 -m radar serve）。按钮只开会话、把任务填进输入框，发不发你自己点。
// 样式全部走 DSH 主题变量（--dsw-*），明暗两套自动跟着换。浏览器版（web/index.html）用的也是这一份文件。
window.__ModuleLoader__.load({
	id: "dsh-ai-radar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");
		const h = React.createElement;

		const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
		const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
		// 服务地址：浏览器版由页面注入；DSH 里默认 8790，换端口在 DSH 的开发者工具里 localStorage.setItem("airadar:api", "http://127.0.0.1:端口")
		const API = (typeof window !== "undefined" && window.__AIRADAR_API__) || lsGet("airadar:api") || "http://127.0.0.1:8790";
		const NOAPI = "读不到 AI 雷达服务（先在仓库目录运行 python3 -m radar serve）";
		const PAGE = 40;

		// ---------- 按钮给 AI 的任务：DSH 里开新会话填进输入框，浏览器版复制到剪贴板。想换成你自己的工作流就改这里 ----------
		const PROMPTS = {
			dig: (n) => `【AI 雷达 · 深挖】${n.title}

发生了什么：${n.what}
${n.why ? "为什么在热：" + n.why + "\n" : ""}出处：${n.url || "（没有）"}

先核实出处是不是一手、数字对不对，再用大白话讲清楚：这件事的来龙去脉、为什么是现在、对普通人有什么影响。最后列出你还不确定的地方。`,
			ideas: (n) => `【AI 雷达 · 出选题】${n.title}

发生了什么：${n.what}
出处：${n.url || "（没有）"}

先核实出处，再给我 3 个做内容的角度：每个一句开头、三段结构、适合做成什么形式（短视频 / 口播 / 图文）。`,
			point: (p) => `【AI 雷达 · 聊聊这个观点】${p.who || p.person} 说：${p.claim}
${p.detail || ""}
${p.quote ? "原话：" + p.quote + "\n" : ""}${p.quote_zh ? "译文：" + p.quote_zh + "\n" : ""}出处：${p.url || p.path}

先读原文核对原话和上下文，再告诉我：他凭什么这么说、谁会反对、对普通人意味着什么。最后给我 2 个拿这条做内容的角度。`,
			topic: (t) => `【AI 雷达 · 几个人在说同一件事】${t.title}
${t.angle ? "可以这么讲：" + t.angle + "\n" : ""}
${t.points.map((p) => `- ${p.who}：${p.claim}${p.url ? " " + p.url : ""}`).join("\n")}

先读这几条的原文核对，再讲清楚他们分歧在哪、各自凭什么，最后给我一个把这几种说法串成一条内容的结构。`,
		};

		const CSS = `
.ar-page{box-sizing:border-box;height:100%;overflow:auto;padding:22px 30px 48px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit)}
.ar-wrap{max-width:820px;margin:0 auto}
.ar-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:4px}
.ar-h1{margin:0;font-size:22px;font-weight:650;line-height:30px}
.ar-meta{color:var(--dsw-alias-label-tertiary);font-size:12.5px;font-variant-numeric:tabular-nums}
.ar-line{margin:6px 0 24px;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1.65}
.ar-section{margin:24px 0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:600;letter-spacing:.04em}
.ar-card{box-sizing:border-box;margin-bottom:10px;padding:14px 16px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.ar-title{margin-bottom:6px;font-size:15px;font-weight:600;line-height:1.45;color:var(--dsw-alias-label-primary)}
.ar-body{margin:4px 0;color:var(--dsw-alias-label-secondary);font-size:13.5px;line-height:1.65}
.ar-why{margin:4px 0 12px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.6}
.ar-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ar-btn{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}
.ar-btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.ar-btn:active{background:var(--dsw-alias-interactive-bg-active)}
.ar-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.ar-btn--primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.ar-btn--primary:hover{background:var(--dsw-alias-button-primary-hover)}
.ar-btn--primary:active{background:var(--dsw-alias-button-primary-hover)}
.ar-link{color:var(--dsw-alias-link);font-size:12.5px;text-decoration:none}
.ar-link:hover{text-decoration:underline}
.ar-tail{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.ar-footer{margin-top:24px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.arkb-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 10px}
.arkb-search{box-sizing:border-box;flex:1;min-width:180px;height:30px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
.arkb-search:focus{border-color:var(--dsw-alias-state-business-primary)}
.arkb-seg{display:inline-flex;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);overflow:hidden}
.arkb-seg button{height:28px;padding:0 10px;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.arkb-seg button[aria-pressed=true]{background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);font-weight:600}
.arkb-people{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px}
.arkb-chip{height:26px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l3));border-radius:999px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.arkb-chip:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.arkb-chip[aria-pressed=true]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.arkb-chip small{margin-left:4px;opacity:.6;font-variant-numeric:tabular-nums}
.arkb-who{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin-bottom:6px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.arkb-who b{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}
.arkb-topic{padding:0 6px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.arkb-quote{margin:8px 0 12px;padding:2px 0 2px 10px;border-left:2px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6}
.arkb-more{display:flex;justify-content:center;margin-top:14px}
.arkb-status{color:var(--dsw-alias-label-tertiary);font-size:12px}
.arkb-seg button small{margin-left:4px;opacity:.6;font-variant-numeric:tabular-nums}
.arkb-pickTitle{font-size:15px;font-weight:650}
.arkb-pickMeta{color:var(--dsw-alias-label-tertiary);font-size:12.5px;font-variant-numeric:tabular-nums}
.arkb-picks2{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.arkb-pick+.arkb-pick{border-top:.5px solid var(--dsw-alias-border-l1)}
.arkb-pickHead{display:flex;align-items:center;gap:8px;width:100%;min-height:42px;padding:6px 14px;border:0;background:0 0;color:inherit;font:inherit;font-size:13.5px;text-align:left;cursor:pointer}
.arkb-pickHead:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.arkb-pickHead b{flex:none;max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.arkb-pickHead .sh-tag{flex:none}
.arkb-pickLine{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.arkb-pickWhy{flex:none;max-width:16em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px}
.arkb-pick--open{background:var(--dsw-alias-bg-base)}
.arkb-pickBody{padding:4px 14px 14px}
.arkb-new{flex:none;padding:0 5px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-state-danger-primary,#e03131);color:#fff;font-size:10.5px;font-weight:600;line-height:16px}
@media (max-width:760px){.arkb-pickWhy{display:none}}
.arkb-rowLabel{align-self:center;min-width:28px;color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.arkb-scoreWrap{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.arkb-why{color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.arkb-hook{display:flex;gap:8px;margin:8px 0 12px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary)}
.arkb-hook span{flex:none;padding:0 6px;border-radius:var(--dsw-radius-xs);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary);font-size:11px;line-height:20px}
.arkb-sectionMeta{font-weight:400;letter-spacing:0}
.arkb-topicCard{border-left:2px solid var(--dsw-alias-state-business-primary)}
.arkb-linkBtn{padding:0;border:0;background:0 0;color:var(--dsw-alias-link);font:inherit;font-size:12px;cursor:pointer}
.arkb-picks{margin:10px 0 12px;padding:0;list-style:none}
.arkb-picks li+li{margin-top:6px}
.arkb-picks b{flex:none;font-weight:600}
.arkb-picks span:not(.sh-tag){flex:1;color:var(--dsw-alias-label-secondary)}
.sh-page{box-sizing:border-box;height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);-webkit-font-smoothing:antialiased;container-type:inline-size;--sh-accent:var(--dsw-alias-state-business-primary);--sh-hot:var(--dsw-alias-state-danger-primary,#e03131);--sh-line:var(--dsw-alias-border-l1);--sh-card:var(--dsw-alias-bg-layer-1);--sh-t2:var(--dsw-alias-label-secondary);--sh-t3:var(--dsw-alias-label-tertiary);--sh-fill:var(--dsw-alias-fill-l2)}
.sh-wrap{max-width:1160px;margin:0 auto;padding:30px 32px 72px}
.sh-page svg{flex:none}
.sh-top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px 20px}
.sh-eyebrow{display:flex;align-items:center;gap:8px;color:var(--sh-t3);font-size:12px;font-variant-numeric:tabular-nums}
.sh-pulse{position:relative;width:7px;height:7px;border-radius:50%;background:var(--sh-accent)}
.sh-pulse:after{content:"";position:absolute;inset:-4px;border:1.5px solid var(--sh-accent);border-radius:50%;opacity:0;animation:sh-ping 2.4s ease-out infinite}
.sh-pulse--busy{background:var(--dsw-alias-link,#1971c2)}.sh-pulse--busy:after{border-color:var(--dsw-alias-link,#1971c2);animation-duration:1.2s}
@keyframes sh-ping{0%{transform:scale(.4);opacity:.8}100%{transform:scale(1.7);opacity:0}}
@keyframes sh-spin{to{transform:rotate(360deg)}}
.sh-h1{margin:6px 0 0;font-size:26px;font-weight:700;line-height:34px;letter-spacing:-.015em}
.sh-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.sh-srcs{display:flex;flex-wrap:wrap;gap:2px;padding:3px;border:.5px solid var(--sh-line);border-radius:999px;background:var(--sh-card)}
.sh-src{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;color:var(--sh-t2);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.sh-src i{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.sh-src b{font-weight:600;color:var(--dsw-alias-label-primary)}
.sh-src--bad,.sh-src--bad b{color:var(--sh-hot)}.sh-src--bad i{background:var(--sh-hot)}
.sh-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 13px;border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--sh-card);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;white-space:nowrap;cursor:pointer;transition:background .15s}
.sh-btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.sh-btn[disabled]{cursor:default;color:var(--sh-t2)}.sh-btn[disabled] svg{animation:sh-spin 1s linear infinite}
.sh-btn:focus-visible,.sh-act:focus-visible,.sh-row:focus-visible,.sh-kpi:focus-visible,.sh-seg button:focus-visible,.sh-chip:focus-visible{outline:2px solid var(--sh-accent);outline-offset:2px}
.sh-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:22px;border:.5px solid var(--sh-line);border-radius:16px;background:var(--sh-card);overflow:hidden}
.sh-kpi{min-width:0;padding:15px 18px 14px;border:0;background:none;color:inherit;font:inherit;text-align:left;transition:background .15s}
.sh-kpi+.sh-kpi{border-left:.5px solid var(--sh-line)}
button.sh-kpi{cursor:pointer}button.sh-kpi:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-kpi[aria-pressed=true]{background:color-mix(in srgb,var(--sh-accent) 8%,transparent)}
.sh-kpiLabel{display:flex;align-items:center;gap:6px;color:var(--sh-t3);font-size:12px}
.sh-kpiVal{margin-top:6px;overflow:hidden;font-size:25px;font-weight:700;line-height:30px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
.sh-kpiVal small{margin-left:3px;color:var(--sh-t3);font-size:13px;font-weight:500;letter-spacing:0}
.sh-kpiVal--accent{color:var(--sh-accent)}
.sh-kpiSub{margin-top:3px;overflow:hidden;color:var(--sh-t2);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.sh-bar{position:sticky;top:0;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:18px -32px 0;padding:10px 32px;border-bottom:.5px solid var(--sh-line);background:color-mix(in srgb,var(--dsw-alias-bg-base) 84%,transparent);-webkit-backdrop-filter:saturate(1.5) blur(12px);backdrop-filter:saturate(1.5) blur(12px)}
.sh-seg{display:inline-flex;padding:2px;border-radius:10px;background:var(--sh-fill)}
.sh-seg button{height:26px;padding:0 11px;border:0;border-radius:8px;background:none;color:var(--sh-t2);font:inherit;font-size:12.5px;font-variant-numeric:tabular-nums;cursor:pointer;transition:background .15s,color .15s}
.sh-seg button[aria-pressed=true]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 .5px var(--sh-line)}
.sh-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:none;color:var(--sh-t2);font:inherit;font-size:12.5px;white-space:nowrap;cursor:pointer;transition:all .15s}
.sh-chip:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.sh-chip[aria-pressed=true]{border-color:color-mix(in srgb,var(--sh-accent) 45%,transparent);background:color-mix(in srgb,var(--sh-accent) 10%,transparent);color:var(--sh-accent);font-weight:600}
.sh-search{position:relative;margin-left:auto;display:flex;align-items:center}
.sh-search svg{position:absolute;left:11px;color:var(--sh-t3);pointer-events:none}
.sh-search input{box-sizing:border-box;width:230px;height:30px;padding:0 12px 0 31px;border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--sh-card);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none;transition:border-color .15s,box-shadow .15s}
.sh-search input:focus{border-color:var(--sh-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sh-accent) 16%,transparent)}
.sh-sec{margin-top:34px}
.sh-secHead{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:12px}
.sh-secTitle{margin:0;font-size:15px;font-weight:700;letter-spacing:-.005em}
.sh-secCount{color:var(--sh-t3);font-size:12.5px;font-variant-numeric:tabular-nums}
.sh-secNote{margin-left:auto;color:var(--sh-t3);font-size:12px}
.sh-card{box-sizing:border-box;min-width:0;border:.5px solid var(--sh-line);border-radius:16px;background:var(--sh-card);transition:border-color .18s,box-shadow .18s}
.sh-card--hover:hover{border-color:var(--dsw-alias-border-l3);box-shadow:0 10px 28px -16px rgba(0,0,0,.22)}
.sh-lead{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);overflow:hidden}
.sh-leadMain{padding:22px 24px 16px}
.sh-leadSide{padding:18px 20px;border-left:.5px solid var(--sh-line);background:color-mix(in srgb,var(--sh-fill) 45%,transparent)}
.sh-sideTitle{margin-bottom:8px;color:var(--sh-t3);font-size:12px;font-weight:600}
.sh-evTop{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.sh-rank{color:var(--sh-t3);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.sh-evTitle{margin:8px 0 0;font-size:16.5px;font-weight:700;line-height:1.42;letter-spacing:-.005em}
.sh-lead .sh-evTitle{margin-top:10px;font-size:22px;line-height:1.35;letter-spacing:-.015em}
.sh-evWhat{margin:8px 0 0;color:var(--sh-t2);font-size:13.5px;line-height:1.7}
.sh-lead .sh-evWhat{font-size:14.5px}
.sh-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sh-clamp4{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.sh-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:14px;color:var(--sh-t3);font-size:12px;font-variant-numeric:tabular-nums}
.sh-meta a{color:var(--dsw-alias-link);text-decoration:none}.sh-meta a:hover{text-decoration:underline}
.sh-stat{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.sh-stat svg{opacity:.75}
.sh-meter{display:inline-block;width:52px;height:4px;overflow:hidden;border-radius:2px;background:var(--sh-fill);vertical-align:middle}
.sh-meter i{display:block;height:100%;border-radius:2px;background:var(--sh-accent)}
.sh-tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;background:var(--sh-fill);color:var(--sh-t2);font-size:11.5px;white-space:nowrap}
.sh-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:6px;font-size:11.5px;font-weight:600;white-space:nowrap}
.sh-badge--new{background:color-mix(in srgb,var(--sh-hot) 11%,transparent);color:var(--sh-hot)}
.sh-badge--new:before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.sh-badge--up{background:color-mix(in srgb,var(--sh-hot) 8%,transparent);color:var(--sh-hot)}
.sh-badge--down{background:var(--sh-fill);color:var(--sh-t3)}
.sh-acts{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin:12px 0 0 -8px}
.sh-act{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:0;border-radius:8px;background:none;color:var(--sh-t2);font:inherit;font-size:12.5px;white-space:nowrap;text-decoration:none;cursor:pointer;transition:background .15s,color .15s}
.sh-act:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sh-act--primary{color:var(--sh-accent);font-weight:600}.sh-act--primary:hover{color:var(--sh-accent)}
.sh-act--sm{height:24px;padding:0 6px;font-size:12px}
.sh-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.sh-evCard{padding:16px 18px 12px}
.sh-srcList{margin:0;padding:0;list-style:none}
.sh-srcList li{display:flex;align-items:flex-start;gap:9px;padding:6px 0;font-size:12.5px;line-height:1.5}
.sh-srcList li+li{border-top:.5px solid var(--sh-line)}
.sh-srcIco{display:inline-flex;flex:none;align-items:center;justify-content:center;width:20px;height:20px;margin-top:-1px;border-radius:6px;background:var(--sh-fill);color:var(--sh-t2);font-size:11px;font-weight:700}
.sh-srcList a,.sh-srcList span.sh-srcText{flex:1;min-width:0;color:var(--sh-t2);text-decoration:none}
.sh-srcList a:hover{color:var(--dsw-alias-link)}
.sh-srcList small{display:block;margin-top:1px;color:var(--sh-t3);font-size:11.5px}
.sh-evCard .sh-srcList{margin-top:10px;padding-top:4px;border-top:.5px solid var(--sh-line)}
.sh-more{display:flex;justify-content:center;margin-top:14px}
.sh-table{overflow:hidden}
.sh-row{display:grid;grid-template-columns:22px minmax(80px,110px) 128px 168px 96px minmax(0,1fr);align-items:center;gap:16px;width:100%;box-sizing:border-box;padding:11px 18px;border:0;border-top:.5px solid var(--sh-line);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .15s}
.sh-row:first-child{border-top:0}
.sh-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-row[aria-pressed=true]{background:color-mix(in srgb,var(--sh-accent) 8%,transparent)}
.sh-row--head{padding-top:9px;padding-bottom:9px;color:var(--sh-t3);font-size:11.5px;cursor:default}
.sh-row--head:hover{background:none}
.sh-rowRank{color:var(--sh-t3);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}
.sh-rowName{overflow:hidden;font-size:14px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}
.sh-rowHeat{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.sh-rowHeat .sh-meter{width:64px}
.sh-trio{display:flex;gap:4px}
.sh-trio span{min-width:38px;padding:0 6px;border-radius:6px;background:var(--sh-fill);color:var(--sh-t3);font-size:11px;line-height:20px;font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap}
.sh-trio span.on{background:color-mix(in srgb,var(--sh-accent) 12%,transparent);color:var(--sh-accent);font-weight:600}
.sh-spark{display:block;width:96px;height:24px;color:var(--sh-accent)}
.sh-sparkNone{color:var(--sh-t3);font-size:11px}
.sh-rowTop{overflow:hidden;color:var(--sh-t2);font-size:12.5px;text-overflow:ellipsis;white-space:nowrap}
.sh-boards{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:13px 18px;color:var(--sh-t2);font-size:13px}
.sh-boardItem{display:inline-flex;align-items:center;gap:8px}
.sh-boardItem b{color:var(--sh-t3);font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums}
.sh-empty{margin:0;color:var(--sh-t3);font-size:13px;line-height:1.6}
.sh-cols{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px;align-items:start}
.sh-post{padding:15px 18px 10px}
.sh-post+.sh-post{border-top:.5px solid var(--sh-line)}
.sh-postHead{display:flex;align-items:center;gap:8px;min-width:0}
.sh-ava{display:inline-flex;flex:none;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--sh-fill);color:var(--sh-t2);font-size:13px;font-weight:700}
.sh-ava--官方{background:color-mix(in srgb,var(--sh-accent) 16%,transparent);color:var(--sh-accent)}
.sh-ava--一手{background:color-mix(in srgb,var(--dsw-alias-link,#1971c2) 14%,transparent);color:var(--dsw-alias-link,#1971c2)}
.sh-who{flex:1;min-width:0;line-height:1.3}
.sh-who b{display:block;overflow:hidden;font-size:13.5px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}
.sh-who span{color:var(--sh-t3);font-size:11.5px}
.sh-time{flex:none;color:var(--sh-t3);font-size:11.5px;font-variant-numeric:tabular-nums}
.sh-postText{margin:9px 0 0 38px;color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:1.62;white-space:pre-wrap;word-break:break-word}
.sh-quote{margin:8px 0 0 38px;padding:7px 10px;border-radius:10px;background:var(--sh-fill);color:var(--sh-t2);font-size:12.5px;line-height:1.55}
.sh-postFoot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:8px 0 0 38px;color:var(--sh-t3);font-size:12px;font-variant-numeric:tabular-nums}
.sh-vel{color:var(--sh-accent);font-weight:650}
.sh-postFoot .sh-actsInline{display:flex;gap:0;margin-left:auto;opacity:.55;transition:opacity .15s}
.sh-post:hover .sh-actsInline,.sh-news li:hover .sh-actsInline,.sh-actsInline:focus-within{opacity:1}
.sh-news{margin:0;padding:6px 0;list-style:none}
.sh-news li{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:12px;padding:10px 16px 10px 18px}
.sh-news li+li{border-top:.5px solid var(--sh-line)}
.sh-newsTime{padding-top:2px;color:var(--sh-t3);font-size:11.5px;font-variant-numeric:tabular-nums}
.sh-newsTitle{color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:1.5;text-decoration:none}
.sh-newsTitle:hover{color:var(--dsw-alias-link)}
.sh-newsMeta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-top:4px;color:var(--sh-t3);font-size:11.5px}
.sh-news .sh-actsInline{align-self:start;opacity:.55;transition:opacity .15s}
.sh-foot{margin-top:36px;color:var(--sh-t3);font-size:12px;line-height:1.7}
.sh-foot a{color:var(--dsw-alias-link);text-decoration:none}
.sh-err{color:var(--sh-hot);font-size:12.5px}
@container (max-width:900px){.sh-row{grid-template-columns:22px minmax(72px,110px) minmax(0,1fr) 168px}.sh-row>:nth-child(5),.sh-row>:nth-child(6){display:none}}
@container (max-width:820px){.sh-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sh-kpi:nth-child(3){border-left:0}.sh-kpi:nth-child(n+3){border-top:.5px solid var(--sh-line)}.sh-lead{grid-template-columns:minmax(0,1fr)}.sh-leadSide{border-left:0;border-top:.5px solid var(--sh-line)}.sh-grid2,.sh-cols{grid-template-columns:minmax(0,1fr)}.sh-search{margin-left:0;flex:1}.sh-search input{width:100%}}
@container (max-width:560px){.sh-wrap{padding:22px 16px 56px}.sh-bar{margin:18px -16px 0;padding:10px 16px}.sh-row{grid-template-columns:20px minmax(64px,96px) minmax(0,1fr);gap:10px}.sh-row>:nth-child(4){display:none}.sh-postText,.sh-postFoot,.sh-quote{margin-left:0}}
.sh-h-green{--hue:#2f9e44}
.sh-h-blue{--hue:#1971c2}
.sh-h-red{--hue:#e03131}
.sh-h-orange{--hue:#e8590c}
.sh-h-amber{--hue:#e67700}
.sh-h-violet{--hue:#6741d9}
.sh-h-cyan{--hue:#0c8599}
.sh-h-grape{--hue:#9c36b5}
.sh-h-pink{--hue:#c2255c}
.sh-h-indigo{--hue:#3b5bdb}
.sh-h-teal{--hue:#099268}
.sh-h-gray{--hue:#868e96}
.sh-h-ink{--hue:#343a40}
body[data-ds-dark-theme] .sh-h-green{--hue:#69db7c}
body[data-ds-dark-theme] .sh-h-blue{--hue:#74c0fc}
body[data-ds-dark-theme] .sh-h-red{--hue:#ff8787}
body[data-ds-dark-theme] .sh-h-orange{--hue:#ffa94d}
body[data-ds-dark-theme] .sh-h-amber{--hue:#ffd43b}
body[data-ds-dark-theme] .sh-h-violet{--hue:#b197fc}
body[data-ds-dark-theme] .sh-h-cyan{--hue:#66d9e8}
body[data-ds-dark-theme] .sh-h-grape{--hue:#e599f7}
body[data-ds-dark-theme] .sh-h-pink{--hue:#faa2c1}
body[data-ds-dark-theme] .sh-h-indigo{--hue:#91a7ff}
body[data-ds-dark-theme] .sh-h-teal{--hue:#63e6be}
body[data-ds-dark-theme] .sh-h-gray{--hue:#adb5bd}
body[data-ds-dark-theme] .sh-h-ink{--hue:#dee2e6}
.sh-tint{background:color-mix(in srgb,var(--hue) 11%,transparent)!important;color:var(--hue)!important}
.sh-dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--hue)}
.sh-icoTile{display:inline-flex;flex:none;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:color-mix(in srgb,var(--hue) 13%,transparent);color:var(--hue)}
.sh-secHead .sh-icoTile{align-self:center;margin-right:-2px}
.sh-lead{position:relative;background:linear-gradient(160deg,color-mix(in srgb,var(--hue) 7%,var(--sh-card)) 0,var(--sh-card) 46%)}
.sh-lead:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--hue),color-mix(in srgb,var(--hue) 25%,transparent))}
.sh-lead .sh-leadSide{background:color-mix(in srgb,var(--sh-card) 70%,transparent)}
.sh-evCard{position:relative}
.sh-evCard .sh-rank{display:inline-flex;align-items:center;gap:6px}
.sh-kpiVal--hue{color:var(--hue)}
.sh-meter i{background:linear-gradient(90deg,#fab005,#fd7e14 55%,#f03e3e)!important;background-repeat:no-repeat!important}
.sh-trio span.on{background:color-mix(in srgb,var(--hue) 12%,transparent)!important;color:var(--hue)!important}
.sh-row .sh-spark{color:var(--hue)}
.sh-rowName{display:flex;align-items:center;gap:8px}
.sh-srcIco.sh-tint{font-weight:700}
.sh-ava.sh-tint{font-weight:700}
.sh-vel{color:var(--sh-accent)}
.sh-isDone{opacity:.78}
.sh-isDone:hover{opacity:1}
.sh-pips{display:inline-flex;gap:2px}
.sh-pips i{width:5px;height:11px;border-radius:2px;background:color-mix(in srgb,var(--hue) 20%,transparent)}
.sh-pips i.on{background:var(--hue)}
.sh-advice{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:12px;padding:8px 11px;border-radius:10px;background:color-mix(in srgb,var(--hue) 8%,transparent);color:var(--sh-t2);font-size:12.5px;line-height:1.5}
.sh-adviceK{color:var(--hue);font-weight:650;white-space:nowrap}
.sh-adviceWhy{min-width:0;flex:1}
.sh-adviceLink{color:var(--dsw-alias-link);text-decoration:none;white-space:nowrap}.sh-adviceLink:hover{text-decoration:underline}
.sh-drawerWrap{position:fixed;inset:0;z-index:50}
.sh-drawerMask{position:absolute;inset:0;background:rgba(15,15,15,.22);animation:sh-fade .18s ease-out}
.sh-drawer{position:absolute;top:0;right:0;bottom:0;box-sizing:border-box;width:min(480px,94vw);overflow:auto;padding:18px 24px 32px;border-left:.5px solid var(--sh-line);background:var(--dsw-alias-bg-base);box-shadow:-24px 0 48px -24px rgba(0,0,0,.28);animation:sh-slide .22s cubic-bezier(.2,.8,.2,1)}
.sh-drawer:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--hue),color-mix(in srgb,var(--hue) 20%,transparent))}
@keyframes sh-slide{from{transform:translateX(24px);opacity:0}}
@keyframes sh-fade{from{opacity:0}}
.sh-drawerTop{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.sh-tlSum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 0 6px;border:.5px solid var(--sh-line);border-radius:12px;background:var(--sh-card);overflow:hidden}
.sh-tlSum>div{padding:10px 12px;min-width:0}.sh-tlSum>div+div{border-left:.5px solid var(--sh-line)}
.sh-tlSum small{display:block;color:var(--sh-t3);font-size:11.5px}
.sh-tlSum b{display:block;margin-top:2px;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-tlGap b{color:var(--dsw-alias-link,#1971c2)}
.sh-tl{position:relative;margin:14px 0 0;padding:0 0 0 22px;list-style:none}
.sh-tl:before{content:"";position:absolute;top:6px;bottom:6px;left:6px;width:1.5px;background:var(--sh-line)}
.sh-tlItem{position:relative;padding:8px 0 12px}
.sh-tlNode{position:absolute;top:13px;left:-20px;width:9px;height:9px;border-radius:50%;background:var(--hue);box-shadow:0 0 0 3px var(--dsw-alias-bg-base)}
.sh-tlHead{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;color:var(--sh-t3);font-size:12px}
.sh-tlHead b{color:var(--dsw-alias-label-primary);font-size:12.5px;font-variant-numeric:tabular-nums}
.sh-tlBody{margin:5px 0 0;color:var(--sh-t2);font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.sh-tlLink{display:inline-block;margin-top:4px;color:var(--dsw-alias-link);font-size:12px;text-decoration:none}
.sh-tlSplit{position:relative;margin:4px 0 8px -22px;padding-left:22px;color:var(--dsw-alias-link,#1971c2);font-size:12px;font-weight:600}
.sh-tlSplit span{display:inline-block;padding:2px 10px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-link,#1971c2) 10%,transparent)}
.sh-devGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.sh-devCol{padding:14px 16px 8px}
.sh-devHead{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13.5px;font-weight:650}
.sh-devHead small{margin-left:auto;color:var(--sh-t3);font-size:11.5px;font-weight:400}
.sh-devList{margin:0;padding:0;list-style:none}
.sh-devList li{padding:9px 0}.sh-devList li+li{border-top:.5px solid var(--sh-line)}
.sh-devTitle{display:block;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.45;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}
.sh-devTitle:hover{color:var(--dsw-alias-link)}
.sh-devDesc{margin:3px 0 0;color:var(--sh-t2);font-size:12px;line-height:1.5}
.sh-devMeta{display:flex;align-items:center;gap:10px;margin-top:4px;color:var(--sh-t3);font-size:11.5px;font-variant-numeric:tabular-nums}
.sh-devTalk{color:inherit;text-decoration:none}.sh-devTalk:hover{color:var(--dsw-alias-link);text-decoration:underline}
.sh-devMeta .sh-actsInline{margin-left:auto;opacity:.55;transition:opacity .15s}
.sh-devList li:hover .sh-actsInline{opacity:1}
@container (max-width:900px){.sh-devGrid{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){.sh-drawer,.sh-drawerMask{animation:none}}
@media (prefers-reduced-motion:reduce){.sh-pulse:after,.sh-btn[disabled] svg{animation:none}}
.arkb-picks li{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px;font-size:13px;line-height:1.55}
.arkb-picks li b{flex:none;font-weight:600}

`;
		// 在 factory 里插 <style>：模块系统会把这条 style 记在插件名下，停用/热更时一起收走
		const ensureStyles = () => {
			if (typeof document === "undefined") return;
			const id = "dsh-ai-radar-styles";
			let el = document.getElementById(id);
			if (!el) {
				el = document.createElement("style");
				el.id = id;
				(document.head || document.documentElement).appendChild(el);
			}
			if (el.textContent !== CSS) el.textContent = CSS;
		};
		ensureStyles();

		const getJson = (path) => fetch(API + path).then((r) => r.json());
		const postJson = (path, body) => fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json());
		const useMeta = () => {
			const [m, setM] = React.useState(null);
			React.useEffect(() => { getJson("/api/meta").then(setM).catch(() => {}); }, []);
			return m;
		};

		function Btn({ primary, onClick, children, title }) {
			return h("button", { type: "button", title, className: "ar-btn" + (primary ? " ar-btn--primary" : ""), onClick }, children);
		}

		// ---------- 颜色：只用来区分——公司一个色、事件类型一个色、来源一个色，大块底色还是白 ----------
		const ENT_HUE = { OpenAI: "teal", Anthropic: "orange", 谷歌: "blue", DeepSeek: "indigo", Kimi: "violet", 阿里: "amber", 字节: "cyan", 腾讯: "pink",
			智谱: "grape", MiniMax: "pink", 英伟达: "green", 马斯克: "ink", Meta: "blue", 苹果: "gray", 微软: "cyan", Cursor: "ink", 华为: "red",
			机器人: "amber", 自动驾驶: "teal", 芯片算力: "green" };
		const KIND_HUE = { 发布: "green", 产品更新: "blue", 融资: "amber", 财报: "amber", 争议: "red", 人事: "violet", 研究: "cyan", 政策: "grape" };
		const SRC_HUE = { hot: "orange", x: "ink", media: "blue", dev: "violet" };
		const SRC_ICO = { x: "𝕏", media: "报", hot: "榜", dev: "社" };
		const PALETTE = ["teal", "orange", "blue", "indigo", "violet", "amber", "cyan", "pink", "grape", "green"];
		const scoreHue = (n) => (n >= 4 ? "green" : n === 3 ? "amber" : "gray");
		const entHue = (name) => ENT_HUE[name] || PALETTE[[...String(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
		const hueCls = (hue) => "sh-h-" + (hue || "gray");

		// ======================= AI 大佬知识库 =======================
		// 卡片是后台每天做好的 Markdown（radar/cards.py），这里按条看观点：谁说的、原话、值不值得做（radar/kb.py 打的 1–5 分）。
		// 默认「精选」10/20/30 条：先放几个人在说同一件事的议题（最多三分之一），再放 3 分以上的单条，一张卡最多 1 条、一个人最多 2 条。
		const KB_ID = "airadar-kb";
		const Score = ({ s }) => (s ? h("span", { className: "sh-tag sh-tint " + hueCls(scoreHue(s)), title: "值不值得做（1–5）" }, "值得做 " + s) : null);

		// 同一个人换张卡说同一件事：去掉人名、常用字后按字重合算，≥0.45 算一件事
		const KB_STOP = new Set("的了是在和也都说认为觉得要会就这那一个不有人们他她它对把被而且但官方宣布推号".split(""));
		const kbToks = (who, s) => {
			let t = String(s || "");
			String(who || "").split(/\s+/).concat([who]).filter(Boolean).forEach((w) => { t = t.split(w).join(""); });
			const out = new Set((t.match(/[一-鿿]/g) || []).filter((c) => !KB_STOP.has(c)));
			(t.match(/[A-Za-z][A-Za-z0-9.]+/g) || []).forEach((w) => out.add(w.toLowerCase()));
			return out;
		};
		const sameThing = (who, a, b) => {
			const A = kbToks(who, a), B = kbToks(who, b);
			let k = 0; A.forEach((x) => { if (B.has(x)) k++; });
			return k / Math.max(1, Math.min(A.size, B.size)) >= 0.45;
		};
		function digest(points, issues, n, since, used) {
			const isFresh = (d) => !since || d >= since;
			const iss = issues.filter((t) => !used[t.id + ":" + t.title] && t.points.some((p) => isFresh(p.date))).slice(0, Math.max(1, Math.round(n / 3)));
			const inIssue = new Set();
			iss.forEach((t) => t.points.forEach((p) => inIssue.add(p.key)));
			const pool = points.filter((p) => p.sc && p.sc.s >= 3 && !used[p.key] && !inIssue.has(p.key))
				.sort((a, b) => b.sc.s - a.sc.s || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
			const perCard = {}, perWho = {}, singles = [];
			for (const p of pool) {
				if (iss.length + singles.length >= n) break;
				const w = p.who || p.person;
				if (perCard[p.path] || (perWho[w] || 0) >= 2 || singles.some((x) => (x.who || x.person) === w && sameThing(w, x.claim, p.claim))) continue;
				perCard[p.path] = 1; perWho[w] = (perWho[w] || 0) + 1; singles.push(p);
			}
			return { iss, singles };
		}

		// 「用过了」只存在这台浏览器里：标了的不再进精选
		const USED_KEY = "airadar:used";
		const readUsed = () => { try { return JSON.parse(lsGet(USED_KEY) || "{}") || {}; } catch (e) { return {}; } };
		const KB_SEEN = "airadar:kbSeenTs";

		function PickRow({ p, isNew, open, onToggle, children }) {
			return h("div", { className: "arkb-pick" + (open ? " arkb-pick--open" : "") },
				h("button", { type: "button", className: "arkb-pickHead", "aria-expanded": open, onClick: onToggle },
					isNew ? h("span", { className: "arkb-new" }, "新") : null,
					h("b", null, p.who || p.person),
					h(Score, { s: p.sc && p.sc.s }),
					h("span", { className: "arkb-pickLine" }, (p.sc && p.sc.hook) || p.claim),
					p.sc && p.sc.why ? h("span", { className: "arkb-pickWhy" }, p.sc.why) : null),
				open ? h("div", { className: "arkb-pickBody" }, children) : null);
		}

		function TopicCard({ t, start, used, toggleUsed }) {
			const [open, setOpen] = React.useState(false);
			const uk = t.id + ":" + t.title;
			return h("div", { className: "ar-card arkb-topicCard" },
				h("div", { className: "ar-title" }, t.title),
				t.angle ? h("p", { className: "ar-body" }, t.angle) : null,
				h("div", { className: "arkb-who", style: { marginTop: 8 } },
					t.people.map((n) => h("span", { key: n, className: "sh-tag sh-tint " + hueCls(entHue(n)) }, n)),
					h("button", { type: "button", className: "arkb-linkBtn", "aria-expanded": open, onClick: () => setOpen(!open) }, open ? "收起" : `看 ${t.points.length} 条观点`)),
				open ? h("ul", { className: "arkb-picks" }, t.points.map((p) => h("li", { key: p.key },
					h("b", null, p.who), h("span", null, p.claim), h(Score, { s: p.s }),
					p.url ? h("a", { href: p.url, target: "_blank", rel: "noreferrer", className: "ar-link" }, "原文") : null))) : null,
				h("div", { className: "ar-row", style: { marginTop: 12 } },
					h(Btn, { primary: true, onClick: () => start(PROMPTS.topic(t)) }, "聊聊这件事"),
					h(Btn, { onClick: () => toggleUsed(uk) }, used[uk] ? "取消用过" : "标成用过")));
		}

		function KbPage({ start }) {
			const meta = useMeta();
			const [days, setDays] = React.useState(3);
			const [data, setData] = React.useState(null);
			const [err, setErr] = React.useState("");
			const [mode, setMode] = React.useState("pick");
			const [n, setN] = React.useState(10);
			const [who, setWho] = React.useState("");
			const [topic, setTopic] = React.useState("");
			const [sort, setSort] = React.useState("score");
			const [q, setQ] = React.useState("");
			const [shown, setShown] = React.useState(PAGE);
			const [allPeople, setAllPeople] = React.useState(false);
			const [allTopics, setAllTopics] = React.useState(false);
			const [allIssues, setAllIssues] = React.useState(false);
			const [since] = React.useState(() => Number(lsGet(KB_SEEN)) || 0);   // 打开页面那一刻读上次看到哪
			const [openKey, setOpenKey] = React.useState("");
			const [used, setUsed] = React.useState(readUsed);
			const toggleUsed = (k) => {
				const u = Object.assign({}, used);
				if (u[k]) delete u[k]; else u[k] = Date.now();
				setUsed(u); lsSet(USED_KEY, JSON.stringify(u));
			};
			const load = React.useCallback(() => {
				setErr("");
				getJson(`/api/cards?days=${days}`).then(setData).catch((e) => setErr(NOAPI + "：" + String(e)));
			}, [days]);
			React.useEffect(load, [load]);
			React.useEffect(() => { if (data && data.cards) lsSet(KB_SEEN, String(Math.floor(Date.now() / 1000))); }, [data]);
			React.useEffect(() => setShown(PAGE), [days, who, q, topic, sort, mode]);
			const picking = !!(data && data.picking);
			React.useEffect(() => {   // 在打分的时候 10 秒读一次，打完自动出分
				if (!picking) return;
				const t = setInterval(load, 10000);
				return () => clearInterval(t);
			}, [picking, load]);
			const pickNow = () => postJson("/api/cards/pick").then(load).catch((e) => setErr(String(e)));

			const points = React.useMemo(() => {
				const out = [];
				((data && data.cards) || []).forEach((c) => (c.points || []).forEach((p) => out.push(Object.assign({}, p, {
					person: c.person, source: c.source, kind: c.kind, date: c.date, mtime: c.mtime || 0, url: c.url, path: c.path, topics: c.topics || [], cardTitle: c.title,
					sc: ((data && data.scores) || {})[p.key] || null,
				}))));
				return out;
			}, [data]);
			const unscored = points.filter((p) => !p.sc).length;
			const issues = (data && data.topics && data.topics.items) || [];
			const isNew = (p) => !!since && p.mtime > since;   // 头一回打开不标，免得满屏都是新
			const daySeg = h("div", { key: "days", className: "arkb-seg", role: "group", "aria-label": "时间范围" },
				[3, 7, 14, 30].map((d) => h("button", { key: d, type: "button", "aria-pressed": days === d, onClick: () => setDays(d) }, d === 3 ? "3 天" : d === 7 ? "一周" : d === 14 ? "两周" : "一个月")));
			const pointBody = (p) => [
				h("div", { key: "w", className: "arkb-who" },
					h("b", null, p.who || p.person),
					h("span", null, [p.source || p.person, p.kind !== p.source ? p.kind : "", p.date].filter(Boolean).join(" · ")),
					p.topics.slice(0, 3).map((t) => h("span", { key: t, className: "arkb-topic" }, t)),
					p.sc ? h("span", { className: "arkb-scoreWrap" }, h(Score, { s: p.sc.s }), p.sc.why ? h("span", { className: "arkb-why" }, p.sc.why) : null) : null),
				h("div", { key: "c", className: "ar-title" }, p.claim),
				p.detail ? h("p", { key: "d", className: "ar-body" }, p.detail) : null,
				p.quote_zh ? h("p", { key: "q", className: "arkb-quote", title: p.quote }, "“" + p.quote_zh.replace(/\s*https?:\/\/\S+/g, "") + "”") : null,
				p.sc && p.sc.hook ? h("p", { key: "hk", className: "arkb-hook" }, h("span", null, "可以这样开头"), p.sc.hook) : null,
				h("div", { key: "act", className: "ar-row" },
					h(Btn, { primary: true, onClick: () => start(PROMPTS.point(p)) }, "聊聊这条"),
					h(Btn, { onClick: () => toggleUsed(p.key) }, used[p.key] ? "取消用过" : "标成用过"),
					p.url ? h("a", { href: p.url, target: "_blank", rel: "noreferrer", className: "ar-link" }, "原文") : null,
					h("span", { className: "ar-tail", title: p.path }, p.cardTitle))];

			const children = [
				h("div", { key: "head", className: "ar-head" },
					h("h1", { className: "ar-h1" }, "AI 大佬知识库"),
					h("div", { className: "ar-row" },
						h("span", { className: "ar-meta" }, data ? `${data.since} 起 · ${(data.cards || []).length} 张卡 · ${points.length} 条观点` : ""),
						picking ? h("span", { className: "arkb-status" }, "● 在挑题（打分、归议题，几分钟）")
							: h(Btn, { onClick: pickNow }, unscored ? `给 ${unscored} 条新观点打分` : "重新归议题"))),
			];
			if (err) children.push(h("p", { key: "err", className: "ar-line" }, err, " ", h(Btn, { onClick: load }, "再试一次")));
			else if (!data) children.push(h("p", { key: "ld", className: "ar-line" }, "在读知识库…"));
			else if (!(data.cards || []).length) children.push(h("p", { key: "empty", className: "ar-line" },
				`最近 ${days} 天还没有卡片。第一次用先在仓库目录运行 python3 -m radar cards run（抓 3 天、做 25 张，十来分钟），或者换个更长的时间范围。`, " ", daySeg));
			else if (mode === "pick") {
				const dg = digest(points, issues, n, data.since, used);
				const fresh = points.filter(isNew).length;
				children.push(h("div", { key: "pickBar", className: "arkb-bar" },
					h("span", { className: "arkb-pickTitle" }, "精选"),
					h("span", { className: "arkb-pickMeta" }, `从 ${points.length} 条里挑 ${dg.iss.length + dg.singles.length} 条` + (fresh ? ` · 上次看过之后新进 ${fresh} 条` : "")),
					h("div", { className: "arkb-seg", role: "group", "aria-label": "挑几条", style: { marginLeft: "auto" } },
						[10, 20, 30].map((v) => h("button", { key: v, type: "button", "aria-pressed": n === v, onClick: () => setN(v) }, v + " 条"))),
					daySeg));
				if (unscored && !dg.singles.length) children.push(h("p", { key: "wait", className: "ar-line" }, `这 ${unscored} 条还没打分，点右上「给新观点打分」，几分钟后这里就有精选。`));
				if (dg.iss.length) {
					children.push(h("div", { key: "issH", className: "ar-section" }, "几个人在说同一件事"));
					dg.iss.forEach((t) => children.push(h(TopicCard, { key: t.id + t.title, t, start, used, toggleUsed })));
				}
				if (dg.singles.length) {
					children.push(h("div", { key: "sgH", className: "ar-section" }, "单条观点"));
					children.push(h("div", { key: "sg", className: "arkb-picks2" }, dg.singles.map((p) => h(PickRow, {
						key: p.key, p, isNew: isNew(p), open: openKey === p.key, onToggle: () => setOpenKey(openKey === p.key ? "" : p.key) }, pointBody(p)))));
				}
				if (!dg.iss.length && !dg.singles.length && !unscored) children.push(h("p", { key: "none", className: "ar-line" }, "这几天没有 3 分以上、还没用过的观点，换个时间范围看看。"));
				children.push(h("div", { key: "toAll", className: "arkb-more" },
					h(Btn, { onClick: () => setMode("all") }, `看全部 ${points.length} 条观点${issues.length ? ` 和 ${issues.length} 个议题` : ""}`)));
			} else {
				const kw = q.trim().toLowerCase();
				const list = points.filter((p) => (!who || p.who === who) && (!topic || p.topics.includes(topic))
					&& (!kw || [p.who, p.claim, p.detail, p.quote_zh, p.cardTitle, p.topics.join(" "), p.sc ? p.sc.hook : ""].join(" ").toLowerCase().includes(kw)));
				if (sort === "score") list.sort((a, b) => ((b.sc && b.sc.s) || 0) - ((a.sc && a.sc.s) || 0));
				const people = data.people || [];
				const peopleShown = allPeople ? people : people.slice(0, 18);
				const topicCount = {};
				points.forEach((p) => p.topics.forEach((t) => { topicCount[t] = (topicCount[t] || 0) + 1; }));
				const topicList = Object.entries(topicCount).sort((a, b) => b[1] - a[1]);
				const topicShown = allTopics ? topicList : topicList.slice(0, 12);
				children.push(h("div", { key: "back", className: "arkb-bar" }, h(Btn, { onClick: () => setMode("pick") }, "← 回到精选"), h("span", { className: "arkb-pickMeta" }, "全部观点")));
				if (issues.length) {
					children.push(h("div", { key: "issH", className: "ar-section" }, `几个人在说同一件事 · ${issues.length} 个议题`));
					(allIssues ? issues : issues.slice(0, 4)).forEach((t) => children.push(h(TopicCard, { key: t.id + t.title, t, start, used, toggleUsed })));
					if (issues.length > 4) children.push(h("div", { key: "issM", className: "arkb-more", style: { marginTop: 4 } },
						h(Btn, { onClick: () => setAllIssues(!allIssues) }, allIssues ? "收起议题" : `还有 ${issues.length - 4} 个议题`)));
				}
				children.push(
					h("div", { key: "obsH", className: "ar-section" }, "一条条看"),
					h("div", { key: "bar", className: "arkb-bar" },
						h("input", { className: "arkb-search", placeholder: "搜人、观点、主题…", value: q, onChange: (e) => setQ(e.target.value) }),
						h("div", { className: "arkb-seg", role: "group", "aria-label": "排序" },
							[["score", "值得做"], ["new", "最新"]].map(([v, t]) => h("button", { key: v, type: "button", "aria-pressed": sort === v, onClick: () => setSort(v) }, t))),
						daySeg));
				if (topicList.length) children.push(h("div", { key: "topics", className: "arkb-people" },
					h("span", { className: "arkb-rowLabel" }, "主题"),
					h("button", { type: "button", className: "arkb-chip", "aria-pressed": !topic, onClick: () => setTopic("") }, "全部"),
					topicShown.map(([name, c]) => h("button", { key: name, type: "button", className: "arkb-chip", "aria-pressed": topic === name, onClick: () => setTopic(topic === name ? "" : name) }, name, h("small", null, c))),
					topicList.length > 12 ? h("button", { type: "button", className: "arkb-chip", onClick: () => setAllTopics(!allTopics) }, allTopics ? "收起" : `还有 ${topicList.length - 12} 个`) : null));
				if (people.length) children.push(h("div", { key: "people", className: "arkb-people" },
					h("span", { className: "arkb-rowLabel" }, "人"),
					h("button", { type: "button", className: "arkb-chip", "aria-pressed": !who, onClick: () => setWho("") }, "全部"),
					peopleShown.map(([name, c]) => h("button", { key: name, type: "button", className: "arkb-chip", "aria-pressed": who === name, onClick: () => setWho(who === name ? "" : name) }, name, h("small", null, c))),
					people.length > 18 ? h("button", { type: "button", className: "arkb-chip", onClick: () => setAllPeople(!allPeople) }, allPeople ? "收起" : `还有 ${people.length - 18} 人`) : null));
				if (!list.length) children.push(h("p", { key: "none", className: "ar-line" }, "没有对得上的观点。"));
				list.slice(0, shown).forEach((p) => children.push(h("div", { key: p.key, className: "ar-card" }, pointBody(p))));
				if (list.length > shown) children.push(h("div", { key: "more", className: "arkb-more" },
					h(Btn, { onClick: () => setShown(shown + PAGE) }, `再看 ${Math.min(PAGE, list.length - shown)} 条（还有 ${list.length - shown} 条）`)));
			}
			const nUsed = Object.keys(used).length;
			const sch = meta && meta.schedule;
			children.push(h("p", { key: "foot", className: "ar-footer" },
				sch ? `卡片每天 ${sch.cards_at} 自动更新 · ${sch.pick_at} 打分归议题 · ` : "",
				meta ? `模型 ${meta.provider} / ${meta.model} · 卡片在 ${meta.cards_dir} · ` : "",
				nUsed ? h("span", null, `标了 ${nUsed} 条用过（`, h("a", { href: "#", className: "ar-link", onClick: (e) => { e.preventDefault(); setUsed({}); lsSet(USED_KEY, "{}"); } }, "清空"), "）· ") : null,
				h("a", { href: "#", onClick: (e) => { e.preventDefault(); load(); }, className: "ar-link" }, "刷新")));
			return h("div", { className: "ar-page" }, h("div", { className: "ar-wrap" }, children));
		}

		// ======================= AI 热点监控 =======================
		// 数据：/api/hot（radar/hot.py，serve 开着每小时抓一轮）。「现在抓一次」POST /api/hot/run，一轮一两分钟。
		const HOT_ID = "airadar-hot";
		const ago = (ts) => {
			const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
			return m < 1 ? "刚刚" : m < 60 ? `${m} 分钟前` : m < 48 * 60 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`;
		};
		const clock = (ts) => { const d = new Date(ts * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
		const kNum = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + "万" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n || 0)));
		const firstLine = (t) => {
			const ls = String(t || "").split("\n").map((l) => l.trim()).filter(Boolean);
			return (ls.find((l) => l.length >= 12) || ls[0] || "").slice(0, 50);
		};
		const srcType = (it) => (it.author ? "x" : String(it.key).indexOf("dev:") === 0 ? "dev" : it.title ? "media" : "hot");
		const isZh = (it) => /^(so|hot|zm):/.test(it.key) || it.kind === "中文";
		function srcLine(it) {
			if (it.author) return `@${it.author}：${firstLine(it.text)}`;
			if (it.title) return `${it.site}｜${it.title}`;
			return `${it.board}热榜第 ${it.rank}「${it.word}」`;
		}
		// 几种来源拼成同一个形状（题目 / 发生了什么 / 为什么在热 / 出处），给 PROMPTS.dig / PROMPTS.ideas 用
		const asNews = {
			hot: (x, at) => ({ title: x.word, what: x.desc || `${x.board}热榜上的词`, why: `${x.board}热榜第 ${x.rank} 名（${at} 抓的），普通人在聊`, url: "" }),
			x: (x) => ({ title: firstLine(x.text), what: x.text, why: `@${x.author}（${x.kind}）${ago(x.ts)}发，每小时互动速度 ${x.velocity}，${x.likes} 赞 ${x.reposts} 转`, url: x.url }),
			media: (m) => ({ title: m.title, what: `${m.site} 的报道`, why: "中文媒体在报", url: m.url }),
			dev: (x) => ({ title: x.title, what: x.desc || x.title, why: `${x.site} 上正在热${x.score != null ? "（" + x.score + "）" : ""}`, url: x.url }),
			event: (e, items) => ({
				title: e.title,
				what: e.what + "\n\n这件事的原料：\n" + items.map((it) => "- " + srcLine(it) + (it.url ? " " + it.url : "")).join("\n"),
				why: `X ${e.n_x} 条、中文媒体 ${e.n_media} 篇、热榜 ${e.n_hot} 个词${e.n_dev ? `、开发者社区 ${e.n_dev} 条` : ""}；最早是 ${e.first} ${ago(e.first_ts)}`
					+ (e.lag_h ? `；中文比源头晚 ${e.lag_h} 小时` : e.gap ? "；中文媒体还没人报" : ""),
				url: e.first_url,
			}),
		};
		const SEEN_KEY = "airadar:hotSeenTs";

		const ICON = {
			bolt: "M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z",
			heart: "M8 13.5S2.5 10.2 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3C13.5 10.2 8 13.5 8 13.5z",
			repeat: "M3 6.5V5.5A1.5 1.5 0 0 1 4.5 4H12l-2-2m3 7.5v1A1.5 1.5 0 0 1 11.5 12H4l2 2",
			eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
			dig: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6 14 14M5 7h4M7 5v4",
			pen: "M10.5 2.5l3 3-8 8H2.5v-3z",
			ext: "M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5 7.5 8.5",
			refresh: "M13.5 8A5.5 5.5 0 1 1 11.8 4M13.5 2.5V5.5H10.5",
			search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6 14 14",
			layers: "M8 2 1.5 5.5 8 9l6.5-3.5zM1.5 8.5 8 12l6.5-3.5",
			clock: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5",
			news: "M2.5 3h9v10h-9zM11.5 6h2v6a1 1 0 0 1-2 0M4.5 5.5h5M4.5 8h5M4.5 10.5h3",
			trend: "M1.5 11.5 6 7l3 3 5.5-5.5M10.5 4.5h4v4",
			flame: "M8 14.5c2.6 0 4.5-1.8 4.5-4.4C12.5 6.6 8 4.5 8.5 1.5 5.5 3 6 6 6 6S4.8 5.4 4.5 4.2C3.8 5.3 3.5 6.6 3.5 8c0 3.6 1.9 6.5 4.5 6.5z",
			close: "M4 4l8 8M12 4l-8 8",
		};
		function Ico({ n, s }) {
			return h("svg", { width: s || 14, height: s || 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
				h("path", { d: ICON[n] }));
		}
		function Act({ icon, primary, sm, onClick, href, title, children }) {
			const cls = "sh-act" + (primary ? " sh-act--primary" : "") + (sm ? " sh-act--sm" : "");
			const inner = [icon ? h(Ico, { key: "i", n: icon, s: sm ? 13 : 14 }) : null, children];
			return href ? h("a", { className: cls, href, target: "_blank", rel: "noreferrer", title }, inner)
				: h("button", { type: "button", className: cls, onClick, title }, inner);
		}
		function Spark({ pts }) {
			if (!pts || pts.length < 2) return h("span", { className: "sh-sparkNone" }, "攒数据中");
			const max = Math.max(...pts, 1), W = 96, H = 24;
			const xy = pts.map((v, i) => [i * W / (pts.length - 1), H - 3 - (v / max) * (H - 6)]);
			const line = xy.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
			const last = xy[xy.length - 1];
			return h("svg", { className: "sh-spark", viewBox: `0 0 ${W} ${H}`, "aria-hidden": true },
				h("polygon", { points: `0,${H} ${line} ${W},${H}`, fill: "currentColor", opacity: 0.1 }),
				h("polyline", { points: line, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round", strokeLinecap: "round" }),
				h("circle", { cx: last[0], cy: last[1], r: 2.2, fill: "currentColor" }));
		}
		const Meter = ({ v, max }) => {   // 热度条：黄到红的渐变铺满整条，按比例露出
			const pct = Math.max(4, Math.round(100 * v / (max || 1)));
			return h("span", { className: "sh-meter", "aria-hidden": true }, h("i", { style: { width: pct + "%", backgroundSize: Math.round(10000 / pct) + "% 100%" } }));
		};
		const Tags = ({ list, n }) => (list || []).slice(0, n || 3).map((e) => h("span", { key: e, className: "sh-tag sh-tint " + hueCls(entHue(e)) }, e));
		const Kind = ({ k }) => h("span", { className: "sh-tag sh-tint " + hueCls(KIND_HUE[k] || "gray") }, k);
		const IcoTile = ({ n, hue }) => h("span", { className: "sh-icoTile " + hueCls(hue), "aria-hidden": true }, h(Ico, { n, s: 13 }));
		const TREND = { new: ["新事件", "new"], up: ["升温", "up"], down: ["降温", "down"] };
		function Badges({ e, isNew }) {
			const tr = TREND[e.trend];
			return [
				isNew ? h("span", { key: "n", className: "sh-badge sh-badge--new" }, "新") : null,
				tr && !(isNew && e.trend === "new") ? h("span", { key: "t", className: "sh-badge sh-badge--" + tr[1] }, tr[0]) : null,
				e.gap ? h("span", { key: "g", className: "sh-badge sh-tint " + hueCls("blue"), title: "源头已经热了，抓到的中文媒体和热榜还没人报" }, "中文还没报") : null,
			];
		}
		const Pips = ({ n }) => h("span", { className: "sh-pips " + hueCls(scoreHue(n)), "aria-label": `值得做 ${n}/5` }, [1, 2, 3, 4, 5].map((i) => h("i", { key: i, className: i <= n ? "on" : "" })));
		function Advice({ e }) {
			if (!e.score) return null;
			return h("div", { className: "sh-advice " + hueCls(scoreHue(e.score)) },
				h(Pips, { n: e.score }),
				h("span", { className: "sh-adviceK" }, e.score >= 4 ? "值得做" : e.score === 3 ? "可以考虑" : "先放放"),
				e.form && e.form !== "不做" ? h("span", { className: "sh-tag" }, e.form) : null,
				e.why ? h("span", { className: "sh-adviceWhy" }, e.why) : null);
		}
		function SrcList({ items, max }) {
			return h("ul", { className: "sh-srcList" }, items.slice(0, max || items.length).map((it) => {
				const t = srcType(it);
				const main = it.author ? firstLine(it.text) : it.title || `「${it.word}」`;
				const sub = it.author ? `@${it.author} · ${ago(it.ts)}` : it.title ? it.site : `${it.board}热榜第 ${it.rank}`;
				const body = [main, h("small", { key: "s" }, sub)];
				return h("li", { key: it.key }, h("span", { className: "sh-srcIco sh-tint " + hueCls(SRC_HUE[t]), "aria-hidden": true }, SRC_ICO[t]),
					it.url ? h("a", { href: it.url, target: "_blank", rel: "noreferrer" }, body) : h("span", { className: "sh-srcText" }, body));
			}));
		}
		function EvMeta({ e, maxHeat }) {
			const tint = (hue, kids) => h("span", { className: hueCls(hue), style: { color: "var(--hue)", display: "inline-flex", fontWeight: 700 } }, kids);
			return h("div", { className: "sh-meta" },
				h("span", { className: "sh-stat", title: e.parts ? `热榜 ${e.parts.hot} · 𝕏 ${e.parts.x} · 媒体 ${e.parts.media} · 社区 ${e.parts.dev}（各 0–10 分，多一处来源再加 3）` : "" }, h(Meter, { v: e.heat, max: maxHeat }), "热度 " + e.heat),
				e.n_x ? h("span", { className: "sh-stat" }, "𝕏 " + e.n_x) : null,
				e.n_media ? h("span", { className: "sh-stat" }, tint(SRC_HUE.media, h(Ico, { n: "news", s: 13 })), e.n_media + " 篇") : null,
				e.n_hot ? h("span", { className: "sh-stat" }, tint(SRC_HUE.hot, h(Ico, { n: "flame", s: 13 })), "热榜 " + e.n_hot) : null,
				e.n_dev ? h("span", { className: "sh-stat" }, tint(SRC_HUE.dev, "社"), "社区 " + e.n_dev) : null,
				e.lag_h >= 1 ? h("span", { className: "sh-stat", title: "源头（官方号、一手开发者、海外社区）首发后，中文媒体、热榜、中文大V 隔多久跟上" }, "中文晚 " + e.lag_h + " 小时") : null,
				h("span", { className: "sh-stat" }, h(Ico, { n: "clock", s: 13 }), "最早 ", e.first_url ? h("a", { href: e.first_url, target: "_blank", rel: "noreferrer" }, e.first) : e.first, " · " + ago(e.first_ts)),
				e.stale ? h("span", null, "上一轮的归类") : null);
		}
		function LeadEvent({ e, items, isNew, maxHeat, start, openTl }) {
			return h("article", { className: "sh-card sh-card--hover sh-lead " + hueCls(entHue(e.ents[0])) },
				h("div", { className: "sh-leadMain" },
					h("div", { className: "sh-evTop" }, h("span", { className: "sh-rank" }, "01 · 头条"), h(Badges, { e, isNew }), h(Kind, { k: e.kind }), h(Tags, { list: e.ents })),
					h("h3", { className: "sh-evTitle" }, e.title),
					h("p", { className: "sh-evWhat" }, e.what),
					h(Advice, { e }),
					h(EvMeta, { e, maxHeat }),
					h("div", { className: "sh-acts" },
						h(Act, { icon: "dig", primary: true, onClick: () => start(PROMPTS.dig(asNews.event(e, items))) }, "深挖这件事"),
						h(Act, { icon: "pen", onClick: () => start(PROMPTS.ideas(asNews.event(e, items))) }, "出选题"),
						h(Act, { icon: "clock", onClick: () => openTl(e.id) }, "传播时间线"))),
				h("aside", { className: "sh-leadSide" },
					h("div", { className: "sh-sideTitle" }, `原料 · ${items.length} 条`),
					h(SrcList, { items, max: 6 })));
		}
		function EventCard({ e, rank, items, isNew, maxHeat, start, openTl }) {
			const [open, setOpen] = React.useState(false);
			return h("article", { className: "sh-card sh-card--hover sh-evCard" },
				h("div", { className: "sh-evTop" }, h("span", { className: "sh-rank " + hueCls(entHue(e.ents[0])) }, h("span", { className: "sh-dot" }), String(rank).padStart(2, "0")), h(Badges, { e, isNew }), h(Kind, { k: e.kind }), h(Tags, { list: e.ents, n: 2 })),
				h("h3", { className: "sh-evTitle" }, e.title),
				h("p", { className: "sh-evWhat sh-clamp2", title: e.what }, e.what),
				h(Advice, { e }),
				h(EvMeta, { e, maxHeat }),
				h("div", { className: "sh-acts" },
					h(Act, { icon: "dig", onClick: () => start(PROMPTS.dig(asNews.event(e, items))) }, "深挖"),
					h(Act, { icon: "pen", onClick: () => start(PROMPTS.ideas(asNews.event(e, items))) }, "出选题"),
					h(Act, { icon: "clock", onClick: () => openTl(e.id) }, "时间线"),
					h(Act, { icon: "layers", onClick: () => setOpen(!open) }, open ? "收起原料" : `原料 ${items.length}`)),
				open ? h(SrcList, { items }) : null);
		}
		// 传播时间线（侧栏）：原料按发出时间排，源头在前，中文跟进的地方画一道分界
		const fullTime = (ts) => { const d = new Date(ts * 1000); return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${clock(ts)}`; };
		const SRC_NAME = { x: "X", media: "中文媒体", hot: "中文热榜", dev: "开发者社区" };
		function Timeline({ e, items, snapTs, onClose, start }) {
			React.useEffect(() => {
				const k = (ev) => { if (ev.key === "Escape") onClose(); };
				window.addEventListener("keydown", k);
				return () => window.removeEventListener("keydown", k);
			}, [onClose]);
			const madeTs = (it) => it.ts || (it.age_h != null ? snapTs - it.age_h * 3600 : it.first_seen);
			const rows = items.slice().sort((a, b) => madeTs(a) - madeTs(b));
			const firstZh = rows.findIndex(isZh);
			const lis = [];
			rows.forEach((it, i) => {
				if (i === firstZh && i > 0) lis.push(h("li", { key: "zh", className: "sh-tlSplit" }, h("span", null, e.lag_h ? `中文开始跟进 · 比源头晚 ${e.lag_h} 小时` : "中文开始跟进")));
				const t = srcType(it);
				const who = t === "x" ? `@${it.author} · ${it.kind}` : t === "hot" ? `${it.board}热榜 第 ${it.rank} 名` : it.site;
				const body = t === "x" ? it.text.trim().replace(/\n\s*\n+/g, "\n") : t === "hot" ? `「${it.word}」${it.desc ? " " + it.desc : ""}` : it.title + (t === "dev" && it.desc ? "：" + it.desc : "");
				lis.push(h("li", { key: it.key, className: "sh-tlItem " + hueCls(SRC_HUE[t]) },
					h("span", { className: "sh-tlNode", "aria-hidden": true }),
					h("div", { className: "sh-tlHead" }, h("b", null, (it.ts ? "" : "约 ") + fullTime(madeTs(it))), h("span", null, SRC_NAME[t] + " · " + who), isZh(it) ? null : h("span", { className: "sh-tag" }, "源头")),
					h("p", { className: "sh-tlBody sh-clamp4" }, body),
					it.url ? h("a", { className: "sh-tlLink", href: it.url, target: "_blank", rel: "noreferrer" }, "打开原文 ↗") : null));
			});
			const lagTxt = e.gap ? "中文还没人报" : e.lag_h ? `晚 ${e.lag_h} 小时` : e.first_en_ts && e.first_zh_ts ? "中文几乎同步" : "—";
			return h("div", { className: "sh-drawerWrap" },
				h("div", { className: "sh-drawerMask", onClick: onClose }),
				h("aside", { className: "sh-drawer " + hueCls(entHue(e.ents[0])), role: "dialog", "aria-label": "传播时间线" },
					h("div", { className: "sh-drawerTop" },
						h("span", { className: "sh-secTitle" }, "传播时间线"),
						h("button", { type: "button", className: "sh-act", onClick: onClose, "aria-label": "关闭" }, h(Ico, { n: "close" }))),
					h("div", { className: "sh-evTop" }, h(Badges, { e, isNew: false }), h(Kind, { k: e.kind }), h(Tags, { list: e.ents })),
					h("h3", { className: "sh-evTitle", style: { fontSize: 19 } }, e.title),
					h("p", { className: "sh-evWhat" }, e.what),
					h(Advice, { e }),
					h("div", { className: "sh-tlSum" },
						h("div", null, h("small", null, "源头首发"), h("b", null, e.first_en_ts ? fullTime(e.first_en_ts) : "—")),
						h("div", null, h("small", null, "中文首发"), h("b", null, e.first_zh_ts ? fullTime(e.first_zh_ts) : "还没有")),
						h("div", { className: e.gap ? "sh-tlGap" : "" }, h("small", null, "时差"), h("b", null, lagTxt))),
					h("ol", { className: "sh-tl" }, lis),
					h("div", { className: "sh-acts", style: { marginTop: 18 } },
						h(Act, { icon: "dig", primary: true, onClick: () => start(PROMPTS.dig(asNews.event(e, items))) }, "深挖这件事"),
						h(Act, { icon: "pen", onClick: () => start(PROMPTS.ideas(asNews.event(e, items))) }, "出选题"))));
		}
		function DevCol({ site, rows, start }) {
			return h("div", { className: "sh-card sh-devCol" },
				h("div", { className: "sh-devHead" }, h("span", { className: "sh-icoTile " + hueCls("violet"), "aria-hidden": true, style: { fontSize: 11, fontWeight: 700 } }, site === "Hacker News" ? "Y" : site === "GitHub" ? "GH" : "HF"), site, h("small", null, rows.length + " 条")),
				rows.length ? h("ul", { className: "sh-devList" }, rows.slice(0, 8).map((x) => {
					const talk = /^HN 讨论 (\S+)/.exec(x.desc || "");   // HN 没有摘要，desc 里放的是讨论帖链接
					return h("li", { key: x.key },
						h("a", { className: "sh-devTitle", href: x.url, target: "_blank", rel: "noreferrer", title: x.title }, x.title),
						x.desc && !talk ? h("p", { className: "sh-devDesc sh-clamp2" }, x.desc) : null,
						h("div", { className: "sh-devMeta" },
							x.score != null ? h("span", null, (site === "GitHub" ? "★ " : "▲ ") + kNum(x.score)) : null,
							x.comments ? (talk && talk[1] !== x.url ? h("a", { href: talk[1], target: "_blank", rel: "noreferrer", className: "sh-devTalk" }, x.comments + " 评论") : h("span", null, x.comments + " 评论")) : null,
							x.age_h != null ? h("span", null, x.age_h < 1 ? "刚刚" : Math.round(x.age_h) + " 小时前") : null,
							h("span", { className: "sh-actsInline" }, h(Act, { sm: true, icon: "dig", title: "深挖", onClick: () => start(PROMPTS.dig(asNews.dev(x))) }, "深挖"))));
				})) : h("p", { className: "sh-empty" }, "这会儿没有对得上的。"));
		}
		function Post({ x, isNew, start }) {
			return h("div", { className: "sh-post" },
				h("div", { className: "sh-postHead" },
					h("span", { className: "sh-ava " + ((x.ents || [])[0] ? "sh-tint " + hueCls(entHue(x.ents[0])) : "sh-ava--" + x.kind), "aria-hidden": true }, (x.name || x.author || "?").trim().charAt(0).toUpperCase()),
					h("div", { className: "sh-who" }, h("b", null, x.name), h("span", null, `@${x.author} · ${x.kind}`)),
					isNew ? h("span", { className: "sh-badge sh-badge--new" }, "新") : null,
					h("span", { className: "sh-time" }, ago(x.ts))),
				h("p", { className: "sh-postText sh-clamp4" }, x.text.trim().replace(/\n\s*\n+/g, "\n")),
				x.quote ? h("div", { className: "sh-quote sh-clamp2" }, `@${x.quote.author}：${x.quote.text}`) : null,
				h("div", { className: "sh-postFoot" },
					h("span", { className: "sh-stat sh-vel", title: "（赞 + 2×转 + 2×引用 + 收藏）÷ 小时" }, h(Ico, { n: "bolt", s: 13 }), kNum(x.velocity) + "/小时"),
					h("span", { className: "sh-stat" }, h(Ico, { n: "heart", s: 13 }), kNum(x.likes)),
					h("span", { className: "sh-stat" }, h(Ico, { n: "repeat", s: 13 }), kNum(x.reposts)),
					x.views ? h("span", { className: "sh-stat" }, h(Ico, { n: "eye", s: 13 }), kNum(x.views)) : null,
					h("span", { className: "sh-actsInline" },
						h(Act, { sm: true, icon: "dig", title: "深挖", onClick: () => start(PROMPTS.dig(asNews.x(x))) }, "深挖"),
						h(Act, { sm: true, icon: "pen", title: "出选题", onClick: () => start(PROMPTS.ideas(asNews.x(x))) }, "选题"),
						h(Act, { sm: true, icon: "ext", href: x.url, title: "看原帖" }, "原帖"))));
		}
		// 顶上来源状态：五个热榜并成一颗「热榜」，鼠标放上去看各榜
		const GROUPED = { X: 1, 媒体: 1, "AI 媒体": 1, 社区: 1 };
		function srcPills(sources) {
			const boards = Object.entries(sources).filter(([n]) => !GROUPED[n]);
			const out = [{ name: "热榜", n: boards.reduce((a, [, s]) => a + s.n, 0), ok: boards.some(([, s]) => s.ok),
				title: boards.map(([n, s]) => `${n}：${s.ok ? `榜上 ${s.total} 条，AI 相关 ${s.n} 条` : "没抓到"}`).join("\n") }];
			const desc = { X: (s) => `扫 ${s.total} 个号，48 小时内 ${s.n} 条`, 媒体: (s) => `360 新闻 ${s.total} 个词，${s.n} 篇`,
				"AI 媒体": (s) => `量子位、机器之心、新智元 ${s.n} 篇`, 社区: (s) => `Hacker News、Hugging Face、GitHub 共 ${s.n} 条` };
			Object.keys(GROUPED).forEach((n) => { if (sources[n]) out.push({ name: n, n: sources[n].n, ok: sources[n].ok, title: desc[n](sources[n]) }); });
			return out;
		}

		function HotPage({ start }) {
			const [st, setSt] = React.useState(null);
			const [err, setErr] = React.useState("");
			const [win, setWin] = React.useState(24);
			const [ent, setEnt] = React.useState("");
			const [onlyNew, setOnlyNew] = React.useState(false);
			const [q, setQ] = React.useState("");
			const [xShown, setXShown] = React.useState(12);
			const [mShown, setMShown] = React.useState(20);
			const [evAll, setEvAll] = React.useState(false);
			const [sort, setSort] = React.useState("heat");
			const [gapOnly, setGapOnly] = React.useState(false);
			const [tl, setTl] = React.useState("");
			const closeTl = React.useCallback(() => setTl(""), []);
			const [, tick] = React.useState(0);
			const [since] = React.useState(() => Number(lsGet(SEEN_KEY)) || 0);
			const load = React.useCallback(() => {
				getJson("/api/hot").then((d) => { setSt(d); setErr(""); }).catch((e) => setErr(NOAPI + "：" + String(e)));
			}, []);
			React.useEffect(load, [load]);
			const running = !!(st && st.running);
			React.useEffect(() => {   // 平时一分钟读一次，在抓的时候 4 秒一次；顺手刷新「x 分钟前」
				const t = setInterval(() => { load(); tick((n) => n + 1); }, running ? 4000 : 60000);
				return () => clearInterval(t);
			}, [running, load]);
			React.useEffect(() => { setXShown(12); setMShown(20); }, [win, ent, onlyNew, q]);
			React.useEffect(() => { if (st && st.data) lsSet(SEEN_KEY, String(st.data.ts)); }, [st && st.data && st.data.ts]);
			const runNow = () => postJson("/api/hot/run").then(load).catch((e) => setErr(String(e)));

			const d = st && st.data;
			const page = (kids) => h("div", { className: "sh-page" }, h("div", { className: "sh-wrap" }, kids));
			const head = h("header", { key: "top", className: "sh-top" },
				h("div", null,
					h("div", { className: "sh-eyebrow" },
						h("span", { className: "sh-pulse" + (running ? " sh-pulse--busy" : ""), "aria-hidden": true }),
						running ? "正在抓新一轮（一两分钟）" : d ? `${clock(d.ts)} 更新 · ${ago(d.ts)} · 下次约 ${clock(st.next_ts)}` : "实时"),
					h("h1", { className: "sh-h1" }, "AI 热点监控")),
				h("div", { className: "sh-tools" },
					d ? h("div", { className: "sh-srcs" }, srcPills(d.sources).map((s) => h("span", { key: s.name, className: "sh-src" + (s.ok ? "" : " sh-src--bad"), title: s.title },
						h("i", null), s.name, " ", h("b", null, s.n)))) : null,
					h("button", { type: "button", className: "sh-btn", onClick: runNow, disabled: running }, h(Ico, { n: "refresh" }), running ? "抓取中" : "现在抓一次")));
			if (!d) return page([head, h("p", { key: "e", className: "sh-empty", style: { marginTop: 24 } }, err || (st ? "还没抓过，点右上「现在抓一次」。" : "在读…"))]);

			const kw = q.trim().toLowerCase();
			const hit = (...fs) => !kw || fs.join(" ").toLowerCase().includes(kw);
			const isNew = (it) => (since ? it.first_seen > since : !!it.new);
			const pass = (it) => (!ent || (it.ents || []).includes(ent)) && (!onlyNew || isNew(it));
			const fresh = (createdTs) => Date.now() / 1000 - createdTs <= win * 3600;
			const byKey = {};
			[].concat(d.hot, d.x, d.media, d.dev || []).forEach((it) => { byKey[it.key] = it; });
			const evNew = (e) => (since ? e.first_seen > since : e.trend === "new");
			const allEv = d.events || [];
			const SORTS = { heat: null, pure: (a, b) => b.heat - a.heat, score: (a, b) => (b.score || 0) - (a.score || 0) || b.heat - a.heat, fresh: (a, b) => b.first_ts - a.first_ts };
			const evs = allEv.filter((e) => (!ent || e.ents.includes(ent)) && (!onlyNew || evNew(e)) && (!gapOnly || e.gap) && hit(e.title, e.what, e.ents.join(" ")));
			if (SORTS[sort]) evs.sort(SORTS[sort]);
			const gaps = allEv.filter((e) => e.gap).length;
			const worth = allEv.filter((e) => e.score >= 4).length;
			const devs = (d.dev || []).filter((x) => pass(x) && hit(x.title, x.desc));
			const tlEv = tl ? allEv.find((e) => e.id === tl) : null;
			const xs = d.x.filter((x) => pass(x) && fresh(x.ts) && hit(x.text, x.author, x.name));
			const ms = d.media.filter((m) => pass(m) && fresh(d.ts - (m.age_h == null ? 0 : m.age_h) * 3600) && hit(m.title, m.site));
			const hots = d.hot.filter((x) => pass(x) && hit(x.word, x.desc));
			const newCount = [].concat(d.hot, d.x, d.media).filter(isNew).length;
			const maxHeat = Math.max(1, ...allEv.map((e) => e.heat));
			const topX = d.x.filter((x) => x.age_h <= 24)[0];
			const topE = d.ents[0];

			const kids = [head];
			kids.push(h("section", { key: "kpi", className: "sh-kpis", "aria-label": "概览" },
				h("div", { className: "sh-kpi" },
					h("div", { className: "sh-kpiLabel" }, h(IcoTile, { n: "trend", hue: "orange" }), "正在发酵"),
					h("div", { className: "sh-kpiVal" }, allEv.length, h("small", null, "件")),
					h("div", { className: "sh-kpiSub" }, `${worth} 件值得做 · ${gaps} 件中文还没报`)),
				h("button", { type: "button", className: "sh-kpi", "aria-pressed": onlyNew, onClick: () => setOnlyNew(!onlyNew), title: "点一下只看这些" },
					h("div", { className: "sh-kpiLabel" }, h(IcoTile, { n: "clock", hue: "red" }), since ? "上次看过之后" : "这一轮新冒出"),
					h("div", { className: "sh-kpiVal" + (newCount ? " sh-kpiVal--accent" : "") }, newCount, h("small", null, "条")),
					h("div", { className: "sh-kpiSub" }, since ? `上次看到 ${clock(since)} 那轮` : "下次打开从这里算起")),
				h("div", { className: "sh-kpi" },
					h("div", { className: "sh-kpiLabel" }, h(IcoTile, { n: "bolt", hue: "blue" }), "X 上最快"),
					h("div", { className: "sh-kpiVal" }, topX ? kNum(topX.velocity) : "—", h("small", null, "/小时")),
					h("div", { className: "sh-kpiSub", title: topX ? topX.text : "" }, topX ? `@${topX.author}：${firstLine(topX.text)}` : "")),
				topE ? h("button", { type: "button", className: "sh-kpi", "aria-pressed": ent === topE.name, onClick: () => setEnt(ent === topE.name ? "" : topE.name), title: "点一下只看这家" },
					h("div", { className: "sh-kpiLabel" }, h(IcoTile, { n: "flame", hue: entHue(topE.name) }), "最热的公司"),
					h("div", { className: "sh-kpiVal sh-kpiVal--hue " + hueCls(entHue(topE.name)) }, topE.name),
					h("div", { className: "sh-kpiSub" }, `热度 ${topE.heat} · 𝕏 ${topE.x} · 媒体 ${topE.media}`)) : h("div", { className: "sh-kpi" })));

			kids.push(h("div", { key: "bar", className: "sh-bar" },
				h("div", { className: "sh-seg", role: "group", "aria-label": "时间范围" },
					[6, 24, 48].map((n) => h("button", { key: n, type: "button", "aria-pressed": win === n, onClick: () => setWin(n) }, n + " 小时"))),
				h("div", { className: "sh-seg", role: "group", "aria-label": "事件排序" },
					[["heat", "综合"], ["pure", "热度"], ["score", "值得做"], ["fresh", "最新"]].map(([k, t]) => h("button", { key: k, type: "button", "aria-pressed": sort === k, onClick: () => setSort(k) }, t))),
				h("button", { type: "button", className: "sh-chip", "aria-pressed": onlyNew, onClick: () => setOnlyNew(!onlyNew) }, since ? "上次之后的" : "新冒出来的"),
				h("button", { type: "button", className: "sh-chip", "aria-pressed": gapOnly, onClick: () => setGapOnly(!gapOnly), title: "源头已经热了，中文还没人报的事" }, "窗口期 " + gaps),
				ent ? h("button", { type: "button", className: "sh-chip", "aria-pressed": true, onClick: () => setEnt(""), title: "取消筛选" }, ent, h(Ico, { n: "close", s: 12 })) : null,
				h("label", { className: "sh-search" }, h(Ico, { n: "search" }),
					h("input", { type: "search", placeholder: "搜事件、推文、报道…", value: q, onChange: (e) => setQ(e.target.value), "aria-label": "搜索" }))));
			if (err) kids.push(h("p", { key: "err", className: "sh-err", style: { marginTop: 12 } }, err));

			// 正在发酵的事：头条一张大卡，其余两列
			const info = d.ev_info || {};
			const evKids = [h("div", { key: "h", className: "sh-secHead" },
				h(IcoTile, { n: "trend", hue: "orange" }), h("h2", { className: "sh-secTitle" }, "正在发酵的事"), h("span", { className: "sh-secCount" }, evs.length + " 件"),
				h("span", { className: "sh-secNote", title: info.why || "" }, info.reused ? `原料没怎么变，沿用 ${clock(info.ts)} 的归类，热度按这轮重算` : info.ts ? `模型 ${clock(info.ts)} 重新归的（${info.why}）` : "模型把几处原料归成事件"))];
			const itemsOf = (e) => e.keys.map((k) => byKey[k]).filter(Boolean);
			if (!allEv.length) evKids.push(h("p", { key: "0", className: "sh-empty" }, "这轮还没归出事件（模型没配好？看 data/hot.log）。"));
			else if (!evs.length) evKids.push(h("p", { key: "1", className: "sh-empty" }, "没有对得上的事件。"));
			else {
				evKids.push(h(LeadEvent, { key: evs[0].id, e: evs[0], items: itemsOf(evs[0]), isNew: evNew(evs[0]), maxHeat, start, openTl: setTl }));
				const rest = evs.slice(1, evAll ? evs.length : 5);
				if (rest.length) evKids.push(h("div", { key: "g", className: "sh-grid2" }, rest.map((e, i) =>
					h(EventCard, { key: e.id, e, rank: i + 2, items: itemsOf(e), isNew: evNew(e), maxHeat, start, openTl: setTl }))));
				if (evs.length > 5) evKids.push(h("div", { key: "m", className: "sh-more" },
					h("button", { type: "button", className: "sh-btn", onClick: () => setEvAll(!evAll) }, evAll ? "收起" : `再看 ${evs.length - 5} 件`)));
			}
			kids.push(h("section", { key: "ev", className: "sh-sec" }, evKids));

			// 谁在热：排行表，点一行只看这家
			const ents = d.ents.slice(0, 10);
			const maxEnt = Math.max(1, ...ents.map((r) => r.heat));
			if (ents.length) kids.push(h("section", { key: "ent", className: "sh-sec" },
				h("div", { className: "sh-secHead" }, h(IcoTile, { n: "flame", hue: "red" }), h("h2", { className: "sh-secTitle" }, "谁在热"), h("span", { className: "sh-secCount" }, "近 24 小时"),
					h("span", { className: "sh-secNote" }, "点一行只看这家")),
				h("div", { className: "sh-card sh-table", role: "list" },
					h("div", { className: "sh-row sh-row--head", "aria-hidden": true }, h("span", null), h("span", null, "公司"), h("span", null, "热度"), h("span", null, "热榜 · X · 媒体"), h("span", null, "走势"), h("span", null, "这家的事")),
					ents.map((r, i) => h("button", { key: r.name, type: "button", role: "listitem", className: "sh-row " + hueCls(entHue(r.name)), "aria-pressed": ent === r.name, onClick: () => setEnt(ent === r.name ? "" : r.name) },
						h("span", { className: "sh-rowRank" }, i + 1),
						h("span", { className: "sh-rowName" }, h("span", { className: "sh-dot" }), r.name),
						h("span", { className: "sh-rowHeat" }, h(Meter, { v: r.heat, max: maxEnt }), r.heat),
						h("span", { className: "sh-trio" },
							h("span", { className: (r.hot ? "on " : "") + hueCls(SRC_HUE.hot) }, "榜 " + r.hot), h("span", { className: (r.x ? "on " : "") + hueCls(SRC_HUE.x) }, "𝕏 " + r.x), h("span", { className: (r.media ? "on " : "") + hueCls(SRC_HUE.media) }, "媒 " + r.media)),
						h(Spark, { pts: r.spark }),
						h("span", { className: "sh-rowTop", title: r.top || "" }, r.top || "—"))))));

			kids.push(h("section", { key: "hot", className: "sh-sec" },
				h("div", { className: "sh-secHead" }, h(IcoTile, { n: "flame", hue: SRC_HUE.hot }), h("h2", { className: "sh-secTitle" }, "中文热榜上的 AI 词"), h("span", { className: "sh-secCount" }, hots.length + " 个"),
					h("span", { className: "sh-secNote" }, "抖音、B站、百度、知乎、头条，看普通人有没有在聊")),
				h("div", { className: "sh-card sh-boards" }, hots.length ? hots.map((x) => h("span", { key: x.key, className: "sh-boardItem", title: x.desc || x.word },
					h("span", { className: "sh-tag sh-tint " + hueCls(SRC_HUE.hot) }, x.board), h("b", null, "#" + x.rank), x.word,
					isNew(x) ? h("span", { className: "sh-badge sh-badge--new" }, "新")
						: x.prev_rank && x.prev_rank !== x.rank ? h("span", { className: "sh-badge sh-badge--" + (x.prev_rank > x.rank ? "up" : "down") }, (x.prev_rank > x.rank ? "↑" : "↓") + Math.abs(x.prev_rank - x.rank)) : null,
					h(Act, { sm: true, icon: "dig", onClick: () => start(PROMPTS.dig(asNews.hot(x, d.at))) }, "深挖")))
					: h("p", { className: "sh-empty" }, ent || kw || onlyNew ? "没有对得上的热词。" : "热榜上这会儿都没有 AI 词。"))));

			if ((d.dev || []).length) kids.push(h("section", { key: "dev", className: "sh-sec" },
				h("div", { className: "sh-secHead" }, h("span", { className: "sh-icoTile " + hueCls("violet"), "aria-hidden": true, style: { fontSize: 11, fontWeight: 700 } }, "社"),
					h("h2", { className: "sh-secTitle" }, "开发者社区在看"), h("span", { className: "sh-secCount" }, devs.length + " 条"),
					h("span", { className: "sh-secNote" }, "新模型、新开源项目常常比大V 转发还早")),
				h("div", { className: "sh-devGrid" }, ["Hacker News", "Hugging Face", "GitHub"].map((n) => h(DevCol, { key: n, site: n, rows: devs.filter((x) => x.site === n), start })))));

			const xCol = h("section", { key: "x", className: "sh-sec" },
				h("div", { className: "sh-secHead" }, h("span", { className: "sh-icoTile " + hueCls(SRC_HUE.x), "aria-hidden": true, style: { fontSize: 12, fontWeight: 700 } }, "𝕏"), h("h2", { className: "sh-secTitle" }, "X 上谁先发"), h("span", { className: "sh-secCount" }, xs.length + " 条"), h("span", { className: "sh-secNote" }, "按每小时互动速度")),
				xs.length ? h("div", { className: "sh-card" }, xs.slice(0, xShown).map((x) => h(Post, { key: x.key, x, isNew: isNew(x), start }))) : h("p", { className: "sh-empty" }, "没有对得上的推。"),
				xs.length > xShown ? h("div", { className: "sh-more" }, h("button", { type: "button", className: "sh-btn", onClick: () => setXShown(xShown + 12) }, `再看 12 条 · 还有 ${xs.length - xShown}`)) : null);
			const mCol = h("section", { key: "m", className: "sh-sec" },
				h("div", { className: "sh-secHead" }, h(IcoTile, { n: "news", hue: SRC_HUE.media }), h("h2", { className: "sh-secTitle" }, "中文媒体在报"), h("span", { className: "sh-secCount" }, ms.length + " 篇"), h("span", { className: "sh-secNote" }, "最新的在上面")),
				ms.length ? h("ul", { className: "sh-card sh-news" }, ms.slice(0, mShown).map((m) => h("li", { key: m.key },
					h("span", { className: "sh-newsTime" }, m.age_h == null ? m.time || "—" : ago(d.ts - m.age_h * 3600).replace(" ", "")),
					h("div", null,
						h("a", { className: "sh-newsTitle", href: m.url, target: "_blank", rel: "noreferrer" }, m.title),
						h("div", { className: "sh-newsMeta" }, m.ai_media ? h("span", { className: "sh-tag sh-tint " + hueCls("indigo") }, m.site) : m.site, isNew(m) ? h("span", { className: "sh-badge sh-badge--new" }, "新") : null, h(Tags, { list: m.ents, n: 2 }))),
					h("span", { className: "sh-actsInline" }, h(Act, { sm: true, icon: "dig", title: "深挖", onClick: () => start(PROMPTS.dig(asNews.media(m))) }, "深挖")))))
					: h("p", { className: "sh-empty" }, "没有对得上的报道。"),
				ms.length > mShown ? h("div", { className: "sh-more" }, h("button", { type: "button", className: "sh-btn", onClick: () => setMShown(mShown + 20) }, `再看 20 篇 · 还有 ${ms.length - mShown}`)) : null);
			kids.push(h("div", { key: "cols", className: "sh-cols" }, xCol, mCol));

			kids.push(h("p", { key: "foot", className: "sh-foot" },
				`来源：中文热榜 · X ${d.sources.X ? d.sources.X.total : ""} 个号 · AI 媒体 · 360 新闻 ${d.sources["媒体"] ? d.sources["媒体"].total : ""} 个词 · 开发者社区。每 ${d.every_min} 分钟抓一轮，这轮用了 ${d.took_s} 秒。`,
				(d.errors || []).length ? h("span", { className: "sh-err" }, " 这轮没抓全：" + d.errors.join("；") + "。") : null,
				" ", h("a", { href: "#", onClick: (e) => { e.preventDefault(); load(); } }, "刷新")));
			if (tlEv) kids.push(h(Timeline, { key: "tl", e: tlEv, items: itemsOf(tlEv), snapTs: d.ts, onClose: closeTl, start }));
			return page(kids);
		}

		function HotIcon({ size }) {
			const s = size || 16;
			return h("svg", { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
				h("path", { d: "M1.5 9h2.6l1.6-4.5 2.6 8 2-5.5 1 2h3.2" }));
		}
		function KbIcon({ size }) {
			const s = size || 16;
			return h("svg", { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
				h("circle", { cx: 6, cy: 5.5, r: 2.5 }),
				h("path", { d: "M1.8 13.5c.6-2.3 2.2-3.6 4.2-3.6s3.6 1.3 4.2 3.6" }),
				h("path", { d: "M11 4.5h3.2M11 7h3.2M12 9.5h2.2" }));
		}

		// ---------- 挂进 DSH ----------
		const inject = ["slots", "uiWorkspace", "workspaces"];
		function apply(ctx) {
			let WS = "";   // config.json 的 dsh_workspace：「聊聊」开在哪个工作区；没填就开在当前工作区
			getJson("/api/meta").then((m) => { WS = (m && m.workspace) || ""; }).catch(() => {});
			const start = (prompt) => {
				let id;
				if (WS) {
					const snap = ctx.workspaces.list.getSnapshot() || {};
					const ws = (snap.items || snap.workspaces || []).find((w) => w.path === WS);
					id = ws ? ws.workspaceId : void 0;
				}
				ctx.uiWorkspace.startSession(id, { prompt, whenDraftExists: "replace" });
			};
			ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: KB_ID, inject: () => ({ start }) }, KbPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: KB_ID, order: 6, label: () => "AI 大佬知识库" }, KbIcon));
			ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: HOT_ID, inject: () => ({ start }) }, HotPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: HOT_ID, order: 7, label: () => "AI 热点监控" }, HotIcon));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.pages = { KbPage, HotPage, KbIcon, HotIcon };   // 浏览器版（web/index.html）用
		return module.exports;
	}
});
