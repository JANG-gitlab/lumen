struct SculptureParams {
  resolution: vec2f,
  shape: f32,
  shape_count: f32,
  tint: f32,
  time: f32,
  quality: f32,
  yaw: f32,
  pitch: f32,
  radius: f32,
  dispersion: f32,
  strip_angle: f32,
  floor_luminance: f32,
  key: vec4f,
  key_color: vec4f,
  rim: vec4f,
  rim_color: vec4f,
  background_top: vec4f,
  background_bottom: vec4f,
  panel_morph: f32,
  panel_index: f32,
  panel_count: f32,
  panel_aspect: f32,
  panel_half_height: f32,
  panel_lift: f32,
  clock: f32,
  panel_focus: f32,
  panel_pointer: vec2f,
  jitter: vec2f,
}

@group(0) @binding(0) var<uniform> params: SculptureParams;
@group(0) @binding(1) var project_texture: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;

const FLOOR_HEIGHT: f32 = -1.05;
const GLASS_IOR: f32 = 1.5;
const HIT_EPSILON: f32 = 0.0008;
const CAMERA_TARGET: vec3f = vec3f(0.0, -0.05, 0.0);
const CAMERA_LENS: f32 = 2.2;
// Toutes les formes tiennent dans cette sphère : au-delà, on marche sur
// la sphère au lieu d'évaluer la forme (même résultat, bien moins cher).
const SHAPE_BOUND: f32 = 1.3;
const BOUND_MARGIN: f32 = 0.25;

fn rotate2(angle: f32) -> mat2x2f {
  let c = cos(angle);
  let s = sin(angle);
  return mat2x2f(c, s, -s, c);
}

fn smooth_union(a: f32, b: f32, radius: f32) -> f32 {
  let blend = clamp(0.5 + 0.5 * (b - a) / radius, 0.0, 1.0);
  return mix(b, a, blend) - radius * blend * (1.0 - blend);
}

fn torus_distance(point: vec3f, radii: vec2f) -> f32 {
  return length(vec2f(length(point.xz) - radii.x, point.y)) - radii.y;
}

fn rounded_box_distance(point: vec3f, bounds: vec3f, radius: f32) -> f32 {
  let delta = abs(point) - bounds;
  return length(max(delta, vec3f(0.0))) + min(max(delta.x, max(delta.y, delta.z)), 0.0) - radius;
}

fn knot_distance(point: vec3f) -> f32 {
  let angle = atan2(point.z, point.x);
  let cross_section = rotate2(angle * 1.5 + params.time * 0.5) * vec2f(length(point.xz) - 0.75, point.y);
  let ribbon = rounded_box_distance(vec3f(cross_section, 0.0), vec3f(0.34, 0.12, 0.0), 0.08);
  let ring = torus_distance(point, vec2f(1.05, 0.06));
  return smooth_union(ribbon, ring, 0.15);
}

fn gyroid_distance(point: vec3f) -> f32 {
  let frequency = 5.0;
  let gyroid = (
    sin(point.x * frequency) * cos(point.y * frequency) +
    sin(point.y * frequency) * cos(point.z * frequency) +
    sin(point.z * frequency) * cos(point.x * frequency)
  ) / frequency;
  return max(length(point) - 1.0, abs(gyroid) - 0.07);
}

fn droplets_distance(point: vec3f) -> f32 {
  var distance = 100000.0;
  for (var i = sculpt.zero; i < 6; i += 1) {
    let index = f32(i);
    let center = vec3f(
      sin(params.time * 0.7 + index * 2.1),
      cos(params.time * 0.5 + index * 1.3) * 0.6,
      sin(params.time * 0.6 + index * 0.7 + 1.0)
    ) * 0.55;
    let radius = 0.42 + sin(index * 3.0 + params.time) * 0.1;
    distance = smooth_union(distance, length(point - center) - radius, 0.35);
  }
  return distance;
}

