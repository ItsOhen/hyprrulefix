import sys
import shutil
from typing import List, Dict, Tuple
from dataclasses import dataclass

ItemType = str
RuleType = str

NAMED_OUTPUT = False


@dataclass
class Item:
    key: str
    value: str
    type: ItemType
    error: bool = False


@dataclass
class Rule:
    type: RuleType
    items: List[Item]


replacements_keys = {
    "initialClass": "initial_class",
    "initialTitle": "initial_title",
    "floating": "float",
    "pinned": "pin",
    "fullscreenstate": ("fullscreen_state_internal", "fullscreen_state_client"),
    "onworkspace": "workspace",
    "xdgTag": "xdg_tag",
    "noinitialfocus": "no_initial_focus",
}

replacements_values = {
    "bordersize": "border_size",
    "bordercolor": "border_color",
    "roundingpower": "rounding_power",
    "noborder": "border_size",
    "noanim": "no_anim",
    "noblur": "no_blur",
    "nodim": "no_dim",
    "noshadow": "no_shadow",
    "norounding": "no_rounding",
    "nofocus": "no_focus",
    "nofollowmouse": "no_follow_mouse",
    "allowsinput": "allows_input",
    "focusonactivate": "focus_on_activate",
    "fullscreenstate": "fullscreen_state",
    "maxsize": "max_size",
    "minsize": "min_size",
    "nomaxsize": "no_max_size",
    "keepaspectratio": "keep_aspect_ratio",
    "idleinhibit": "idle_inhibit",
    "persistentsize": "persistent_size",
    "stayfocused": "stay_focused",
    "dimaround": "dim_around",
    "noclosefor": "no_close_for",
    "suppressevent": "suppress_event",
    "forcergbx": "force_rgbx",
    "syncfullscreen": "sync_fullscreen",
    "renderunfocused": "render_unfocused",
    "scrollmouse": "scroll_mouse",
    "scrolltouchpad": "scroll_touchpad",
    "noshortcutsinhibit": "no_shortcuts_inhibit",
    "noscreenshare": "no_screen_share",
    "novrr": "no_vrr",
    "ignorealpha": "ignore_alpha",
    "ignorezero": "ignore_alpha",
    "blurpopups": "blur_popups",
    "abovelock": "above_lock",
}

defaults = {
    "border_size": "0",
    "float": "on",
    "xwayland": "0",
    "fullscreen": "on",
    "pin": "on",
    "focus": "0",
    "group": "0",
    "modal": "0",
    "no_anim": "on",
    "ignore_alpha": "0",
    "fullscreen_state_internal": "0",
    "fullscreen_state_client": "0",
}


def parse_size(tokens: List[str]) -> Tuple[str, str]:
    mode = "size"
    values = []

    for i, tok in enumerate(tokens):
        if tok.startswith(">"):
            mode = "min_size"
            tok = tok[1:]
        elif tok.startswith("<"):
            mode = "max_size"
            tok = tok[1:]

        if tok.endswith("%"):
            factor = float(tok[:-1]) / 100
            values.append(
                f"(monitor_w*{factor})" if i == 0 else f"(monitor_h*{factor})"
            )
        else:
            values.append(tok)

    return mode, " ".join(values)


def parse_move(tokens: List[str]) -> str:
    cursor = False
    onscreen = False
    args: List[str] = []

    for t in tokens:
        if t == "cursor":
            cursor = True
            continue
        if t == "onscreen":
            onscreen = True
            continue
        args.append(t)

    values: List[str] = []

    for index, raw in enumerate(args):
        is_x = index == 0
        monitor = "monitor_w" if is_x else "monitor_h"
        client = "client_w" if is_x else "client_h"
        cursor_base = "cursor_x" if is_x else "cursor_y"

        parts = raw.strip().split("-")
        transformed: List[str] = []

        for part in parts:
            part = part.strip()

            if part == "w":
                transformed.append(client)
                continue

            if part.endswith("%"):
                factor = float(part[:-1]) / 100
                transformed.append(f"{monitor}*{factor}")
                continue

            transformed.append(part)

        expr = "-".join(transformed)

        if onscreen:
            sep = "," if NAMED_OUTPUT else r"\,"
            expr = f"min(max({expr}{sep}0){sep}{monitor}-{client})"

        if cursor:
            expr = f"{cursor_base}+({expr})"

        values.append(f"({expr})")

    return " ".join(values)


