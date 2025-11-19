import sys
import shutil
from collections import defaultdict

replacements_keys = {
    "floating": "float",
    "onworkspace": "workspace",
    "pinned": "pin",
    "initialClass": "initial_class",
    "initialTitle": "initial_title",
}

replacements_values = {
    "bordersize": "border_size",
    "idleinhibit": "idle_inhibit",
    "noanim": "no_anim",
    "noborder": "border_size",
    "suppressevent": "suppress_event",
    "nofocus": "no_focus",
    "maxsize": "max_size",
    "noinitialfocus": "no_initial_focus",
    "noblur": "no_blur",
    "ignorealpha": "ignore_alpha",
    "ignorezero": "ignore_alpha",
}

defaults = {
    "border_size": "0",
    "float": "on",
    "xwayland": "0",
    "fullscreen": "0",
    "pin": "0",
    "focus": "0",
    "group": "0",
    "modal": "0",
    "center": "on",
    "blur": "on",
    "no_blur": "on",
    "no_focus": "on",
    "no_initial_focus": "on",
    "no_anim": "on",
    "no_border": "on",
    "fullscreen_state_internal": "0",
    "fullscreen_state_client": "0",
    "ignore_alpha": "0",
    "ignore_zero": "on",
}


def process_flag(flag):
    parts = flag.strip().split(None, 1)
    key = parts[0] or ""
    value = parts[1] if len(parts) > 1 else None
    key = replacements_values.get(key, key)
    if value is None:
        value = defaults.get(key)
    return f"{key} {value}" if value is not None else key


def process_selector(key, value):
    key = key.strip()
    value = value.strip()
    key = replacements_keys.get(key, key)
    return f"{key}:{value}"


def parse_rules(filename):
    window_rules = defaultdict(set)
    layer_rules = defaultdict(set)

    with open(filename, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            if line.startswith(("windowrule", "windowrulev2")):
                rule_str = line.split("=", 1)[1].strip()
                parts = [p.strip() for p in rule_str.split(",")]
                flags = []
                selectors = []

                for part in parts:
                    if ":" in part:
                        key, value = part.split(":", 1)
                        selectors.append(process_selector(key, value))
                    else:
                        flags.append(process_flag(part))

                selector_key = tuple(sorted(selectors))
                window_rules[selector_key].update(flags)

            elif line.startswith("layerrule"):
                rule_str = line.split("=", 1)[1].strip() if "=" in line else ""
                parts = [p.strip() for p in rule_str.split(",")]
                flags = []
                selectors = []
                for part_index, part in enumerate(parts):
                    part = part.strip()
                    if part_index == 0:
                        flags.append(process_flag(part))
                    else:
                        selectors.append(part)

                selector_key = tuple(sorted(selectors))
                layer_rules[selector_key].update(flags)

    return window_rules, layer_rules


def generate_anonymous_rules(rules, rule_type="windowrule"):
    lines = []
    for selectors_tuple, flags in rules.items():
        parts = []

        for sel in selectors_tuple:
            if rule_type == "windowrule" and ":" in sel:
                key, val = sel.split(":", 1)
                parts.append(f"match:{key} {val}")
            elif rule_type == "layerrule":
                parts.append(f"match:namespace {sel}")
            else:
                parts.append(sel)

        for flg in sorted(flags):
            parts.append(flg)

        lines.append(f"{rule_type} = " + ", ".join(parts))
    return "\n".join(lines)


def generate_named_rules(rules, rule_type="windowrule"):
    blocks = []
    counter = 1
    for selectors_tuple, flags in rules.items():
        name = f"{rule_type}-{counter}"
        counter += 1
        block = [f"{rule_type} {{", f"  name = {name}"]

        for sel in selectors_tuple:
            if rule_type == "windowrule" and ":" in sel:
                key, val = sel.split(":", 1)
                block.append(f"  match:{key} = {val}")
            elif rule_type == "layerrule":
                block.append(f"  match:namespace = {sel}")
            else:
                block.append(sel)

        for flg in sorted(flags):
            if " " in flg:
                block.append(f"  {flg.replace(' ', ' = ')}")
            else:
                block.append(f"  {flg} = 1")

        block.append("}")
        blocks.append("\n".join(block))
    return "\n\n".join(blocks)


def rewrite_file(filename, window_rules, layer_rules, use_named=False):
    backup = filename + ".bak"
    shutil.copy2(filename, backup)
    with open(filename, "r") as f:
        lines = f.readlines()
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(
            ("windowrule", "windowrulev2", "layerrule")
        ) or stripped.startswith("# --- Auto-generated"):
            continue
        cleaned.append(line)
    cleaned.append("\n# --- Auto-generated window rules ---\n")
    new_window_text = (generate_named_rules if use_named else generate_anonymous_rules)(
        window_rules, "windowrule"
    )
    cleaned.append(new_window_text)
    cleaned.append("\n\n# --- Auto-generated layer rules ---\n")
    new_layer_text = (generate_named_rules if use_named else generate_anonymous_rules)(
        layer_rules, "layerrule"
    )
    cleaned.append(new_layer_text)
    cleaned.append("\n")
    with open(filename, "w") as f:
        f.writelines(cleaned)


if __name__ == "__main__":
    filename = sys.argv[1]
    use_named = "--named" in sys.argv
    restore = "--restore" in sys.argv
    if restore:
        backup = filename + ".bak"
        try:
            shutil.copy2(backup, filename)
            print(f"File '{filename}' restored from backup '{backup}'.")
        except FileNotFoundError:
            print(f"No backup found at '{backup}' to restore.")
        sys.exit(0)
    window_rules, layer_rules = parse_rules(filename)
    rewrite_file(filename, window_rules, layer_rules, use_named)
    print(
        f"\nFile '{filename}' rewritten with merged rules. Backup saved as '{filename}.bak'."
    )
