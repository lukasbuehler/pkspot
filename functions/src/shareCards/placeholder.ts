type Point3 = readonly [number, number, number];

const dot = (a: Point3, b: Point3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Point3): Point3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};
const eye: Point3 = [7, -12, 9];
const forward = unit([-7, 17, -9]);
const right = unit([17, 7, 0]);
const up: Point3 = [
  right[1] * forward[2], -right[0] * forward[2],
  right[0] * forward[1] - right[1] * forward[0],
];

/** Pinhole camera aimed at [0, 5, 0]. Camera-space depth includes all three
 * axes, so walls converge consistently and near geometry is visibly larger. */
export function projectSpotPoint(point: Point3): readonly [number, number] {
  const relative: Point3 = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const scale = 1150 / dot(relative, forward);
  return [900 + dot(relative, right) * scale, 450 - dot(relative, up) * scale];
}
const project = (point: Point3): string => projectSpotPoint(point).map(value => value.toFixed(2)).join(',');

function wall(x: number, depth: number, width: number, length: number, height: number): string {
  const a: Point3 = [x, depth, 0], b: Point3 = [x + width, depth, 0];
  const c: Point3 = [x + width, depth + length, 0];
  const top = ([px, py]: Point3): Point3 => [px, py, height];
  const polygon = (points: Point3[]) => `<polygon points="${points.map(project).join(' ')}"/>`;
  return polygon([a, b, top(b), top(a)]) + polygon([b, c, top(c), top(b)]) +
    polygon([top(a), top(b), top(c), top([x, depth + length, 0])]);
}

// Filled faces occlude hidden edges before the group's faint opacity is applied.
// Stair blocks overlap in depth, so their risers meet their treads without gaps.
const spotPlaceholderWireframe = `<g fill="#18191f" stroke="#b9bdff" stroke-width="1.5"
  stroke-linejoin="miter" opacity=".23">
  ${wall(-7, 12, 15, 0.25, 2.8)}
  ${wall(-7, 2, 0.25, 10, 2.8)}
  ${wall(-3.9, 9, 3.9, 0.24, 1.4)}
  ${wall(-3.9, 5, 0.24, 4, 1.4)}
  ${wall(-1.5, 7, 1.5, 0.24, 1.0)}
  ${wall(0, 7, 4.8, 0.24, 1.0)}
  ${[6, 5, 4, 3].map(depth => wall(-1.5, depth, 5, 1, (depth - 2) * 0.23)).join('')}
  ${wall(-3.9, 5, 2.4, 0.24, 1.4)}
  ${wall(3.5, 2, 0.24, 3, 0.9)}
  ${wall(2.1, 2, 1.4, 0.24, 0.9)}
  ${wall(0, -1, 0.24, 8, 1.25)}
</g>`;

// Each entity keeps its own visual cue, with the same subdued stroke treatment.
const linework = (body: string): string => `<g fill="none" stroke="#b9bdff" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" opacity=".23">${body}</g>`;
const eventPlaceholder = linework(`
  <rect x="690" y="180" width="430" height="350" rx="28"/>
  <path d="M690 270H1120 M790 150V210 M1020 150V210"/>
  <path d="M755 330H810 M865 330H920 M975 330H1030
    M755 400H810 M865 400H920 M975 400H1030 M755 470H810 M865 470H920"/>`);
const profilePlaceholder = linework(`
  <circle cx="910" cy="305" r="200"/>
  <circle cx="910" cy="260" r="65"/>
  <path d="M764 440C785 328 1035 328 1056 440"/>`);
const communityPlaceholder = linework(`
  <path d="M650 520V330L745 270 840 330V520
    M675 345 745 300 815 345 M745 300V520
    M840 520V230L960 170 1080 230V520 M840 230 960 290 1080 230 M960 290V520
    M1080 520V365L1170 320 1260 365 M1080 365 1170 410V520
    M610 520H1200"/>
  <path d="M880 295V330 M920 315V350 M880 375V410 M920 395V430
    M1000 305V340 M1040 285V320 M1000 385V420 M1040 365V400
    M700 375V410 M785 375V410"/>`);
const pagePlaceholder = linework(`
  <path d="M710 630V335L890 235V530L1080 420V145L1200 75
    M620 630V465L800 360V565L1000 450V235L1200 120"/>`);

export const shareCardPlaceholders = {
  spot: spotPlaceholderWireframe,
  event: eventPlaceholder,
  profile: profilePlaceholder,
  community: communityPlaceholder,
  page: pagePlaceholder,
};
