from collections import defaultdict
import sys
import shutil


def generate_anonymous_rules(rules):
    lines = []

    for selectors, flags in rules.items():
        parts = []

        for sel in selectors:
            key, val = sel.split(":", 1)
            parts.append(f"match:{key} {val}")

        for flg in sorted(flags):
            parts.append(f"{flg} 1" if flg.isalpha() else flg)

        line = "windowrule = " + ", ".join(parts)
        lines.append(line)

    return "\n".join(lines)


def generate_named_rules(rules):
    blocks = []
    counter = 1

    for selectors, flags in rules.items():
        name = f"rule-{counter}"
        counter += 1

        block = ["windowrule {", f"  name = {name}"]

        for sel in selectors:
            key, val = sel.split(":", 1)
            block.append(f"  match:{key} = {val}")

        for flg in sorted(flags):
            block.append(f"  {flg} = 1")

        block.append("}")
        blocks.append("\n".join(block))

    return "\n\n".join(blocks)


def parse_rules(filename):
    result = defaultdict(set)

    with open(filename, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            if not line.startswith(("windowrule", "windowrulev2")):
                continue

            rule_str = line.split("=", 1)[1].strip()
            parts = [p.strip() for p in rule_str.split(",")]

            flags = []
            selectors = []

            for part in parts:
                if ":" in part:
                    key, value = part.split(":", 1)
                    selectors.append(f"{key.strip()}:{value.strip()}")
                else:
                    flags.append(part)

            selector_key = tuple(sorted(selectors))
            result[selector_key].update(flags)

    return result


def backup_and_save(filename, new_rules_text):
    backup = filename + ".bak"
    shutil.copy2(filename, backup)

    with open(filename, "r") as f:
        lines = f.readlines()

    cleaned = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("windowrule") or stripped.startswith("windowrulev2"):
            continue
        cleaned.append(line)

    cleaned.append("\n")
    cleaned.append("# --- Auto-generated rules ---\n")
    cleaned.append(new_rules_text)
    cleaned.append("\n")

    with open(filename, "w") as f:
        f.writelines(cleaned)


if __name__ == "__main__":
    filename = sys.argv[1]
    rules = parse_rules(filename)
    for target, flags in rules.items():
        print(target, "=>", flags)

    # print(generate_anonymous_rules(rules))
    updated_rules = generate_anonymous_rules(rules)
    backup_and_save(filename, updated_rules)
    # print("\n\n")
    # print(generate_named_rules(rules))
