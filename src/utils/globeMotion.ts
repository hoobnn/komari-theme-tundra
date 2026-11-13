/** 角速度使用 rad/ms；运动按时间积分，输入和屏幕刷新率均不改变灵敏度。 */
export interface GlobeMotionState {
  phi: number
  theta: number
  targetPhi: number
  targetTheta: number
  velocityPhi: number
  velocityTheta: number
  autoVelocity: number
  lastFrameTime: number | null
}

const ANGLE_EPSILON = 1e-5
const VELOCITY_EPSILON = 1e-6
const INERTIA_TIME_MS = 180
const AUTO_ROTATION_PER_MS = 0.00012
const AUTO_RESUME_MS = 240

export function clampGlobeTheta(value: number): number {
  return Math.min(Math.max(value, -0.65), 0.65)
}

/** 再次抓取时从当前可见角度接手，丢弃上一轮惯性与尚未追上的目标。 */
export function beginGlobeDrag(state: GlobeMotionState) {
  state.targetPhi = state.phi
  state.targetTheta = state.theta
  state.velocityPhi = 0
  state.velocityTheta = 0
  state.autoVelocity = 0
}

export function moveGlobeDrag(
  state: GlobeMotionState,
  deltaX: number,
  deltaY: number,
  elapsedMs: number,
  diameter: number,
) {
  const elapsed = Math.max(1, elapsedMs)
  const size = Math.max(1, diameter)
  const deltaPhi = (deltaX / size) * 1.8
  const deltaTheta = (deltaY / size) * 1.2
  const blend = 1 - Math.exp(-elapsed / 28)
  state.targetPhi += deltaPhi
  state.targetTheta = clampGlobeTheta(state.targetTheta + deltaTheta)
  state.velocityPhi += (deltaPhi / elapsed - state.velocityPhi) * blend
  state.velocityTheta += (deltaTheta / elapsed - state.velocityTheta) * blend
  state.velocityPhi = Math.max(-0.008, Math.min(0.008, state.velocityPhi))
  state.velocityTheta = Math.max(-0.008, Math.min(0.008, state.velocityTheta))
}

export function hasGlobeMotion(state: GlobeMotionState): boolean {
  return (
    Math.abs(state.targetPhi - state.phi) > ANGLE_EPSILON ||
    Math.abs(state.targetTheta - state.theta) > ANGLE_EPSILON ||
    Math.abs(state.velocityPhi) > VELOCITY_EPSILON ||
    Math.abs(state.velocityTheta) > VELOCITY_EPSILON
  )
}

export function advanceGlobeMotion(
  state: GlobeMotionState,
  timestamp: number,
  dragging: boolean,
  autoRotate: boolean,
  reducedMotion: boolean,
): boolean {
  const elapsed = state.lastFrameTime === null ? 0 : Math.min(50, Math.max(0, timestamp - state.lastFrameTime))
  state.lastFrameTime = timestamp
  const previousPhi = state.phi
  const previousTheta = state.theta

  if (!dragging && !reducedMotion) {
    const decay = Math.exp(-elapsed / INERTIA_TIME_MS)
    state.targetPhi += state.velocityPhi * INERTIA_TIME_MS * (1 - decay)
    state.targetTheta = clampGlobeTheta(state.targetTheta + state.velocityTheta * INERTIA_TIME_MS * (1 - decay))
    state.velocityPhi *= decay
    state.velocityTheta *= decay
    if (Math.abs(state.velocityPhi) < VELOCITY_EPSILON) state.velocityPhi = 0
    if (Math.abs(state.velocityTheta) < VELOCITY_EPSILON) state.velocityTheta = 0
    if (autoRotate) {
      const resume = Math.exp(-elapsed / AUTO_RESUME_MS)
      // 精确积分逐渐恢复的自转速度，60Hz / 120Hz 的总转角一致。
      state.targetPhi +=
        AUTO_ROTATION_PER_MS * elapsed + (state.autoVelocity - AUTO_ROTATION_PER_MS) * AUTO_RESUME_MS * (1 - resume)
      state.autoVelocity = AUTO_ROTATION_PER_MS + (state.autoVelocity - AUTO_ROTATION_PER_MS) * resume
    } else state.autoVelocity = 0
  } else state.autoVelocity = 0

  const blend = reducedMotion ? 1 : 1 - Math.exp(-elapsed / (dragging ? 22 : 60))
  state.phi += (state.targetPhi - state.phi) * blend
  state.theta += (state.targetTheta - state.theta) * blend
  if (Math.abs(state.targetPhi - state.phi) < ANGLE_EPSILON) state.phi = state.targetPhi
  if (Math.abs(state.targetTheta - state.theta) < ANGLE_EPSILON) state.theta = state.targetTheta
  if (reducedMotion) {
    state.velocityPhi = 0
    state.velocityTheta = 0
  }
  return Math.abs(state.phi - previousPhi) > ANGLE_EPSILON || Math.abs(state.theta - previousTheta) > ANGLE_EPSILON
}
