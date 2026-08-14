# PowerTreeHTML — 项目规则

## 0. 前置义务
**开工前必读** [AGENTS.md](../../AGENTS.md)。

## 1. 技术栈
纯静态网页 (HTML + 原生 JS + SVG), Python 3.12 工具链, **零 npm / 零 CDN / 零网络**。
Python 使用项目虚拟环境: `.venv`。

## 2. 硬红线

### 2.1 file:// 兼容 (违反即不通过)
- ❌ 禁 `fetch()` / `XMLHttpRequest` 读本地数据 (Chrome CORS 拒绝)
- ❌ 禁 `<script type="module">` / ESM `import` / `export`
- ❌ 禁 SVG `<foreignObject>` (PNG 导出会污染)
- ✅ 统一 `window.PT` 命名空间 + IIFE + 传统 `<script src>`
- ✅ 数据通过 `PT.registerData(name, obj)` 注入
- ✅ 字体用系统栈, 图标用内联 SVG path

### 2.2 命名空间
- 所有 JS 模块必须挂在 `window.PT` 下, 禁全局污染
- 每个文件 IIFE 包裹, 首行 `"use strict"`
- 数据/效率表: `PT.registerData()` / `PT.registerEff()`

### 2.3 数据处理
- ❌ 禁对节点 `JSON.stringify` / `deepClone` (含 `__in/__out/__calc` 循环引用)
- ✅ 原始数据与计算结果严格分离: `node.__calc` 命名空间存放计算结果, 不污染源 JSON
- ✅ schema 校验错误必须指明 `节点id.字段名.期望类型`

### 2.4 视觉约定
- 模块卡片 (BUCK/LDO/load/domain): 圆角矩形 + 图标 + 参数 + 利用率条
- 电路符号 (电池/RLC/SW/efuse/diode/divider): 标准电气符号, **无外框**, 引线必须拉到节点左右边缘, 中心 `h/2`
- 文字统一 `<text>` + 手写换行/省略号, 禁依赖外部测量

### 2.5 工具链
- Python 一律走 `.venv` (项目虚拟环境)
- `tools/pack.py` 打包产物 → `dist/power_tree_release.html`
- `tools/validate.py` CI 可用, 退出码 0/1/2
- CSV 模板见 `docs/csv-template.csv`

### 2.6 中文/注释
- 中文一律简体
- 代码注释中文, 不删既有注释
- 不主动 `git commit`

## 3. 触发式必读
- 改数据 → [docs/schema.md](docs/schema.md)
- 加节点类型 → [AGENTS.md](AGENTS.md) §4 + `node-shapes.js`
- 加校核规则 → `assets/app/rules/rule-defs.js`
- 打包/校验 → `tools/`
- BES1811 真实数据 → [pmu_1811_power_map.md](pmu_1811_power_map.md)

## 4. 验收
- 双击 `index.html` 离线可用, 控制台零报错
- 只替换 `data/power_tree.data.js` 即得新电源树
- 示例数据埋的 6 个问题全部检出可定位
- `tools/pack.py` 单文件与文件夹版功能一致
