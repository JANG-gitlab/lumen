struct TemporalParams {
  texel: vec2f,
  history_weight: f32,
  padding: f32,
}

@group(0) @binding(0) var<uniform> params: TemporalParams;
@group(0) @binding(1) var current_texture: texture_2d<f32>;
@group(0) @binding(2) var history_texture: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;

fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.299, 0.587, 0.114));
}

fn current_at(uv: vec2f) -> vec3f {
  return textureSampleLevel(current_texture, linear_sampler, uv, 0.0).rgb;
}

// Anti-crénelage temporel : chaque image est rendue avec un décalage de
// moins d'un pixel, puis fondue dans l'historique. L'historique est borné
// par le voisinage de l'image courante (pas de traînée quand la scène
// bouge), et les deux sont pondérés par 1 / (1 + luminance) pour qu'un
// reflet isolé très lumineux ne scintille pas d'une image à l'autre.
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texel = params.texel;
  let current = current_at(uv);
  var lowest = current;
  var highest = current;
  for (var y = -1; y <= 1; y += 1) {
    for (var x = -1; x <= 1; x += 1) {
      if (x == 0 && y == 0) { continue; }
      let neighbour = current_at(uv + vec2f(f32(x), f32(y)) * texel);
      lowest = min(lowest, neighbour);
      highest = max(highest, neighbour);
    }
  }
  let history = clamp(textureSampleLevel(history_texture, linear_sampler, uv, 0.0).rgb, lowest, highest);

  let current_weight = (1.0 - params.history_weight) / (1.0 + luma(current));
  let history_weight = params.history_weight / (1.0 + luma(history));
  let color = (current * current_weight + history * history_weight) / max(current_weight + history_weight, 1e-5);
  return vec4f(color, 1.0);
}
