// Search and replace patterns
const replacements = [
  {
    // Find logger.info calls
    search: /logger\.info\(\s*['"`](.*?)['"`]\s*(?:,\s*([^)]*))?\s*\)/g,
    replace: (match, message, params) => {
      if (params) {
        return `console.log(\`[INFO] \${new Date().toISOString()} - ${message}\`, ${params})`;
      } else {
        return `console.log(\`[INFO] \${new Date().toISOString()} - ${message}\`)`;
      }
    }
  },
  {
    // Find logger.error calls
    search: /logger\.error\(\s*['"`](.*?)['"`]\s*(?:,\s*([^,)]*)\s*(?:,\s*([^)]*))?)?\s*\)/g,
    replace: (match, message, error, params) => {
      if (error && params) {
        return `console.error(\`[ERROR] \${new Date().toISOString()} - ${message}\`, ${error}, ${params})`;
      } else if (error) {
        return `console.error(\`[ERROR] \${new Date().toISOString()} - ${message}\`, ${error})`;
      } else {
        return `console.error(\`[ERROR] \${new Date().toISOString()} - ${message}\`)`;
      }
    }
  },
  {
    // Find logger.debug calls
    search: /logger\.debug\(\s*['"`](.*?)['"`]\s*(?:,\s*([^)]*))?\s*\)/g,
    replace: (match, message, params) => {
      if (params) {
        return `console.log(\`[DEBUG] \${new Date().toISOString()} - ${message}\`, ${params})`;
      } else {
        return `console.log(\`[DEBUG] \${new Date().toISOString()} - ${message}\`)`;
      }
    }
  },
  {
    // Find logger.warn calls
    search: /logger\.warn\(\s*['"`](.*?)['"`]\s*(?:,\s*([^)]*))?\s*\)/g,
    replace: (match, message, params) => {
      if (params) {
        return `console.warn(\`[WARN] \${new Date().toISOString()} - ${message}\`, ${params})`;
      } else {
        return `console.warn(\`[WARN] \${new Date().toISOString()} - ${message}\`)`;
      }
    }
  }
];

// To use:
// 1. Replace the file content variable with your actual file content
// 2. Run the replacements
// 3. Output the modified content

let fileContent = `
function example() {
  logger.info('This is an info message', { someData: 123 });
  logger.error('This is an error message', new Error('Test error'), { additionalInfo: 'test' });
  logger.debug('This is a debug message');
  logger.warn('This is a warning message', { warnData: true });
}
`;

// Apply all replacements
replacements.forEach(({ search, replace }) => {
  fileContent = fileContent.replace(search, replace);
});

console.log(fileContent);