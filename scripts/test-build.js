#!/usr/bin/env node
// Simple test script to verify the library build
const fs = require("fs");
const path = require("path");

console.log("🤖 Testing Cadbury Library Build...\n");

// Check if lib directory exists
const libPath = path.join(__dirname, "..", "lib");
if (!fs.existsSync(libPath)) {
  console.error("❌ lib/ directory not found. Run npm run build first.");
  process.exit(1);
}

// Check for essential files
const requiredFiles = [
  "index.js",
  "index.d.ts",
  "cadbury.js",
  "cadbury.d.ts",
  "graph.js",
  "graph.d.ts",
  "agent.js",
  "agent.d.ts",
  "tools.js",
  "tools.d.ts",
  "state.js",
  "state.d.ts",
  "types.js",
  "types.d.ts",
];

let allFilesExist = true;
requiredFiles.forEach((file) => {
  const filePath = path.join(libPath, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (allFilesExist) {
  console.log("\n✅ All required files are present!");
  console.log("📦 Library is ready for publishing");

  // Try to require the main module
  try {
    const cadbury = require("../lib/index.js");
    const exports = Object.keys(cadbury);
    console.log("\n📚 Available exports:");
    exports.forEach((exp) => console.log(`  - ${exp}`));

    console.log("\n🎉 Library structure validation successful!");
    console.log("💡 To test with real API keys, use: npm run dev");
  } catch (error) {
    console.error("\n❌ Error loading library:", error.message);
    process.exit(1);
  }
} else {
  console.log("\n❌ Some files are missing. Check the build process.");
  process.exit(1);
}