fn shape_distance(index: i32, point: vec3f) -> f32 {
  if (index == 1) { return gyroid_distance(point); }
  if (index == 2) { return droplets_distance(point); }
  if (index == 3) { return flame_distance(point); }
  if (index == 4) { return torus_asymmetric_distance(point); }
  if (index == 5) { return heart_distance(point); }
  if (index == 6) { return cnoidal_distance(point); }
  if (index == 7) { return dna_distance(point); }
  if (index == 8) { return mobius_distance(point); }
  return knot_distance(point);
}

fn flame_distance(point: vec3f) -> f32 {
  let stretched = vec3f(point.x, point.y * 1.45, point.z);
  let raised = vec3f(stretched.x, stretched.y + 0.18, stretched.z);
  let body = length(raised) - 0.78;
  let tip = length(vec2f(length(point.xz) * 0.45, point.y + 0.95)) - 0.24;
  return smooth_union(body, tip, 0.12);
}

fn torus_asymmetric_distance(point: vec3f) -> f32 {
  let horizontal = length(point.xz);
  let tube = 0.11 + 0.1 * smoothstep(-0.65, 0.65, point.y);
  return length(vec2f(horizontal - 0.92, point.y)) - tube;
}

fn heart_distance(point: vec3f) -> f32 {
  let left = length(point - vec3f(-0.32, 0.2, 0.0)) - 0.42;
  let right = length(point - vec3f(0.32, 0.2, 0.0)) - 0.42;
  let lobes = smooth_union(left, right, 0.22);
  let point_bottom = length(point - vec3f(0.0, -0.5, 0.0)) - 0.34;
  return smooth_union(lobes, point_bottom, 0.18);
}

fn cnoidal_distance(point: vec3f) -> f32 {
  let wave = sin(point.x * 2.2 + params.time * 0.35) * 0.42;
  return max(abs(point.y - wave) - 0.12, length(point.xz) - 1.15);
}

fn capsule_distance(point: vec3f, start: vec3f, end: vec3f, radius: f32) -> f32 {
  let segment = end - start;
  let offset = point - start;
  let progress = clamp(dot(offset, segment) / dot(segment, segment), 0.0, 1.0);
  return length(offset - segment * progress) - radius;
}

fn dna_distance(point: vec3f) -> f32 {
  var distance = 100000.0;
  let steps = 4;
  let strand_radius = 0.16;
  for (var i = sculpt.zero; i < steps; i += 1) {
    let index = f32(i);
    let angle = index * 6.2831 / f32(steps);
    let height = index * 0.5 - 1.0;
    let a = vec3f(0.52 * cos(angle), height, 0.52 * sin(angle));
    let b = vec3f(0.52 * cos(angle + 3.1415), height, 0.52 * sin(angle + 3.1415));
    let a_end = vec3f(0.52 * cos(angle + 6.2831 / f32(steps)), height + 0.5, 0.52 * sin(angle + 6.2831 / f32(steps)));
    let b_end = vec3f(0.52 * cos(angle + 6.2831 / f32(steps) + 3.1415), height + 0.5, 0.52 * sin(angle + 6.2831 / f32(steps) + 3.1415));
    let strand_a = capsule_distance(point, a, a_end, strand_radius);
    let strand_b = capsule_distance(point, b, b_end, strand_radius);
    let rung = capsule_distance(point, a, b, 0.045);
    distance = min(distance, min(strand_a, min(strand_b, rung)));
  }
  return distance;
}

fn mobius_distance(point: vec3f) -> f32 {
  let angle = atan2(point.z, point.x);
  let radius = length(point.xz);
  let half = 0.5 * angle;
  let local_x = cos(half) * (radius - 1.0) + sin(half) * point.y;
  let local_y = -sin(half) * (radius - 1.0) + cos(half) * point.y;
  return length(vec2f(local_x, local_y)) - 0.2;
}

