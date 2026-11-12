import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { zipSync } from 'fflate'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { version: string }

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

function collectFiles(dir: string, zipPrefix: string, files: Record<string, Uint8Array>): void {
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name)
    if (statSync(fullPath).isDirectory()) collectFiles(fullPath, `${zipPrefix}/${name}`, files)
    else files[`${zipPrefix}/${name}`] = readFileSync(fullPath)
  }
}

/**
 * Vite 插件：构建后打包 Komari 主题 Zip
 * theme.zip
 * ├── komari-theme.json
 * ├── preview.png
 * └── dist/
 */
function komariThemeZip(): Plugin {
  return {
    name: 'komari-theme-zip',
    apply: 'build',
    closeBundle() {
      const distDir = resolve(rootDir, 'dist')
      if (!existsSync(distDir)) {
        console.log('[komari-theme-zip] dist directory not found, skipping zip creation')
        return
      }

      const files: Record<string, Uint8Array> = {}
      for (const [source, name] of [
        ['komari-theme.json', 'komari-theme.json'],
        ['docs/preview.png', 'preview.png'],
      ] as const) {
        const sourcePath = resolve(rootDir, source)
        if (existsSync(sourcePath)) files[name] = readFileSync(sourcePath)
      }
      collectFiles(distDir, 'dist', files)

      const zipFileName = `komari-theme-tundra-build-${getCommitHash()}.zip`
      const zip = zipSync(files, { level: 9 })
      writeFileSync(resolve(rootDir, zipFileName), zip)
      console.log(`[komari-theme-zip] Created ${zipFileName} (${(zip.byteLength / 1024 / 1024).toFixed(2)} MB)`)
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_GIT_HASH__: JSON.stringify(getCommitHash()),
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), komariThemeZip()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
  },
  build: {
    // echarts 按需引入后约 630 kB，只在打开图表时懒加载
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](?:react|react-dom|scheduler|react-router|zustand)[\\/]/ },
            { name: 'echarts', test: /node_modules[\\/](?:echarts|zrender)[\\/]/ },
            { name: 'radix-ui', test: /node_modules[\\/](?:radix-ui|@radix-ui)[\\/]/ },
          ],
        },
      },
    },
  },
})
