import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import obfuscator from "vite-plugin-javascript-obfuscator"

export default defineConfig({
  plugins: [
    react(),

    obfuscator({
      apply: "build",
      options: {
        compact: true,

        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,

        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,

        debugProtection: true,
        debugProtectionInterval: 2000,

        disableConsoleOutput: true,

        identifierNamesGenerator: "hexadecimal",

        numbersToExpressions: true,

        renameGlobals: false,

        selfDefending: true,

        simplify: true,

        splitStrings: true,
        splitStringsChunkLength: 4,

        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.75,

        stringArrayRotate: true,
        stringArrayShuffle: true,

        transformObjectKeys: true
      }
    })
  ],

  build: {
    sourcemap: false,
    minify: "terser",

    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 3
      },
      mangle: {
        toplevel: true
      }
    }
  }
})