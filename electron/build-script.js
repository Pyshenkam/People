/**
 * Electron Builder 打包脚本
 * 由 build-release.ps1 调用，通过 BUILD_OUTPUT_DIR 环境变量指定输出目录
 */
const builder = require("electron-builder");
const path = require("path");

const outputDir = process.env.BUILD_OUTPUT_DIR || path.join(__dirname, "release");

async function build() {
  console.log("[build-script] Output directory:", outputDir);

  await builder.build({
    config: {
      directories: {
        output: outputDir,
      },
    },
  });

  console.log("[build-script] Build complete!");
}

build().catch((err) => {
  console.error("[build-script] Build failed:", err);
  process.exit(1);
});
