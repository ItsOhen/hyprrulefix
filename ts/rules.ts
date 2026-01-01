let NAMED_OUTPUT = true;

type ItemType = "selector" | "flag" | "variable";
type RuleType = "windowrule" | "layerrule";

type Item = { key: string; value: string; type: ItemType; error: boolean };
type Rule = { type: RuleType; items: Item[] };

const replacementsKeys: Record<string, string | [string, string]> = {
  initialClass: "initial_class",
  initialTitle: "initial_title",
  floating: "float",
  pinned: "pin",
  fullscreenstate: ["fullscreen_state_internal", "fullscreen_state_client"],
  onworkspace: "workspace",
  xdgTag: "xdg_tag",
  noinitialfocus: "no_initial_focus",
};

const replacementsValues: Record<string, string> = {
  bordersize: "border_size",
  bordercolor: "border_color",
  roundingpower: "rounding_power",
  noborder: "border_size",
  noanim: "no_anim",
  noblur: "no_blur",
  nodim: "no_dim",
  noshadow: "no_shadow",
  norounding: "no_rounding",
  nofocus: "no_focus",
  nofollowmouse: "no_follow_mouse",
  allowsinput: "allows_input",
  focusonactivate: "focus_on_activate",
  fullscreenstate: "fullscreen_state",
  maxsize: "max_size",
  minsize: "min_size",
  nomaxsize: "no_max_size",
  keepaspectratio: "keep_aspect_ratio",
  idleinhibit: "idle_inhibit",
  persistentsize: "persistent_size",
  stayfocused: "stay_focused",
  dimaround: "dim_around",
  noclosefor: "no_close_for",
  suppressevent: "suppress_event",
  forcergbx: "force_rgbx",
  syncfullscreen: "sync_fullscreen",
  renderunfocused: "render_unfocused",
  scrollmouse: "scroll_mouse",
  scrolltouchpad: "scroll_touchpad",
  noshortcutsinhibit: "no_shortcuts_inhibit",
  noscreenshare: "no_screen_share",
  novrr: "no_vrr",
  noinitialfocus: "no_initial_focus",
  ignorealpha: "ignore_alpha",
  ignorezero: "ignore_alpha",
  blurpopups: "blur_popups",
  abovelock: "above_lock",
};

const defaults: Record<string, string> = {
  border_size: "0",
  float: "on",
  xwayland: "0",
  fullscreen: "on",
  pin: "on",
  focus: "0",
  group: "0",
  modal: "0",
  no_anim: "on",
  ignore_alpha: "0",
  fullscreen_state_internal: "0",
  fullscreen_state_client: "0",
};

function parseSize(tokens: string[]): { mode: string; values: string[] } {
  let mode = "size";
  const values = tokens.map((v, i) => {
    let token = v.trim();
    if (token.startsWith(">")) {
      mode = "size_min";
      token = token.slice(1);
    } else if (token.startsWith("<")) {
      mode = "size_max";
      token = token.slice(1);
    }
    if (token.endsWith("%")) {
      const factor = parseFloat(token.slice(0, -1)) / 100;
      return i === 0 ? `(monitor_w*${factor})` : `(monitor_h*${factor})`;
    }
    return token;
  });
  return { mode, values };
}

function parseMove(tokens: string[]): { values: string[] } {
  let cursor = false;
  let onscreen = false;
  const args: string[] = [];
  for (const t of tokens) {
    if (t === "cursor") cursor = true;
    else if (t === "onscreen") onscreen = true;
    else args.push(t);
  }

  return {
    values: args.map((raw, idx) => {
      const isX = idx === 0;
      const monitor = isX ? "monitor_w" : "monitor_h";
      const client = isX ? "window_w" : "window_h";
      const cursorBase = isX ? "cursor_x" : "cursor_y";

      const parts = raw.trim().split("-");
      const transformed = parts.map((part) => {
        part = part.trim();
        if (part === "w") return client;
        if (part.endsWith("%")) {
          const factor = parseFloat(part.slice(0, -1)) / 100;
          return `(${monitor}*${factor})`;
        }
        return part;
      });

      let expr = transformed.join("-");
      if (onscreen) {
        const sep = NAMED_OUTPUT ? "," : `\\,`;
        expr = `min(max(${expr}${sep}0)${sep}${monitor}-${client})`;
      }
      if (cursor) expr = `${cursorBase}+(${expr})`;
      return `(${expr})`;
    }),
  };
}

function parsePart(part: string): Item | Item[] {
  part = part.trim();
  if (!part) return { key: "", value: "", type: "flag", error: true };
  if (part.startsWith("$"))
    return { key: part, value: "", type: "variable", error: false };

  const colonIndex = part.indexOf(":");
  const firstSpace = part.indexOf(" ");
  if (colonIndex !== -1 && (firstSpace === -1 || firstSpace > colonIndex)) {
    const rawKey = part.slice(0, colonIndex).trim();
    const rawVal = part.slice(colonIndex + 1).trim();
    const mapping = replacementsKeys[rawKey] ?? rawKey;
    if (Array.isArray(mapping)) {
      const vals = rawVal.split(/\s+/);
      return mapping.map((k, i) => ({
        key: k,
        value: vals[i] ?? "0",
        type: "selector",
        error: false,
      }));
    }
    return { key: mapping, value: rawVal, type: "selector", error: false };
  }

  const tokens = part.split(/\s+/);
  const rawKey = tokens[0].toLowerCase();
  const key = replacementsValues[rawKey] ?? rawKey;
  if (key === "size") {
    const { mode, values } = parseSize(tokens.slice(1));
    return { key: mode, value: values.join(" "), type: "flag", error: false };
  }
  if (key === "move") {
    const { values } = parseMove(tokens.slice(1));
    return { key, value: values.join(" "), type: "flag", error: false };
  }
  const value = tokens.slice(1).join(" ") || defaults[key] || "on";
  return { key, value, type: "flag", error: false };
}

