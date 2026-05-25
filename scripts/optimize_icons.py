import hashlib
import os
import re
import subprocess
import sys
import tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_DIR = os.path.join(BASE_DIR, "src", "assets", "fonts")
INPUT_FONT = os.path.join(
    BASE_DIR, "scripts", "MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf"
)
OUTPUT_FONT = os.path.join(FONTS_DIR, "material-symbols-optimized.woff2")
OUTLINE_OUTPUT_FONT = os.path.join(
    FONTS_DIR, "material-symbols-rounded-outline.woff2"
)
ICONS_LIST = os.path.join(FONTS_DIR, "icons_list.txt")
OUTLINE_ICONS_LIST = os.path.join(FONTS_DIR, "icons_outline_list.txt")
INDEX_HTML = os.path.join(BASE_DIR, "src", "index.html")


def _stamp_index_html_cache_buster(
    font_path: str, index_path: str, asset_name: str
) -> None:
    """Update the ?v=<hash> query on the symbol-font URL in index.html so
    browsers refetch the font whenever its bytes change. The font is
    referenced from an inline <style> tag that Angular's asset hashing
    doesn't rewrite, so we maintain the cache-buster ourselves.
    """
    if not os.path.exists(index_path):
        print(f"Warning: index.html not found at {index_path}; skipping cache-buster")
        return

    with open(font_path, "rb") as fh:
        font_hash = hashlib.sha256(fh.read()).hexdigest()[:10]

    with open(index_path, "r", encoding="utf-8") as fh:
        html = fh.read()

    pattern = re.compile(rf"{re.escape(asset_name)}(\?v=[A-Za-z0-9]+)?")
    new_url = f"{asset_name}?v={font_hash}"
    new_html, n = pattern.subn(new_url, html)
    if n == 0:
        print(f"Warning: no {asset_name} reference found in index.html")
        return

    if new_html == html:
        print(f"Symbol font cache-buster unchanged (v={font_hash}).")
        return

    with open(index_path, "w", encoding="utf-8") as fh:
        fh.write(new_html)
    print(f"Stamped symbol font cache-buster v={font_hash} in {os.path.relpath(index_path, BASE_DIR)}")


def _read_icons(path: str, default_icons: set[str]) -> set[str]:
    if not os.path.exists(path):
        print(f"Error: Icons list not found at {path}")
        sys.exit(1)

    with open(path, "r") as f:
        requested_icons = {
            line.strip()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        }

    if not requested_icons:
        print(f"Warning: {os.path.basename(path)} is empty. Creating minimal subset.")
        return default_icons

    return requested_icons


def _make_static_instance(source_path: str, fill: int) -> str:
    font = TTFont(source_path)
    if "fvar" not in font:
        return source_path

    instance = instantiateVariableFont(
        font,
        {"FILL": fill, "GRAD": 0, "opsz": 24, "wght": 400},
        inplace=False,
    )
    tmp = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False)
    tmp.close()
    instance.save(tmp.name)
    return tmp.name


