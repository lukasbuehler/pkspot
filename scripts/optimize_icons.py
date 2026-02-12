import os
import subprocess
import sys
from fontTools.ttLib import TTFont

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_DIR = os.path.join(BASE_DIR, "src", "assets", "fonts")
INPUT_FONT = os.path.join(
    BASE_DIR, "scripts", "MaterialSymbolsRounded[FILL,GRAD,opsz,wght].woff2"
)
OUTPUT_FONT = os.path.join(FONTS_DIR, "material-symbols-optimized.woff2")
ICONS_LIST = os.path.join(FONTS_DIR, "icons_list.txt")


def main():
    if not os.path.exists(INPUT_FONT):
        print(f"Error: Input font not found at {INPUT_FONT}")
        sys.exit(1)

    if not os.path.exists(ICONS_LIST):
        print(f"Error: Icons list not found at {ICONS_LIST}")
        sys.exit(1)

    # 1. Read the list of requested icons
    with open(ICONS_LIST, "r") as f:
        # Filter lines that start with # or are empty
        requested_icons = {
            line.strip()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        }

    if not requested_icons:
        print("Warning: icons_list.txt is empty. Creating minimal subset.")
        requested_icons = {"home"}

    # 2. Inspect source font to find valid glyph names
    print(f"Inspecting source font to validate {len(requested_icons)} icons...")
    try:
        tt = TTFont(INPUT_FONT)
        all_glyphs = set(tt.getGlyphOrder())
    except Exception as e:
        print(f"Error reading source font: {e}")
        sys.exit(1)

    # 3. Filter valid icons and find their unicodes
    valid_icons = []
    missing_icons = []
    icon_unicodes = []
    name_to_unicode = {}  # map icon name -> int unicode

    # helper: reverse cmap lookup
    cmap = tt.getBestCmap()
    glyph_to_unicode = {v: k for k, v in cmap.items()}

    for icon in requested_icons:
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

    if missing_icons:
        print(
            f"Warning: The following {len(missing_icons)} icons were not found in the font file and will be skipped:"
        )
        print(
            ", ".join(missing_icons[:10]) + ("..." if len(missing_icons) > 10 else "")
        )

    if not valid_icons:
        print("Error: No valid icons found to subset.")
        sys.exit(1)

    # 4. Prepare subset arguments
    # We need:
    # - The icon glyphs themselves (so the destination of the ligature exists)
    # - The text characters (so the source of the ligature exists)
    # - Ligature features (rlig, rclt, liga)

    icon_text = " ".join(valid_icons)
    unicode_list = ",".join(icon_unicodes)

    print(
        f"Optimizing font with {len(valid_icons)} icons ({len(icon_unicodes)} have unicodes)..."
    )

    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        INPUT_FONT,
        f"--output-file={OUTPUT_FONT}",
        "--flavor=woff2",
        f"--text={icon_text}",  # Include chars for "menu", "home"
        f"--unicodes={unicode_list}",  # Include icon unicodes
        "--layout-features=",  # Drop all GSUB features to test size
        "--no-hinting",
    ]

    try:
        subprocess.check_call(cmd)
        print(f"Successfully subsetted to {OUTPUT_FONT}")

    except subprocess.CalledProcessError as e:
        print(f"Error running fontTools.subset: {e}")
        sys.exit(1)

    # Define manual aliases for missing icons
    # name_in_list -> name_in_font
    ALIASES = {
        "location_on": "place",
        "terrain": "landscape",
        "email": "mail",
        "person_outline": "person",  # relies on fill=0
        "bookmark_border": "bookmark",  # relies on fill=0
        "outlined_flag": "flag",  # relies on fill=0
        "help_outline": "help",  # relies on fill=0
        "star_border": "star",  # relies on fill=0
        "create": "edit",
    }

    # 5. Post-processing: Rebuild 'liga' feature for names
    # Inspect the subsetted font
    try:
        from fontTools.feaLib.builder import addOpenTypeFeatures
        from io import StringIO

        font = TTFont(OUTPUT_FONT)
        subset_cmap = font.getBestCmap()  # {unicode: glyphName}

        # Build reverse map for characters
        char_map = {chr(k): v for k, v in subset_cmap.items()}

        # Generate feature file content
        feature_lines = []
        feature_lines.append("languagesystem DFLT dflt;")
        feature_lines.append("languagesystem latn dflt;")
        feature_lines.append("feature liga {")

        success_count = 0
        for icon in requested_icons:  # Use requested_icons to include aliases
            # Determine target glyph name
            target_glyph_name = None

            if icon in name_to_unicode:
                code = name_to_unicode[icon]
                if code in subset_cmap:
                    target_glyph_name = subset_cmap[code]

            # Check aliases if not found directly
            if not target_glyph_name and icon in ALIASES:
                alias_target = ALIASES[icon]
                # Find glyph for alias target
                if alias_target in name_to_unicode:
                    code = name_to_unicode[alias_target]
                    if code in subset_cmap:
                        target_glyph_name = subset_cmap[code]
                        print(
                            f"Mapping alias: {icon} -> {alias_target} -> {target_glyph_name}"
                        )

            if not target_glyph_name:
                # Still missing
                continue

            # Check if we have glyphs for all chars
            can_make_ligature = True
            char_glyphs = []
            for char in icon:
                if char in char_map:
                    char_glyphs.append(char_map[char])
                else:
                    can_make_ligature = False
                    break

            if can_make_ligature:
                feature_lines.append(
                    f"    sub {' '.join(char_glyphs)} by {target_glyph_name};"
                )
                success_count += 1
            else:
                print(
                    f"Warning: Cannot build ligature for {icon} (missing character glyphs)"
                )

        feature_lines.append("} liga;")

        feature_text = "\n".join(feature_lines)

        # Compile features
        print(f"Rebuilding 'liga' feature with {success_count} rules...")
        addOpenTypeFeatures(font, StringIO(feature_text))

        # Save
        font.save(OUTPUT_FONT)

        # Final size
        size = os.path.getsize(OUTPUT_FONT)
        print(f"Final optimized font size: {size / 1024:.2f} KB")

    except Exception as e:
        print(f"Error post-processing ligatures: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
