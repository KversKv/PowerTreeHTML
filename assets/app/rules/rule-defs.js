/* ============================================================
 * rule-defs.js — 声明式校核规则定义
 * 每条: { id, level:E|W|I, check(graph, modeId, config) -> issues[] }
 * issue 结构: { ruleId, level, nodeId, edgeId, message_zh, message_en, fix_zh, fix_en }
 * ============================================================ */
(function () {
  "use strict";
  var PT = window.PT;

  function _issue(rule, nodeId, msgZh, msgEn, fixZh, fixEn, extra) {
    var o = {
      ruleId: rule.id,
      level: rule.level,
      nodeId: nodeId || null,
      edgeId: null,
      message_zh: msgZh,
      message_en: msgEn,
      fix_zh: fixZh || "",
      fix_en: fixEn || ""
    };
    if (extra) {
      for (var k in extra) o[k] = extra[k];
    }
    return o;
  }

  // 取上游电压范围
  function _upVoutRange(graph, nodeId, modeId) {
    var ups = graph.upstreamPowerIds(nodeId);
    if (!ups.length) return null;
    var upNode = graph.node(ups[0]);
    if (!upNode) return null;
    return PT.engine.nodeVoutRange(upNode, modeId);
  }

  var RULES = [
    /* ---------- E: Vin 越界 ---------- */
    {
      id: "vin_range_mismatch",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          if (!n.vin_range || n.vin_range.length < 2) return;
          var ups = graph.upstreamPowerIds(n.id);
          if (!ups.length) return;
          ups.forEach(function (upId) {
            var upNode = graph.node(upId);
            if (!upNode) return;
            var upRange = PT.engine.nodeVoutRange(upNode, modeId);
            if (!upRange) return;
            if (!PT.util.rangeOverlap(upRange, n.vin_range)) {
              out.push(_issue(this, n.id,
                "Vin 越界: 上游 " + upId + " 输出 [" + PT.util.fmt(upRange[0]) + "~" + PT.util.fmt(upRange[1]) + "]V 与本节点输入 [" + PT.util.fmt(n.vin_range[0]) + "~" + PT.util.fmt(n.vin_range[1]) + "]V 无交集",
                "Vin out of range: upstream " + upId + " [" + PT.util.fmt(upRange[0]) + "~" + PT.util.fmt(upRange[1]) + "]V has no overlap with [" + PT.util.fmt(n.vin_range[0]) + "~" + PT.util.fmt(n.vin_range[1]) + "]V",
                "检查上游 vout_range 或本节点 vin_range 是否填错; 必要时换用宽输入器件",
                "Check upstream vout_range or local vin_range; consider wide-input part"));
            }
          }, this);
        }, this);
        return out;
      }
    },

    /* ---------- E: 过流 ---------- */
    {
      id: "overcurrent",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          var util = n.__calc && n.__calc.utilization;
          if (util == null) return;
          if (util > 1.0) {
            out.push(_issue(this, n.id,
              "过流: 利用率 " + PT.util.pct(util) + " 超过 100% (I=" + PT.util.fmt(n.__calc.i_out_sum_ma) + "mA / imax=" + PT.util.fmt(n.imax) + "mA)",
              "Overcurrent: utilization " + PT.util.pct(util) + " exceeds 100%",
              "减小负载 / 换更大电流器件 / 分流到并联组",
              "Reduce load / use higher current part / split to parallel group"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: 余量不足 ---------- */
    {
      id: "derating_warn",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        var th = (config.thresholds && config.thresholds.derating_warn) || 0.8;
        graph.nodeList().forEach(function (n) {
          var util = n.__calc && n.__calc.utilization;
          if (util == null) return;
          if (util > th && util <= 1.0) {
            out.push(_issue(this, n.id,
              "余量不足: 利用率 " + PT.util.pct(util) + " 超过阈值 " + PT.util.pct(th),
              "Derating: utilization " + PT.util.pct(util) + " exceeds " + PT.util.pct(th),
              "建议保留 20% 以上余量",
              "Recommend > 20% margin"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: LDO 压差不足 ---------- */
    {
      id: "ldo_dropout",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          if (n.type !== "ldo") return;
          if (n.dropout_mv == null) return;
          var vinRange = _upVoutRange(graph, n.id, modeId);
          if (!vinRange) return;
          var vout = PT.engine.nodeVout(n, modeId);
          if (vout == null) return;
          var vinMin = vinRange[0];
          var headroom = (vinMin - vout) * 1000;
          if (headroom < n.dropout_mv) {
            out.push(_issue(this, n.id,
              "LDO 压差不足: Vin_min=" + PT.util.fmt(vinMin) + "V, Vout=" + PT.util.fmt(vout) + "V, 需要 dropout " + PT.util.fmt(n.dropout_mv) + "mV, 实际仅 " + PT.util.fmt(headroom) + "mV",
              "LDO dropout insufficient: headroom " + PT.util.fmt(headroom) + "mV < " + PT.util.fmt(n.dropout_mv) + "mV",
              "抬高上游电压 / 降低 Vout / 换低压差 LDO",
              "Raise upstream / lower Vout / use low-dropout LDO"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: LDO 热耗超阈值 ---------- */
    {
      id: "ldo_loss_warn",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        var th = (config.thresholds && config.thresholds.ldo_loss_warn_mw) || 500;
        graph.nodeList().forEach(function (n) {
          if (n.type !== "ldo") return;
          var loss = n.__calc && n.__calc.loss_mw;
          if (loss == null) return;
          if (loss > th) {
            out.push(_issue(this, n.id,
              "LDO 热耗超阈值: " + PT.util.fmt(loss) + "mW > " + th + "mW",
              "LDO loss exceeds threshold: " + PT.util.fmt(loss) + "mW > " + th + "mW",
              "考虑用 BUCK 预降压 / 加散热 / 分散到多个 LDO",
              "Pre-regulate with BUCK / add thermal / split LDO"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: Vdrop 超容差 ---------- */
    {
      id: "vdrop_tolerance",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          if (n.type !== "load" && n.type !== "domain") return;
          var ok = n.__calc && n.__calc.end_ok;
          if (ok === false) {
            out.push(_issue(this, n.id,
              "末端电压超容差: 末端 " + PT.util.fmt(n.__calc.end_voltage) + "V 偏差 " + PT.util.pct(n.__calc.end_dev_pct) + " > " + (n.vtol_pct || 5) + "%",
              "End voltage out of tolerance: " + PT.util.fmt(n.__calc.end_voltage) + "V dev " + PT.util.pct(n.__calc.end_dev_pct),
              "减小走线电阻 / 加粗线宽 / 使用远端采样",
              "Reduce trace R / wider trace / use remote sense"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: 并联均流风险 ---------- */
    {
      id: "parallel_balance",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        var groups = {};
        graph.nodeList().forEach(function (n) {
          if (!n.parallel_group) return;
          (groups[n.parallel_group] = groups[n.parallel_group] || []).push(n);
        });
        Object.keys(groups).forEach(function (gid) {
          var members = groups[gid];
          if (members.length < 2) {
            out.push(_issue(this, members[0].id,
              "并联组 " + gid + " 仅 1 个成员, 并联无意义",
              "Parallel group " + gid + " has only 1 member",
              "确认是否漏标成员", "Check if members missing"));
            return;
          }
          // 校验一致性
          var vouts = members.map(function (m) { return m.vout; }).filter(function (v) { return v != null; });
          var rdsons = members.map(function (m) { return m.rds_on_mohm; }).filter(function (v) { return v != null; });
          var imaxs = members.map(function (m) { return m.imax; }).filter(function (v) { return v != null; });
          function spread(arr) {
            if (arr.length < 2) return 0;
            var min = Math.min.apply(null, arr), max = Math.max.apply(null, arr);
            return max - min;
          }
          var msgs = [];
          if (spread(vouts) > 0.01) msgs.push("vout 不一致 (" + vouts.map(function (v) { return PT.util.fmt(v); }).join("/") + ")");
          if (spread(rdsons) > 1) msgs.push("rds_on 不一致 (" + rdsons.map(function (v) { return PT.util.fmt(v); }).join("/") + "mΩ)");
          if (spread(imaxs) > 1) msgs.push("imax 不一致 (" + imaxs.map(function (v) { return PT.util.fmt(v); }).join("/") + "mA)");
          if (vouts.length < members.length || rdsons.length < members.length || imaxs.length < members.length) {
            msgs.push("参数未全部标注");
          }
          if (msgs.length) {
            members.forEach(function (m) {
              out.push(_issue(this, m.id,
                "并联组 " + gid + " 均流风险: " + msgs.join("; "),
                "Parallel group " + gid + " balance risk: " + msgs.join("; "),
                "保证 vout/rds_on/imax 一致, 或加外部均流电阻",
                "Match vout/rds_on/imax or add ballast resistor"));
            }, this);
          }
        }, this);
        return out;
      }
    },

    /* ---------- E: 时序违例 ---------- */
    {
      id: "sequence_violation",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        var seqIssues = PT.sequence.checkSequence(graph, modeId);
        seqIssues.forEach(function (si) {
          var level = "E";
          if (si.kind === "off_order_undefined") level = "W";
          out.push(_issue({ id: "sequence_violation", level: level }, si.nodeId,
            "时序违例 (" + si.kind + "): " + si.message,
            "Sequence violation (" + si.kind + "): " + si.message,
            "调整 enable.order 或检查 EN 源模式",
            "Adjust enable.order or check EN source mode"));
        });
        return out;
      }
    },

    /* ---------- E: 环路 ---------- */
    {
      id: "cycle_detected",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        var cycles = graph.detectCycles();
        cycles.forEach(function (cyc) {
          if (cyc.length) {
            out.push(_issue(this, cyc[0],
              "检测到电源环路: " + cyc.join(" → "),
              "Power cycle detected: " + cyc.join(" -> "),
              "检查是否有双向连接填错方向",
              "Check edge direction"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- E: 无源可溯 ---------- */
    {
      id: "no_source_trace",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          if (n.type === "source") return;
          if (n.type === "seq_ctrl") return;
          if (n.type === "virtual") return;
          if (n.type === "passive_r" || n.type === "passive_l" || n.type === "passive_c") return;
          var sources = graph.traceToSources(n.id);
          if (!sources.length) {
            out.push(_issue(this, n.id,
              "无源可溯: 沿 power 边追不到任何 source",
              "No source traceable via power edges",
              "补全上游 power 连接, 或将节点改为 virtual",
              "Add upstream power path or mark as virtual"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- E: 孤立节点 ---------- */
    {
      id: "isolated_node",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          if (n.__in.length === 0 && n.__out.length === 0) {
            out.push(_issue(this, n.id,
              "孤立节点: 没有任何边连接",
              "Isolated node: no edges",
              "删除或补充连接", "Remove or connect"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: 多父未标注 ORing/并联 ---------- */
    {
      id: "multi_parent_unmarked",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          var ups = graph.upstreamPowerIds(n.id);
          if (ups.length < 2) return;
          // 上游是否有 ORing / 并联标注
          var hasOring = ups.some(function (u) {
            var un = graph.node(u);
            return un && (un.type === "ideal_diode" || un.parallel_group);
          });
          if (!hasOring) {
            out.push(_issue(this, n.id,
              "多父节点 (" + ups.join(", ") + ") 未标注 ORing 或并联组",
              "Multi-parent (" + ups.join(", ") + ") not marked as ORing/parallel",
              "确认是否应通过 ideal_diode 合路或加 parallel_group",
              "Use ideal_diode or parallel_group"));
          }
        }, this);
        return out;
      }
    },

    /* ---------- E: net 重名但电压不同 ---------- */
    {
      id: "net_conflict",
      level: "E",
      check: function (graph, modeId, config) {
        var out = [];
        var netVoltages = {};   // net -> { v, edge }
        graph.edges.forEach(function (e) {
          if (e.type !== "power" || !e.net) return;
          var fromNode = graph.node(e.from);
          if (!fromNode) return;
          var v = PT.engine.nodeVout(fromNode, modeId);
          if (v == null) return;
          if (!netVoltages[e.net]) {
            netVoltages[e.net] = { v: v, edgeId: e.id, fromId: e.from };
          } else if (Math.abs(netVoltages[e.net].v - v) > 0.01) {
            out.push(_issue(this, fromNode.id,
              "net 重名冲突: " + e.net + " 在 " + netVoltages[e.net].fromId + " 为 " + PT.util.fmt(netVoltages[e.net].v) + "V, 在 " + e.from + " 为 " + PT.util.fmt(v) + "V",
              "Net name conflict: " + e.net + " has different voltages",
              "重命名其中一个 net, 或修正电压",
              "Rename net or fix voltage",
              { edgeId: e.id }));
          }
        }, this);
        return out;
      }
    },

    /* ---------- W: 模式一致性 ---------- */
    {
      id: "mode_mismatch",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          if (n.type !== "load" && n.type !== "domain") return;
          var i = PT.engine.loadCurrent(n, modeId, "typ") || PT.engine.loadCurrent(n, modeId, "max");
          if (i <= 0) return;
          var ups = graph.upstreamPowerIds(n.id);
          ups.forEach(function (upId) {
            var upNode = graph.node(upId);
            if (!upNode) return;
            if (!PT.engine.isOnInMode(upNode, modeId)) {
              out.push(_issue(this, n.id,
                "模式不一致: 负载在 " + modeId + " 有电流 " + PT.util.fmt(i) + "mA, 但上游 " + upId + " 的 on_in_modes 不含该模式",
                "Mode mismatch: load has current in " + modeId + " but upstream " + upId + " is off",
                "检查 on_in_modes 或 current 配置",
                "Check on_in_modes / current"));
            }
          }, this);
        }, this);
        return out;
      }
    },

    /* ---------- W: 无源器件参数越界 ---------- */
    {
      id: "passive_stress",
      level: "W",
      check: function (graph, modeId, config) {
        var out = [];
        graph.nodeList().forEach(function (n) {
          // 电阻功耗
          if (n.type === "passive_r" && n.r_mohm && n.power_mw) {
            var iMa = (n.__calc && n.__calc.i_in_ma) || 0;
            var pMw = (iMa * iMa * n.r_mohm) / 1e6 * 1000;  // I²R: (mA)² × mΩ / 1e6 = µW → ×1000 = nW? 重算:
            // P = I²R: I(mA)² × R(mΩ) = (1e-3 A)² × 1e-3 Ω × (mA)²(mΩ) = 1e-9 W × (...) → mW = I²R/1e6
            pMw = (iMa * iMa * n.r_mohm) / 1e6;
            if (pMw > n.power_mw) {
              out.push(_issue(this, n.id,
                "采样电阻功耗超额定: " + PT.util.fmt(pMw) + "mW > " + n.power_mw + "mW",
                "Resistor power exceeds rating: " + PT.util.fmt(pMw) + "mW",
                "换更大功率电阻或减小阻值", "Use higher power R or lower value"));
            }
          }
          // 电感超 Isat
          if (n.type === "passive_l" && n.isat) {
            var i2 = (n.__calc && n.__calc.i_in_ma) || 0;
            if (i2 > n.isat) {
              out.push(_issue(this, n.id,
                "磁珠/电感电流超 Isat: " + PT.util.fmt(i2) + "mA > " + n.isat + "mA",
                "Inductor current exceeds Isat",
                "换更高 Isat 器件", "Use higher Isat part"));
            }
          }
          // 电容耐压
          if (n.type === "passive_c" && n.volt_rating) {
            // 找上游电压
            var ups = graph.upstreamPowerIds(n.id);
            if (ups.length) {
              var upNode = graph.node(ups[0]);
              var v = upNode ? PT.engine.nodeVout(upNode, modeId) : null;
              if (v != null && v > n.volt_rating * 0.8) {
                out.push(_issue(this, n.id,
                  "电容耐压不足: 工作电压 " + PT.util.fmt(v) + "V 接近或超过额定 " + n.volt_rating + "V 的 80%",
                  "Cap voltage rating insufficient",
                  "换更高耐压电容", "Use higher voltage rating"));
              }
            }
          }
        }, this);
        return out;
      }
    },

    /* ---------- I: 数据缺失 ---------- */
    {
      id: "data_incomplete",
      level: "I",
      check: function (graph, modeId, config) {
        var out = [];
        var critical = ["imax", "vin_range", "current", "efficiency"];
        graph.nodeList().forEach(function (n) {
          var missing = [];
          if ((n.type === "buck" || n.type === "boost" || n.type === "buck_boost" || n.type === "ldo" || n.type === "load_switch")) {
            if (n.imax == null) missing.push("imax");
            if (n.vin_range == null) missing.push("vin_range");
            if ((n.type === "buck" || n.type === "boost" || n.type === "buck_boost") && n.efficiency == null && !n.eff_ref) {
              missing.push("efficiency/eff_ref");
            }
          }
          if ((n.type === "load" || n.type === "domain") && n.current == null) {
            missing.push("current");
          }
          if (missing.length) {
            out.push(_issue(this, n.id,
              "数据缺失: " + missing.join(", ") + " 未填",
              "Data missing: " + missing.join(", "),
              "补充 " + missing.join("/") + " 字段",
              "Fill " + missing.join("/")));
          }
        }, this);
        return out;
      }
    }
  ];

  PT.ruleDefs = RULES;
})();
