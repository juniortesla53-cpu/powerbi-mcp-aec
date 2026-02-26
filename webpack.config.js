//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration[]} */
const config = [
  // VS Code Extension entry
  {
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      vscode: 'commonjs vscode',
      keytar: 'commonjs keytar'
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [{ loader: 'ts-loader' }]
        }
      ]
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: { level: 'log' }
  },
  // Standalone MCP Server entry
  {
    target: 'node',
    mode: 'none',
    entry: './src/server/mcpServer.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'mcpServer.js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      keytar: 'commonjs keytar'
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [{ loader: 'ts-loader' }]
        }
      ]
    },
    devtool: 'nosources-source-map'
  }
];

module.exports = config;
