const FRAME_COUNT = 306;
const LAST_FRAME = FRAME_COUNT - 1;
const FRAME_ROOT = 'assets/parallax-1080-30fps-frame/webp';
const SOURCE_WIDTH = 1920;
const SOURCE_HEIGHT = 1080;

// Decoded 1080p frames are roughly 8 MB each. Keep this deliberately small so
// scrolling the sequence does not create hundreds of megabytes of live bitmap
// data. The browser's HTTP cache can still make reverse scrolling inexpensive.
const MAX_CACHED_FRAMES = 10;
const MAX_CONCURRENT_LOADS = 4;
const LOOK_AHEAD = 5;
const LOOK_BEHIND = 2;
const MAX_CANVAS_PIXEL_RATIO = 1.25;
const EXIT_FADE_START = 2 / 3;

function frameUrl(index) {
	return `${FRAME_ROOT}/frame${String(index).padStart(3, '0')}.webp`;
}

function clampFrame(index) {
	return Math.min(LAST_FRAME, Math.max(0, index));
}

function drawableWidth(drawable) {
	return drawable?.naturalWidth || drawable?.width || 0;
}

function drawableHeight(drawable) {
	return drawable?.naturalHeight || drawable?.height || 0;
}

function releaseDrawable(drawable) {
	if (typeof drawable?.close === 'function')
		drawable.close();
}

/**
 * Initializes the scroll-driven home-page frame sequence.
 *
 * @returns {boolean} Whether the animated sequence was enabled.
 */
