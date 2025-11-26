type Selector = { key: string; value: string };
type Flag = { key: string; value: string };
type Rule = { selectors: Selector[]; flags: Flag[] };

const keyMap: Record<string, string> = {
  initialClass: "initial_class",
  initialTitle: "initial_title",
  floating: "float",
  pinned: "pin",
  fullscreenstate: "fullscreen_state",
  xdgTag: "xdg_tag",
  noanim: "no_anim",
  noborder: "border_size",
  nofocus: "no_focus",
  maxsize: "max_size",
  suppressEvent: "suppress_event",
  ignorezero: "ignore_alpha",
};

function normalizeKey(key: string): string {
  return keyMap[key] ?? key.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase());
}

function convertPercent(v: string, index: number): string {
  if (!v.endsWith("%")) return v;
  const f = parseFloat(v.slice(0, -1)) / 100;
  return index === 0 ? `(monitor_w*${f})` : `(monitor_h*${f})`;
}

function parseSize(tokens: string[]): string {
  if (tokens.length === 1) return tokens[0];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    out.push(convertPercent(tokens[i], i));
  }
  return out.join(" ");
}

function parseLine(line: string): Rule | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const [lhs, rhs] = trimmed.split("=", 1).map((s) => s.trim());
  if (!lhs.startsWith("windowrule")) return null;

  const parts = rhs.split(",").map((p) => p.trim());
  const selectors: Selector[] = [];
  const flags: Flag[] = [];

  for (const part of parts) {
    if (part.includes(":")) {
      const [k, v] = part.split(":", 2).map((s) => s.trim());
      selectors.push({ key: normalizeKey(k), value: v });
    } else {
      const tokens = part.split(/\s+/);
      const key = normalizeKey(tokens[0]);
      const rawVals = tokens.slice(1);
      let value = rawVals.join(" ") || "on";
      if (key === "size") value = parseSize(rawVals);
      flags.push({ key, value });
    }
  }

  return { selectors, flags };
}

function mergeRules(rules: Rule[]): Rule[] {
  const map = new Map<string, Rule>();

  for (const r of rules) {
    const sig = r.selectors
      .map((s) => `${s.key}=${s.value}`)
      .sort()
      .join("|");

    if (!map.has(sig)) {
      map.set(sig, { selectors: [...r.selectors], flags: [] });
    }
    map.get(sig)!.flags.push(...r.flags);
  }

  return [...map.values()];
}

function formatNamed(rules: Rule[]): string {
  let n = 1;
  const blocks: string[] = [];

  for (const rule of rules) {
    const name = `windowrule-${n++}`;
    const lines = [`windowrule {`, `  name = ${name}`];

    for (const s of rule.selectors) lines.push(`  match:${s.key} = ${s.value}`);

    for (const f of rule.flags) lines.push(`  ${f.key} = ${f.value}`);

    lines.push("}");
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

function formatAnonymous(rules: Rule[]): string {
  return rules
    .map((rule) => {
      const items: string[] = [];

      for (const s of rule.selectors) items.push(`match:${s.key} ${s.value}`);

      for (const f of rule.flags) items.push(`${f.key} ${f.value}`);

      return `windowrule = ${items.join(", ")}`;
    })
    .join("\n");
}

export function parseRulesFromString(input: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of input.split("\n")) {
    const r = parseLine(line);
    if (r) rules.push(r);
  }
  return mergeRules(rules);
}

export function generateNamed(input: string): string {
  return formatNamed(parseRulesFromString(input));
}

export function generateAnonymous(input: string): string {
  return formatAnonymous(parseRulesFromString(input));
}
