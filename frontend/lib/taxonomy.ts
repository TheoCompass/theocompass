import {
  CERULEAN,
  GROUP_BASE,
  PALETTE,
  PUNCH,
  familyColor,
} from "./palette";

/**
 * Tradition clusters and the colours that identify them.
 *
 * Every colour here is generated from `lib/palette.ts`, so the compass, the
 * legends and the exported images can never drift off-brand again. The old file
 * carried 25 hard-coded rainbow hexes (#9333ea, #eab308, #10b981, #ef4444…);
 * those are gone.
 *
 * The palette has four usable hue families and we need seven clusters, so
 * Catholic and Orthodox share the navy family and are separated by depth.
 * Within a cluster each family is shifted lighter/darker by `familyColor()`.
 */

export const FAMILY_GROUPS: { category: string; families: string[] }[] = [
  {
    category: "Catholic",
    families: [
      "Roman Catholicism (Latin Core)",
      "High-Church New Movements",
      "Traditionalist Catholicism",
    ],
  },
  {
    category: "Orthodox & High Church",
    families: [
      "Eastern & Oriental Orthodoxy",
      "Anglo-Catholic & High Church",
      "Independent & Liberal Catholicism",
      "Old Calendar & Traditionalist Orthodox",
      "Early Schisms & Strict Observance",
    ],
  },
  {
    category: "Magisterial Protestant",
    families: [
      "Confessional Lutheranism",
      "Confessional Reformed & Presbyterian",
      "Mainline & Historic Protestantism",
      "Wesleyan & Holiness Movements",
    ],
  },
  {
    category: "Esoteric & Progressive",
    families: [
      "Gnosticism & Esoteric Antiquity",
      "Progressive Christianity & Universalism",
    ],
  },
  {
    category: "Ancient, Dualist & Restorationist",
    families: [
      "Historical Dualism",
      "Early Jewish Christianity",
      "Apostolic & Early Christianity",
      "Modern Restorationist Movements",
    ],
  },
  {
    category: "Charismatic",
    families: ["Oneness Pentecostalism", "Pentecostal & Charismatic"],
  },
  {
    category: "Evangelical & Primitivist",
    families: [
      "Sabbatarian & Adventist Movements",
      "Independent Evangelicalism",
      "Conservative Baptist & Calvinist",
      "Restorationist (Stone-Campbell)",
      "Anabaptist",
      "Anti-Sacerdotal Primitivist",
    ],
  },
];

/** Families present in the data but not assigned to a cluster. */
const UNGROUPED_FAMILIES = [
  "Early Nontrinitarians & Adoptionists",
  "Independent Sacramental & Autocephalous",
  "Pre-Reformation Dissenters",
  "Unitarian & Hebrew Roots",
];

export const GROUP_COLORS: Record<string, string> = {
  Catholic: GROUP_BASE.Catholic,
  "Orthodox & High Church": GROUP_BASE["Orthodox & High Church"],
  "Magisterial Protestant": GROUP_BASE["Magisterial Protestant"],
  "Esoteric & Progressive": GROUP_BASE["Esoteric & Progressive"],
  "Ancient, Dualist & Restorationist": GROUP_BASE["Ancient, Dualist & Restorationist"],
  Charismatic: GROUP_BASE.Charismatic,
  "Evangelical & Primitivist": GROUP_BASE["Evangelical & Primitivist"],
};

function buildFamilyColors(): Record<string, string> {
  const colors: Record<string, string> = {};

  FAMILY_GROUPS.forEach((group) => {
    group.families.forEach((family, index) => {
      colors[family] = familyColor(group.category, index);
    });
  });

  UNGROUPED_FAMILIES.forEach((family, index) => {
    colors[family] = familyColor(null, index + 1);
  });

  return colors;
}

export const FAMILY_COLORS: Record<string, string> = buildFamilyColors();

export const FAMILY_TO_GROUP: Record<string, string> = Object.fromEntries(
  FAMILY_GROUPS.flatMap((group) =>
    group.families.map((family) => [family, group.category])
  )
);

/** Colour used to plot "you are here". The only Punch Red mark on the chart. */
export const USER_MARKER_COLOR = PALETTE.punch;
export const USER_MARKER_RING = PALETTE.navy;
export const CHART_GRID_COLOR = CERULEAN[200];
export const CHART_AXIS_COLOR = CERULEAN[800];
export const CHART_REFERENCE_COLOR = PUNCH[700];

// NOTE: FAMILY_METADATA removed.
// Family metadata (century, region, members, description) is now fetched live
// from the /api/families endpoint (denomination_families table).
// See CompassChart.tsx for the new useFamilyMeta() hook that fetches this data.
