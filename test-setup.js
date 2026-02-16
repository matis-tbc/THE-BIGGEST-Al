#!/usr/bin/env node

/**
 * Test script to verify Email Drafter setup
 * Run with: node test-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Email Drafter Setup Verification\n');

// Check if package.json exists
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  console.log('✅ package.json found');
} else {
  console.log('❌ package.json not found');
  process.exit(1);
}

// Check if electron/auth.ts exists and has placeholder
const authPath = path.join(__dirname, 'electron', 'auth.ts');
if (fs.existsSync(authPath)) {
  const authContent = fs.readFileSync(authPath, 'utf8');
  if (authContent.includes('YOUR_ACTUAL_CLIENT_ID_FROM_AZURE')) {
    console.log('⚠️  Client ID needs to be updated in electron/auth.ts');
    console.log('   Replace YOUR_ACTUAL_CLIENT_ID_FROM_AZURE with your Azure Client ID');
  } else if (authContent.includes('const CLIENT_ID =')) {
    console.log('✅ Client ID appears to be configured');
  }
} else {
  console.log('❌ electron/auth.ts not found');
}

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('✅ Dependencies installed');
} else {
  console.log('⚠️  Dependencies not installed. Run: npm install');
}

// Check if templates directory exists
const templatesPath = path.join(__dirname, 'templates');
if (fs.existsSync(templatesPath)) {
  console.log('✅ Templates directory exists');
} else {
  console.log('⚠️  Templates directory not found');
}

console.log('\n📋 Next Steps:');
console.log('1. Complete Azure App Registration setup');
console.log('2. Update CLIENT_ID in electron/auth.ts');
console.log('3. Run: npm install');
console.log('4. Run: npm run dev');
console.log('\n🎉 Ready to test Email Drafter!');