def _build_subset(
    *,
    source_path: str,
    output_path: str,
    requested_icons: set[str],
    aliases: dict[str, str],
    fill: int,
    label: str,
) -> None:
    static_source = _make_static_instance(source_path, fill)

    print(f"Inspecting {label} font to validate {len(requested_icons)} icons...")
    try:
        tt = TTFont(static_source)
        all_glyphs = set(tt.getGlyphOrder())
    except Exception as e:
        print(f"Error reading source font: {e}")
        sys.exit(1)

    glyph_names_to_keep = set(requested_icons)
    for icon in requested_icons:
        if icon in aliases:
            glyph_names_to_keep.add(aliases[icon])

    valid_icons = []
    missing_icons = []
    icon_unicodes = []
    name_to_unicode = {}

    cmap = tt.getBestCmap()
    glyph_to_unicode = {v: k for k, v in cmap.items()}

    for icon in glyph_names_to_keep:
        if icon in all_glyphs:
            valid_icons.append(icon)
            if icon in glyph_to_unicode:
                code = glyph_to_unicode[icon]
                icon_unicodes.append(hex(code))
                name_to_unicode[icon] = code
            else:
                print(f"Info: Icon '{icon}' has no direct unicode mapping.")
        else:
            missing_icons.append(icon)

    missing_requested_icons = sorted(icon for icon in requested_icons if icon not in all_glyphs)
    if missing_requested_icons:
        print(
            f"Warning: The following {len(missing_requested_icons)} {label} icons were not found in the font file and will be skipped or aliased:"
        )
        print(
            ", ".join(missing_requested_icons[:10])
            + ("..." if len(missing_requested_icons) > 10 else "")
        )

    if not valid_icons:
        print(f"Error: No valid {label} icons found to subset.")
        sys.exit(1)

    icon_text = " ".join(sorted(requested_icons | set(valid_icons)))
    unicode_list = ",".join(icon_unicodes)

    print(
        f"Optimizing {label} font with {len(valid_icons)} icons ({len(icon_unicodes)} have unicodes)..."
    )

    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        static_source,
        f"--output-file={output_path}",
        "--flavor=woff2",
        f"--text={icon_text}",
        f"--unicodes={unicode_list}",
        "--layout-features=",
        "--no-hinting",
    ]

    try:
        subprocess.check_call(cmd)
        print(f"Successfully subsetted to {output_path}")

    except subprocess.CalledProcessError as e:
        print(f"Error running fontTools.subset: {e}")
        sys.exit(1)

    try:
        from fontTools.feaLib.builder import addOpenTypeFeatures
        from io import StringIO

        font = TTFont(output_path)
        subset_cmap = font.getBestCmap()
        char_map = {chr(k): v for k, v in subset_cmap.items()}

        feature_lines = [
            "languagesystem DFLT dflt;",
            "languagesystem latn dflt;",
            "feature liga {",
        ]

        success_count = 0
        for icon in sorted(requested_icons):
            target_icon = icon if icon in name_to_unicode else aliases.get(icon)
            if not target_icon or target_icon not in name_to_unicode:
                continue

            code = name_to_unicode[target_icon]
            target_glyph_name = subset_cmap.get(code)
            if not target_glyph_name:
                continue

            char_glyphs = []
            for char in icon:
                if char not in char_map:
                    break
                char_glyphs.append(char_map[char])
            else:
                feature_lines.append(
                    f"    sub {' '.join(char_glyphs)} by {target_glyph_name};"
                )
                success_count += 1

        feature_lines.append("} liga;")
        feature_text = "\n".join(feature_lines)

        print(f"Rebuilding {label} 'liga' feature with {success_count} rules...")
        addOpenTypeFeatures(font, StringIO(feature_text))

        font.save(output_path)

        size = os.path.getsize(output_path)
        print(f"Final {label} optimized font size: {size / 1024:.2f} KB")

    except Exception as e:
        print(f"Error post-processing {label} ligatures: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        if static_source != source_path:
            os.unlink(static_source)


def main():
    if not os.path.exists(INPUT_FONT):
        print(f"Error: Input font not found at {INPUT_FONT}")
        sys.exit(1)

    aliases = {
        "location_on": "place",
        "terrain": "landscape",
        "email": "mail",
        "person_outline": "person",
        "bookmark_border": "bookmark",
        "outlined_flag": "flag",
        "help_outline": "help",
        "star_border": "star",
        "create": "edit",
        "mobile_border": "mobile",
        "phone_iphone": "mobile",
        "block_border": "block"
    }

    _build_subset(
        source_path=INPUT_FONT,
        output_path=OUTPUT_FONT,
        requested_icons=_read_icons(ICONS_LIST, {"home"}),
        aliases=aliases,
        fill=1,
        label="filled",
    )
    _build_subset(
        source_path=INPUT_FONT,
        output_path=OUTLINE_OUTPUT_FONT,
        requested_icons=_read_icons(OUTLINE_ICONS_LIST, {"star", "star_border"}),
        aliases=aliases,
        fill=0,
        label="outlined",
    )

    _stamp_index_html_cache_buster(
        OUTPUT_FONT, INDEX_HTML, "material-symbols-optimized.woff2"
    )
    _stamp_index_html_cache_buster(
        OUTLINE_OUTPUT_FONT, INDEX_HTML, "material-symbols-rounded-outline.woff2"
    )


if __name__ == "__main__":
    main()
