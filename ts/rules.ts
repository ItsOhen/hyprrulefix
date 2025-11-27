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
};

const replacementsValues: Record<string, string> = {
  bordersize: "border_size",
  idleinhibit: "idle_inhibit",
  noanim: "no_anim",
  noborder: "border_size",
  suppressevent: "suppress_event",
  nofocus: "no_focus",
  maxsize: "max_size",
  noinitialfocus: "no_initial_focus",
  noblur: "no_blur",
  ignorealpha: "ignore_alpha",
  ignorezero: "ignore_alpha",
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

function parseSize(tokens: string[]): string {
  return tokens
    .map((v, i) => {
      if (!v.endsWith("%")) return v;
      const factor = parseFloat(v.slice(0, -1)) / 100;
      return i === 0 ? `(monitor_w*${factor})` : `(monitor_h*${factor})`;
    })
    .join(" ");
}

function parsePart(part: string): Item | Item[] {
  part = part.trim();
  if (!part) return { key: "", value: "", type: "flag", error: true };

  if (part.startsWith("$")) {
    return { key: part, value: "", type: "variable", error: false };
  }

  const colonIndex = part.indexOf(":");

  if (colonIndex !== -1) {
    const rawKey = part.slice(0, colonIndex).trim();
    const rawVal = part.slice(colonIndex + 1).trim();
    const mapping = replacementsKeys[rawKey] ?? rawKey;

    if (Array.isArray(mapping)) {
      const vals = rawVal.split(/\s+/);
      const out: Item[] = [];
      for (let i = 0; i < mapping.length; i++) {
        out.push({
          key: mapping[i],
          value: vals[i] ?? "0",
          type: "selector",
          error: false,
        });
      }
      return out;
    }

    return { key: mapping, value: rawVal, type: "selector", error: false };
  }

  const tokens = part.split(/\s+/);
  const rawKey = tokens[0];
  const key = replacementsValues[rawKey.toLowerCase()] ?? rawKey.toLowerCase();
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
  const lines = input.split("\n");
  const output: string[] = [...lines];
  const rules: { rule: Rule; lineIndex: number }[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const rule = parseLine(line);
    if (rule) rules.push({ rule, lineIndex: idx });
  });

  const mergedRules = mergeRules(rules.map((r) => r.rule));
  const usedSignatures = new Set<string>();
  let windowCounter = 1;
  let layerCounter = 1;

  rules.forEach(({ rule, lineIndex }) => {
    const sig = rule.items
      .filter((i) => i.type === "selector" || i.type === "variable")
      .map((i) => `${i.key}:${i.value}`)
      .sort()
      .join("|");

    if (usedSignatures.has(sig)) {
      output[lineIndex] = "";
      return;
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

      merged.items.forEach((item) => {
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
      });

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
        return "";
      });

      output[lineIndex] = `${merged.type} = ${itemsText.join(", ")}`;
    }
  });

  return output.join("\n");
}
