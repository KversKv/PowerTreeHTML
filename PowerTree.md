# 角色
你是一名资深前端可视化工程师 + SoC/板级电源系统架构师。请为我实现一个「SoC 电源树离线可交互可视化与校核工具」，用于彻底替代 Visio/画板维护电源树。

# 一、背景与目标
我的 SoC 规模持续膨胀，原先用 Visio 画板维护电源树，存在三大痛点：**修改成本高、维护易失同步、可视化与追溯能力差**。
目标：用一套**纯静态、完全离线**的网页，把电源树从"静态图片"变成"可查询、可追溯、可校核、可版本化"的活文档。
特别注意：我的 SoC **内部集成 PMIC**，同时数字侧有更细粒度的 Power Domain，因此必须支持**板级电源树 + SoC 内部电源域**两层视图与联动。

# 二、硬性技术约束（违反即不通过）
1. **完全离线，零网络请求，零 CDN，零 npm 构建**。所有第三方库以源码形式放入 `assets/vendor/`。
2. **交付形态 A（主）**：一个文件夹，接收方双击 `index.html` 即可用（`file://` 协议）。
3. **交付形态 B（分发）**：提供 `tools/pack.py`，把整个文件夹打包为**单文件** `dist/power_tree_release.html`（所有 JS/CSS/字体/数据内联，base64 处理二进制），便于邮件/IM 发送。
4. **`file://` 兼容红线（务必遵守）**：
   - **禁止** 用 `fetch()` / `XMLHttpRequest` 读取本地数据文件（Chrome 会以 CORS 拒绝）。
   - **禁止** `<script type="module">` / ESM `import`。统一用传统 `<script>` + IIFE + 单一全局命名空间 `window.PT`。
   - 数据加载方式：`data/*.data.js`，文件内容形如
     ```js
     PT.registerData("power_tree", { /* ...纯 JSON 结构... */ });
     ```
     要求 JSON 部分**每个字段独占一行、键序稳定、2 空格缩进**，保证 `git diff` 逐行可读。
   - 如需 Web Worker，必须用 Blob URL 构造，并提供主线程降级路径。
   - **禁止** 在 SVG 中使用 `<foreignObject>`（会导致 PNG 导出被视为污染/不渲染）；节点文字统一用 `<text>` + 手写换行/省略号截断。
   - 字体使用系统字体栈；如需图标，用内联 SVG path，不用图标字体。
5. 性能目标：**800 节点 / 1500 边**首次布局 < 1.5s；缩放/平移 60fps（超阈值自动启用视口裁剪 + LOD 简化渲染）。
6. 兼容 Chrome / Edge 最近两个大版本；不需要 IE。
7. 代码必须**分层模块化 + 中文注释**，我要能自己加节点类型和校核规则。

# 三、目录结构（请严格按此产出）
```
power-tree/
├─ index.html                  # Viewer（对外发布，编辑功能不打包）
├─ editor.html                 # Author（内部调试：轻量编辑 + 导出）
├─ assets/
│  ├─ vendor/elkjs/elk.bundled.js
│  ├─ css/app.css  theme-light.css  theme-dark.css  print.css
│  └─ app/
│     ├─ core/     ns.js  schema.js  graph.js  store.js  url-state.js
│     ├─ engine/   engine.js  eff-table.js  vdrop.js  thermal.js  sequence.js
│     ├─ rules/    rules.js  rule-defs.js
│     ├─ layout/   elk-adapter.js  layout-opts.js  grouping.js  swimlane.js
│     ├─ render/   svg-renderer.js  node-shapes.js  edge-router.js  minimap.js
│     ├─ views/    view-board.js  view-soc.js  view-table.js  view-sequence.js  view-dashboard.js
│     ├─ ui/       panel-detail.js  toolbar.js  search.js  issues.js  tour.js  legal.js  i18n.js
│     ├─ io/       import.js  export-svg.js  export-png.js  export-csv.js  export-json.js
│     └─ boot.js
├─ data/
│  ├─ config.data.js           # 阈值、主题、语言、保密声明、功能开关
│  ├─ power_tree.data.js       # 主数据（示例 ≥45 节点）
│  ├─ parts/parts-lib.data.js  # 器件库（型号级参数，可被节点引用复用）
│  └─ eff/PMIC_U100_BUCK1.data.js  # 效率表（1mA step，懒加载）
├─ docs/  schema.md  README.md  CHANGELOG.md  LEGAL.md  csv-template.csv
└─ tools/ pack.py  csv2data.py  validate.py
```

