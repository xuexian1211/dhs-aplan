// dhs-aplan browser half: settings page on Plugins → dhs-aplan (plugins.bundle.config slot).
// Hand-written in the DSH client-module factory format (no bundler needed).
// Slot must use options.key = package name ("dhs-aplan"); plugin-manager matches
// plugins.bundle.config via entryKey: pkg.name (keyed slot), not id.
//
// Layout (0.3.3): GLOBAL top = baseUrl + intervals + enabled +「全站默认」session toggles.
// Per-role cards hold claim/MCP keys, mode/cwd/provider/model, sessionIdPrefix, and
// optional per-role session/MCP overrides. Empty roles[] shows one editable default
// card that writes roles[0] (single model).
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
			{ key: "req", role: "需求分析", claimKeyEnv: "ITSAPLAN_KEY_REQ", mcpBearerEnv: "ITSAPLAN_MCP_REQ", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "swa", role: "架构", claimKeyEnv: "ITSAPLAN_KEY_SWA", mcpBearerEnv: "ITSAPLAN_MCP_SWA", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "dev", role: "开发", claimKeyEnv: "ITSAPLAN_KEY_DEV", mcpBearerEnv: "", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "review", role: "评审", claimKeyEnv: "ITSAPLAN_KEY_REVIEW", mcpBearerEnv: "ITSAPLAN_MCP_REVIEW", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
			{ key: "test", role: "测试", claimKeyEnv: "ITSAPLAN_KEY_TEST", mcpBearerEnv: "ITSAPLAN_MCP_TEST", enabled: true, mode: "harness", cwd: "", postClaimComment: true, mountPlanMcp: true },
		];

		const zh = {
			title: "dhs-aplan（It's a Plan）",
			description: "It's a Plan 外部 Agent 领取 → Harness 会话 → 回写结果。",
			enabled: "启用", enabledHint: "关闭后插件不再领取任何角色的 run。",
			baseUrl: "Plan 地址", baseUrlHint: "例如 http://192.168.10.146:8001",
			mode: "模式",
			modeHint: "harness = 真实 Agent 回合；dry-run = 只领取/评论后直接回 success（联调用，不跑 Harness）。",
			role: "角色名（会话标题显示）",
			claimKeyEnv: "领取 Key 环境变量名", claimKeyEnvHint: "填环境变量名（不是 Key 本身），例如 ITSAPLAN_KEY_DEV。",
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
			siteDefaults: "全站默认",
			invalid: "格式不对", invalidMode: "只能是 harness 或 dry-run", invalidJson: "需要 JSON 数组",
			overridden: "已覆盖", reset: "恢复默认",
			readOnly: "本部署的设置为只读。", unavailable: "dhs-aplan 未加载（或缺少 schema），暂时无法配置。",
			save: "保存", saving: "保存中…", saveFailed: "部署没有接受这些值，已保留供你修改。",
			groupGlobal: "全局", groupSiteSession: "全站默认 · 会话", groupRoles: "角色",
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
			siteDefaults: "Site defaults",
			save: "Save", saving: "Saving…", reset: "Reset", overridden: "Overridden",
			groupGlobal: "Global", groupSiteSession: "Site defaults · Session", groupRoles: "Roles",
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
				const sessionIdPrefix = String(r.sessionIdPrefix || "").trim();
				if (mcpPath) out.mcpPath = mcpPath;
				if (mcpCommentTool) out.mcpCommentTool = mcpCommentTool;
				if (provider) out.provider = provider;
				if (model) out.model = model;
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
				claimKeyEnv: "ITSAPLAN_KEY_DEV",
				mcpBearerEnv: "",
				mcpPath: "",
				mcpCommentTool: "",
				postClaimComment: true,
				cwd: "",
				mode: "harness",
				provider: "",
				model: "",
				sessionIdPrefix: "",
				reuseSessionPerIssue: undefined,
				setSessionTitle: undefined,
				renameExistingSession: undefined,
				disposeAfterRun: undefined,
				mountPlanMcp: true,
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
			const roles = parseRoles(fieldState.text);
			const virtual = roles.length === 0;
			const display = virtual ? [blankRole()] : roles;
			const commit = (next) => onEdit(serializeRoles(next));

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

			const rows = display.map((role, index) =>
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
								style: GRID,
								children: [
									jsx(RoleField, { label: t("claimKeyEnv"), value: role.claimKeyEnv, disabled, placeholder: "ITSAPLAN_KEY_DEV", hint: t("claimKeyEnvHint"), onChange: (v) => patch(index, { claimKeyEnv: v }) }),
									jsx(RoleField, { label: t("mcpBearerEnv"), value: role.mcpBearerEnv, disabled, placeholder: t("mcpBearerEnvHint"), onChange: (v) => patch(index, { mcpBearerEnv: v }) }),
									jsx(RoleField, { label: t("mcpPath"), value: role.mcpPath, disabled, placeholder: "/mcp", hint: t("mcpPathHint"), onChange: (v) => patch(index, { mcpPath: v }) }),
									jsx(RoleField, { label: t("mcpCommentTool"), value: role.mcpCommentTool, disabled, placeholder: "create_issue_comment", hint: t("mcpCommentToolHint"), onChange: (v) => patch(index, { mcpCommentTool: v }) }),
								],
							}),
							jsx(RoleBool, { label: t("postClaimComment"), value: role.postClaimComment !== false, disabled, onChange: (c) => patch(index, { postClaimComment: c }) }),
							jsx("div", { style: SECTION, children: t("sectionRun") }),
							jsxs("div", {
								style: GRID,
								children: [
									jsx(ModeSelect, { label: t("mode"), value: role.mode, hint: t("modeHint"), disabled, onChange: (v) => patch(index, { mode: v }) }),
									jsx(RoleField, { label: t("cwd"), value: role.cwd, disabled, placeholder: "可选，留空 = 不设 cwd", hint: t("cwdHint"), onChange: (v) => patch(index, { cwd: v }) }),
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
