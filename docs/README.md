# PowerTree — SoC 电源树离线可交互可视化与校核工具

完全离线、零网络请求、零 CDN、零 npm 构建。双击 `index.html` 即可用。

## 快速开始

```
power-tree/
├─ index.html        ← 双击打开 (Viewer, 只读)
├─ editor.html       ← 双击打开 (Author, 可编辑)
└─ ...
```

**首次使用**: 会弹出 NDA 保密确认框, 同意后进入; 接着有新手引导, 可随时点顶栏 `?` 重放。

## 目录说明

```
power-tree/
├─ index.html / editor.html     # 双入口
├─ assets/
│  ├─ vendor/elkjs/             # 布局引擎 (离线)
│  ├─ css/                      # 全局/主题/打印样式
│  └─ app/
│     ├─ core/                  # 命名空间/校验/图/状态/URL
│     ├─ engine/                # 计算引擎 (含 eff/vdrop/thermal/sequence)
│     ├─ rules/                 # 14 条校核规则
│     ├─ layout/                # ELK 适配/分组/泳道
│     ├─ render/                # SVG 渲染
│     ├─ views/                 # 5 个视图
│     ├─ ui/                    # 工具栏/面板/搜索/问题/引导/合规
│     ├─ io/                    # 导入导出
│     └─ boot.js                # 启动
├─ data/
│  ├─ config.data.js            # 阈值/主题/法律文案/功能开关
│  ├─ power_tree.data.js        # 主数据 (示例 ≥45 节点, 埋 6 个问题)
│  ├─ parts/parts-lib.data.js   # 器件库
│  └─ eff/*.data.js             # 效率表
├─ docs/                        # 文档
└─ tools/                       # pack/csv2data/validate
```

## 如何改数据

只替换 `data/power_tree.data.js` 即可, 无需改任何代码。文件必须满足:

1. 第一行注释, 第二行起 `PT.registerData("power_tree", { ... })`
2. JSON 部分每字段独占一行, 键序稳定, 2 空格缩进
3. 符合 `docs/schema.md` 字段定义

**Visio 迁移步骤**:
1. 把 Visio 中的电源树按 `docs/csv-template.csv` 列名整理成 CSV
2. 运行 `python tools/csv2data.py input.csv ../data/power_tree.data.js`
3. 打开 `tools/validate.py` 校验: `python tools/validate.py ../data/power_tree.data.js`
4. 双击 `index.html` 查看

## 如何加节点类型

1. 在 `assets/app/core/schema.js` 的 `NODE_TYPES` 数组中添加新类型 id
2. 在 `assets/app/render/node-shapes.js` 的 `TYPE_COLORS` 和 `TYPE_ICONS` 添加颜色与 SVG path 图标
3. 在 `assets/app/layout/layout-opts.js` 的 `nodeSize` 中添加尺寸
4. 若需参与计算, 在 `assets/app/engine/engine.js` 添加处理逻辑

## 如何加校核规则

在 `assets/app/rules/rule-defs.js` 末尾追加:

```js
{
  id: "my_rule",
  level: "W",   // E | W | I
  check: function (graph, modeId, config) {
    var out = [];
    graph.nodeList().forEach(function (n) {
      if (/* 条件 */) {
        out.push({
          ruleId: "my_rule",
          level: "W",
          nodeId: n.id,
          message_zh: "中文描述",
          message_en: "English message",
          fix_zh: "修复建议",
          fix_en: "Fix suggestion"
        });
      }
    });
    return out;
  }
}
```

或通过 `PT.rules.registerRule(rule)` 动态注册。

## 如何打包单文件

```bash
python tools/pack.py
```

产出 `dist/power_tree_release.html`, 把所有 JS/CSS/数据内联, 双击即用。

## 已知限制

1. 浏览器兼容性: Chrome / Edge 最近两个大版本 (不需要 IE)
2. 性能目标: 800 节点 / 1500 边首次布局 < 1.5s; 超过 400 节点启用视口裁剪 LOD
3. 一期不做跨级功率汇总 / 续航估算 (接口已预留 `PT.engine.registerCalculator({id:"cascade-rollup"})`)
4. `file://` 协议下无法 fetch 外部文件, 所以所有数据通过 `<script>` 加载
5. Web Worker 在 `file://` 下受限, ELK 使用同步降级路径

## file:// 注意事项

- **禁止** `fetch()` / `XMLHttpRequest` 读本地数据
- **禁止** `<script type="module">` / ESM `import`
- **禁止** SVG `<foreignObject>` (会导致 PNG 导出污染)
- 数据通过 `PT.registerData(name, obj)` 注册
- 字体使用系统字体栈

## 前端只读声明

`index.html` (Viewer) 是 **UI 层只读**, 不构成安全边界。
敏感性控制依赖分发管理, 请勿将本工具或数据发送给未授权方。

## 快捷键

| 键 | 功能 |
|---|---|
| `/` | 搜索聚焦 |
| `f` | Fit 适应整图 |
| `e` | 展开全部 |
| `c` | 折叠全部 |
| `t` | 切换主题 |
| `1` ~ `5` | 切换视图 |
| `Esc` | 清除选中 |
| `Shift+拖` | 框选 |
| `双击节点` | 聚焦 N 跳邻域 |
| `双击空白` | 清除聚焦 |

## 二期路线图

- 跨级功率汇总与续航估算
- PDN / IR-drop 联合分析
- UPF 导入生成域视图
- 原理图网表自动比对
- 评审批注协同
- 多版本 A/B 对比视图
