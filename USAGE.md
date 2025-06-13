# Cadbury Library Usage Guide

## Installation

```bash
npm install cadbury
```

## Basic Setup

```typescript
import { createCadburyButler, runWorkflow, CadburyConfig } from "cadbury";

const config: CadburyConfig = {
  openaiApiKey: "your-openai-api-key",
  tavilyApiKey: "your-tavily-api-key", // Optional
  modelName: "gpt-3.5-turbo",
  temperature: 0,
};
```