# 四、双入口与版本管理
- `index.html`（Viewer）：**只读**。不打包 editor 相关模块，UI 无编辑入口，键盘编辑快捷键失效。
- `editor.html`（Author）：可拖节点、改字段、增删节点/边，实时重算与重校核；**保存 = 下载**（生成规范化的 `power_tree.data.js` 与 `.json` 两种格式，字段顺序、缩进、数值精度稳定，便于 git 提交）。
- 在 README 中**明确声明**：前端只读是 UI 层限制，不构成安全边界，敏感性控制依赖分发管理。
- 版本：`meta.schema_version`（数据格式版本，加载时校验并给出迁移提示）+ `meta.version` / `meta.date` / `meta.commit`（页面右上角徽标显示，hover 出 `meta.changelog` 摘要）。
- 数据结构变更时 `schema.js` 需能识别旧版本并提示"请用 tools/validate.py 迁移"。

# 五、数据模型
使用 SI 前缀显式单位：电压 V、电流 mA、功率 mW、电阻 mΩ、时间 ms。
```jsonc
{
  "meta": {
    "schema_version": "1.0",
    "project": "XXX SoC EVB",
    "version": "v0.3",
    "date": "2026-08-14",
    "author": "",
    "commit": "",
    "changelog": "首版：核心域 DVFS 拆分"
  },

  "modes": [
    { "id": "active",  "name_zh": "全速运行", "name_en": "Active",  "default": true },
    { "id": "dvfs_lo", "name_zh": "低频档",   "name_en": "DVFS Low" },
    { "id": "idle",    "name_zh": "轻负载",   "name_en": "Idle" },
    { "id": "suspend", "name_zh": "休眠",     "name_en": "Suspend" },
    { "id": "off",     "name_zh": "关机",     "name_en": "Off" }
  ],

  // 分组：支持嵌套（board > PMIC > 通道；chip > 电压域 > 子域）
  "groups": [
    { "id": "board",  "name_zh": "板级",        "kind": "board",   "parent": null, "side": "left" },
    { "id": "pmic0",  "name_zh": "SoC 内置 PMIC","kind": "pmic",    "parent": "board", "side": "left" },
    { "id": "soc_dig","name_zh": "数字 Power Domain","kind": "chip","parent": null,   "side": "right" },
    { "id": "pd_cpu", "name_zh": "PD_CPU",      "kind": "domain",  "parent": "soc_dig" }
  ],

  // 器件库引用：节点可写 "part": "XX"，缺失字段自动继承 parts-lib
  "nodes": [
    { "id": "VBAT", "type": "source", "name": "单节锂电",
      "vout": 3.8, "vout_range": [3.0, 4.35], "imax": 8000 },

    { "id": "BUCK1", "type": "buck", "name": "DCDC1 → VDD_CPU",
      "group": "pmic0", "part": "PMIC_U100_BUCK1",
      "vin_range": [2.7, 5.5],
      "vout": 0.9, "vout_range": [0.6, 1.1], "vout_tol_pct": 3,
      "dvfs": { "active": 0.9, "dvfs_lo": 0.75, "idle": 0.7, "suspend": 0.6 },
      "imax": 6000, "iq_ua": 30,
      "eff_ref": "PMIC_U100_BUCK1",          // → data/eff/*.data.js，懒加载
      "efficiency": 0.88,                     // 兜底标量
      "enable": { "src": "PMIC_SEQ", "signal": "EN1", "order": 3, "delay_ms": 2, "ramp_ms": 1, "pg": true },
      "on_in_modes": ["active","dvfs_lo","idle","suspend"],
      "sense": "remote",
      "parallel_group": null,                 // 多相/并联标识
      "cascade": { "chain_id": "CH_CPU", "stage": 1 },   // 级联电源：链路 + 级号
      "tags": ["核心域"], "note": "远端反馈，注意 Kelvin 走线",
      "refdes": "U100", "sheet": "SCH-P12"    // 便于回溯原理图页
    },

    { "id": "LDO3", "type": "ldo", "name": "LDO3 → VDD_PLL",
      "group": "pmic0", "vin_range": [1.5, 5.5], "vout": 0.85,
      "dropout_mv": 150, "imax": 300, "iq_ua": 15,
      "cascade": { "chain_id": "CH_CPU", "stage": 2 },   // 由 BUCK1 级联供电
      "enable": { "src": "SOC_GPIO7", "signal": "PLL_EN", "order": 5, "delay_ms": 1 } },

    { "id": "LS_CAM", "type": "load_switch", "name": "Camera 负载开关",
      "vin_range": [1.7, 5.5], "rds_on_mohm": 45, "imax": 2000,
      "soft_start_ms": 0.8, "enable": { "src": "SOC_GPIO12", "signal": "CAM_EN", "order": 8 } },

    { "id": "R_SNS1", "type": "passive_r", "name": "采样电阻", "r_mohm": 20, "power_mw": 250, "tol_pct": 1 },
    { "id": "L_FIL1", "type": "passive_l", "name": "磁珠",   "l_uh": 2.2, "dcr_mohm": 60, "isat": 3000 },
    { "id": "C_BLK1", "type": "passive_c", "name": "去耦",   "c_uf": 22, "esr_mohm": 5, "volt_rating": 6.3 },

    { "id": "ORING1", "type": "ideal_diode", "name": "ORing 控制器",
      "vf_mv": 25, "rds_on_mohm": 8, "imax": 5000 },

    { "id": "VDD_CPU", "type": "load", "name": "CPU 域",
      "group": "pd_cpu", "domain": "PD_CPU", "voltage": 0.9,
      "always_on": false, "retention": true,
      "current": {
        "active":  { "typ": 3200, "max": 4500 },
        "dvfs_lo": { "typ": 1200, "max": 1800 },
        "idle":    { "typ": 600,  "max": 900 },
        "suspend": { "typ": 3,    "max": 8 },
        "off":     { "typ": 0,    "max": 0 }
      },
      "vtol_pct": 5,
      "iso_signal": "ISO_CPU", "reset_signal": "RST_CPU" }
  ],

  "edges": [
    { "from": "VBAT",  "to": "ORING1", "type": "power", "net": "VBAT",
      "trace_r_mohm": 4,
      "inline": [ { "type": "passive_r", "r_mohm": 10, "name": "串阻" } ] },  // 无源内联，默认折叠
    { "from": "BUCK1", "to": "LDO3",   "type": "power", "net": "VDD_CPU_PRE", "trace_r_mohm": 3 },
    { "from": "BUCK1", "to": "VDD_CPU","type": "power", "net": "VDD_CPU", "trace_r_mohm": 6 },
    { "from": "PMIC_SEQ", "to": "BUCK1", "type": "control", "sub": "EN",  "signal": "EN1" },
    { "from": "BUCK1", "to": "PMIC_SEQ","type": "control", "sub": "PG",  "signal": "PG1" },
    { "from": "SOC_I2C","to": "pmic0",  "type": "control", "sub": "I2C", "signal": "I2C0" }
  ]
}
```
数据模型要求：
1. **DAG 优先，逻辑连接优先于物理连接**：允许多父节点（ORing / 多路输入）、并联（`parallel_group`）、跨接（cross-tie）、级联链（`cascade.chain_id`+`stage`）。必须检测并友好定位环路，而非崩溃。
2. `type` 枚举：`source | buck | boost | buck_boost | ldo | load_switch | efuse | ideal_diode | divider | level_shifter | passive_r | passive_l | passive_c | load | domain | virtual | seq_ctrl`。
3. 边类型：`power`（实线）/ `control`（虚线，子类 `EN | PG | I2C | RESET | ISO | SENSE | IRQ`，可整层或按子类显隐）。
4. **所有字段缺失都要有缺省行为与"数据不完整"标记，绝不因缺字段抛异常**；schema 校验错误必须指明 `节点 id + 字段名 + 期望类型`。
5. 效率表格式（`data/eff/*.data.js`），支持多工况：
   ```js
   PT.registerEff("PMIC_U100_BUCK1", {
     unit: { i: "mA", eff: "ratio" },
     conditions: [
       { vin: 3.8, vout: 0.9, i_start: 1, i_step: 1,
         eff: [0.31, 0.35, /* ... 1..200mA 共 200 点 ... */ 0.90] }
     ]
   });
   ```
   提供 `eff-table.js`：按 (vin, vout, iout) 做**双线性插值 + 范围外夹取并告警**。

