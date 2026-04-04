import { FLIP_HORIZONTAL, FLIP_VERTICAL, FLIP_DIAGONAL } from "./consts.js";
import { clamp2 } from "./utils.js";

const VERT_SOURCE = `#version 300 es
in vec2 coord;
out vec2 vcoord;
uniform vec2 resolution;
uniform vec4 data;
uniform vec3 offset;
void main() {
  vec2 pixelStart = floor((data.xy * data.zw - offset.xy) / offset.z + 0.5);
  vec2 pixelEnd   = floor(((data.xy + 1.0) * data.zw - offset.xy) / offset.z + 0.5);

  float t = (coord.x + 1.0) * 0.5;
  float s = 1.0 - (coord.y + 1.0) * 0.5;

  float screenX = mix(pixelStart.x, pixelEnd.x, t);
  float screenY = mix(pixelStart.y, pixelEnd.y, s);

  gl_Position = vec4(
    screenX / (resolution.x * 0.5) - 1.0,
    1.0 - screenY / (resolution.y * 0.5),
    0.0, 1.0
  );
  vcoord = coord;
}`;

const FRAG_SOURCE = `#version 300 es
precision highp float;
in vec2 vcoord;
out vec4 color;
uniform bool hori;
uniform bool vert;
uniform bool diag;
uniform sampler2D tex;
void main() {
  vec2 position = (vcoord + 1.0) * 0.5;
  vec2 flip = vec2(
    hori ? -1.0 : 1.0,
    vert ? -1.0 : 1.0
  );
  if (diag) {
    vec2 rot = vec2(-1.0, 0.0);
    position = vec2(
      position.x * rot.y + position.y * rot.x,
      position.y * rot.y - position.x * rot.x
    );
    position *= vec2(flip.y, -flip.x);
  } else {
    position *= flip;
  }
  position.y = 1.0 - position.y;
  color = texture(tex, position);
}`;

export class TileRenderer {
  constructor(width, height, sprites) {
    this.canvas = new OffscreenCanvas(width, height);

    const gl = this.canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported.");

    this.gl = gl;
    this.textures = new Map();
    this._setup(sprites);
    this.resize(width, height);
  }

  _setup(sprites) {
    const gl = this.gl;

    const vertex = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertex, VERT_SOURCE);
    gl.compileShader(vertex);

    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragment, FRAG_SOURCE);
    gl.compileShader(fragment);

    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.useProgram(program);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 1, 2, 3]), gl.STATIC_DRAW);

    this.uResolution = gl.getUniformLocation(program, "resolution");
    this.uHori = gl.getUniformLocation(program, "hori");
    this.uVert = gl.getUniformLocation(program, "vert");
    this.uDiag = gl.getUniformLocation(program, "diag");
    this.uData = gl.getUniformLocation(program, "data");
    this.uOffset = gl.getUniformLocation(program, "offset");

    for (const [id, sprite] of sprites) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.textures.set(id, texture);
    }
  }

  resize(width, height) {
    const gl = this.gl;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(this.uResolution, width, height);
  }

  render(scale, x, y, w, h, gw, gh, wf, hf, tileW, tileH, layers, firstId) {
    const maxX = clamp2(gw - 1, ((x + w) * wf) | 0);
    const minX = clamp2(gw - 1, (x * hf) | 0);
    const maxY = clamp2(gh - 1, ((y + h) * wf) | 0);
    const minY = clamp2(gh - 1, (y * hf) | 0);

    const gl = this.gl;

    gl.uniform3f(this.uOffset, x, y, scale);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let lastTexture = null;
    let lastH = -1, lastV = -1, lastD = -1;

    for (let tx = minX; tx <= maxX; tx++) {
      for (let ty = minY; ty <= maxY; ty++) {
        const index = tx + ty * gw;

        for (let li = 0; li < layers.length; li++) {
          const layer = layers[li];
          if (!layer.data) continue;

          const tid = layer.data[index];
          if (!tid) continue;

          const isHori = (tid & FLIP_HORIZONTAL) !== 0 ? 1 : 0;
          const isVert = (tid & FLIP_VERTICAL) !== 0 ? 1 : 0;
          const isDiag = (tid & FLIP_DIAGONAL) !== 0 ? 1 : 0;
          const id = tid & ~(FLIP_HORIZONTAL | FLIP_VERTICAL | FLIP_DIAGONAL);

          const texture = this.textures.get(id - firstId);
          if (!texture) continue;

          // ✅ bind only if changed
          if (texture !== lastTexture) {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            lastTexture = texture;
          }

          // ✅ update uniforms only if changed
          if (isHori !== lastH) {
            gl.uniform1i(this.uHori, isHori);
            lastH = isHori;
          }
          if (isVert !== lastV) {
            gl.uniform1i(this.uVert, isVert);
            lastV = isVert;
          }
          if (isDiag !== lastD) {
            gl.uniform1i(this.uDiag, isDiag);
            lastD = isDiag;
          }

          gl.uniform4f(this.uData, tx, ty, tileW, tileH);

          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
      }
    }

    gl.flush();
  }
}