import sys
import shutil
from collections import defaultdict


replacements_keys = {
    "initialClass": "initial_class",
    "initialTitle": "initial_title",
    "floating": "float",
    "pinned": "pin",
    "fullscreenstate": ("fullscreen_state_internal", "fullscreen_state_client"),
    "onworkspace": "workspace",
    "xdgTag": "xdg_tag",
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


def parse_size(value: str) -> str:
    if not value:
        return value

    parts = value.split()
    result = []

    for i, p in enumerate(parts):
        p = p.strip()
        if p.endswith("%"):
            factor = float(p.rstrip("%")) / 100
            expr = f"(monitor_w*{factor})" if i == 0 else f"(monitor_h*{factor})"
            result.append(expr)
        else:
            result.append(p)

    return " ".join(result)


def parse_rules(filename):
    rules = {"windowrules": defaultdict(dict), "layerrules": defaultdict(dict)}

    with open(filename) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            cmd, rhs = line.split("=", 1)
            parts = [p.strip() for p in rhs.split(",")]

            if cmd.startswith(("windowrule", "windowrulev2")):
                selectors = []
                flags = {}

                for part in parts:
                    if ":" in part:
                        k, v = part.split(":", 1)
                        k = replacements_keys.get(k.strip(), k.strip())
                        if isinstance(k, tuple):
                            vals = (v.strip() if v else "0 0").split()
                            selectors.append((k[0], vals[0]))
                            selectors.append((k[1], vals[1] if len(vals) > 1 else "0"))
                        else:
                            selectors.append((k, v.strip() if v else None))
                    else:
                        k, *v = part.split(None, 1)
                        fk = replacements_values.get(k.strip(), k.strip())
                        val = v[0] if v else defaults.get(fk)
                        if fk == "size" and val:
                            val = parse_size(val)
                        flags[fk] = val

                key = tuple(sorted(selectors))
                rules["windowrules"][key].update(flags)

            elif cmd.startswith("layerrule"):
                k, *v = parts[0].split(None, 1)
                fk = replacements_values.get(k.strip(), k.strip())
                val = v[0] if v else defaults.get(fk)
                namespace = parts[1]

                rules["layerrules"][namespace][fk] = val

    windowrules_list = [
        [(k, v, True) for k, v in selectors]
        + [(fk, val, False) for fk, val in flags.items()]
        for selectors, flags in rules["windowrules"].items()
    ]

    layerrules_list = [
        [(fk, val, False) for fk, val in flags.items()] + [("namespace", ns, True)]
        for ns, flags in rules["layerrules"].items()
    ]
    return {"windowrules": windowrules_list, "layerrules": layerrules_list}


def generate_anonymous(rules_dict, rule_type):
    lines = []
    for rule_list in rules_dict[rule_type + "s"]:
        parts = []
        for key, val, is_sel in rule_list:
            if is_sel:
                if val is not None:
                    parts.append(f"match:{key} {val}")
                else:
                    parts.append(f"match:{key}")
            else:
                parts.append(f"{key} {val}" if val is not None else key)
        lines.append(f"{rule_type} = " + ", ".join(parts))
    return "\n".join(lines)


def generate_named(rules_dict, rule_type):
    blocks = []
    counter = 1
    for rule_list in rules_dict[rule_type + "s"]:
        name = f"{rule_type}-{counter}"
        counter += 1
        block = [f"{rule_type} {{", f"  name = {name}"]
        for key, val, is_sel in rule_list:
            if is_sel:
                if val is not None:
                    block.append(f"  match:{key} = {val}")
                else:
                    block.append(f"  match:{key}")
            else:
                block.append(f"  {key} = {val}" if val is not None else f"  {key} = 1")
        block.append("}")
        blocks.append("\n".join(block))
    return "\n\n".join(blocks)


def rewrite_file(filename, rules, use_named=False):
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
    window_text = (generate_named if use_named else generate_anonymous)(
        rules, "windowrule"
    )
    cleaned.append(window_text)

    cleaned.append("\n\n# --- Auto-generated layer rules ---\n")
    layer_text = (generate_named if use_named else generate_anonymous)(
        rules, "layerrule"
    )
    cleaned.append(layer_text)

    cleaned.append("\n")

    with open(filename, "w") as f:
        f.writelines(cleaned)

    print(f"File '{filename}' rewritten with merged rules. Backup saved as '{backup}'.")


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

    rules = parse_rules(filename)
    rewrite_file(filename, rules, use_named)