# 六、计算引擎（一期范围，其余留接口）
**一期实现：**
1. **单级直连求和**：每个电源节点汇总其直连下游负载在当前模式下的 `typ/max` 电流 → 得到 `Iout_sum`、**利用率 = Iout_max / imax**。**不做跨级效率换算，不做系统总功耗。**
2. **Vdrop**：`Vdrop = I × (trace_r_mohm + rds_on_mohm + inline 无源 R + dcr_mohm) / 1000`，输出末端实际电压、相对 `vtol_pct` 的判定；沿 `cascade` 链给出**累计压降**。
3. **LDO 热耗**：`P_loss = (Vin - Vout) × Iout`；结合 `theta_ja`（可选）估算温升；与 `dropout_mv` 联合判定。
4. `eff-table.js` 完成插值能力，仅用于**属性面板绘制效率曲线**与标注当前工作点，不参与汇总。

**必须预留但一期不实现**（写成明确的接口 + 空实现 + 单元注释）：
```js
PT.engine.registerCalculator({
  id: "cascade-rollup",
  enabled: false,          // 一期关闭
  run(graph, mode, opts) { /* 自底向上跨级电流/功率汇总、系统总功耗、续航估算 */ }
});
```
所有计算结果挂在 `node.__calc` 命名空间，与原始数据严格分离，绝不污染源 JSON。

