import { generateOpenApiSpec } from '../src/openapi/generator';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { logger } from '../src/helpers/logger';

generateOpenApiSpec().then(spec => {
	// Create dist/docs directory if it doesn't exist
	const docsDir = path.join(process.cwd(), './dist/docs');
	if (!fs.existsSync(docsDir)) {
		fs.mkdirSync(docsDir, { recursive: true });
	}

	// Save as YAML
	const yamlSpec = YAML.stringify(spec);
	fs.writeFileSync(path.join(docsDir, 'openapi.yaml'), yamlSpec);

	// Save as JSON
	fs.writeFileSync(
		path.join(docsDir, 'openapi.json'),
		JSON.stringify(spec, null, 2)
	);

	// Generate Swagger UI HTML
	const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jodit AI Adapter API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: './openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: 'StandaloneLayout'
      });
    };
  </script>
</body>
</html>`;

	fs.writeFileSync(path.join(docsDir, 'index.html'), swaggerHtml);

	logger.info('✅ OpenAPI documentation generated:');
	logger.info('  - dist/docs/openapi.yaml');
	logger.info('  - dist/docs/openapi.json');
	logger.info('  - dist/docs/index.html (Swagger UI)');
	logger.info(
		'\n📖 Open dist/docs/index.html in your browser to view the API documentation'
	);
});