// Lame projet : un rectangle de verre (ratio paysage piloté par
// `panel_aspect`) tourné vers la caméra. La sculpture s'y transforme en
// trois temps qui se chevauchent, sans jamais devenir deux objets :
// 1. pressée : la forme s'aplatit face à la caméra en s'étalant, comme une
//    fleur pressée dans le verre (sa silhouette reste lisible) ;
// 2. fondue : elle coule en un disque liquide, bord ondulant et ondes
//    concentriques à sa surface ;
// 3. tendue : le disque s'étire jusqu'au format de la lame en basculant un
//    peu, ses coins se resserrent, les ondes s'apaisent et il se pose face
//    à la caméra.
const PANEL_CORNER: f32 = 0.08;
const PANEL_EDGE: f32 = 0.035;
const PANEL_DEPTH_RATIO: f32 = 0.09;
const PANEL_RIPPLE: f32 = 0.06;
const PANEL_IMAGE_DEPTH: f32 = 0.6;
const PANEL_COVER: f32 = 1.03;
const LENS_RADIUS: f32 = 0.22;
const LENS_HEIGHT: f32 = 0.07;
// Forme pressée : épaisseur restante et étalement de sa silhouette.
const PRESSED_THICKNESS: f32 = 0.2;
const PRESSED_SPREAD: f32 = 1.35;
// Bascule de la lame pendant qu'elle se tend (radians, au plus fort).
const TENSION_SWING: f32 = 0.45;
// Disque liquide : rayon (relatif à la demi-hauteur de la lame), épaisseur,
// amplitude et nombre de lobes de l'ondulation du bord.
const DISC_RADIUS: f32 = 0.95;
const DISC_DEPTH: f32 = 0.2;
const DISC_WOBBLE: f32 = 0.08;
const DISC_LOBES: f32 = 5.0;
const DISC_RINGS: f32 = 0.035;

struct PanelFrame {
  center: vec3f,
  right: vec3f,
  up: vec3f,
  facing: vec3f,
  half_size: vec2f,
  half_depth: f32,
  ease: f32,
  calm: f32,
  // Normale de la face de la lame, une fois tournée (voir panel_local).
  face: vec3f,
  // Rotation de la lame autour de son axe vertical (cosinus, sinus).
  swing: vec2f,
  corner: f32,
  // Épaisseur relative de la forme pressée (1 : intacte) et étalement.
  thin: f32,
  spread: f32,
  // Part de la forme fondue dans le disque (1 : il ne reste que la lame).
  melt: f32,
  wobble: f32,
  rings: f32,
}

struct ShapeState {
  spin: mat2x2f,
  index: i32,
  next: i32,
  blend: f32,
  bounds: vec3f,
  zero: i32,
}

// Constantes par pixel, calculées une fois dans fs_main plutôt qu'à chaque
// évaluation du champ (des centaines par pixel).
var<private> panel: PanelFrame;
var<private> sculpt: ShapeState;