function parseLine(line: string): Rule | null {
  const eqIndex = line.indexOf("=");
  if (eqIndex === -1) return null;

  const typeRaw = line.slice(0, eqIndex).trim();
  const rhs = line.slice(eqIndex + 1).trim();

  let type: RuleType;
  if (typeRaw.startsWith("windowrule")) type = "windowrule";
  else if (typeRaw.startsWith("layerrule")) type = "layerrule";
  else return null;

  const parts = rhs.split(",").map((p) => p.trim());
  if (!parts.length) return null;

  const items: Item[] = [];

  if (type === "layerrule") {
    const flagTokens = parts[0].split(/\s+/);
    const key =
      replacementsValues[flagTokens[0].toLowerCase()] ??
      flagTokens[0].toLowerCase();
    const value = flagTokens.slice(1).join(" ") || defaults[key] || "on";
    items.push({ key, value, type: "flag", error: false });

    for (let i = 1; i < parts.length; i++) {
      items.push({
        key: parts[i],
        value: "on",
        type: "selector",
        error: false,
      });
    }
  } else {
    for (const part of parts) {
      if (!part) continue;
      const parsed = parsePart(part);
      if (Array.isArray(parsed)) items.push(...parsed);
      else items.push(parsed);
    }
  }

  return { type, items };
}

function mergeRules(rules: Rule[]): Rule[] {
  const map = new Map<string, Rule>();

  for (const rule of rules) {
    const sigParts = rule.items
      .filter((i) => i.type === "selector" || i.type === "variable")
      .map((i) => `${i.key}:${i.value}`)
      .sort();
    const signature = sigParts.join("|");

    if (!map.has(signature)) map.set(signature, { type: rule.type, items: [] });

    const existing = map.get(signature)!;
    for (const item of rule.items) {
      if (item.type === "selector" || item.type === "variable") {
        if (
          !existing.items.some(
            (e) => e.key === item.key && e.value === item.value,
          )
        )
          existing.items.push(item);
      } else {
        const idx = existing.items.findIndex(
          (e) => e.key === item.key && e.type === "flag",
        );
        if (idx >= 0) existing.items[idx] = item;
        else existing.items.push(item);
      }
    }
  }

  return Array.from(map.values());
}

export function generateRules(input: string, named = true): string {
  NAMED_OUTPUT = named;
  const lines = input.split("\n");
  const output: Array<string | null> = [...lines];

  const rules: { rule: Rule; lineIndex: number }[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const rule = parseLine(line);
    if (rule) rules.push({ rule, lineIndex: idx });
  });

  const mergedRules = mergeRules(rules.map((r) => r.rule));

  const itemOrder: Record<Item["type"], number> = {
    flag: 0,
    selector: 1,
    variable: 2,
  };

  const usedSignatures = new Set<string>();
  let windowCounter = 1;
  let layerCounter = 1;

  for (const { rule, lineIndex } of rules) {
    const sig = rule.items
      .filter((i) => i.type === "selector" || i.type === "variable")
      .map((i) => `${i.key}:${i.value}`)
      .sort()
      .join("|");

    if (usedSignatures.has(sig)) {
      output[lineIndex] = null;
      continue;
    }

    usedSignatures.add(sig);

    const merged = mergedRules.find((r) => {
      const rSig = r.items
        .filter((i) => i.type === "selector" || i.type === "variable")
        .map((i) => `${i.key}:${i.value}`)
        .sort()
        .join("|");
      return rSig === sig;
    })!;

    merged.items.sort((a, b) => itemOrder[a.type] - itemOrder[b.type]);

    if (named) {
      const block: string[] = [];

      block.push(`${merged.type} {`);
      block.push(
        `  name = ${
          merged.type === "windowrule"
            ? `windowrule-${windowCounter++}`
            : `layerrule-${layerCounter++}`
        }`,
      );

      for (const item of merged.items) {
        if (item.type === "variable") {
          block.push(`  match:${item.key}`);
        } else if (item.type === "selector") {
          block.push(
            merged.type === "layerrule"
              ? `  match:namespace = ${item.key}`
              : `  match:${item.key} = ${item.value}`,
          );
        } else if (item.type === "flag") {
          block.push(`  ${item.key} = ${item.value}`);
        }
      }

      block.push("}\n");
      output[lineIndex] = block.join("\n");
    } else {
      const itemsText = merged.items.map((item) => {
        if (item.type === "variable") {
          return item.key;
        } else if (item.type === "selector") {
          return merged.type === "layerrule"
            ? `match:namespace ${item.key}`
            : `match:${item.key} ${item.value}`;
        } else if (item.type === "flag") {
          return `${item.key} ${item.value}`;
        }
      });

      output[lineIndex] = `${merged.type} = ${itemsText.join(", ")}`;
    }
  }

  return output.filter((l): l is string => l !== null).join("\n");
}