export function initHeroSequence({ gsap, ScrollTrigger }) {
	const hero = document.querySelector('#intro.sequence-hero');
	const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

	if (!hero || !gsap || !ScrollTrigger || reduceMotion)
		return false;

	const stage = hero.querySelector('.sequence-hero__stage');
	const canvas = hero.querySelector('.sequence-hero__canvas');
	const content = hero.querySelector('.sequence-hero__content');
	const exitVeil = hero.querySelector('.sequence-hero__exit');
	const panels = content?.querySelectorAll('[data-hero-panel]');
	const introPanel = content?.querySelector('[data-hero-panel="intro"]');
	const capabilitiesPanel = content?.querySelector('[data-hero-panel="capabilities"]');
	const disciplinesPanel = content?.querySelector('[data-hero-panel="disciplines"]');
	const context = canvas?.getContext('2d', {
		alpha: false,
		desynchronized: true
	});

	if (
		!stage
		|| !canvas
		|| !context
		|| !content
		|| !panels
		|| panels.length !== 3
		|| !introPanel
		|| !capabilitiesPanel
		|| !disciplinesPanel
	)
		return false;

	const cache = new Map();
	const pending = new Map();
	const failed = new Set();
	let queue = [];
	let queued = new Set();
	let activeLoads = 0;
	let requestedFrame = 0;
	let renderedFrame = -1;
	let scrollDirection = 1;
	let renderFrameRequest = 0;
	let resizeFrameRequest = 0;
	let redrawRequired = true;

	gsap.registerPlugin(ScrollTrigger);
	document.documentElement.classList.add('hero-sequence-active');
	hero.dataset.sequenceTier = '1080-30fps';
	gsap.set(panels, {
		autoAlpha: 0,
		y: 28
	});
	gsap.set(introPanel, {
		autoAlpha: 1,
		y: 0
	});

	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';

	function nearestCachedFrame(target) {
		if (cache.has(target))
			return target;

		let nearest = -1;
		let nearestDistance = Infinity;

		for (const index of cache.keys()) {
			const distance = Math.abs(index - target);
			const isStableTie = distance === nearestDistance && index === renderedFrame;
			const isDirectionalTie = distance === nearestDistance
				&& scrollDirection > 0
				&& index < target;
			const isReverseTie = distance === nearestDistance
				&& scrollDirection < 0
				&& index > target;

			if (distance < nearestDistance || isStableTie || isDirectionalTie || isReverseTie) {
				nearest = index;
				nearestDistance = distance;
			}
		}

		return nearest;
	}

	function evictDistantFrames() {
		while (cache.size > MAX_CACHED_FRAMES) {
			let evictionCandidate = -1;
			let greatestDistance = -1;

			for (const index of cache.keys()) {
				if (index === renderedFrame)
					continue;

				const distance = Math.abs(index - requestedFrame);
				if (distance > greatestDistance) {
					evictionCandidate = index;
					greatestDistance = distance;
				}
			}

			if (evictionCandidate < 0)
				break;

			const drawable = cache.get(evictionCandidate);
			cache.delete(evictionCandidate);
			releaseDrawable(drawable);
		}
	}

	function drawRequestedFrame() {
		renderFrameRequest = 0;
		const index = nearestCachedFrame(requestedFrame);

		if (index < 0 || (index === renderedFrame && !redrawRequired))
			return;

		const drawable = cache.get(index);
		const sourceWidth = drawableWidth(drawable);
		const sourceHeight = drawableHeight(drawable);
		if (!sourceWidth || !sourceHeight)
			return;

		const scale = Math.max(
			canvas.width / sourceWidth,
			canvas.height / sourceHeight
		);
		const width = sourceWidth * scale;
		const height = sourceHeight * scale;

		context.drawImage(
			drawable,
			(canvas.width - width) / 2,
			(canvas.height - height) / 2,
			width,
			height
		);
		canvas.classList.add('is-ready');
		renderedFrame = index;
		redrawRequired = false;
		evictDistantFrames();
	}

	function scheduleRender() {
		if (renderFrameRequest)
			return;

		renderFrameRequest = window.requestAnimationFrame(drawRequestedFrame);
	}

	function resizeCanvas() {
		const width = Math.max(stage.clientWidth, 1);
		const height = Math.max(stage.clientHeight, 1);
		const desiredPixelRatio = Math.max(window.devicePixelRatio || 1, 1);
		const pixelRatio = Math.max(0.25, Math.min(
			desiredPixelRatio,
			MAX_CANVAS_PIXEL_RATIO,
			SOURCE_WIDTH / width,
			SOURCE_HEIGHT / height
		));
		const canvasWidth = Math.max(1, Math.round(width * pixelRatio));
		const canvasHeight = Math.max(1, Math.round(height * pixelRatio));

		if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = 'high';
			redrawRequired = true;
		}

		scheduleRender();
	}

	function completeLoad(index, record, drawable, outcome) {
		if (pending.get(index) !== record) {
			releaseDrawable(drawable);
			return;
		}

		pending.delete(index);
		activeLoads -= 1;

		if (outcome === 'success') {
			cache.set(index, drawable);
			evictDistantFrames();
			scheduleRender();
		} else if (outcome === 'failed') {
			failed.add(index);
		}

		pumpQueue();
	}

	function loadWithImage(index, record) {
		if (pending.get(index) !== record)
			return;

		const image = new Image();
		record.image = image;
		image.decoding = 'async';
		image.fetchPriority = index === requestedFrame ? 'high' : 'auto';

		image.onload = () => {
			const finish = () => completeLoad(index, record, image, 'success');
			if (typeof image.decode !== 'function') {
				finish();
				return;
			}

			image.decode().catch(() => undefined).then(finish);
		};
		image.onerror = () => completeLoad(index, record, null, 'failed');
		image.src = frameUrl(index);
	}

	function startLoad(index) {
		activeLoads += 1;
		const record = {
			controller: null,
			image: null
		};
		pending.set(index, record);

		const canLoadBitmap = typeof window.fetch === 'function'
			&& typeof window.createImageBitmap === 'function'
			&& typeof window.AbortController === 'function';

		if (!canLoadBitmap) {
			loadWithImage(index, record);
			return;
		}

		record.controller = new AbortController();
		fetch(frameUrl(index), {
			cache: 'force-cache',
			signal: record.controller.signal
		})
			.then((response) => {
				if (!response.ok)
					throw new Error(`Frame request failed with ${response.status}`);

				return response.blob();
			})
			.then((blob) => window.createImageBitmap(blob))
			.then((bitmap) => completeLoad(index, record, bitmap, 'success'))
			.catch((error) => {
				if (pending.get(index) !== record)
					return;

				if (error?.name === 'AbortError') {
					completeLoad(index, record, null, 'aborted');
					return;
				}

				// Safari versions with partial ImageBitmap support can reject valid
				// WebP blobs. Fall back to the regular image decoder in that case.
				loadWithImage(index, record);
			});
	}

	function abortLoad(index) {
		const record = pending.get(index);
		if (!record)
			return;

		pending.delete(index);
		activeLoads -= 1;
		record.controller?.abort();
		if (record.image) {
			record.image.onload = null;
			record.image.onerror = null;
			record.image.src = '';
		}
	}

	function pumpQueue() {
		while (activeLoads < MAX_CONCURRENT_LOADS && queue.length > 0) {
			const index = queue.shift();
			queued.delete(index);

			if (cache.has(index) || pending.has(index) || failed.has(index))
				continue;

			startLoad(index);
		}
	}

	function prioritize(target) {
		const orderedFrames = [target];

		for (let distance = 1; distance <= LOOK_AHEAD; distance += 1)
			orderedFrames.push(target + (scrollDirection * distance));

		for (let distance = 1; distance <= LOOK_BEHIND; distance += 1)
			orderedFrames.push(target - (scrollDirection * distance));

		const wanted = new Set();
		for (const rawIndex of orderedFrames) {
			if (rawIndex >= 0 && rawIndex <= LAST_FRAME)
				wanted.add(rawIndex);
		}

		// Requests outside the current directional window cannot help the next
		// paint. Cancel them so a quick scrub or direction change is responsive.
		for (const index of pending.keys()) {
			if (!wanted.has(index))
				abortLoad(index);
		}

		// If all slots still contain nearby prefetches, make room for the exact
		// target instead of letting it wait behind speculative work.
		if (!cache.has(target)
			&& !pending.has(target)
			&& activeLoads >= MAX_CONCURRENT_LOADS) {
			let farthestIndex = -1;
			let farthestDistance = -1;
			for (const index of pending.keys()) {
				const distance = Math.abs(index - target);
				if (distance > farthestDistance) {
					farthestIndex = index;
					farthestDistance = distance;
				}
			}

			if (farthestIndex >= 0)
				abortLoad(farthestIndex);
		}

		queue = [];
		queued = new Set();
		for (const index of orderedFrames) {
			if (index < 0 || index > LAST_FRAME)
				continue;

			if (queued.has(index) || cache.has(index) || pending.has(index) || failed.has(index))
				continue;

			queued.add(index);
			queue.push(index);
		}

		pumpQueue();
	}

	function requestFrame(index) {
		const nextFrame = clampFrame(Math.round(index));
		if (nextFrame !== requestedFrame) {
			scrollDirection = nextFrame > requestedFrame ? 1 : -1;
			requestedFrame = nextFrame;
		}

		prioritize(requestedFrame);
		scheduleRender();
	}

	resizeCanvas();
	prioritize(0);

	const playhead = { frame: 0 };
	const sequenceTimeline = gsap.timeline({
		scrollTrigger: {
			trigger: hero,
			start: 'top top',
			end: '+=300%',
			pin: stage,
			scrub: 0.8,
			invalidateOnRefresh: true,
			onUpdate(self) {
				if (!exitVeil)
					return;

				const exitProgress = Math.max(0, Math.min(
					1,
					(self.progress - EXIT_FADE_START) / (1 - EXIT_FADE_START)
				));
				exitVeil.style.opacity = String(exitProgress);
			}
		}
	});

	sequenceTimeline
		.to(playhead, {
			duration: 1,
			ease: 'none',
			frame: LAST_FRAME,
			onUpdate() {
				requestFrame(playhead.frame);
			}
		}, 0)
		.to(introPanel, {
			autoAlpha: 0,
			duration: 0.08,
			ease: 'none',
			y: -24
		}, 0.20)
		.fromTo(capabilitiesPanel, {
			autoAlpha: 0,
			y: 28
		}, {
			autoAlpha: 1,
			duration: 0.08,
			ease: 'none',
			y: 0
		}, 0.26)
		.to(capabilitiesPanel, {
			autoAlpha: 0,
			duration: 0.09,
			ease: 'none',
			y: -24
		}, 0.54)
		.fromTo(disciplinesPanel, {
			autoAlpha: 0,
			y: 28
		}, {
			autoAlpha: 1,
			duration: 0.08,
			ease: 'none',
			y: 0
		}, 0.60)
		.to(disciplinesPanel, {
			autoAlpha: 0,
			duration: 0.10,
			ease: 'none',
			y: -20
		}, 0.90);

	function handleResize() {
		window.cancelAnimationFrame(resizeFrameRequest);
		resizeFrameRequest = window.requestAnimationFrame(() => {
			resizeCanvas();
			ScrollTrigger.refresh();
		});
	}

	window.addEventListener('resize', handleResize, { passive: true });
	window.addEventListener('orientationchange', handleResize, { passive: true });
	return true;
}