# 七、校核规则（全部实现，结果进「问题清单」面板，点击定位并高亮）
以**声明式规则数组**实现（`rules/rule-defs.js`），每条含 `id / level / 阈值来源 config / 检查函数 / 中英文文案 / 修复建议`：
- **E** Vin 越界：上游 `vout_range` 与下游 `vin_range` 无交集（含电池最低/最高电压角）
- **E** 过流：利用率 > 100%
- **W** 余量不足：利用率 > `config.derating_warn`（默认 80%）
- **W** LDO 压差不足：`Vin_min - Vout < dropout_mv`
- **W** LDO 热耗超阈值：`P_loss > config.ldo_loss_warn_mw`（默认 500）
- **W** Vdrop 超容差：末端电压偏差 > `vtol_pct`
- **W** 并联均流风险：`parallel_group` 内成员 `vout/rds_on/imax` 不一致或未标注
- **E** 时序违例：下游 rail `order` 早于其上游；EN 源在该模式下未上电；`order` 重复冲突；下电顺序未定义
- **E** 结构问题：环路；无源可溯（追不到 `source`）；孤立节点
- **W** 多父未标注 ORing/并联
- **E** 命名冲突：`node.id` 重复、`net` 名重复且电压不同
- **W** 模式一致性：负载在某模式有电流但其上游 `on_in_modes` 不含该模式
- **W** 无源器件参数越界：电阻功耗超额定、电感超 Isat、电容耐压不足
- **I** 数据缺失：`imax / vin_range / current / efficiency` 等关键字段为空
校核在数据加载后与任意编辑后自动增量重跑；顶栏显示 `E/W/I` 计数徽标。

# 八、视图与交互
## 8.1 视图一：板级电源树（主视图）
- ELK `layered` 布局，**左 → 右**，`ORTHOGONAL` 正交走线，`nodePlacement=BRANDES_KOEPF`，合理配置层间距/节点间距，尽量减少交叉与压线。
- **布局主轴要求：左侧 PMIC/板级电源区，右侧数字 Power Domain 区**（利用 `groups[].side` + ELK partition/约束实现），中间为跨接与级联区。
- 分组框（board / PMIC / chip / domain）**可嵌套折叠**；折叠后聚合成一个汇总节点并显示汇总电流与利用率。
- **反杂乱策略（重点，必须做）**：
  1. 控制边默认**隐藏**，一键分层显示；
  2. 无源 inline 元件默认折叠为边上的小标记，点击展开；
  3. 去耦电容等"叶子噪声节点"默认收纳进父节点的"附属元件"抽屉；
  4. 多条 `net` 相同的平行边自动**捆扎（bundling）**；
  5. 泳道（按电压分层）为**可选开关**，默认关闭；
  6. 提供"聚焦模式"：只渲染选中节点 N 跳邻域（N 可调 1~5），其余隐藏。
- 节点卡片：类型图标 + 名称 + 型号/refdes + Vout + 当前模式 Iout(typ/max) + 利用率条 + 问题角标。
- 配色语义可切换：**利用率热力 / 电压分类 / 电源域 / 器件类型 / 问题等级 / 所属 PMIC**；提供图例。
- 边：宽度按电流分档，hover 显示 net、电流、trace_r、Vdrop。

## 8.2 视图二：SoC 内部电源域视图
- 以 `groups[kind=chip/domain]` 为主体，展示域层级、AON/可关断、retention、ISO/RESET 信号、供电来源 rail。
- **与板级视图双向跳转联动**：在板级点某 rail → "查看其供电的内部域"；在域视图点某域 → 回跳其供电链路并高亮。