fn prepare_frame(camera_position: vec3f, right: vec3f, up: vec3f, screen_aspect: f32) {
  let morph = clamp(params.panel_morph, 0.0, 1.0);
  let ease = morph * morph * (3.0 - 2.0 * morph);
  let aspect = max(params.panel_aspect, 0.1);
  let facing = normalize(camera_position - CAMERA_TARGET);
  // Levée : la lame avance vers la caméra jusqu'à couvrir tout l'écran.
  let lift = clamp(params.panel_lift, 0.0, 1.0);
  let cover_distance = CAMERA_LENS * params.panel_half_height * min(1.0, aspect / screen_aspect) / PANEL_COVER;
  let travel = (length(camera_position - CAMERA_TARGET) - cover_distance) * lift;

  let pressed = smoothstep(0.0, 0.4, morph);
  let melt = smoothstep(0.3, 0.62, morph);
  let tension = smoothstep(0.5, 1.0, morph);
  let full = vec2f(params.panel_half_height * aspect, params.panel_half_height);
  let disc = DISC_RADIUS * params.panel_half_height;
  let half_size = mix(vec2f(disc), full, tension);
  let swing = TENSION_SWING * sin(3.14159 * tension) * (1.0 - 0.5 * tension);
  let swing_cs = vec2f(cos(swing), sin(swing));
  panel = PanelFrame(
    CAMERA_TARGET + facing * travel,
    right,
    up,
    facing,
    half_size,
    mix(DISC_DEPTH * params.panel_half_height, PANEL_DEPTH_RATIO * params.panel_half_height, tension),
    ease,
    1.0 - smoothstep(0.0, 0.6, lift),
    facing * swing_cs.x - right * swing_cs.y,
    swing_cs,
    mix(disc, PANEL_CORNER, tension * tension),
    mix(1.0, PRESSED_THICKNESS, pressed),
    mix(1.0, PRESSED_SPREAD, pressed),
    melt,
    DISC_WOBBLE * melt * (1.0 - tension),
    DISC_RINGS * melt * (1.0 - tension) * params.panel_half_height,
  );

  // Boîte englobant la sculpture et la lame : les rayons qui la manquent ne
  // marchent pas du tout.
  var bounds = vec3f(SHAPE_BOUND + BOUND_MARGIN);
  if (ease > 0.0) {
    let panel_reach = length(vec3f(panel.half_size, panel.half_depth)) + panel.wobble + BOUND_MARGIN;
    bounds = max(bounds, abs(panel.center) + vec3f(panel_reach));
  }

  let shape_value = max(params.shape, 0.0);
  let shape_count = i32(max(params.shape_count, 1.0));
  sculpt = ShapeState(
    rotate2(params.time * 0.25),
    i32(floor(shape_value)) % shape_count,
    (i32(floor(shape_value)) + 1) % shape_count,
    shape_value - floor(shape_value),
    bounds,
    min(shape_count, 0),
  );
}

// Coordonnées dans le repère de la lame, rotation autour de son axe
// vertical comprise (z suit la normale `panel.face`).
fn panel_local(point: vec3f) -> vec3f {
  let offset = point - panel.center;
  let x = dot(offset, panel.right);
  let z = dot(offset, panel.facing);
  return vec3f(panel.swing.x * x + panel.swing.y * z, dot(offset, panel.up), panel.swing.x * z - panel.swing.y * x);
}

fn panel_distance(local: vec3f) -> f32 {
  let corner = abs(local.xy) - panel.half_size + panel.corner;
  var outline = length(max(corner, vec2f(0.0))) + min(max(corner.x, corner.y), 0.0) - panel.corner;
  // Bord liquide du disque : des lobes qui tournent lentement.
  if (panel.wobble > 0.0) {
    outline += panel.wobble * sin(atan2(local.y, local.x) * DISC_LOBES + params.clock * 1.7);
  }
  // Ondes concentriques qui partent du centre et gonflent la surface.
  var depth = panel.half_depth;
  if (panel.rings > 0.0) {
    depth += panel.rings * sin(length(local.xy) * 14.0 - params.clock * 5.0);
  }
  let slab = vec2f(outline + PANEL_EDGE, abs(local.z) - depth + PANEL_EDGE);
  return length(max(slab, vec2f(0.0))) + min(max(slab.x, slab.y), 0.0) - PANEL_EDGE;
}

// Ondulation liquide de la lame : elle incline la normale, donc la
// réfraction du visuel pris dans le verre, ses reflets et son speculaire.
// Elle se calme quand la lame vient couvrir l'écran.
fn panel_ripple(uv: vec2f) -> vec3f {
  let t = params.clock;
  var wave = vec2f(
    sin(uv.x * 9.0 + t * 1.3) + 0.6 * sin(uv.y * 11.0 - t * 0.9),
    cos(uv.y * 10.0 - t * 1.2) + 0.6 * sin(uv.x * 8.0 + t * 1.0),
  ) * PANEL_RIPPLE;

  // Loupe sous le curseur : une bosse de verre qui grossit le visuel,
  // cerclée d'une onde qui s'éloigne lentement.
  if (params.panel_focus > 0.0) {
    let to_local = vec2f(2.0, -2.0) * panel.half_size;
    let offset = (uv - params.panel_pointer) * to_local;
    let spread = dot(offset, offset) / (LENS_RADIUS * LENS_RADIUS);
    let bulge = LENS_HEIGHT * exp(-spread) * 2.0 / (LENS_RADIUS * LENS_RADIUS);
    let ring = 0.05 * sin(sqrt(spread) * 7.0 - t * 4.0) * exp(-spread * 0.3);
    wave += (offset * bulge + normalize(offset + vec2f(1e-5)) * ring) * params.panel_focus;
  }
  wave *= panel.calm;
  return panel.right * wave.x + panel.up * wave.y;
}

