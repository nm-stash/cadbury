# 🎭 Cadbury Web Automation - Usage Examples

This document provides comprehensive examples of using Cadbury's web automation capabilities.

## Basic Setup

```typescript
import { createCadburyButler, runWorkflow } from "@nm-stash/cadbury";

const butler = await createCadburyButler({
  openaiApiKey: "your-openai-api-key",
  webAutomation: {
    headless: false, // Set to true for production
    timeout: 10000,
    slowMo: 500, // Slow down for debugging
  },
});
```

## Web Automation Examples

### 1. Basic Navigation

```typescript
const response = await runWorkflow(
  butler,
  "Navigate to example.com and tell me the main heading"
);
```

### 2. Form Filling

```typescript
const response = await runWorkflow(
  butler,
  "Go to httpbin.org/forms/post and fill out the form with name 'John Doe' and email 'john@example.com'"
);
```

### 3. Data Extraction

```typescript
const response = await runWorkflow(
  butler,
  "Navigate to news.ycombinator.com and extract the titles of the first 5 articles"
);
```

### 4. Search Workflow

```typescript
const response = await runWorkflow(
  butler,
  "Go to google.com, search for 'web automation tools', and summarize the first result"
);
```

### 5. E-commerce Tasks

```typescript
const response = await runWorkflow(
  butler,
  "Go to amazon.com, search for 'wireless headphones', and tell me about the first product"
);
```

### 6. Multi-step Process

```typescript
const response = await runWorkflow(
  butler,
  "Go to github.com, search for 'langchain', click on the first repository, and tell me about the project"
);
```

## Available Web Actions

The web automation agent can perform these actions:

- **navigate**: Go to any URL
- **click**: Click buttons, links, or elements
- **type**: Enter text into input fields
- **extract**: Get text, HTML, or attributes from elements
- **scroll**: Scroll the page or to specific elements
- **wait**: Pause execution for a specified time
- **screenshot**: Take a screenshot of the page
- **get_page_info**: Analyze page structure (forms, links, buttons)

## Configuration Options

```typescript
interface WebAutomationConfig {
  headless?: boolean; // Run browser in headless mode (default: true)
  viewport?: {
    // Browser viewport size
    width: number;
    height: number;
  };
  userAgent?: string; // Custom user agent
  timeout?: number; // Page load timeout in ms (default: 30000)
  slowMo?: number; // Slow down actions for debugging (default: 0)
  devtools?: boolean; // Open browser devtools (default: false)
}
```

## Best Practices

### 1. Always Start with Navigation

```typescript
"Navigate to example.com and then click the login button";
```

### 2. Use Descriptive Selectors

```typescript
"Click the 'Sign In' button"; // ✅ Good
"Click #btn-123"; // ❌ Fragile
```

### 3. Handle Errors Gracefully

```typescript
"Try to click the submit button, if it's not found, look for a 'Send' button instead";
```

### 4. Wait for Content

```typescript
"Navigate to the page, wait for it to load, then extract the data";
```

### 5. Confirm Sensitive Actions

```typescript
"Fill out the form but don't submit it yet - ask me to confirm first";
```

## Common Use Cases

### Contact Form Automation

```typescript
const response = await runWorkflow(
  butler,
  `Navigate to company.com/contact and fill out the form with:
   - Name: John Smith
   - Email: john@example.com
   - Message: Hello, I'm interested in your services
   Don't submit yet, just fill the fields`
);
```

### Product Research

```typescript
const response = await runWorkflow(
  butler,
  "Go to bestbuy.com, search for 'laptop', and compare the prices of the first 3 results"
);
```

### Social Media Automation

```typescript
const response = await runWorkflow(
  butler,
  "Go to twitter.com, search for #AI, and summarize the top 3 tweets"
);
```

### Data Collection

```typescript
const response = await runWorkflow(
  butler,
  "Navigate to weather.com, search for New York weather, and extract the current temperature and conditions"
);
```

## Troubleshooting

### Common Issues

1. **Element Not Found**: Use more descriptive selectors or wait for the page to load
2. **Timeout Errors**: Increase the timeout value in configuration
3. **Navigation Issues**: Ensure the URL is correct and accessible

### Debug Mode

```typescript
const butler = await createCadburyButler({
  openaiApiKey: "your-key",
  webAutomation: {
    headless: false, // Show browser
    slowMo: 1000, // Slow down actions
    devtools: true, // Open dev tools
  },
});
```

## Security Considerations

- Never hardcode sensitive credentials
- Use environment variables for API keys
- Be cautious with form submissions
- Respect website terms of service
- Consider rate limiting for automated requests

## Advanced Example: Multi-Step E-commerce Workflow

```typescript
const response = await runWorkflow(
  butler,
  `I want to research laptops on Amazon:
   1. Navigate to amazon.com
   2. Search for "gaming laptop under $1000"
   3. Look at the first 3 results
   4. For each laptop, extract:
      - Name
      - Price
      - Rating
      - Key specifications
   5. Summarize the findings in a comparison table
   
   Don't make any purchases, just gather information.`
);
```

This comprehensive web automation capability makes Cadbury a powerful tool for automating web-based tasks while maintaining user control and transparency.
