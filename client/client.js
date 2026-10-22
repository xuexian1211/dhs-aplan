// dhs-aplan browser half: settings page on Plugins → dhs-aplan (plugins.bundle.config slot).
// Hand-written in the DSH client-module factory format (no bundler needed).
// Slot must use options.key = package name ("dhs-aplan"); plugin-manager matches
// plugins.bundle.config via entryKey: pkg.name (keyed slot), not id.
window.__ModuleLoader__.load({
	id: "dhs-aplan",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const { jsx, jsxs } = require("react/jsx-runtime");
		const P = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "settings.dhsAplan";
		const CONFIG_NS = "dhs-aplan";
		const PACKAGE_KEY = "dhs-aplan";

		const zh = {
			title: "dhs-aplan（It's a Plan）",
			description: "It's a Plan 外部 Agent 领取 → Harness 会话 → 回写结果。",
			enabled: "启用", enabledHint: "关闭后插件不再领取任何角色的 run。",
			baseUrl: "Plan 地址", baseUrlHint: "例如 http://192.168.10.146:8001",
			mode: "模式", modeHint: "harness = 真实 Agent 回合；dry-run = 只领取/评论+直接回 success（联调用）。",
			role: "角色名（会话标题显示）", roleHint: "单角色时使用，例如 开发。会话标题：<ISSUE> · <角色> · <标题>。",
			claimKeyEnv: "领取 Key 环境变量名", claimKeyEnvHint: "填环境变量名（不是 Key 本身），例如 ITSAPLAN_KEY_DEV。",
			mcpBearerEnv: "MCP 写回 Key 环境变量名", mcpBearerEnvHint: "留空 = 复用领取 Key。",
			mcpPath: "MCP 路径", mcpPathHint: "默认 /mcp",
			mcpCommentTool: "评论工具名", mcpCommentToolHint: "领取后发评论用的 MCP 工具，例如 create_issue_comment。",
			postClaimComment: "领取后发评论",
			cwd: "工作目录（绝对路径）", cwdHint: "Harness 会话 cwd，并挂到同名工作区。",
			provider: "Provider", providerHint: "留空 = profile 默认模型。",
			model: "模型", modelHint: "留空 = profile 默认模型。",
			pollIntervalMs: "轮询间隔（ms）", heartbeatIntervalMs: "心跳间隔（ms）", heartbeatIntervalMsHint: "须小于 Plan lease（30s）。",
			turnTimeoutMs: "单回合超时（ms）", turnTimeoutMsHint: "0 = 不限；超时会中断回合并回报 failed。",
			sessionIdPrefix: "会话 id 前缀",
			reuseSessionPerIssue: "同一 issue 复用会话",
			disposeAfterRun: "回合结束后释放会话",
			mountPlanMcp: "给 Agent 挂载 Plan MCP 工具",
			setSessionTitle: "按规范设置会话标题",
			renameExistingSession: "复用会话时也纠正标题",
			roles: "多角色（JSON 数组）",
			rolesHint: '留空/[] = 只跑上面的单角色。示例：[{"key":"dev","role":"开发","claimKeyEnv":"ITSAPLAN_KEY_DEV"},{"key":"review","role":"评审","claimKeyEnv":"ITSAPLAN_KEY_REVIEW","mcpBearerEnv":"ITSAPLAN_MCP_REVIEW"}]；每项可覆 cwd/provider/model/mode/enabled。',
			invalid: "格式不对", invalidMode: "只能是 harness 或 dry-run", invalidJson: "需要 JSON 数组",
			overridden: "已覆盖", reset: "恢复默认",
			readOnly: "本部署的设置为只读。", unavailable: "dhs-aplan 未加载（或缺少 schema），暂时无法配置。",
			save: "保存", saving: "保存中…", saveFailed: "部署没有接受这些值，已保留供你修改。",
			groupConn: "连接与身份", groupRun: "运行", groupSession: "会话", groupRoles: "多角色",
		};
		const en = Object.assign({}, zh, {
			description: "It's a Plan external agent: claim → Harness session → report.",
			save: "Save", saving: "Saving…", reset: "Reset", overridden: "Overridden",
		});

		const text = (f) => P.settingsTextField(f);
		const num = (f) => P.settingsNumberField(f);
		const rawText = (f) => ({ field: f, format: (v) => (typeof v === "string" ? v : ""), parse: (t) => ({ kind: "set", value: t.trim() }) });
		const bool = (f) => ({
			field: f,
			format: (v) => (v === true ? "true" : v === false ? "false" : ""),
			parse: (t) => (t === "" ? { kind: "clear" } : t === "true" ? { kind: "set", value: true } : t === "false" ? { kind: "set", value: false } : void 0),
		});
		const mode = (f) => ({
			field: f,
			format: (v) => (typeof v === "string" ? v : ""),
			parse: (t) => { const s = t.trim(); if (s === "") return { kind: "clear" }; return s === "harness" || s === "dry-run" ? { kind: "set", value: s } : void 0; },
		});
		const json = (f) => ({
			field: f,
			format: (v) => (Array.isArray(v) && v.length ? JSON.stringify(v) : ""),
			parse: (t) => { const s = t.trim(); if (s === "" || s === "[]") return { kind: "clear" }; try { const v = JSON.parse(s); return Array.isArray(v) ? { kind: "set", value: v } : void 0; } catch { return void 0; } },
		});

		const FIELDS = [
			["groupConn", [["baseUrl", text], ["claimKeyEnv", text], ["mcpBearerEnv", rawText], ["mcpPath", text], ["mcpCommentTool", text]]],
			["groupRun", [["enabled", bool], ["mode", mode], ["role", text], ["cwd", rawText], ["provider", rawText], ["model", rawText], ["pollIntervalMs", num], ["heartbeatIntervalMs", num], ["turnTimeoutMs", num], ["postClaimComment", bool], ["mountPlanMcp", bool]]],
			["groupSession", [["setSessionTitle", bool], ["renameExistingSession", bool], ["reuseSessionPerIssue", bool], ["disposeAfterRun", bool], ["sessionIdPrefix", text]]],
			["groupRoles", [["roles", json]]],
		];
		const SPECS = [];
		const KIND = {};
		for (const [, items] of FIELDS) for (const [f, mk] of items) { SPECS.push(mk(f)); KIND[f] = mk; }

		function AplanCard(props) {
			const { t } = props;
			const state = props.useAplanCard((s) => s);
			if (props.view === "summary") return t("description");
			const disabled = !state.writable || state.saving;
			const children = [];
			for (const [group, items] of FIELDS) {
				children.push(jsx("h4", { style: { margin: "12px 0 0", fontSize: 13, fontWeight: 600 }, children: t(group) }, "g-" + group));
				for (const [f, mk] of items) {
					const fs = state.fields[f];
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
						invalidLabel: t(f === "mode" ? "invalidMode" : f === "roles" ? "invalidJson" : "invalid"),
						numeric: mk === num,
						disabled,
						...fs,
						onEdit: (v) => props.edit(f, v),
						onReset: () => props.resetField(f),
					}, f));
				}
			}
			return jsx(P.SettingsForm, {
				labels: { unavailable: t("unavailable"), readOnly: t("readOnly"), saveFailed: t("saveFailed"), save: t("save"), saving: t("saving") },
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children,
			});
		}

		class Controller {
			constructor(scope) {
				this.form = new P.SettingsFormModel(scope, SPECS);
				this.store = this.form.bind(() => this.project());
			}
			project() {
				const shell = this.form.shell();
				const fields = {};
				for (const spec of SPECS) fields[spec.field] = this.form.field(spec.field);
				return { ...shell, fields };
			}
			inject() {
				return {
					hooks: { aplanCard: this.store },
					edit: (f, v) => this.form.actions().edit(f, v),
					resetField: (f) => this.form.actions().resetField(f),
					save: () => { void this.form.save(); },
					discard: () => this.form.actions().discard(),
				};
			}
			dispose() { this.form.dispose(); }
		}

		// configForms preferred but soft-failed: keyed slot still registers.
		const inject = ["slots", "locale"];
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dhs-aplan: dictionaries");

			let card = null;
			const attachForm = (forms) => {
				try {
					if (!forms || typeof forms.get !== "function") return;
					if (card) {
						try { card.dispose(); } catch (_) {}
						card = null;
					}
					card = new Controller(forms.get(CONFIG_NS));
				} catch (err) {
					console.warn("[dhs-aplan] configForms soft-fail:", err && err.message ? err.message : err);
					card = null;
				}
			};
			// Eager soft-read (no inject hard-dep) + delayed inject when service appears.
			try {
				const forms = ctx.reflect && typeof ctx.reflect.get === "function"
					? ctx.reflect.get("configForms", false)
					: null;
				attachForm(forms);
			} catch (err) {
				console.warn("[dhs-aplan] configForms soft-fail:", err && err.message ? err.message : err);
			}
			if (typeof ctx.inject === "function") {
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
			} else if (card) {
				ctx.effect(() => () => { try { card && card.dispose(); } catch (_) {} }, "dhs-aplan: form");
			}

			const emptyInject = () => ({
				hooks: {
					aplanCard: {
						getSnapshot: () => ({
							writable: false,
							saving: false,
							fields: Object.fromEntries(SPECS.map((s) => [s.field, { text: "", overridden: false, invalid: false }])),
							status: "unavailable",
						}),
						subscribe: () => () => {},
					},
				},
				edit: () => {},
				resetField: () => {},
				save: () => {},
				discard: () => {},
			});

			// Unconditional keyed registration: key = package name (not id).
			ctx.effect(
				() =>
					ctx.slots.inject("plugins.bundle.config", () =>
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
						),
					),
				"dhs-aplan: bundle page",
			);
		}
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
