export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.rx = 0;
    this.ry = 0;
    this.fov = 1;
    this.fovR = 100;
  }

  update(dt) {
    const rate = Math.min(1, dt * 0.01);
    this.rx += (this.x - this.rx) * rate;
    this.ry += (this.y - this.ry) * rate;
    this.fovR += (this.fov - this.fovR) * rate;
  }
}
