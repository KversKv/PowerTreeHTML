# PowerTree 数据 Schema 字典

> 单位约定: 电压 V, 电流 mA, 功率 mW, 电阻 mΩ, 时间 ms, 电感 µH, 电容 µF, 温升 ℃

## meta (项目元信息)

| 字段 | 类型 | 必填 | 缺省 | 说明 | 示例 |
|---|---|---|---|---|---|
| schema_version | string | ✓ | — | 数据格式版本 | "1.0" |
| project | string | ✓ | — | 项目名 | "BES1811 SoC EVB" |
| version | string | ✓ | — | 数据版本 | "v0.3" |
| date | string | ✓ | — | 数据日期 ISO | "2026-08-14" |
| author | string | — | "" | 作者 | "PowerTeam" |
| commit | string | — | "" | git commit | "a1b2c3d" |
| changelog | string | — | "" | 本版变更摘要 | "首版: 核心域 DVFS 拆分" |

## modes (功耗模式)

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | ✓ | 模式 id, 如 "active" |
| name_zh | string | ✓ | 中文名 |
| name_en | string | ✓ | 英文名 |
| default | bool | — | 是否默认模式 (仅 1 个) |

## groups (分组, 支持嵌套)

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | ✓ | 分组 id |
| name_zh / name_en | string | ✓ | 显示名 |
| kind | enum | ✓ | `board` / `pmic` / `chip` / `domain` |
| parent | string | — | 父分组 id, 顶层为 null |
| side | enum | — | `left` (PMIC/板级) / `right` (chip/domain), 用于布局 |

## nodes (节点)

### 通用字段

| 字段 | 类型 | 必填 | 缺省 | 说明 |
|---|---|---|---|---|
| id | string | ✓ | — | 唯一 id |
| type | enum | ✓ | — | 见下方枚举 |
| name | string | — | "" | 显示名 |
| group | string | — | — | 所属分组 id |
| part | string | — | — | 引用 parts-lib 的型号 |
| refdes | string | — | — | 原理图位号 |
| sheet | string | — | — | 原理图页码 |
| tags | array<string> | — | [] | 标签 |
| note | string | — | "" | 备注 |
| side | enum | — | — | 布局侧向 hint |

### type 枚举

`source | buck | boost | buck_boost | ldo | load_switch | efuse | ideal_diode | divider | level_shifter | passive_r | passive_l | passive_c | load | domain | virtual | seq_ctrl`

### 电源器件通用

| 字段 | 类型 | 单位 | 说明 |
|---|---|---|---|
| vin_range | [number, number] | V | 输入电压范围 [min, max] |
| vout | number | V | 标称输出电压 |
| vout_range | [number, number] | V | 输出电压范围 |
| vout_tol_pct | number | % | 输出容差 (缺省 3) |
| imax | number | mA | 最大输出电流 |
| iq_ua | number | µA | 静态电流 |
| efficiency | number | ratio | 兜底效率标量 |
| eff_ref | string | — | 引用 data/eff/*.data.js 的型号 |
| dvfs | object | V | `{ mode_id: vout }`, 按模式覆盖 vout |
| on_in_modes | array<string> | — | 该模块在哪些模式上电 |
| theta_ja | number | ℃/W | 热阻 (可选, 用于温升估算) |

### LDO 专用

| 字段 | 类型 | 单位 | 说明 |
|---|---|---|---|
| dropout_mv | number | mV | 最小压差 |

### load_switch / efuse / ideal_diode 专用

| 字段 | 类型 | 单位 | 说明 |
|---|---|---|---|
| rds_on_mohm | number | mΩ | 导通电阻 |
| soft_start_ms | number | ms | 软启动时间 |
| vf_mv | number | mV | 理想二极管正向压降 |

### 无源器件

| 字段 | 类型 | 单位 | 说明 |
|---|---|---|---|
| r_mohm | number | mΩ | 电阻阻值 |
| power_mw | number | mW | 额定功率 |
| tol_pct | number | % | 精度 |
| l_uh | number | µH | 电感值 |
| dcr_mohm | number | mΩ | 直流电阻 |
| isat | number | mA | 饱和电流 |
| c_uf | number | µF | 电容值 |
| esr_mohm | number | mΩ | ESR |
| volt_rating | number | V | 耐压 |

### load / domain 专用

| 字段 | 类型 | 单位 | 说明 |
|---|---|---|---|
| voltage | number | V | 工作电压 |
| vtol_pct | number | % | 末端电压容差 (缺省 5) |
| current | object | mA | `{ mode_id: {typ, max} }` 或 `{ mode_id: number }` |
| domain | string | — | 所属电源域 |
| always_on | bool | — | 是否常开 |
| retention | bool | — | 是否 retention |
| iso_signal | string | — | ISO 信号名 |
| reset_signal | string | — | RESET 信号名 |

### 结构标注

| 字段 | 类型 | 说明 |
|---|---|---|
| parallel_group | string | 并联组 id, 同组成员被认为并联均流 |
| cascade | object | `{ chain_id, stage }` 级联链标注 |
| sense | enum | `remote` 远端采样 / `local` 本地 |

### enable (时序)

| 字段 | 类型 | 单位 | 说明 |
|---|---|---|---|
| src | string | — | EN 源节点 id (PMIC_SEQ / SOC_GPIOx) |
| signal | string | — | 信号名 |
| order | number | — | 上电顺序 (必填才能进时序图) |
| delay_ms | number | ms | 启动延迟 |
| ramp_ms | number | ms | 斜升时间 |
| pg | bool | — | 是否输出 PG 信号 |
| off_order | number | — | 下电顺序 (缺省按上电逆序) |

## edges (边)

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| from | string | ✓ | 上游节点 id |
| to | string | ✓ | 下游节点 id |
| type | enum | ✓ | `power` 实线 / `control` 虚线 |
| sub | enum | — | 控制边子类: `EN / PG / I2C / RESET / ISO / SENSE / IRQ` |
| net | string | — | 电源网络名 |
| signal | string | — | 控制信号名 |
| trace_r_mohm | number | mΩ | 走线电阻 (缺省 0) |
| inline | array | — | 内联无源 `[{type, r_mohm, dcr_mohm, name}]` |

## 效率表 (data/eff/*.data.js)

```js
PT.registerEff("PART_ID", {
  "unit": { "i": "mA", "eff": "ratio" },
  "conditions": [
    { "vin": 3.8, "vout": 0.9, "i_start": 1, "i_step": 1,
      "eff": [0.31, 0.35, ..., 0.90] }
  ]
});
```

- `i_start`: 起始电流 (mA)
- `i_step`: 步进 (mA), 推荐 1
- `eff`: 效率数组, 长度 = `(i_max - i_start) / i_step + 1`
- 查询时按 `(vin, vout, iout)` 双线性插值, 范围外夹取并告警

## 校核规则阈值 (config.data.js)

| 字段 | 缺省 | 说明 |
|---|---|---|
| thresholds.derating_warn | 0.8 | 利用率告警阈值 |
| thresholds.ldo_loss_warn_mw | 500 | LDO 损耗告警 (mW) |
| thresholds.vdrop_tol_pct_default | 5 | Vdrop 容差默认值 |
