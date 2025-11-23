import * as path from 'node:path';
import * as fs from 'node:fs';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { initRegistry } from './registry';

interface PackageJson {
	name: string;
	version: string;
	description: string;
	author: string;
	homepage: string;
	license: string;
}

function loadPackageJson(): PackageJson {
	const packagePath = path.resolve(process.cwd(), './package.json');
	const packageContent = fs.readFileSync(packagePath, 'utf-8');
	return JSON.parse(packageContent) as PackageJson;
}

export async function generateOpenApiSpec(): Promise<
	ReturnType<typeof OpenApiGeneratorV3.prototype.generateDocument>
> {
	const pkg = loadPackageJson();
	const generator = new OpenApiGeneratorV3((await initRegistry()).definitions);

	return generator.generateDocument({
		openapi: '3.0.0',
		info: {
			version: pkg.version,
			title: pkg.name,
			description: pkg.description,
			contact: {
				name: pkg.author,
				url: pkg.homepage
			},
			license: {
				name: pkg.license
			}
		},
		servers: [
			{
				url: 'http://localhost:8082/',
				description: 'Local development server'
			}
		]
	});
}
