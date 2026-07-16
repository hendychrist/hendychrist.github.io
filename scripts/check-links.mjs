import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..'
);
const ignoredDirectories = new Set(['.git', 'node_modules']);
const errors = [];
const counts = {
	htmlFiles: 0,
	cssFiles: 0,
	moduleFiles: 0,
	references: 0
};
const parallaxFrameRoot = path.join(
	repositoryRoot,
	'assets',
	'parallax-1080-30fps-frame',
	'webp'
);
const parallaxFrameCount = 306;

function displayPath(filePath) {
	const relativePath = path.relative(repositoryRoot, filePath);
	return relativePath === '' ? '.' : relativePath.split(path.sep).join('/');
}

async function collectFiles(directory, extension) {
	const files = [];
	const entries = await readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory() && ignoredDirectories.has(entry.name))
			continue;

		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory())
			files.push(...await collectFiles(entryPath, extension));
		else if (entry.isFile() && entry.name.endsWith(extension))
			files.push(entryPath);
	}

	return files;
}

function localReference(reference) {
	const trimmedReference = reference.trim();

	if (
		trimmedReference === ''
		|| trimmedReference.startsWith('#')
		|| trimmedReference.startsWith('//')
		|| /^[a-z][a-z\d+.-]*:/i.test(trimmedReference)
	)
		return null;

	const pathOnly = trimmedReference.split(/[?#]/, 1)[0];

	if (pathOnly === '')
		return null;

	try {
		return decodeURIComponent(pathOnly);
	} catch {
		return pathOnly;
	}
}

async function inspectExactPath(targetPath) {
	const relativePath = path.relative(repositoryRoot, targetPath);

	if (relativePath.startsWith(`..${path.sep}`) || relativePath === '..' || path.isAbsolute(relativePath)) {
		return {
			ok: false,
			reason: 'resolves outside the repository'
		};
	}

	let currentPath = repositoryRoot;
	const segments = relativePath === '' ? [] : relativePath.split(path.sep);

	for (const segment of segments) {
		let entries;

		try {
			entries = await readdir(currentPath, { withFileTypes: true });
		} catch {
			return {
				ok: false,
				reason: `parent directory does not exist: ${displayPath(currentPath)}`
			};
		}

		const exactEntry = entries.find((entry) => entry.name === segment);

		if (!exactEntry) {
			const caseInsensitiveEntry = entries.find(
				(entry) => entry.name.toLowerCase() === segment.toLowerCase()
			);

			if (caseInsensitiveEntry) {
				return {
					ok: false,
					reason: `case mismatch: "${segment}" should be "${caseInsensitiveEntry.name}"`
				};
			}

			return {
				ok: false,
				reason: `path does not exist at ${displayPath(path.join(currentPath, segment))}`
			};
		}

		currentPath = path.join(currentPath, exactEntry.name);
	}

	let targetStats;

	try {
		targetStats = await stat(currentPath);
	} catch {
		return {
			ok: false,
			reason: `path does not exist at ${displayPath(currentPath)}`
		};

	}

	if (targetStats.isDirectory())
		return inspectExactPath(path.join(currentPath, 'index.html'));

	return { ok: true, resolvedPath: currentPath };
}

async function checkReference(sourcePath, reference, type) {
	const referencePath = localReference(reference);

	if (referencePath === null)
		return null;

	counts.references += 1;

	const targetPath = referencePath.startsWith('/')
		? path.resolve(repositoryRoot, `.${referencePath}`)
		: path.resolve(path.dirname(sourcePath), referencePath);
	const result = await inspectExactPath(targetPath);

	if (!result.ok) {
		errors.push({
			source: displayPath(sourcePath),
			reference: reference.trim(),
			resolved: displayPath(targetPath),
			type,
			reason: result.reason
		});
		return null;
	}

	return result.resolvedPath;
}

async function checkHtmlFiles() {
	const htmlFiles = await collectFiles(repositoryRoot, '.html');
	const attributePattern = /\b(?:href|src|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

	counts.htmlFiles = htmlFiles.length;

	for (const htmlFile of htmlFiles) {
		const html = (await readFile(htmlFile, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');

		for (const match of html.matchAll(attributePattern)) {
			const reference = match[1] ?? match[2] ?? match[3] ?? '';
			await checkReference(htmlFile, reference, 'HTML');
		}
	}
}

async function checkCssFiles() {
	const cssDirectory = path.join(repositoryRoot, 'assets', 'css');
	const cssFiles = await collectFiles(cssDirectory, '.css');
	const importPattern = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)'";]+))/gi;
	const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;

	counts.cssFiles = cssFiles.length;

	for (const cssFile of cssFiles) {
		const css = (await readFile(cssFile, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
		const references = new Set();

		for (const match of css.matchAll(importPattern))
			references.add(match[1] ?? match[2] ?? match[3] ?? '');

		for (const match of css.matchAll(urlPattern))
			references.add(match[1] ?? match[2] ?? match[3] ?? '');

		for (const reference of references)
			await checkReference(cssFile, reference, 'CSS');
	}
}

async function checkModuleGraph() {
	const entryPoint = path.join(repositoryRoot, 'assets', 'js', 'app.js');
	const pendingModules = [entryPoint];
	const visitedModules = new Set();
	const staticImportPattern = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?(["'])([^"']+)\1/g;
	const dynamicImportPattern = /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g;

	while (pendingModules.length > 0) {
		const modulePath = pendingModules.shift();

		if (visitedModules.has(modulePath))
			continue;

		visitedModules.add(modulePath);
		const source = await readFile(modulePath, 'utf8');
		const imports = [];

		for (const match of source.matchAll(staticImportPattern))
			imports.push(match[2]);

		for (const match of source.matchAll(dynamicImportPattern))
			imports.push(match[2]);

		for (const importedModule of imports) {
			if (!importedModule.startsWith('.') && !importedModule.startsWith('/'))
				continue;

			const resolvedModule = await checkReference(modulePath, importedModule, 'ES module');

			if (resolvedModule !== null && !visitedModules.has(resolvedModule))
				pendingModules.push(resolvedModule);
		}
	}

	counts.moduleFiles = visitedModules.size;
}

async function checkParallaxFrames() {
	for (let frame = 0; frame < parallaxFrameCount; frame += 1) {
		const filename = `frame${String(frame).padStart(3, '0')}.webp`;
		const framePath = path.join(parallaxFrameRoot, filename);
		const result = await inspectExactPath(framePath);

		if (!result.ok) {
			errors.push({
				source: '1080p 30 fps parallax frame sequence',
				reference: filename,
				resolved: displayPath(framePath),
				type: 'Parallax frame',
				reason: result.reason
			});
			continue;
		}

		const frameStats = await stat(result.resolvedPath);

		if (frameStats.size === 0) {
			errors.push({
				source: '1080p 30 fps parallax frame sequence',
				reference: filename,
				resolved: displayPath(framePath),
				type: 'Parallax frame',
				reason: 'file is empty'
			});
		}
	}
}

await Promise.all([
	checkHtmlFiles(),
	checkCssFiles(),
	checkModuleGraph(),
	checkParallaxFrames()
]);

if (errors.length > 0) {
	console.error(`Found ${errors.length} broken local reference${errors.length === 1 ? '' : 's'}:\n`);

	for (const error of errors) {
		console.error(`[${error.type}] ${error.source}`);
		console.error(`  reference: ${error.reference}`);
		console.error(`  resolved:  ${error.resolved}`);
		console.error(`  problem:   ${error.reason}\n`);
	}

	process.exitCode = 1;
} else {
	console.log(
		`Link check passed: ${counts.references} local references across `
		+ `${counts.htmlFiles} HTML files, ${counts.cssFiles} CSS files, and `
		+ `${counts.moduleFiles} ES modules; all ${parallaxFrameCount} parallax frames `
		+ `are present and non-empty in the committed WebP sequence.`
	);
}
