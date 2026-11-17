import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// main.css 的 @theme 自定义字号；不注册时 tailwind-merge 会把 text-value 等当成颜色，被后面的颜色类覆盖掉
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['3xs', '2xs', 'compact', 'value', 'stat', 'display'] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
