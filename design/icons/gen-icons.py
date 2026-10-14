# Regenerates src/components/icons/icon-data.ts from the Design Lounge skill (Lounge Icons) and
# lucide-static SVGs. Usage: python3 design/icons/gen-icons.py <skill dir> <lucide svg dir> <out>
import json, re, sys, os
skill, lucide_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(os.path.join(skill, "library/icons.json")))
lounge = {i["id"]: i for i in d["icons"]}
WANT = ["sun","moon","camera","calendar","sliders","settings","check","x","spark","share","download","upload",
        "edit","trash","lock","archive","filter","search","plus","minus","chevron-left","chevron-right","chevron-down",
        "arrow-left","arrow-right","info","alert","error","success","loader","image","layers","crop","clock","heart",
        "star","tag","eye","eye-off","wifi","more-h","home","external","copy","book","globe","bag","folder","file","map-pin","compass","chevron-up","arrow-up","list","clock","user","link","sliders"]
def inner(svg):
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    m = re.search(r"<svg[^>]*>(.*)</svg>", svg, flags=re.S)
    body = re.sub(r"\s+", " ", m.group(1)).strip()
    return body.replace(" />", "/>")
entries = []
for k in dict.fromkeys(WANT):
    entries.append((k, inner(lounge[k]["svg"]), "lounge"))
for k in ["thumbs-up","thumbs-down","cloud-rain","wind","thermometer","undo-2"]:
    name = {"undo-2": "undo", "cloud-rain": "rain"}.get(k, k)
    entries.append((name, inner(open(os.path.join(lucide_dir, k + ".svg")).read()), "lucide " + k))
# Drawn on the Lounge grid (24px, stroke 1.75, round caps): a coat hanger.
entries.append(("hanger", '<path d="M10 6a2 2 0 1 1 2 2v1.2"/><path d="M12 9.2 3.6 15.8A1.2 1.2 0 0 0 4.3 18h15.4a1.2 1.2 0 0 0 .7-2.2L12 9.2"/>', "drawn"))
lines = ["// Generated from Design Lounge library/icons.json (Lounge Icons, stroke 1.75),",
         "// plus Lucide (ISC, lucide-static 1.57.0) for icons the set lacks, plus one drawn icon.",
         "// Designed using Design Lounge (https://www.designlounge.live). Sources per icon below.",
         "", "export const ICONS = {"]
for k, body, src in entries:
    lines.append(f"  // {src}")
    lines.append(f"  {json.dumps(k)}: {json.dumps(body)},")
lines += ["} as const;", "", "export type IconName = keyof typeof ICONS;", ""]
open(out, "w").write("\n".join(lines))
print(len(entries), "icons")