## 8.3 视图三：表格视图（与图双向联动）
- 列：rail / 来源 / 类型 / 器件 / Vout / 各模式 Iout(typ,max) / imax / 利用率 / Vdrop / 损耗 / 负载列表 / 问题数 / tag。
- 支持排序、多条件筛选、列显隐、行选中同步高亮图节点；导出 CSV。

## 8.4 视图四：时序视图
- 依据 `enable.order / delay_ms / ramp_ms / pg`，绘制**上电与下电**两组时序：甘特条 + 简化波形（斜率示意 + PG 触发点）。
- 违例（顺序倒置 / 依赖未满足）在时序图上标红并联动问题清单。
- 支持按模式切换（进入/退出 suspend 的时序差异）。

## 8.5 视图五：汇总看板
- **自绘 SVG 图表，禁止引第三方图表库**：各模式负载电流分布条形图、Top-N 大电流 rail、Top-N 高利用率器件、问题分布、按域/PMIC 的聚合统计。

## 8.6 通用交互（全部实现）
- 缩放/平移/Fit/框选、小地图。
- **点击节点 → 右侧属性面板**（核心）：分区展示
  ① 基本信息（id/名称/型号/refdes/原理图页/tag/备注）
  ② 电气参数（Vin 范围、Vout 及容差、imax、Iq、dropout、Rds_on…）
  ③ 计算结果（当前模式 Iout typ/max、利用率、Vdrop、累计压降、损耗、估算温升）
  ④ **效率曲线小图**（标注当前工作点，无数据则提示）
  ⑤ 各模式电流表（横向对比）
  ⑥ 供电链路面包屑（source → … → 本节点 → 直连负载），可点跳
  ⑦ 时序信息（EN 源、order、delay、ramp、PG）
  ⑧ 本节点相关问题清单
  ⑨ 原始 JSON 片段（可复制；Author 模式可编辑）
- **路径追溯**：选中节点高亮全部上游供电路径与下游负载子图，其余淡化；支持"仅看该子树"、"高亮到 source"。
- 搜索/过滤：按 名称/id/net/型号/域/tag/电压区间/问题等级，命中列表可跳转、可批量高亮。
- 顶栏：视图切换、语言（中/英）、主题（深/浅）、模式切换、typ/max 切换、控制边显隐、配色语义、导出、帮助/引导。
- 快捷键：`/` 搜索、`f` Fit、`e` 展开全部、`c` 折叠全部、`t` 主题、`1..5` 视图切换、`Esc` 清除选中；提供快捷键速查弹层。
- **URL hash 状态持久化**：视图、模式、typ/max、选中节点、折叠状态、过滤条件、配色语义、语言、主题；生成"复制当前视图链接"按钮（`file://` 下同样有效）。
- **首次使用引导（自研轻量 Tour，不依赖第三方）**：遮罩 + 高亮 + 气泡分步讲解（视图切换 → 搜索 → 点击节点看属性面板 → 路径追溯 → 模式切换 → 问题清单 → 时序视图 → 导出），`localStorage` 记录已完成；顶栏"使用引导"按钮可随时重放；支持中英文。

# 九、导入与导出
- 导入：拖拽/选择 `.json` 或 `.data.js`（沙箱化解析 + schema 校验 + 错误清单），覆盖内嵌兜底样例；提供"恢复内置样例"。
- 导出：
  - **SVG**（样式内联、无外链、可再编辑）
  - **PNG**（2x/4x，SVG→data URL→canvas，禁用 foreignObject 保证不被污染）
  - **打印/PDF**：`print.css` 支持 A4/A3 横向、正确分页、黑白友好、页眉含项目/版本、**页脚含保密声明**
  - **CSV**（rail 预算表、问题清单），UTF-8 **带 BOM**，Excel 直开不乱码
  - **Markdown**（问题清单 + 版本摘要，便于贴评审）
  - **JSON / data.js**（Author 模式，规范化格式化输出）
- `tools/csv2data.py`：CSV/Excel 模板 → `power_tree.data.js`；附 `docs/csv-template.csv` 与列名规范。Visio 不做导入，改由此模板迁移，README 中给出迁移步骤建议。
- `tools/validate.py`：CI 可用的数据校验（schema + 全部校核规则的命令行版，返回非零退出码）。

