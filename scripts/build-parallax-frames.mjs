import { execFile } from 'node:child_process';
import {
	mkdir,
	rename,
	rm,
	stat
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const sourceDirectory = path.join(
	repositoryRoot,
	'assets',
	'parallax-1080-30fps-frame'
);
const outputDirectory = path.join(sourceDirectory, 'webp');
const cwebpBinary = 'cwebp';
const frameCount = 306;
const maxParallelConversions = 4;
const outputWidth = 1920;
const outputHeight = 1080;
const outputQuality = 82;

function relativePath(filePath) {
	return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function sourceBasename(frame) {
	return `hvec${String(frame).padStart(3, '0')}`;
}

function outputBasename(frame) {
	return `frame${String(frame).padStart(3, '0')}`;
}

async function requireCwebp() {
	try {
		await execFileAsync(cwebpBinary, ['-version']);
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error(
				'cwebp was not found in PATH. Install the WebP command-line tools '
				+ 'before running `pnpm run build:parallax`.'
			);
		}

		throw new Error(
			`Unable to run cwebp: ${error.stderr?.trim() || error.message}`
		);
	}
}

async function collectSourceFrames() {
	try {
		const directoryStats = await stat(sourceDirectory);

		if (!directoryStats.isDirectory())
			throw new Error('the source path exists but is not a directory');
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error(
				`Parallax source directory is missing: ${relativePath(sourceDirectory)}`
			);
		}

		throw new Error(
			`Cannot read ${relativePath(sourceDirectory)}: ${error.message}`
		);
	}

	const sources = await Promise.all(
		Array.from({ length: frameCount }, async (_, frame) => {
			const sourcePath = path.join(sourceDirectory, `${sourceBasename(frame)}.jpg`);

			try {
				const sourceStats = await stat(sourcePath);

				return sourceStats.isFile()
					? { frame, sourcePath, sourceStats }
					: { frame, sourcePath, sourceStats: null };
			} catch (error) {
				if (error.code === 'ENOENT')
					return { frame, sourcePath, sourceStats: null };

				throw error;
			}
		})
	);
	const missingSources = sources.filter(({ sourceStats }) => sourceStats === null);

	if (missingSources.length > 0) {
		const preview = missingSources
			.slice(0, 20)
			.map(({ sourcePath }) => relativePath(sourcePath))
			.join(', ');
		const remainder = missingSources.length > 20
			? `, and ${missingSources.length - 20} more`
			: '';

		throw new Error(
			`Missing ${missingSources.length} of ${frameCount} required parallax source frames. `
			+ `Expected hvec000.jpg through hvec305.jpg. Missing: ${preview}${remainder}`
		);
	}

	return sources;
}

async function outputIsCurrent(outputPath, sourceStats, scriptStats) {
	try {
		const outputStats = await stat(outputPath);

		return outputStats.isFile()
			&& outputStats.size > 0
			&& outputStats.mtimeMs >= Math.max(sourceStats.mtimeMs, scriptStats.mtimeMs);
	} catch (error) {
		if (error.code === 'ENOENT')
			return false;

		throw error;
	}
}

async function createJobs(sources) {
	const jobs = [];
	let skipped = 0;
	const scriptStats = await stat(scriptPath);

	await mkdir(outputDirectory, { recursive: true });

	for (const source of sources) {
		const outputPath = path.join(
			outputDirectory,
			`${outputBasename(source.frame)}.webp`
		);

		if (await outputIsCurrent(outputPath, source.sourceStats, scriptStats)) {
			skipped += 1;
			continue;
		}

		jobs.push({ ...source, outputPath });
	}

	return { jobs, skipped };
}

async function convertFrame({ sourcePath, outputPath }) {
	const temporaryOutputPath = `${outputPath}.${process.pid}.tmp`;

	try {
		await execFileAsync(
			cwebpBinary,
			[
				'-quiet',
				'-mt',
				'-q', String(outputQuality),
				'-resize', String(outputWidth), String(outputHeight),
				sourcePath,
				'-o', temporaryOutputPath
			],
			{ maxBuffer: 1024 * 1024 }
		);
		await rename(temporaryOutputPath, outputPath);
	} catch (error) {
		await rm(temporaryOutputPath, { force: true });
		throw new Error(
			`Failed to build ${relativePath(outputPath)} from ${relativePath(sourcePath)}: `
			+ `${error.stderr?.trim() || error.message}`
		);
	}
}

async function runWorkers(jobs) {
	let converted = 0;
	let nextJob = 0;
	let firstError = null;

	async function worker() {
		while (firstError === null) {
			const jobIndex = nextJob;
			nextJob += 1;

			if (jobIndex >= jobs.length)
				return;

			try {
				await convertFrame(jobs[jobIndex]);
				converted += 1;
			} catch (error) {
				firstError ??= error;
			}
		}
	}

	await Promise.all(
		Array.from(
			{ length: Math.min(maxParallelConversions, jobs.length) },
			() => worker()
		)
	);

	if (firstError !== null)
		throw firstError;

	return converted;
}

async function main() {
	await requireCwebp();
	const sources = await collectSourceFrames();
	const { jobs, skipped } = await createJobs(sources);
	const converted = await runWorkers(jobs);

	console.log(
		`1080p WebP: converted ${converted}, skipped ${skipped} up-to-date frame(s).`
	);
	console.log(
		`Parallax build complete: ${frameCount} frames at ${outputWidth}x${outputHeight}, quality ${outputQuality}.`
	);
}

main().catch((error) => {
	console.error(`Parallax build failed: ${error.message}`);
	process.exitCode = 1;
});
