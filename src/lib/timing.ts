/** 防抖：停止调用 wait 毫秒后执行最后一次 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, wait)
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return debounced
}

/** 节流：wait 毫秒内最多执行一次，末次调用在窗口结束时补执行 */
export function throttle<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Args | null = null
  const throttled = (...args: Args) => {
    const now = Date.now()
    const remaining = wait - (now - last)
    if (remaining <= 0) {
      last = now
      fn(...args)
      return
    }
    pending = args
    timer ??= setTimeout(() => {
      timer = null
      last = Date.now()
      if (pending) fn(...pending)
      pending = null
    }, remaining)
  }
  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  return throttled
}
