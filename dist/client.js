// dhs-aplan browser half: settings page on Plugins → dhs-aplan (plugins.bundle.config slot).
// Hand-written in the DSH client-module factory format (no bundler needed).
// Slot must use options.key = package name ("dhs-aplan"); plugin-manager matches
// plugins.bundle.config via entryKey: pkg.name (keyed slot), not id.
//
// Layout (0.3.8): GLOBAL top = baseUrl + intervals + enabled + site-default session toggles.
// Per-role cards: Identity + Connection secret fields (claimKey/mcpBearer password) + status; claimKeyEnv/mcpBearerEnv in advanced;
// mcpPath + mcpCommentTool + Run + Session collapse into default-closed 「高级选项」 accordion
// (expand state per card, component state only).
// cwd = combobox of known workspaces + 「浏览…」 via Desktop __DSH_DIRECTORY_PICKER__.
window.__ModuleLoader__.load({
	id: "dhs-aplan",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const { jsx, jsxs } = require("react/jsx-runtime");
		const React = require("react");
		const { useState, useMemo, useRef } = React;
		const P = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "settings.dhsAplan";
		const CONFIG_NS = "dhs-aplan";
		const PACKAGE_KEY = "dhs-aplan";
		/** Write-only secret drafts keyed by role key; flushed on Save via credentials remote. Never persisted in roles[]. */
		const pendingSecrets = new Map();
		function autoKeyRef(roleKey) {
			const k = String(roleKey || "DEV").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "DEV";
			return "APLAN_KEY_" + k;
		}
		function autoMcpRef(roleKey) {
			const k = String(roleKey || "DEV").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "DEV";
			return "APLAN_MCP_" + k;
		}
		function statusLabel(t, st) {
			if (st === "paused") return t("statusPaused");
			if (st === "error") return t("statusError");
			if (st === "no-key" || st === "disconnected") return t("statusDisconnected");
			if (st === "claiming") return t("statusClaiming");
			if (st === "running") return t("statusRunning");
			if (st === "idle" || st === "connected") return t("statusConnected");
			return t("statusDisconnected");
		}
		function statusColor(st) {
			if (st === "paused") return "#888";
			if (st === "error") return "#c44";
			if (st === "no-key" || st === "disconnected") return "#c80";
			if (st === "running" || st === "claiming") return "#08c";
			return "#2a7";
		}


		const FIVE_ROLE_TEMPLATE = [
			{ key: "req", role: "需求分析", claimKeyEnv: "APLAN_KEY_REQ", mcpBearerEnv: "APLAN_MCP_REQ", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "swa", role: "架构", claimKeyEnv: "APLAN_KEY_SWA", mcpBearerEnv: "APLAN_MCP_SWA", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "dev", role: "开发", claimKeyEnv: "APLAN_KEY_DEV", mcpBearerEnv: "", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "review", role: "评审", claimKeyEnv: "APLAN_KEY_REVIEW", mcpBearerEnv: "APLAN_MCP_REVIEW", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "test", role: "测试", claimKeyEnv: "APLAN_KEY_TEST", mcpBearerEnv: "APLAN_MCP_TEST", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
		];

		const zh = {
			title: "dhs-aplan（It's a Plan）",
			description: "It's a Plan 外部 Agent 领取 → Harness 会话 → 回写结果。",
			enabled: "启用", enabledHint: "关闭后插件不再领取任何角色的 run。",
			baseUrl: "Plan 地址", baseUrlHint: "例如 http://192.168.10.146:8001",
			mode: "模式",
			modeHint: "harness = 真实 Agent 回合；dry-run = 只领取/评论后直接回 success（联调用，不跑 Harness）。",
			role: "角色名（会话标题显示）",
			claimKeyEnv: "领取 Key 环境变量名", claimKeyEnvHint: "填环境变量名（不是 Key 本身），例如 APLAN_KEY_DEV。",
			mcpBearerEnv: "MCP 写回 Key 环境变量名", mcpBearerEnvHint: "留空 = 复用领取 Key。",
			mcpPath: "MCP 路径", mcpPathHint: "默认 /mcp；留空则用全站默认。",
			mcpCommentTool: "评论工具名", mcpCommentToolHint: "领取后发评论用的 MCP 工具，例如 create_issue_comment。",
			postClaimComment: "领取后发评论",
			cwd: "工作目录（绝对路径，可选）", cwdHint: "留空 = 不设 cwd、会话不挂工作区。填则须为绝对路径。",
			provider: "Provider", providerHint: "留空 = profile 默认。",
			model: "模型", modelHint: "留空 = profile 默认。",
			pollIntervalMs: "轮询间隔（ms）", heartbeatIntervalMs: "心跳间隔（ms）", heartbeatIntervalMsHint: "须小于 Plan lease（30s）。",
			turnTimeoutMs: "单回合超时（ms）", turnTimeoutMsHint: "0 = 不限；超时会中断回合并回报 failed。",
			sessionIdPrefix: "会话 id 前缀",
			reuseSessionPerIssue: "同一 issue 复用会话",
			disposeAfterRun: "回合结束后释放会话",
			mountPlanMcp: "给 Agent 挂载 Plan MCP 工具",
			setSessionTitle: "按规范设置会话标题",
			renameExistingSession: "复用会话时也纠正标题",
			roles: "角色列表",
			rolesHint: "每个角色一张卡片（身份 / 连接 / 运行 / 会话）。列表为空时显示一张默认可编辑卡，编辑后写入 roles[0]。",
			rolesAdd: "添加角色",
			rolesRemove: "删除",
			rolesTemplate: "填入五角色模板",
			rolesEmptyHint: "尚未保存多角色；编辑下方默认卡会写入 roles[0]。",
			roleKey: "key（slug）",
			roleDisplay: "角色显示名",
			roleEnabled: "启用",
			sectionIdentity: "身份",
			sectionConn: "连接与 Key",
			sectionRun: "运行",
			sectionSession: "会话（本角色）",
			sectionAdvanced: "高级选项",
			cwdBrowse: "浏览…",
			cwdComboHint: "下拉有已知工作区，也可输入或点浏览；修改只影响新会话。",
			cwdBrowseUnavailable: "当前环境无法打开系统文件夹选择器，请手动输入绝对路径。",
			siteDefaults: "全站默认",
			invalid: "格式不对", invalidMode: "只能是 harness 或 dry-run", invalidJson: "需要 JSON 数组",
			overridden: "已覆盖", reset: "恢复默认",
			readOnly: "本部署的设置为只读。", unavailable: "dhs-aplan 未加载（或缺少 schema），暂时无法配置。",
			save: "保存", saving: "保存中…", saveFailed: "部署没有接受这些值，已保留供你修改。",
			groupGlobal: "全局", groupArchive: "自动归档", groupSiteSession: "全站默认 · 会话", groupRoles: "角色",
			claimKey: "领取 Key", claimKeyHint: "直接粘贴 API Key（密码框）；保存后写入 DSH 凭据库，不会写进 patch。已保存则留空保持。",
			mcpBearer: "MCP 写回 Key（可选，空=同领取）", mcpBearerHint: "留空 = 与领取 Key 相同。",
			claimKeyEnv: "领取 Key 环境变量名（高级）", claimKeyEnvHint: "一般不用改。默认 APLAN_KEY_<角色>；也可填自定义凭据名。",
			mcpBearerEnv: "MCP 写回 Key 环境变量名（高级）", mcpBearerEnvHint: "留空 = 复用领取 Key 凭据。",
			claimKeyConfigured: "已配置（留空保持）",
			claimKeyMissing: "未配置",
			statusConnected: "已接入",
			statusDisconnected: "未接入",
			statusPaused: "已暂停",
			statusError: "异常",
			statusNoKey: "未接入",
			statusIdle: "已接入",
			statusClaiming: "领取中",
			statusRunning: "运行中",
			statusTitle: "连接状态",
			statusHint: "暂停 = 关闭该角色「启用」。Key 存在于 DSH 凭据库（%APPDATA%\\dsh-desktop\\harness\\.credentials.yaml），不进 cordis.patch。",
			pauseRole: "启用（关闭=暂停领取）",
			reasoningEffort: "推理强度",
			reasoningEffortHint: "写入 AgentOptions.reasoningEffort；留空 = 模型默认。取值视模型而定（off/minimal/low/medium/high/xhigh）。",
			archiveDoneThreads: "自动归档（完成/取消的 Issue 会话）",
			archiveDoneThreadsHint: "CodexHub 对等项。DSH 尚无按 Plan 看板列归档会话的 API；开启后仅打日志（可先开「仅演练」）。",
			archiveDryRun: "归档仅演练（只记日志）",
			archiveSweepMinutes: "归档扫描间隔（分钟）",
			archiveGraceMinutes: "完成后等待再归档（分钟）",
			sectionArchive: "自动归档（实验）",
			lastClaim: "上次领取",
			lastHeartbeat: "上次心跳",
			lastError: "上次错误",
		};
		const en = Object.assign({}, zh, {
			description: "It's a Plan external agent: claim → Harness session → report.",
			modeHint: "harness = real Agent turn; dry-run = claim/comment then success without a Harness turn (for integration tests).",
			cwd: "Working directory (absolute, optional)", cwdHint: "Empty = no cwd / session stays ungrouped. Must be absolute when set.",
			roles: "Roles",
			rolesHint: "One card per role (identity / connection / run / session). Empty list shows one editable default card that writes roles[0].",
			rolesAdd: "Add role",
			rolesRemove: "Delete",
			rolesTemplate: "Fill five-role template",
			rolesEmptyHint: "No roles saved yet; editing the default card writes roles[0].",
			roleKey: "key (slug)",
			roleDisplay: "Display name",
			roleEnabled: "Enabled",
			sectionIdentity: "Identity",
			sectionConn: "Connection & keys",
			sectionRun: "Run",
			sectionSession: "Session (this role)",
			sectionAdvanced: "Advanced",
			cwdBrowse: "Browse…",
			cwdComboHint: "Dropdown lists known workspaces; type freely or Browse. Changes apply to new sessions only.",
			cwdBrowseUnavailable: "No native folder picker here — type an absolute path.",
			siteDefaults: "Site defaults",
			save: "Save", saving: "Saving…", reset: "Reset", overridden: "Overridden",
			groupGlobal: "Global", groupArchive: "Auto-archive", groupSiteSession: "Site defaults · Session", groupRoles: "Roles",
			claimKey: "Claim key", claimKeyHint: "Paste the API key (password field). Saved into the DSH credentials store, never into the patch. Leave blank to keep.",
			mcpBearer: "MCP writeback key (optional, empty=same as claim)", mcpBearerHint: "Empty = reuse claim key.",
			claimKeyEnv: "Claim key env/ref (advanced)", claimKeyEnvHint: "Usually leave as APLAN_KEY_<role>.",
			mcpBearerEnv: "MCP writeback env/ref (advanced)", mcpBearerEnvHint: "Empty = reuse claim credential.",
			claimKeyConfigured: "Configured (leave blank to keep)",
			claimKeyMissing: "Not configured",
			statusConnected: "Connected",
			statusDisconnected: "Not connected",
			statusPaused: "Paused",
			statusError: "Error",
			statusNoKey: "Not connected",
			statusIdle: "Connected",
			statusClaiming: "Claiming",
			statusRunning: "Running",
			statusTitle: "Connection status",
			statusHint: "Pause = turn off role Enabled. Keys live in the DSH credentials store, not cordis.patch.",
			pauseRole: "Enabled (off = pause claiming)",
			reasoningEffort: "Reasoning effort",
			reasoningEffortHint: "Passed as AgentOptions.reasoningEffort; empty = model default.",
			archiveDoneThreads: "Auto-archive (completed/canceled issue sessions)",
			archiveDoneThreadsHint: "CodexHub parity. DSH has no Plan-column archive API yet; enabling only logs (prefer dry-run first).",
			archiveDryRun: "Archive dry-run (log only)",
			archiveSweepMinutes: "Archive sweep interval (minutes)",
			archiveGraceMinutes: "Grace after complete (minutes)",
			sectionArchive: "Auto-archive (experimental)",
			lastClaim: "Last claim",
			lastHeartbeat: "Last heartbeat",
			lastError: "Last error",
		});

		const text = (f) => P.settingsTextField(f);
		const num = (f) => P.settingsNumberField(f);
		const bool = (f) => ({
			field: f,
			format: (v) => (v === true ? "true" : v === false ? "false" : ""),
			parse: (t) => (t === "" ? { kind: "clear" } : t === "true" ? { kind: "set", value: true } : t === "false" ? { kind: "set", value: false } : void 0),
		});
		/** Persist roles as a JSON array string in the form; empty / [] → clear so backend keeps single top-level 开发. */
		const json = (f) => ({
			field: f,
			format: (v) => (Array.isArray(v) && v.length ? JSON.stringify(v) : ""),
			parse: (t) => { const s = t.trim(); if (s === "" || s === "[]") return { kind: "clear" }; try { const v = JSON.parse(s); return Array.isArray(v) ? { kind: "set", value: v } : void 0; } catch { return void 0; } },
		});

		// GLOBAL only: baseUrl, intervals, enabled master switch, site-default session toggles.
		// Per-role fields live inside RolesListEditor cards (and roles[] schema).
		const FIELDS = [
			["groupGlobal", [["enabled", bool], ["baseUrl", text], ["pollIntervalMs", num], ["heartbeatIntervalMs", num], ["turnTimeoutMs", num]]],
			["groupArchive", [["archiveDoneThreads", bool], ["archiveDryRun", bool], ["archiveSweepMinutes", num], ["archiveGraceMinutes", num]]],
			["groupSiteSession", [["setSessionTitle", bool], ["renameExistingSession", bool], ["reuseSessionPerIssue", bool], ["disposeAfterRun", bool]]],
			["groupRoles", [["roles", json]]],
		];
		const SPECS = [];
		const KIND = {};
		for (const [, items] of FIELDS) for (const [f, mk] of items) { SPECS.push(mk(f)); KIND[f] = mk; }

		const ROW_STYLE = {
			border: "1px solid var(--dsw-alias-border-primary, #ddd)",
			borderRadius: 8,
			padding: 12,
			marginTop: 8,
			display: "flex",
			flexDirection: "column",
			gap: 10,
		};
		const ROW_HEAD = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
		const GRID = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
		const FIELD = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
		const LABEL = { color: "var(--dsw-alias-label-secondary, #666)", fontSize: 12 };
		const SECTION = { fontSize: 12, fontWeight: 600, marginTop: 4, color: "var(--dsw-alias-label-secondary, #666)" };
		const INPUT = {
			fontSize: 13,
			padding: "6px 8px",
			borderRadius: 6,
			border: "1px solid var(--dsw-alias-border-primary, #ccc)",
			background: "var(--dsw-alias-background-primary, transparent)",
			color: "inherit",
			width: "100%",
			boxSizing: "border-box",
		};
		const ACTIONS = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 };
		const HELP_BADGE = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 16,
			height: 16,
			borderRadius: "50%",
			border: "1px solid var(--dsw-alias-border-primary, #999)",
			fontSize: 11,
			lineHeight: "16px",
			cursor: "help",
			color: "var(--dsw-alias-label-secondary, #666)",
			flexShrink: 0,
		};

		function parseRoles(textValue) {
			const s = String(textValue || "").trim();
			if (!s || s === "[]") return [];
			try {
				const v = JSON.parse(s);
				return Array.isArray(v) ? v.map(normalizeRole).filter(Boolean) : [];
			} catch {
				return [];
			}
		}

		function normalizeRole(r) {
			if (!r || typeof r !== "object") return null;
			return {
				key: typeof r.key === "string" ? r.key : "",
				role: typeof r.role === "string" ? r.role : "",
				enabled: r.enabled === false ? false : true,
				claimKeyEnv: typeof r.claimKeyEnv === "string" ? r.claimKeyEnv : "",
				mcpBearerEnv: typeof r.mcpBearerEnv === "string" ? r.mcpBearerEnv : "",
				mcpPath: typeof r.mcpPath === "string" ? r.mcpPath : "",
				mcpCommentTool: typeof r.mcpCommentTool === "string" ? r.mcpCommentTool : "",
				postClaimComment: r.postClaimComment === false ? false : true,
				cwd: typeof r.cwd === "string" ? r.cwd : "",
				mode: r.mode === "dry-run" ? "dry-run" : r.mode === "harness" ? "harness" : "harness",
				provider: typeof r.provider === "string" ? r.provider : "",
				model: typeof r.model === "string" ? r.model : "",
				reasoningEffort: typeof r.reasoningEffort === "string" ? r.reasoningEffort : "",
				sessionIdPrefix: typeof r.sessionIdPrefix === "string" ? r.sessionIdPrefix : "",
				reuseSessionPerIssue: r.reuseSessionPerIssue === false ? false : (r.reuseSessionPerIssue === true ? true : undefined),
				setSessionTitle: r.setSessionTitle === false ? false : (r.setSessionTitle === true ? true : undefined),
				renameExistingSession: r.renameExistingSession === false ? false : (r.renameExistingSession === true ? true : undefined),
				disposeAfterRun: r.disposeAfterRun === false ? false : (r.disposeAfterRun === true ? true : undefined),
				mountPlanMcp: r.mountPlanMcp === false ? false : true,
			};
		}

		function serializeRoles(roles) {
			if (!roles.length) return "";
			const cleaned = roles.map((r) => {
				const out = {
					key: String(r.key || "").trim(),
					role: String(r.role || "").trim(),
					enabled: r.enabled !== false,
					claimKeyEnv: String(r.claimKeyEnv || "").trim(),
					mcpBearerEnv: String(r.mcpBearerEnv || "").trim(),
					cwd: String(r.cwd || "").trim(),
					mode: r.mode === "dry-run" ? "dry-run" : "harness",
					postClaimComment: r.postClaimComment !== false,
					mountPlanMcp: r.mountPlanMcp !== false,
				};
				const mcpPath = String(r.mcpPath || "").trim();
				const mcpCommentTool = String(r.mcpCommentTool || "").trim();
				const provider = String(r.provider || "").trim();
				const model = String(r.model || "").trim();
				const reasoningEffort = String(r.reasoningEffort || "").trim();
				const sessionIdPrefix = String(r.sessionIdPrefix || "").trim();
				if (mcpPath) out.mcpPath = mcpPath;
				if (mcpCommentTool) out.mcpCommentTool = mcpCommentTool;
				if (provider) out.provider = provider;
				if (model) out.model = model;
				if (reasoningEffort) out.reasoningEffort = reasoningEffort;
				if (sessionIdPrefix) out.sessionIdPrefix = sessionIdPrefix;
				if (typeof r.reuseSessionPerIssue === "boolean") out.reuseSessionPerIssue = r.reuseSessionPerIssue;
				if (typeof r.setSessionTitle === "boolean") out.setSessionTitle = r.setSessionTitle;
				if (typeof r.renameExistingSession === "boolean") out.renameExistingSession = r.renameExistingSession;
				if (typeof r.disposeAfterRun === "boolean") out.disposeAfterRun = r.disposeAfterRun;
				return out;
			});
			return JSON.stringify(cleaned);
		}

		function blankRole() {
			return {
				key: "dev",
				role: "开发",
				enabled: true,
				claimKeyEnv: "APLAN_KEY_DEV",
				mcpBearerEnv: "",
				mcpPath: "",
				mcpCommentTool: "",
				postClaimComment: true,
				cwd: "",
				mode: "harness",
				provider: "",
				model: "",
				reasoningEffort: "",
				sessionIdPrefix: "",
				reuseSessionPerIssue: undefined,
				setSessionTitle: undefined,
				renameExistingSession: undefined,
				disposeAfterRun: undefined,
				mountPlanMcp: true,
			};
		}


		const CWD_HISTORY_KEY = "dhs-aplan-cwd-history";
		const CWD_HISTORY_MAX = 20;
		/** Soft-filled from apply() when uiWorkspace is available. */
		let knownWorkspacePaths = [];

		function loadCwdHistory() {
			try {
				const raw = localStorage.getItem(CWD_HISTORY_KEY);
				if (!raw) return [];
				const v = JSON.parse(raw);
				return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
			} catch {
				return [];
			}
		}

		function pushCwdHistory(cwd) {
			const p = String(cwd || "").trim();
			if (!p) return;
			try {
				const next = [p].concat(loadCwdHistory().filter((x) => x !== p)).slice(0, CWD_HISTORY_MAX);
				localStorage.setItem(CWD_HISTORY_KEY, JSON.stringify(next));
			} catch (_) {}
		}

		function collectKnownCwds(extra) {
			const seen = new Set();
			const out = [];
			const add = (p) => {
				const s = String(p || "").trim();
				if (!s || seen.has(s)) return;
				seen.add(s);
				out.push(s);
			};
			for (const p of knownWorkspacePaths) add(p);
			for (const p of loadCwdHistory()) add(p);
			if (extra) add(extra);
			return out;
		}

		function refreshKnownWorkspaces(uiWorkspace) {
			try {
				const snap = uiWorkspace && uiWorkspace.workspaces && uiWorkspace.workspaces.list
					? uiWorkspace.workspaces.list.getSnapshot()
					: null;
				const items = snap && Array.isArray(snap.items) ? snap.items : [];
				knownWorkspacePaths = items
					.map((it) => (it && typeof it.path === "string" ? it.path.trim() : ""))
					.filter(Boolean);
			} catch (_) {
				knownWorkspacePaths = [];
			}
		}

		/**
		 * Desktop: window.__DSH_DIRECTORY_PICKER__.pick() → native OS folder dialog (IPC directory-picker:open).
		 * Fallback: <input webkitdirectory> + __DSH_HOST_PATHS__.pathFor(file) for absolute path.
		 * @returns {Promise<string|null>}
		 */
		async function pickDirectoryNative() {
			const desktop = typeof globalThis !== "undefined" ? globalThis.__DSH_DIRECTORY_PICKER__ : undefined;
			if (desktop && typeof desktop.pick === "function") {
				try {
					const path = await desktop.pick();
					return typeof path === "string" && path ? path : null;
				} catch (err) {
					console.warn("[dhs-aplan] __DSH_DIRECTORY_PICKER__.pick failed:", err);
				}
			}
			return pickDirectoryViaWebkit();
		}

		function pickDirectoryViaWebkit() {
			return new Promise((resolve) => {
				try {
					const input = document.createElement("input");
					input.type = "file";
					input.setAttribute("webkitdirectory", "");
					input.setAttribute("directory", "");
					input.style.display = "none";
					const cleanup = () => { try { input.remove(); } catch (_) {} };
					input.addEventListener("change", () => {
						const file = input.files && input.files[0];
						cleanup();
						if (!file) { resolve(null); return; }
						const host = typeof globalThis !== "undefined" ? globalThis.__DSH_HOST_PATHS__ : undefined;
						let abs = null;
						if (host && typeof host.pathFor === "function") {
							try { abs = host.pathFor(file); } catch (_) {}
						}
						if (typeof abs === "string" && abs) {
							// file path → parent directory (folder the user picked)
							const norm = abs.replace(/\\/g, "/");
							const slash = Math.max(norm.lastIndexOf("/"), abs.lastIndexOf("\\"));
							const dir = slash > 0 ? abs.slice(0, slash) : abs;
							// If webkitRelativePath is "folder/file", strip that relative suffix for true root
							const rel = file.webkitRelativePath || "";
							if (rel) {
								const top = rel.split(/[\\/]/)[0];
								const idx = dir.toLowerCase().lastIndexOf(top.toLowerCase());
								if (idx >= 0) {
									resolve(dir.slice(0, idx + top.length));
									return;
								}
							}
							resolve(dir);
							return;
						}
						resolve(null);
					});
					input.addEventListener("cancel", () => { cleanup(); resolve(null); });
					document.body.appendChild(input);
					input.click();
				} catch (err) {
					console.warn("[dhs-aplan] webkitdirectory fallback failed:", err);
					resolve(null);
				}
			});
		}

		function CwdCombobox(props) {
			const { t, value, disabled, onChange } = props;
			const listId = props.listId || "dhs-aplan-cwd-list";
			const options = useMemo(() => collectKnownCwds(value), [value, knownWorkspacePaths.join("\0")]);
			const browsing = useRef(false);
			const onBrowse = async () => {
				if (disabled || browsing.current) return;
				browsing.current = true;
				try {
					const picked = await pickDirectoryNative();
					if (picked) {
						pushCwdHistory(picked);
						onChange(picked);
					} else if (!globalThis.__DSH_DIRECTORY_PICKER__ && !globalThis.__DSH_HOST_PATHS__) {
						console.warn("[dhs-aplan]", t("cwdBrowseUnavailable"));
					}
				} finally {
					browsing.current = false;
				}
			};
			return jsxs("label", {
				style: FIELD,
				children: [
					jsx("span", { style: LABEL, children: t("cwd") }),
					jsxs("div", {
						style: { display: "flex", gap: 6, alignItems: "center" },
						children: [
							jsx("input", {
								style: { ...INPUT, flex: 1 },
								list: listId,
								value: value,
								disabled,
								placeholder: "可选，留空 = 不设 cwd",
								onChange: (e) => onChange(e.target.value),
								onBlur: (e) => pushCwdHistory(e.target.value),
							}),
							jsx("datalist", {
								id: listId,
								children: options.map((p) => jsx("option", { value: p }, p)),
							}),
							jsx(P.Button, {
								variant: "secondary",
								size: "sm",
								disabled,
								onClick: () => { void onBrowse(); },
								children: t("cwdBrowse"),
							}),
						],
					}),
					jsx("span", { style: { ...LABEL, fontSize: 11, opacity: 0.85 }, children: t("cwdComboHint") }),
				],
			});
		}

		
		function RoleSecretField(props) {
			const [revealed, setRevealed] = useState(false);
			const filled = String(props.value || "").length > 0;
			return jsxs("label", {
				style: FIELD,
				children: [
					jsxs("span", {
						style: { display: "flex", alignItems: "center", gap: 6 },
						children: [
							jsx("span", { style: LABEL, children: props.label }),
							props.configured
								? jsx("span", { style: { ...LABEL, fontSize: 11, color: "var(--dsw-alias-label-success, #2a7)" }, children: props.configuredLabel })
								: jsx("span", { style: { ...LABEL, fontSize: 11 }, children: props.missingLabel }),
						],
					}),
					jsxs("div", {
						style: { display: "flex", gap: 6, alignItems: "center" },
						children: [
							jsx("input", {
								style: { ...INPUT, flex: 1 },
								type: revealed ? "text" : "password",
								autoComplete: "new-password",
								value: props.value,
								disabled: props.disabled,
								placeholder: props.placeholder || "",
								onChange: (e) => props.onChange(e.target.value),
							}),
							filled
								? jsx(P.Button, {
										variant: "ghost",
										size: "sm",
										disabled: props.disabled,
										onClick: () => setRevealed((v) => !v),
										children: revealed ? "隐藏" : "显示",
									})
								: null,
						],
					}),
					props.hint ? jsx("span", { style: { ...LABEL, fontSize: 11, opacity: 0.85 }, children: props.hint }) : null,
				],
			});
		}

		function EffortSelect(props) {
			return jsxs("label", {
				style: FIELD,
				children: [
					jsx("span", { style: LABEL, children: props.label }),
					jsxs("select", {
						style: INPUT,
						value: props.value || "",
						disabled: props.disabled,
						onChange: (e) => props.onChange(e.target.value),
						children: [
							jsx("option", { value: "", children: "默认（模型）" }),
							jsx("option", { value: "off", children: "off" }),
							jsx("option", { value: "minimal", children: "minimal" }),
							jsx("option", { value: "low", children: "low" }),
							jsx("option", { value: "medium", children: "medium" }),
							jsx("option", { value: "high", children: "high" }),
							jsx("option", { value: "xhigh", children: "xhigh" }),
						],
					}),
					props.hint ? jsx("span", { style: { ...LABEL, fontSize: 11, opacity: 0.85 }, children: props.hint }) : null,
				],
			});
		}

function RoleField(props) {
			return jsxs("label", {
				style: FIELD,
				children: [
					jsx("span", { style: LABEL, children: props.label }),
					jsx("input", {
						style: INPUT,
						value: props.value,
						disabled: props.disabled,
						placeholder: props.placeholder || "",
						onChange: (e) => props.onChange(e.target.value),
					}),
					props.hint ? jsx("span", { style: { ...LABEL, fontSize: 11, opacity: 0.85 }, children: props.hint }) : null,
				],
			});
		}

		function RoleBool(props) {
			return jsxs("label", {
				style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 12 },
				children: [
					jsx("span", { children: props.label }),
					jsx(P.Switch, {
						checked: props.value === true,
						label: props.label,
						disabled: props.disabled,
						onChange: (c) => props.onChange(c),
					}),
				],
			});
		}

		/** Mode <select> + 「？」 hover help (harness vs dry-run). */
		function ModeSelect(props) {
			return jsxs("label", {
				style: FIELD,
				children: [
					jsxs("span", {
						style: { display: "flex", alignItems: "center", gap: 6 },
						children: [
							jsx("span", { style: LABEL, children: props.label }),
							jsx("span", {
								style: HELP_BADGE,
								title: props.hint,
								"aria-label": props.hint,
								children: "？",
							}),
						],
					}),
					jsxs("select", {
						style: INPUT,
						value: props.value === "dry-run" ? "dry-run" : "harness",
						disabled: props.disabled,
						onChange: (e) => props.onChange(e.target.value),
						children: [
							jsx("option", { value: "harness", children: "harness" }),
							jsx("option", { value: "dry-run", children: "dry-run" }),
						],
					}),
				],
			});
		}

		/** Tri-state site-default override: undefined = inherit「全站默认」, true/false = override. */
		function RoleBoolInherit(props) {
			const val = props.value;
			const selectVal = val === true ? "true" : val === false ? "false" : "inherit";
			return jsxs("label", {
				style: FIELD,
				children: [
					jsx("span", { style: LABEL, children: props.label }),
					jsxs("select", {
						style: INPUT,
						value: selectVal,
						disabled: props.disabled,
						onChange: (e) => {
							const v = e.target.value;
							props.onChange(v === "inherit" ? undefined : v === "true");
						},
						children: [
							jsx("option", { value: "inherit", children: "继承「全站默认」" }),
							jsx("option", { value: "true", children: "是" }),
							jsx("option", { value: "false", children: "否" }),
						],
					}),
				],
			});
		}

		function RolesListEditor(props) {
			const { t, disabled, fieldState, onEdit, onReset } = props;
			// props.runtimeByKey / props.credByRef optional
			const roles = parseRoles(fieldState.text);
			const virtual = roles.length === 0;
			const display = virtual ? [blankRole()] : roles;
			const commit = (next) => onEdit(serializeRoles(next));
			// Expand state per card (component state only — not persisted).
			const [advancedOpen, setAdvancedOpen] = useState({});

			const patch = (index, patchObj) => {
				if (virtual) {
					commit([{ ...blankRole(), ...patchObj }]);
					return;
				}
				commit(roles.map((r, i) => (i === index ? { ...r, ...patchObj } : r)));
			};
			const removeAt = (index) => {
				if (virtual) return;
				commit(roles.filter((_, i) => i !== index));
			};
			const addRole = () => commit((virtual ? [] : roles).concat([blankRole()]));
			const fillTemplate = () => commit(FIVE_ROLE_TEMPLATE.map((r) => ({ ...blankRole(), ...r })));
			const toggleAdvanced = (cardKey) => {
				setAdvancedOpen((prev) => ({ ...prev, [cardKey]: !prev[cardKey] }));
			};

			const rows = display.map((role, index) => {
				const cardKey = String(role.key || "") || ("#" + index);
				const advOpen = !!advancedOpen[cardKey];
				return jsxs(
					"div",
					{
						style: ROW_STYLE,
						children: [
							jsxs("div", {
								style: ROW_HEAD,
								children: [
									jsxs("label", {
										style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 },
										children: [
											jsx(P.Switch, {
												checked: role.enabled !== false,
												label: t("roleEnabled"),
												disabled,
												onChange: (c) => patch(index, { enabled: c }),
											}),
											jsx("span", { children: role.key || role.role || `#${index + 1}` }),
											virtual ? jsx("span", { style: { ...LABEL, fontSize: 11 }, children: t("rolesEmptyHint") }) : null,
										],
									}),
									!virtual
										? jsx(P.Button, {
												variant: "ghost",
												size: "sm",
												disabled,
												onClick: () => removeAt(index),
												icon: jsx(P.IconTrashOutlineRegular, { size: 14 }),
												children: t("rolesRemove"),
											})
										: null,
								],
							}),
							jsx("div", { style: SECTION, children: t("sectionIdentity") }),
							jsxs("div", {
								style: GRID,
								children: [
									jsx(RoleField, { label: t("roleKey"), value: role.key, disabled, placeholder: "dev", onChange: (v) => patch(index, { key: v }) }),
									jsx(RoleField, { label: t("roleDisplay"), value: role.role, disabled, placeholder: "开发", onChange: (v) => patch(index, { role: v }) }),
								],
							}),
							jsx("div", { style: SECTION, children: t("sectionConn") }),
							jsxs("div", {
								style: { marginBottom: 4, fontSize: 12, fontWeight: 600, color: statusColor((props.runtimeByKey && props.runtimeByKey[cardKey]) || (role.enabled === false ? "paused" : (props.credByRef && props.credByRef[role.claimKeyEnv || autoKeyRef(role.key)] ? "idle" : "no-key"))) },
								children: statusLabel(t, (props.runtimeByKey && props.runtimeByKey[cardKey] && props.runtimeByKey[cardKey].state) || (role.enabled === false ? "paused" : (props.credByRef && props.credByRef[String(role.claimKeyEnv || autoKeyRef(role.key)).trim()] ? "idle" : "no-key"))),
							}),
							jsxs("div", {
								style: GRID,
								children: [
									jsx(RoleSecretField, {
										label: t("claimKey"),
										value: (pendingSecrets.get(cardKey) || {}).claimKey || "",
										disabled,
										placeholder: (props.credByRef && props.credByRef[String(role.claimKeyEnv || autoKeyRef(role.key)).trim()]) ? t("claimKeyConfigured") : t("claimKeyMissing"),
										hint: t("claimKeyHint"),
										configured: !!(props.credByRef && props.credByRef[String(role.claimKeyEnv || autoKeyRef(role.key)).trim()]),
										configuredLabel: t("claimKeyConfigured"),
										missingLabel: t("claimKeyMissing"),
										onChange: (v) => {
											const cur = pendingSecrets.get(cardKey) || {};
											pendingSecrets.set(cardKey, { ...cur, claimKey: v });
											// force re-render via harmless patch
											patch(index, { claimKeyEnv: role.claimKeyEnv || autoKeyRef(role.key) });
										},
									}),
									jsx(RoleSecretField, {
										label: t("mcpBearer"),
										value: (pendingSecrets.get(cardKey) || {}).mcpBearer || "",
										disabled,
										placeholder: t("mcpBearerHint"),
										hint: t("mcpBearerHint"),
										configured: !!(props.credByRef && props.credByRef[String(role.mcpBearerEnv || "").trim()]),
										configuredLabel: t("claimKeyConfigured"),
										missingLabel: t("claimKeyMissing"),
										onChange: (v) => {
											const cur = pendingSecrets.get(cardKey) || {};
											pendingSecrets.set(cardKey, { ...cur, mcpBearer: v });
											patch(index, { mcpBearerEnv: role.mcpBearerEnv || "" });
										},
									}),
								],
							}),
							jsx(RoleBool, { label: t("postClaimComment"), value: role.postClaimComment !== false, disabled, onChange: (c) => patch(index, { postClaimComment: c }) }),
							jsx(RoleBool, { label: t("pauseRole"), value: role.enabled !== false, disabled, onChange: (c) => patch(index, { enabled: c }) }),
							// Advanced accordion: 运行 + 会话（本角色）, default collapsed
						jsxs("div", {
							style: {
								border: "1px solid var(--dsw-alias-border-primary, #ddd)",
								borderRadius: 6,
								marginTop: 4,
								overflow: "hidden",
							},
							children: [
								jsx("button", {
									type: "button",
									disabled: false,
									onClick: () => toggleAdvanced(cardKey),
									"aria-expanded": advOpen,
									style: {
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										width: "100%",
										padding: "8px 10px",
										fontSize: 12,
										fontWeight: 600,
										color: "var(--dsw-alias-label-secondary, #666)",
										background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.03))",
										border: "none",
										cursor: "pointer",
										textAlign: "left",
									},
									children: (advOpen ? "▾ " : "▸ ") + t("sectionAdvanced"),
								}),
								advOpen
									? jsxs("div", {
										style: { padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 10 },
										children: [
											jsxs("div", {
												style: GRID,
												children: [
													jsx(RoleField, { label: t("mcpPath"), value: role.mcpPath, disabled, placeholder: "/mcp", hint: t("mcpPathHint"), onChange: (v) => patch(index, { mcpPath: v }) }),
													jsx(RoleField, { label: t("mcpCommentTool"), value: role.mcpCommentTool, disabled, placeholder: "create_issue_comment", hint: t("mcpCommentToolHint"), onChange: (v) => patch(index, { mcpCommentTool: v }) }),
												],
											}),
											jsxs("div", {
												style: GRID,
												children: [
													jsx(RoleField, { label: t("claimKeyEnv"), value: role.claimKeyEnv, disabled, placeholder: "APLAN_KEY_DEV", hint: t("claimKeyEnvHint"), onChange: (v) => patch(index, { claimKeyEnv: v }) }),
													jsx(RoleField, { label: t("mcpBearerEnv"), value: role.mcpBearerEnv, disabled, placeholder: t("mcpBearerEnvHint"), onChange: (v) => patch(index, { mcpBearerEnv: v }) }),
												],
											}),
											jsx(EffortSelect, { label: t("reasoningEffort"), value: role.reasoningEffort, hint: t("reasoningEffortHint"), disabled, onChange: (v) => patch(index, { reasoningEffort: v }) }),
											jsx("div", { style: SECTION, children: t("sectionRun") }),
											jsxs("div", {
												style: GRID,
												children: [
													jsx(ModeSelect, { label: t("mode"), value: role.mode, hint: t("modeHint"), disabled, onChange: (v) => patch(index, { mode: v }) }),
													jsx("div", { style: { gridColumn: "1 / -1" }, children: jsx(CwdCombobox, {
														t,
														value: role.cwd,
														disabled,
														listId: "dhs-aplan-cwd-list-" + cardKey,
														onChange: (v) => patch(index, { cwd: v }),
													}) }),
													jsx(RoleField, { label: t("provider"), value: role.provider, disabled, placeholder: t("providerHint"), onChange: (v) => patch(index, { provider: v }) }),
													jsx(RoleField, { label: t("model"), value: role.model, disabled, placeholder: t("modelHint"), onChange: (v) => patch(index, { model: v }) }),
												],
											}),
											jsx(RoleBool, { label: t("mountPlanMcp"), value: role.mountPlanMcp !== false, disabled, onChange: (c) => patch(index, { mountPlanMcp: c }) }),
											jsx("div", { style: SECTION, children: t("sectionSession") }),
											jsxs("div", {
												style: GRID,
												children: [
													jsx(RoleField, { label: t("sessionIdPrefix"), value: role.sessionIdPrefix, disabled, placeholder: "dhs-aplan-dev-", onChange: (v) => patch(index, { sessionIdPrefix: v }) }),
													jsx(RoleBoolInherit, { label: t("reuseSessionPerIssue"), value: role.reuseSessionPerIssue, disabled, onChange: (v) => patch(index, { reuseSessionPerIssue: v }) }),
													jsx(RoleBoolInherit, { label: t("setSessionTitle"), value: role.setSessionTitle, disabled, onChange: (v) => patch(index, { setSessionTitle: v }) }),
													jsx(RoleBoolInherit, { label: t("renameExistingSession"), value: role.renameExistingSession, disabled, onChange: (v) => patch(index, { renameExistingSession: v }) }),
													jsx(RoleBoolInherit, { label: t("disposeAfterRun"), value: role.disposeAfterRun, disabled, onChange: (v) => patch(index, { disposeAfterRun: v }) }),
												],
											}),
										],
									})
									: null,
							],
						}),
						],
					},
					"role-" + index,
				);
			});

			return jsxs("div", {
				style: { marginTop: 4 },
				children: [
					jsxs("div", {
						style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
						children: [
							jsx("div", { style: { fontSize: 13 }, children: t("roles") }),
							fieldState.overridden
								? jsxs("span", {
										style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
										children: [
											jsx("span", { children: t("overridden") }),
											jsx(P.Button, { variant: "ghost", size: "sm", disabled, onClick: onReset, children: t("reset") }),
										],
									})
								: null,
						],
					}),
					jsx("p", {
						style: { margin: "4px 0 0", fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" },
						children: fieldState.invalid ? t("invalidJson") : t("rolesHint"),
					}),
					...rows,
					jsxs("div", {
						style: ACTIONS,
						children: [
							jsx(P.Button, {
								variant: "secondary",
								size: "sm",
								disabled,
								onClick: addRole,
								icon: jsx(P.IconPlusOutlineRegular, { size: 14 }),
								children: t("rolesAdd"),
							}),
							jsx(P.Button, {
								variant: "ghost",
								size: "sm",
								disabled,
								onClick: fillTemplate,
								children: t("rolesTemplate"),
							}),
						],
					}),
				],
			});
		}

		function AplanCard(props) {
			const { t } = props;
			const state = props.useAplanCard((s) => s);
			if (props.view === "summary") return t("description");
			const disabled = !state.writable || state.saving;
			const children = [];
			for (const [group, items] of FIELDS) {
				const title =
					group === "groupSiteSession"
						? t("groupSiteSession")
						: t(group);
				children.push(jsx("h4", { style: { margin: "12px 0 0", fontSize: 13, fontWeight: 600 }, children: title }, "g-" + group));
				if (group === "groupArchive") {
					children.push(jsx("h4", { style: { margin: "12px 0 0", fontSize: 13, fontWeight: 600 }, children: t("sectionArchive") }, "g-archive-title"));
					children.push(
						jsx("p", {
							style: { margin: "4px 0 0", fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" },
							children: t("archiveDoneThreadsHint"),
						}, "hint-archive"),
					);
				}
				if (group === "groupSiteSession") {
					children.push(
						jsx("p", {
							style: { margin: "4px 0 0", fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" },
							children: t("siteDefaults") + " — 角色卡可逐项覆盖；未覆盖则用这里。",
						}, "hint-" + group),
					);
				}
				for (const [f, mk] of items) {
					const fs = state.fields[f];
					if (f === "roles") {
						children.push(
							jsx(
								RolesListEditor,
								{
									t,
									disabled,
									fieldState: fs,
									runtimeByKey: state.runtimeByKey || {},
									credByRef: state.credByRef || {},
									onEdit: (v) => props.edit(f, v),
									onReset: () => props.resetField(f),
								},
								f,
							),
						);
						continue;
					}
					if (mk === bool) {
						children.push(jsxs("label", {
							style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize: 13 },
							children: [jsx("span", { children: t(f) }), jsx(P.Switch, { checked: fs.text === "true", label: t(f), disabled, onChange: (c) => props.edit(f, c ? "true" : "false") })],
						}, f));
						continue;
					}
					const hintKey = f + "Hint";
					children.push(jsx(P.SettingsValueField, {
						id: "dhs-aplan-" + f,
						label: t(f),
						hint: zh[hintKey] ? t(hintKey) : void 0,
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalid"),
						numeric: mk === num,
						disabled,
						...fs,
						onEdit: (v) => props.edit(f, v),
						onReset: () => props.resetField(f),
					}, f));
				}
			}
			const statusKids = [];
			statusKids.push(jsx("h4", { style: { margin: "0 0 4px", fontSize: 13, fontWeight: 600 }, children: t("statusTitle") }, "status-title"));
			statusKids.push(jsx("p", { style: { margin: "0 0 8px", fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" }, children: t("statusHint") }, "status-hint"));
			const runtimeList = Array.isArray(state.runtimeList) ? state.runtimeList : [];
			if (runtimeList.length) {
				for (const row of runtimeList) {
					statusKids.push(jsxs("div", {
						style: { display: "flex", gap: 12, alignItems: "baseline", fontSize: 12, marginBottom: 4 },
						children: [
							jsx("span", { style: { fontWeight: 600, color: statusColor(row.state), minWidth: 64 }, children: statusLabel(t, row.state) }),
							jsx("span", { children: (row.role || row.roleKey || "?") + (row.roleKey ? " (" + row.roleKey + ")" : "") }),
							row.lastClaimAt ? jsx("span", { style: LABEL, children: t("lastClaim") + ": " + String(row.lastClaimAt).slice(11, 19) }) : null,
							row.lastError ? jsx("span", { style: { color: "#c44" }, children: t("lastError") + ": " + row.lastError }) : null,
						],
					}, "st-" + (row.roleKey || row.role)));
				}
			} else {
				statusKids.push(jsx("div", { style: { fontSize: 12, color: "#888" }, children: "—" }, "status-empty"));
			}
			return jsx(P.SettingsForm, {
				labels: { unavailable: t("unavailable"), readOnly: t("readOnly"), saveFailed: t("saveFailed"), save: t("save"), saving: t("saving") },
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [...statusKids, ...children],
			});
		}

		class Controller {
			constructor(scope, remoteCredentials) {
				this.scope = scope;
				this.remoteCredentials = remoteCredentials || null;
				this.form = new P.SettingsFormModel(scope, SPECS);
				this.credByRef = {};
				this.runtimeList = [];
				this.runtimeByKey = {};
				this.store = this.form.bind(() => this.project());
				this._poll = setInterval(() => { void this.refreshMeta(); }, 3000);
				void this.refreshMeta();
			}
			project() {
				const shell = this.form.shell();
				const fields = {};
				for (const spec of SPECS) fields[spec.field] = this.form.field(spec.field);
				// Parse host-published runtimeStatus if present in scope snapshot
				try {
					const snap = this.scope.getSnapshot && this.scope.getSnapshot();
					const raw = snap && snap.value && snap.value.runtimeStatus;
					if (typeof raw === "string" && raw.trim()) {
						const parsed = JSON.parse(raw);
						if (Array.isArray(parsed)) {
							this.runtimeList = parsed;
							const map = {};
							for (const row of parsed) map[String(row.roleKey || "")] = row;
							this.runtimeByKey = map;
						}
					}
				} catch (_) {}
				return { ...shell, fields, credByRef: this.credByRef, runtimeList: this.runtimeList, runtimeByKey: this.runtimeByKey };
			}
			async refreshMeta() {
				try {
					const rolesText = this.form.field("roles").text || "";
					const roles = parseRoles(rolesText);
					const refs = [];
					for (const r of roles.length ? roles : [blankRole()]) {
						const ck = String(r.claimKeyEnv || autoKeyRef(r.key)).trim();
						const mk = String(r.mcpBearerEnv || "").trim();
						if (ck) refs.push(ck);
						if (mk) refs.push(mk);
					}
					const uniq = [...new Set(refs)].slice(0, 64);
					if (this.remoteCredentials && typeof this.remoteCredentials.describe === "function" && uniq.length) {
						const res = await this.remoteCredentials.describe(uniq);
						const value = (res && res.value) || res || {};
						const map = {};
						for (const ref of uniq) {
							const info = value[ref];
							map[ref] = !!(info && info.configured);
						}
						this.credByRef = map;
					}
				} catch (_) {}
				try { this.store.set(this.project()); } catch (_) {}
			}
			async flushSecrets() {
				if (!this.remoteCredentials || typeof this.remoteCredentials.set !== "function") return true;
				const roles = parseRoles(this.form.field("roles").text || "");
				const list = roles.length ? roles : [blankRole()];
				for (let i = 0; i < list.length; i++) {
					const role = list[i];
					const cardKey = String(role.key || "") || ("#" + i);
					const draft = pendingSecrets.get(cardKey);
					if (!draft) continue;
					const claimRef = String(role.claimKeyEnv || autoKeyRef(role.key)).trim() || autoKeyRef(role.key);
					const mcpRef = String(role.mcpBearerEnv || "").trim() || autoMcpRef(role.key);
					try {
						if (draft.claimKey && String(draft.claimKey).trim()) {
							await this.remoteCredentials.set(claimRef, String(draft.claimKey).trim());
							if (!String(role.claimKeyEnv || "").trim()) {
								// ensure roles[] carries the auto ref name
								role.claimKeyEnv = claimRef;
							}
						}
						if (draft.mcpBearer && String(draft.mcpBearer).trim()) {
							await this.remoteCredentials.set(mcpRef, String(draft.mcpBearer).trim());
							if (!String(role.mcpBearerEnv || "").trim() && String(draft.mcpBearer).trim()) {
								role.mcpBearerEnv = mcpRef;
							}
						}
					} catch (err) {
						console.warn("[dhs-aplan] credentials.set failed", err && err.message ? err.message : err);
						return false;
					}
					pendingSecrets.delete(cardKey);
				}
				// write back roles if we auto-filled env names
				try {
					this.form.actions().edit("roles", serializeRoles(list));
				} catch (_) {}
				return true;
			}
			inject() {
				return {
					hooks: { aplanCard: this.store },
					edit: (f, v) => this.form.actions().edit(f, v),
					resetField: (f) => this.form.actions().resetField(f),
					save: () => {
						void (async () => {
							const ok = await this.flushSecrets();
							if (!ok) return;
							await this.form.save();
							void this.refreshMeta();
						})();
					},
					discard: () => { pendingSecrets.clear(); this.form.actions().discard(); },
				};
			}
			dispose() {
				try { clearInterval(this._poll); } catch (_) {}
				this.form.dispose();
			}
		}

		// configForms preferred but soft-failed: keyed slot still registers.
		const inject = ["slots", "locale", "remote", "configForms"];
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			let card = null;
			// Stable snapshot required: useSyncExternalStore infinite-loops (React #185)
			// if getSnapshot returns a new object every call — that abdicated the
			// plugins.bundle.config entry so the 配置 section rendered empty.
			const EMPTY_FIELDS = Object.fromEntries(SPECS.map((spec) => [spec.field, { text: "", overridden: false, invalid: false }]));
			const EMPTY_SNAPSHOT = Object.freeze({
				writable: false,
				saving: false,
				fields: EMPTY_FIELDS,
				status: "unavailable",
				runtimeList: Object.freeze([]),
				runtimeByKey: Object.freeze({}),
				credByRef: Object.freeze({}),
			});
			const emptyInject = () => ({
				hooks: {
					aplanCard: {
						getSnapshot: () => EMPTY_SNAPSHOT,
						subscribe: () => () => {},
					},
				},
				edit: () => {},
				resetField: () => {},
				save: () => {},
				discard: () => {},
			});

			// Register keyed slot FIRST (before locale/form/credentials). DSH 0.1.7 plugin
			// detail only shows 配置 when ledger.bundles has options.key === pkg.name.
			// Any throw in later setup must not skip this (same symptom as key/id bug).
			ctx.slots.inject("plugins.bundle.config", () => {
				ctx.slots.register(
					{
						name: "plugins.bundle.config",
						key: PACKAGE_KEY,
						order: 50,
						label: () => t("title"),
						locale: NS,
						inject: () => (card ? card.inject() : emptyInject()),
					},
					AplanCard,
				);
				console.info("[dhs-aplan] plugins.bundle.config slot live key=" + PACKAGE_KEY);
			});
			console.info("[dhs-aplan] plugins.bundle.config inject armed key=" + PACKAGE_KEY);

			// Never touch ctx.remote unless declared in inject — cordis throws
			// "cannot get property remote without inject" and that used to abort
			// Controller setup, leaving emptyInject (which then React-#185'd).
			Controller._remoteCredentials = null;
			try {
				if (ctx.remote && ctx.remote.credentials) Controller._remoteCredentials = ctx.remote.credentials;
			} catch (_) { Controller._remoteCredentials = null; }
			if (!Controller._remoteCredentials && ctx.reflect && typeof ctx.reflect.get === "function") {
				try {
					const remote = ctx.reflect.get("remote", false);
					if (remote && remote.credentials) Controller._remoteCredentials = remote.credentials;
				} catch (_) {}
			}

			try {
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dhs-aplan: dictionaries");
			} catch (err) {
				console.warn("[dhs-aplan] locale.register soft-fail:", err && err.message ? err.message : err);
			}

			// Soft-read DSH workspace registry paths for cwd datalist (no hard inject).
			try {
				const uiWs = ctx.reflect && typeof ctx.reflect.get === "function"
					? ctx.reflect.get("uiWorkspace", false)
					: null;
				if (uiWs) refreshKnownWorkspaces(uiWs);
			} catch (_) {}
			if (typeof ctx.inject === "function") {
				try {
					ctx.effect(
						() =>
							ctx.inject(["uiWorkspace"], (c) => {
								refreshKnownWorkspaces(c.uiWorkspace);
								let unsub = null;
								try {
									if (c.uiWorkspace.workspaces && c.uiWorkspace.workspaces.list && typeof c.uiWorkspace.workspaces.list.subscribe === "function") {
										unsub = c.uiWorkspace.workspaces.list.subscribe(() => refreshKnownWorkspaces(c.uiWorkspace));
									}
								} catch (_) {}
								return () => { try { unsub && unsub(); } catch (_) {} };
							}),
						"dhs-aplan: workspaces",
					);
				} catch (err) {
					console.warn("[dhs-aplan] uiWorkspace soft-fail:", err && err.message ? err.message : err);
				}
			}

			const attachForm = (forms) => {
				try {
					if (!forms || typeof forms.get !== "function") return;
					if (card) {
						try { card.dispose(); } catch (_) {}
						card = null;
					}
					let remoteCred = Controller._remoteCredentials || null;
					if (!remoteCred && ctx.reflect && typeof ctx.reflect.get === "function") {
						try {
							const remote = ctx.reflect.get("remote", false);
							if (remote && remote.credentials) remoteCred = remote.credentials;
						} catch (_) {}
					}
					card = new Controller(forms.get(CONFIG_NS), remoteCred);
				} catch (err) {
					console.warn("[dhs-aplan] configForms soft-fail:", err && err.message ? err.message : err);
					card = null;
				}
			};
			try {
				const forms = ctx.reflect && typeof ctx.reflect.get === "function"
					? ctx.reflect.get("configForms", false)
					: null;
				attachForm(forms);
			} catch (err) {
				console.warn("[dhs-aplan] configForms soft-fail:", err && err.message ? err.message : err);
			}
			if (typeof ctx.inject === "function") {
				try {
					ctx.effect(
						() =>
							ctx.inject(["configForms"], (c) => {
								attachForm(c.configForms);
								return () => {
									try { card && card.dispose(); } catch (_) {}
									card = null;
								};
							}),
						"dhs-aplan: form",
					);
				} catch (err) {
					console.warn("[dhs-aplan] configForms inject soft-fail:", err && err.message ? err.message : err);
				}
			} else if (card) {
				ctx.effect(() => () => { try { card && card.dispose(); } catch (_) {} }, "dhs-aplan: form");
			}
		}
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