def parse_part(part: str) -> List[Item]:
    part = part.strip()
    if not part:
        return []

    if part.startswith("$"):
        return [Item(part, "", "variable")]

    if ":" in part:
        k, v = part.split(":", 1)
        k = k.strip()
        v = v.strip()
        mapping = replacements_keys.get(k, k)

        if isinstance(mapping, tuple):
            vals = v.split()
            return [
                Item(mapping[0], vals[0] if len(vals) > 0 else "0", "selector"),
                Item(mapping[1], vals[1] if len(vals) > 1 else "0", "selector"),
            ]

        return [Item(mapping, v, "selector")]

    tokens = part.split()
    raw_key = tokens[0].lower()
    key = replacements_values.get(raw_key, raw_key)

    if key == "size":
        mode, val = parse_size(tokens[1:])
        return [Item(mode, val, "flag")]

    if key == "move":
        return [Item(key, parse_move(tokens[1:]), "flag")]

    value = " ".join(tokens[1:]) or defaults.get(key, "on")
    return [Item(key, value, "flag")]


def parse_line(line: str) -> Rule | None:
    if "=" not in line:
        return None

    lhs, rhs = map(str.strip, line.split("=", 1))

    if lhs.startswith("windowrule"):
        rtype = "windowrule"
    elif lhs.startswith("layerrule"):
        rtype = "layerrule"
    else:
        return None

    parts = [p.strip() for p in rhs.split(",") if p.strip()]
    items: List[Item] = []

    if rtype == "layerrule":
        first = parts[0].split()
        key = replacements_values.get(first[0].lower(), first[0].lower())
        val = " ".join(first[1:]) or defaults.get(key, "on")
        items.append(Item(key, val, "flag"))

        for ns in parts[1:]:
            items.append(Item(ns, "on", "selector"))
    else:
        for p in parts:
            items.extend(parse_part(p))

    return Rule(rtype, items)


def rule_signature(rule: Rule) -> str:
    return "|".join(
        sorted(f"{i.key}:{i.value}" for i in rule.items if i.type != "flag")
    )


def merge_rules(rules: List[Rule]) -> List[Rule]:
    merged: Dict[str, Rule] = {}

    for r in rules:
        sig = rule_signature(r)
        if sig not in merged:
            merged[sig] = Rule(r.type, [])

        target = merged[sig]
        for item in r.items:
            if item.type != "flag":
                if not any(
                    i.key == item.key and i.value == item.value for i in target.items
                ):
                    target.items.append(item)
            else:
                for i in target.items:
                    if i.type == "flag" and i.key == item.key:
                        i.value = item.value
                        break
                else:
                    target.items.append(item)

    return list(merged.values())


def generate_rules(text: str) -> str:
    lines = text.splitlines()
    parsed = [(i, parse_line(l)) for i, l in enumerate(lines) if parse_line(l)]
    merged = merge_rules([r for _, r in parsed])

    used = set()
    out = list(lines)
    wc = lc = 1

    order = {"flag": 0, "selector": 1, "variable": 2}

    for idx, rule in parsed:
        sig = rule_signature(rule)
        if sig in used:
            out[idx] = ""
            continue
        used.add(sig)

        r = next(m for m in merged if rule_signature(m) == sig)
        r.items.sort(key=lambda i: order[i.type])

        if NAMED_OUTPUT:
            name = f"{r.type}-{wc if r.type == 'windowrule' else lc}"
            if r.type == "windowrule":
                wc += 1
            else:
                lc += 1

            block = [f"{r.type} {{", f"  name = {name}"]
            for i in r.items:
                if i.type == "variable":
                    block.append(f"  match:{i.key}")
                elif i.type == "selector":
                    if r.type == "layerrule":
                        block.append(f"  match:namespace = {i.key}")
                    else:
                        block.append(f"  match:{i.key} = {i.value}")
                else:
                    block.append(f"  {i.key} = {i.value}")
            block.append("}")
            out[idx] = "\n".join(block)
        else:
            parts = []
            for i in r.items:
                if i.type == "variable":
                    parts.append(i.key)
                elif i.type == "selector":
                    parts.append(
                        f"match:namespace {i.key}"
                        if r.type == "layerrule"
                        else f"match:{i.key} {i.value}"
                    )
                else:
                    parts.append(f"{i.key} {i.value}")
            out[idx] = f"{r.type} = {', '.join(parts)}"

    return "\n".join(l for l in out if l.strip())


def rewrite_file(filename: str):
    backup = filename + ".bak"
    shutil.copy2(filename, backup)

    with open(filename, "r") as f:
        content = f.read()

    new_content = generate_rules(content)

    with open(filename, "w") as f:
        f.write(new_content)

    print(f"Rewritten '{filename}', backup saved as '{backup}'")


def restore_file(filename: str):
    backup = filename + ".bak"
    try:
        shutil.copy2(backup, filename)
        print(f"Restored '{filename}' from '{backup}'")
    except FileNotFoundError:
        print(f"No backup found at '{backup}'")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: script.py <file> [--anon] [--restore]")
        sys.exit(1)

    filename = sys.argv[1]

    if "--named" in sys.argv:
        NAMED_OUTPUT = True

    if "--restore" in sys.argv:
        restore_file(filename)
    else:
        rewrite_file(filename)