fn spin(world_point: vec3f) -> vec3f {
  let rotated = sculpt.spin * world_point.xz;
  return vec3f(rotated.x, world_point.y, rotated.y);
}

// Rotation temporelle, morph entre formes puis lame projet : tout passe par
// ce champ unique (normale et matière communes). Les deux formes d'un morph
// passent par une seule évaluation dans une boucle que le compilateur ne
// peut pas dérouler : sinon il recopie les neuf formes à chaque appel, et
// la compilation du shader prend plusieurs secondes.
fn sculpture_distance(world_point: vec3f) -> f32 {
  var shape_point = world_point;
  var shape_scale = 1.0;
  var local = vec3f(0.0);
  if (panel.ease > 0.0) {
    // Forme pressée : on la lit dans le repère tourné de la lame, étirée le
    // long de la normale (donc aplatie à l'écran), et on remet la distance
    // à l'échelle. Identité exacte quand la lame est à zéro.
    local = panel_local(world_point);
    let right = panel.right * panel.swing.x + panel.facing * panel.swing.y;
    shape_point = panel.center + (right * local.x + panel.up * local.y) / panel.spread + panel.face * (local.z / panel.thin);
    shape_scale = panel.thin;
  }
  var central = 1e5;
  if (panel.melt < 0.999) {
    for (var piece = sculpt.zero; piece < 2; piece += 1) {
      if (piece == 1 && sculpt.blend < 0.001) { continue; }
      var distance = length(shape_point) - SHAPE_BOUND;
      if (distance <= BOUND_MARGIN) {
        distance = shape_distance(select(sculpt.index, sculpt.next, piece == 1), spin(shape_point));
      }
      central = select(mix(central, distance, sculpt.blend), distance, piece == 0);
    }
    central *= shape_scale;
  }
  if (panel.ease <= 0.0) { return central; }
  // La forme pressée fond dans le disque liquide, qui se tend en lame.
  let blade = panel_distance(local);
  if (panel.melt >= 0.999) { return blade; }
  return mix(central, blade, panel.melt);
}

// Normale par tétraèdre : quatre évaluations, une seule recopie du champ.
fn sculpture_normal(point: vec3f) -> vec3f {
  let epsilon = 0.0015;
  var normal = vec3f(0.0);
  for (var corner = sculpt.zero; corner < 4; corner += 1) {
    let axis = 2.0 * vec3f(f32(((corner + 3) >> 1) & 1), f32((corner >> 1) & 1), f32(corner & 1)) - 1.0;
    normal += axis * sculpture_distance(point + axis * epsilon);
  }
  return normalize(normal);
}

// Entrée et sortie du rayon dans la boîte englobante (test des dalles).
fn bounds_span(origin: vec3f, direction: vec3f) -> vec2f {
  let inverse = 1.0 / direction;
  let near = (-sculpt.bounds - origin) * inverse;
  let far = (sculpt.bounds - origin) * inverse;
  let enter = min(near, far);
  let exit = max(near, far);
  return vec2f(max(max(enter.x, enter.y), max(enter.z, 0.0)), min(exit.x, min(exit.y, exit.z)));
}

