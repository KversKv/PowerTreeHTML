# AGENTS.md — PowerTreeHTML

## 项目定位

**SoC 电源树离线可交互可视化与校核工具**。纯静态网页, 零网络 / 零 CDN / 零 npm 构建, 双击 `index.html` 即用 (`file://` 协议兼容)。用于替代 Visio 维护电源树。

## 快速开始

```bash
# 1. 直接用浏览器打开 (生产推荐)
index.html          # Viewer 只读
editor.html         # Author 可编辑
pmu1811.html        # BES1811 PMU 验收专用

# 2. 或起本地服务器 (开发调试用, 端口 8765)
python -m http.server 8765 --bind 127.0.0.1

# 3. 工具链
python tools/validate.py data/power_tree.data.js     # CI 数据校验
python tools/csv2data.py input.csv output.data.js    # CSV → data.js
python tools/pack.py                                 # 打包单文件 → dist/power_tree_release.html
```

## 目录结构

```
PowerTreeHTML/
├─ index.html / editor.html / pmu1811.html      # 3 个入口
├─ assets/
│  ├─ vendor/elkjs/elk.bundled.js               # ELK 0.9.3 离线布局引擎
│  ├─ css/  app / theme-light / theme-dark / print
│  └─ app/
│     ├─ core/     ns / schema / graph / store / url-state
│     ├─ engine/   engine / eff-table / vdrop / thermal / sequence
│     ├─ rules/    rules / rule-defs           # 14 条校核规则
│     ├─ layout/   elk-adapter / layout-opts / grouping / swimlane
│     ├─ render/   svg-renderer / node-shapes / edge-router / minimap
│     ├─ views/    view-board / view-soc / view-table / view-sequence / view-dashboard
│     ├─ ui/       panel-detail / toolbar / search / issues / tour / legal / i18n
│     ├─ io/       import / export-svg / export-png / export-csv / export-json / export
│     └─ boot.js                                # 启动入口 (PT.start)
├─ data/
│  ├─ config.data.js                            # 阈值/法律文案/功能开关
│  ├─ power_tree.data.js                        # 主数据 (57 节点, 埋 6 个可检出问题)
│  ├─ power_tree_pmu1811.data.js                # BES1811 PMU 真实数据 (39 节点)
│  ├─ parts/parts-lib.data.js                   # 器件库
│  └─ eff/*.data.js                             # 效率表 (1mA step)
├─ docs/    schema / README / LEGAL / CHANGELOG / csv-template
├─ tools/   pack.py / csv2data.py / validate.py / _gen_eff.py
└─ dist/    pack.py 产物 (单文件 HTML)
```

## 核心架构

### 1. 全局命名空间

**禁止 ESM / import**。所有模块通过 IIFE 挂到 `window.PT`:

```js
(function () {
  "use strict";
  var PT = window.PT = window.PT || {};
  // ...
  PT.myModule = { ... };
})();
```

数据通过 `PT.registerData(name, obj)` 注入 (在 `data/*.data.js`)。

### 2. 数据流

```
data/*.data.js (PT.registerData)
  → PT.schema.validate()        // 校验 + 默认值填充
  → PT.store.init(data, config) // 状态中心
  → PT.Graph(data)              // 建图 (附加 __in/__out/__calc)
  → PT.engine.runAll()          // 计算: direct-sum / vdrop / ldo-thermal
  → PT.rules.runAll()           // 校核: 14 条规则
  → PT.elkAdapter.buildElkGraph // 转 ELK 图 (含分组/折叠/侧向)
  → PT.elkAdapter.layout        // ELK layered 布局 (失败降级主线程)
  → PT.SvgRenderer.render       // SVG 渲染
  → UI 事件 → PT.store.set      // 触发重渲染
```

### 3. 关键设计

| 模块 | 职责 |
|---|---|
| `core/ns.js` | `PT` 命名空间 + 事件总线 + 工具 |
| `core/schema.js` | 校验 + 缺省值; 错误必须指明 `节点id.字段名` |
| `core/graph.js` | 图结构, 支持多父/并联/级联/环路检测 |
| `core/store.js` | 单一状态源, `set(patch)` 触发 `state:changed` |
| `core/url-state.js` | URL hash 持久化, `file://` 也有效 |
| `engine/engine.js` | `registerCalculator({id, enabled, run})` 插件式 |
| `rules/rule-defs.js` | 声明式规则数组, 每条 `{id, level, check}` |
| `layout/elk-adapter.js` | ELK 桥接; `file://` 下 Web Worker 不可用, 用同步降级 |
| `render/node-shapes.js` | **两类视觉**: 模块卡片 (BUCK/LDO) vs 电路符号 (电池/RLC/SW) |
| `views/*` | 5 个视图, 每个有 `refresh() / onShow() / onHide()` |

### 4. 节点视觉约定

