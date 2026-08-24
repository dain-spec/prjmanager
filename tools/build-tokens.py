#!/usr/bin/env python3
"""wehago.token.json -> src/tokens.css

Figma Tokens 포맷(primitive / semantic / component)을 CSS 커스텀 프로퍼티로 변환한다.
토큰 값을 손으로 옮겨 적지 않기 위한 스크립트이므로, 디자인 시스템이 갱신되면
`python3 tools/build-tokens.py` 만 다시 실행하면 된다.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = json.loads((ROOT / "wehago.token.json").read_text(encoding="utf-8"))

LIGHT_SETS = ["primitive/Value", "semantic/Value", "component/Light"]
DARK_SETS = ["primitive/Value", "semantic/Value", "component/Dark"]
REF = re.compile(r"^\{([^}]+)\}$")


def flatten(sets):
    flat = {}

    def walk(node, path):
        if not isinstance(node, dict):
            return
        if "$value" in node:
            flat[path] = node["$value"]
            return
        for key, value in node.items():
            if key.startswith("$"):
                continue
            walk(value, f"{path}.{key}" if path else key)

    for name in sets:
        walk(SRC[name], "")
    return flat


def resolver(flat):
    def resolve(value, depth=0):
        if depth > 16 or not isinstance(value, str):
            return None
        match = REF.match(value.strip())
        if not match:
            return value
        target = flat.get(match.group(1))
        return resolve(target, depth + 1) if target is not None else None

    return resolve


def var_name(path):
    return "--" + path.replace(".", "-").replace("_", "-").lower()


# CSS 변수로 노출할 토큰 그룹. 나머지(typography 조합 토큰 등)는 별도 처리한다.
GROUPS = [
    ("Primitive · color", ("color.blue.", "color.gray.", "color.bluegray.",
                           "color.red.", "color.orange.", "color.green.",
                           "color.opacity.")),
    ("Semantic · color", ("color.primary.", "color.secondary.", "color.neutral.",
                          "color.negative.", "color.pending.", "color.positive.")),
    ("Semantic · alpha", ("alpha.",)),
    ("Semantic · layout", ("gap.", "padding.", "size.", "radius.")),
    ("Component · color", ("color.text.", "color.background.", "color.border.",
                           "color.surface.", "color.button.", "color.icon.",
                           "color.element.", "color.action.", "color.input.")),
]

SKIP_PREFIXES = ("color.deprecated.", "typo.", "lineHeights.", "fontWeights.",
                 "paragraphSpacing.", "paragraphIndent.", "letterSpacing.",
                 "textCase.", "textDecoration.", "Body.", "Heading.", "number.",
                 "fontSize.")


def emit(sets, indent="  "):
    flat = flatten(sets)
    resolve = resolver(flat)
    lines = []
    for label, prefixes in GROUPS:
        block = []
        for path in sorted(flat, key=sort_key):
            if not path.startswith(prefixes) or path.startswith(SKIP_PREFIXES):
                continue
            value = resolve(flat[path])
            if isinstance(value, str):
                block.append(f"{indent}{var_name(path)}: {value};")
        if block:
            lines.append(f"{indent}/* {label} */")
            lines.extend(block)
            lines.append("")
    return flat, resolve, lines


def sort_key(path):
    """숫자 스케일(50, 100, 150 …)이 문자열 정렬로 뒤섞이지 않게 한다."""
    parts = path.split(".")
    return tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in parts)


light_flat, light_resolve, light_lines = emit(LIGHT_SETS)
dark_flat, dark_resolve, _ = emit(DARK_SETS)

# 다크 모드는 라이트와 값이 다른 토큰만 덮어쓴다(primitive 는 모드 공통이라 제외된다).
dark_lines = ["  /* Component · color (dark override) */"]
for path in sorted(dark_flat, key=sort_key):
    if path.startswith(SKIP_PREFIXES):
        continue
    dark_value = dark_resolve(dark_flat[path])
    light_value = light_resolve(light_flat.get(path, ""))
    if isinstance(dark_value, str) and dark_value != light_value:
        dark_lines.append(f"  {var_name(path)}: {dark_value};")

# 타이포그래피: Heading1~7 / Body1~8 조합 토큰을 font-size / font-weight 쌍으로 노출
typo = []
for family, count in (("Heading", 7), ("Body", 8)):
    for index in range(1, count + 1):
        name = f"{family}{index}"
        node = SRC["primitive/Value"][family][name]["Regular"]["$value"]
        size = light_resolve(node["fontSize"])
        if size is None:
            ref = node["fontSize"].strip("{}")
            size = light_flat.get(ref)
        typo.append(f"  --font-{name.lower()}: {size}px;")

shadows = []
for level in (1, 2, 3):
    s = SRC["primitive/Value"][f"shadow-level{level}"]["$value"]
    shadows.append(
        f"  --shadow-level{level}: {s['x']}px {s['y']}px {s['blur']}px "
        f"{s['spread']}px {s['color']};"
    )

font_family = SRC["primitive/Value"]["typo"]["font"]["font"]["$value"]
tracking = SRC["primitive/Value"]["typo"]["letter-spacing"]["spacing"]["$value"]

css = f"""/* 이 파일은 자동 생성됩니다. 직접 수정하지 말고 `python3 tools/build-tokens.py` 를 실행하세요.
   원본: wehago.token.json (primitive/Value + semantic/Value + component/Light|Dark) */

:root {{
  /* Typo */
  --font-family: "{font_family}", "Noto Sans KR", "Apple SD Gothic Neo",
    "Malgun Gothic", sans-serif;
  --letter-spacing: {tracking};
  --line-height: 1.5;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;

{chr(10).join(typo)}

{chr(10).join(shadows)}

{chr(10).join(light_lines).rstrip()}
}}

/* component/Dark 세트 — 뷰어 테마에 따라 색상만 교체한다. */
:root:not([data-theme="light"]) {{
  color-scheme: light;
}}

@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    color-scheme: dark;
{chr(10).join("  " + line for line in dark_lines).rstrip()}
  }}
}}

:root[data-theme="dark"] {{
  color-scheme: dark;
{chr(10).join(dark_lines).rstrip()}
}}
"""

out = ROOT / "src" / "tokens.css"
out.write_text(css, encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)} ({len(css.splitlines())} lines)")

# ── 파비콘 ────────────────────────────────────────────────────────────────
# SVG 는 CSS 변수를 읽을 수 없어 색상을 직접 적어야 한다. 손으로 적으면 토큰과
# 어긋나므로 여기서 함께 생성한다. 표(현황판)를 뜻하는 3줄 그리드 마크.
primary = light_resolve(light_flat["color.element.primary"])
surface = light_resolve(light_flat["color.element.static"])

favicon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <title>WEHAGO 파일 현황</title>
  <rect width="32" height="32" rx="7" fill="{primary}" />
  <rect x="7" y="9" width="18" height="3.4" rx="1.7" fill="{surface}" />
  <rect x="7" y="14.3" width="18" height="3.4" rx="1.7" fill="{surface}" opacity=".78" />
  <rect x="7" y="19.6" width="18" height="3.4" rx="1.7" fill="{surface}" opacity=".62" />
</svg>
"""

icon = ROOT / "src" / "favicon.svg"
icon.write_text(favicon, encoding="utf-8")
print(f"wrote {icon.relative_to(ROOT)} (primary {primary}, mark {surface})")