# 十、合规与保密（必须实现）
1. **首次打开弹出全屏 NDA/保密确认框**：标题、正文（保密声明 + 免责声明 + 数据仅供内部评估、不保证准确性、以最终原理图与器件规格书为准）、"我已阅读并同意"按钮；未同意则不显示任何数据。确认状态记 `localStorage`（可通过 config 强制每次弹出）。
2. **画布水印**：可配置文字（默认 `CONFIDENTIAL · {project} · {version}`），淡色斜向平铺，缩放时保持；导出 SVG/PNG/打印**必须带水印与保密页脚**。
3. 页面底部常驻一行：`机密文件 · 未经授权禁止外传 · 本工具计算结果仅供参考，不构成设计依据`。
4. 所有文案中英文双语，集中在 `docs/LEGAL.md` + `config.data.js.legal` 中，便于法务修改。
5. 右上角"关于"弹层：版本、数据版本、生成时间、免责声明、联系人。

# 十一、config.data.js 需暴露的配置
项目名、默认语言/主题/视图/模式、利用率告警阈值、LDO 损耗阈值、Vdrop 默认容差、控制边默认显隐、泳道开关、聚焦跳数默认值、水印文案与开关、NDA 强制弹窗开关、功能开关（editor/tour/dashboard/sequence）、i18n 覆盖。

# 十二、交付物
1. 完整目录与全部源码文件（**不允许 `// TODO 省略`，拼接后必须直接可运行**）
2. `data/power_tree.data.js` 示例：**≥45 节点**，覆盖 source/buck/boost/buck_boost/ldo/load_switch/efuse/ideal_diode(ORing)/divider/level_shifter/R,L,C/load/domain/seq_ctrl，包含 5 种模式、级联链（≥3 级）、并联组、跨接、控制边，并**故意埋 6 个可被检出的问题**（1 个 Vin 越界、1 个过流、1 个 LDO 压差不足、1 个时序违例、1 个孤立节点、1 个 net 重名）
3. `data/eff/*.data.js`：≥2 个器件、每器件 ≥2 工况、1mA step 的效率表（可用合理曲线生成）
4. `docs/schema.md`：字段字典（含义/单位/必填/缺省/取值范围/示例）
5. `docs/README.md`：使用、目录说明、如何改数据、如何加节点类型、如何加校核规则、如何打包单文件、已知限制、`file://` 注意事项
6. `docs/LEGAL.md`、`docs/CHANGELOG.md`、`docs/csv-template.csv`
7. `tools/pack.py`、`tools/csv2data.py`、`tools/validate.py`

# 十三、验收标准
- 拷贝文件夹到任意机器，双击 `index.html` 离线可用，控制台无报错。
- 只替换 `data/power_tree.data.js` 即得到新电源树，无需改任何代码。
- 800 节点数据下布局 < 1.5s，拖拽缩放不卡顿。
- 点击任一节点，右侧面板能完整回答"电从哪来、供给了谁、余量多少、有什么风险"。
- 示例数据中埋的 6 个问题全部被检出，且点击可定位高亮。
- 板级视图与 SoC 域视图能相互跳转并保持上下文。
- 导出的 SVG/PNG/打印件均含水印与保密声明，PNG 无空白/污染问题。
- `tools/pack.py` 产出的单文件 HTML 功能与文件夹版一致。
- 首次打开有 NDA 确认与新手引导。

# 十四、执行方式（分阶段，先设计后编码）
**阶段 1（先只做这个）**：输出方案设计，≤600 字 + 一张 mermaid 架构图（所有节点文本用双引号），内容包括：
- 技术选型与 `file://` 兼容方案说明
- 模块划分与数据流（数据加载 → schema 校验 → 图构建 → 计算 → 校核 → 布局 → 渲染 → UI 状态 → 导出）
- ELK 关键参数与"左 PMIC / 右 Power Domain"的实现思路
- 反杂乱策略的落地方式
- 一期/二期边界与预留接口清单
- 你认为存在风险的 3 个点及应对
然后**停下等我确认**。

**阶段 2**：按 `core → engine → rules → layout → render → views → ui → io → data → docs/tools` 顺序分批输出完整代码，每批说明文件路径与依赖关系，最后给出"拼装校验清单"。

**阶段 3**：输出二期路线图（跨级功率汇总与续航估算、PDN/IR-drop 联合分析、UPF 导入生成域视图、原理图网表自动比对、评审批注协同、多版本 A/B 对比视图）。