fn march_surface(origin: vec3f, direction: vec3f, distance_sign: f32, limit: f32, step_limit: i32) -> f32 {
  var travel = 0.0;
  var end = limit;
  if (distance_sign > 0.0) {
    let span = bounds_span(origin, direction);
    if (span.x > span.y) { return -1.0; }
    travel = span.x;
    end = min(limit, span.y);
  }
  for (var step_index = 0; step_index < 112; step_index += 1) {
    if (step_index >= step_limit) { break; }
    let distance = sculpture_distance(origin + direction * travel) * distance_sign;
    if (distance < HIT_EPSILON) { return travel; }
    travel += distance * 0.9;
    if (travel > end) { break; }
  }
  return -1.0;
}

fn fresnel_schlick(cosine: f32) -> f32 {
  return 0.04 + 0.96 * pow(clamp(1.0 - cosine, 0.0, 1.0), 5.0);
}

fn softbox(direction: vec3f, light_direction: vec3f, hardness: f32, power: f32) -> f32 {
  return pow(clamp(dot(direction, light_direction), 0.0, 1.0), hardness) * power;
}

fn studio_radiance(direction: vec3f) -> vec3f {
  let sky_mix = pow(clamp(direction.y * 0.5 + 0.5, 0.0, 1.0), 1.5);
  var color = mix(params.background_bottom.rgb, params.background_top.rgb, sky_mix);
  color += params.key_color.rgb * softbox(direction, normalize(params.key.xyz), 24.0, params.key.w);
  color += params.rim_color.rgb * softbox(direction, normalize(params.rim.xyz), 40.0, params.rim.w);
  color += params.background_top.rgb * softbox(direction, vec3f(0.0, 1.0, 0.0), 6.0, 0.6);
  let strip_axis = vec2f(cos(params.strip_angle), sin(params.strip_angle));
  let strip_horizontal = abs(dot(direction.xz, strip_axis));
  let strip = smoothstep(0.985, 1.0, strip_horizontal) * smoothstep(0.35, 0.0, abs(direction.y - 0.1));
  color += mix(vec3f(1.0), params.key_color.rgb, 0.3) * strip * 3.0 * clamp(params.key.w / 6.0, 0.3, 1.5);
  return color;
}

fn absorption_color() -> vec3f {
  let mode = i32(params.tint + 0.5);
  if (mode == 1) { return vec3f(0.95, 0.45, 0.60); }
  if (mode == 2) { return vec3f(0.35, 0.55, 0.95); }
  if (mode == 3) { return vec3f(0.50, 0.90, 0.65); }
  return vec3f(0.0);
}

fn shade_floor(point: vec3f, incoming: vec3f) -> vec3f {
  let radius = length(point.xz);
  var color = params.background_bottom.rgb * params.floor_luminance * (1.0 + 0.25 * smoothstep(3.5, 0.0, radius));
  color += studio_radiance(reflect(incoming, vec3f(0.0, 1.0, 0.0))) * fresnel_schlick(-incoming.y) * 0.5;
  color *= 1.0 - 0.45 * smoothstep(1.5, 0.3, radius);
  let key_direction = normalize(params.key.xyz);
  let caustic_position = point.xz + key_direction.xz * 0.55;
  let caustic = pow(smoothstep(0.9, 0.0, length(caustic_position)), 3.0);
  let pulse = 0.6 + 0.4 * sin(params.time * 1.3);
  color += params.key_color.rgb * caustic * pulse * 0.35 * clamp(params.key.w / 6.0, 0.2, 1.5);
  return color;
}