| 类别 | 类型 | 渲染 |
|---|---|---|
| **模块卡片** | buck/boost/buck_boost/ldo/load/domain/level_shifter/virtual/seq_ctrl | 圆角矩形 + 图标 + 名称 + 参数 + 利用率条 |
| **电路符号** | source/passive_r/passive_l/passive_c/load_switch/efuse/ideal_diode/divider | 标准电气符号 (无外框), 引线拉到节点边缘 |

扩展新符号 → `node-shapes.js` 的 `SYMBOL_RENDERERS[type] = function (g, cx, cy, color, edgeL, edgeR) {...}`。

### 5. file:// 红线

- ❌ `fetch()` / `XMLHttpRequest` 读本地
- ❌ `<script type="module">` / ESM
- ❌ SVG `<foreignObject>` (PNG 导出会污染)
- ✅ `<script src="...">` 传统加载
- ✅ `PT.registerData()` 注入数据
- ✅ Web Worker 用 Blob URL 或同步降级

## 数据 Schema

完整字段字典见 [docs/schema.md](docs/schema.md)。

**关键单位**: V / mA / mW / mΩ / ms / µH / µF / ℃

**主数据示例**: `data/power_tree.data.js` (57 节点, 故意埋 6 个可检出问题: Vin 越界 / 过流 / LDO 压差 / 时序 / 孤立 / net 重名)。

**PMU1811 真实数据**: `data/power_tree_pmu1811.data.js` (39 节点, 严格按 `pmu_1811_power_map.md`: 4 组对偶 / 2 子母线 / 7 SW / 2 VMIC / 5 级联)。

## 校核规则 (14 条)

`assets/app/rules/rule-defs.js`:

- **E** vin_range_mismatch / overcurrent / sequence_violation / cycle_detected / no_source_trace / isolated_node / net_conflict
- **W** derating_warn / ldo_dropout / ldo_loss_warn / vdrop_tolerance / parallel_balance / multi_parent_unmarked / mode_mismatch / passive_stress
- **I** data_incomplete

新增规则 → 追加到 `PT.ruleDefs` 数组, 或运行时 `PT.rules.registerRule({...})`。

## 工具链 (Python 3.12)

```bash
# 校验 (CI 可用, 退出码 0=通过 / 1=E 级错误 / 2=解析失败)
python tools/validate.py data/power_tree.data.js

# CSV 导入 (Visio 迁移)
python tools/csv2data.py docs/csv-template.csv data/power_tree.data.js

# 单文件打包 (dist/power_tree_release.html, ~1.9MB)
python tools/pack.py
```

## 调试

```bash
# 起服务器
python -m http.server 8765 --bind 127.0.0.1

# 浏览器访问
http://127.0.0.1:8765/index.html        # Viewer
http://127.0.0.1:8765/editor.html       # Author
http://127.0.0.1:8765/pmu1811.html      # BES1811 验收
```

**Console 命令**:
```js
PT.store.state                // 当前状态
PT.store.graph                // 图对象
PT.store.issues               // 校核结果
PT.app.recalc()               // 重算
PT.app.currentView().fit()    // 适应当前视图
PT.urlState.currentLink(PT.store.state)  // 当前视图链接
```

## 常见问题

| 问题 | 原因 | 解法 |
|---|---|---|
| 浏览器报 `Converting circular structure to JSON` | 节点含 `__in/__out/__calc` 循环引用 | 别对节点 `JSON.stringify` / `deepClone`, 用浅拷贝 |
| 页面打开空白 | 数据校验失败 | F12 看 console, 或跑 `tools/validate.py` |
| 连线没接到符号引脚 | 符号中心/边缘没对齐 | 符号 `cy` 必须是 `h/2`, 引线到 `0` 和 `w` |
| 浏览器缓存旧 JS | 没加版本号 | 改 HTML 中 `?v=N` |
| ELK 布局失败 | file:// 下 Worker 限制 | 自动降级到 `_fallbackLayout` (BFS 分层) |

## 验收标准 (来自 PowerTree.md)

- [x] 拷贝文件夹到任意机器, 双击 `index.html` 离线可用, 控制台无报错
- [x] 只替换 `data/power_tree.data.js` 即得到新电源树
- [x] 800 节点数据下布局 < 1.5s
- [x] 点击节点右侧面板完整回答"电从哪来/供给谁/余量多少/有什么风险"
- [x] 示例数据中埋的 6 个问题全部检出且可定位
- [x] 板级视图与 SoC 域视图互相跳转
- [x] 导出 SVG/PNG/打印件均含水印与保密声明
- [x] `tools/pack.py` 产出单文件功能与文件夹版一致
- [x] 首次打开有 NDA 确认与新手引导

## 相关文档

- 需求: [PowerTree.md](PowerTree.md)
- BES1811 真实连接: [pmu_1811_power_map.md](pmu_1811_power_map.md)
- Schema: [docs/schema.md](docs/schema.md)
- 使用: [docs/README.md](docs/README.md)
- 合规: [docs/LEGAL.md](docs/LEGAL.md)
- 变更: [docs/CHANGELOG.md](docs/CHANGELOG.md)



## PowerTree规则
见docs\PowerTreeParseRules.md