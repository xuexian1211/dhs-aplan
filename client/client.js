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

		const FIVE_ROLE_TEMPLATE = [
			{ key: "req", role: "需求分析", claimKeyEnv: "ITSAPLAN_KEY_REQ", mcpBearerEnv: "ITSAPLAN_MCP_REQ", enabled: true },
			{ key: "swa", role: "架构", claimKeyEnv: "ITSAPLAN_KEY_SWA", mcpBearerEnv: "ITSAPLAN_MCP_SWA", enabled: true },
			{ key: "dev", role: "开发", claimKeyEnv: "ITSAPLAN_KEY_DEV", mcpBearerEnv: "", enabled: true },
			{ key: "review", role: "评审", claimKeyEnv: "ITSAPLAN_KEY_REVIEW", mcpBearerEnv: "ITSAPLAN_MCP_REVIEW", enabled: true },
			{ key: "test", role: "测试", claimKeyEnv: "ITSAPLAN_KEY_TEST", mcpBearerEnv: "ITSAPLAN_MCP_TEST", enabled: true },
		];

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
			roles: "多角色",
			rolesHint: "空列表 = 只跑上面的单角色（开发）。每行可改 key / 显示名 / 环境变量名（不是密钥）以及可选 cwd、mode、provider、model、sessionIdPrefix。",
			rolesAdd: "添加角色",
			rolesRemove: "删除",
			rolesTemplate: "填入五角色模板",
			rolesEmpty: "当前无多角色，保存后保持顶层单角色。",
			roleKey: "key（slug）",
			roleDisplay: "角色显示名",
			roleEnabled: "启用",
			roleOptional: "可选覆盖",
			invalid: "格式不对", invalidMode: "只能是 harness 或 dry-run", invalidJson: "需要 JSON 数组",
			overridden: "已覆盖", reset: "恢复默认",
			readOnly: "本部署的设置为只读。", unavailable: "dhs-aplan 未加载（或缺少 schema），暂时无法配置。",
			save: "保存", saving: "保存中…", saveFailed: "部署没有接受这些值，已保留供你修改。",
			groupConn: "连接与身份", groupRun: "运行", groupSession: "会话", groupRoles: "多角色",
		};
		const en = Object.assign({}, zh, {
			description: "It's a Plan external agent: claim → Harness session → report.",
			roles: "Roles",
			rolesHint: "Empty list = single top-level role only. Each row: key / display name / env var names (not secrets) and optional cwd, mode, provider, model, sessionIdPrefix.",
			rolesAdd: "Add role",
			rolesRemove: "Delete",
			rolesTemplate: "Fill five-role template",
			rolesEmpty: "No multi-role rows; save keeps the top-level single role.",
			roleKey: "key (slug)",
			roleDisplay: "Display name",
			roleEnabled: "Enabled",
			roleOptional: "Optional overrides",
			save: "Save", saving: "Saving…", reset: "Reset", overridden: "Overridden",
			groupConn: "Connection", groupRun: "Run", groupSession: "Session", groupRoles: "Roles",
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
		/** Persist roles as a JSON array string in the form; empty / [] → clear so backend keeps single top-level 开发. */
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

		const ROW_STYLE = {
			border: "1px solid var(--dsw-alias-border-primary, #ddd)",
			borderRadius: 8,
			padding: 12,
			marginTop: 8,
			display: "flex",
			flexDirection: "column",
			gap: 8,
		};
		const ROW_HEAD = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
		const GRID = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
		const FIELD = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
		const LABEL = { color: "var(--dsw-alias-label-secondary, #666)", fontSize: 12 };
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
				cwd: typeof r.cwd === "string" ? r.cwd : "",
				mode: typeof r.mode === "string" ? r.mode : "",
				provider: typeof r.provider === "string" ? r.provider : "",
				model: typeof r.model === "string" ? r.model : "",
				sessionIdPrefix: typeof r.sessionIdPrefix === "string" ? r.sessionIdPrefix : "",
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
				};
				const cwd = String(r.cwd || "").trim();
				const modeVal = String(r.mode || "").trim();
				const provider = String(r.provider || "").trim();
				const model = String(r.model || "").trim();
				const sessionIdPrefix = String(r.sessionIdPrefix || "").trim();
				if (cwd) out.cwd = cwd;
				if (modeVal) out.mode = modeVal;
				if (provider) out.provider = provider;
				if (model) out.model = model;
				if (sessionIdPrefix) out.sessionIdPrefix = sessionIdPrefix;
				return out;
			});
			return JSON.stringify(cleaned);
		}

		function blankRole() {
			return {
				key: "",
				role: "",
				enabled: true,
				claimKeyEnv: "",
				mcpBearerEnv: "",
				cwd: "",
				mode: "",
				provider: "",
				model: "",
				sessionIdPrefix: "",
			};
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
				],
			});
		}

		function RolesListEditor(props) {
			const { t, disabled, fieldState, onEdit, onReset } = props;
			const roles = parseRoles(fieldState.text);
			const commit = (next) => onEdit(serializeRoles(next));

			const patch = (index, patchObj) => {
				commit(roles.map((r, i) => (i === index ? { ...r, ...patchObj } : r)));
			};
			const removeAt = (index) => commit(roles.filter((_, i) => i !== index));
			const addRole = () => commit(roles.concat([blankRole()]));
			const fillTemplate = () => commit(FIVE_ROLE_TEMPLATE.map((r) => ({ ...r })));

			const rows = roles.map((role, index) =>
				jsxs(
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
										],
									}),
									jsx(P.Button, {
										variant: "ghost",
										size: "sm",
										disabled,
										onClick: () => removeAt(index),
										icon: jsx(P.IconTrashOutlineRegular, { size: 14 }),
										children: t("rolesRemove"),
									}),
								],
							}),
							jsxs("div", {
								style: GRID,
								children: [
									jsx(RoleField, { label: t("roleKey"), value: role.key, disabled, placeholder: "dev", onChange: (v) => patch(index, { key: v }) }),
									jsx(RoleField, { label: t("roleDisplay"), value: role.role, disabled, placeholder: "开发", onChange: (v) => patch(index, { role: v }) }),
									jsx(RoleField, { label: t("claimKeyEnv"), value: role.claimKeyEnv, disabled, placeholder: "ITSAPLAN_KEY_DEV", onChange: (v) => patch(index, { claimKeyEnv: v }) }),
									jsx(RoleField, { label: t("mcpBearerEnv"), value: role.mcpBearerEnv, disabled, placeholder: t("mcpBearerEnvHint"), onChange: (v) => patch(index, { mcpBearerEnv: v }) }),
								],
							}),
							jsx("div", { style: { ...LABEL, marginTop: 4 }, children: t("roleOptional") }),
							jsxs("div", {
								style: GRID,
								children: [
									jsx(RoleField, { label: t("cwd"), value: role.cwd, disabled, onChange: (v) => patch(index, { cwd: v }) }),
									jsx(RoleField, { label: t("mode"), value: role.mode, disabled, placeholder: "harness | dry-run", onChange: (v) => patch(index, { mode: v }) }),
									jsx(RoleField, { label: t("provider"), value: role.provider, disabled, onChange: (v) => patch(index, { provider: v }) }),
									jsx(RoleField, { label: t("model"), value: role.model, disabled, onChange: (v) => patch(index, { model: v }) }),
									jsx(RoleField, { label: t("sessionIdPrefix"), value: role.sessionIdPrefix, disabled, onChange: (v) => patch(index, { sessionIdPrefix: v }) }),
								],
							}),
						],
					},
					"role-" + index,
				),
			);

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
					roles.length === 0 ? jsx("p", { style: { margin: "8px 0 0", fontSize: 12, opacity: 0.8 }, children: t("rolesEmpty") }) : null,
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
				children.push(jsx("h4", { style: { margin: "12px 0 0", fontSize: 13, fontWeight: 600 }, children: t(group) }, "g-" + group));
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
						invalidLabel: t(f === "mode" ? "invalidMode" : "invalid"),
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