fn trace_glass(origin: vec3f, direction: vec3f, hit_distance: f32, ior: f32) -> vec3f {
  var position = origin + direction * hit_distance;
  var ray = refract(direction, sculpture_normal(position), 1.0 / ior);
  var radiance = vec3f(0.0);
  var throughput = 1.0;
  var internal_distance = 0.0;

  for (var bounce = sculpt.zero; bounce < 2; bounce += 1) {
    let start = position + ray * 0.004;
    let exit_distance = march_surface(start, ray, -1.0, 6.0, 60);
    if (exit_distance < 0.0) {
      radiance += studio_radiance(ray) * throughput;
      throughput = 0.0;
      break;
    }

    internal_distance += exit_distance;
    position = start + ray * exit_distance;
    let inward_normal = -sculpture_normal(position);
    let exit_ray = refract(ray, inward_normal, ior);
    if (dot(exit_ray, exit_ray) < 0.5) {
      ray = reflect(ray, inward_normal);
      continue;
    }

    let reflection = fresnel_schlick(dot(-ray, inward_normal));
    var outside = studio_radiance(exit_ray);
    if (exit_ray.y < 0.0) {
      let floor_distance = (FLOOR_HEIGHT - position.y) / exit_ray.y;
      let floor_point = position + exit_ray * floor_distance;
      outside = mix(shade_floor(floor_point, exit_ray), outside, smoothstep(2.5, 6.0, length(floor_point.xz)));
    }
    radiance += outside * (1.0 - reflection) * throughput;
    throughput *= reflection;
    ray = reflect(ray, inward_normal);
    if (throughput < 0.08) { break; }
  }

  radiance += studio_radiance(ray) * throughput;
  let tint = absorption_color();
  let absorption = exp(-(vec3f(1.0) - tint) * internal_distance * 1.1 * step(0.01, length(tint)));
  return radiance * absorption;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  // Décalage sous-pixel de l'anti-crénelage temporel (voir temporal.wgsl).
  var screen = (uv + params.jitter / params.resolution - 0.5) * 2.0;
  screen = vec2f(screen.x * aspect, -screen.y);

  let camera_position = vec3f(
    params.radius * sin(params.yaw) * cos(params.pitch),
    params.radius * sin(params.pitch) + 0.1,
    params.radius * cos(params.yaw) * cos(params.pitch)
  );
  let forward = normalize(CAMERA_TARGET - camera_position);
  let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, forward);
  let ray = normalize(screen.x * right + screen.y * up + CAMERA_LENS * forward);
  prepare_frame(camera_position, right, up, aspect);

  let surface_steps = i32(mix(72.0, 128.0, params.quality));
  let sculpture_hit = march_surface(camera_position, ray, 1.0, 12.0, surface_steps);
  let floor_hit = select(-1.0, (FLOOR_HEIGHT - camera_position.y) / ray.y, ray.y < 0.0);
  var color: vec3f;

  if (sculpture_hit > 0.0 && (floor_hit < 0.0 || sculpture_hit < floor_hit)) {
    let point = camera_position + ray * sculpture_hit;
    var normal = sculpture_normal(point);
    var project = vec3f(0.0);
    var coverage = 0.0;
    var border = 0.0;
    if (panel.ease > 0.0) {
      let local = panel_local(point);
      let uv = vec2f(0.5 + 0.5 * local.x / panel.half_size.x, 0.5 - 0.5 * local.y / panel.half_size.y);
      let facing = smoothstep(0.35, 0.8, dot(normal, panel.face));
      // Le visuel se condense dans le verre sur toute l'emprise du rectangle
      // pendant le dépliage, au lieu d'apparaître d'abord sur les bords.
      let outside = max(abs(local.x) - panel.half_size.x, abs(local.y) - panel.half_size.y);
      let footprint = 1.0 - smoothstep(-0.03, 0.0, outside);
      let presence = smoothstep(0.5, 0.95, panel.ease) * facing * footprint;
      if (presence > 0.0) {
        let flat_normal = normal;
        normal = normalize(normal + panel_ripple(uv) * presence);
        let shift = refract(ray, normal, 1.0 / GLASS_IOR) - refract(ray, flat_normal, 1.0 / GLASS_IOR);
        let offset = vec2f(dot(shift, panel.right) / panel.half_size.x, -dot(shift, panel.up) / panel.half_size.y) * 0.5 * PANEL_IMAGE_DEPTH;
        let image_uv = clamp(uv + offset, vec2f(0.0), vec2f(1.0));
        let count = max(params.panel_count, 1.0);
        let row = clamp(params.panel_index, 0.0, count - 1.0);
        project = textureSampleLevel(project_texture, linear_sampler, vec2f(image_uv.x, (row + image_uv.y) / count), 0.0).rgb;
        let edge_gap = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
        coverage = presence * smoothstep(0.0, 0.015, edge_gap);
        border = presence * pow(1.0 - clamp(edge_gap * 30.0, 0.0, 1.0), 3.0);
      }
    }

    // Sur la lame, le reflet studio reste un voile : face caméra, la softbox
    // s'y refléterait en plein et brûlerait le visuel.
    let reflection_weight = fresnel_schlick(-dot(ray, normal)) * mix(1.0, 0.35, coverage);
    let studio = studio_radiance(reflect(ray, normal));
    let reflected = mix(studio, min(studio, vec3f(1.1)), coverage);
    var refracted = project;
    if (coverage < 0.999) {
      // Dispersion : un tracé par couleur, chacun avec son indice de réfraction.
      let spread = 0.008 * params.dispersion;
      let channels = select(1, 3, spread > 0.001);
      var glass = vec3f(0.0);
      for (var channel = sculpt.zero; channel < channels; channel += 1) {
        let shift = select(0.0, f32(channel - 1), channels == 3);
        let mask = select(vec3f(1.0), vec3f(f32(channel == 0), f32(channel == 1), f32(channel == 2)), channels == 3);
        glass += trace_glass(camera_position, ray, sculpture_hit, GLASS_IOR + spread * shift) * mask;
      }
      refracted = mix(glass, project, coverage);
    }
    color = mix(refracted, reflected, reflection_weight);
    color += vec3f(border * 0.4);
    let key_half = normalize(normalize(params.key.xyz) - ray);
    let rim_half = normalize(normalize(params.rim.xyz) - ray);
    // Sur le visuel de la lame, l'ondulation étalerait le reflet direct des
    // lampes en une large tache : il n'en reste qu'un éclat.
    let glint = 1.0 - 0.85 * coverage;
    color += params.key_color.rgb * pow(clamp(dot(normal, key_half), 0.0, 1.0), 400.0) * params.key.w * 0.4 * glint;
    color += params.rim_color.rgb * pow(clamp(dot(normal, rim_half), 0.0, 1.0), 300.0) * params.rim.w * 0.25 * glint;
  } else if (floor_hit > 0.0) {
    let floor_point = camera_position + ray * floor_hit;
    let reflected_ray = reflect(ray, vec3f(0.0, 1.0, 0.0));
    var floor_color = shade_floor(floor_point, ray);
    // Le sol ne reflète presque rien vu de haut : on ne cherche le reflet de
    // la sculpture que là où il pèse vraiment (fondu pour éviter une marche).
    let mirror = clamp(fresnel_schlick(-ray.y) * 1.5, 0.0, 0.85) * smoothstep(0.08, 0.16, fresnel_schlick(-ray.y) * 1.5);
    var reflection_hit = -1.0;
    if (mirror > 0.0) {
      reflection_hit = march_surface(floor_point + vec3f(0.0, 0.002, 0.0), reflected_ray, 1.0, 8.0, 56);
    }
    if (reflection_hit > 0.0) {
      let reflection_point = floor_point + reflected_ray * reflection_hit;
      let reflection_normal = sculpture_normal(reflection_point);
      let reflection_weight = fresnel_schlick(-dot(reflected_ray, reflection_normal));
      let ghost = mix(
        studio_radiance(refract(reflected_ray, reflection_normal, 1.0 / GLASS_IOR)) * 0.6,
        studio_radiance(reflect(reflected_ray, reflection_normal)),
        reflection_weight
      );
      floor_color = mix(floor_color, ghost, mirror);
    }
    color = mix(floor_color, studio_radiance(ray), smoothstep(3.0, 8.0, length(floor_point.xz)));
  } else {
    color = studio_radiance(ray);
  }

  return vec4f(color, 1.0);
}
