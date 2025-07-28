#!/usr/bin/env node

// Simple test to verify the build works
const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const mainFile = path.join(libDir, 'index.js');
const typesFile = path.join(libDir, 'index.d.ts');

console.log('Testing build output...');

// Check if lib directory exists
if (!fs.existsSync(libDir)) {
  console.error('❌ lib directory not found');
  process.exit(1);
}

// Check if main file exists
if (!fs.existsSync(mainFile)) {
  console.error('❌ Main file (lib/index.js) not found');
  process.exit(1);
}

// Check if types file exists
if (!fs.existsSync(typesFile)) {
  console.error('❌ Types file (lib/index.d.ts) not found');
  process.exit(1);
}

// Try to require the main file
try {
  const lib = require(mainFile);
  console.log('✅ Main file can be required');
  
  // Check if main functions are exported
  if (lib.createCadburyButler) {
    console.log('✅ createCadburyButler function is exported');
  } else {
    console.warn('⚠️  createCadburyButler function not found in exports');
  }
  
  if (lib.chatWithCadbury) {
    console.log('✅ chatWithCadbury function is exported');
  } else {
    console.warn('⚠️  chatWithCadbury function not found in exports');
  }
  
  console.log('✅ Build test passed!');
} catch (error) {
  console.error('❌ Error requiring main file:', error.message);
  process.exit(1);
}
